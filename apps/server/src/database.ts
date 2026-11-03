import { hardenStorage } from './storage-integrity.js';
import { migratePrototypeBaseline } from './migrations/0001-prototype-baseline.js';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, types } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { v7 } from 'uuid';
import { authOptions } from './auth.js';

// Dynamic definitions are validated at runtime, not represented as compile-time tables.
export type Database = Kysely<Record<string, never>>;
export type Executor = Database | Transaction<Record<string, never>>;

export function connect(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, types: { getTypeParser: (oid: number, format?: 'text' | 'binary') => oid === 1082 && format !== 'binary' ? (value: string) => value : types.getTypeParser(oid, format) } });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
  return { pool, db };
}

/** Explicit development migration command; never run implicitly on HTTP startup. */
export async function migrate(connectionString: string, secret: string, baseURL: string) {
  const { db, pool } = connect(connectionString);
  const lock = await pool.connect().catch(async (error: unknown) => { await db.destroy(); throw error; });
  try {
    await lock.query("SELECT pg_advisory_lock(hashtext('xobject:migrations'))");
    await sql`CREATE TABLE IF NOT EXISTS sys_schema_migrations(version integer PRIMARY KEY CHECK(version>0),name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`.execute(db);
    const applied=(await sql<{version:number}>`SELECT version FROM sys_schema_migrations ORDER BY version`.execute(db)).rows.map(row=>row.version);
    if (applied.some(version=>version>4)) throw new Error('Database schema is newer than this application');
    if (!applied.includes(1)) {
      const authMigration = await getMigrations(authOptions(pool, secret, baseURL));
      await authMigration.runMigrations();
      await db.transaction().execute(async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
        await migratePrototypeBaseline(tx);
        await sql`INSERT INTO sys_schema_migrations(version,name) VALUES(1,'prototype_baseline')`.execute(tx);
      });
    }
    if (!applied.includes(2)) await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      await hardenStorage(tx);
      await sql`INSERT INTO sys_schema_migrations(version,name) VALUES(2,'definition_versions_integrity_and_indexes')`.execute(tx);
    });
    if (!applied.includes(3)) await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      await sql`ALTER TABLE sys_fields ADD COLUMN IF NOT EXISTS applicability jsonb`.execute(tx);
      await sql`INSERT INTO sys_schema_migrations(version,name) VALUES(3,'field_applicability')`.execute(tx);
    });
    if (!applied.includes(4)) await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      await sql`CREATE TABLE sys_primary_chain_levels(workspace_id uuid NOT NULL REFERENCES sys_workspaces(id),role text NOT NULL CHECK(role IN('contact','project','case')),object_type_id uuid NOT NULL,PRIMARY KEY(workspace_id,role),UNIQUE(workspace_id,object_type_id),FOREIGN KEY(object_type_id,workspace_id) REFERENCES sys_object_types(id,workspace_id) ON DELETE RESTRICT)`.execute(tx);
      await sql`ALTER TABLE sys_relationship_types ADD COLUMN left_applicability jsonb,ADD COLUMN right_applicability jsonb`.execute(tx);
      await sql`INSERT INTO sys_schema_migrations(version,name) VALUES(4,'primary_chain_and_relationship_conditions')`.execute(tx);
    });
  } finally {
    try { await lock.query("SELECT pg_advisory_unlock(hashtext('xobject:migrations'))"); }
    finally { lock.release(); await db.destroy(); }
  }
}


export async function addClassificationFields(tx: Executor, objectTypeId: string, table: string, names = ['type', 'status', 'category']) {
  const fields = [
    { name: 'type', labels: { de: 'Typ', en: 'Type' }, storage: sql`uuid` },
    { name: 'status', labels: { de: 'Status', en: 'Status' }, storage: sql`uuid` },
    { name: 'category', labels: { de: 'Kategorie', en: 'Category' }, storage: sql`uuid[] NOT NULL DEFAULT '{}'::uuid[]` },
  ];
  for (const field of fields.filter(field => names.includes(field.name))) {
    await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN IF NOT EXISTS ${sql.ref(field.name)} ${field.storage}`.execute(tx);
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind)
      VALUES (${v7()}::uuid, ${objectTypeId}::uuid, ${field.name}, ${JSON.stringify(field.labels)}::jsonb, ${field.name}) ON CONFLICT (object_type_id, technical_name) WHERE state <> 'deleted' DO UPDATE SET labels = EXCLUDED.labels, kind = EXCLUDED.kind`.execute(tx);
  }
}
