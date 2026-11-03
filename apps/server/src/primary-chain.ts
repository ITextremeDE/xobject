import { sql } from 'kysely';
import { v7 } from 'uuid';
import { isDeepStrictEqual } from 'node:util';
import { primaryChainRoles, primaryPairAllowed, type PrimaryChain } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

export async function primaryChain(tx:Executor,workspaceId:string):Promise<PrimaryChain|null> {
  const rows=(await sql<{role:keyof PrimaryChain;object_type_id:string}>`SELECT role,object_type_id FROM sys_primary_chain_levels WHERE workspace_id=${workspaceId}::uuid`.execute(tx)).rows;
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
export async function configurePrimaryChain(tx:Executor,args:{workspaceId:string;version:number;levels:PrimaryChain},journal:(kind:string,id:string,change:string,key:string,before:unknown,after:unknown)=>Promise<void>) {
  const row=(await sql<{version:number}>`SELECT version FROM sys_workspace_modules WHERE workspace_id=${args.workspaceId}::uuid AND module_key='projects'`.execute(tx)).rows[0];
  if(!row)throw new AppError(404,'Module not found');
  if(row.version!==args.version)throw new AppError(409,'Module version conflict');
  const levels=Object.fromEntries(primaryChainRoles.map(role=>[role,args.levels[role].toLowerCase()])) as PrimaryChain;
  for(const id of Object.values(levels))if(!(await sql`SELECT 1 FROM sys_object_types WHERE id=${id}::uuid AND workspace_id=${args.workspaceId}::uuid AND state='active'`.execute(tx)).rows.length)throw new AppError(400,'Primary level must be an active object in this workspace');
  const previous=await primaryChain(tx,args.workspaceId);
  if(isDeepStrictEqual(previous,levels))return {version:row.version,levels};
  await validatePrimaryChain(tx,args.workspaceId,levels);
  await sql`DELETE FROM sys_primary_chain_levels WHERE workspace_id=${args.workspaceId}::uuid`.execute(tx);
  for(const role of primaryChainRoles)await sql`INSERT INTO sys_primary_chain_levels VALUES(${args.workspaceId}::uuid,${role},${levels[role]}::uuid)`.execute(tx);
  await sql`UPDATE sys_workspace_modules SET version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND module_key='projects'`.execute(tx);
  await sql`UPDATE sys_relationship_types SET version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND kind='primary'`.execute(tx);
  const change=v7();for(const role of primaryChainRoles)if(previous?.[role]!==levels[role])await journal('workspace',args.workspaceId,change,`primary_chain.${role}`,previous?.[role]??null,levels[role]);
  return {version:row.version+1,levels};
}
export {primaryPairAllowed};
