import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, types } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { defaultWorkspaceAppearance, emptyClassification, defaultRegionalSettings } from '@xobject/contracts';
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
    const authMigration = await getMigrations(authOptions(pool, secret, baseURL));
    await authMigration.runMigrations();
    await db.transaction().execute(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS regional_preferences jsonb`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS management_version integer NOT NULL DEFAULT 1`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS time_zone text`.execute(tx);
      await sql`ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`.execute(tx);
      await sql`UPDATE sys_users SET is_admin = false WHERE is_admin IS NULL`.execute(tx);
      await sql`ALTER TABLE sys_users ALTER COLUMN is_admin SET DEFAULT false, ALTER COLUMN is_admin SET NOT NULL`.execute(tx);
      const legacyAdmins = await sql<{ name: string | null }>`SELECT to_regclass('sys_administrators')::text AS name`.execute(tx);
      if (legacyAdmins.rows[0].name) {
        await sql`UPDATE sys_users SET is_admin = true WHERE id IN (SELECT user_id FROM sys_administrators)`.execute(tx);
        await sql`DROP TABLE sys_administrators`.execute(tx);
      }
      await sql`CREATE TABLE IF NOT EXISTS sys_workspaces (
        id uuid PRIMARY KEY, code text NOT NULL UNIQUE,
        name text NOT NULL, created_by text NOT NULL REFERENCES sys_users(id),
        default_language text NOT NULL DEFAULT 'en' CHECK (default_language IN ('de', 'en'))
      )`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS appearance jsonb NOT NULL DEFAULT ${sql.lit(JSON.stringify(defaultWorkspaceAppearance))}::jsonb`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS appearance_version integer NOT NULL DEFAULT 1 CHECK (appearance_version > 0)`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ALTER COLUMN appearance SET DEFAULT ${sql.lit(JSON.stringify(defaultWorkspaceAppearance))}::jsonb`.execute(tx);
      // Older workspace designs inherit their previous base palette and body font.
      await sql`UPDATE sys_workspaces SET appearance = jsonb_build_object('theme', COALESCE(appearance->>'baseColor', 'neutral'), 'chartColor', COALESCE(appearance->>'baseColor', 'neutral'), 'fontHeading', 'inherit', 'menuColor', 'default', 'menuAccent', 'subtle') || appearance WHERE NOT (appearance ?& ARRAY['theme', 'chartColor', 'fontHeading', 'menuColor', 'menuAccent'])`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS available_languages text[] NOT NULL DEFAULT ARRAY['de', 'en'] CHECK (cardinality(available_languages) > 0 AND available_languages <@ ARRAY['de', 'en']::text[] AND default_language = ANY(available_languages))`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS label_languages text[] NOT NULL DEFAULT ARRAY['de', 'en'] CHECK (cardinality(label_languages) > 0 AND label_languages <@ ARRAY['de', 'en']::text[])`.execute(tx);
      const regionalColumn = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sys_workspaces' AND column_name = 'regional'`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS regional jsonb NOT NULL DEFAULT ${sql.lit(JSON.stringify(defaultRegionalSettings))}::jsonb`.execute(tx);
      if (!regionalColumn.rows.length) await sql`UPDATE sys_workspaces SET regional = jsonb_set(regional, '{locale}', to_jsonb(CASE WHEN default_language = 'de' THEN 'de-DE' ELSE 'en-US' END))`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS created_at timestamptz`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ALTER COLUMN created_at SET DEFAULT now()`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'UTC'`.execute(tx);
      await sql`ALTER TABLE sys_workspaces ADD COLUMN IF NOT EXISTS language_version integer NOT NULL DEFAULT 1 CHECK (language_version > 0)`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_workspace_members (
        workspace_id uuid NOT NULL REFERENCES sys_workspaces(id),
        user_id text NOT NULL REFERENCES sys_users(id), role text NOT NULL CHECK (role IN ('user', 'designer')),
        PRIMARY KEY (workspace_id, user_id)
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
      await sql`UPDATE sys_workspaces w SET created_at = (SELECT min(j.created_at) FROM sys_journal j WHERE j.entity_id = w.id AND j.entity_kind = 'workspace' AND j.field_key = 'code' AND j.old_value = 'null'::jsonb) WHERE w.created_at IS NULL`.execute(tx);
      for (const table of ['sys_object_types', 'sys_fields']) {
        await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'inactive', 'deleted'))`.execute(tx);
        await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false`.execute(tx);
      }
      await sql`ALTER TABLE sys_object_types DROP CONSTRAINT IF EXISTS sys_object_types_workspace_id_technical_name_key`.execute(tx);
      await sql`ALTER TABLE sys_fields DROP CONSTRAINT IF EXISTS sys_fields_object_type_id_technical_name_key`.execute(tx);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS sys_object_types_live_name_idx ON sys_object_types (workspace_id, technical_name) WHERE state <> 'deleted'`.execute(tx);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS sys_fields_live_name_idx ON sys_fields (object_type_id, technical_name) WHERE state <> 'deleted'`.execute(tx);
      const requiredColumn = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sys_fields' AND column_name = 'required'`.execute(tx);
      await sql`ALTER TABLE sys_fields ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false`.execute(tx);
      if (!requiredColumn.rows.length) await sql`UPDATE sys_fields SET required = true WHERE technical_name = 'keyword'`.execute(tx);
      const legacyClassification = !(await sql`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sys_object_types' AND column_name = 'classification'`.execute(tx)).rows.length;
      await sql`ALTER TABLE sys_object_types ADD COLUMN IF NOT EXISTS classification jsonb NOT NULL DEFAULT ${sql.lit(JSON.stringify(emptyClassification()))}::jsonb`.execute(tx);
      await sql`ALTER TABLE sys_fields ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_groups (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES sys_workspaces(id), name text NOT NULL, UNIQUE(workspace_id, name))`.execute(tx);
      await sql`ALTER TABLE sys_groups ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`.execute(tx);
      await sql`ALTER TABLE sys_groups ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0)`.execute(tx);
      await sql`CREATE TABLE IF NOT EXISTS sys_group_members (group_id uuid NOT NULL REFERENCES sys_groups(id), user_id text NOT NULL REFERENCES sys_users(id), PRIMARY KEY(group_id, user_id))`.execute(tx);
      await sql`ALTER TABLE sys_fields DROP CONSTRAINT IF EXISTS sys_fields_kind_check`.execute(tx);
      await sql`ALTER TABLE sys_fields ADD CONSTRAINT sys_fields_kind_check CHECK (kind IN ('text', 'multiline', 'integer', 'decimal', 'money', 'boolean', 'date', 'datetime', 'single_choice', 'multiple_choice', 'email', 'phone', 'url', 'reference', 'type', 'status', 'category'))`.execute(tx);
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
        WHERE state <> 'deleted' AND technical_name = 'keyword' AND labels = '{"und":"Keyword"}'::jsonb`.execute(tx);
      const objectTables = (await sql<{ id: string; table_name: string }>`SELECT o.id, w.code || '_' || o.technical_name AS table_name FROM sys_object_types o JOIN sys_workspaces w ON w.id = o.workspace_id`.execute(tx)).rows;
      if (legacyClassification) for (const type of objectTables) await addClassificationFields(tx, type.id, type.table_name);
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
