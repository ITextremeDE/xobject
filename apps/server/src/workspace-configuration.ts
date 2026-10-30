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
  if (before.language_version !== args.version) throw new AppError(409, 'Workspace language version conflict');
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
  return (await sql<WorkspaceGroup>`SELECT g.id, g.workspace_id AS "workspaceId", g.name, g.active, g.version, COALESCE(array_agg(m.user_id ORDER BY m.user_id) FILTER (WHERE m.user_id IS NOT NULL), ARRAY[]::text[]) AS "memberIds" FROM sys_groups g LEFT JOIN sys_group_members m ON m.group_id = g.id WHERE g.workspace_id = ${workspaceId}::uuid GROUP BY g.id ORDER BY g.name, g.id`.execute(tx)).rows;
}
async function validateGroupMembers(tx: Executor, workspaceId: string, members: string[]) {
  for (const id of members) if (!(await sql`SELECT 1 FROM sys_users u WHERE u.id = ${id} AND (u.is_admin OR EXISTS (SELECT 1 FROM sys_workspace_members m WHERE m.user_id = u.id AND m.workspace_id = ${workspaceId}::uuid))`.execute(tx)).rows.length) throw new AppError(400, 'Group member must belong to workspace');
}
export async function createWorkspaceGroup(tx: Executor, args: { workspaceId: string; name: string; memberIds?: string[] }, journal: ConfigurationJournal) {
  if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
  await validateGroupMembers(tx, args.workspaceId, args.memberIds ?? []);
  const id = v7(), change = v7();
  await sql`INSERT INTO sys_groups (id, workspace_id, name) VALUES (${id}::uuid, ${args.workspaceId}::uuid, ${args.name})`.execute(tx);
  await journal('group', id, change, 'name', null, args.name);
  for (const userId of args.memberIds ?? []) {
    await sql`INSERT INTO sys_group_members (group_id, user_id) VALUES (${id}::uuid, ${userId})`.execute(tx);
    await journal('group', id, change, `member:${userId}`, false, true);
  }
  return { id };
}
export async function configureGroup(tx: Executor, args: { workspaceId: string; groupId: string; version: number; name?: string; active?: boolean; memberIds?: string[] }, journal: ConfigurationJournal): Promise<WorkspaceGroup> {
  const before = (await workspaceGroups(tx, args.workspaceId)).find(group => group.id === args.groupId);
  if (!before) throw new AppError(404, 'Group not found in workspace');
  if (before.version !== args.version) throw new AppError(409, 'Group version conflict');
  const name = args.name ?? before.name;
  const active = args.active ?? before.active;
  const members = args.memberIds ? [...args.memberIds].sort() : before.memberIds;
  if (args.memberIds && !before.active) throw new AppError(400, 'Group is inactive');
  if (args.memberIds) await validateGroupMembers(tx, args.workspaceId, members);
  const changed = name !== before.name || active !== before.active || !isDeepStrictEqual(members, before.memberIds);
  if (changed) {
    const change = v7();
    await sql`UPDATE sys_groups SET name = ${name}, active = ${active}, version = version + 1 WHERE id = ${args.groupId}::uuid`.execute(tx);
    if (name !== before.name) await journal('group', before.id, change, 'name', before.name, name);
    if (active !== before.active) await journal('group', before.id, change, 'active', before.active, active);
    for (const id of new Set([...before.memberIds, ...members])) {
      const was = before.memberIds.includes(id), now = members.includes(id);
      if (was === now) continue;
      if (now) await sql`INSERT INTO sys_group_members (group_id, user_id) VALUES (${before.id}::uuid, ${id})`.execute(tx);
      else await sql`DELETE FROM sys_group_members WHERE group_id = ${before.id}::uuid AND user_id = ${id}`.execute(tx);
      await journal('group', before.id, change, `member:${id}`, was, now);
    }
  }
  return { ...before, name, active, memberIds: members, version: before.version + (changed ? 1 : 0) };
}

/** Inactive definition languages remain stored, but cannot be silently changed through API/MCP. */
export async function validateDefinitionLanguages(tx: Executor, operation: string, args: Record<string, unknown>) {
  if (!['create_object_type', 'create_field', 'configure_field', 'set_labels', 'configure_classification'].includes(operation)) return;
  let workspaceId = args.workspaceId as string | undefined;
  let previous: { labels?: Record<string, string>; config?: { options?: { id: string; labels: Record<string, string> }[] }; classification?: { options?: { id: string; labels: Record<string, string> }[] } } | undefined;
  if (operation === 'configure_field' || (operation === 'set_labels' && args.kind === 'field')) {
    const row = (await sql<typeof previous & { workspace_id: string }>`SELECT f.labels, f.config, o.workspace_id FROM sys_fields f JOIN sys_object_types o ON o.id = f.object_type_id WHERE f.id = ${args.fieldId ?? args.id}::uuid`.execute(tx)).rows[0];
    previous = row; workspaceId = row?.workspace_id;
  } else if (args.objectTypeId || (operation === 'set_labels' && args.kind === 'object_type')) {
    const row = (await sql<typeof previous & { workspace_id: string }>`SELECT labels, classification, workspace_id FROM sys_object_types WHERE id = ${args.objectTypeId ?? args.id}::uuid`.execute(tx)).rows[0];
    if (operation !== 'create_field') previous = row;
    workspaceId = row?.workspace_id;
  }
  if (!workspaceId) return; // Existing operations retain their precise not-found checks.
  const workspace = (await sql<{ label_languages: string[] }>`SELECT label_languages FROM sys_workspaces WHERE id = ${workspaceId}::uuid`.execute(tx)).rows[0];
  if (!workspace) return;
  const validate = (labels: Record<string, string>, old: Record<string, string> = {}) => {
    for (const code of new Set([...Object.keys(labels), ...Object.keys(old)])) if (!workspace.label_languages.includes(code) && labels[code] !== old[code]) throw new AppError(400, 'Definition language is unavailable');
  };
  if (args.labels) validate(args.labels as Record<string, string>, previous?.labels);
  const config = args.config as { options?: { id: string; labels: Record<string, string> }[] } | undefined;
  const oldOptions = previous?.config?.options ?? previous?.classification?.options ?? [];
  for (const option of config?.options ?? []) validate(option.labels, oldOptions.find(old => old.id === option.id)?.labels);
}
