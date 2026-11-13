import {relationshipSummary} from './relationship-reader.js';
import type {RelationshipFieldRow} from './relationship-fields.js';
import {contactFields} from './contact-domain.js';
import {recordIconExpression} from './record-icons.js';
import {candidateAttributes,projectEdgeAttributes,writeEdgeAttributes} from './relationship-fields.js';
import {contentAccess} from './content-permissions.js';
import {oppositeRelationshipSide,relationshipSidesForObject} from '@xobject/contracts';
import {conditionColumn,endpointMatches,validateEndpointPair,validateConditionalRecord} from './relationship-conditions.js';
import {validatePrimaryRequirements,primaryChain,primaryPairAllowed,validatePrimaryChain} from './primary-chain.js';
import {primaryChainRoles,primaryRolesForObject,type PrimaryChainContext,type RecordReference as PrimaryRef} from '@xobject/contracts';
import { effectiveWorkspaceLanguage, type Language, type ClassificationConfig, type DossierEntry } from '@xobject/contracts';
import { sql } from 'kysely';
import { v7 } from 'uuid';
import type { Executor } from './database.js';
import { AppError } from './errors.js';
import { relationshipTypes } from './relationship-types.js';
import type { RelationshipType, RelationshipWrite, RecordReference, RelatedRecord, RecordRelationships, RecordRelationship } from '@xobject/contracts';

