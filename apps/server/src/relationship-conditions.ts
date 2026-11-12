import {sql} from 'kysely';
import type {FieldApplicability,RecordReference,RelationshipType} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
export async function conditionColumn(tx:Executor,rule:FieldApplicability|undefined,objectTypeId:string) {
  if(!rule)return null;
  const field=(await sql<{technical_name:string;kind:string;config:{options?:{id:string}[]};applicability:unknown}>`SELECT technical_name,kind,config,applicability FROM sys_fields WHERE id=${rule.fieldId}::uuid AND object_type_id=${objectTypeId}::uuid AND state='active'`.execute(tx)).rows[0];
  if(!field||field.kind!=='single_choice'||field.applicability||rule.optionIds.some(id=>!field.config.options?.some(option=>option.id===id)))throw new AppError(400,'Relationship condition needs an active unconditional choice field and valid options',{code:"relationshipConditionConfigurationInvalid"});
  return field.technical_name;
}
export async function endpointMatches(tx:Executor,type:RelationshipType,side:'left'|'right',ref:RecordReference) {
  const rule=side==='left'?type.leftApplicability:type.rightApplicability;
  if(!rule)return true;
  const column=await conditionColumn(tx,rule,ref.objectTypeId);
  const row=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${ref.objectTypeId}::uuid AND o.workspace_id=${type.workspaceId}::uuid`.execute(tx)).rows[0];
  if(!row)return false;
  const value=(await sql<{value:string}>`SELECT ${sql.ref(column!)}::text AS value FROM ${sql.table(row.name)} WHERE id=${ref.recordId}::uuid`.execute(tx)).rows[0]?.value;
  return rule.optionIds.includes(value??'');
}
export async function validateEndpointPair(tx:Executor,type:RelationshipType,left:RecordReference,right:RecordReference) {
  if(!await endpointMatches(tx,type,'left',left)||!await endpointMatches(tx,type,'right',right))throw new AppError(409,'Relationship endpoint conditions are not satisfied',{code:"relationshipConditionInvalid"});
}
export async function validateConditionalRecord(tx:Executor,objectTypeId:string,recordId:string,definitions:RelationshipType[]) {
  for(const type of definitions.filter(type=>type.rulesState==='active'&&(type.leftApplicability||type.rightApplicability))){
    const edges=(await sql<{a:string;b:string;c:string;d:string}>`SELECT left_object_type_id AS a,left_record_id AS b,right_object_type_id AS c,right_record_id AS d FROM sys_relationships WHERE relationship_type_id=${type.id}::uuid AND ((left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid))`.execute(tx)).rows;
    for(const edge of edges)await validateEndpointPair(tx,type,{objectTypeId:edge.a,recordId:edge.b},{objectTypeId:edge.c,recordId:edge.d});
  }
}
