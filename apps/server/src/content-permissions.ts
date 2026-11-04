import {contactDerivedValue} from './contact-domain.js';
import {securityGraph} from './ownership-settings.js';
import {accessRank,membershipRights,resolveRecordAccess,defaultRecordSecurity,type RecordSecurity,type AccessExplanation,type Principal} from '@xobject/contracts';
import {applies} from './field-applicability.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {sql,type RawBuilder} from 'kysely';
import {v7} from 'uuid';
import {resolveContentRule,contentLevels,type ContentLevel,type ContentGrant,type ContentCapabilities,type FieldCapabilities,type ContentPermissions,type FieldValue} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
const scope=new AsyncLocalStorage<ContentAccess>();
export const withContentAccess=<T>(tx:Executor,actor:string,run:()=>Promise<T>)=>scope.run(new ContentAccess(tx,actor),run);
export function contentAccess(){const access=scope.getStore();if(!access)throw new Error('Content access requires an application transaction');return access;}
const rank=(level:ContentLevel|null|undefined)=>accessRank(level??'none');
export const contentCapabilities=(level:number,create=false):ContentCapabilities=>({read:level>=2,edit:level>=5,delete:level>=6,full:level>=7,duplicate:level>=3,schedule:level>=4,create});
export class ObjectAccess {
 constructor(readonly id:string,readonly workspace:string,readonly sensitive:boolean,readonly admin:boolean,readonly level:number,readonly grants:ContentGrant[],readonly groups:string[],readonly actor:string,readonly create:boolean,readonly records:Map<string,{policy:RecordSecurity;access:AccessExplanation}>){ }
 get capabilities(){return contentCapabilities(this.level,this.create);}
 recordLevel(id:string){return this.admin?7:Math.min(this.level,rank(this.records.get(id)?.access.level??(this.sensitive?'none':contentLevels[this.level])));}
 recordCapabilities(id:string){return contentCapabilities(this.recordLevel(id),this.create);}
 field(id:string,recordId?:string):FieldCapabilities{
  if(this.admin)return {read:true,edit:true};
  let fieldRank=rank(resolveContentRule(this.grants,this.actor,this.groups,id).level);
  const record=recordId?this.records.get(recordId):undefined;
  if(record&&this.sensitive){const direct=record.policy.fields.find(p=>p.kind==='user'&&p.id===this.actor&&Object.hasOwn(p.fields,id));const group=record.policy.fields.filter(p=>p.kind==='group'&&this.groups.includes(p.id)&&Object.hasOwn(p.fields,id));const level=direct?.fields[id]??(group.length?group.reduce((best,p)=>rank(p.fields[id])>rank(best)?p.fields[id]:best,'none' as 'none'|'read'|'edit'):undefined);if(level!==undefined)fieldRank=Math.min(fieldRank,rank(level));}
  const ceiling=recordId?this.recordLevel(recordId):this.level;
  return {read:ceiling>=2&&fieldRank>=2,edit:ceiling>=5&&fieldRank>=5};
 }
 creationField(id:string):boolean{
  if(!this.create)return false;if(this.admin)return true;
  const own=this.grants.find(g=>g.kind==='user'&&g.id===this.actor),groups=this.grants.filter(g=>g.kind==='group'&&this.groups.includes(g.id));
  if(own&&Object.hasOwn(own.fields,id))return own.fields[id]==='edit';
  if(groups.some(g=>Object.hasOwn(g.fields,id)))return groups.some(g=>Object.hasOwn(g.fields,id)?g.fields[id]==='edit':g.create===true);
  return true;
 }
 fieldReadableEverywhere(id:string){return this.field(id).read&&[...this.records.keys()].filter(id=>this.recordLevel(id)>=2).every(record=>this.field(id,record).read);}
 predicate(alias?:string,lifecycle:'active'|'recycled'|'all'='active'):RawBuilder<boolean>{
  const id=sql.ref(alias?`${alias}.id`:'id');
  const state=lifecycle==='all'?sql`true`:sql`${id} IN (SELECT record_id FROM sys_record_identities WHERE object_type_id=${this.id}::uuid AND ${lifecycle==='active'?sql`recycled_at IS NULL`:sql`recycled_at IS NOT NULL`})`;
  if(this.level<2)return sql<boolean>`false`;if(this.admin||!this.sensitive)return sql<boolean>`${state}`;
  const ids=[...this.records.keys()].filter(id=>this.recordLevel(id)>=2);return sql<boolean>`${state} AND ${id}=ANY(${ids}::uuid[])`;
 }
 fieldValue(id:string,column:string,alias?:string,fallback?:RawBuilder<unknown>):RawBuilder<unknown>{
  const value=sql.ref(alias?`${alias}.${column}`:column),otherwise=fallback??sql`NULL`;
  if(!this.field(id).read)return otherwise;
  if(this.admin||!this.sensitive)return value;
  const ids=[...this.records.keys()].filter(record=>this.field(id,record).read);
  return sql`CASE WHEN ${sql.ref(alias?`${alias}.id`:'id')}=ANY(${ids}::uuid[]) THEN ${value} ELSE ${otherwise} END`;
 }
}
export class ContentAccess {
 private policies=new Map<string,Promise<ObjectAccess>>();
 private fieldMetadata=new Map<string,Promise<{id:string;technical_name:string;value_mode:'stored'|'derived';applicability?:import('@xobject/contracts').FieldApplicability}[]>>();
 constructor(readonly tx:Executor,readonly actor:string){}
 clear(){this.policies.clear();this.fieldMetadata.clear();}
 policy(id:string):Promise<ObjectAccess>{id=id.toLowerCase();let result=this.policies.get(id);if(!result){result=this.resolve(id);this.policies.set(id,result);}return result;}
 private async resolve(id:string){
  const model=(await sql<{workspace_id:string;is_sensitive:boolean;name:string;state:string}>`SELECT o.workspace_id,o.is_sensitive,o.state,w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid`.execute(this.tx)).rows[0];if(!model)throw new AppError(404,'Object type not found');
  const user=(await sql<{is_admin:boolean;active:boolean}>`SELECT is_admin,active FROM sys_users WHERE id=${this.actor}`.execute(this.tx)).rows[0];
  const member=(await sql`SELECT 1 FROM sys_workspace_members WHERE workspace_id=${model.workspace_id}::uuid AND user_id=${this.actor}`.execute(this.tx)).rows.length>0;
  const graph=await securityGraph(this.tx,model.workspace_id),membership=membershipRights(this.actor,graph.members),groups=[...membership.keys()];
  const grants=(await sql<{principal_kind:'user'|'group';principal_id:string;level:ContentLevel|null;can_create:boolean|null;fields:ContentGrant['fields']}>`SELECT principal_kind,principal_id,level,can_create,fields FROM sys_content_grants WHERE object_type_id=${id}::uuid`.execute(this.tx)).rows.map(g=>({kind:g.principal_kind,id:g.principal_id,level:g.level,create:g.can_create,fields:g.fields}));
  const admin=Boolean(user?.active&&user.is_admin),level=!user?.active?0:admin?7:!member?0:rank(resolveContentRule(grants,this.actor,groups).level);
  const own=grants.find(g=>g.kind==='user'&&g.id===this.actor),canCreate=admin||Boolean(member&&user?.active&&(own?.create??grants.some(g=>g.kind==='group'&&groups.includes(g.id)&&g.create===true)));
  const records=new Map<string,{policy:RecordSecurity;access:AccessExplanation}>();
  if(model.is_sensitive&&model.state!=='deleted'){
   const rows=(await sql<{id:string;policy:RecordSecurity|null}>`SELECT r.id,s.policy FROM ${sql.table(model.name)} r LEFT JOIN sys_record_security s ON s.object_type_id=${id}::uuid AND s.record_id=r.id`.execute(this.tx)).rows;
   for(const row of rows){if(!row.policy)throw new AppError(500,'Sensitive record is missing its security policy');const policy=row.policy;const access=admin?{level:'full' as const,source:'administrator' as const,path:[]}:resolveRecordAccess(this.actor,id,policy,graph.members,graph.rules,graph.settings.find(u=>u.userId===this.actor)?.inherit??true);records.set(row.id,{policy,access});}
  }
  return new ObjectAccess(id,model.workspace_id,model.is_sensitive,admin,level,grants,groups,this.actor,canCreate,records);
 }
 async readable(id:string,recordId:string,includeRecycled=false){const policy=await this.policy(id);if(!policy.capabilities.read||policy.recordLevel(recordId)<2)return false;const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid AND o.state<>'deleted'`.execute(this.tx)).rows[0];return Boolean(model&&(await sql`SELECT 1 FROM ${sql.table(model.name)} WHERE id=${recordId}::uuid AND ${policy.predicate(undefined,includeRecycled?'all':'active')}`.execute(this.tx)).rows.length);}
 async require(id:string,recordId:string|undefined,level:'read'|'edit'|'full'|'create'|'duplicate'|'delete'='read',includeRecycled=false){
  const p=await this.policy(id),cap=recordId?p.recordCapabilities(recordId):p.capabilities;
  if(!cap[level])throw new AppError(403,'Content access denied');
  if(recordId&&!await this.readable(id,recordId,includeRecycled))throw new AppError(p.admin?404:403,p.admin?'Record not found':'Content access denied');return p;
 }
 fields(id:string){let fields=this.fieldMetadata.get(id);if(!fields){fields=sql<{id:string;technical_name:string;value_mode:'stored'|'derived';applicability?:import('@xobject/contracts').FieldApplicability}>`SELECT id,technical_name,value_mode,applicability FROM sys_fields WHERE object_type_id=${id}::uuid`.execute(this.tx).then(result=>result.rows);this.fieldMetadata.set(id,fields);}return fields;}
 async canField(id:string,name:string,mode:'read'|'edit'='read',recordId?:string){const p=await this.policy(id);const field=(await this.fields(id)).find(f=>f.technical_name===name);return field?p.field(field.id,recordId)[mode]:false;}
 async canCreateField(id:string,name:string){const p=await this.policy(id),field=(await this.fields(id)).find(f=>f.technical_name===name);return Boolean(field&&p.creationField(field.id));}
 async fieldValueByName(id:string,name:string,alias?:string){const policy=await this.policy(id),field=(await this.fields(id)).find(f=>f.technical_name===name);if(!field)return sql`NULL::text`;if(field.value_mode==='derived'){
  const binding=(await sql<{field_key:string}>`SELECT field_key FROM sys_module_field_bindings WHERE field_id=${field.id}::uuid`.execute(this.tx)).rows[0];if(!binding)return sql`NULL::text`;
  const value=await contactDerivedValue(this.tx,id,policy,binding.field_key,alias),allowed=policy.field(field.id).read;
  if(!allowed)return sql`NULL::text`;
  if(policy.sensitive&&!policy.admin)return sql`CASE WHEN ${sql.ref(alias?`${alias}.id`:'id')}=ANY(${[...policy.records.keys()].filter(record=>policy.field(field.id,record).read)}::uuid[]) THEN ${value} ELSE NULL END`;
  return value;
 }return policy.fieldValue(field.id,name,alias);}
 async keywordReadable(id:string,recordId:string){if(!await this.canField(id,'keyword','read',recordId))return false;const field=(await this.fields(id)).find(f=>f.technical_name==='keyword');if(field?.value_mode!=='derived')return true;const row=await this.project(id,{id:recordId});return row.keyword!==recordId;}
 async keywordValue(id:string,alias?:string){const value=await this.fieldValueByName(id,'keyword',alias);return sql`COALESCE(${value},${sql.ref(alias?`${alias}.id`:'id')}::text)`;}
 async project(id:string,row:Record<string,unknown>,includeRecycled=false){
  const policy=await this.policy(id),result={...row},recordId=String(row.id);
  if(!await this.readable(id,recordId,includeRecycled))return {id:row.id,version:row.version,keyword:recordId,permissions:contentCapabilities(0)};
  const fields=await this.fields(id);for(const field of fields)if(!policy.field(field.id,recordId).read)delete result[field.technical_name];
  const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid`.execute(this.tx)).rows[0];
  for(const field of fields.filter(f=>f.value_mode==='derived'&&policy.field(f.id,recordId).read))result[field.technical_name]=(await sql<Record<string,unknown>>`SELECT ${await this.fieldValueByName(id,field.technical_name)} AS value FROM ${sql.table(model.name)} WHERE id=${recordId}::uuid`.execute(this.tx)).rows[0].value;
  const dependent=fields.filter(field=>field.applicability&&policy.field(field.id,recordId).read&&!policy.field(field.applicability.fieldId,recordId).read);
  if(dependent.length)result.applicableFieldIds=dependent.filter(field=>applies(field,fields,row)).map(field=>field.id);
  if(await this.canField(id,'status','read',recordId)&&!await this.canField(id,'type','read',recordId)){
   const config=(await sql<{classification:import('@xobject/contracts').ClassificationConfig}>`SELECT classification FROM sys_object_types WHERE id=${id}::uuid`.execute(this.tx)).rows[0].classification;
   result.allowedStatusIds=config.options.filter(option=>option.kind==='status'&&option.typeId===(row.type??null)&&(option.active||option.id===row.status)).map(option=>option.id);
  }
  if(policy.sensitive)result.access_principals=policy.records.get(recordId)!.policy.owners;if(!Object.hasOwn(result,'keyword'))result.keyword=recordId;
  return {...result,fieldAccess:Object.fromEntries(fields.map(f=>[f.id,{...policy.field(f.id,recordId),edit:f.value_mode!=='derived'&&policy.field(f.id,recordId).edit}])),access:policy.records.has(recordId)?{...policy.records.get(recordId)!.access,level:contentLevels[policy.recordLevel(recordId)]}:undefined,permissions:policy.recordCapabilities(recordId)};
 }
 async checkWrites(id:string,data:Record<string,unknown>,previous?:Record<string,unknown>){const p=await this.policy(id),recordId=typeof previous?.id==='string'?previous.id:undefined;for(const f of await this.fields(id)){if(!Object.hasOwn(data,f.technical_name))continue;if(f.value_mode==='derived')throw new AppError(403,'Derived field cannot be assigned');if(!(recordId?p.field(f.id,recordId).edit:p.creationField(f.id)))throw new AppError(403,'Field edit denied');}}
 async eligiblePrincipals(id:string){
  const p=await this.policy(id);const users=(await sql<{id:string;name:string}>`SELECT u.id,u.name FROM sys_users u WHERE u.active AND (u.is_admin OR EXISTS(SELECT 1 FROM sys_workspace_members m WHERE m.user_id=u.id AND m.workspace_id=${p.workspace}::uuid)) ORDER BY u.name,u.id`.execute(this.tx)).rows;
  const result:{kind:'user'|'group';id:string;name:string}[]=[];
  for(const u of users){const cap=(await new ContentAccess(this.tx,u.id).policy(id)).capabilities;if(cap.read||cap.create)result.push({kind:'user',...u});}
  for(const group of (await sql<{id:string;name:string}>`SELECT id,name FROM sys_groups WHERE workspace_id=${p.workspace}::uuid AND active ORDER BY name,id`.execute(this.tx)).rows)if(p.grants.some(g=>g.kind==='group'&&g.id===group.id&&(rank(g.level)>=2||g.create===true)))result.push({kind:'group',...group});return result;
 }

}
export async function getContentPermissions(tx:Executor,id:string):Promise<ContentPermissions>{const row=(await sql<{permissions_version:number;is_sensitive:boolean}>`SELECT permissions_version,is_sensitive FROM sys_object_types WHERE id=${id}::uuid AND state<>'deleted'`.execute(tx)).rows[0];if(!row)throw new AppError(404,'Object type not found');return {objectTypeId:id,version:row.permissions_version,sensitive:row.is_sensitive,grants:(await contentAccess().policy(id)).grants};}
export async function configureContentPermissions(tx:Executor,args:{objectTypeId:string;version:number;sensitive:boolean;confirmWidening?:boolean;grants:ContentGrant[]},actor:string,journal:(key:string,before:unknown,after:unknown,field?:string)=>Promise<void>){
  const before=await getContentPermissions(tx,args.objectTypeId),p=await contentAccess().policy(args.objectTypeId);if(!p.admin)throw new AppError(403,'Only Administrators manage content permissions');if(before.version!==args.version)throw new AppError(409,'Permissions version conflict');
  if(before.sensitive&&!args.sensitive&&!args.confirmWidening)throw new AppError(400,'Confirm removal of record-level restrictions');
  const seen=new Set<string>();const fields=await contentAccess().fields(args.objectTypeId);
  for(const grant of args.grants){const key=`${grant.kind}:${grant.id}`;if(seen.has(key))throw new AppError(400,'Duplicate permission principal');seen.add(key);for(const id of Object.keys(grant.fields))if(!fields.some(f=>f.id===id&&f.technical_name!=='access_principals'))throw new AppError(400,'Unknown or protected permission field');
    const exists=grant.kind==='user'?(await sql`SELECT 1 FROM sys_users u JOIN sys_workspace_members m ON m.user_id=u.id WHERE m.workspace_id=${p.workspace}::uuid AND u.id=${grant.id}`.execute(tx)).rows.length:(await sql`SELECT 1 FROM sys_groups WHERE workspace_id=${p.workspace}::uuid AND id::text=${grant.id}`.execute(tx)).rows.length;if(!exists)throw new AppError(400,'Permission principal must belong to workspace');
  }
  const canonical=(grants:ContentGrant[])=>JSON.stringify(grants.filter(g=>g.level!==null||g.create!=null||Object.keys(g.fields).length).map(g=>({kind:g.kind,id:g.id,level:g.level,create:g.create??null,fields:Object.fromEntries(Object.entries(g.fields).sort(([a],[b])=>a.localeCompare(b)))})).sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
  args={...args,grants:args.grants.filter(g=>g.level!==null||g.create!=null||Object.keys(g.fields).length)};
  if(canonical(before.grants)===canonical(args.grants)&&before.sensitive===args.sensitive)return before;
  if(args.sensitive!==before.sensitive){
    const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${args.objectTypeId}::uuid`.execute(tx)).rows[0];
    if(args.sensitive)await sql`INSERT INTO sys_record_security(workspace_id,object_type_id,record_id,policy) SELECT ${p.workspace}::uuid,${p.id}::uuid,r.id,${JSON.stringify(defaultRecordSecurity())}::jsonb FROM ${sql.table(model.name)} r ON CONFLICT(object_type_id,record_id) DO NOTHING`.execute(tx);
    const field=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${args.objectTypeId}::uuid AND technical_name='access_principals'`.execute(tx)).rows[0];
    if(!field&&args.sensitive){const id=v7();await sql`INSERT INTO sys_fields(id,object_type_id,technical_name,labels,kind,required,config,is_protected) VALUES(${id}::uuid,${args.objectTypeId}::uuid,'access_principals','{"de":"Zugriffsberechtigte","en":"Access principals"}'::jsonb,'reference',false,'{"referenceTarget":"both","multiple":true}'::jsonb,true)`.execute(tx);await journal('access_principals.definition',null,{id});}
    else if(field){await sql`UPDATE sys_fields SET state=${args.sensitive?'active':'inactive'},version=version+1 WHERE id=${field.id}::uuid`.execute(tx);await journal('access_principals.state',before.sensitive?'active':'inactive',args.sensitive?'active':'inactive',field.id);}
    await journal('sensitive',before.sensitive,args.sensitive);
  }
  const old=new Map(before.grants.map(g=>[`${g.kind}:${g.id}`,g]));const next=new Map(args.grants.map(g=>[`${g.kind}:${g.id}`,g]));
  for(const key of new Set([...old.keys(),...next.keys()])){const a=old.get(key),b=next.get(key);if((a?.level??null)!==(b?.level??null))await journal(`permission.${key}.level`,a?.level??null,b?.level??null);if((a?.create??null)!==(b?.create??null))await journal(`permission.${key}.create`,a?.create??null,b?.create??null);for(const field of new Set([...Object.keys(a?.fields??{}),...Object.keys(b?.fields??{})]))if(a?.fields[field]!==b?.fields[field])await journal(`permission.${key}.field.${field}`,a?.fields[field]??null,b?.fields[field]??null,field);}
  await sql`DELETE FROM sys_content_grants WHERE object_type_id=${args.objectTypeId}::uuid`.execute(tx);
  for(const grant of args.grants)await sql`INSERT INTO sys_content_grants(object_type_id,principal_kind,principal_id,level,fields,can_create) VALUES(${args.objectTypeId}::uuid,${grant.kind},${grant.id},${grant.level},${JSON.stringify(grant.fields)}::jsonb,${grant.create??null})`.execute(tx);
  await sql`UPDATE sys_object_types SET is_sensitive=${args.sensitive},permissions_version=permissions_version+1,version=version+1 WHERE id=${args.objectTypeId}::uuid`.execute(tx);contentAccess().clear();return getContentPermissions(tx,args.objectTypeId);
}

