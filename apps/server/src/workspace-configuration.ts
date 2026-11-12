import { sql } from 'kysely';
import { v7 } from 'uuid';
import { isDeepStrictEqual } from 'node:util';
import type { WorkspaceGroup, WorkspaceLanguages, Language, RegionalSettings } from '@xobject/contracts';
import type { Executor } from './database.js';
import { AppError } from './errors.js';

export type ConfigurationJournal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => Promise<void>;
export async function configureWorkspaceLanguages(tx: Executor, args: WorkspaceLanguages & { workspaceId: string; version: number; timeZone?: string; regional?: RegionalSettings }, journal: ConfigurationJournal) {
  const before = (await sql<{ default_language: Language; available_languages: Language[]; label_languages: Language[]; language_version: number; time_zone: string; regional: RegionalSettings }>`SELECT default_language, available_languages, label_languages, language_version, time_zone, regional FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid FOR UPDATE`.execute(tx)).rows[0];
  if (!before) throw new AppError(404, 'Workspace not found');
  if (before.language_version !== args.version) throw new AppError(409,'Workspace language version conflict',{code:"version_conflict"});
  const next = { regional: args.regional ?? before.regional, time_zone: args.timeZone ?? before.time_zone, default_language: args.defaultLanguage, available_languages: [...args.availableLanguages].sort(), label_languages: [...args.labelLanguages].sort() };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(key => !isDeepStrictEqual(before[key], next[key]));
  const version = before.language_version + (changed.length ? 1 : 0);
  if (changed.length) {
    await sql`UPDATE sys_workspaces SET regional = ${JSON.stringify(next.regional)}::jsonb, time_zone = ${next.time_zone}, default_language = ${next.default_language}, available_languages = ${next.available_languages}::text[], label_languages = ${next.label_languages}::text[], language_version = ${version} WHERE id = ${args.workspaceId}::uuid`.execute(tx);
    const change = v7();
    for (const key of changed) {
      if (key === 'regional') { for (const property of Object.keys(next.regional) as (keyof RegionalSettings)[]) if (before.regional[property] !== next.regional[property]) await journal('workspace', args.workspaceId, change, `regional.${property}`, before.regional[property], next.regional[property]); }
      else await journal('workspace', args.workspaceId, change, key, before[key], next[key]);
    }
  }
  return { workspaceId: args.workspaceId, regional: next.regional, timeZone: next.time_zone, defaultLanguage: next.default_language, availableLanguages: next.available_languages, labelLanguages: next.label_languages, version };
}
export async function workspaceGroups(tx: Executor, workspaceId: string): Promise<WorkspaceGroup[]> {
  if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
  const result = (await sql<WorkspaceGroup>`SELECT g.id, g.workspace_id AS "workspaceId", g.name, g.active, g.version FROM sys_groups g LEFT JOIN sys_group_members m ON m.group_id = g.id WHERE g.workspace_id = ${workspaceId}::uuid GROUP BY g.id ORDER BY g.name, g.id`.execute(tx)).rows;
  for(const group of result)group.members=(await sql<import('@xobject/contracts').GradedMember>`SELECT 'user' AS kind,user_id AS id,level FROM sys_group_members WHERE group_id=${group.id}::uuid UNION ALL SELECT 'group',member_group_id::text,level FROM sys_group_nesting WHERE group_id=${group.id}::uuid ORDER BY kind,id`.execute(tx)).rows;
  return result;
}
export async function createWorkspaceGroup(tx:Executor,args:{workspaceId:string;name:string},journal:ConfigurationJournal):Promise<WorkspaceGroup>{
 const id=v7(),change=v7();await sql`INSERT INTO sys_groups(id,workspace_id,name) VALUES(${id}::uuid,${args.workspaceId}::uuid,${args.name})`.execute(tx);
 await journal('group',id,change,'name',null,args.name);return (await workspaceGroups(tx,args.workspaceId)).find(g=>g.id===id)!;
}
export async function configureGroup(tx:Executor,args:{workspaceId:string;groupId:string;version:number;name?:string;active?:boolean},journal:ConfigurationJournal):Promise<WorkspaceGroup>{
 const before=(await workspaceGroups(tx,args.workspaceId)).find(g=>g.id===args.groupId);if(!before)throw new AppError(404,'Group not found');if(before.version!==args.version)throw new AppError(409,'Group version conflict',{code:"version_conflict"});
 const name=args.name??before.name,active=args.active??before.active;
 if(name!==before.name||active!==before.active){const change=v7();await sql`UPDATE sys_groups SET name=${name},active=${active},version=version+1 WHERE id=${before.id}::uuid`.execute(tx);
 if(name!==before.name)await journal('group',before.id,change,'name',before.name,name);if(active!==before.active)await journal('group',before.id,change,'active',before.active,active);}
 return (await workspaceGroups(tx,args.workspaceId)).find(g=>g.id===args.groupId)!;
}

