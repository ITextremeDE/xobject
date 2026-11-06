import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {structuredChanges,emptyFieldInputRules,fieldInputRulesSchema,isCustomFieldKind,hasReservedStandardFieldLabel,isReservedStandardFieldName,type FieldDefinition,type FieldConfig,type FieldInputRules,type FieldValue,type Inputs} from '@xobject/contracts';
import type {Executor} from './database.js';
import {fieldConfig,normalizeFieldValue,convertFieldValue,validateReferences,isEmptyFieldValue,type TypedField} from './field-types.js';
import {normalizeInputRules} from './field-input-rules.js';
import {contentAccess} from './content-permissions.js';
import {AppError} from './errors.js';
export type RelationshipFieldRow=TypedField&{relationship_type_id:string;labels:Record<string,string>;version:number;state:'active'|'inactive'|'deleted';is_protected:boolean;input_rules:FieldInputRules};
export async function incidentFields(tx:Executor,object:string){return (await sql<RelationshipFieldRow>`SELECT f.* FROM sys_fields f WHERE f.relationship_type_id IN (SELECT relationship_type_id FROM sys_relationship_type_pairs WHERE left_object_type_id=${object}::uuid OR right_object_type_id=${object}::uuid)`.execute(tx)).rows;}
export async function relationshipFieldDefinitions(tx:Executor,relationship:string):Promise<FieldDefinition[]>{
 const rows=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE relationship_type_id=${relationship}::uuid ORDER BY id`.execute(tx)).rows;
 const used=new Set((await sql<{id:string}>`SELECT DISTINCT f.id FROM sys_fields f WHERE f.relationship_type_id=${relationship}::uuid AND (EXISTS(SELECT 1 FROM sys_relationships r WHERE r.relationship_type_id=f.relationship_type_id AND r.values ? f.id::text AND r.values->f.id::text<>'null'::jsonb) OR EXISTS(SELECT 1 FROM sys_journal j WHERE j.field_id=f.id AND j.entity_kind='relationship'))`.execute(tx)).rows.map(r=>r.id));
 const meta=(await sql<{default_language:'de'|'en'}>`SELECT w.default_language FROM sys_workspaces w JOIN sys_relationship_types t ON t.workspace_id=w.id WHERE t.id=${relationship}::uuid`.execute(tx)).rows[0];
 return rows.map(f=>({id:f.id,relationshipTypeId:relationship,technicalName:f.technical_name,labels:f.labels,label:f.labels[meta.default_language]??f.labels.en??f.labels.de,kind:f.kind as FieldDefinition['kind'],required:f.required,config:f.config,inputRules:f.input_rules,state:f.state,version:f.version,isProtected:f.is_protected,canDelete:!f.is_protected&&!used.has(f.id),description:f.input_rules.description[meta.default_language]??'',helpText:f.input_rules.helpText[meta.default_language]??''}));
}
export async function relationshipFieldOwner(tx:Executor,id:string){return (await sql<{relationship_type_id:string|null}>`SELECT relationship_type_id FROM sys_fields WHERE id=${id}::uuid`.execute(tx)).rows[0]?.relationship_type_id;}
export async function saveRelationshipField(tx:Executor,input:Inputs['create_field']|Inputs['configure_field'],actor:string){
 const old='fieldId'in input?(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE id=${input.fieldId}::uuid`.execute(tx)).rows[0]:undefined;
 const relationship=old?.relationship_type_id??('relationshipTypeId'in input?input.relationshipTypeId:undefined);
 const owner=(await sql<{workspace_id:string;kind:string}>`SELECT workspace_id,kind FROM sys_relationship_types WHERE id=${relationship}::uuid`.execute(tx)).rows[0];
 if(!owner||owner.kind!=='custom')throw new AppError(400,'Only explicit relationships support fields');
 if(old?.state==='deleted')throw new AppError(404,'Field not found');
 const name=old?.technical_name??('technicalName'in input?input.technicalName:''),kind=input.kind??old?.kind??'text';
 if(isReservedStandardFieldName(name)||hasReservedStandardFieldLabel(input.labels??old?.labels??{}))throw new AppError(400,'Reserved standard field name');
 if(!isCustomFieldKind(kind))throw new AppError(400,'Unsupported relationship field kind');
 if(input.applicability)throw new AppError(400,'Relationship fields do not use object-field applicability');
 const config=fieldConfig(kind,input.config??(old?.kind===kind?old.config:undefined),old?.kind===kind?old.config:undefined);
 const labels=input.labels??old!.labels,id=old?.id??v7(),required=input.required??false;
 if(old?.is_protected&&input.labels&&!isDeepStrictEqual(old.labels,input.labels))throw new AppError(403,'Module field labels are protected');
 if(old?.is_protected&&(kind!==old.kind||!isDeepStrictEqual({...config,options:undefined},{...old.config,options:undefined})))throw new AppError(403,'Module definition is protected');
 if((config.options??[]).length&&(await sql`SELECT 1 FROM sys_fields f CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.config->'options','[]')) o WHERE f.id<>${id}::uuid AND o->>'id'=ANY(${config.options!.map(o=>o.id)}::text[]) LIMIT 1`.execute(tx)).rows.length)throw new AppError(400,'Option identity belongs to another field');
 const rules=await normalizeInputRules(tx,{id,technical_name:name,kind,config,required},fieldInputRulesSchema.parse({...emptyFieldInputRules(),...(input.inputRules??old?.input_rules)}),owner.workspace_id);
 if(rules.unique)throw new AppError(400,'Relationship field uniqueness is not supported');
 const next={technical_name:name,labels,kind,config,required,input_rules:rules},change=v7();
 const existing=(await sql<AttributeEdge&{value:FieldValue}>`SELECT r.*,r.values->${id} AS value FROM sys_relationships r WHERE r.relationship_type_id=${relationship}::uuid`.execute(tx)).rows;
 const touched=new Map<string,{objectTypeId:string;recordId:string}>();
 for(const row of existing){
  const value=old?convertFieldValue(old,{id,...next},row.value??null):normalizeFieldValue({id,...next},null);
  await validateReferences(tx,{id,...next},value,owner.workspace_id,row.value);
  if(old&&!isDeepStrictEqual(row.value??null,value)){
   if(kind!=='tree_choice')throw new AppError(409,'Relationship field conversion would rewrite existing values');
   await persistAttributeValue(tx,row,{id,...next},row.value??null,value,actor,change);
   await sql`UPDATE sys_relationships SET version=version+1 WHERE id=${row.id}::uuid`.execute(tx);
   for(const ref of endpoints(row))touched.set(`${ref.objectTypeId}:${ref.recordId}`,ref);
  }
 }
 for(const ref of touched.values()){
  const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${ref.objectTypeId}::uuid`.execute(tx)).rows[0];
  await sql`UPDATE ${sql.table(model.name)} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${ref.recordId}::uuid`.execute(tx);
 }
 if(old)await sql`UPDATE sys_fields SET labels=${JSON.stringify(labels)}::jsonb,kind=${kind},config=${JSON.stringify(config)}::jsonb,required=${required},input_rules=${JSON.stringify(rules)}::jsonb,version=version+${isDeepStrictEqual({technical_name:old.technical_name,labels:old.labels,kind:old.kind,config:old.config,required:old.required,input_rules:old.input_rules},next)?0:1} WHERE id=${id}::uuid`.execute(tx);
 else await sql`INSERT INTO sys_fields(id,relationship_type_id,technical_name,labels,kind,config,required,input_rules) VALUES(${id}::uuid,${relationship}::uuid,${name},${JSON.stringify(labels)}::jsonb,${kind},${JSON.stringify(config)}::jsonb,${required},${JSON.stringify(rules)}::jsonb)`.execute(tx);
 for(const key of Object.keys(next) as (keyof typeof next)[])if(key!=='input_rules'&&!isDeepStrictEqual(old?.[key]??null,next[key]))await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${change}::uuid,${owner.workspace_id}::uuid,'field',${id}::uuid,${id}::uuid,${key},${JSON.stringify(old?.[key]??null)}::jsonb,${JSON.stringify(next[key])}::jsonb,${actor})`.execute(tx);
 for(const key of ['description','helpText','defaultValue','unique'] as const){const before=(old?.input_rules??emptyFieldInputRules())[key];if(!isDeepStrictEqual(before,rules[key]))await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${change}::uuid,${owner.workspace_id}::uuid,'field',${id}::uuid,${id}::uuid,${`input.${key}`},${JSON.stringify(before)}::jsonb,${JSON.stringify(rules[key])}::jsonb,${actor})`.execute(tx);}
 if(!old||!isDeepStrictEqual({technical_name:old.technical_name,labels:old.labels,kind:old.kind,config:old.config,required:old.required,input_rules:old.input_rules},next))await sql`UPDATE sys_relationship_types SET version=version+1 WHERE id=${relationship}::uuid`.execute(tx);
 return (await relationshipFieldDefinitions(tx,relationship!)).find(f=>f.id===id)!;
}
export async function relationshipAttributeCapabilities(field:string,endpoints:{objectTypeId:string;recordId:string}[],newFocus?:{objectTypeId:string;recordId:string}){
 const rights=await Promise.all(endpoints.map(async ref=>{const p=await contentAccess().policy(ref.objectTypeId),creating=newFocus?.objectTypeId===ref.objectTypeId&&newFocus.recordId===ref.recordId;return {read:creating?p.creationField(field):p.field(field,ref.recordId).read,edit:creating?p.creationField(field):p.field(field,ref.recordId).edit};}));
 return {read:rights.every(r=>r.read),edit:rights.every(r=>r.edit)};
}
export type AttributeEdge={id:string;workspace_id:string;relationship_type_id:string;left_object_type_id:string;left_record_id:string;right_object_type_id:string;right_record_id:string;version:number};
const endpoints=(e:AttributeEdge)=>[{objectTypeId:e.left_object_type_id,recordId:e.left_record_id},{objectTypeId:e.right_object_type_id,recordId:e.right_record_id}];
export async function projectEdgeAttributes(tx:Executor,edge:AttributeEdge){
 const fields=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE relationship_type_id=${edge.relationship_type_id}::uuid AND state<>'deleted'`.execute(tx)).rows;
 const rows=(await sql<{field_id:string;value:FieldValue}>`SELECT key::uuid AS field_id,value FROM sys_relationships r CROSS JOIN LATERAL jsonb_each(r.values) WHERE r.id=${edge.id}::uuid`.execute(tx)).rows;
 const values:Record<string,FieldValue>={},access:Record<string,{read:boolean;edit:boolean}>={};
 for(const field of fields){const rights=await relationshipAttributeCapabilities(field.id,endpoints(edge));access[field.id]=rights;if(rights.read)values[field.id]=rows.find(r=>r.field_id===field.id)?.value??null;}
 return {values,access};
}
export async function writeEdgeAttributes(tx:Executor,focus:{objectTypeId:string;recordId:string},writes:import('@xobject/contracts').RelationshipAttributeWrite[]|undefined,added:string[],actor:string,change:string,newRecord:boolean){
 const seen=new Set<string>(),touched=new Map<string,{objectTypeId:string;recordId:string}>();
 const edges=(await sql<AttributeEdge>`SELECT * FROM sys_relationships WHERE (left_object_type_id=${focus.objectTypeId}::uuid AND left_record_id=${focus.recordId}::uuid) OR (right_object_type_id=${focus.objectTypeId}::uuid AND right_record_id=${focus.recordId}::uuid)`.execute(tx)).rows;
 const pending=[...(writes??[])];
 for(const id of added){const edge=edges.find(e=>e.id===id)!;if(!pending.some(w=>w.relationshipTypeId===edge.relationship_type_id&&endpoints(edge).some(r=>r.objectTypeId===w.target.objectTypeId&&r.recordId===w.target.recordId)))pending.push({relationshipTypeId:edge.relationship_type_id,definitionVersion:(await sql<{version:number}>`SELECT version FROM sys_relationship_types WHERE id=${edge.relationship_type_id}::uuid`.execute(tx)).rows[0].version,target:endpoints(edge).find(r=>r.objectTypeId!==focus.objectTypeId||r.recordId!==focus.recordId)!,values:{}});}
 for(const write of pending){
  const edge=edges.find(e=>e.relationship_type_id===write.relationshipTypeId&&endpoints(e).some(r=>r.objectTypeId===write.target.objectTypeId&&r.recordId===write.target.recordId));
  if(!edge)throw new AppError(400,'Attribute edge must be linked to the source');
  if(seen.has(edge.id))throw new AppError(400,'Duplicate relationship attribute write');seen.add(edge.id);
  const fresh=added.includes(edge.id);
  if(!fresh&&(write.edgeId!==edge.id||write.version!==edge.version))throw new AppError(409,'Relationship edge version conflict');
  if(fresh&&(write.edgeId||write.version))throw new AppError(409,'New edge cannot reuse an old edge identity');
  const definition=(await sql<{version:number;active:boolean}>`SELECT version,active FROM sys_relationship_types WHERE id=${edge.relationship_type_id}::uuid`.execute(tx)).rows[0];
  if(definition.version!==write.definitionVersion)throw new AppError(409,'Relationship definition version conflict');
  if(!definition.active&&Object.keys(write.values).length)throw new AppError(400,'Relationship type is inactive');
  const fields=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE relationship_type_id=${edge.relationship_type_id}::uuid AND state='active'`.execute(tx)).rows;
  const rows=(await sql<{field_id:string;value:FieldValue}>`SELECT key::uuid AS field_id,value FROM sys_relationships r CROSS JOIN LATERAL jsonb_each(r.values) WHERE r.id=${edge.id}::uuid`.execute(tx)).rows;
  for(const id of Object.keys(write.values))if(!fields.some(f=>f.id===id))throw new AppError(400,'Attribute field does not belong to this relationship');
  let changed=false;
  for(const field of fields){
   const supplied=Object.hasOwn(write.values,field.id),previous=rows.find(r=>r.field_id===field.id)?.value??null;
   if(!supplied&&!fresh)continue;
   const rights=await relationshipAttributeCapabilities(field.id,endpoints(edge),newRecord?focus:undefined);
   if(!rights.edit){if(supplied||field.required)throw new AppError(403,'Both endpoints must allow attribute editing');continue;}
   const value=normalizeFieldValue(field,supplied?write.values[field.id]:field.input_rules.defaultValue,previous);
   if(isDeepStrictEqual(previous,value))continue;
   for(const ref of endpoints(edge))if(!newRecord||ref.objectTypeId!==focus.objectTypeId||ref.recordId!==focus.recordId)await contentAccess().require(ref.objectTypeId,ref.recordId,'edit');
   await validateReferences(tx,field,value,edge.workspace_id,previous);
   await persistAttributeValue(tx,edge,field,previous,value,actor,change);
   changed=true;
  }
  if(changed){if(!fresh)await sql`UPDATE sys_relationships SET version=version+1 WHERE id=${edge.id}::uuid`.execute(tx);for(const ref of endpoints(edge))touched.set(`${ref.objectTypeId}:${ref.recordId}`,ref);}
 }
 return [...touched.values()];
}
export async function relationshipFieldLifecycle(tx:Executor,input:Inputs['set_definition_state'],actor:string){
 const field=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE id=${input.id}::uuid`.execute(tx)).rows[0];
 if(!field||field.state==='deleted')throw new AppError(404,'Field not found');
 if(field.state!==input.expectedState)throw new AppError(409,'Definition lifecycle conflict');
 if(field.is_protected)throw new AppError(403,'Module definition is protected');
 const used=(await sql`SELECT 1 FROM sys_relationships WHERE relationship_type_id=${field.relationship_type_id}::uuid AND values ? ${field.id} AND values->${field.id}<>'null'::jsonb UNION ALL SELECT 1 FROM sys_journal WHERE field_id=${field.id}::uuid AND entity_kind='relationship' LIMIT 1`.execute(tx)).rows.length>0;
 if(input.state==='deleted'&&(!input.confirm||used))throw new AppError(409,used?'Used fields can only be deactivated':'Confirm definition deletion');
 const relation=(await sql<{workspace_id:string}>`SELECT workspace_id FROM sys_relationship_types WHERE id=${field.relationship_type_id}::uuid`.execute(tx)).rows[0];
 if(input.state==='active')for(const row of (await sql<{value:FieldValue}>`SELECT r.values->${field.id} AS value FROM sys_relationships r WHERE r.relationship_type_id=${field.relationship_type_id}::uuid`.execute(tx)).rows)normalizeFieldValue(field,row.value??null);
 if(field.state!==input.state){await sql`UPDATE sys_fields SET state=${input.state},version=version+1 WHERE id=${field.id}::uuid`.execute(tx);await sql`UPDATE sys_relationship_types SET version=version+1 WHERE id=${field.relationship_type_id}::uuid`.execute(tx);await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,${relation.workspace_id}::uuid,'field',${field.id}::uuid,${field.id}::uuid,'state',${JSON.stringify(field.state)}::jsonb,${JSON.stringify(input.state)}::jsonb,${actor})`.execute(tx);}
 return {id:field.id,state:input.state};
}
export async function candidateAttributes(tx:Executor,relationship:string,source:{objectTypeId:string;recordId?:string},target:{objectTypeId:string;recordId:string}){
 const fields=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE relationship_type_id=${relationship}::uuid AND state='active'`.execute(tx)).rows,values:Record<string,FieldValue>={},access:Record<string,{read:boolean;edit:boolean}>={};
 for(const field of fields){const sourcePolicy=await contentAccess().policy(source.objectTypeId),targetPolicy=await contentAccess().policy(target.objectTypeId),a=source.recordId?sourcePolicy.field(field.id,source.recordId):{read:sourcePolicy.creationField(field.id),edit:sourcePolicy.creationField(field.id)},b=targetPolicy.field(field.id,target.recordId);const rights={read:a.read&&b.read,edit:a.edit&&b.edit};access[field.id]=rights;if(rights.read)values[field.id]=rights.edit?field.input_rules.defaultValue:null;}
 return {attributeValues:values,attributeAccess:access};
}

async function persistAttributeValue(tx:Executor,edge:AttributeEdge,field:TypedField,previous:unknown,value:FieldValue,actor:string,change:string){
   await sql`UPDATE sys_relationships SET values=jsonb_set(values,ARRAY[${field.id}],${JSON.stringify(value)}::jsonb),updated_at=now(),updated_by=${actor} WHERE id=${edge.id}::uuid`.execute(tx);
   const detail=field.kind==='structured'?{schema:field.config.schema,changes:structuredChanges(previous,value)}:null;
   const journal=v7();await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,detail_context,actor_id) VALUES(${journal}::uuid,${change}::uuid,${edge.workspace_id}::uuid,'relationship',${edge.id}::uuid,${field.id}::uuid,${field.technical_name},${JSON.stringify(previous)}::jsonb,${JSON.stringify(value)}::jsonb,${JSON.stringify(detail)}::jsonb,${actor})`.execute(tx);
   for(const ref of endpoints(edge))await sql`INSERT INTO sys_relationship_journal_endpoints VALUES(${journal}::uuid,${edge.workspace_id}::uuid,${ref.objectTypeId}::uuid,${ref.recordId}::uuid)`.execute(tx);
}