/** Apply current rights to immutable history before counting/paging; never rewrite stored events. */
export async function readableRecordJournal(objectTypeId:string,entries:import('@xobject/contracts').JournalEntry[],includeRecycled=false){
  const access=contentAccess(),policy=await access.policy(objectTypeId),result:import('@xobject/contracts').JournalEntry[]=[];
  for(const entry of entries){
    if(entry.entity_kind==='record'){
      if(entry.field_id&&!policy.field(entry.field_id,entry.entity_id).read)continue;
      result.push(entry);continue;
    }
    if(entry.entity_kind!=='relationship')continue;
    let visible=true;const projected={...entry};
    for(const name of ['old_value','new_value'] as const){
      const value=structuredClone(entry[name]) as {left?:{objectTypeId:string;recordId:string;keyword:string};right?:{objectTypeId:string;recordId:string;keyword:string}}|null;
      if(value)for(const endpoint of [value.left,value.right]){
        if(!endpoint||!await access.readable(endpoint.objectTypeId,endpoint.recordId,includeRecycled)){visible=false;break;}
        if(!await access.keywordReadable(endpoint.objectTypeId,endpoint.recordId))endpoint.keyword=endpoint.recordId;
      }
      projected[name]=value;
    }
    if(visible)result.push(projected);
  }
  return result;
}
