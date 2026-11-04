import { sql } from 'kysely';
import type { Executor } from './database.js';

export async function installObjectIntegrity(tx: Executor, model: { id:string; workspace_id:string; table_name:string }) {
  // Deferrable checks allow the row and its registry entry to be created in either order.
  await sql`CREATE CONSTRAINT TRIGGER xobject_record_identity AFTER INSERT OR DELETE ON ${sql.table(model.table_name)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sys_check_business_identity(${sql.lit(model.workspace_id)},${sql.lit(model.id)})`.execute(tx);
  await sql`CREATE CONSTRAINT TRIGGER xobject_record_identity_update AFTER UPDATE ON ${sql.table(model.table_name)} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.id IS DISTINCT FROM NEW.id) EXECUTE FUNCTION sys_check_business_identity(${sql.lit(model.workspace_id)},${sql.lit(model.id)})`.execute(tx);
  await sql`CREATE INDEX ${sql.id(`${model.table_name.slice(0,22)}_${model.id.replaceAll('-','')}_upd_idx`)} ON ${sql.table(model.table_name)}(updated_at DESC,id DESC)`.execute(tx);
}
