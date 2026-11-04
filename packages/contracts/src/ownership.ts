import {z} from 'zod';
import {uuidSchema} from './identity.js';
export const accessLevels=['none','availability','read','duplicate','schedule','edit','delete','full'] as const;
export const accessLevelSchema=z.enum(accessLevels);
export type AccessLevel=z.infer<typeof accessLevelSchema>;
export const accessRank=(level:AccessLevel)=>accessLevels.indexOf(level);
export const principalSchema=z.object({kind:z.enum(['user','group']),id:uuidSchema}).strict();
export type Principal=z.infer<typeof principalSchema>;
export const principalKey=(p:Principal)=>`${p.kind}:${p.id}`;
export const ownershipSchema=principalSchema.extend({level:accessLevelSchema.refine(l=>accessRank(l)>=2,'Ownership requires at least Read')});
export type Ownership=z.infer<typeof ownershipSchema>;
export const membershipSchema=principalSchema.extend({level:accessLevelSchema.refine(l=>accessRank(l)>=2,'Membership requires at least Read')});
export type GradedMember=z.infer<typeof membershipSchema>;
export interface Membership extends GradedMember {groupId:string}
export const recordSecuritySchema=z.object({owners:z.array(ownershipSchema).max(100),publicLevel:accessLevelSchema.nullable(),privacy:z.enum(['normal','personal','confidential']),foreignMax:accessLevelSchema,fields:z.array(z.object({kind:z.enum(['user','group']),id:uuidSchema,fields:z.record(uuidSchema,z.enum(['none','read','edit']))}).strict()).max(100)}).strict();
export type RecordSecurity=z.infer<typeof recordSecuritySchema>;
export const foreignRuleSchema=z.object({id:uuidSchema,requester:principalSchema,owner:principalSchema,level:accessLevelSchema,confidential:z.boolean(),objects:z.record(uuidSchema,z.object({level:accessLevelSchema,confidential:z.boolean().optional()}).strict())}).strict();
export type ForeignRule=z.infer<typeof foreignRuleSchema>;
export interface ForeignSettings {workspaceId:string;version:number;rules:ForeignRule[];users:{userId:string;inherit:boolean;manageOwn:boolean}[]}
export interface AccessExplanation {level:AccessLevel;source:'administrator'|'ownership'|'group'|'public'|'foreign'|'none';path:string[]}
export const defaultRecordSecurity=(owners:Ownership[]=[]):RecordSecurity=>({owners,publicLevel:owners.length?null:'full',privacy:'normal',foreignMax:'full',fields:[]});
/** Upward membership closure. Every relaxation strictly increases one finite rank. */
function membershipPaths(userId:string,members:Membership[]):Map<string,{rank:number;path:string[]}>{
 const values=new Map<string,{rank:number;path:string[]}>(),queue=[{key:`user:${userId}`,rank:7,path:[`user:${userId}`]}];
 for(let i=0;i<queue.length;i++){const {key,rank,path}=queue[i];for(const m of members)if(principalKey(m)===key){const n=Math.min(rank,accessRank(m.level));if(n>(values.get(m.groupId)?.rank??0)){const next=path.concat(`group:${m.groupId}`);values.set(m.groupId,{rank:n,path:next});queue.push({key:`group:${m.groupId}`,rank:n,path:next});}}}
 return values;
}
export function membershipRights(userId:string,members:Membership[]):Map<string,number>{return new Map([...membershipPaths(userId,members)].map(([id,value])=>[id,value.rank]));}
export function resolveRecordAccess(actor:string,objectId:string,security:RecordSecurity,members:Membership[],rules:ForeignRule[],inherit=true):AccessExplanation{
 const owner=(id:string):AccessExplanation|undefined=>{
  const direct=security.owners.find(p=>p.kind==='user'&&p.id===id);
  if(direct)return {level:direct.level,source:'ownership',path:[principalKey(direct)]};
  const groups=membershipPaths(id,members);let best:AccessExplanation|undefined;
  for(const p of security.owners)if(p.kind==='group'&&groups.has(p.id)){const rank=Math.min(accessRank(p.level),groups.get(p.id)!.rank);if(rank>accessRank(best?.level??'none'))best={level:accessLevels[rank],source:'group',path:groups.get(p.id)!.path};}
  return best;
 };
 const own=owner(actor);if(own)return own;
 if(security.publicLevel&&security.publicLevel!=='none')return {level:security.publicLevel,source:'public',path:['public']};
 if(security.privacy==='personal')return {level:'none',source:'none',path:[]};
 type State={key:string;rank:number;conf:boolean;path:string[]};
 const states=new Map<string,number>(),queue:State[]=[];
 const add=(key:string,rank:number,conf:boolean,path:string[])=>{const stateKey=`${key}:${conf}`;if(rank>(states.get(stateKey)??0)){states.set(stateKey,rank);queue.push({key,rank,conf,path});}};
 add(`user:${actor}`,7,true,[`user:${actor}`]);let best:AccessExplanation={level:'none',source:'none',path:[]};
 const expandOwner=(p:Principal,rank:number,conf:boolean,path:string[])=>{
  const todo=[{p,rank,path}],seen=new Map<string,number>();
  for(let i=0;i<todo.length;i++){const item=todo[i],node=item.p,key=principalKey(node);if(item.rank<=(seen.get(key)??0))continue;seen.set(key,item.rank);add(key,item.rank,conf,item.path.concat(key));
   if(node.kind==='group')for(const m of members)if(m.groupId===node.id)todo.push({p:m,rank:Math.min(item.rank,accessRank(m.level)),path:item.path.concat(key)});
  }
 };
 for(let i=0;i<queue.length;i++){
  const state=queue[i];let rank=state.rank;
  if(state.key.startsWith('user:')){const ownership=owner(state.key.slice(5));if(ownership)rank=Math.min(rank,accessRank(ownership.level));}
  const ownership=security.owners.find(p=>principalKey(p)===state.key);
  if(ownership&&state.path.length>1&&(security.privacy!=='confidential'||state.conf)){
   const n=Math.min(rank,accessRank(ownership.level),accessRank(security.foreignMax));if(n>accessRank(best.level))best={level:accessLevels[n],source:'foreign',path:state.path};
  }
  if(inherit)for(const m of members)if(principalKey(m)===state.key)add(`group:${m.groupId}`,Math.min(rank,accessRank(m.level)),state.conf,state.path.concat(`group:${m.groupId}`));
  for(const rule of rules){if(principalKey(rule.requester)!==state.key||(!inherit&&rule.requester.kind==='group'))continue;const config=rule.objects[objectId]??rule;
   const n=Math.min(rank,accessRank(config.level));if(n)expandOwner(rule.owner,n,state.conf&&(config.confidential??rule.confidential),state.path.concat(`rule:${rule.id}`));
  }
 }
 return best;
}
