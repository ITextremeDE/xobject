import { sql } from 'kysely';
import type { Executor } from './database.js';
import type { Operation } from '@xobject/contracts';

const schemaWrites = new Set<Operation>(['configure_record_security','configure_foreign_access','configure_group_inheritance','configure_object_settings','configure_content_permissions','configure_workspace_module','create_object_type','create_field','add_standard_field','configure_field','set_definition_state']);
const globalWrites = new Set<Operation>(['create_workspace','create_user','configure_user','set_workspace_member','set_user_profile','configure_user_localization','change_password','revoke_session','revoke_other_sessions']);
export function isReadOperation(operation: Operation) { return /^(get_|list_|search_)/.test(operation); }
/** Global schema barrier first, then the workspace barrier. Readers share both locks. */
export async function lockOperation(tx: Executor, operation: Operation, args: Record<string, unknown>) {
  if (schemaWrites.has(operation) || globalWrites.has(operation)) {
    await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
    return;
  }
  await sql`SELECT pg_advisory_xact_lock_shared(hashtext('xobject:model'))`.execute(tx);
  let workspace = args.workspaceId as string | undefined;
  if (!workspace && args.objectTypeId) workspace = (await sql<{workspace_id:string}>`SELECT workspace_id FROM sys_object_types WHERE id=${args.objectTypeId}::uuid`.execute(tx)).rows[0]?.workspace_id;
  if (!workspace && (args.fieldId || args.kind === 'field')) workspace = (await sql<{workspace_id:string}>`SELECT COALESCE(o.workspace_id,r.workspace_id) AS workspace_id FROM sys_fields f LEFT JOIN sys_object_types o ON o.id=f.object_type_id LEFT JOIN sys_relationship_types r ON r.id=f.relationship_type_id WHERE f.id=${args.fieldId ?? args.id}::uuid`.execute(tx)).rows[0]?.workspace_id;
  if (!workspace && args.kind === 'object_type') workspace = (await sql<{workspace_id:string}>`SELECT workspace_id FROM sys_object_types WHERE id=${args.id}::uuid`.execute(tx)).rows[0]?.workspace_id;
  if (workspace) {
    const key = `xobject:workspace:${workspace.toLowerCase()}`;
    if (isReadOperation(operation)) await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key},0))`.execute(tx);
    else await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`.execute(tx);
  }
}
