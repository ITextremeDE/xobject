import { sql } from 'kysely';
import type { Executor } from './database.js';
import type { JournalEntry, FieldConfig } from '@xobject/contracts';
/** Reconstruct formatting from immutable definition events, including conversions in the same save. */
export async function journalValueContexts(tx:Executor,entries:JournalEntry[]):Promise<JournalEntry[]> {
  if(!entries.length)return entries;
  const ids=entries.filter(e=>e.entity_kind==='record'&&e.field_id).map(e=>e.id);
  if(!ids.length)return entries;
  const fields=(await sql<{id:string;kind:string;config:FieldConfig}>`SELECT id,kind,config FROM sys_fields WHERE id IN(SELECT field_id FROM sys_journal WHERE id=ANY(${ids}::uuid[]))`.execute(tx)).rows;
  const changes=(await sql<{entry_id:string;field_key:'kind'|'config';old_value:unknown;new_value:unknown;same_change:boolean}>`
    SELECT e.id AS entry_id,m.field_key,m.old_value,m.new_value,m.change_id=e.change_id AS same_change
    FROM sys_journal e JOIN sys_journal m ON m.field_id=e.field_id AND m.entity_kind='field' AND m.field_key IN('kind','config')
    WHERE e.id=ANY(${ids}::uuid[]) AND (m.created_at>e.created_at OR (m.created_at=e.created_at AND m.id>e.id) OR m.change_id=e.change_id)
    ORDER BY m.created_at DESC,m.id DESC`.execute(tx)).rows;
  return entries.map(entry=>{
    const field=fields.find(f=>f.id===entry.field_id);if(!field||entry.entity_kind!=='record')return entry;
    const after={kind:field.kind,config:field.config};
    for(const change of changes.filter(c=>c.entry_id===entry.id&&!c.same_change)) {
      if(change.old_value!==null){if(change.field_key==='kind')after.kind=String(change.old_value);else after.config=change.old_value as FieldConfig;}
    }
    const before=structuredClone(after);
    for(const change of changes.filter(c=>c.entry_id===entry.id&&c.same_change)) {
      if(change.field_key==='kind'){if(change.old_value!==null)before.kind=String(change.old_value);after.kind=String(change.new_value);}
      else {if(change.old_value!==null)before.config=change.old_value as FieldConfig;after.config=change.new_value as FieldConfig;}
    }
    return {...entry,value_context:{before,after}};
  });
}
