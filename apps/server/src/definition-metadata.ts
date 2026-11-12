import {sql} from 'kysely';
import type {Executor} from './database.js';
import type {ObjectType,Labels} from './domain-types.js';
import {AppError} from './errors.js';
const reserved = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'keyword', 'type', 'status', 'category', 'record_number', 'access_principals', 'tableoid', 'xmin', 'xmax', 'cmin', 'cmax', 'ctid']);
// Keep initial user-defined SQL names clear of PostgreSQL reserved words as well.
export async function checkName(db: Executor, name: string) {
  if (reserved.has(name)) throw new AppError(400, 'Reserved technical name');
  const result = await sql`SELECT 1 FROM pg_get_keywords() WHERE word = ${name} AND catcode = 'R'`.execute(db);
  if (result.rows.length) throw new AppError(400, 'Reserved SQL name');
}
export const tableName = (type: ObjectType) => `${type.code}_${type.technical_name}`;

export function localizedLabel(labels: Labels, userLanguage: string | null, workspaceLanguage: string): string {
  for (const key of [userLanguage, workspaceLanguage, 'en', 'de']) {
    if (key && labels[key]) return labels[key];
  }
  return Object.values(labels)[0];
}
