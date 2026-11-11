import {relationshipFieldDefinitions} from './relationship-fields.js';
import {conditionColumn} from './relationship-conditions.js';
import { validateRelationshipGraph } from './record-relationships.js';
import { sql } from 'kysely';
import { v7 } from 'uuid';
import { isDeepStrictEqual } from 'node:util';
import { languageCodes, type RelationshipConfiguration, type RelationshipType, type WorkspaceModule } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

type Journal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => Promise<void>;
const names = new Set(['primary_association', 'general_relation']);
const protectedLabels = new Set(['hauptzuordnung', 'primärverknüpfung', 'allgemeine verknüpfung', 'primary association', 'general relationship']);
export async function installSystemRelationships(tx: Executor, workspaceId: string, actor: string) {
  const module=await ensureProjectsModule(tx,workspaceId,actor,false);
  for (const kind of ['primary','general'] as const) {
    const primary = kind === 'primary', id = v7();
    const config: RelationshipConfiguration = { labels: primary ? {de:'Hauptzuordnung',en:'Primary association'} : {de:'Allgemeine Verknüpfung',en:'General relationship'}, leftLabels: primary ? {de:'Untergeordnete Datensätze',en:'Child records'} : {de:'Verknüpfte Datensätze',en:'Related records'}, rightLabels: primary ? {de:'Übergeordneter Datensatz',en:'Parent record'} : {de:'Verknüpfte Datensätze',en:'Related records'}, directed: primary, leftMin:0,leftMax:null,rightMin:0,rightMax:primary?1:null,allowAll:true,pairs:[],active:primary?module.enabled:true };
    const added = await sql`INSERT INTO sys_relationship_types(id,workspace_id,technical_name,kind,labels,left_labels,right_labels,directed,left_min,left_max,right_min,right_max,allow_all,active,rules_state)
      VALUES(${id}::uuid,${workspaceId}::uuid,${primary?'primary_association':'general_relation'},${kind},${JSON.stringify(config.labels)}::jsonb,${JSON.stringify(config.leftLabels)}::jsonb,${JSON.stringify(config.rightLabels)}::jsonb,${config.directed},0,NULL,0,${config.rightMax},${config.allowAll},${config.active},'active') ON CONFLICT DO NOTHING RETURNING id`.execute(tx);
    if (added.rows.length) await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,${workspaceId}::uuid,'relationship_type',${id}::uuid,'definition',NULL,${JSON.stringify(config)}::jsonb,${actor})`.execute(tx);
  }
}
export async function relationshipTypes(tx: Executor, workspaceId: string): Promise<RelationshipType[]> {
  if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id=${workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404,'Workspace not found');
  const rows = (await sql<Omit<RelationshipType,'pairs'>>`SELECT (SELECT module_key FROM sys_module_relationship_bindings b WHERE b.relationship_type_id=sys_relationship_types.id) AS "moduleKey",EXISTS(SELECT 1 FROM sys_module_relationship_bindings b WHERE b.relationship_type_id=sys_relationship_types.id) AS "isProtected",id,workspace_id AS "workspaceId",technical_name AS "technicalName",kind,labels,left_labels AS "leftLabels",right_labels AS "rightLabels",directed,left_min AS "leftMin",left_max AS "leftMax",right_min AS "rightMin",right_max AS "rightMax",allow_all AS "allowAll",active,rules_state AS "rulesState",version,left_applicability AS "leftApplicability",right_applicability AS "rightApplicability" FROM sys_relationship_types WHERE workspace_id=${workspaceId}::uuid ORDER BY kind,technical_name`.execute(tx)).rows;
  const pairs = (await sql<{relationship_type_id:string;leftObjectTypeId:string;rightObjectTypeId:string}>`SELECT relationship_type_id,left_object_type_id AS "leftObjectTypeId",right_object_type_id AS "rightObjectTypeId" FROM sys_relationship_type_pairs WHERE workspace_id=${workspaceId}::uuid ORDER BY left_object_type_id,right_object_type_id`.execute(tx)).rows;
  const used=new Set((await sql<{id:string}>`SELECT DISTINCT COALESCE(new_value->>'relationshipTypeId',old_value->>'relationshipTypeId') AS id FROM sys_journal WHERE workspace_id=${workspaceId}::uuid AND entity_kind='relationship'`.execute(tx)).rows.map(row=>row.id));
  return Promise.all(rows.map(async row=>({...row,fields:await relationshipFieldDefinitions(tx,row.id),...(row.kind==='custom'?{pairLocked:used.has(row.id)}:{}),pairs:pairs.filter(pair=>pair.relationship_type_id===row.id).map(({leftObjectTypeId,rightObjectTypeId})=>({leftObjectTypeId,rightObjectTypeId}))})));
}
export async function configureRelationship(tx: Executor, args: {workspaceId:string;technicalName?:string;relationshipTypeId?:string;version?:number;configuration:RelationshipConfiguration}, journal: Journal, definitionSource: 'workspace'|'module' = 'workspace') {
  const previous = args.relationshipTypeId ? (await relationshipTypes(tx,args.workspaceId)).find(row=>row.id===args.relationshipTypeId) : undefined;
  if (args.relationshipTypeId && !previous) throw new AppError(404,'Relationship type not found');
  if (previous && previous.version!==args.version) throw new AppError(409,'Relationship version conflict');
  const next = {...structuredClone(args.configuration),leftApplicability:args.configuration.leftApplicability===undefined?previous?.leftApplicability??null:args.configuration.leftApplicability,rightApplicability:args.configuration.rightApplicability===undefined?previous?.rightApplicability??null:args.configuration.rightApplicability};
  if((next.leftApplicability||next.rightApplicability)&&previous?.kind&&previous.kind!=='custom')throw new AppError(400,'System relationships cannot have endpoint conditions');
  if(next.leftApplicability||next.rightApplicability){if(next.allowAll||next.pairs.length!==1)throw new AppError(400,'Endpoint conditions require one object pair');await conditionColumn(tx,next.leftApplicability,next.pairs[0].leftObjectTypeId);await conditionColumn(tx,next.rightApplicability,next.pairs[0].rightObjectTypeId);}
  next.pairs.sort((a,b)=>`${a.leftObjectTypeId}:${a.rightObjectTypeId}`.localeCompare(`${b.leftObjectTypeId}:${b.rightObjectTypeId}`));
  if (previous?.kind==='primary' && (!next.directed||next.leftMin!==0||next.leftMax!==null||next.rightMin!==0||next.rightMax!==1||!next.allowAll||next.pairs.length>0||next.active!==previous.active)) throw new AppError(400,'System relationship semantics are protected');
  if (previous?.kind==='general' && (next.directed||next.leftMin!==0||next.leftMax!==null||next.rightMin!==0||next.rightMax!==null||!next.allowAll||next.pairs.length>0||!next.active)) throw new AppError(400,'System relationship semantics are protected');
  if ((!previous||previous.kind==='custom')&&(next.allowAll||next.pairs.length!==1))throw new AppError(400,'Custom relationships require exactly one object pair');
  if (!previous && (names.has(args.technicalName!) || args.technicalName!.startsWith('sys_'))) throw new AppError(400,'Reserved relationship name');
  if ((!previous || previous.kind==='custom') && Object.values(next.labels).some(label=>protectedLabels.has(label.trim().toLowerCase()))) throw new AppError(400,'Reserved relationship name');
  const workspace = (await sql<{label_languages:string[]}>`SELECT label_languages FROM sys_workspaces WHERE id=${args.workspaceId}::uuid`.execute(tx)).rows[0];
  if (!workspace) throw new AppError(404,'Workspace not found');
  // Module templates retain all installed translations, just like supplied objects/fields.
  // This internal origin is never accepted from API/MCP; authored changes use workspace policy.
  const definitionLanguages: readonly string[] = definitionSource === 'module' ? languageCodes : workspace.label_languages;
  for (const key of ['labels','leftLabels','rightLabels'] as const) for (const language of new Set([...Object.keys(next[key]),...Object.keys(previous?.[key]??{})])) if (!definitionLanguages.includes(language) && next[key][language as 'de'|'en']!==previous?.[key][language as 'de'|'en']) throw new AppError(400,'Definition language is unavailable');
  for (const pair of next.pairs) for (const id of [pair.leftObjectTypeId,pair.rightObjectTypeId]) {
    const type=(await sql<{state:string}>`SELECT state FROM sys_object_types WHERE id=${id}::uuid AND workspace_id=${args.workspaceId}::uuid`.execute(tx)).rows[0];
    const retained=previous?.pairs.some(old=>old.leftObjectTypeId===pair.leftObjectTypeId&&old.rightObjectTypeId===pair.rightObjectTypeId);
    if (!type || type.state==='deleted' || (type.state!=='active'&&!retained)) throw new AppError(400,'Relationship objects must belong to workspace and be active');
  }
  const changed=(Object.keys(next) as (keyof RelationshipConfiguration)[]).filter(key=>!previous||!isDeepStrictEqual(previous[key],next[key]));
  if (!changed.length) return previous!;
  if(previous?.isProtected&&changed.some(key=>!['labels','leftLabels','rightLabels'].includes(key)))throw new AppError(403,'Module relationship structure is protected');
  if(previous?.kind==='custom'&&previous.pairLocked&&!isDeepStrictEqual(previous.pairs,next.pairs))throw new AppError(409,'Used object pair is fixed');
  if (previous?.rulesState==='active') {
    if (previous.directed!==next.directed && (await sql`SELECT 1 FROM sys_relationship_journal_endpoints ep JOIN sys_journal j ON j.id=ep.journal_id WHERE COALESCE(j.new_value->>'relationshipTypeId',j.old_value->>'relationshipTypeId')=${previous.id} LIMIT 1`.execute(tx)).rows.length) throw new AppError(409,'Used relationship direction is fixed');
    await validateRelationshipGraph(tx,{...previous,...next});
  }
  const id=previous?.id??v7(), change=v7();
  if (!previous) await sql`INSERT INTO sys_relationship_types(id,workspace_id,technical_name,kind,labels,left_labels,right_labels,directed,left_min,left_max,right_min,right_max,allow_all,active) VALUES(${id}::uuid,${args.workspaceId}::uuid,${args.technicalName!},'custom',${JSON.stringify(next.labels)}::jsonb,${JSON.stringify(next.leftLabels)}::jsonb,${JSON.stringify(next.rightLabels)}::jsonb,${next.directed},${next.leftMin},${next.leftMax},${next.rightMin},${next.rightMax},${next.allowAll},${next.active})`.execute(tx);
  else await sql`UPDATE sys_relationship_types SET labels=${JSON.stringify(next.labels)}::jsonb,left_labels=${JSON.stringify(next.leftLabels)}::jsonb,right_labels=${JSON.stringify(next.rightLabels)}::jsonb,directed=${next.directed},left_min=${next.leftMin},left_max=${next.leftMax},right_min=${next.rightMin},right_max=${next.rightMax},allow_all=${next.allowAll},active=${next.active},version=version+1 WHERE id=${id}::uuid`.execute(tx);
  await sql`DELETE FROM sys_relationship_type_pairs WHERE relationship_type_id=${id}::uuid`.execute(tx);
  for (const pair of next.pairs) await sql`INSERT INTO sys_relationship_type_pairs VALUES(${id}::uuid,${args.workspaceId}::uuid,${pair.leftObjectTypeId}::uuid,${pair.rightObjectTypeId}::uuid)`.execute(tx);
  await sql`UPDATE sys_relationship_types SET left_applicability=${JSON.stringify(next.leftApplicability)}::jsonb,right_applicability=${JSON.stringify(next.rightApplicability)}::jsonb WHERE id=${id}::uuid`.execute(tx);
  for(const key of changed) await journal('relationship_type',id,change,key,previous?.[key]??null,next[key]);
  return (await relationshipTypes(tx,args.workspaceId)).find(row=>row.id===id)!;
}

async function scopeJournal(tx:Executor,workspaceId:string,actor:string,kind:string,id:string,change:string,key:string,before:unknown,after:unknown) {
  await sql`INSERT INTO sys_journal(id,change_id,workspace_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${change}::uuid,${workspaceId}::uuid,${kind},${id}::uuid,${key},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${actor})`.execute(tx);
}
async function ensureProjectsModule(tx:Executor,workspaceId:string,actor:string,enabled:boolean) {
  const added=(await sql`INSERT INTO sys_workspace_modules(workspace_id,module_key,enabled) VALUES(${workspaceId}::uuid,'projects',${enabled}) ON CONFLICT DO NOTHING RETURNING workspace_id`.execute(tx)).rows;
  if(added.length)await scopeJournal(tx,workspaceId,actor,'workspace',workspaceId,v7(),'module.projects',null,enabled);
  return (await sql<{enabled:boolean;version:number}>`SELECT enabled,version FROM sys_workspace_modules WHERE workspace_id=${workspaceId}::uuid AND module_key='projects'`.execute(tx)).rows[0];
}
export async function workspaceModules(tx:Executor,workspaceId:string):Promise<WorkspaceModule[]> {
  if(!(await sql`SELECT 1 FROM sys_workspaces WHERE id=${workspaceId}::uuid`.execute(tx)).rows.length)throw new AppError(404,'Workspace not found');
  return (await sql<WorkspaceModule>`SELECT c.template_version AS "templateVersion",COALESCE((SELECT min(template_version) FROM sys_module_contributions c2 WHERE c2.workspace_id=m.workspace_id AND c2.module_key=m.module_key),0) AS "installedVersion",m.module_key AS key,c.labels,c.description,c.available,c.objects,m.enabled,m.version,CASE WHEN m.module_key='projects' THEN (SELECT jsonb_object_agg(object_key,object_type_id::text) FROM sys_module_object_bindings l WHERE l.workspace_id=m.workspace_id AND l.object_key IN('contact','project','case') HAVING count(*)=3) ELSE NULL END AS "primaryChain" FROM sys_workspace_modules m JOIN sys_modules c ON c.key=m.module_key WHERE m.workspace_id=${workspaceId}::uuid ORDER BY c.position`.execute(tx)).rows;
}
export async function configureWorkspaceModule(tx:Executor,args:{workspaceId:string;key:WorkspaceModule['key'];enabled:boolean;version:number},journal:Journal,install:()=>Promise<import('@xobject/contracts').PrimaryChain>) {
  const previous=(await workspaceModules(tx,args.workspaceId)).find(module=>module.key===args.key);
  if(!previous)throw new AppError(404,'Module not found');
  if(!previous.available)throw new AppError(409,'Module is not implemented yet');
  if(previous.version!==args.version)throw new AppError(409,'Module version conflict');
  if(previous.enabled===args.enabled&&(!args.enabled||previous.installedVersion===previous.templateVersion))return previous;
  if(previous.enabled&&args.enabled){
    if(previous.installedVersion>previous.templateVersion)throw new AppError(409,'Module template downgrade is not supported');
    await install();await reconcileModuleDefinitions(tx,args.workspaceId,journal);
    await sql`UPDATE sys_workspace_modules SET version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND module_key=${args.key}`.execute(tx);
    await journal('workspace',args.workspaceId,v7(),`module.${args.key}.template_version`,previous.installedVersion,previous.templateVersion);
    return (await workspaceModules(tx,args.workspaceId)).find(m=>m.key===args.key)!;
  }
  if(args.key!=='projects'){
    if(args.enabled)await install();
    await sql`UPDATE sys_workspace_modules SET enabled=${args.enabled},version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND module_key=${args.key}`.execute(tx);
    await reconcileModuleDefinitions(tx,args.workspaceId,journal);
    await journal('workspace',args.workspaceId,v7(),`module.${args.key}`,previous.enabled,args.enabled);
    return (await workspaceModules(tx,args.workspaceId)).find(m=>m.key===args.key)!;
  }
  const primary=(await relationshipTypes(tx,args.workspaceId)).find(type=>type.kind==='primary')!;
  if(!args.enabled&&(await sql`SELECT 1 FROM sys_relationships WHERE relationship_type_id=${primary.id}::uuid LIMIT 1`.execute(tx)).rows.length)throw new AppError(409,'Remove existing Primary associations before disabling Projects');
  if(!args.enabled&&(await sql`SELECT 1 FROM sys_object_types WHERE workspace_id=${args.workspaceId}::uuid AND state<>'deleted' AND (primary_requirements->>'associationRequired'='true' OR jsonb_array_length(primary_requirements->'requiredLevels')>0) LIMIT 1`.execute(tx)).rows.length)throw new AppError(409,'Clear Primary requirements before disabling Projects');
  const chain=args.enabled?await install():previous.primaryChain;
  await sql`UPDATE sys_workspace_modules SET enabled=${args.enabled},version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND module_key=${args.key}`.execute(tx);
  await reconcileModuleDefinitions(tx,args.workspaceId,journal);
  if(args.enabled)await validateRelationshipGraph(tx,{...primary,active:true});
  const change=v7();

  await sql`UPDATE sys_relationship_types SET active=${args.enabled},version=version+1 WHERE id=${primary.id}::uuid`.execute(tx);
  await journal('workspace',args.workspaceId,change,'module.projects',previous.enabled,args.enabled);
  await journal('relationship_type',primary.id,change,'active',primary.active,args.enabled);
  return (await workspaceModules(tx,args.workspaceId)).find(m=>m.key===args.key)!;
}

/** Contributions retain identity/data/layouts; effective availability follows enabled contributors. */
async function reconcileModuleDefinitions(tx:Executor,workspace:string,journal:Journal){
 const change=v7();
 const objects=(await sql<{id:string;state:string;enabled:boolean}>`SELECT o.id,o.state,bool_or(m.enabled) AS enabled FROM sys_object_types o JOIN sys_module_contributions c ON c.object_type_id=o.id JOIN sys_workspace_modules m ON m.workspace_id=c.workspace_id AND m.module_key=c.module_key WHERE c.workspace_id=${workspace}::uuid GROUP BY o.id`.execute(tx)).rows;
 for(const object of objects){const next=object.enabled?'active':'inactive';if(object.state!==next){await sql`UPDATE sys_object_types SET state=${next},version=version+1 WHERE id=${object.id}::uuid`.execute(tx);await journal('object_type',object.id,change,'state',object.state,next);}}
 for(const relationship of await relationshipTypes(tx,workspace)){
  if(!relationship.moduleKey)continue;
  const next=relationship.pairs.every(pair=>[pair.leftObjectTypeId,pair.rightObjectTypeId].every(id=>objects.find(o=>o.id===id)?.enabled));
  if(relationship.active!==next){if(next)await validateRelationshipGraph(tx,{...relationship,active:true});await sql`UPDATE sys_relationship_types SET active=${next},version=version+1 WHERE id=${relationship.id}::uuid`.execute(tx);await journal('relationship_type',relationship.id,change,'active',relationship.active,next);}
 }
}
