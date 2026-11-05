import {sql,type RawBuilder} from 'kysely';
import {objectIconKey,type RecordIconKey} from '@xobject/contracts';
import {contentAccess} from './content-permissions.js';
import type {Executor} from './database.js';
export async function objectRecordIcon(tx:Executor,objectTypeId:string):Promise<RecordIconKey>{
 const binding=(await sql<{object_key:string}>`SELECT object_key FROM sys_module_object_bindings WHERE object_type_id=${objectTypeId}::uuid`.execute(tx)).rows[0];return objectIconKey(binding?.object_key);
}
/** Use immutable module bindings; unreadable Contact kinds retain the generic Contact icon. */
export async function recordIconExpression(tx:Executor,objectTypeId:string,alias?:string):Promise<RawBuilder<RecordIconKey>>{
 const icon=await objectRecordIcon(tx,objectTypeId);
 if(icon!=='contact')return sql`${icon}::text`;
 const kind=(await sql<{technical_name:string;option_keys:Record<string,string>}>`SELECT f.technical_name,b.option_keys FROM sys_module_field_bindings b JOIN sys_fields f ON f.id=b.field_id WHERE f.object_type_id=${objectTypeId}::uuid AND b.object_key='contact' AND b.field_key='contact_kind' AND f.state='active'`.execute(tx)).rows[0];
 if(!kind)return sql`'contact'::text`;
 const value=await contentAccess().fieldValueByName(objectTypeId,kind.technical_name,alias);
 return sql`CASE (${value})::text WHEN ${kind.option_keys.organization}::text THEN 'organization' WHEN ${kind.option_keys.person}::text THEN 'person' WHEN ${kind.option_keys.individual}::text THEN 'individual' ELSE 'contact' END`;
}
