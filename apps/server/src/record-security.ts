import {incidentFields} from './relationship-fields.js';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {defaultRecordSecurity,principalKey,accessRank,accessLevels,type RecordSecurity,type RecordWriteResult,type Principal,type FieldPrincipal} from '@xobject/contracts';
import {contentAccess,type ObjectAccess} from './content-permissions.js';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
export type RecordSecurityJournal=(change:string,key:string,before:unknown,after:unknown,field?:string)=>Promise<void>;
export async function recordSecurity(tx:Executor,objectId:string,recordId:string){
 const p=await contentAccess().require(objectId,recordId);
 if(!p.sensitive)throw new AppError(400,'Object is not user-sensitive');
 const record=(await sql<{version:number}>`SELECT r.version FROM ${sql.table(await recordTable(tx,objectId))} r WHERE id=${recordId}::uuid`.execute(tx)).rows[0];
 if(!record)throw new AppError(404,'Record not found');
 const policy=p.records.get(recordId)!.policy;
 const eligible=await contentAccess().eligiblePrincipals(objectId);
 const referenced=[...policy.owners,...policy.fields,...p.records.get(recordId)!.access.path.filter(key=>key.startsWith('user:')||key.startsWith('group:')).map(key=>({kind:key.startsWith('user:')?'user' as const:'group' as const,id:key.slice(key.indexOf(':')+1)}))];
 const principals:(FieldPrincipal&{assignable:boolean})[]=eligible.map(principal=>({...principal,active:true,assignable:true}));
 for(const principal of referenced){
  if(principals.some(item=>principalKey(item)===principalKey(principal)))continue;
  const row=principal.kind==='user'?(await sql<{name:string;active:boolean}>`SELECT name,active FROM sys_users WHERE id=${principal.id}`.execute(tx)).rows[0]:(await sql<{name:string;active:boolean}>`SELECT name,active FROM sys_groups WHERE id=${principal.id}::uuid AND workspace_id=${p.workspace}::uuid`.execute(tx)).rows[0];
  principals.push({kind:principal.kind,id:principal.id,name:row?.name??principal.id,active:row?.active??false,assignable:false});
 }
 return {policy,principals,fieldAccess:Object.fromEntries(([...await contentAccess().fields(objectId),...await incidentFields(tx,objectId)]).map(field=>[field.id,p.field(field.id,recordId)])),version:record.version,effective:{...p.records.get(recordId)!.access,level:accessLevels[p.recordLevel(recordId)]},canManage:p.recordCapabilities(recordId).full&&Boolean((await sql`SELECT 1 FROM sys_object_types WHERE id=${objectId}::uuid AND state='active'`.execute(tx)).rows.length)};
}
export async function recordTable(tx:Executor,id:string){const row=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid AND o.state<>'deleted'`.execute(tx)).rows[0];if(!row)throw new AppError(400,'Object must be active');return row.name;}
export async function saveRecordSecurity(tx:Executor,args:{objectTypeId:string;recordId:string;version:number;policy:RecordSecurity;confirmPublic:boolean},actor:string,journal:RecordSecurityJournal):Promise<RecordWriteResult>{
 const before=await recordSecurity(tx,args.objectTypeId,args.recordId);
 if(before.version!==args.version)throw new AppError(409,'Record version conflict');
 if(await writeRecordSecurity(tx,args,journal))await sql`UPDATE ${sql.table(await recordTable(tx,args.objectTypeId))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
 const row=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(await recordTable(tx,args.objectTypeId))} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0];
 return await contentAccess().project(args.objectTypeId,row) as RecordWriteResult;
}
/** Shared policy write; the surrounding record operation owns its one version increment. */
export async function writeRecordSecurity(tx:Executor,args:{objectTypeId:string;recordId:string;policy:RecordSecurity;confirmPublic:boolean},journal:RecordSecurityJournal):Promise<boolean>{
 const p=await contentAccess().require(args.objectTypeId,args.recordId,'full'),before=await recordSecurity(tx,args.objectTypeId,args.recordId);
 if(!before.canManage)throw new AppError(400,'Object must be active');
 const next=args.policy;await validatePolicy(p,args.recordId,next,before.policy,args.confirmPublic);
 if(!isDeepStrictEqual(before.policy,next)){
  const change=v7();for(const key of ['owners','publicLevel','privacy','foreignMax'] as const)if(!isDeepStrictEqual(before.policy[key],next[key]))await journal(change,`access.${key}`,before.policy[key],next[key]);
  for(const key of new Set([...before.policy.fields.map(principalKey),...next.fields.map(principalKey)])){const a=before.policy.fields.find(p=>principalKey(p)===key)?.fields??{},b=next.fields.find(p=>principalKey(p)===key)?.fields??{};for(const field of new Set([...Object.keys(a),...Object.keys(b)]))if(a[field]!==b[field])await journal(change,`access.field.${key}.${field}`,a[field]??null,b[field]??null,field);}
  await sql`INSERT INTO sys_record_security(workspace_id,object_type_id,record_id,policy) VALUES(${p.workspace}::uuid,${p.id}::uuid,${args.recordId}::uuid,${JSON.stringify(next)}::jsonb) ON CONFLICT(object_type_id,record_id) DO UPDATE SET policy=EXCLUDED.policy`.execute(tx);
  contentAccess().clear();
  return true;
 }
 return false;
}
async function validatePolicy(p:ObjectAccess,recordId:string|undefined,next:RecordSecurity,before:RecordSecurity,confirmPublic:boolean){
 const seen=new Set<string>();
 if(next.publicLevel&&accessRank(next.publicLevel)<2)throw new AppError(400,'Public ownership requires Read');
 if(!next.owners.length&&next.publicLevel===null)throw new AppError(400,'An empty owner list must be explicitly workspace-public');
 if(next.publicLevel&&next.privacy!=='normal')throw new AppError(400,'Public records cannot be Personal or Confidential');
 if(next.publicLevel&&(!before.publicLevel||accessRank(next.publicLevel)>accessRank(before.publicLevel))&&!confirmPublic)throw new AppError(400,'Confirm workspace-public access');
 const eligible=await contentAccess().eligiblePrincipals(p.id);
 for(const owner of next.owners){const key=principalKey(owner);if(seen.has(key))throw new AppError(400,'Duplicate owner');seen.add(key);
  if(!eligible.some(e=>principalKey(e)===key)&&!before.owners.some(e=>isDeepStrictEqual(e,owner)))throw new AppError(400,'Owner is not eligible');
 }
 const fields=[...await contentAccess().fields(p.id),...await incidentFields(contentAccess().tx,p.id)],exceptions=new Set<string>();
 for(const rule of next.fields){const key=principalKey(rule);if(exceptions.has(key))throw new AppError(400,'Duplicate field exception principal');exceptions.add(key);
  if(!eligible.some(e=>principalKey(e)===key)&&!isDeepStrictEqual(before.fields.find(item=>principalKey(item)===key),rule))throw new AppError(400,'Invalid field exception principal');
  for(const [id,level] of Object.entries(rule.fields)){if(!fields.some(f=>f.id===id&&f.technical_name!=='access_principals'))throw new AppError(400,'Invalid field exception');const own=p.field(id,recordId);if(!p.admin&&before.fields.find(r=>principalKey(r)===key)?.fields[id]!==level&&accessRank(level)>(own.edit?5:own.read?2:0))throw new AppError(403,'Cannot delegate field capability');}
 }
 next.owners.sort((a,b)=>principalKey(a).localeCompare(principalKey(b)));next.fields.sort((a,b)=>principalKey(a).localeCompare(principalKey(b)));
}
/** Create the initial security policy in the same transaction as the business record. */
export async function initializeRecordSecurity(tx:Executor,objectId:string,recordId:string,actor:string,initial:{policy:RecordSecurity;confirmPublic:boolean}|undefined,journal:RecordSecurityJournal){
 const p=await contentAccess().policy(objectId);
 if(!p.sensitive){if(initial)throw new AppError(400,'Object is not user-sensitive');return;}
 const defaults=defaultRecordSecurity([{kind:'user',id:actor,level:'full'}]),policy=initial?.policy??defaults;
 await sql`INSERT INTO sys_record_security(workspace_id,object_type_id,record_id,policy) VALUES(${p.workspace}::uuid,${objectId}::uuid,${recordId}::uuid,${JSON.stringify(defaults)}::jsonb)`.execute(tx);
 contentAccess().clear();
 if(initial){if(!p.capabilities.full)throw new AppError(403,'Full object access is required to choose an initial security policy');await validatePolicy(p,undefined,policy,defaults,initial.confirmPublic);}
 if(initial)await sql`UPDATE sys_record_security SET policy=${JSON.stringify(policy)}::jsonb WHERE object_type_id=${objectId}::uuid AND record_id=${recordId}::uuid`.execute(tx);
 const change=v7();for(const key of ['owners','publicLevel','privacy','foreignMax'] as const)await journal(change,`access.${key}`,null,policy[key]);
 for(const principal of policy.fields)for(const [id,value] of Object.entries(principal.fields))await journal(change,`access.field.${principalKey(principal)}.${id}`,null,value,id);
 contentAccess().clear();
}
