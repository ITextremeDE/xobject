import {contentAccess} from './content-permissions.js';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {type Membership,type ForeignSettings,type GradedMember,type ForeignRule,accessRank,principalKey} from '@xobject/contracts';
import type {Executor} from './database.js';
import type {ConfigurationJournal} from './workspace-configuration.js';
import {workspaceGroups} from './workspace-configuration.js';
import {AppError} from './errors.js';
export async function securityGraph(tx:Executor,workspace:string){
 const users=(await sql<{id:string}>`SELECT u.id FROM sys_users u WHERE u.active AND (u.is_admin OR EXISTS(SELECT 1 FROM sys_workspace_members m WHERE m.workspace_id=${workspace}::uuid AND m.user_id=u.id))`.execute(tx)).rows.map(u=>u.id);
 const groups=(await sql<{id:string}>`SELECT id FROM sys_groups WHERE workspace_id=${workspace}::uuid AND active`.execute(tx)).rows.map(g=>g.id);
 const members=(await sql<Membership>`SELECT 'user' AS kind,m.user_id AS id,m.group_id AS "groupId",m.level FROM sys_group_members m JOIN sys_groups g ON g.id=m.group_id WHERE g.workspace_id=${workspace}::uuid UNION ALL SELECT 'group',n.member_group_id::text,n.group_id,n.level FROM sys_group_nesting n JOIN sys_groups g ON g.id=n.group_id WHERE g.workspace_id=${workspace}::uuid`.execute(tx)).rows.filter(m=>groups.includes(m.groupId)&&(m.kind==='user'?users.includes(m.id):groups.includes(m.id)));
 const config=await getForeignAccess(tx,workspace);
 const valid=(p:{kind:string;id:string})=>p.kind==='user'?users.includes(p.id):groups.includes(p.id);
 return {users,groups,members,rules:config.rules.filter(rule=>valid(rule.requester)&&valid(rule.owner)),settings:config.users};
}
export async function getForeignAccess(tx:Executor,workspaceId:string):Promise<ForeignSettings>{
 const ws=(await sql<{security_version:number}>`SELECT security_version FROM sys_workspaces WHERE id=${workspaceId}::uuid`.execute(tx)).rows[0];if(!ws)throw new AppError(404,'Workspace not found');
 const row=(await sql<{rules:ForeignRule[];users:ForeignSettings['users']}>`SELECT rules,users FROM sys_foreign_access WHERE workspace_id=${workspaceId}::uuid`.execute(tx)).rows[0];
 return {workspaceId,version:ws.security_version,rules:row?.rules??[],users:row?.users??[]};
}
export async function foreignAccessView(tx:Executor,workspaceId:string,actor:string){
 const all=await getForeignAccess(tx,workspaceId),admin=Boolean((await sql<{is_admin:boolean}>`SELECT is_admin FROM sys_users WHERE id=${actor}`.execute(tx)).rows[0]?.is_admin);
 if(admin)return all;
 if(!(await sql`SELECT 1 FROM sys_workspace_members WHERE workspace_id=${workspaceId}::uuid AND user_id=${actor}`.execute(tx)).rows.length)throw new AppError(403,'Workspace access denied');
 if(!all.users.some(u=>u.userId===actor&&u.manageOwn))throw new AppError(403,'Only Administrators or explicitly delegated owners manage foreign access');
 return {...all,rules:all.rules.filter(r=>r.owner.kind==='user'&&r.owner.id===actor),users:all.users.filter(u=>u.userId===actor)};
}
export async function configureForeignAccess(tx:Executor,args:ForeignSettings,journal:ConfigurationJournal,actor:string){
 const view=await foreignAccessView(tx,args.workspaceId,actor),all=await getForeignAccess(tx,args.workspaceId),admin=Boolean((await sql<{is_admin:boolean}>`SELECT is_admin FROM sys_users WHERE id=${actor}`.execute(tx)).rows[0]?.is_admin);
 if(!admin){
  if(!isDeepStrictEqual(args.users,view.users)||args.rules.some(r=>r.owner.kind!=='user'||r.owner.id!==actor))throw new AppError(403,'Delegation permits only foreign access on own records');
  const objects=(await sql<{id:string}>`SELECT id FROM sys_object_types WHERE workspace_id=${args.workspaceId}::uuid AND state<>'deleted' AND is_sensitive`.execute(tx)).rows;
  for(const rule of args.rules)for(const object of objects){const allowed=await contentAccess().policy(object.id),level=rule.objects[object.id]?.level??rule.level;if(accessRank(level)>allowed.level)throw new AppError(403,'Cannot delegate above own object permission');}
  args={...args,rules:[...all.rules.filter(r=>r.owner.kind!=='user'||r.owner.id!==actor),...args.rules],users:all.users};
 }

 const old=await getForeignAccess(tx,args.workspaceId);if(old.version!==args.version)throw new AppError(409,'Foreign access version conflict');
 const ids=new Set<string>(),pairs=new Set<string>();
 for(const rule of args.rules){const pair=`${principalKey(rule.requester)}>${principalKey(rule.owner)}`;if(ids.has(rule.id)||pairs.has(pair))throw new AppError(400,'Duplicate foreign access rule');ids.add(rule.id);pairs.add(pair);
  if(!isDeepStrictEqual(old.rules.find(r=>r.id===rule.id),rule))for(const p of [rule.requester,rule.owner])await validatePrincipal(tx,args.workspaceId,p,true);
  for(const id of Object.keys(rule.objects))if(!(await sql`SELECT 1 FROM sys_object_types WHERE id=${id}::uuid AND workspace_id=${args.workspaceId}::uuid AND state<>'deleted'`.execute(tx)).rows.length&&!isDeepStrictEqual(old.rules.find(previous=>previous.id===rule.id)?.objects[id],rule.objects[id]))throw new AppError(400,'Foreign override object outside workspace');
 }
 const seen=new Set<string>();for(const u of args.users){if(seen.has(u.userId))throw new AppError(400,'Duplicate user setting');seen.add(u.userId);if(!isDeepStrictEqual(old.users.find(v=>v.userId===u.userId),u))await validatePrincipal(tx,args.workspaceId,{kind:'user',id:u.userId});}
 const rules=[...args.rules].sort((a,b)=>a.id.localeCompare(b.id)),users=[...args.users].sort((a,b)=>a.userId.localeCompare(b.userId));
 if(isDeepStrictEqual(old.rules,rules)&&isDeepStrictEqual(old.users,users))return foreignAccessView(tx,args.workspaceId,actor);
 const change=v7();for(const id of new Set([...old.rules.map(x=>x.id),...rules.map(x=>x.id)])){
  const a=old.rules.find(x=>x.id===id),b=rules.find(x=>x.id===id);
  for(const key of ['requester','owner','level','confidential'] as const)if(!isDeepStrictEqual(a?.[key],b?.[key]))await journal('workspace',args.workspaceId,change,`foreign.rule.${id}.${key}`,a?.[key]??null,b?.[key]??null);
  for(const object of new Set([...Object.keys(a?.objects??{}),...Object.keys(b?.objects??{})]))for(const key of ['level','confidential'] as const)if(a?.objects[object]?.[key]!==b?.objects[object]?.[key])await journal('workspace',args.workspaceId,change,`foreign.rule.${id}.object.${object}.${key}`,a?.objects[object]?.[key]??null,b?.objects[object]?.[key]??null);
 }
 for(const id of new Set([...old.users.map(x=>x.userId),...users.map(x=>x.userId)])){const a=old.users.find(x=>x.userId===id),b=users.find(x=>x.userId===id);for(const key of ['inherit','manageOwn'] as const)if((a?.[key]??(key==='inherit'))!==(b?.[key]??(key==='inherit')))await journal('workspace',args.workspaceId,change,`foreign.user.${id}.${key}`,a?.[key]??(key==='inherit'),b?.[key]??(key==='inherit'));}
 await sql`INSERT INTO sys_foreign_access(workspace_id,rules,users) VALUES(${args.workspaceId}::uuid,${JSON.stringify(rules)}::jsonb,${JSON.stringify(users)}::jsonb) ON CONFLICT(workspace_id) DO UPDATE SET rules=EXCLUDED.rules,users=EXCLUDED.users`.execute(tx);
 await sql`UPDATE sys_workspaces SET security_version=security_version+1 WHERE id=${args.workspaceId}::uuid`.execute(tx);
 return foreignAccessView(tx,args.workspaceId,actor);
}
export async function validatePrincipal(tx:Executor,workspace:string,p:{kind:string;id:string},requireActive=false){
 const rows=p.kind==='user'?(await sql`SELECT u.active FROM sys_users u WHERE u.id=${p.id} AND (u.is_admin OR EXISTS(SELECT 1 FROM sys_workspace_members m WHERE m.user_id=u.id AND m.workspace_id=${workspace}::uuid))`.execute(tx)).rows:(await sql`SELECT active FROM sys_groups WHERE id=${p.id}::uuid AND workspace_id=${workspace}::uuid`.execute(tx)).rows;
 if(!rows.length)throw new AppError(400,'Principal outside workspace');
 if(requireActive&&!(rows[0] as {active:boolean}).active)throw new AppError(400,'Inactive principals cannot receive new foreign rules');
}
export async function configureGroupInheritance(tx:Executor,args:{workspaceId:string;groupId:string;version:number;members:GradedMember[]},journal:ConfigurationJournal){
 const group=(await workspaceGroups(tx,args.workspaceId)).find(g=>g.id===args.groupId);if(!group)throw new AppError(404,'Group not found');if(group.version!==args.version)throw new AppError(409,'Group version conflict');if(!group.active)throw new AppError(400,'Group is inactive');
 const seen=new Set<string>();for(const member of args.members){await validatePrincipal(tx,args.workspaceId,member);
  const active=member.kind==='user'?Boolean((await sql`SELECT 1 FROM sys_users WHERE id=${member.id} AND active`.execute(tx)).rows.length):Boolean((await sql`SELECT 1 FROM sys_groups WHERE id=${member.id}::uuid AND active`.execute(tx)).rows.length);
  if(!active&&!group.members.some(previous=>isDeepStrictEqual(previous,member)))throw new AppError(400,'Inactive members can only be retained or removed');const key=principalKey(member);if(seen.has(key)||member.kind==='group'&&member.id===group.id)throw new AppError(400,'Duplicate or cyclic membership');seen.add(key);}
 // Validate the entire retained graph, including inactive groups, before replacement.
 const edges=(await sql<{group_id:string;member_group_id:string}>`SELECT n.* FROM sys_group_nesting n JOIN sys_groups g ON g.id=n.group_id WHERE g.workspace_id=${args.workspaceId}::uuid AND n.group_id<>${group.id}::uuid`.execute(tx)).rows;
 edges.push(...args.members.filter(m=>m.kind==='group').map(m=>({group_id:group.id,member_group_id:m.id})));
 const visiting=new Set<string>(),done=new Set<string>(),children=new Map<string,string[]>();
 for(const e of edges)children.set(e.group_id,[...(children.get(e.group_id)??[]),e.member_group_id]);
 const visit=(id:string)=>{if(visiting.has(id))throw new AppError(400,'Group membership cycle');if(done.has(id))return;visiting.add(id);for(const child of children.get(id)??[])visit(child);visiting.delete(id);done.add(id);};for(const id of children.keys())visit(id);
 const before=[...group.members].sort((a,b)=>principalKey(a).localeCompare(principalKey(b))),after=[...args.members].sort((a,b)=>principalKey(a).localeCompare(principalKey(b)));
 if(isDeepStrictEqual(before,after))return group;
 const change=v7();for(const key of new Set([...before.map(principalKey),...after.map(principalKey)])){const a=before.find(m=>principalKey(m)===key),b=after.find(m=>principalKey(m)===key);if(a?.level!==b?.level)await journal('group',group.id,change,`membership.${key}`,a?.level??null,b?.level??null);}
 await sql`DELETE FROM sys_group_members WHERE group_id=${group.id}::uuid`.execute(tx);await sql`DELETE FROM sys_group_nesting WHERE group_id=${group.id}::uuid`.execute(tx);
 for(const m of args.members)if(m.kind==='user')await sql`INSERT INTO sys_group_members(group_id,user_id,level) VALUES(${group.id}::uuid,${m.id},${m.level})`.execute(tx);else await sql`INSERT INTO sys_group_nesting(group_id,member_group_id,level) VALUES(${group.id}::uuid,${m.id}::uuid,${m.level})`.execute(tx);
 await sql`UPDATE sys_groups SET version=version+1 WHERE id=${group.id}::uuid`.execute(tx);
 return (await workspaceGroups(tx,args.workspaceId)).find(g=>g.id===group.id)!;
}
