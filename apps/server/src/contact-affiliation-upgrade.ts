import {sql} from 'kysely';
import {v7} from 'uuid';
import type {Executor} from './database.js';
import {configureRelationship,relationshipTypes} from './relationship-types.js';

/** Operator-only catalog upgrade; called under the installation/model lock with writers stopped. */
export async function upgradeContactAffiliations(tx:Executor,actor:string){
 const bindings=(await sql<{workspace_id:string;relationship_type_id:string;field_id:string;option_keys:Record<string,string>}>`
  SELECT r.workspace_id,r.relationship_type_id,f.field_id,f.option_keys
  FROM sys_module_relationship_bindings r JOIN sys_module_field_bindings f
   ON f.workspace_id=r.workspace_id AND f.object_key='contact' AND f.field_key='contact_kind'
  WHERE r.module_key='contacts' AND r.relationship_key='contact_affiliation'
 `.execute(tx)).rows;
 for(const binding of bindings){
  const previous=(await relationshipTypes(tx,binding.workspace_id)).find(r=>r.id===binding.relationship_type_id);
  const {individual,person}=binding.option_keys,rule=previous?.rightApplicability;
  if(!previous||!individual||!person||rule?.fieldId!==binding.field_id||!rule.optionIds.includes(individual)||rule.optionIds.some(id=>id!==individual&&id!==person))throw new Error('Conflicting supplied Contact affiliation definition');
  if(rule.optionIds.includes(person))continue;
  const {labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,active,pairs,leftApplicability}=previous;
  await configureRelationship(tx,{workspaceId:binding.workspace_id,relationshipTypeId:previous.id,version:previous.version,configuration:{labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,active,pairs,leftApplicability,rightApplicability:{fieldId:binding.field_id,optionIds:[individual,person]}}},
   async(kind,id,change,key,before,after)=>{await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id,access_channel) VALUES(${v7()}::uuid,${change}::uuid,${binding.workspace_id}::uuid,${kind},${id}::uuid,${key},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${actor},'internal')`.execute(tx);},'module');
 }
}
