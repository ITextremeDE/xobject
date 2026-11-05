import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {schemas,type ApiCredential,type Operation} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
import {passwordCrypto} from './auth.js';
import {isReadOperation} from './operation-locks.js';
export type RequestContext={sessionId?:string;credentialId?:string;channel?:'web'|'api'|'mcp';agentName?:string};
type Row={id:string;user_id:string;name:string;channels:('api'|'mcp')[];read_only:boolean;created_at:Date;expires_at:Date;last_used_at:Date|null;revoked_at:Date|null;secret_hash:string};
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const project=(r:Row):ApiCredential=>({id:r.id,userId:r.user_id,name:r.name,channels:r.channels,readOnly:r.read_only,createdAt:r.created_at.toISOString(),expiresAt:r.expires_at.toISOString(),lastUsedAt:r.last_used_at?.toISOString()??null,revokedAt:r.revoked_at?.toISOString()??null});
export const credentialOperations=['list_api_credentials','create_api_credential','revoke_api_credential','revoke_all_api_credentials'] as const;
export function credentialOperation(op:Operation){return (credentialOperations as readonly string[]).includes(op);}
export async function authenticateCredential(tx:Executor,authorization:string,channel:'api'|'mcp'){
 const match=/^Bearer (xo1_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43})$/.exec(authorization);
 if(!match)throw new AppError(401,'Invalid access token');
 const token=match[1],id=token.slice(4,40);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new AppError(401,'Invalid access token');
 const row=(await sql<Row>`SELECT c.* FROM sys_api_credentials c JOIN sys_users u ON u.id=c.user_id WHERE c.id=${id}::uuid AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND u.active AND NOT u.must_change_password`.execute(tx)).rows[0];
 const expected=Buffer.from(row?.secret_hash??'0'.repeat(64),'hex'),actual=Buffer.from(hash(token),'hex');
 if(!timingSafeEqual(expected,actual)||!row)throw new AppError(401,'Invalid access token');
 if(!row.channels.includes(channel))throw new AppError(403,'Access token channel is not permitted');
 return {userId:row.user_id,credentialId:row.id,channel,agentName:row.name};
}
export async function validateCredentialContext(tx:Executor,actor:string,operation:Operation,context?:RequestContext){
 if(!context?.credentialId)return;
 const row=(await sql<Row>`SELECT * FROM sys_api_credentials WHERE id=${context.credentialId}::uuid AND user_id=${actor} AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`.execute(tx)).rows[0];
 if(!row)throw new AppError(401,'Access token expired or revoked');
 if(!context.channel||!row.channels.includes(context.channel as 'api'|'mcp'))throw new AppError(403,'Access token channel is not permitted');
 if(credentialOperation(operation)||['change_password','get_account_security','revoke_session','revoke_other_sessions'].includes(operation))throw new AppError(403,'Interactive session required');
 if(row.read_only&&!isReadOperation(operation))throw new AppError(403,'Access token is read-only');
 await sql`UPDATE sys_api_credentials SET last_used_at=clock_timestamp() WHERE id=${row.id}::uuid`.execute(tx);
 context.agentName=row.name;
}
export class ApiCredentials {
 private failures=new Map<string,{count:number;until:number}>();
 async execute(tx:Executor,operation:Operation,input:unknown,actor:string,isAdmin:boolean,context:RequestContext|undefined,journal:(id:string,key:string,before:unknown,after:unknown)=>Promise<void>){
  if(!context?.sessionId||context.credentialId||!(await sql`SELECT 1 FROM sys_sessions WHERE id=${context.sessionId} AND user_id=${actor} AND expires_at>clock_timestamp()`.execute(tx)).rows.length)throw new AppError(401,'Interactive session required');
  if(operation==='list_api_credentials'){
   const {userId=actor}=schemas.list_api_credentials.parse(input);if(userId!==actor&&!isAdmin)throw new AppError(403,'Access denied');
   return (await sql<Row>`SELECT * FROM sys_api_credentials WHERE user_id=${userId} ORDER BY created_at DESC,id`.execute(tx)).rows.map(project);
  }
  if(operation==='revoke_all_api_credentials'){
   const {userId=actor}=schemas.revoke_all_api_credentials.parse(input);if(userId!==actor&&!isAdmin)throw new AppError(403,'Access denied');
   const rows=(await sql<{id:string}>`UPDATE sys_api_credentials SET revoked_at=clock_timestamp() WHERE user_id=${userId} AND revoked_at IS NULL RETURNING id`.execute(tx)).rows;
   for(const row of rows)await journal(row.id,'revoked',false,true);return {revokedCredentials:rows.length};
  }
  if(operation==='revoke_api_credential'){
   const {credentialId}=schemas.revoke_api_credential.parse(input),row=(await sql<Row>`SELECT * FROM sys_api_credentials WHERE id=${credentialId}::uuid AND (user_id=${actor} OR ${isAdmin}) FOR UPDATE`.execute(tx)).rows[0];
   if(!row)throw new AppError(404,'Access token not found');if(row.revoked_at)return {revoked:true};
   await sql`UPDATE sys_api_credentials SET revoked_at=clock_timestamp() WHERE id=${row.id}::uuid`.execute(tx);await journal(row.id,'revoked',false,true);return {revoked:true};
  }
  const args=schemas.create_api_credential.parse(input),expires=new Date(args.expiresAt),now=Date.now();
  if(expires.getTime()<=now||expires.getTime()>now+366*86400000)throw new AppError(400,'Access token expiry must be within one year');
  for(const [id,item] of this.failures)if(item.until<=now)this.failures.delete(id);
  const attempts=this.failures.get(actor);if(attempts&&attempts.count>=5)throw new AppError(429,'Password attempts exceeded');
  const account=(await sql<{password:string}>`SELECT password FROM sys_accounts WHERE user_id=${actor} AND provider_id='credential' AND password IS NOT NULL`.execute(tx)).rows[0];
  if(!account||!await passwordCrypto.verify({hash:account.password,password:args.currentPassword})){
   if(this.failures.size>=10000&&!attempts)throw new AppError(429,'Password attempts exceeded');this.failures.set(actor,{count:(attempts?.count??0)+1,until:attempts?.until??now+60000});throw new AppError(400,'Current password is incorrect');
  }
  if(Number((await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_api_credentials WHERE user_id=${actor} AND revoked_at IS NULL AND expires_at>now()`.execute(tx)).rows[0].n)>=50)throw new AppError(409,'Access token limit reached');
  const id=v7(),token=`xo1_${id}.${randomBytes(32).toString('base64url')}`;
  const row=(await sql<Row>`INSERT INTO sys_api_credentials(id,user_id,name,secret_hash,channels,read_only,expires_at) VALUES(${id}::uuid,${actor},${args.name},${hash(token)},${args.channels}::text[],${args.readOnly},${expires}) RETURNING *`.execute(tx)).rows[0];
  await journal(id,'created',null,{userId:actor,name:args.name,channels:args.channels,readOnly:args.readOnly,expiresAt:expires.toISOString()});
  return {credential:project(row),token};
 }
}
