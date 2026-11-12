import {objectIconKey} from '@xobject/contracts';
import {sql} from 'kysely';
import {isDeepStrictEqual} from 'node:util';
import {v7} from 'uuid';
import {type NavigationNode,type NavigationSettings,type NavigationLayout} from '@xobject/contracts';
import type {Executor} from './database.js';
import {contentAccess} from './content-permissions.js';
import {AppError} from './errors.js';
type Journal=(kind:string,id:string,change:string,key:string,before:unknown,after:unknown)=>Promise<unknown>;
export async function navigationInventory(tx:Executor,workspaceId:string):Promise<NavigationNode[]>{
 const modules=(await sql<{key:string;labels:Record<string,string>;enabled:boolean;objects:{key:string;navigationPriority?:number}[]}>`SELECT m.key,m.labels,m.objects,COALESCE(w.enabled,false) AS enabled FROM sys_modules m LEFT JOIN sys_workspace_modules w ON w.module_key=m.key AND w.workspace_id=${workspaceId}::uuid ORDER BY m.position,m.key`.execute(tx)).rows;
 const objects=(await sql<{id:string;technical_name:string;labels:Record<string,string>;state:string;object_key:string|null}>`SELECT o.id,o.technical_name,o.labels,o.state,b.object_key FROM sys_object_types o LEFT JOIN sys_module_object_bindings b ON b.object_type_id=o.id WHERE o.workspace_id=${workspaceId}::uuid ORDER BY o.technical_name,o.id`.execute(tx)).rows;
 const kind=(await sql<{field_id:string;option_keys:Record<string,string>}>`SELECT field_id,option_keys FROM sys_module_field_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key='contact' AND field_key='contact_kind'`.execute(tx)).rows[0];
 const nodes:NavigationNode[]=[];
 const makeObject=async(object:typeof objects[number],parentId:string)=>{
  const policy=await contentAccess().policy(object.id),id=`${parentId}:${object.id}`;
  nodes.push({id,parentId,iconKey:objectIconKey(object.object_key),kind:'object',labels:object.labels,available:object.state==='active',permitted:Boolean(policy.capabilities.read||policy.capabilities.create),objectTypeId:object.id,technicalName:object.technical_name});
  if(object.object_key==='contact'&&kind)for(const [key,labels] of Object.entries({organization:{en:'Organizations',de:'Organisationen'},person:{en:'Contact persons',de:'Ansprechpartner'},individual:{en:'Individual contacts',de:'Einzelkontakte'}}))nodes.push({id:`${id}:${kind.option_keys[key]}`,parentId:id,kind:'contact_kind',labels,available:object.state==='active',permitted:Boolean(policy.capabilities.read&&policy.field(kind.field_id).read),objectTypeId:object.id,technicalName:object.technical_name,contactKindId:kind.option_keys[key],contactKind:key as NavigationNode['contactKind']});
 };
 for(const module of modules){const id=`module:${module.key}`;nodes.push({id,parentId:null,kind:'section',labels:module.labels,available:module.enabled,permitted:true});for(const proposal of [...module.objects].sort((a,b)=>(b.navigationPriority??0)-(a.navigationPriority??0))){const object=objects.find(o=>o.object_key===proposal.key);if(object)await makeObject(object,id);}}
 nodes.push({id:'custom',parentId:null,kind:'section',labels:{en:'Custom object types',de:'Eigene Datenobjekte'},available:true,permitted:true});
 for(const object of objects.filter(o=>!o.object_key))await makeObject(object,'custom');
 return nodes;
}
export async function getNavigation(tx:Executor,workspaceId:string,userId:string):Promise<NavigationSettings>{
 if(!(await sql`SELECT 1 FROM sys_workspaces WHERE id=${workspaceId}::uuid`.execute(tx)).rows.length)throw new AppError(404,'Workspace not found');
 const rows=(await sql<{user_id:string|null;version:number;layout:NavigationLayout|null}>`SELECT user_id,version,layout FROM sys_navigation_preferences WHERE workspace_id=${workspaceId}::uuid AND (user_id IS NULL OR user_id=${userId})`.execute(tx)).rows;
 const own=rows.find(r=>r.user_id===userId),workspace=rows.find(r=>r.user_id===null);
 const manage=(await sql`SELECT 1 FROM sys_users u WHERE u.id=${userId} AND (u.is_admin OR EXISTS(SELECT 1 FROM sys_workspace_members m WHERE m.workspace_id=${workspaceId}::uuid AND m.user_id=u.id AND m.role='designer'))`.execute(tx)).rows.length>0;
 return {nodes:await navigationInventory(tx,workspaceId),workspace:{version:workspace?.version??0,layout:workspace?.layout??null},personal:{version:own?.version??0,layout:own?.layout??null},canManage:manage};
}
export async function configureNavigation(tx:Executor,args:{workspaceId:string;scope:'personal'|'workspace';version:number;layout:NavigationLayout|null},actor:string,journal:Journal){
 // Serialize first creation as well as optimistic updates; no read operation writes a row.
 await sql`SELECT 1 FROM sys_workspaces WHERE id=${args.workspaceId}::uuid FOR UPDATE`.execute(tx);
 const current=await getNavigation(tx,args.workspaceId,actor),previous=current[args.scope];
 if(args.scope==='workspace'&&!current.canManage)throw new AppError(403,'Access denied');
 if(previous.version!==args.version)throw new AppError(409,'Navigation version conflict',{code:"version_conflict"});
 const ids=new Set(current.nodes.map(n=>n.id));if(args.layout&&[...args.layout.order,...args.layout.hidden].some(id=>!ids.has(id)))throw new AppError(400,'Unknown navigation entry');
 if(isDeepStrictEqual(previous.layout,args.layout))return current;
 const owner=args.scope==='personal'?actor:null;
 if(previous.version===0)await sql`INSERT INTO sys_navigation_preferences(workspace_id,user_id,version,layout) VALUES(${args.workspaceId}::uuid,${owner},1,${args.layout===null?null:JSON.stringify(args.layout)}::jsonb)`.execute(tx);
 else await sql`UPDATE sys_navigation_preferences SET layout=${args.layout===null?null:JSON.stringify(args.layout)}::jsonb,version=version+1 WHERE workspace_id=${args.workspaceId}::uuid AND user_id IS NOT DISTINCT FROM ${owner}`.execute(tx);
 const snapshot=(value:unknown,key:string)=>Array.isArray(value)&&['order','hidden'].includes(key)?value.map(id=>{
  const entry=current.nodes.find(node=>node.id===id);if(!entry)return {id};
  const chain:NavigationNode[]=[];let node:NavigationNode|undefined=entry;while(node){chain.unshift(node);node=current.nodes.find(parent=>parent.id===node!.parentId);}
  return {id,...Object.fromEntries(['en','de'].map(language=>[language,chain.map(n=>n.labels[language]??n.labels.en??n.labels.de).join(' / ')]))};
 }):value;
 const change=v7();
 for(const key of ['order','hidden','resources'] as const)if(!isDeepStrictEqual(previous.layout?.[key],args.layout?.[key]))await journal(args.scope==='personal'?'user':'workspace',args.scope==='personal'?actor:args.workspaceId,change,`navigation.${args.scope}.${key}`,snapshot(previous.layout?.[key]??null,key),snapshot(args.layout?.[key]??null,key));
 if((previous.layout===null)!==(args.layout===null))await journal(args.scope==='personal'?'user':'workspace',args.scope==='personal'?actor:args.workspaceId,change,`navigation.${args.scope}.override`,previous.layout!==null,args.layout!==null);
 return getNavigation(tx,args.workspaceId,actor);
}
