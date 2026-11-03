import {conditionColumn} from './relationship-conditions.js';
import { validateRelationshipGraph } from './record-relationships.js';
import { sql } from 'kysely';
import { v7 } from 'uuid';
import { isDeepStrictEqual } from 'node:util';
import type { RelationshipConfiguration, RelationshipType, WorkspaceModule } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

type Journal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => Promise<void>;
const names = new Set(['primary_association', 'general_relation']);
const protectedLabels = new Set(['hauptzuordnung', 'primärverknüpfung', 'allgemeine verknüpfung', 'primary association', 'general relationship']);
export async function installRelationshipSchema(tx: Executor) {
  await sql`CREATE TABLE IF NOT EXISTS sys_workspace_modules(workspace_id uuid NOT NULL REFERENCES sys_workspaces(id),module_key text NOT NULL CHECK(module_key='projects'),enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),PRIMARY KEY(workspace_id,module_key))`.execute(tx);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS sys_object_types_id_workspace_unique ON sys_object_types(id, workspace_id)`.execute(tx);
  await sql`CREATE TABLE IF NOT EXISTS sys_relationship_types (
    id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES sys_workspaces(id), technical_name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('primary','general','custom')), labels jsonb NOT NULL, left_labels jsonb NOT NULL, right_labels jsonb NOT NULL,
    directed boolean NOT NULL, left_min integer NOT NULL CHECK(left_min IN(0,1)), left_max integer CHECK(left_max=1), right_min integer NOT NULL CHECK(right_min IN(0,1)), right_max integer CHECK(right_max=1),
    allow_all boolean NOT NULL, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
    UNIQUE(workspace_id,technical_name), UNIQUE(id,workspace_id),
    CHECK(kind <> 'primary' OR (technical_name='primary_association' AND directed AND left_min=0 AND left_max IS NULL AND right_min=0 AND right_max=1 AND allow_all)),
    CHECK(kind <> 'general' OR (technical_name='general_relation' AND NOT directed AND left_min=0 AND left_max IS NULL AND right_min=0 AND right_max IS NULL AND allow_all AND active)),
    CHECK(kind <> 'custom' OR technical_name NOT IN ('primary_association','general_relation'))
  )`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types ADD COLUMN IF NOT EXISTS rules_state text NOT NULL DEFAULT 'draft' CHECK(rules_state='draft')`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types DROP CONSTRAINT IF EXISTS sys_relationship_types_rules_state_check`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types ADD CONSTRAINT sys_relationship_types_rules_state_check CHECK(rules_state IN ('draft','active'))`.execute(tx);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS sys_relationship_system_kind_unique ON sys_relationship_types(workspace_id,kind) WHERE kind <> 'custom'`.execute(tx);
  await sql`CREATE TABLE IF NOT EXISTS sys_relationship_type_pairs (
    relationship_type_id uuid NOT NULL, workspace_id uuid NOT NULL, left_object_type_id uuid NOT NULL, right_object_type_id uuid NOT NULL,
    PRIMARY KEY(relationship_type_id,left_object_type_id,right_object_type_id),
    FOREIGN KEY(relationship_type_id,workspace_id) REFERENCES sys_relationship_types(id,workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY(left_object_type_id,workspace_id) REFERENCES sys_object_types(id,workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY(right_object_type_id,workspace_id) REFERENCES sys_object_types(id,workspace_id) ON DELETE RESTRICT
  )`.execute(tx);
  await migrateRelationshipScope(tx);
  const workspaces = (await sql<{id:string;created_by:string}>`SELECT id, created_by FROM sys_workspaces`.execute(tx)).rows;
  for (const workspace of workspaces) await installSystemRelationships(tx, workspace.id, workspace.created_by);
}
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
  const rows = (await sql<Omit<RelationshipType,'pairs'>>`SELECT id,workspace_id AS "workspaceId",technical_name AS "technicalName",kind,labels,left_labels AS "leftLabels",right_labels AS "rightLabels",directed,left_min AS "leftMin",left_max AS "leftMax",right_min AS "rightMin",right_max AS "rightMax",allow_all AS "allowAll",active,rules_state AS "rulesState",version,left_applicability AS "leftApplicability",right_applicability AS "rightApplicability" FROM sys_relationship_types WHERE workspace_id=${workspaceId}::uuid ORDER BY kind,technical_name`.execute(tx)).rows;
  const pairs = (await sql<{relationship_type_id:string;leftObjectTypeId:string;rightObjectTypeId:string}>`SELECT relationship_type_id,left_object_type_id AS "leftObjectTypeId",right_object_type_id AS "rightObjectTypeId" FROM sys_relationship_type_pairs WHERE workspace_id=${workspaceId}::uuid ORDER BY left_object_type_id,right_object_type_id`.execute(tx)).rows;
  const used=new Set((await sql<{id:string}>`SELECT DISTINCT COALESCE(new_value->>'relationshipTypeId',old_value->>'relationshipTypeId') AS id FROM sys_journal WHERE workspace_id=${workspaceId}::uuid AND entity_kind='relationship'`.execute(tx)).rows.map(row=>row.id));
  return rows.map(row=>({...row,...(row.kind==='custom'?{pairLocked:used.has(row.id)}:{}),pairs:pairs.filter(pair=>pair.relationship_type_id===row.id).map(({leftObjectTypeId,rightObjectTypeId})=>({leftObjectTypeId,rightObjectTypeId}))}));
}
export async function configureRelationship(tx: Executor, args: {workspaceId:string;technicalName?:string;relationshipTypeId?:string;version?:number;configuration:RelationshipConfiguration}, journal: Journal) {
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
  for (const key of ['labels','leftLabels','rightLabels'] as const) for (const language of new Set([...Object.keys(next[key]),...Object.keys(previous?.[key]??{})])) if (!workspace.label_languages.includes(language) && next[key][language as 'de'|'en']!==previous?.[key][language as 'de'|'en']) throw new AppError(400,'Definition language is unavailable');
  for (const pair of next.pairs) for (const id of [pair.leftObjectTypeId,pair.rightObjectTypeId]) {
    const type=(await sql<{state:string}>`SELECT state FROM sys_object_types WHERE id=${id}::uuid AND workspace_id=${args.workspaceId}::uuid`.execute(tx)).rows[0];
    const retained=previous?.pairs.some(old=>old.leftObjectTypeId===pair.leftObjectTypeId&&old.rightObjectTypeId===pair.rightObjectTypeId);
    if (!type || type.state==='deleted' || (type.state!=='active'&&!retained)) throw new AppError(400,'Relationship objects must belong to workspace and be active');
  }
  const changed=(Object.keys(next) as (keyof RelationshipConfiguration)[]).filter(key=>!previous||!isDeepStrictEqual(previous[key],next[key]));
  if (!changed.length) return previous!;
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
  // The version-1 installer must not read tables introduced by later upgrades.
  return (await sql<{enabled:boolean;version:number}>`SELECT enabled,version FROM sys_workspace_modules WHERE workspace_id=${workspaceId}::uuid AND module_key='projects'`.execute(tx)).rows[0];
}
async function migrateRelationshipScope(tx:Executor) {
  const invalid=(await sql`SELECT t.id FROM sys_relationship_types t LEFT JOIN sys_relationship_type_pairs p ON p.relationship_type_id=t.id WHERE t.kind='custom' GROUP BY t.id HAVING t.allow_all OR count(p.*)<>1`.execute(tx)).rows;
  if(invalid.length)throw new AppError(409,'Resolve legacy custom relationships to exactly one object pair before migration; no data was changed');
  await sql`ALTER TABLE sys_relationship_types DROP CONSTRAINT IF EXISTS sys_relationship_types_check`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types DROP CONSTRAINT IF EXISTS sys_relationship_primary_scope`.execute(tx);
  const hasEdges=(await sql<{name:string|null}>`SELECT to_regclass('sys_relationships')::text AS name`.execute(tx)).rows[0].name;
  const workspaces=(await sql<{id:string;created_by:string}>`SELECT id,created_by FROM sys_workspaces`.execute(tx)).rows;
  for(const ws of workspaces) {
    const used=hasEdges?Boolean((await sql`SELECT 1 FROM sys_relationships e JOIN sys_relationship_types t ON t.id=e.relationship_type_id WHERE e.workspace_id=${ws.id}::uuid AND t.kind='primary' LIMIT 1`.execute(tx)).rows.length):false;
    const module=await ensureProjectsModule(tx,ws.id,ws.created_by,used);
    for(const previous of (await baselineSystemDefinitions(tx,ws.id))) {
      const next={allowAll:true,pairs:[],rightMin:0,active:previous.kind==='general'||module.enabled,rulesState:'active' as const};
      const changed=(Object.keys(next) as (keyof typeof next)[]).filter(key=>!isDeepStrictEqual(previous[key],next[key]));
      if(!changed.length)continue;
      const change=v7();
      await sql`UPDATE sys_relationship_types SET allow_all=true,right_min=0,active=${next.active},rules_state='active',version=version+1 WHERE id=${previous.id}::uuid`.execute(tx);
      await sql`DELETE FROM sys_relationship_type_pairs WHERE relationship_type_id=${previous.id}::uuid`.execute(tx);
      for(const key of changed)await scopeJournal(tx,ws.id,ws.created_by,'relationship_type',previous.id,change,key,previous[key],next[key]);
    }
  }
  await sql`ALTER TABLE sys_relationship_types ADD CONSTRAINT sys_relationship_primary_scope CHECK(kind<>'primary' OR (technical_name='primary_association' AND directed AND left_min=0 AND left_max IS NULL AND right_min=0 AND right_max IS NOT NULL AND right_max=1 AND allow_all))`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types DROP CONSTRAINT IF EXISTS sys_relationship_custom_scope`.execute(tx);
  await sql`ALTER TABLE sys_relationship_types ADD CONSTRAINT sys_relationship_custom_scope CHECK(kind<>'custom' OR NOT allow_all)`.execute(tx);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS sys_relationship_type_single_pair_unique ON sys_relationship_type_pairs(relationship_type_id)`.execute(tx);
}
export async function workspaceModules(tx:Executor,workspaceId:string):Promise<WorkspaceModule[]> {
  if(!(await sql`SELECT 1 FROM sys_workspaces WHERE id=${workspaceId}::uuid`.execute(tx)).rows.length)throw new AppError(404,'Workspace not found');
  return (await sql<WorkspaceModule>`SELECT module_key AS key,enabled,version,(SELECT jsonb_object_agg(role,object_type_id::text) FROM sys_primary_chain_levels l WHERE l.workspace_id=sys_workspace_modules.workspace_id) AS "primaryChain" FROM sys_workspace_modules WHERE workspace_id=${workspaceId}::uuid ORDER BY module_key`.execute(tx)).rows;
}
export async function configureWorkspaceModule(tx:Executor,args:{workspaceId:string;key:'projects';enabled:boolean;version:number},journal:Journal) {
  const previous=(await workspaceModules(tx,args.workspaceId)).find(module=>module.key===args.key);
  if(!previous)throw new AppError(404,'Module not found');
  if(previous.version!==args.version)throw new AppError(409,'Module version conflict');
  if(previous.enabled===args.enabled)return previous;
  const primary=(await relationshipTypes(tx,args.workspaceId)).find(type=>type.kind==='primary')!;
  if(!args.enabled&&(await sql`SELECT 1 FROM sys_relationships WHERE relationship_type_id=${primary.id}::uuid LIMIT 1`.execute(tx)).rows.length)throw new AppError(409,'Remove existing Primary associations before disabling Projects');
  if(args.enabled)await validateRelationshipGraph(tx,{...primary,active:true});
  const change=v7();
  await sql`UPDATE sys_workspace_modules SET enabled=${args.enabled},version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND module_key=${args.key}`.execute(tx);
  await sql`UPDATE sys_relationship_types SET active=${args.enabled},version=version+1 WHERE id=${primary.id}::uuid`.execute(tx);
  await journal('workspace',args.workspaceId,change,'module.projects',previous.enabled,args.enabled);
  await journal('relationship_type',primary.id,change,'active',primary.active,args.enabled);
  return {...previous,enabled:args.enabled,version:previous.version+1};
}

/** Frozen version-1 projection used only by the original schema installer. */
async function baselineSystemDefinitions(tx:Executor,workspaceId:string) {
  const rows=(await sql<RelationshipType>`SELECT id,workspace_id AS "workspaceId",technical_name AS "technicalName",kind,labels,left_labels AS "leftLabels",right_labels AS "rightLabels",directed,left_min AS "leftMin",left_max AS "leftMax",right_min AS "rightMin",right_max AS "rightMax",allow_all AS "allowAll",active,rules_state AS "rulesState",version FROM sys_relationship_types WHERE workspace_id=${workspaceId}::uuid AND kind<>'custom' ORDER BY kind,technical_name`.execute(tx)).rows;
  const pairs=(await sql<{relationship_type_id:string;leftObjectTypeId:string;rightObjectTypeId:string}>`SELECT relationship_type_id,left_object_type_id AS "leftObjectTypeId",right_object_type_id AS "rightObjectTypeId" FROM sys_relationship_type_pairs WHERE workspace_id=${workspaceId}::uuid ORDER BY left_object_type_id,right_object_type_id`.execute(tx)).rows;
  return rows.map(row=>({...row,pairs:pairs.filter(pair=>pair.relationship_type_id===row.id).map(({leftObjectTypeId,rightObjectTypeId})=>({leftObjectTypeId,rightObjectTypeId}))}));
}
