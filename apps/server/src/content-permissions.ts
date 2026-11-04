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
const rank=(level:ContentLevel|null|undefined)=>Math.max(0,contentLevels.indexOf(level??'none'));
const caps=(level:number):ContentCapabilities=>({read:level>=1,edit:level>=2,delete:level>=3,full:level>=4});
export class ObjectAccess {
  constructor(readonly id:string,readonly workspace:string,readonly sensitive:boolean,readonly admin:boolean,readonly level:number,readonly grants:ContentGrant[],readonly groups:string[],readonly actor:string){}
  get capabilities(){return caps(this.level);}
  field(id:string):FieldCapabilities {
    if(this.admin)return {read:true,edit:true};
    const level=resolveContentRule(this.grants,this.actor,this.groups,id).level;
    return {read:this.level>=1&&level!=='none',edit:this.level>=2&&level==='edit'};
  }
  predicate(alias?:string):RawBuilder<boolean>{
    if(!this.level)return sql<boolean>`false`;
    if(this.admin||!this.sensitive)return sql<boolean>`true`;
    const col=sql.ref(alias?`${alias}.access_principals`:'access_principals');
    return sql<boolean>`(jsonb_array_length(${col})=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(${col}) p WHERE (p->>'kind'='user' AND p->>'id'=${this.actor}) OR (p->>'kind'='group' AND p->>'id'=ANY(${this.groups}::text[]))))`;
  }
}
export class ContentAccess {
  private policies=new Map<string,Promise<ObjectAccess>>();
  private fieldMetadata=new Map<string,Promise<{id:string;technical_name:string;applicability?:import('@xobject/contracts').FieldApplicability}[]>>();
  constructor(readonly tx:Executor,readonly actor:string){}
  clear(){this.policies.clear();this.fieldMetadata.clear();}
  policy(id:string):Promise<ObjectAccess>{id=id.toLowerCase();let result=this.policies.get(id);if(!result){result=this.resolve(id);this.policies.set(id,result);}return result;}
  private async resolve(id:string){
    const model=(await sql<{workspace_id:string;is_sensitive:boolean}>`SELECT workspace_id,is_sensitive FROM sys_object_types WHERE id=${id}::uuid`.execute(this.tx)).rows[0];
    if(!model)throw new AppError(404,'Object type not found');
    const user=(await sql<{is_admin:boolean;active:boolean}>`SELECT is_admin,active FROM sys_users WHERE id=${this.actor}`.execute(this.tx)).rows[0];
    const member=(await sql`SELECT 1 FROM sys_workspace_members WHERE workspace_id=${model.workspace_id}::uuid AND user_id=${this.actor}`.execute(this.tx)).rows.length>0;
    const groups=(await sql<{id:string}>`SELECT g.id FROM sys_groups g JOIN sys_group_members m ON m.group_id=g.id WHERE g.workspace_id=${model.workspace_id}::uuid AND g.active AND m.user_id=${this.actor}`.execute(this.tx)).rows.map(g=>g.id);
    const grants=(await sql<{principal_kind:'user'|'group';principal_id:string;level:ContentLevel|null;fields:ContentGrant['fields']}>`SELECT principal_kind,principal_id,level,fields FROM sys_content_grants WHERE object_type_id=${id}::uuid`.execute(this.tx)).rows.map(g=>({kind:g.principal_kind,id:g.principal_id,level:g.level,fields:g.fields}));
    const level=!user?.active?0:user.is_admin?4:!member?0:rank(resolveContentRule(grants,this.actor,groups).level);
    return new ObjectAccess(id,model.workspace_id,model.is_sensitive,Boolean(user?.active&&user.is_admin),level,grants,groups,this.actor);
  }
  async readable(id:string,recordId:string){const policy=await this.policy(id);if(!policy.capabilities.read)return false;const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${id}::uuid AND o.state<>'deleted'`.execute(this.tx)).rows[0];return Boolean(model&&(await sql`SELECT 1 FROM ${sql.table(model.name)} WHERE id=${recordId}::uuid AND ${policy.predicate()}`.execute(this.tx)).rows.length);}
  async require(id:string,recordId:string|undefined,level:'read'|'edit'|'full'='read'){
    const p=await this.policy(id);if(!p.capabilities[level]||(recordId&&!p.admin&&!await this.readable(id,recordId)))throw new AppError(403,'Content access denied');return p;
  }
  fields(id:string){
    let fields=this.fieldMetadata.get(id);
    if(!fields){fields=sql<{id:string;technical_name:string;applicability?:import('@xobject/contracts').FieldApplicability}>`SELECT id,technical_name,applicability FROM sys_fields WHERE object_type_id=${id}::uuid`.execute(this.tx).then(result=>result.rows);this.fieldMetadata.set(id,fields);}
    return fields;
  }
  async canField(id:string,name:string,mode:'read'|'edit'='read'){const p=await this.policy(id);const field=(await this.fields(id)).find(f=>f.technical_name===name);return field?p.field(field.id)[mode]:false;}
  async project(id:string,row:Record<string,unknown>){
    const policy=await this.policy(id),result={...row};
    if(!policy.admin&&typeof row.id==='string'&&!await this.readable(id,row.id))return {id:row.id,version:row.version,keyword:row.id,permissions:caps(0)};
    const fields=await this.fields(id);
    for(const field of fields)if(!policy.field(field.id).read)delete result[field.technical_name];
    // Readable dependent inputs receive rule context, never the hidden controller value.
    const dependent=fields.filter(field=>field.applicability&&policy.field(field.id).read&&!policy.field(field.applicability.fieldId).read);
    if(dependent.length)result.applicableFieldIds=dependent.filter(field=>applies(field,fields,row)).map(field=>field.id);
    if(await this.canField(id,'status')&&!await this.canField(id,'type')){
      const config=(await sql<{classification:import('@xobject/contracts').ClassificationConfig}>`SELECT classification FROM sys_object_types WHERE id=${id}::uuid`.execute(this.tx)).rows[0].classification;
      result.allowedStatusIds=config.options.filter(option=>option.kind==='status'&&option.typeId===(row.type??null)&&(option.active||option.id===row.status)).map(option=>option.id);
    }
    if(!policy.sensitive)delete result.access_principals;
    if(!Object.hasOwn(result,'keyword'))result.keyword=String(row.id);
    return {...result,permissions:policy.capabilities};
  }
  async checkWrites(id:string,data:Record<string,unknown>,previous?:Record<string,unknown>){const p=await this.policy(id);for(const f of await this.fields(id)){if(!Object.hasOwn(data,f.technical_name))continue;if(!(f.technical_name==='access_principals'?p.capabilities.full:p.field(f.id).edit))throw new AppError(403,'Field edit denied');}}
  async eligiblePrincipals(id:string){
    const p=await this.policy(id);const users=(await sql<{id:string;name:string}>`SELECT u.id,u.name FROM sys_users u JOIN sys_workspace_members m ON m.user_id=u.id WHERE m.workspace_id=${p.workspace}::uuid AND u.active AND NOT u.is_admin ORDER BY u.name,u.id`.execute(this.tx)).rows;
    const groups=(await sql<{id:string;name:string}>`SELECT id,name FROM sys_groups WHERE workspace_id=${p.workspace}::uuid AND active ORDER BY name,id`.execute(this.tx)).rows;
    const result:{kind:'user'|'group';id:string;name:string}[]=[];
    for(const user of users){const policy=await new ContentAccess(this.tx,user.id).policy(id);if(policy.capabilities.read)result.push({kind:'user',...user});}
    for(const group of groups)if(p.grants.some(g=>g.kind==='group'&&g.id===group.id&&rank(g.level)>0))result.push({kind:'group',...group});
    const admins=(await sql<{id:string;name:string}>`SELECT id,name FROM sys_users WHERE active AND is_admin ORDER BY name,id`.execute(this.tx)).rows;
    return [...result,...admins.map(user=>({kind:'user' as const,...user}))];
  }
  async validatePrincipals(id:string,value:FieldValue,previous?:FieldValue){
    if(!Array.isArray(value))throw new AppError(400,'Invalid access principals');
    const eligible=await this.eligiblePrincipals(id),old=Array.isArray(previous)?previous:[];
    for(const item of value){
      if(typeof item!=='object'||item===null||!('kind'in item)||!('id'in item))throw new AppError(400,'Invalid access principals');
      if(!eligible.some(p=>p.kind===item.kind&&p.id===item.id)&&!old.some(p=>typeof p==='object'&&p!==null&&'kind'in p&&'id'in p&&p.kind===item.kind&&p.id===item.id))throw new AppError(400,'Access principal is not eligible');
    }
  }
}
export async function getContentPermissions(tx:Executor,id:string):Promise<ContentPermissions>{const row=(await sql<{permissions_version:number;is_sensitive:boolean}>`SELECT permissions_version,is_sensitive FROM sys_object_types WHERE id=${id}::uuid AND state<>'deleted'`.execute(tx)).rows[0];if(!row)throw new AppError(404,'Object type not found');return {objectTypeId:id,version:row.permissions_version,sensitive:row.is_sensitive,grants:(await contentAccess().policy(id)).grants};}
export async function configureContentPermissions(tx:Executor,args:{objectTypeId:string;version:number;sensitive:boolean;grants:ContentGrant[]},actor:string,journal:(key:string,before:unknown,after:unknown,field?:string)=>Promise<void>){
  const before=await getContentPermissions(tx,args.objectTypeId),p=await contentAccess().policy(args.objectTypeId);if(!p.admin)throw new AppError(403,'Only Administrators manage content permissions');if(before.version!==args.version)throw new AppError(409,'Permissions version conflict');
  const seen=new Set<string>();const fields=await contentAccess().fields(args.objectTypeId);
  for(const grant of args.grants){const key=`${grant.kind}:${grant.id}`;if(seen.has(key))throw new AppError(400,'Duplicate permission principal');seen.add(key);for(const id of Object.keys(grant.fields))if(!fields.some(f=>f.id===id&&f.technical_name!=='access_principals'))throw new AppError(400,'Unknown or protected permission field');
    const exists=grant.kind==='user'?(await sql`SELECT 1 FROM sys_users u JOIN sys_workspace_members m ON m.user_id=u.id WHERE m.workspace_id=${p.workspace}::uuid AND u.id=${grant.id}`.execute(tx)).rows.length:(await sql`SELECT 1 FROM sys_groups WHERE workspace_id=${p.workspace}::uuid AND id::text=${grant.id}`.execute(tx)).rows.length;if(!exists)throw new AppError(400,'Permission principal must belong to workspace');
  }
  const canonical=(grants:ContentGrant[])=>JSON.stringify(grants.filter(g=>g.level!==null||Object.keys(g.fields).length).map(g=>({...g,fields:Object.fromEntries(Object.entries(g.fields).sort(([a],[b])=>a.localeCompare(b)))})).sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
  args={...args,grants:args.grants.filter(g=>g.level!==null||Object.keys(g.fields).length)};
  if(canonical(before.grants)===canonical(args.grants)&&before.sensitive===args.sensitive)return before;
  if(args.sensitive!==before.sensitive){
    const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${args.objectTypeId}::uuid`.execute(tx)).rows[0];
    if(args.sensitive)await sql`ALTER TABLE ${sql.table(model.name)} ADD COLUMN IF NOT EXISTS access_principals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(access_principals)='array')`.execute(tx);
    const field=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${args.objectTypeId}::uuid AND technical_name='access_principals'`.execute(tx)).rows[0];
    if(!field&&args.sensitive){const id=v7();await sql`INSERT INTO sys_fields(id,object_type_id,technical_name,labels,kind,required,config,is_protected) VALUES(${id}::uuid,${args.objectTypeId}::uuid,'access_principals','{"de":"Zugriffsberechtigte","en":"Access principals"}'::jsonb,'reference',false,'{"referenceTarget":"both","multiple":true}'::jsonb,true)`.execute(tx);await journal('access_principals.definition',null,{id});}
    else if(field){await sql`UPDATE sys_fields SET state=${args.sensitive?'active':'inactive'},version=version+1 WHERE id=${field.id}::uuid`.execute(tx);await journal('access_principals.state',before.sensitive?'active':'inactive',args.sensitive?'active':'inactive',field.id);}
    await journal('sensitive',before.sensitive,args.sensitive);
  }
  const old=new Map(before.grants.map(g=>[`${g.kind}:${g.id}`,g]));const next=new Map(args.grants.map(g=>[`${g.kind}:${g.id}`,g]));
  for(const key of new Set([...old.keys(),...next.keys()])){const a=old.get(key),b=next.get(key);if((a?.level??null)!==(b?.level??null))await journal(`permission.${key}.level`,a?.level??null,b?.level??null);for(const field of new Set([...Object.keys(a?.fields??{}),...Object.keys(b?.fields??{})]))if(a?.fields[field]!==b?.fields[field])await journal(`permission.${key}.field.${field}`,a?.fields[field]??null,b?.fields[field]??null,field);}
  await sql`DELETE FROM sys_content_grants WHERE object_type_id=${args.objectTypeId}::uuid`.execute(tx);
  for(const grant of args.grants)await sql`INSERT INTO sys_content_grants VALUES(${args.objectTypeId}::uuid,${grant.kind},${grant.id},${grant.level},${JSON.stringify(grant.fields)}::jsonb)`.execute(tx);
  await sql`UPDATE sys_object_types SET is_sensitive=${args.sensitive},permissions_version=permissions_version+1,version=version+1 WHERE id=${args.objectTypeId}::uuid`.execute(tx);contentAccess().clear();return getContentPermissions(tx,args.objectTypeId);
}

/** Apply current rights to immutable history before counting/paging; never rewrite stored events. */
export async function readableRecordJournal(objectTypeId:string,entries:import('@xobject/contracts').JournalEntry[]){
  const access=contentAccess(),policy=await access.policy(objectTypeId),result:import('@xobject/contracts').JournalEntry[]=[];
  for(const entry of entries){
    if(entry.entity_kind==='record'){
      if(entry.field_id&&!policy.field(entry.field_id).read)continue;
      result.push(entry);continue;
    }
    if(entry.entity_kind!=='relationship')continue;
    let visible=true;const projected={...entry};
    for(const name of ['old_value','new_value'] as const){
      const value=structuredClone(entry[name]) as {left?:{objectTypeId:string;recordId:string;keyword:string};right?:{objectTypeId:string;recordId:string;keyword:string}}|null;
      if(value)for(const endpoint of [value.left,value.right]){
        if(!endpoint||!await access.readable(endpoint.objectTypeId,endpoint.recordId)){visible=false;break;}
        if(!await access.canField(endpoint.objectTypeId,'keyword'))endpoint.keyword=endpoint.recordId;
      }
      projected[name]=value;
    }
    if(visible)result.push(projected);
  }
  return result;
}
