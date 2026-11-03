import { sql } from 'kysely';
import type { Executor } from './database.js';

export async function installObjectIntegrity(tx: Executor, model: { id:string; workspace_id:string; table_name:string }) {
  // Deferrable checks allow the row and its registry entry to be created in either order.
  await sql`DROP TRIGGER IF EXISTS xobject_record_identity ON ${sql.table(model.table_name)}`.execute(tx);
  await sql`CREATE CONSTRAINT TRIGGER xobject_record_identity AFTER INSERT OR DELETE ON ${sql.table(model.table_name)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sys_check_business_identity(${sql.lit(model.workspace_id)},${sql.lit(model.id)})`.execute(tx);
  await sql`DROP TRIGGER IF EXISTS xobject_record_identity_update ON ${sql.table(model.table_name)}`.execute(tx);
  await sql`CREATE CONSTRAINT TRIGGER xobject_record_identity_update AFTER UPDATE ON ${sql.table(model.table_name)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.id IS DISTINCT FROM NEW.id) EXECUTE FUNCTION sys_check_business_identity(${sql.lit(model.workspace_id)},${sql.lit(model.id)})`.execute(tx);
  await sql`CREATE INDEX IF NOT EXISTS ${sql.id(`${model.table_name.slice(0,22)}_${model.id.replaceAll('-','')}_upd_idx`)} ON ${sql.table(model.table_name)}(updated_at DESC,id DESC)`.execute(tx);
}

export async function hardenStorage(tx: Executor) {
  for (const name of ['sys_fields','sys_object_types']) await sql`ALTER TABLE ${sql.table(name)} ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK(version>0)`.execute(tx);
  await sql.raw(`CREATE OR REPLACE FUNCTION sys_assert_record_identity(ws uuid,obj uuid,rec uuid) RETURNS void LANGUAGE plpgsql AS $body$
  DECLARE physical_name text; registered boolean; present boolean;
  BEGIN
    SELECT w.code || '_' || o.technical_name INTO physical_name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=obj AND o.workspace_id=ws AND o.state<>'deleted';
    PERFORM 1 FROM sys_record_identities WHERE workspace_id=ws AND object_type_id=obj AND record_id=rec FOR KEY SHARE;
    registered := FOUND;
    present := false;
    IF physical_name IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM (SELECT id FROM %I WHERE id=$1 FOR KEY SHARE) r)',physical_name) INTO present USING rec;
    END IF;
    IF registered <> present THEN RAISE EXCEPTION 'Record identity and business row must exist together' USING ERRCODE='23503'; END IF;
  END $body$;
  CREATE OR REPLACE FUNCTION sys_check_business_identity() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
    IF TG_OP='UPDATE' AND OLD.id=NEW.id THEN RETURN NULL; END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM sys_assert_record_identity(TG_ARGV[0]::uuid,TG_ARGV[1]::uuid,OLD.id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sys_assert_record_identity(TG_ARGV[0]::uuid,TG_ARGV[1]::uuid,NEW.id); END IF;
    RETURN NULL;
  END $body$;
  CREATE OR REPLACE FUNCTION sys_check_registry_identity() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
    IF TG_OP <> 'INSERT' THEN PERFORM sys_assert_record_identity(OLD.workspace_id,OLD.object_type_id,OLD.record_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sys_assert_record_identity(NEW.workspace_id,NEW.object_type_id,NEW.record_id); END IF;
    RETURN NULL;
  END $body$;`).execute(tx);
  await sql`DROP TRIGGER IF EXISTS xobject_registry_identity ON sys_record_identities`.execute(tx);
  await sql`CREATE CONSTRAINT TRIGGER xobject_registry_identity AFTER INSERT OR UPDATE OR DELETE ON sys_record_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sys_check_registry_identity()`.execute(tx);
  const models=(await sql<{id:string;workspace_id:string;table_name:string}>`SELECT o.id,o.workspace_id,w.code||'_'||o.technical_name AS table_name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.state<>'deleted'`.execute(tx)).rows;
  if ((await sql`SELECT 1 FROM sys_record_identities i JOIN sys_object_types o ON o.id=i.object_type_id WHERE o.state='deleted' LIMIT 1`.execute(tx)).rows.length) throw new Error('Deleted object retains registered rows; migration stopped');
  for (const model of models) {
    const mismatch=(await sql`SELECT 1 FROM ${sql.table(model.table_name)} r FULL JOIN (SELECT record_id FROM sys_record_identities WHERE workspace_id=${model.workspace_id}::uuid AND object_type_id=${model.id}::uuid) i ON i.record_id=r.id WHERE r.id IS NULL OR i.record_id IS NULL LIMIT 1`.execute(tx)).rows.length;
    if (mismatch) throw new Error('Record registry mismatch; migration stopped without repairing or discarding data');
    await installObjectIntegrity(tx,model);
  }
  await sql`CREATE INDEX IF NOT EXISTS sys_journal_recent_idx ON sys_journal(created_at DESC,id DESC)`.execute(tx);
  await sql`CREATE INDEX IF NOT EXISTS sys_journal_workspace_recent_idx ON sys_journal(workspace_id,created_at DESC,id DESC)`.execute(tx);
  await sql`CREATE INDEX IF NOT EXISTS sys_journal_definitions_idx ON sys_journal(object_type_id,created_at,id) WHERE entity_kind NOT IN ('record','relationship')`.execute(tx);
  await sql`CREATE INDEX IF NOT EXISTS sys_journal_relationship_type_idx ON sys_journal(workspace_id,(COALESCE(new_value->>'relationshipTypeId',old_value->>'relationshipTypeId'))) WHERE entity_kind='relationship'`.execute(tx);
}