type Model = { id:string; workspace_id:string; technical_name:string; code:string; labels:Record<string,string>; state:'active'|'inactive'|'deleted' };
export type Edge = { values?:Record<string,import('@xobject/contracts').FieldValue>;version:number;id:string; workspace_id:string; relationship_type_id:string; left_object_type_id:string; left_record_id:string; right_object_type_id:string; right_record_id:string };
const table = (model:Model) => `${model.code}_${model.technical_name}`;
const key = (ref:RecordReference) => `${ref.objectTypeId}:${ref.recordId}`;
const left = (edge:Edge):RecordReference => ({objectTypeId:edge.left_object_type_id,recordId:edge.left_record_id});
const right = (edge:Edge):RecordReference => ({objectTypeId:edge.right_object_type_id,recordId:edge.right_record_id});
const symmetric = (type:RelationshipType) => !type.directed && (type.allowAll || type.pairs.some(p=>type.pairs.some(other=>other.leftObjectTypeId===p.rightObjectTypeId)));
const permits = (type:RelationshipType,a:string,b:string) => type.allowAll || type.pairs.some(p=>p.leftObjectTypeId===a&&p.rightObjectTypeId===b);
const eligible = (type:RelationshipType,object:string,side:'left'|'right') => type.allowAll || type.pairs.some(p=>(side==='left'?p.leftObjectTypeId:p.rightObjectTypeId)===object);
const supportsSide=(type:RelationshipType,object:string,side:'left'|'right')=>eligible(type,object,side)||(symmetric(type)&&eligible(type,object,side==='left'?'right':'left'));
export async function modelFor(tx:Executor,id:string):Promise<Model> {
  const row=(await sql<Model>`SELECT o.id,o.workspace_id,o.technical_name,o.labels,o.state,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid`.execute(tx)).rows[0];
  if(!row||row.state==='deleted')throw new AppError(404,'Object type not found');return row;
}
async function reference(tx:Executor,ref:RecordReference,workspace:string):Promise<RelatedRecord> {
  const model=await modelFor(tx,ref.objectTypeId);
  if(model.workspace_id!==workspace)throw new AppError(400,'Relationship endpoints must share a workspace');
  const row=(await sql<{keyword:string;iconKey:import('@xobject/contracts').RecordIconKey}>`SELECT ${await recordIconExpression(tx,model.id)} AS "iconKey", ${await contentAccess().keywordValue(model.id)} AS keyword FROM ${sql.table(table(model))} WHERE id=${ref.recordId}::uuid`.execute(tx)).rows[0];
  if(!row)throw new AppError(404,'Related record not found');
  return {...ref,iconKey:row.iconKey,keyword:row.keyword||ref.recordId,objectTechnicalName:model.technical_name,objectLabels:model.labels,state:model.state as 'active'|'inactive'};
}
async function visibleReference(tx:Executor,ref:RecordReference,workspace:string){await contentAccess().require(ref.objectTypeId,ref.recordId);const value=await reference(tx,ref,workspace);if(!await contentAccess().canField(ref.objectTypeId,'keyword','read',ref.recordId))value.keyword=ref.recordId;return value;}
/** Batch professional context for readable Contact-person targets. It is not edge data or an audit snapshot. */
async function enrichContactPersons(tx:Executor,records:RelatedRecord[]){
 for(const objectId of new Set(records.map(record=>record.objectTypeId))){
  const bindings=await contactFields(tx,objectId),kind=bindings.find(field=>field.field_key==='contact_kind');
  if(!kind)continue;
  const policy=await contentAccess().policy(objectId);if(!policy.field(kind.id).read)continue;
  const fields=['job_title','department','function'].map(key=>bindings.find(field=>field.field_key===key&&field.state==='active'));
  const projection=(index:number)=>fields[index]?policy.fieldValue(fields[index]!.id,fields[index]!.technical_name):index===2?sql`NULL::uuid[]`:sql`NULL::text`;
  const model=await modelFor(tx,objectId),ids=[...new Set(records.filter(record=>record.objectTypeId===objectId).map(record=>record.recordId))];
  const rows=(await sql<{id:string;job_title:string|null;department:string|null;function:string[]|null}>`SELECT id,${projection(0)} AS job_title,${projection(1)} AS department,${projection(2)} AS function FROM ${sql.table(table(model))} WHERE id=ANY(${ids}::uuid[]) AND ${sql.ref(kind.technical_name)}=${kind.option_keys.person}::uuid AND ${policy.predicate()}`.execute(tx)).rows;
  for(const row of rows){
   if(!policy.field(kind.id,row.id).read)continue;
   const summary={...(fields[0]&&policy.field(fields[0].id,row.id).read?{jobTitle:row.job_title}:{}),...(fields[1]&&policy.field(fields[1].id,row.id).read?{department:row.department}:{}),...(fields[2]&&policy.field(fields[2].id,row.id).read?{functionLabels:(row.function??[]).flatMap(id=>{const option=fields[2]!.config.options?.find(option=>option.id===id);return option?[option.labels]:[];})}:{})};
   for(const record of records)if(record.objectTypeId===objectId&&record.recordId===row.id)record.contactPerson=summary;
  }
 }
 return records;
}
async function edgesFor(tx:Executor,workspace:string) {return (await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${workspace}::uuid ORDER BY id`.execute(tx)).rows;}
export async function recordRelationships(tx:Executor,objectTypeId:string,recordId?:string):Promise<RecordRelationships> {
  const sourcePolicy=await contentAccess().require(objectTypeId,recordId,recordId?'read':'create');
  const model=await modelFor(tx,objectTypeId);if(recordId)await reference(tx,{objectTypeId,recordId},model.workspace_id);
  const definitions=await relationshipTypes(tx,model.workspace_id),chain=await primaryChain(tx,model.workspace_id);
  const own=recordId?(await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${model.workspace_id}::uuid AND ((left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid)) ORDER BY id`.execute(tx)).rows:[];
  const {edges,attributeProjections}=await projectRelationshipEdges(tx,model.workspace_id,own,definitions);
  const fields:RecordRelationships['fields']=[];
  for(const definition of definitions.filter(d=>(d.kind!=='primary'||d.active)&&(d.rulesState==='active'||own.some(e=>e.relationship_type_id===d.id)))) {
    for(const side of relationshipSidesForObject(definition,objectTypeId,chain)) {
      const targets=edges.filter(e=>e.definition.id===definition.id).flatMap(e=>{
        if(symmetric(definition))return [{...(key(e.left)===`${objectTypeId}:${recordId}`?e.right:e.left),edgeId:e.id,edgeVersion:e.version,attributeValues:e.attributes,attributeAccess:attributeProjections.get(e.id)?.access}];
        return key(e[side])===`${objectTypeId}:${recordId}`?[{...e[side==='left'?'right':'left'],edgeId:e.id,edgeVersion:e.version,attributeValues:e.attributes,attributeAccess:attributeProjections.get(e.id)?.access}]:[];
      });fields.push({definition,side,targets,editable:(recordId?sourcePolicy.recordCapabilities(recordId).edit:sourcePolicy.capabilities.create===true)&&!own.some(edge=>edge.relationship_type_id===definition.id&&!edges.some(visible=>visible.id===edge.id)),restricted:own.some(edge=>edge.relationship_type_id===definition.id&&!edges.some(visible=>visible.id===edge.id))});
    }
  }return {primaryChain:chain,fields,edges,dossier:await dossierEntries(tx,edges,objectTypeId,recordId)};
}
export async function projectRelationshipEdges(tx:Executor,workspace:string,own:Edge[],definitions:RelationshipType[]){
  const references=await treeReferences(tx,workspace,own.flatMap(edge=>[left(edge),right(edge)]));
  for(const object of new Set([...references.values()].map(ref=>ref.objectTypeId)))await (await contentAccess().policy(object)).load([...references.values()].filter(ref=>ref.objectTypeId===object).map(ref=>ref.recordId));
  const attributeFields=(await sql<RelationshipFieldRow>`SELECT * FROM sys_fields WHERE relationship_type_id=ANY(${[...new Set(own.map(edge=>edge.relationship_type_id))]}::uuid[]) AND state<>'deleted'`.execute(tx)).rows;
  const attributeProjections=new Map(await Promise.all(own.filter(edge=>references.has(key(left(edge)))&&references.has(key(right(edge)))).map(async edge=>[edge.id,await projectEdgeAttributes(tx,edge,{fields:attributeFields.filter(f=>f.relationship_type_id===edge.relationship_type_id),values:edge.values??{}})] as const)));
  const edges:RecordRelationship[]=[];
  for(const edge of own)if(attributeProjections.has(edge.id))edges.push({version:edge.version,attributes:attributeProjections.get(edge.id)!.values,id:edge.id,definition:definitions.find(d=>d.id===edge.relationship_type_id)!,left:references.get(key(left(edge)))!,right:references.get(key(right(edge)))!});
  await enrichContactPersons(tx,edges.flatMap(edge=>[edge.left,edge.right]));
  return {edges,attributeProjections};
}
/** Current standard-field projection for the opposite endpoint; it never changes journal snapshots. */
export async function dossierEntries(tx:Executor,edges:RecordRelationship[],objectTypeId:string,recordId?:string):Promise<DossierEntry[]> {
  const entries=edges.map(edge=>({id:edge.id,definition:edge.definition,target:key(edge.left)===`${objectTypeId}:${recordId}`?edge.right:edge.left}));
  const values=await classificationSnapshots(tx,entries.map(entry=>entry.target));
  return entries.map(entry=>({id:entry.id,definition:entry.definition,record:{...entry.target,...values.get(key(entry.target))!}}));
}
/** Batch standard-field projection with per-record field ceilings for Dossier and Tree. */
async function classificationSnapshots(tx:Executor,targets:RelatedRecord[]){
  const values=new Map<string,{type:string|null;status:string|null;category:string[];classificationOptions:ClassificationConfig['options']}>();
  for(const id of new Set(targets.map(target=>target.objectTypeId))) {
    const model=await modelFor(tx,id);
    const classification=(await sql<{classification:ClassificationConfig}>`SELECT classification FROM sys_object_types WHERE id=${id}::uuid`.execute(tx)).rows[0].classification;
    const installed=(await sql<{technical_name:string}>`SELECT technical_name FROM sys_fields WHERE object_type_id=${id}::uuid AND state<>'deleted' AND technical_name IN('type','status','category')`.execute(tx)).rows.map(field=>field.technical_name);
    const readableFields=new Set<string>();for(const name of installed)if(await contentAccess().canField(id,name))readableFields.add(name);
    const policy=await contentAccess().policy(id),metadata=await contentAccess().fields(id);const projection=(name:string)=>installed.includes(name)&&readableFields.has(name)?policy.fieldValue(metadata.find(f=>f.technical_name===name)!.id,name):name==='category'?sql`'{}'::uuid[]`:sql`NULL::uuid`;
    const rows=(await sql<{id:string;type:string|null;status:string|null;category:string[]}>`SELECT id,${projection('type')} AS type,${projection('status')} AS status,${projection('category')} AS category FROM ${sql.table(table(model))} WHERE id=ANY(${targets.filter(target=>target.objectTypeId===id).map(target=>target.recordId)}::uuid[])`.execute(tx)).rows;
    for(const row of rows)values.set(`${id}:${row.id}`,{type:row.type,status:row.status,category:row.category??[],classificationOptions:classification.options.filter(option=>option.kind==='type'?option.id===row.type:option.kind==='status'?option.id===row.status:row.category?.includes(option.id))});
  }
  return values;
}
export async function searchRelationshipCandidates(tx:Executor,args:{primaryAncestor?:RecordReference;sourceValues?:Record<string,unknown>;targetObjectTypeId?:string;objectTypeId:string;recordId?:string;relationshipTypeId:string;side:'left'|'right';query:string;offset:number;limit:number}) {
  await contentAccess().require(args.objectTypeId,args.recordId,args.recordId?'read':'create');
  const model=await modelFor(tx,args.objectTypeId);
  const type=(await relationshipTypes(tx,model.workspace_id)).find(d=>d.id===args.relationshipTypeId);
  if(!type||!type.active||type.rulesState!=='active'||!supportsSide(type,model.id,args.side))throw new AppError(400,'Relationship field unavailable');
  for(const name of Object.keys(args.sourceValues??{}))if(!(args.recordId?await contentAccess().canField(model.id,name,'read',args.recordId):await contentAccess().canCreateField(model.id,name)))throw new AppError(403,'Restricted relationship condition');
  const ownCondition=args.side==='left'?type.leftApplicability:type.rightApplicability;
  if(ownCondition&&!(args.recordId?(await contentAccess().policy(model.id,args.recordId)).field(ownCondition.fieldId,args.recordId).read:(await contentAccess().policy(model.id)).creationField(ownCondition.fieldId)))throw new AppError(403,'Restricted relationship condition');
  if(ownCondition){const column=await conditionColumn(tx,ownCondition,model.id);const source=args.recordId?(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(table(model))} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0]??{}:{};const value=Object.hasOwn(args.sourceValues??{},column!)?args.sourceValues![column!]:source[column!];if(!ownCondition.optionIds.includes(String(value??'').toLowerCase()))return {records:[],total:0,offset:args.offset,limit:args.limit};}
  const models=(await sql<Model>`SELECT o.*,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${model.workspace_id}::uuid AND o.state='active'`.execute(tx)).rows;
  const chain=type.kind==='primary'?await primaryChain(tx,model.workspace_id):null;
  let descendants:Map<string,string[]>|undefined;
  if(args.primaryAncestor){
    const ancestor=args.primaryAncestor,ancestorModel=await modelFor(tx,ancestor.objectTypeId);
    if(ancestorModel.workspace_id!==model.workspace_id)throw new AppError(400,'Primary filter must share the source workspace');
    if(!chain||args.side!=='right'||!args.targetObjectTypeId||!primaryPairAllowed(chain,ancestor.objectTypeId,args.targetObjectTypeId))throw new AppError(400,'Invalid Primary ancestor filter');
    if(ancestorModel.state!=='active')throw new AppError(400,'Primary filter unavailable');
    await contentAccess().require(ancestor.objectTypeId,ancestor.recordId);
    const active=new Set(models.map(model=>model.id)),adjacent=new Map<string,RecordReference[]>();
    for(const edge of (await edgesFor(tx,model.workspace_id)).filter(edge=>edge.relationship_type_id===type.id)){
      const children=adjacent.get(key(left(edge)))??[];children.push(right(edge));adjacent.set(key(left(edge)),children);
    }
    // Follow only visible active paths, as in the Primary tree. Hidden intermediates
    // must not become an ancestry/count oracle for otherwise readable descendants.
    descendants=new Map();const queue=[ancestor],seen=new Set([key(ancestor)]);
    for(let i=0;i<queue.length;i++)for(const child of adjacent.get(key(queue[i]))??[]){
      if(seen.has(key(child))||!active.has(child.objectTypeId))continue;
      seen.add(key(child));if(!await contentAccess().readable(child.objectTypeId,child.recordId))continue;
      queue.push(child);const ids=descendants.get(child.objectTypeId)??[];ids.push(child.recordId);descendants.set(child.objectTypeId,ids);
    }
  }
  const selects=[];
  for(const other of models) {
    const policy=await contentAccess().policy(other.id);if(!policy.capabilities.read)continue;
    if(args.targetObjectTypeId&&other.id!==args.targetObjectTypeId.toLowerCase())continue;
    if(chain&&!(args.side==='right'?primaryPairAllowed(chain,other.id,model.id):primaryPairAllowed(chain,model.id,other.id)))continue;
    const allowed=args.side==='left'?permits(type,model.id,other.id):permits(type,other.id,model.id);
    if(!allowed&&!(symmetric(type)&&permits(type,other.id,model.id)))continue;
    const condition=args.side==='left'?type.rightApplicability:type.leftApplicability;
    if(condition&&!policy.field(condition.fieldId).read)continue;
    const conditionName=await conditionColumn(tx,condition,other.id);
    const conditionFilter=conditionName?sql`${policy.fieldValue(condition!.fieldId,conditionName)}=ANY(${condition!.optionIds}::uuid[])`:sql`true`;
    const numberField=(await contentAccess().fields(other.id)).find(f=>f.technical_name==='record_number');
    const numberValue=numberField?policy.fieldValue(numberField.id,'record_number'):sql`NULL::text`;
    selects.push(sql`SELECT ${other.id}::uuid AS "objectTypeId",id AS "recordId",${await contentAccess().keywordValue(other.id)} AS keyword,${numberValue} AS "recordNumber",${await recordIconExpression(tx,other.id)} AS "iconKey",${other.technical_name}::text AS "objectTechnicalName",${JSON.stringify(other.labels)}::jsonb AS "objectLabels",'active'::text AS state FROM ${sql.table(table(other))} WHERE ${policy.predicate()} AND ${conditionFilter} AND ${descendants?sql`id=ANY(${descendants.get(other.id)??[]}::uuid[])`:sql`true`}`);
  }
  if(!selects.length)return {records:[],total:0,offset:args.offset,limit:args.limit};
  const rows=sql.join(selects,sql` UNION ALL `),filter=sql`(position(lower(${args.query}) IN lower(keyword))>0 OR position(lower(${args.query}) IN lower(COALESCE("recordNumber",'')))>0) AND NOT ("objectTypeId"=${args.objectTypeId}::uuid AND "recordId"=${args.recordId??null}::uuid IS TRUE)`;
  const total=(await sql<{total:number}>`WITH candidates AS (${rows}) SELECT count(*)::integer AS total FROM candidates WHERE ${filter}`.execute(tx)).rows[0].total;
  const records=(await sql<RelatedRecord>`WITH candidates AS (${rows}) SELECT * FROM candidates WHERE ${filter} ORDER BY lower(keyword),"objectTypeId","recordId" LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
  if(args.recordId&&records.length){
   const existing=(await sql<Edge>`SELECT * FROM sys_relationships WHERE relationship_type_id=${type.id}::uuid AND ((left_object_type_id=${args.objectTypeId}::uuid AND left_record_id=${args.recordId}::uuid AND right_record_id=ANY(${records.map(r=>r.recordId)}::uuid[])) OR (right_object_type_id=${args.objectTypeId}::uuid AND right_record_id=${args.recordId}::uuid AND left_record_id=ANY(${records.map(r=>r.recordId)}::uuid[])))`.execute(tx)).rows;
   for(const record of records){const edge=existing.find(edge=>key(left(edge))===key(record)||key(right(edge))===key(record));if(edge){record.edgeId=edge.id;record.edgeVersion=edge.version;}}
  }
  await enrichContactPersons(tx,records);
  return {records:await Promise.all(records.map(async record=>({...record,...await candidateAttributes(tx,type.id,{objectTypeId:args.objectTypeId,recordId:args.recordId},record)}))),total,limit:args.limit,offset:args.offset};
}

/** Preflight and record writes share the model lock. Counts are final-state counts, including both directions of symmetric edges. */
export async function validateRelationshipGraph(tx:Executor,type:RelationshipType) {
  const edges=(await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${type.workspaceId}::uuid AND relationship_type_id=${type.id}::uuid`.execute(tx)).rows;
  const counts=new Map<string,number>();
  const bump=(side:string,ref:RecordReference)=>{const k=`${side}:${key(ref)}`;counts.set(k,(counts.get(k)??0)+1);};
  const duplicate=new Set<string>();
  for(const edge of edges) {
    if(!permits(type,edge.left_object_type_id,edge.right_object_type_id)&&!(symmetric(type)&&permits(type,edge.right_object_type_id,edge.left_object_type_id)))throw new AppError(409,'Existing relationships use disallowed object pairs');
    const a=left(edge),b=right(edge),k=type.directed?`${key(a)}>${key(b)}`:[key(a),key(b)].sort().join('>');
    if(key(a)===key(b)||duplicate.has(k))throw new AppError(409,'Duplicate or self relationship');duplicate.add(k);
    await validateEndpointPair(tx,type,a,b);
    bump('left',a);bump('right',b);if(symmetric(type)){bump('left',b);bump('right',a);}
  }
  const models=(await sql<Model>`SELECT o.*,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${type.workspaceId}::uuid AND o.state<>'deleted'`.execute(tx)).rows;
  for(const model of models)for(const side of ['left','right'] as const) {
    if(!eligible(type,model.id,side))continue;
    const min=side==='left'?type.leftMin:type.rightMin,max=side==='left'?type.leftMax:type.rightMax;
    if(!min&&max===null)continue;
    const records=(await sql<{id:string}>`SELECT id FROM ${sql.table(table(model))}`.execute(tx)).rows;
    for(const row of records){if(!await endpointMatches(tx,type,side,{objectTypeId:model.id,recordId:row.id}))continue;const n=counts.get(`${side}:${model.id}:${row.id}`)??0;if(n<min||(max!==null&&n>max))throw new AppError(409,`Relationship cardinality violated (${type.technicalName}, ${side})`,{code:'relationship_cardinality'});}
  }
  if(type.kind==='primary') {
    const chain=await primaryChain(tx,type.workspaceId);if(!chain)throw new AppError(409,'Primary module levels are not installed');await validatePrimaryChain(tx,type.workspaceId,chain);
    const parents=new Map<string,string>();
    for(const edge of edges){const child=key(right(edge));if(parents.has(child))throw new AppError(409,'A record has at most one Primary association',{code:"primaryParentLimitHelp"});parents.set(child,key(left(edge)));}
    for(const start of parents.keys()){const seen=new Set<string>();let current:string|undefined=start;while(current){if(seen.has(current))throw new AppError(409,'Primary association cycle',{code:"primaryCycleHelp"});seen.add(current);current=parents.get(current);}}
  }
}
/** Normal saves inspect changed endpoints only. Definition activation still checks the complete graph. */
async function validateChangedRelationships(tx:Executor,type:RelationshipType,references:RecordReference[]) {
  const refs=[...new Map(references.map(ref=>[key(ref),ref])).values()];
  for(const ref of refs) {
    for(const side of ['left','right'] as const) {
      if(!eligible(type,ref.objectTypeId,side))continue;
      const min=side==='left'?type.leftMin:type.rightMin,max=side==='left'?type.leftMax:type.rightMax;
      if(!min&&max===null)continue;
      const filter=symmetric(type)
        ?sql`((left_object_type_id=${ref.objectTypeId}::uuid AND left_record_id=${ref.recordId}::uuid) OR (right_object_type_id=${ref.objectTypeId}::uuid AND right_record_id=${ref.recordId}::uuid))`
        :side==='left'?sql`left_object_type_id=${ref.objectTypeId}::uuid AND left_record_id=${ref.recordId}::uuid`:sql`right_object_type_id=${ref.objectTypeId}::uuid AND right_record_id=${ref.recordId}::uuid`;
      if(!await endpointMatches(tx,type,side,ref))continue;
      const n=(await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_relationships WHERE workspace_id=${type.workspaceId}::uuid AND relationship_type_id=${type.id}::uuid AND ${filter}`.execute(tx)).rows[0].n;
      if(n<min||(max!==null&&n>max))throw new AppError(409,`Relationship cardinality violated (${type.technicalName}, ${side})`,{code:'relationship_cardinality'});
    }
    if(type.kind==='primary') {
      // UNION deduplicates ancestors and terminates even if an invalid cycle was supplied.
      const cycle=(await sql`WITH RECURSIVE ancestors(object_type_id,record_id) AS (
        SELECT left_object_type_id,left_record_id FROM sys_relationships WHERE workspace_id=${type.workspaceId}::uuid AND relationship_type_id=${type.id}::uuid AND right_object_type_id=${ref.objectTypeId}::uuid AND right_record_id=${ref.recordId}::uuid
        UNION
        SELECT e.left_object_type_id,e.left_record_id FROM sys_relationships e JOIN ancestors a ON e.right_object_type_id=a.object_type_id AND e.right_record_id=a.record_id WHERE e.workspace_id=${type.workspaceId}::uuid AND e.relationship_type_id=${type.id}::uuid
      ) SELECT 1 FROM ancestors WHERE object_type_id=${ref.objectTypeId}::uuid AND record_id=${ref.recordId}::uuid LIMIT 1`.execute(tx)).rows.length;
      if(cycle)throw new AppError(409,'Primary association cycle',{code:"primaryCycleHelp"});
    }
  }
}
/** Retained edges reserve their slots while recycled. Restore validates only this record and its edges. */
export async function validateRestoredRelationships(tx:Executor,objectTypeId:string,recordId:string){
 const model=await modelFor(tx,objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id),focus={objectTypeId,recordId};
 const edges=(await edgesFor(tx,model.workspace_id)).filter(edge=>key(left(edge))===key(focus)||key(right(edge))===key(focus));
 for(const definition of definitions.filter(type=>type.rulesState==='active')){
  const own=edges.filter(edge=>edge.relationship_type_id===definition.id);
  for(const edge of own){
   if(!permits(definition,edge.left_object_type_id,edge.right_object_type_id)&&!(symmetric(definition)&&permits(definition,edge.right_object_type_id,edge.left_object_type_id)))throw new AppError(409,'Retained relationship pair is no longer valid');
   if(definition.kind==='primary'){const chain=await primaryChain(tx,model.workspace_id);if(!chain||!primaryPairAllowed(chain,edge.left_object_type_id,edge.right_object_type_id))throw new AppError(409,'Retained Primary association is no longer valid');}
   await validateEndpointPair(tx,definition,left(edge),right(edge));
  }
  await validateChangedRelationships(tx,definition,[focus,...own.flatMap(edge=>[left(edge),right(edge)])]);
 }
}
export async function activateRelationship(tx:Executor,args:{workspaceId:string;relationshipTypeId:string;version:number},actor:string) {
  const type=(await relationshipTypes(tx,args.workspaceId)).find(d=>d.id===args.relationshipTypeId);
  if(!type)throw new AppError(404,'Relationship type not found');if(type.version!==args.version)throw new AppError(409,'Relationship version conflict',{code:"version_conflict"});
  if(type.kind==='primary'&&!type.active)throw new AppError(400,'Enable the Projects module first',{code:"projectsModuleDisabled"});
  if(type.rulesState==='active')return type;
  await validateRelationshipGraph(tx,type);
  await sql`UPDATE sys_relationship_types SET rules_state='active',version=version+1 WHERE id=${type.id}::uuid`.execute(tx);
  await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,${args.workspaceId}::uuid,'relationship_type',${type.id}::uuid,'rulesState','"draft"'::jsonb,'"active"'::jsonb,${actor})`.execute(tx);
  return (await relationshipTypes(tx,args.workspaceId)).find(d=>d.id===type.id)!;
}

/** Replace only supplied relationship fields, with explicit definition versions. Both endpoints' versions change. */
export async function writeRecordRelationships(tx:Executor,objectTypeId:string,recordId:string,writes:RelationshipWrite[]|undefined,actor:string,changeId:string,alreadyTouched:boolean,newRecord=false,attributeWrites?:import('@xobject/contracts').RelationshipAttributeWrite[],beforeSnapshots?:RelationshipJournalSnapshots) {
  const model=await modelFor(tx,objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id);
  await sql`INSERT INTO sys_record_identities(workspace_id,object_type_id,record_id) VALUES(${model.workspace_id}::uuid,${objectTypeId}::uuid,${recordId}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
  beforeSnapshots??=await captureRelationshipJournalBefore(tx,objectTypeId,recordId,writes);
  const chain=await primaryChain(tx,model.workspace_id);
  const focus={objectTypeId,recordId},touched=new Map<string,RecordReference>(),affected=new Set<string>(),seen=new Set<string>(),addedJournal:{edge:Edge;type:RelationshipType}[]=[];
  for(let write of writes??[]) {
    const type=definitions.find(d=>d.id===write.relationshipTypeId);
    if(!type||type.version!==write.version)throw new AppError(409,'Relationship definition version conflict',{code:"version_conflict"});
    if(type.rulesState!=='active'||!supportsSide(type,objectTypeId,write.side)||(symmetric(type)&&write.side==='right'))throw new AppError(400,'Relationship field unavailable');
    const field=`${type.id}:${write.side}`;if(seen.has(field))throw new AppError(400,'Duplicate relationship field');seen.add(field);
    const all=(await sql<Edge>`SELECT * FROM sys_relationships WHERE relationship_type_id=${type.id}::uuid AND ((left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid))`.execute(tx)).rows;
    const current=all.filter(e=>symmetric(type)?key(left(e))===key(focus)||key(right(e))===key(focus):key(write.side==='left'?left(e):right(e))===key(focus));
    if(write.mode==='patch'){
      const removed=new Set((write.remove??[]).map(key));
      if(removed.size!==(write.remove??[]).length)throw new AppError(400,'Duplicate relationship removal');
      const retained=current.map(e=>key(left(e))===key(focus)?right(e):left(e));
      const merged=new Map(retained.filter(ref=>!removed.has(key(ref))).map(ref=>[key(ref),ref]));
      for(const target of write.targets){if(removed.has(key(target)))throw new AppError(400,'A relationship cannot be added and removed together');merged.set(key(target),target);}
      write={...write,targets:[...merged.values()]};
    }else if(write.remove?.length)throw new AppError(400,'Relationship removals require patch mode');
    const desired: {a:RecordReference;b:RecordReference}[]=[];const targets=new Set<string>();
    for(const target of write.targets) {
      if(key(target)===key(focus)||targets.has(key(target)))throw new AppError(400,'Duplicate or self relationship');targets.add(key(target));
      let a=write.side==='left'?focus:target,b=write.side==='left'?target:focus;
      if(type.kind==='primary'&&chain&&!primaryPairAllowed(chain,a.objectTypeId,b.objectTypeId))throw new AppError(400,'Primary association does not follow configured levels',{code:"primaryChainInvalidPair"});
      if(!permits(type,a.objectTypeId,b.objectTypeId)&&!(!type.directed&&permits(type,b.objectTypeId,a.objectTypeId)))throw new AppError(400,'Object pair is not allowed');
      if(!type.directed&&((!permits(type,a.objectTypeId,b.objectTypeId))||(symmetric(type)&&key(a)>key(b))))[a,b]=[b,a];
      desired.push({a,b});
    }
    const edgeKey=(a:RecordReference,b:RecordReference)=>type.directed?`${key(a)}>${key(b)}`:[key(a),key(b)].sort().join('>');
    const removals=current.filter(e=>!desired.some(d=>edgeKey(d.a,d.b)===edgeKey(left(e),right(e))));
    const additions=desired.filter(d=>!current.some(e=>edgeKey(d.a,d.b)===edgeKey(left(e),right(e))));
    for(const pair of [...removals.map(edge=>({a:left(edge),b:right(edge)})),...additions]){
      for(const [rule,ref] of [[type.leftApplicability,pair.a],[type.rightApplicability,pair.b]] as const)if(rule&&!(newRecord&&key(ref)===key(focus)?(await contentAccess().policy(ref.objectTypeId)).creationField(rule.fieldId):(await contentAccess().policy(ref.objectTypeId,ref.recordId)).field(rule.fieldId,ref.recordId).read))throw new AppError(403,'Restricted relationship condition');
    }
    for(const ref of [...removals.flatMap(edge=>[left(edge),right(edge)]),...additions.flatMap(edge=>[edge.a,edge.b])])await contentAccess().require(ref.objectTypeId,newRecord&&key(ref)===key(focus)?undefined:ref.recordId,key(ref)===key(focus)?newRecord?'create':'edit':'read');
    if(removals.length||additions.length)affected.add(type.id);
    for(const edge of removals) {await journalEdge(tx,edge,type,actor,changeId,false,beforeSnapshots.get(edge.id));await sql`DELETE FROM sys_relationships WHERE id=${edge.id}::uuid`.execute(tx);touched.set(key(left(edge)),left(edge));touched.set(key(right(edge)),right(edge));}
    for(const {a,b} of additions) {
      if(!type.active)throw new AppError(400,'Relationship type is inactive');
      const ar=await reference(tx,a,model.workspace_id),br=await reference(tx,b,model.workspace_id);if(ar.state!=='active'||br.state!=='active')throw new AppError(400,'Related objects must be active');
      await validateEndpointPair(tx,type,a,b);
      const edge:Edge={version:1,id:v7(),workspace_id:model.workspace_id,relationship_type_id:type.id,left_object_type_id:a.objectTypeId,left_record_id:a.recordId,right_object_type_id:b.objectTypeId,right_record_id:b.recordId};
      await sql`INSERT INTO sys_relationships(id,workspace_id,relationship_type_id,left_object_type_id,left_record_id,right_object_type_id,right_record_id,created_by) VALUES(${edge.id}::uuid,${model.workspace_id}::uuid,${type.id}::uuid,${a.objectTypeId}::uuid,${a.recordId}::uuid,${b.objectTypeId}::uuid,${b.recordId}::uuid,${actor})`.execute(tx);
      addedJournal.push({edge,type});touched.set(key(a),a);touched.set(key(b),b);
    }
  }
  for(const type of definitions.filter(type=>type.rulesState==='active'&&(type.leftApplicability||type.rightApplicability)&&((eligible(type,objectTypeId,'left')&&type.leftMin)||(eligible(type,objectTypeId,'right')&&type.rightMin))))affected.add(type.id);
  if(newRecord)for(const type of definitions.filter(d=>d.rulesState==='active'&&((eligible(d,objectTypeId,'left')&&d.leftMin)||(eligible(d,objectTypeId,'right')&&d.rightMin))))affected.add(type.id);
  for(const type of definitions.filter(d=>affected.has(d.id)))await validateChangedRelationships(tx,type,[focus,...touched.values()]);
  await validateConditionalRecord(tx,objectTypeId,recordId,definitions);
  await validatePrimaryRequirements(tx,model.workspace_id);
  for(const {edge,type} of addedJournal)await journalEdge(tx,edge,type,actor,changeId,true);
  for(const ref of await writeEdgeAttributes(tx,focus,attributeWrites,addedJournal.map(j=>j.edge.id),actor,changeId,newRecord))touched.set(key(ref),ref);
  for(const ref of touched.values()) {
    if(alreadyTouched&&key(ref)===key(focus))continue;
    const target=await modelFor(tx,ref.objectTypeId);
    if(target.state!=='active')throw new AppError(400,'Related objects must be active');
    await sql`UPDATE ${sql.table(table(target))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${ref.recordId}::uuid`.execute(tx);
  }
  return touched.size>0;
}
async function edgeSnapshot(tx:Executor,edge:Edge,type:RelationshipType) {
  return {relationshipTypeId:type.id,labels:type.labels,left:await reference(tx,left(edge),edge.workspace_id),right:await reference(tx,right(edge),edge.workspace_id),directed:type.directed};
}
export type RelationshipJournalSnapshots=Map<string,Awaited<ReturnType<typeof edgeSnapshot>>>;
/** Capture both endpoint names before combined field/link writes change their context. */
export async function captureRelationshipJournalBefore(tx:Executor,objectTypeId:string,recordId:string,writes:RelationshipWrite[]|undefined):Promise<RelationshipJournalSnapshots>{
  const snapshots:RelationshipJournalSnapshots=new Map();
  if(!writes?.length)return snapshots;
  const model=await modelFor(tx,objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id);
  const edges=(await sql<Edge>`SELECT * FROM sys_relationships WHERE relationship_type_id=ANY(${writes.map(w=>w.relationshipTypeId)}::uuid[]) AND ((left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid))`.execute(tx)).rows;
  for(const edge of edges){
    const type=definitions.find(t=>t.id===edge.relationship_type_id)!;
    const focus={objectTypeId,recordId},target=key(left(edge))===key(focus)?right(edge):left(edge);
    const removed=writes.some(write=>write.relationshipTypeId===type.id&&(symmetric(type)||key(write.side==='left'?left(edge):right(edge))===key(focus))&&(write.mode==='patch'?(write.remove??[]).some(ref=>key(ref)===key(target)):!write.targets.some(ref=>key(ref)===key(target))));
    if(removed)snapshots.set(edge.id,await edgeSnapshot(tx,edge,type));
  }
  return snapshots;
}
async function journalEdge(tx:Executor,edge:Edge,type:RelationshipType,actor:string,change:string,added:boolean,before?:Awaited<ReturnType<typeof edgeSnapshot>>) {
  if(!added&&!before)throw new AppError(500,'Missing relationship before snapshot');
  const snapshot=added?await edgeSnapshot(tx,edge,type):before;
  const journalId=v7();
  await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${journalId}::uuid,${change}::uuid,${edge.workspace_id}::uuid,'relationship',${edge.id}::uuid,'link',${JSON.stringify(added?null:snapshot)}::jsonb,${JSON.stringify(added?snapshot:null)}::jsonb,${actor})`.execute(tx);
  for(const ref of [left(edge),right(edge)])await sql`INSERT INTO sys_relationship_journal_endpoints VALUES(${journalId}::uuid,${edge.workspace_id}::uuid,${ref.objectTypeId}::uuid,${ref.recordId}::uuid)`.execute(tx);
}

/** Batch only the current branch's endpoints, retaining permission-aware names/icons. */
async function treeReferences(tx:Executor,workspace:string,refs:RecordReference[]){
  const result=new Map<string,RelatedRecord>();if(!refs.length)return result;
  const models=(await sql<Model>`SELECT o.id,o.workspace_id,o.technical_name,o.labels,o.state,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${workspace}::uuid AND o.id=ANY(${[...new Set(refs.map(ref=>ref.objectTypeId))]}::uuid[]) AND o.state<>'deleted'`.execute(tx)).rows;
  for(const model of models){
    const policy=await contentAccess().policy(model.id);if(!policy.capabilities.read)continue;
    const ids=refs.filter(ref=>ref.objectTypeId===model.id).map(ref=>ref.recordId);
    const rows=(await sql<{id:string;keyword:string;iconKey:import('@xobject/contracts').RecordIconKey}>`SELECT r.id,${await contentAccess().keywordValue(model.id,'r')} AS keyword,${await recordIconExpression(tx,model.id,'r')} AS "iconKey" FROM ${sql.table(table(model))} AS r WHERE r.id=ANY(${ids}::uuid[]) AND ${policy.predicate('r')}`.execute(tx)).rows;
    for(const row of rows)result.set(`${model.id}:${row.id}`,{objectTypeId:model.id,recordId:row.id,keyword:row.keyword||row.id,iconKey:row.iconKey,objectTechnicalName:model.technical_name,objectLabels:model.labels,state:model.state as 'active'|'inactive'});
  }
  return result;
}
/** hasChildren is page-local and must not reveal inaccessible descendants. */
async function treeExpandableParents(tx:Executor,workspace:string,primaryIds:string[],parents:RecordReference[]){
  const result=new Set<string>();if(!parents.length)return result;
  const parentTypes=parents.map(ref=>ref.objectTypeId),parentRecords=parents.map(ref=>ref.recordId);
  const endpoints=sql`SELECT * FROM unnest(${parentTypes}::uuid[],${parentRecords}::uuid[]) AS p(object_type_id,record_id)`;
  const types=(await sql<{id:string}>`SELECT DISTINCT e.right_object_type_id AS id FROM sys_relationships e JOIN (${endpoints}) AS p ON p.object_type_id=e.left_object_type_id AND p.record_id=e.left_record_id WHERE e.workspace_id=${workspace}::uuid AND e.relationship_type_id=ANY(${primaryIds}::uuid[])`.execute(tx)).rows;
  const models=(await sql<Model>`SELECT o.id,o.workspace_id,o.technical_name,o.labels,o.state,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${workspace}::uuid AND o.id=ANY(${types.map(type=>type.id)}::uuid[]) AND o.state<>'deleted'`.execute(tx)).rows;
  for(const model of models){
    const policy=await contentAccess().policy(model.id);if(!policy.capabilities.read)continue;
    const visible=(await sql<{object_type_id:string;record_id:string}>`SELECT p.object_type_id,p.record_id FROM (${endpoints}) AS p WHERE EXISTS(SELECT 1 FROM sys_relationships e JOIN ${sql.table(table(model))} AS r ON r.id=e.right_record_id WHERE e.workspace_id=${workspace}::uuid AND e.relationship_type_id=ANY(${primaryIds}::uuid[]) AND e.left_object_type_id=p.object_type_id AND e.left_record_id=p.record_id AND e.right_object_type_id=${model.id}::uuid AND ${policy.predicate('r')})`.execute(tx)).rows;
    for(const parent of visible)result.add(`${parent.object_type_id}:${parent.record_id}`);
  }
  return result;
}
/** Projects read model: one level of Primary descendants, never general/custom links. */
export async function relationshipTreeBranch(tx:Executor,args:{objectTypeId:string;recordId:string;offset:number;limit:number},actor:string):Promise<import('@xobject/contracts').RelationshipTreeBranch> {
  await contentAccess().require(args.objectTypeId,args.recordId,args.recordId?'read':'create');
  const model=await modelFor(tx,args.objectTypeId),record=await visibleReference(tx,{objectTypeId:args.objectTypeId,recordId:args.recordId},model.workspace_id);
  if(!await primaryChain(tx,model.workspace_id))throw new AppError(409,'Enable the Projects module first',{code:"projectsModuleDisabled"});
  const definitions=await relationshipTypes(tx,model.workspace_id),byId=new Map(definitions.map(type=>[type.id,type])),primaryIds=definitions.filter(type=>type.kind==='primary').map(type=>type.id);
  // Resolve only this record's visible ancestor path, rather than every workspace edge.
  const ancestors:RelatedRecord[]=[],seen=new Set([key(args)]);let current:RecordReference=args,parent:RelatedRecord|undefined;
  while(true){
    const incoming=(await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${model.workspace_id}::uuid AND relationship_type_id=ANY(${primaryIds}::uuid[]) AND right_object_type_id=${current.objectTypeId}::uuid AND right_record_id=${current.recordId}::uuid ORDER BY id DESC`.execute(tx)).rows;
    const visible=await treeReferences(tx,model.workspace_id,incoming.map(left));parent=incoming.map(edge=>visible.get(key(left(edge)))).find(value=>value!==undefined);
    if(!parent||ancestors.length>=32)break;
    if(seen.has(key(parent)))throw new AppError(409,'Invalid Primary hierarchy');seen.add(key(parent));ancestors.unshift(parent);current=parent;
  }
  const own=(await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${model.workspace_id}::uuid AND relationship_type_id=ANY(${primaryIds}::uuid[]) AND left_object_type_id=${args.objectTypeId}::uuid AND left_record_id=${args.recordId}::uuid ORDER BY id`.execute(tx)).rows;
  const targets=await treeReferences(tx,model.workspace_id,own.map(right));
  const candidates=own.flatMap(edge=>{const target=targets.get(key(right(edge)));if(!target)return [];const type=byId.get(edge.relationship_type_id)!;return [{edgeId:edge.id,record:target,relationshipTypeId:type.id,kind:'primary' as const,labels:type.labels,sideLabels:type.leftLabels,direction:'outgoing' as const,hasChildren:false}];});
  const locale=(await sql<{language:Language|null;default_language:Language;available_languages:Language[]}>`SELECT u.language,w.default_language,w.available_languages FROM sys_users u CROSS JOIN sys_workspaces w WHERE u.id=${actor} AND w.id=${model.workspace_id}::uuid`.execute(tx)).rows[0];
  const collator=new Intl.Collator(effectiveWorkspaceLanguage(locale.language,locale.available_languages,locale.default_language),{numeric:true,sensitivity:'base'});
  candidates.sort((a,b)=>collator.compare(a.record.keyword,b.record.keyword)||a.record.objectTypeId.localeCompare(b.record.objectTypeId)||a.record.recordId.localeCompare(b.record.recordId)||a.edgeId.localeCompare(b.edgeId));
  const page=candidates.slice(args.offset,args.offset+args.limit),expandable=await treeExpandableParents(tx,model.workspace_id,primaryIds,page.map(child=>child.record)),snapshots=await classificationSnapshots(tx,[record,...page.map(child=>child.record)]);
  const treeRecord=(record:RelatedRecord)=>({...record,statusLabels:snapshots.get(key(record))?.classificationOptions.find(option=>option.kind==='status'&&option.id===snapshots.get(key(record))?.status)?.labels??null});
  return {record:treeRecord(record),ancestors,ancestorsTruncated:Boolean(parent),children:page.map(child=>({...child,hasChildren:expandable.has(key(child.record)),record:treeRecord(child.record)})),total:candidates.length,limit:args.limit,offset:args.offset};
}

/** Read the same authoritative chain for persisted records and a proposed direct parent. */
export async function primaryChainContext(tx:Executor,args:{objectTypeId:string;recordId?:string;parent?:PrimaryRef|null},actor:string):Promise<PrimaryChainContext> {
  const model=await modelFor(tx,args.objectTypeId),chain=await primaryChain(tx,model.workspace_id);
  if(args.recordId)await reference(tx,{objectTypeId:args.objectTypeId,recordId:args.recordId},model.workspace_id);
  let parent=args.parent;
  if(parent===undefined&&args.recordId){const current=(await sql<{objectTypeId:string;recordId:string}>`SELECT e.left_object_type_id AS "objectTypeId",e.left_record_id AS "recordId" FROM sys_relationships e JOIN sys_relationship_types t ON t.id=e.relationship_type_id WHERE t.kind='primary' AND e.right_object_type_id=${model.id}::uuid AND e.right_record_id=${args.recordId}::uuid`.execute(tx)).rows[0];parent=current??null;}
  if(!chain)return {configuration:null,levels:[],direct:null};
  const roles=primaryRolesForObject(chain,model.id);
  let path:RelatedRecord[]=[];let unavailable=false;
  if(parent&&!await contentAccess().readable(parent.objectTypeId,parent.recordId)){if(args.parent)throw new AppError(403,'Content access denied');parent=null;unavailable=true;}
  if(parent){if((await modelFor(tx,parent.objectTypeId)).workspace_id!==model.workspace_id)throw new AppError(400,'Relationship endpoints must share a workspace');if(!primaryPairAllowed(chain,parent.objectTypeId,model.id))throw new AppError(400,'Primary association does not follow configured levels',{code:"primaryChainInvalidPair"});const branch=await relationshipTreeBranch(tx,{objectTypeId:parent.objectTypeId,recordId:parent.recordId,offset:0,limit:1},actor);if(branch.record.objectTypeId!==parent.objectTypeId)throw new AppError(400,'Invalid Primary context');if((await modelFor(tx,parent.objectTypeId)).workspace_id!==model.workspace_id)throw new AppError(400,'Relationship endpoints must share a workspace');const {statusLabels,...parentRecord}=branch.record;path=[...branch.ancestors,parentRecord];}
  const direct=path.at(-1)??null;
  return {configuration:chain,direct,unavailable,levels:roles.map(role=>({role,objectTypeId:chain[role],record:path.find(row=>row.objectTypeId===chain[role])??null,inherited:Boolean(direct&&direct.objectTypeId!==chain[role])}))};
}

/** Catalog entries describe eligible object pairs, even when no matching records exist yet. */
export async function recordLinkOptions(tx:Executor,args:{objectTypeId:string;recordId:string;sourceValues?:Record<string,unknown>}){
 await contentAccess().require(args.objectTypeId,args.recordId,'edit');
 const model=await modelFor(tx,args.objectTypeId);if(model.state!=='active')return [];
 const source=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(table(model))} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0];if(!source)throw new AppError(404,'Record not found');
 for(const name of Object.keys(args.sourceValues??{}))if(!(args.recordId?await contentAccess().canField(model.id,name,'read',args.recordId):await contentAccess().canCreateField(model.id,name)))throw new AppError(403,'Restricted relationship condition');
 const fields=(await relationshipSummary(tx,model.id,args.recordId)).fields,chain=await primaryChain(tx,model.workspace_id);
 const models=(await sql<Model>`SELECT o.*,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${model.workspace_id}::uuid AND o.state='active'`.execute(tx)).rows;
 const result:import('@xobject/contracts').RecordLinkOption[]=[];
 for(const other of models){
  const target=await contentAccess().policy(other.id);if(!target.capabilities.read&&!target.capabilities.create)continue;
  const choices=[];
  for(const field of fields){const {definition:type,side}=field;if(!type.active||type.rulesState!=='active'||field.editable===false)continue;
   const a=side==='left'?model.id:other.id,b=side==='left'?other.id:model.id;
   if(!permits(type,a,b)&&!(!type.directed&&permits(type,b,a)))continue;
   if(type.kind==='primary'&&(!chain||!primaryPairAllowed(chain,a,b)))continue;
   const own=side==='left'?type.leftApplicability:type.rightApplicability,opposite=side==='left'?type.rightApplicability:type.leftApplicability;
   if(own){if(!(await contentAccess().policy(model.id)).field(own.fieldId,args.recordId).read)continue;const column=await conditionColumn(tx,own,model.id);if(!own.optionIds.includes(String((Object.hasOwn(args.sourceValues??{},column!)?args.sourceValues![column!]:source[column!])??'').toLowerCase()))continue;}
   if(opposite&&!target.field(opposite.fieldId).read&&!target.creationField(opposite.fieldId))continue;
   const max=side==='left'?type.leftMax:type.rightMax;
   choices.push({relationshipTypeId:type.id,side,canLink:target.capabilities.read&&(!opposite||target.field(opposite.fieldId).read),canCreate:target.capabilities.create===true&&(max===null||field.targets.length<max)&&(!opposite||target.creationField(opposite.fieldId))});
  }
  if(choices.length)result.push({objectType:{id:other.id,technicalName:other.technical_name,labels:other.labels},relationships:choices});
 }
 return result;
}

/** Bind new-record creation to its selected source without replacing existing source links. */
export async function linkedRecordWrites(tx:Executor,targetId:string,source:import('@xobject/contracts').LinkedRecordSource,writes:RelationshipWrite[]|undefined):Promise<RelationshipWrite[]>{
 await contentAccess().require(source.objectTypeId,source.recordId,'edit');
 const original=await modelFor(tx,source.objectTypeId),target=await modelFor(tx,targetId);
 if(original.workspace_id!==target.workspace_id)throw new AppError(400,'Relationship endpoints must share a workspace');
 if(original.state!=='active')throw new AppError(400,'Related objects must be active');
 const row=(await sql<{version:number}>`SELECT version FROM ${sql.table(table(original))} WHERE id=${source.recordId}::uuid`.execute(tx)).rows[0];
 if(!row)throw new AppError(404,'Record not found');if(row.version!==source.recordVersion)throw new AppError(409,'Source record version conflict',{code:"version_conflict"});
 const definition=(await relationshipTypes(tx,target.workspace_id)).find(type=>type.id===source.relationshipTypeId);
 if(!definition||definition.version!==source.version)throw new AppError(409,'Relationship definition version conflict',{code:"version_conflict"});
 if(!definition.active||definition.rulesState!=='active'||!supportsSide(definition,original.id,source.side)||(symmetric(definition)&&source.side==='right'))throw new AppError(400,'Relationship field unavailable');
 const side=oppositeRelationshipSide(definition,source.side),existing=(writes??[]).find(w=>w.relationshipTypeId===definition.id&&w.side===side),ref={objectTypeId:original.id,recordId:source.recordId};
 if(existing&&existing.version!==definition.version)throw new AppError(409,'Relationship definition version conflict',{code:"version_conflict"});
 const targets=[...(existing?.targets??[])];if(!targets.some(t=>key(t)===key(ref)))targets.push(ref);
 return [...(writes??[]).filter(w=>w!==existing),{relationshipTypeId:definition.id,version:definition.version,side,targets}];
}

/** System cleanup on confirmed permanent deletion; validate surviving endpoints only. */
export async function removeDeletedRecordRelationships(tx:Executor,objectTypeId:string,recordId:string,actor:string,change:string){
 const model=await modelFor(tx,objectTypeId),focus={objectTypeId,recordId},definitions=await relationshipTypes(tx,model.workspace_id);
 const edges=(await edgesFor(tx,model.workspace_id)).filter(edge=>key(left(edge))===key(focus)||key(right(edge))===key(focus));
 const touched=new Map<string,RecordReference>(),before=new Map<string,Awaited<ReturnType<typeof edgeSnapshot>>>();
 for(const edge of edges)before.set(edge.id,await edgeSnapshot(tx,edge,definitions.find(t=>t.id===edge.relationship_type_id)!));
 for(const edge of edges){const type=definitions.find(t=>t.id===edge.relationship_type_id)!;await journalEdge(tx,edge,type,actor,change,false,before.get(edge.id));await sql`DELETE FROM sys_relationships WHERE id=${edge.id}::uuid`.execute(tx);const other=key(left(edge))===key(focus)?right(edge):left(edge);touched.set(key(other),other);}
 for(const definition of definitions.filter(t=>t.rulesState==='active'&&edges.some(e=>e.relationship_type_id===t.id)))await validateChangedRelationships(tx,definition,[...touched.values()]);
 for(const ref of touched.values()){const target=await modelFor(tx,ref.objectTypeId);await sql`UPDATE ${sql.table(table(target))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${ref.recordId}::uuid`.execute(tx);}
 return [...touched.values()];
}
