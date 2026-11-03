import { sql } from 'kysely';
import { primaryPairAllowed, type PrimaryChain } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

export async function primaryChain(tx:Executor,workspaceId:string):Promise<PrimaryChain|null> {
  const rows=(await sql<{role:keyof PrimaryChain;object_type_id:string}>`SELECT role,object_type_id FROM sys_primary_chain_levels WHERE workspace_id=${workspaceId}::uuid AND EXISTS(SELECT 1 FROM sys_workspace_modules m WHERE m.workspace_id=${workspaceId}::uuid AND m.module_key='projects' AND m.enabled)`.execute(tx)).rows;
  return rows.length===3?Object.fromEntries(rows.map(row=>[row.role,row.object_type_id])) as PrimaryChain:null;
}
export async function validatePrimaryChain(tx:Executor,workspaceId:string,chain:PrimaryChain) {
  const bad=(await sql`SELECT 1 FROM sys_relationships e JOIN sys_relationship_types t ON t.id=e.relationship_type_id WHERE e.workspace_id=${workspaceId}::uuid AND t.kind='primary' AND NOT (
    (e.left_object_type_id=${chain.contact}::uuid AND e.right_object_type_id<>${chain.contact}::uuid)
    OR (e.left_object_type_id=${chain.project}::uuid AND e.right_object_type_id NOT IN (${chain.contact}::uuid,${chain.project}::uuid))
    OR (e.left_object_type_id=${chain.case}::uuid AND e.right_object_type_id NOT IN (${chain.contact}::uuid,${chain.project}::uuid,${chain.case}::uuid))
  ) LIMIT 1`.execute(tx)).rows;
  if(bad.length)throw new AppError(409,'Existing Primary associations violate the configured levels');
}
export {primaryPairAllowed};
