import { sql } from 'kysely';
import { effectiveWorkspaceLanguage, type Language } from '@xobject/contracts';
import type { Executor } from './database.js';

type Labels = Record<string, string>;
type Row = Record<string, unknown>;
type Context = { id: string; technical_name: string; code: string; labels: Labels; default_language: Language; available_languages: Language[]; state: string };

/** Read-only current names supplement the immutable event; they are not historical snapshots. */
export async function enrichJournalContext(tx: Executor, rows: Row[], userId: string, includeRecords: boolean): Promise<Row[]> {
  if (!rows.length) return rows;
  const language = (await sql<{ language: Language | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0].language;
  const objectIds = [...new Set(rows.map(row => row.object_type_id).filter((id): id is string => typeof id === 'string'))];
  const types = objectIds.length ? (await sql<Context>`SELECT o.id, o.technical_name, o.labels, o.state, w.code, w.default_language, w.available_languages FROM sys_object_types o JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ANY(${objectIds}::uuid[])`.execute(tx)).rows : [];
  const fieldIds = [...new Set(rows.map(row => row.field_id).filter((id): id is string => typeof id === 'string'))];
  const fields = fieldIds.length ? (await sql<{ id: string; labels: Labels }>`SELECT id, labels FROM sys_fields WHERE id = ANY(${fieldIds}::uuid[])`.execute(tx)).rows : [];
  const typeMap = new Map(types.map(type => [type.id, type]));
  const fieldMap = new Map(fields.map(field => [field.id, field]));
  const label = (labels: Labels, type: Context) => {
    const effective = effectiveWorkspaceLanguage(language, type.available_languages, type.default_language);
    return labels[effective] ?? labels[type.default_language] ?? labels.en ?? labels.de ?? Object.values(labels)[0];
  };
  const names = new Map<string, string>();
  if (includeRecords) for (const type of types) {
    const ids = [...new Set(rows.filter(row => row.entity_kind === 'record' && row.object_type_id === type.id).map(row => String(row.entity_id)))];
    if (!ids.length || type.state === 'deleted') continue;
    const keyword = (await sql`SELECT 1 FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND technical_name = 'keyword' AND state <> 'deleted'`.execute(tx)).rows.length > 0;
    if (!keyword) continue;
    // Identifiers come exclusively from trusted, validated model metadata.
    const records = (await sql<{ id: string; keyword: string | null }>`SELECT id, keyword FROM ${sql.table(`${type.code}_${type.technical_name}`)} WHERE id = ANY(${ids}::uuid[])`.execute(tx)).rows;
    for (const record of records) if (record.keyword) names.set(`${type.id}:${record.id}`, record.keyword);
  }
  return rows.map(row => {
    const type = typeMap.get(String(row.object_type_id)), field = fieldMap.get(String(row.field_id));
    return { ...row,
      object_type_name: type ? label(type.labels, type) : null,
      field_label: type && field ? label(field.labels, type) : null,
      entity_name: type && row.entity_kind === 'object_type' ? label(type.labels, type)
        : type && field && ['field', 'classification_field'].includes(String(row.entity_kind)) ? label(field.labels, type)
        : names.get(`${row.object_type_id}:${row.entity_id}`) ?? row.entity_name ?? null,
    };
  });
}
