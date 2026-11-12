import {createHash} from 'node:crypto';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {formatRecordNumber,numberingPeriod,type Numbering,type NumberingBackfillPreview} from '@xobject/contracts';
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
 if(BigInt(row.next_value)>999999999999999999999999999999n)throw new AppError(409,'Record number sequence is exhausted',{code:"numberingExhausted"});
 const number=formatRecordNumber(config,row.next_value,period);
 await sql`INSERT INTO sys_number_allocations(object_type_id,record_id,number) VALUES(${objectId}::uuid,${recordId}::uuid,${number})`.execute(tx);
 await sql`UPDATE sys_number_counters SET next_value=next_value+${config.increment}::numeric WHERE object_type_id=${objectId}::uuid AND period=${period}`.execute(tx);
 return number;
}


type BackfillObject={id:string;version:number;numbering:Numbering;time_zone:string};
/** Read-only plan. The application workspace/model locks stabilize its inputs. */
export async function numberingBackfillPlan(tx:Executor,object:BackfillObject,table:string){
 if(!object.numbering.enabled)throw new AppError(400,'Enable and save record numbering before assigning missing numbers',{code:"numberingBackfillEnable"});
 const field=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${object.id}::uuid AND technical_name='record_number' AND state='active'`.execute(tx)).rows[0];
 if(!field)throw new AppError(409,'Record number definition is unavailable');
 const timestamp=(await sql<{now:Date}>`SELECT current_timestamp AS now`.execute(tx)).rows[0].now;
 const period=numberingPeriod(object.numbering,timestamp,object.time_zone);
 const records=(await sql<{id:string;version:number;recycled:boolean}>`SELECT r.id,r.version,i.recycled_at IS NOT NULL AS recycled FROM ${sql.table(table)} r JOIN sys_record_identities i ON i.object_type_id=${object.id}::uuid AND i.record_id=r.id WHERE r.record_number IS NULL ORDER BY r.created_at,r.id LIMIT 10001`.execute(tx)).rows;
 if(records.length>10000)throw new AppError(400,'At most 10000 records can receive missing numbers in one operation',{code:"numberingBackfillLimit"});
 const preserved=Number((await sql<{n:string}>`SELECT count(*) AS n FROM ${sql.table(table)} WHERE record_number IS NOT NULL`.execute(tx)).rows[0].n);
 const counter=(await sql<{next_value:string}>`SELECT next_value FROM sys_number_counters WHERE object_type_id=${object.id}::uuid AND period=${period}`.execute(tx)).rows[0];
 let next=BigInt(counter?.next_value??object.numbering.start),start=BigInt(object.numbering.start);if(next<start)next=start;
 const assignments=records.map(record=>{
  if(next>999999999999999999999999999999n)throw new AppError(409,'Record number sequence is exhausted',{code:"numberingExhausted"});
  const number=formatRecordNumber(object.numbering,next.toString(),period);next+=BigInt(object.numbering.increment);return {...record,number};
 });
 if(assignments.length){
  const numbers=assignments.map(row=>row.number),ids=assignments.map(row=>row.id);
  const collision=await sql`SELECT 1 FROM sys_number_allocations WHERE object_type_id=${object.id}::uuid AND (number=ANY(${numbers}::text[]) OR record_id=ANY(${ids}::uuid[])) UNION ALL SELECT 1 FROM ${sql.table(table)} WHERE record_number=ANY(${numbers}::text[]) LIMIT 1`.execute(tx);
  if(collision.rows.length)throw new AppError(409,'A proposed record number was already issued. Advance the start or adjust the format.',{code:'numbering_collision'});
 }
 const token=createHash('sha256').update(JSON.stringify({id:object.id,version:object.version,numbering:object.numbering,period,counter:counter?.next_value??null,preserved,assignments})).digest('hex');
 const preview:NumberingBackfillPreview={objectTypeId:object.id,version:object.version,previewToken:token,eligibleCount:records.length,preservedCount:preserved,recycledCount:records.filter(row=>row.recycled).length,period,firstNumber:assignments[0]?.number??null,lastNumber:assignments.at(-1)?.number??null,samples:assignments.slice(0,5).map(({id,number})=>({recordId:id,number}))};
 return {preview,assignments,fieldId:field.id,timestamp};
}
/** One atomic writer: allocation, contents, versions and per-record Journal share a transaction. */
export async function backfillRecordNumbers(tx:Executor,object:BackfillObject,table:string,token:string,actor:string,journal:(recordId:string,fieldId:string,number:string)=>Promise<void>){
 const plan=await numberingBackfillPlan(tx,object,table);
 if(plan.preview.previewToken!==token)throw new AppError(409,'Numbering preview has changed. Refresh the preview before assigning numbers.',{code:'numbering_backfill_conflict'});
 for(const record of plan.assignments){
  const number=await allocateRecordNumber(tx,object.id,record.id,object.numbering,object.time_zone,plan.timestamp);
  if(number!==record.number)throw new AppError(409,'Numbering preview has changed',{code:"numberingBackfillStale"});
  const changed=await sql`UPDATE ${sql.table(table)} SET record_number=${number},version=version+1,updated_at=current_timestamp,updated_by=${actor} WHERE id=${record.id}::uuid AND version=${record.version} AND record_number IS NULL RETURNING id`.execute(tx);
  if(changed.rows.length!==1)throw new AppError(409,'Record changed during number assignment',{code:"numberingBackfillStale"});
  await journal(record.id,plan.fieldId,record.number);
 }
 return {assigned:plan.assignments.length,preserved:plan.preview.preservedCount,firstNumber:plan.preview.firstNumber,lastNumber:plan.preview.lastNumber};
}
