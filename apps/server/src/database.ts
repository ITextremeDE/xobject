import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from './auth.js';

// Dynamic definitions are validated at runtime, not represented as compile-time tables.
export type Database = Kysely<Record<string, never>>;
export type Executor = Database | Transaction<Record<string, never>>;

export function connect(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
  return { pool, db };
}

/** Explicit development migration command; never run implicitly on HTTP startup. */
export async function migrate(connectionString: string, secret: string, baseURL: string) {
  const { db, pool } = connect(connectionString);
  const lock = await pool.connect().catch(async (error: unknown) => { await db.destroy(); throw error; });
  try {
    await lock.query("SELECT pg_advisory_lock(hashtext('xobject:migrations'))");
    const authMigration = await getMigrations(authOptions(pool, secret, baseURL));
    await authMigration.runMigrations();
    await db.transaction().execute(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_administrators (
        user_id text PRIMARY KEY REFERENCES sys_users(id)
      )`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_workspaces (
        id uuid PRIMARY KEY, code text NOT NULL UNIQUE,
        name text NOT NULL, created_by text NOT NULL REFERENCES sys_users(id),
        default_language text NOT NULL DEFAULT 'en' CHECK (default_language IN ('de', 'en'))
      )`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_object_types (
        id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES sys_workspaces(id),
        technical_name text NOT NULL, labels jsonb NOT NULL,
        UNIQUE (workspace_id, technical_name)
      )`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_fields (
        id uuid PRIMARY KEY, object_type_id uuid NOT NULL REFERENCES sys_object_types(id),
        technical_name text NOT NULL, labels jsonb NOT NULL, kind text NOT NULL CHECK (kind = 'text'),
        UNIQUE (object_type_id, technical_name)
      )`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_journal (
        id uuid PRIMARY KEY, change_id uuid NOT NULL,
        workspace_id uuid REFERENCES sys_workspaces(id),
        object_type_id uuid REFERENCES sys_object_types(id),
        entity_kind text NOT NULL, entity_id uuid NOT NULL,
        field_id uuid REFERENCES sys_fields(id), field_key text NOT NULL,
        old_value jsonb, new_value jsonb,
        actor_id text NOT NULL REFERENCES sys_users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`.execute(tx);
      await sql`CREATE INDEX IF NOT EXISTS sys_journal_entity_idx
        ON sys_journal (workspace_id, entity_id, created_at, id)`.execute(tx);
      // Upgrade the earlier local spike without guessing the language of existing labels.
      for (const name of ['sys_object_types', 'sys_fields']) {
        const oldColumn = await sql`SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = ${name} AND column_name = 'label'`.execute(tx);
        if (oldColumn.rows.length) {
          await sql`ALTER TABLE ${sql.table(name)} RENAME COLUMN label TO labels`.execute(tx);
          await sql`ALTER TABLE ${sql.table(name)} ALTER COLUMN labels TYPE jsonb
            USING jsonb_build_object('und', labels)`.execute(tx);
        }
      }
      await sql`UPDATE sys_fields SET labels = '{"de":"Stichwort","en":"Keyword"}'::jsonb
        WHERE technical_name = 'keyword' AND labels = '{"und":"Keyword"}'::jsonb`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'en'`.execute(tx);
      await sql`ALTER TABLE sys_journal ALTER COLUMN workspace_id DROP NOT NULL`.execute(tx);
      const languageCheck = await sql`SELECT 1 FROM pg_constraint
        WHERE conrelid = 'sys_users'::regclass AND conname = 'sys_users_language_check'`.execute(tx);
      if (!languageCheck.rows.length) {
        await sql`ALTER TABLE sys_users ADD CONSTRAINT sys_users_language_check
          CHECK (language IS NULL OR language IN ('de', 'en'))`.execute(tx);
      }
      const workspaceLanguageCheck = await sql`SELECT 1 FROM pg_constraint
        WHERE conrelid = 'sys_workspaces'::regclass AND conname = 'sys_workspaces_default_language_check'`.execute(tx);
      if (!workspaceLanguageCheck.rows.length) {
        await sql`ALTER TABLE sys_workspaces ADD CONSTRAINT sys_workspaces_default_language_check
          CHECK (default_language IN ('de', 'en'))`.execute(tx);
      }
    });
  } finally {
    try { await lock.query("SELECT pg_advisory_unlock(hashtext('xobject:migrations'))"); }
    finally { lock.release(); await db.destroy(); }
  }
}
