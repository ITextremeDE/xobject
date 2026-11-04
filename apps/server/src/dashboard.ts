import {contentAccess} from './content-permissions.js';
import { sql, type RawBuilder } from 'kysely';
import type { Executor } from './database.js';
import type { z } from 'zod';
import { schemas, effectiveTimeZone, effectiveWorkspaceLanguage, type Language } from '@xobject/contracts';
import { AppError } from './errors.js';

/** Project each heterogeneous table into the same fixed, typed standard columns. */
async function workspaceRows(tx: Executor, workspaceId: string, actor: string, recycled=false) {
  const workspace = (await sql<{ code: string; default_language: Language; available_languages: Language[]; time_zone: string }>`SELECT code, default_language, available_languages, time_zone FROM sys_workspaces WHERE id = ${workspaceId}::uuid`.execute(tx)).rows[0];
  if (!workspace) throw new AppError(404, 'Workspace not found');
  const user = (await sql<{ language: Language | null; time_zone: string | null }>`SELECT language, time_zone FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
  const language = effectiveWorkspaceLanguage(user.language, workspace.available_languages, workspace.default_language);
  const types = (await sql<{ id: string; state:string; technical_name: string; labels: Record<string, string>; classification: { options: { id: string; labels: Record<string, string> }[] } }>`SELECT id, state, technical_name, labels, classification FROM sys_object_types WHERE workspace_id = ${workspaceId}::uuid AND state <> 'deleted' AND (${recycled} OR state='active') ORDER BY technical_name`.execute(tx)).rows;
  const label = (labels: Record<string, string>) => [language, workspace.default_language, 'en', 'de'].map(key => labels[key]).find(Boolean) ?? Object.values(labels)[0] ?? '';
  const selects: RawBuilder<unknown>[] = [];
  const accessibleTypes=[];
  for (const type of types) {
    const policy=await contentAccess().policy(type.id);if(!policy.capabilities.read)continue;accessibleTypes.push(type);
    const fields = (await sql<{ id:string;technical_name: string }>`SELECT id,technical_name FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state = 'active'`.execute(tx)).rows;
    const has = (name: string) => fields.some(field => field.technical_name === name&&policy.field(field.id).read);
    const value=(kind:string)=>policy.fieldValue(fields.find(f=>f.technical_name===kind)!.id,kind,'r');
    const choice = (kind: string) => {
      if (!has(kind)) return sql`NULL::text`;
      const cases = type.classification.options.map(option => sql`WHEN ${option.id}::uuid THEN ${label(option.labels)}`);
      if (!cases.length) return sql`NULL::text`;
      return kind === 'category' ? sql`(SELECT string_agg(CASE option_id ${sql.join(cases, sql` `)} ELSE option_id::text END, ', ' ORDER BY position) FROM unnest(${value(kind)}) WITH ORDINALITY AS choices(option_id, position))` : sql`CASE ${value(kind)} ${sql.join(cases, sql` `)} ELSE ${value(kind)}::text END`;
    };
    selects.push(sql`SELECT r.id, ${type.id}::uuid AS "objectTypeId", ${type.technical_name}::text AS "objectTechnicalName", ${label(type.labels)}::text AS "objectLabel", ${has('keyword') ? await contentAccess().fieldValueByName(type.id,'keyword','r') : sql`NULL::text`} AS keyword, ${has('business_number')?value('business_number'):sql`NULL::text`} AS business_number, ${choice('type')} AS type, ${choice('status')} AS status, ${choice('category')} AS category, r.created_at, r.updated_at, r.created_by, r.updated_by, creator.name AS "createdByName", editor.name AS "updatedByName", r.version,ri.recycled_at,ri.recycled_by,recycler.name AS "recycledByName" FROM ${sql.table(`${workspace.code}_${type.technical_name}`)} r JOIN sys_record_identities ri ON ri.object_type_id=${type.id}::uuid AND ri.record_id=r.id LEFT JOIN sys_users recycler ON recycler.id=ri.recycled_by LEFT JOIN sys_users creator ON creator.id = r.created_by LEFT JOIN sys_users editor ON editor.id = r.updated_by WHERE ${policy.predicate('r',recycled?'recycled':'active')}`);
  }
  const rows = selects.length ? sql.join(selects, sql` UNION ALL `) : sql`SELECT NULL::uuid AS id, NULL::uuid AS "objectTypeId", NULL::text AS "objectTechnicalName", NULL::text AS "objectLabel", NULL::text AS keyword, NULL::text AS business_number, NULL::text AS type, NULL::text AS status, NULL::text AS category, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at, NULL::text AS created_by, NULL::text AS updated_by, NULL::text AS "createdByName", NULL::text AS "updatedByName", NULL::integer AS version,NULL::timestamptz AS recycled_at,NULL::text AS recycled_by,NULL::text AS "recycledByName" WHERE false`;
  return { rows, types:accessibleTypes, timeZone: effectiveTimeZone(user.time_zone, workspace.time_zone) };
}
export async function listWorkspaceRecords(tx: Executor, args: z.output<typeof schemas.list_workspace_records>|z.output<typeof schemas.list_recycled_records>, actor: string,recycled=false) {
  const { rows,types } = await workspaceRows(tx, args.workspaceId, actor,recycled);
  const filter = sql`${args.objectTypeId ? sql`"objectTypeId" = ${args.objectTypeId}::uuid` : sql`true`} AND (position(lower(${args.query}) in lower(COALESCE(keyword, id::text))) > 0 OR position(lower(${args.query}) in lower(business_number)) > 0)`;
  const total = (await sql<{ total: number }>`WITH records AS (${rows}) SELECT count(*)::integer AS total FROM records WHERE ${filter}`.execute(tx)).rows[0].total;
  const records = (await sql`WITH records AS (${rows}) SELECT * FROM records WHERE ${filter} ORDER BY ${sql.ref(args.sortBy)} ${args.sortDirection === 'asc' ? sql`ASC` : sql`DESC`} NULLS LAST, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
  if(recycled)for(const row of records as {objectTypeId:string;id:string;canRestore?:boolean}[]){row.canRestore=types.find(type=>type.id===row.objectTypeId)?.state==='active'&&(await contentAccess().policy(row.objectTypeId)).recordCapabilities(row.id).full;}
  return { records, total, limit: args.limit, offset: args.offset };
}
export async function workspaceDashboard(tx: Executor, args: z.output<typeof schemas.get_workspace_dashboard>, actor: string) {
  const { rows, types, timeZone } = await workspaceRows(tx, args.workspaceId, actor);
  const stats = (await sql<{ total: number; created30: number; updated7: number }>`WITH records AS (${rows}) SELECT count(*)::integer AS total, count(*) FILTER (WHERE created_at >= now() - interval '30 days')::integer AS "created30", count(*) FILTER (WHERE updated_at > created_at AND updated_at >= now() - interval '7 days')::integer AS "updated7" FROM records`.execute(tx)).rows[0];
  const activity = (await sql`WITH records AS (${rows}), days AS (SELECT generate_series((now() AT TIME ZONE ${timeZone})::date - (${args.days}::integer - 1), (now() AT TIME ZONE ${timeZone})::date, interval '1 day')::date AS day), creations AS (SELECT (created_at AT TIME ZONE ${timeZone})::date AS day, count(*)::integer AS count FROM records GROUP BY 1), edits AS (SELECT (j.created_at AT TIME ZONE ${timeZone})::date AS day, count(DISTINCT j.entity_id)::integer AS count FROM sys_journal j JOIN records r ON r.id = j.entity_id AND r."objectTypeId" = j.object_type_id WHERE j.workspace_id = ${args.workspaceId}::uuid AND j.entity_kind = 'record' AND j.created_at > r.created_at GROUP BY 1) SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(c.count, 0)::integer AS created, COALESCE(e.count, 0)::integer AS updated FROM days d LEFT JOIN creations c USING(day) LEFT JOIN edits e USING(day) ORDER BY d.day`.execute(tx)).rows;
  return { ...stats, objectTypes: types.length, activity, timeZone };
}