/** Inactive definition languages remain stored, but cannot be silently changed through API/MCP. */
export async function validateDefinitionLanguages(tx: Executor, operation: string, args: Record<string, unknown>) {
  if (!['add_standard_field','configure_object_settings','create_object_type', 'create_field', 'configure_field', 'set_labels', 'configure_classification'].includes(operation)) return;
  let workspaceId = args.workspaceId as string | undefined;
  let previous: { labels?: Record<string, string>; config?: { options?: { id: string; labels: Record<string, string> }[] }; classification?: { options?: { id: string; labels: Record<string, string> }[] } } | undefined;
  if (operation === 'configure_field' || (operation === 'set_labels' && args.kind === 'field')) {
    const row = (await sql<typeof previous & { workspace_id: string }>`SELECT f.labels, f.config, f.input_rules, COALESCE(o.workspace_id,r.workspace_id) AS workspace_id FROM sys_fields f LEFT JOIN sys_object_types o ON o.id = f.object_type_id LEFT JOIN sys_relationship_types r ON r.id=f.relationship_type_id WHERE f.id = ${args.fieldId ?? args.id}::uuid`.execute(tx)).rows[0];
    previous = row; workspaceId = row?.workspace_id;
  } else if (args.objectTypeId || (operation === 'set_labels' && args.kind === 'object_type')) {
    const row = (await sql<typeof previous & { workspace_id: string }>`SELECT labels, classification, workspace_id FROM sys_object_types WHERE id = ${args.objectTypeId ?? args.id}::uuid`.execute(tx)).rows[0];
    if (operation !== 'create_field') previous = row;
    workspaceId = row?.workspace_id;
  }
  if(!workspaceId&&args.relationshipTypeId)workspaceId=(await sql<{workspace_id:string}>`SELECT workspace_id FROM sys_relationship_types WHERE id=${args.relationshipTypeId}::uuid`.execute(tx)).rows[0]?.workspace_id;
  if (!workspaceId) return; // Existing operations retain their precise not-found checks.
  const workspace = (await sql<{ label_languages: string[] }>`SELECT label_languages FROM sys_workspaces WHERE id = ${workspaceId}::uuid`.execute(tx)).rows[0];
  if (!workspace) return;
  const validate = (labels: Record<string, string>, old: Record<string, string> = {}) => {
    for (const code of new Set([...Object.keys(labels), ...Object.keys(old)])) if (!workspace.label_languages.includes(code) && labels[code] !== old[code]) throw new AppError(400,'Definition language is unavailable',{code:"definitionLanguageUnavailable"});
  };
  if(args.inputRules){const rules=args.inputRules as {description:Record<string,string>;helpText:Record<string,string>};const old=(previous as {input_rules?:typeof rules})?.input_rules;validate(rules.description,old?.description);validate(rules.helpText,old?.helpText);}
  if (args.labels) validate(args.labels as Record<string, string>, previous?.labels);
  const config = args.config as { options?: { id: string; labels: Record<string, string> }[] } | undefined;
  const oldOptions = previous?.config?.options ?? previous?.classification?.options ?? [];
  for (const option of config?.options ?? []) validate(option.labels, oldOptions.find(old => old.id === option.id)?.labels);
}
