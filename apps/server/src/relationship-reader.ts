import {sql,type RawBuilder} from 'kysely';
import {contentAccess} from './content-permissions.js';
import {modelFor,projectRelationshipEdges,dossierEntries,type Edge} from './record-relationships.js';
import {relationshipTypes} from './relationship-types.js';
import {primaryChain} from './primary-chain.js';
import {relationshipSidesForObject,effectiveWorkspaceLanguage,type RelationshipType,type RecordRelationships,type Language} from '@xobject/contracts';
import type {Executor} from './database.js';

export type RelationshipPageInput={objectTypeId:string;recordId:string;entries?:{relationshipTypeId:string;side:'left'|'right'}[];exclude?:{relationshipTypeId:string;side:'left'|'right';objectTypeId:string;recordId:string}[];query:string;targetObjectTypeId?:string;sortBy:'keyword'|'object'|'relationship'|'jobTitle'|'department'|'function'|'type'|'status'|'category';sortDirection:'asc'|'desc';limit:number;offset:number};
const isSymmetric=(t:RelationshipType)=>!t.directed&&(t.allowAll||t.pairs.some(p=>t.pairs.some(other=>other.leftObjectTypeId===p.rightObjectTypeId)));
async function visibleRows(tx:Executor,objectTypeId:string,recordId:string,definitions:RelationshipType[]){
 const source=await contentAccess().require(objectTypeId,recordId,'read'),model=await modelFor(tx,objectTypeId);
 const workspace=(await sql<{default_language:Language;available_languages:Language[]}>`SELECT default_language,available_languages FROM sys_workspaces WHERE id=${model.workspace_id}::uuid`.execute(tx)).rows[0];
 const user=(await sql<{language:Language|null}>`SELECT language FROM sys_users WHERE id=${contentAccess().actor}`.execute(tx)).rows[0];
 const language=effectiveWorkspaceLanguage(user.language,workspace.available_languages,workspace.default_language);
 const label=(labels:Record<string,string>)=>labels[language]??labels[workspace.default_language]??labels.en??labels.de??Object.values(labels)[0]??'';
 const models=(await sql<{id:string;code:string;technical_name:string;labels:Record<string,string>;classification:{options:{id:string;labels:Record<string,string>}[]}}>`SELECT o.id,o.technical_name,o.labels,o.classification,w.code FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=${model.workspace_id}::uuid AND o.state<>'deleted'`.execute(tx)).rows;
 const selects:RawBuilder<unknown>[]=[];
 for(const target of models){
  const p=await contentAccess().policy(target.id);if(!p.capabilities.read)continue;
  const fields=(await sql<{technical_name:string;kind:string;config:{options?:{id:string;labels:Record<string,string>}[]}}>`SELECT technical_name,kind,config FROM sys_fields WHERE object_type_id=${target.id}::uuid AND state<>'deleted'`.execute(tx)).rows;
  const display=async(name:string)=>{
   const field=fields.find(f=>f.technical_name===name);if(!field)return sql`NULL::text`;
   const value=await contentAccess().fieldValueByName(target.id,name,'r');
   const options=['type','status','category'].includes(name)?target.classification.options:field.config.options;
   if(!options)return value;
   const cases=options.map(o=>sql`WHEN ${o.id}::uuid THEN ${label(o.labels)}`);
   if(!cases.length)return sql`NULL::text`;
   return ['multiple_choice','tree_choice','category'].includes(field.kind)?sql`(SELECT string_agg(CASE choice ${sql.join(cases,sql` `)} ELSE NULL END,', ' ORDER BY choice) FROM unnest(${value}) choice)`:sql`CASE ${value} ${sql.join(cases,sql` `)} ELSE NULL END`;
  };
  const extras=sql`${await display('job_title')} AS "jobTitle",${await display('department')} AS department,${await display('function')} AS function,${await display('type')} AS type,${await display('status')} AS status,${await display('category')} AS category`;
  const side=sql`CASE WHEN e.left_object_type_id=${objectTypeId}::uuid AND e.left_record_id=${recordId}::uuid THEN 'left' ELSE 'right' END`;
  const relationCases=definitions.flatMap(t=>[sql`WHEN e.relationship_type_id=${t.id}::uuid THEN CASE WHEN ${isSymmetric(t)} OR ${side}='left' THEN ${label(t.leftLabels)} ELSE ${label(t.rightLabels)} END`]);
  const virtualSide=sql`CASE WHEN e.relationship_type_id=ANY(${definitions.filter(isSymmetric).map(t=>t.id)}::uuid[]) THEN 'left' ELSE ${side} END`;
  const own=sql`((e.left_object_type_id=${objectTypeId}::uuid AND e.left_record_id=${recordId}::uuid AND e.right_object_type_id=${target.id}::uuid AND r.id=e.right_record_id) OR (e.right_object_type_id=${objectTypeId}::uuid AND e.right_record_id=${recordId}::uuid AND e.left_object_type_id=${target.id}::uuid AND r.id=e.left_record_id))`;
  selects.push(sql`SELECT e.id,e.relationship_type_id AS "relationshipTypeId",${virtualSide} AS side,${target.id}::uuid AS "objectTypeId",r.id AS "recordId",${await contentAccess().keywordValue(target.id,'r')} AS keyword,${label(target.labels)}::text AS object,CASE ${sql.join(relationCases,sql` `)} ELSE '' END AS relationship,${extras} FROM sys_relationships e JOIN ${sql.table(`${target.code}_${target.technical_name}`)} r ON ${own} WHERE e.workspace_id=${model.workspace_id}::uuid AND ${p.predicate('r')}`);
 }
 return {source,model,rows:selects.length?sql.join(selects,sql` UNION ALL `):sql`SELECT NULL::uuid AS id,NULL::uuid AS "relationshipTypeId",NULL::text AS side,NULL::uuid AS "objectTypeId",NULL::uuid AS "recordId",NULL::text AS keyword,NULL::text AS object,NULL::text AS relationship,NULL::text AS "jobTitle",NULL::text AS department,NULL::text AS function,NULL::text AS type,NULL::text AS status,NULL::text AS category WHERE false`};
}

