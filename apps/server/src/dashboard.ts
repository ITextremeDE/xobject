import { sql, type RawBuilder } from 'kysely';
import type { Executor } from './database.js';
import type { z } from 'zod';
import { schemas, effectiveTimeZone, effectiveWorkspaceLanguage, type Language } from '@xobject/contracts';
import { AppError } from './errors.js';

/** Project each heterogeneous table into the same fixed, typed standard columns. */
async function workspaceRows(tx: Executor, workspaceId: string, actor: string) {
  const workspace = (await sql<{ code: string; default_language: Language; available_languages: Language[]; time_zone: string }>`SELECT code, default_language, available_languages, time_zone FROM sys_workspaces WHERE id = ${workspaceId}::uuid`.execute(tx)).rows[0];
  if (!workspace) throw new AppError(404, 'Workspace not found');
  const user = (await sql<{ language: Language | null; time_zone: string | null }>`SELECT language, time_zone FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
  const language = effectiveWorkspaceLanguage(user.language, workspace.available_languages, workspace.default_language);
  const types = (await sql<{ id: string; technical_name: string; labels: Record<string, string>; classification: { options: { id: string; labels: Record<string, string> }[] } }>`SELECT id, technical_name, labels, classification FROM sys_object_types WHERE workspace_id = ${workspaceId}::uuid AND state = 'active' ORDER BY technical_name`.execute(tx)).rows;
  const label = (labels: Record<string, string>) => [language, workspace.default_language, 'en', 'de', 'und'].map(key => labels[key]).find(Boolean) ?? Object.values(labels)[0] ?? '';
  const selects: RawBuilder<unknown>[] = [];
  for (const type of types) {
    const fields = (await sql<{ technical_name: string }>`SELECT technical_name FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state = 'active'`.execute(tx)).rows;
    const has = (name: string) => fields.some(field => field.technical_name === name);
    const choice = (kind: string) => {
      if (!has(kind)) return sql`NULL::text`;
      const cases = type.classification.options.map(option => sql`WHEN ${option.id}::uuid THEN ${label(option.labels)}`);
      if (!cases.length) return sql`NULL::text`;
      return kind === 'category' ? sql`(SELECT string_agg(CASE option_id ${sql.join(cases, sql` `)} ELSE option_id::text END, ', ' ORDER BY position) FROM unnest(r.category) WITH ORDINALITY AS choices(option_id, position))` : sql`CASE ${sql.ref(`r.${kind}`)} ${sql.join(cases, sql` `)} ELSE ${sql.ref(`r.${kind}`)}::text END`;
    };
    selects.push(sql`SELECT r.id, ${type.id}::uuid AS "objectTypeId", ${type.technical_name}::text AS "objectTechnicalName", ${label(type.labels)}::text AS "objectLabel", ${has('keyword') ? sql`r.keyword` : sql`NULL::text`} AS keyword, ${choice('type')} AS type, ${choice('status')} AS status, ${choice('category')} AS category, r.created_at, r.updated_at, r.created_by, r.updated_by, creator.name AS "createdByName", editor.name AS "updatedByName", r.version FROM ${sql.table(`${workspace.code}_${type.technical_name}`)} r LEFT JOIN sys_users creator ON creator.id = r.created_by LEFT JOIN sys_users editor ON editor.id = r.updated_by`);
  }
  const rows = selects.length ? sql.join(selects, sql` UNION ALL `) : sql`SELECT NULL::uuid AS id, NULL::uuid AS "objectTypeId", NULL::text AS "objectTechnicalName", NULL::text AS "objectLabel", NULL::text AS keyword, NULL::text AS type, NULL::text AS status, NULL::text AS category, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at, NULL::text AS created_by, NULL::text AS updated_by, NULL::text AS "createdByName", NULL::text AS "updatedByName", NULL::integer AS version WHERE false`;
  return { rows, types, timeZone: effectiveTimeZone(user.time_zone, workspace.time_zone) };
}
export async function listWorkspaceRecords(tx: Executor, args: z.output<typeof schemas.list_workspace_records>, actor: string) {
  const { rows } = await workspaceRows(tx, args.workspaceId, actor);
  const filter = sql`${args.objectTypeId ? sql`"objectTypeId" = ${args.objectTypeId}::uuid` : sql`true`} AND (position(lower(${args.query}) in lower(COALESCE(keyword, id::text))) > 0)`;
  const total = (await sql<{ total: number }>`WITH records AS (${rows}) SELECT count(*)::integer AS total FROM records WHERE ${filter}`.execute(tx)).rows[0].total;
  const records = (await sql`WITH records AS (${rows}) SELECT * FROM records WHERE ${filter} ORDER BY ${sql.ref(args.sortBy)} ${args.sortDirection === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
  return { records, total, limit: args.limit, offset: args.offset };
}
export async function workspaceDashboard(tx: Executor, args: z.output<typeof schemas.get_workspace_dashboard>, actor: string) {
  const { rows, types, timeZone } = await workspaceRows(tx, args.workspaceId, actor);
  const stats = (await sql<{ total: number; created30: number; updated7: number }>`WITH records AS (${rows}) SELECT count(*)::integer AS total, count(*) FILTER (WHERE created_at >= now() - interval '30 days')::integer AS "created30", count(*) FILTER (WHERE updated_at > created_at AND updated_at >= now() - interval '7 days')::integer AS "updated7" FROM records`.execute(tx)).rows[0];
  const activity = (await sql`WITH records AS (${rows}), days AS (SELECT generate_series((now() AT TIME ZONE ${timeZone})::date - (${args.days}::integer - 1), (now() AT TIME ZONE ${timeZone})::date, interval '1 day')::date AS day), creations AS (SELECT (created_at AT TIME ZONE ${timeZone})::date AS day, count(*)::integer AS count FROM records GROUP BY 1), edits AS (SELECT (j.created_at AT TIME ZONE ${timeZone})::date AS day, count(DISTINCT j.entity_id)::integer AS count FROM sys_journal j JOIN records r ON r.id = j.entity_id AND r."objectTypeId" = j.object_type_id WHERE j.workspace_id = ${args.workspaceId}::uuid AND j.entity_kind = 'record' AND j.created_at > r.created_at GROUP BY 1) SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(c.count, 0)::integer AS created, COALESCE(e.count, 0)::integer AS updated FROM days d LEFT JOIN creations c USING(day) LEFT JOIN edits e USING(day) ORDER BY d.day`.execute(tx)).rows;
  return { ...stats, objectTypes: types.length, activity, timeZone };
}
