import {createHash} from 'node:crypto';
import {sql} from 'kysely';
import type {Executor} from './database.js';
import {AppError} from './errors.js';

function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}

/** The normal application transaction commits a receipt and all record/edge journals together. */
export async function recordCreationRequest(tx:Executor,actor:string,requestId:string|undefined,input:unknown){
  if(!requestId)return undefined;
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`xobject:create:${actor}:${requestId}`}))`.execute(tx);
  await sql`DELETE FROM sys_record_creation_requests WHERE actor_id=${actor} AND request_id=${requestId}::uuid AND expires_at<=now()`.execute(tx);
  // Lock our key before sweeping. Concurrent workspaces skip receipts already in use.
  await sql`WITH expired AS (SELECT actor_id,request_id FROM sys_record_creation_requests WHERE expires_at<=now() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)
    DELETE FROM sys_record_creation_requests r USING expired e WHERE r.actor_id=e.actor_id AND r.request_id=e.request_id`.execute(tx);
  const hash=createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
  const previous=(await sql<{input_hash:string;object_type_id:string;record_id:string}>`SELECT input_hash,object_type_id,record_id FROM sys_record_creation_requests WHERE actor_id=${actor} AND request_id=${requestId}::uuid AND expires_at>now()`.execute(tx)).rows[0];
  if(previous&&previous.input_hash!==hash)throw new AppError(409,'Creation request key was already used for different input',{code:'creation_request_conflict'});
  return {previous,complete:async(objectId:string,recordId:string)=>{
    await sql`INSERT INTO sys_record_creation_requests(actor_id,request_id,input_hash,object_type_id,record_id) VALUES(${actor},${requestId}::uuid,${hash},${objectId}::uuid,${recordId}::uuid)`.execute(tx);
  }};
}
