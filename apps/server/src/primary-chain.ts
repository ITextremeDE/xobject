import {isDeepStrictEqual} from 'node:util';
import { sql } from 'kysely';
import { primaryPairAllowed,primaryRolesForObject,primaryRequirementsSatisfied,primaryRequirementsSchema,type PrimaryRequirements,type PrimaryChain,type PrimaryChainRole } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

export async function primaryChain(tx:Executor,workspaceId:string):Promise<PrimaryChain|null> {
  const rows=(await sql<{role:keyof PrimaryChain;object_type_id:string}>`SELECT object_key AS role,object_type_id FROM sys_module_object_bindings WHERE object_key IN('contact','project','case') AND workspace_id=${workspaceId}::uuid AND EXISTS(SELECT 1 FROM sys_workspace_modules m WHERE m.workspace_id=${workspaceId}::uuid AND m.module_key='projects' AND m.enabled)`.execute(tx)).rows;
  return rows.length===3?Object.fromEntries(rows.map(row=>[row.role,row.object_type_id])) as PrimaryChain:null;
}
export async function validatePrimaryChain(tx:Executor,workspaceId:string,chain:PrimaryChain) {
  const bad=(await sql`SELECT 1 FROM sys_relationships e JOIN sys_relationship_types t ON t.id=e.relationship_type_id WHERE e.workspace_id=${workspaceId}::uuid AND t.kind='primary' AND NOT (
    (e.left_object_type_id=${chain.contact}::uuid AND e.right_object_type_id<>${chain.contact}::uuid)
    OR (e.left_object_type_id=${chain.project}::uuid AND e.right_object_type_id NOT IN (${chain.contact}::uuid,${chain.project}::uuid))
    OR (e.left_object_type_id=${chain.case}::uuid AND e.right_object_type_id NOT IN (${chain.contact}::uuid,${chain.project}::uuid,${chain.case}::uuid))
  ) LIMIT 1`.execute(tx)).rows;
  if(bad.length)throw new AppError(409,'Existing Primary associations violate the configured levels',{code:"primaryChainInvalidExisting"});
}
export {primaryPairAllowed};

/** Structural validation uses retained UUID paths, independently of the actor's read projection.
 * Recycle retains edges; requiredness never grants access or deletes descendants. */
export async function validatePrimaryRequirements(tx:Executor,workspaceId:string) {
 const rules=(await sql<{id:string;primary_requirements:PrimaryRequirements}>`SELECT id,primary_requirements FROM sys_object_types WHERE workspace_id=${workspaceId}::uuid AND state<>'deleted' AND (primary_requirements->>'associationRequired'='true' OR jsonb_array_length(primary_requirements->'requiredLevels')>0)`.execute(tx)).rows;
 if(!rules.length)return;
 const chain=await primaryChain(tx,workspaceId);if(!chain)throw new AppError(409,'Enable the Projects module first',{code:"projectsModuleDisabled"});
 const edges=(await sql<{parent:string;child:string;parent_type:string;child_type:string}>`SELECT e.left_record_id AS parent,e.right_record_id AS child,e.left_object_type_id AS parent_type,e.right_object_type_id AS child_type FROM sys_relationships e JOIN sys_relationship_types t ON t.id=e.relationship_type_id WHERE e.workspace_id=${workspaceId}::uuid AND t.kind='primary'`.execute(tx)).rows;
 const parents=new Map(edges.map(edge=>[`${edge.child_type}:${edge.child}`,edge]));
 for(const rule of rules){
  const records=(await sql<{record_id:string}>`SELECT record_id FROM sys_record_identities WHERE object_type_id=${rule.id}::uuid AND deleted_at IS NULL`.execute(tx)).rows;
  for(const record of records){
   const present:PrimaryChainRole[]=[],seen=new Set<string>();let id=`${rule.id}:${record.record_id}`;
   while(parents.has(id)&&!seen.has(id)){seen.add(id);const edge=parents.get(id)!;const role=(Object.keys(chain) as PrimaryChainRole[]).find(role=>chain[role]===edge.parent_type);if(role)present.push(role);id=`${edge.parent_type}:${edge.parent}`;}
   if(!primaryRequirementsSatisfied(rule.primary_requirements,present))throw new AppError(409,'Primary requirements are not satisfied',{code:'primary_required'});
  }
 }
}
export async function configurePrimaryRequirements(tx:Executor,type:{id:string;workspace_id:string;primary_requirements:PrimaryRequirements},input:PrimaryRequirements,journal:(key:string,before:unknown,after:unknown)=>Promise<unknown>) {
 const value=primaryRequirementsSchema.parse(input),chain=await primaryChain(tx,type.workspace_id);
 if(value.associationRequired||value.requiredLevels.length){
  if(!chain)throw new AppError(409,'Enable the Projects module first',{code:"projectsModuleDisabled"});
  const allowed=primaryRolesForObject(chain,type.id);
  if(!allowed.length||value.requiredLevels.some(role=>!allowed.includes(role)))throw new AppError(400,'Primary requirements contain an unavailable level',{code:"primaryRequirementsUnavailable"});
 }
 if(isDeepStrictEqual(type.primary_requirements,value))return;
 await sql`UPDATE sys_object_types SET primary_requirements=${JSON.stringify(value)}::jsonb WHERE id=${type.id}::uuid`.execute(tx);
 await validatePrimaryRequirements(tx,type.workspace_id);
 if(type.primary_requirements.associationRequired!==value.associationRequired)await journal('primaryRequirements.associationRequired',type.primary_requirements.associationRequired,value.associationRequired);
 if(JSON.stringify(type.primary_requirements.requiredLevels)!==JSON.stringify(value.requiredLevels))await journal('primaryRequirements.requiredLevels',type.primary_requirements.requiredLevels,value.requiredLevels);
}
