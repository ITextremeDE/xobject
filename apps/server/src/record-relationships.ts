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
type Edge = { version:number;id:string; workspace_id:string; relationship_type_id:string; left_object_type_id:string; left_record_id:string; right_object_type_id:string; right_record_id:string };
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
async function edgesFor(tx:Executor,workspace:string) {return (await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${workspace}::uuid ORDER BY id`.execute(tx)).rows;}
export async function recordRelationships(tx:Executor,objectTypeId:string,recordId?:string):Promise<RecordRelationships> {
  const sourcePolicy=await contentAccess().require(objectTypeId,recordId,recordId?'read':'create');
  const model=await modelFor(tx,objectTypeId);if(recordId)await reference(tx,{objectTypeId,recordId},model.workspace_id);
  const definitions=await relationshipTypes(tx,model.workspace_id),chain=await primaryChain(tx,model.workspace_id);
  const own=recordId?(await sql<Edge>`SELECT * FROM sys_relationships WHERE workspace_id=${model.workspace_id}::uuid AND ((left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid)) ORDER BY id`.execute(tx)).rows:[];
  const attributeProjections=new Map(await Promise.all(own.map(async edge=>[edge.id,await projectEdgeAttributes(tx,edge)] as const)));
  const edges:RecordRelationship[]=[];
  for(const edge of own)if(await contentAccess().readable(edge.left_object_type_id,edge.left_record_id)&&await contentAccess().readable(edge.right_object_type_id,edge.right_record_id))edges.push({version:edge.version,attributes:attributeProjections.get(edge.id)!.values,id:edge.id,definition:definitions.find(d=>d.id===edge.relationship_type_id)!,left:await visibleReference(tx,left(edge),model.workspace_id),right:await visibleReference(tx,right(edge),model.workspace_id)});
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
/** Current standard-field projection for the opposite endpoint; it never changes journal snapshots. */
async function dossierEntries(tx:Executor,edges:RecordRelationship[],objectTypeId:string,recordId?:string):Promise<DossierEntry[]> {
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
  if(ownCondition&&!(args.recordId?(await contentAccess().policy(model.id)).field(ownCondition.fieldId,args.recordId).read:(await contentAccess().policy(model.id)).creationField(ownCondition.fieldId)))throw new AppError(403,'Restricted relationship condition');
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
    const hasKeyword=await contentAccess().canField(other.id,'keyword')&&(await sql`SELECT 1 FROM sys_fields WHERE object_type_id=${other.id}::uuid AND technical_name='keyword' AND state<>'deleted'`.execute(tx)).rows.length;
    selects.push(sql`SELECT ${other.id}::uuid AS "objectTypeId",id AS "recordId",${await contentAccess().keywordValue(other.id)} AS keyword,${other.technical_name}::text AS "objectTechnicalName",${JSON.stringify(other.labels)}::jsonb AS "objectLabels",'active'::text AS state FROM ${sql.table(table(other))} WHERE ${policy.predicate()} AND ${conditionFilter} AND ${descendants?sql`id=ANY(${descendants.get(other.id)??[]}::uuid[])`:sql`true`}`);
  }
  if(!selects.length)return {records:[],total:0,offset:args.offset,limit:args.limit};
  const rows=sql.join(selects,sql` UNION ALL `),filter=sql`position(lower(${args.query}) IN lower(keyword))>0 AND NOT ("objectTypeId"=${args.objectTypeId}::uuid AND "recordId"=${args.recordId??null}::uuid IS TRUE)`;
  const total=(await sql<{total:number}>`WITH candidates AS (${rows}) SELECT count(*)::integer AS total FROM candidates WHERE ${filter}`.execute(tx)).rows[0].total;
  const records=(await sql<RelatedRecord>`WITH candidates AS (${rows}) SELECT * FROM candidates WHERE ${filter} ORDER BY lower(keyword),"objectTypeId","recordId" LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
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
    for(const row of records){if(!await endpointMatches(tx,type,side,{objectTypeId:model.id,recordId:row.id}))continue;const n=counts.get(`${side}:${model.id}:${row.id}`)??0;if(n<min||(max!==null&&n>max))throw new AppError(409,`Relationship cardinality violated (${type.technicalName}, ${side})`);}
  }
  if(type.kind==='primary') {
    const chain=await primaryChain(tx,type.workspaceId);if(!chain)throw new AppError(409,'Primary module levels are not installed');await validatePrimaryChain(tx,type.workspaceId,chain);
    const parents=new Map<string,string>();
    for(const edge of edges){const child=key(right(edge));if(parents.has(child))throw new AppError(409,'A record has at most one Primary association');parents.set(child,key(left(edge)));}
    for(const start of parents.keys()){const seen=new Set<string>();let current:string|undefined=start;while(current){if(seen.has(current))throw new AppError(409,'Primary association cycle');seen.add(current);current=parents.get(current);}}
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
      if(n<min||(max!==null&&n>max))throw new AppError(409,`Relationship cardinality violated (${type.technicalName}, ${side})`);
    }
    if(type.kind==='primary') {
      // UNION deduplicates ancestors and terminates even if an invalid cycle was supplied.
      const cycle=(await sql`WITH RECURSIVE ancestors(object_type_id,record_id) AS (
        SELECT left_object_type_id,left_record_id FROM sys_relationships WHERE workspace_id=${type.workspaceId}::uuid AND relationship_type_id=${type.id}::uuid AND right_object_type_id=${ref.objectTypeId}::uuid AND right_record_id=${ref.recordId}::uuid
        UNION
        SELECT e.left_object_type_id,e.left_record_id FROM sys_relationships e JOIN ancestors a ON e.right_object_type_id=a.object_type_id AND e.right_record_id=a.record_id WHERE e.workspace_id=${type.workspaceId}::uuid AND e.relationship_type_id=${type.id}::uuid
      ) SELECT 1 FROM ancestors WHERE object_type_id=${ref.objectTypeId}::uuid AND record_id=${ref.recordId}::uuid LIMIT 1`.execute(tx)).rows.length;
      if(cycle)throw new AppError(409,'Primary association cycle');
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
  if(!type)throw new AppError(404,'Relationship type not found');if(type.version!==args.version)throw new AppError(409,'Relationship version conflict');
  if(type.kind==='primary'&&!type.active)throw new AppError(400,'Enable the Projects module first');
  if(type.rulesState==='active')return type;
  await validateRelationshipGraph(tx,type);
  await sql`UPDATE sys_relationship_types SET rules_state='active',version=version+1 WHERE id=${type.id}::uuid`.execute(tx);
  await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,${args.workspaceId}::uuid,'relationship_type',${type.id}::uuid,'rulesState','"draft"'::jsonb,'"active"'::jsonb,${actor})`.execute(tx);
  return (await relationshipTypes(tx,args.workspaceId)).find(d=>d.id===type.id)!;
}

/** Replace only supplied relationship fields, with explicit definition versions. Both endpoints' versions change. */
export async function writeRecordRelationships(tx:Executor,objectTypeId:string,recordId:string,writes:RelationshipWrite[]|undefined,actor:string,changeId:string,alreadyTouched:boolean,newRecord=false,attributeWrites?:import('@xobject/contracts').RelationshipAttributeWrite[]) {
  const model=await modelFor(tx,objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id);
  await sql`INSERT INTO sys_record_identities(workspace_id,object_type_id,record_id) VALUES(${model.workspace_id}::uuid,${objectTypeId}::uuid,${recordId}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
  const chain=await primaryChain(tx,model.workspace_id);
  const focus={objectTypeId,recordId},touched=new Map<string,RecordReference>(),affected=new Set<string>(),seen=new Set<string>(),addedJournal:{edge:Edge;type:RelationshipType}[]=[];
  for(const write of writes??[]) {
    const type=definitions.find(d=>d.id===write.relationshipTypeId);
    if(!type||type.version!==write.version)throw new AppError(409,'Relationship definition version conflict');
    if(type.rulesState!=='active'||!supportsSide(type,objectTypeId,write.side)||(symmetric(type)&&write.side==='right'))throw new AppError(400,'Relationship field unavailable');
    const field=`${type.id}:${write.side}`;if(seen.has(field))throw new AppError(400,'Duplicate relationship field');seen.add(field);
    const all=(await edgesFor(tx,model.workspace_id)).filter(e=>e.relationship_type_id===type.id);
    const current=all.filter(e=>symmetric(type)?key(left(e))===key(focus)||key(right(e))===key(focus):key(write.side==='left'?left(e):right(e))===key(focus));
    const desired: {a:RecordReference;b:RecordReference}[]=[];const targets=new Set<string>();
    for(const target of write.targets) {
      if(key(target)===key(focus)||targets.has(key(target)))throw new AppError(400,'Duplicate or self relationship');targets.add(key(target));
      let a=write.side==='left'?focus:target,b=write.side==='left'?target:focus;
      if(type.kind==='primary'&&chain&&!primaryPairAllowed(chain,a.objectTypeId,b.objectTypeId))throw new AppError(400,'Primary association does not follow configured levels');
      if(!permits(type,a.objectTypeId,b.objectTypeId)&&!(!type.directed&&permits(type,b.objectTypeId,a.objectTypeId)))throw new AppError(400,'Object pair is not allowed');
      if(!type.directed&&((!permits(type,a.objectTypeId,b.objectTypeId))||(symmetric(type)&&key(a)>key(b))))[a,b]=[b,a];
      desired.push({a,b});
    }
    const edgeKey=(a:RecordReference,b:RecordReference)=>type.directed?`${key(a)}>${key(b)}`:[key(a),key(b)].sort().join('>');
    const removals=current.filter(e=>!desired.some(d=>edgeKey(d.a,d.b)===edgeKey(left(e),right(e))));
    const additions=desired.filter(d=>!current.some(e=>edgeKey(d.a,d.b)===edgeKey(left(e),right(e))));
    for(const pair of [...removals.map(edge=>({a:left(edge),b:right(edge)})),...additions]){
      for(const [rule,ref] of [[type.leftApplicability,pair.a],[type.rightApplicability,pair.b]] as const)if(rule&&!(newRecord&&key(ref)===key(focus)?(await contentAccess().policy(ref.objectTypeId)).creationField(rule.fieldId):(await contentAccess().policy(ref.objectTypeId)).field(rule.fieldId,ref.recordId).read))throw new AppError(403,'Restricted relationship condition');
    }
    for(const ref of [...removals.flatMap(edge=>[left(edge),right(edge)]),...additions.flatMap(edge=>[edge.a,edge.b])])await contentAccess().require(ref.objectTypeId,newRecord&&key(ref)===key(focus)?undefined:ref.recordId,key(ref)===key(focus)?newRecord?'create':'edit':'read');
    if(removals.length||additions.length)affected.add(type.id);
    for(const edge of removals) {await journalEdge(tx,edge,type,actor,changeId,false);await sql`DELETE FROM sys_relationships WHERE id=${edge.id}::uuid`.execute(tx);touched.set(key(left(edge)),left(edge));touched.set(key(right(edge)),right(edge));}
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
async function journalEdge(tx:Executor,edge:Edge,type:RelationshipType,actor:string,change:string,added:boolean) {
  const snapshot={relationshipTypeId:type.id,labels:type.labels,left:await reference(tx,left(edge),edge.workspace_id),right:await reference(tx,right(edge),edge.workspace_id),directed:type.directed};
  const journalId=v7();
  await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${journalId}::uuid,${change}::uuid,${edge.workspace_id}::uuid,'relationship',${edge.id}::uuid,'link',${JSON.stringify(added?null:snapshot)}::jsonb,${JSON.stringify(added?snapshot:null)}::jsonb,${actor})`.execute(tx);
  for(const ref of [left(edge),right(edge)])await sql`INSERT INTO sys_relationship_journal_endpoints VALUES(${journalId}::uuid,${edge.workspace_id}::uuid,${ref.objectTypeId}::uuid,${ref.recordId}::uuid)`.execute(tx);
}

/** Projects read model: one level of Primary descendants, never general/custom links. */
export async function relationshipTreeBranch(tx:Executor,args:{objectTypeId:string;recordId:string;offset:number;limit:number},actor:string):Promise<import('@xobject/contracts').RelationshipTreeBranch> {
  await contentAccess().require(args.objectTypeId,args.recordId,args.recordId?'read':'create');
  const model=await modelFor(tx,args.objectTypeId),record=await visibleReference(tx,{objectTypeId:args.objectTypeId,recordId:args.recordId},model.workspace_id);
  if(!await primaryChain(tx,model.workspace_id))throw new AppError(409,'Enable the Projects module first');
  const definitions=await relationshipTypes(tx,model.workspace_id),byId=new Map(definitions.map(type=>[type.id,type]));
  const raw=(await edgesFor(tx,model.workspace_id)).filter(edge=>byId.get(edge.relationship_type_id)?.kind==='primary'),edges:Edge[]=[],focus=key(args);
  for(const edge of raw)if(await contentAccess().readable(edge.left_object_type_id,edge.left_record_id)&&await contentAccess().readable(edge.right_object_type_id,edge.right_record_id))edges.push(edge);
  const childrenFor=(identity:string)=>edges.filter(edge=>key(left(edge))===identity);
  const parents=new Map(edges.filter(edge=>byId.get(edge.relationship_type_id)?.kind==='primary').map(edge=>[key(right(edge)),left(edge)]));
  const ancestors:RelatedRecord[]=[],seen=new Set([focus]);let parent=parents.get(focus);
  while(parent&&ancestors.length<32){
    if(seen.has(key(parent)))throw new AppError(409,'Invalid Primary hierarchy');seen.add(key(parent));
    ancestors.unshift(await visibleReference(tx,parent,model.workspace_id));parent=parents.get(key(parent));
  }
  const candidates:(Omit<import('@xobject/contracts').RelationshipTreeChild,'record'>&{record:RelatedRecord})[]=[];
  for(const edge of childrenFor(focus)) {
    const type=byId.get(edge.relationship_type_id)!,target=right(edge);
    candidates.push({edgeId:edge.id,record:await visibleReference(tx,target,model.workspace_id),relationshipTypeId:type.id,kind:'primary',labels:type.labels,sideLabels:type.leftLabels,direction:'outgoing',hasChildren:childrenFor(key(target)).length>0});
  }
  const locale=(await sql<{language:Language|null;default_language:Language;available_languages:Language[]}>`SELECT u.language,w.default_language,w.available_languages FROM sys_users u CROSS JOIN sys_workspaces w WHERE u.id=${actor} AND w.id=${model.workspace_id}::uuid`.execute(tx)).rows[0];
  const collator=new Intl.Collator(effectiveWorkspaceLanguage(locale.language,locale.available_languages,locale.default_language),{numeric:true,sensitivity:'base'});
  candidates.sort((a,b)=>collator.compare(a.record.keyword,b.record.keyword)||a.record.objectTypeId.localeCompare(b.record.objectTypeId)||a.record.recordId.localeCompare(b.record.recordId)||a.edgeId.localeCompare(b.edgeId));
  const page=candidates.slice(args.offset,args.offset+args.limit),snapshots=await classificationSnapshots(tx,[record,...page.map(child=>child.record)]);
  const treeRecord=(record:RelatedRecord)=>({...record,statusLabels:snapshots.get(key(record))?.classificationOptions.find(option=>option.kind==='status'&&option.id===snapshots.get(key(record))?.status)?.labels??null});
  return {record:treeRecord(record),ancestors,ancestorsTruncated:Boolean(parent),children:page.map(child=>({...child,record:treeRecord(child.record)})),total:candidates.length,limit:args.limit,offset:args.offset};
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
  if(parent){if((await modelFor(tx,parent.objectTypeId)).workspace_id!==model.workspace_id)throw new AppError(400,'Relationship endpoints must share a workspace');if(!primaryPairAllowed(chain,parent.objectTypeId,model.id))throw new AppError(400,'Primary association does not follow configured levels');const branch=await relationshipTreeBranch(tx,{objectTypeId:parent.objectTypeId,recordId:parent.recordId,offset:0,limit:1},actor);if(branch.record.objectTypeId!==parent.objectTypeId)throw new AppError(400,'Invalid Primary context');if((await modelFor(tx,parent.objectTypeId)).workspace_id!==model.workspace_id)throw new AppError(400,'Relationship endpoints must share a workspace');const {statusLabels,...parentRecord}=branch.record;path=[...branch.ancestors,parentRecord];}
  const direct=path.at(-1)??null;
  return {configuration:chain,direct,unavailable,levels:roles.map(role=>({role,objectTypeId:chain[role],record:path.find(row=>row.objectTypeId===chain[role])??null,inherited:Boolean(direct&&direct.objectTypeId!==chain[role])}))};
}

/** Catalog entries describe eligible object pairs, even when no matching records exist yet. */
export async function recordLinkOptions(tx:Executor,args:{objectTypeId:string;recordId:string;sourceValues?:Record<string,unknown>}){
 await contentAccess().require(args.objectTypeId,args.recordId,'edit');
 const model=await modelFor(tx,args.objectTypeId);if(model.state!=='active')return [];
 const source=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(table(model))} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0];if(!source)throw new AppError(404,'Record not found');
 for(const name of Object.keys(args.sourceValues??{}))if(!(args.recordId?await contentAccess().canField(model.id,name,'read',args.recordId):await contentAccess().canCreateField(model.id,name)))throw new AppError(403,'Restricted relationship condition');
 const fields=(await recordRelationships(tx,model.id,args.recordId)).fields,chain=await primaryChain(tx,model.workspace_id);
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
 if(!row)throw new AppError(404,'Record not found');if(row.version!==source.recordVersion)throw new AppError(409,'Source record version conflict');
 const definition=(await relationshipTypes(tx,target.workspace_id)).find(type=>type.id===source.relationshipTypeId);
 if(!definition||definition.version!==source.version)throw new AppError(409,'Relationship definition version conflict');
 if(!definition.active||definition.rulesState!=='active'||!supportsSide(definition,original.id,source.side)||(symmetric(definition)&&source.side==='right'))throw new AppError(400,'Relationship field unavailable');
 const side=oppositeRelationshipSide(definition,source.side),existing=(writes??[]).find(w=>w.relationshipTypeId===definition.id&&w.side===side),ref={objectTypeId:original.id,recordId:source.recordId};
 if(existing&&existing.version!==definition.version)throw new AppError(409,'Relationship definition version conflict');
 const targets=[...(existing?.targets??[])];if(!targets.some(t=>key(t)===key(ref)))targets.push(ref);
 return [...(writes??[]).filter(w=>w!==existing),{relationshipTypeId:definition.id,version:definition.version,side,targets}];
}

/** System cleanup on confirmed permanent deletion; validate surviving endpoints only. */
export async function removeDeletedRecordRelationships(tx:Executor,objectTypeId:string,recordId:string,actor:string,change:string){
 const model=await modelFor(tx,objectTypeId),focus={objectTypeId,recordId},definitions=await relationshipTypes(tx,model.workspace_id);
 const edges=(await edgesFor(tx,model.workspace_id)).filter(edge=>key(left(edge))===key(focus)||key(right(edge))===key(focus));
 const touched=new Map<string,RecordReference>();
 for(const edge of edges){const type=definitions.find(t=>t.id===edge.relationship_type_id)!;await journalEdge(tx,edge,type,actor,change,false);await sql`DELETE FROM sys_relationships WHERE id=${edge.id}::uuid`.execute(tx);const other=key(left(edge))===key(focus)?right(edge):left(edge);touched.set(key(other),other);}
 for(const definition of definitions.filter(t=>t.rulesState==='active'&&edges.some(e=>e.relationship_type_id===t.id)))await validateChangedRelationships(tx,definition,[...touched.values()]);
 for(const ref of touched.values()){const target=await modelFor(tx,ref.objectTypeId);await sql`UPDATE ${sql.table(table(target))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${ref.recordId}::uuid`.execute(tx);}
 return [...touched.values()];
}
