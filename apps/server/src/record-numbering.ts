import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {formatRecordNumber,numberingPeriod,type Numbering} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
export async function configureNumbering(tx:Executor,object:{id:string;numbering:Numbering},config:Numbering,table:string,journal:(key:string,before:unknown,after:unknown)=>Promise<void>){
 if(isDeepStrictEqual(object.numbering,config))return false;
 if(config.enabled&&!(await sql`SELECT 1 FROM sys_fields WHERE object_type_id=${object.id}::uuid AND technical_name='record_number'`.execute(tx)).rows.length){
  const id=v7();await sql`INSERT INTO sys_fields(id,object_type_id,technical_name,labels,kind,is_protected) VALUES(${id}::uuid,${object.id}::uuid,'record_number','{"en":"Number","de":"Nummer"}'::jsonb,'text',true)`.execute(tx);
  await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN record_number text`.execute(tx);
  await sql`CREATE UNIQUE INDEX ${sql.ref(`xobject_number_${object.id.replaceAll('-','')}`)} ON ${sql.table(table)}(record_number)`.execute(tx);
  await journal('record_number.definition',null,{id,technicalName:'record_number'});
 }
 await sql`UPDATE sys_object_types SET numbering=${JSON.stringify(config)}::jsonb WHERE id=${object.id}::uuid`.execute(tx);
 for(const key of Object.keys(config) as (keyof Numbering)[])if(!isDeepStrictEqual(object.numbering[key],config[key]))await journal(`numbering.${key}`,object.numbering[key],config[key]);
 return true;
}
export async function allocateRecordNumber(tx:Executor,objectId:string,recordId:string,config:Numbering,timeZone:string,date?:Date){
 if(!config.enabled)return undefined;
 const timestamp=date??(await sql<{now:Date}>`SELECT current_timestamp AS now`.execute(tx)).rows[0].now;
 const period=numberingPeriod(config,timestamp,timeZone);
 const row=(await sql<{next_value:string}>`INSERT INTO sys_number_counters(object_type_id,period,next_value) VALUES(${objectId}::uuid,${period},${config.start}::numeric) ON CONFLICT(object_type_id,period) DO UPDATE SET next_value=GREATEST(sys_number_counters.next_value,EXCLUDED.next_value) RETURNING next_value`.execute(tx)).rows[0];
 if(BigInt(row.next_value)>999999999999999999999999999999n)throw new AppError(409,'Record number sequence is exhausted');
 const number=formatRecordNumber(config,row.next_value,period);
 await sql`INSERT INTO sys_number_allocations(object_type_id,record_id,number) VALUES(${objectId}::uuid,${recordId}::uuid,${number})`.execute(tx);
 await sql`UPDATE sys_number_counters SET next_value=next_value+${config.increment}::numeric WHERE object_type_id=${objectId}::uuid AND period=${period}`.execute(tx);
 return number;
}