/** Counts and sorting use current target rights before hydration or paging. */
export async function relationshipPage(tx:Executor,args:RelationshipPageInput){
 const model=await modelFor(tx,args.objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id);
 const {rows}=await visibleRows(tx,args.objectTypeId,args.recordId,definitions);
 const selected=args.entries?.length?sql.join(args.entries.map(e=>sql`("relationshipTypeId"=${e.relationshipTypeId}::uuid AND side=${e.side})`),sql` OR `):args.entries?sql`false`:sql`true`;
 const excluded=args.exclude?.length?sql.join(args.exclude.map(e=>sql`("relationshipTypeId"=${e.relationshipTypeId}::uuid AND side=${e.side} AND "objectTypeId"=${e.objectTypeId}::uuid AND "recordId"=${e.recordId}::uuid)`),sql` OR `):sql`false`;
 const where=sql`NOT (${excluded}) AND (${selected}) AND ${args.targetObjectTypeId?sql`"objectTypeId"=${args.targetObjectTypeId}::uuid`:sql`true`} AND ${sql.join(args.query.trim().split(/\s+/).filter(Boolean).map(term=>sql`strpos(lower(concat_ws(' ',keyword,object,relationship,"jobTitle",department,function,type,status,category)),lower(${term}))>0`).concat([sql`true`]),sql` AND `)}`;
 const total=(await sql<{n:number}>`WITH candidates AS (${rows}) SELECT count(*)::int AS n FROM candidates WHERE ${where}`.execute(tx)).rows[0].n;
 const ids=(await sql<{id:string;side:'left'|'right'}>`WITH candidates AS (${rows}) SELECT id,side FROM candidates WHERE ${where} ORDER BY ${sql.ref(args.sortBy)} ${args.sortDirection==='desc'?sql`DESC`:sql`ASC`} NULLS LAST,id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
 const objects=(await sql<{id:string;label:string}>`WITH candidates AS (${rows}) SELECT DISTINCT "objectTypeId" AS id,object AS label FROM candidates ORDER BY label,id`.execute(tx)).rows;
 const pageIds=ids.map(x=>x.id);
 const own=pageIds.length?(await sql<Edge>`SELECT * FROM sys_relationships WHERE id=ANY(${pageIds}::uuid[])`.execute(tx)).rows:[];
 const {edges,attributeProjections}=await projectRelationshipEdges(tx,model.workspace_id,own,definitions),entries=await dossierEntries(tx,edges,args.objectTypeId,args.recordId);
 for(const entry of entries){const edge=edges.find(e=>e.id===entry.id)!;entry.side=ids.find(e=>e.id===entry.id)!.side;entry.record={...entry.record,edgeId:edge.id,edgeVersion:edge.version,attributeValues:edge.attributes,attributeAccess:attributeProjections.get(edge.id)?.access};}
 entries.sort((a,b)=>pageIds.indexOf(a.id)-pageIds.indexOf(b.id));
 return {entries,total,objects,offset:args.offset,limit:args.limit};
}

/** To-many values are paged separately; a metadata response never masquerades as a complete draft. */
export async function relationshipSummary(tx:Executor,objectTypeId:string,recordId?:string):Promise<RecordRelationships>{
 const p=await contentAccess().require(objectTypeId,recordId,recordId?'read':'create'),model=await modelFor(tx,objectTypeId),definitions=await relationshipTypes(tx,model.workspace_id),chain=await primaryChain(tx,model.workspace_id);
 const actual=recordId?(await sql<{id:string;n:number}>`SELECT relationship_type_id AS id,count(*)::int AS n FROM sys_relationships WHERE (left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId}::uuid) OR (right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId}::uuid) GROUP BY relationship_type_id`.execute(tx)).rows:[];
 const rows=recordId?(await visibleRows(tx,objectTypeId,recordId,definitions)).rows:null;
 const counts=rows?(await sql<{id:string;side:string;n:number}>`WITH candidates AS (${rows}) SELECT "relationshipTypeId" AS id,side,count(*)::int AS n FROM candidates GROUP BY "relationshipTypeId",side`.execute(tx)).rows:[];
 const singleSides=definitions.flatMap(d=>[...(d.leftMax===1?[sql`(relationship_type_id=${d.id}::uuid AND left_object_type_id=${objectTypeId}::uuid AND left_record_id=${recordId??null}::uuid)`]:[]),...(d.rightMax===1?[sql`(relationship_type_id=${d.id}::uuid AND right_object_type_id=${objectTypeId}::uuid AND right_record_id=${recordId??null}::uuid)`]:[])]);
 const own=recordId&&singleSides.length?(await sql<Edge>`SELECT * FROM sys_relationships WHERE ${sql.join(singleSides,sql` OR `)}`.execute(tx)).rows:[];
 const {edges,attributeProjections}=await projectRelationshipEdges(tx,model.workspace_id,own,definitions);
 const fields:RecordRelationships['fields']=[];
 for(const definition of definitions.filter(d=>(d.kind!=='primary'||d.active)&&(d.rulesState==='active'||actual.some(a=>a.id===d.id))))for(const side of relationshipSidesForObject(definition,objectTypeId,chain)){
  const total=counts.find(c=>c.id===definition.id&&c.side===side)?.n??0;
  const visibleCount=counts.filter(c=>c.id===definition.id).reduce((n,c)=>n+c.n,0),restricted=(actual.find(a=>a.id===definition.id)?.n??0)>visibleCount;
  const targets=edges.filter(e=>e.definition.id===definition.id).flatMap(e=>{const symmetric=isSymmetric(definition),a=e[side];return symmetric||a.objectTypeId===objectTypeId&&a.recordId===recordId?[{...(symmetric?(e.left.recordId===recordId&&e.left.objectTypeId===objectTypeId?e.right:e.left):e[side==='left'?'right':'left']),edgeId:e.id,edgeVersion:e.version,attributeValues:e.attributes,attributeAccess:attributeProjections.get(e.id)?.access}]:[];});
  fields.push({definition,side,targets,total,paged:Boolean(recordId&&(side==='left'?definition.leftMax:definition.rightMax)!==1),restricted,editable:(recordId?p.recordCapabilities(recordId).edit:p.capabilities.create===true)&&!restricted});
 }
 return {primaryChain:chain,fields,edges,dossier:[]};
}
