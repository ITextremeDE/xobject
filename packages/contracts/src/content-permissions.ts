import {z} from 'zod';
import {uuidSchema} from './identity.js';
export const contentLevels=['none','read','edit','delete','full'] as const;
export const contentLevelSchema=z.enum(contentLevels);
export type ContentLevel=z.infer<typeof contentLevelSchema>;
export const fieldLevelSchema=z.enum(['none','read','edit']);
export type FieldLevel=z.infer<typeof fieldLevelSchema>;
export const contentGrantSchema=z.object({kind:z.enum(['user','group']),id:z.string().min(1).max(200),level:contentLevelSchema.nullable(),fields:z.record(uuidSchema,fieldLevelSchema).default({})}).strict();
export type ContentGrant=z.infer<typeof contentGrantSchema>;
export interface ContentPermissions {objectTypeId:string;version:number;sensitive:boolean;grants:ContentGrant[]}
export interface ContentCapabilities {read:boolean;edit:boolean;delete:boolean;full:boolean}
export interface FieldCapabilities {read:boolean;edit:boolean}

/** Shared by authorization and the administrator's draft preview. Sources identify
 * the rules that win; the object cap is included when it limits a field grant. */
export function resolveContentRule(grants:ContentGrant[],actor:string,groups:string[],fieldId?:string):{level:ContentLevel;sources:ContentGrant[]} {
 const rank=(value:ContentLevel|null)=>Math.max(0,contentLevels.indexOf(value??'none'));
 const own=grants.find(g=>g.kind==='user'&&g.id===actor),members=grants.filter(g=>g.kind==='group'&&groups.includes(g.id));
 const objectRank=own?.level!=null?rank(own.level):Math.max(0,...members.map(g=>rank(g.level)));
 const objectSources=own?.level!=null?[own]:members.filter(g=>rank(g.level)===objectRank&&g.level!==null);
 if(!fieldId)return {level:contentLevels[objectRank],sources:objectSources};
 const fieldRank=(g:ContentGrant)=>Object.hasOwn(g.fields,fieldId)?g.fields[fieldId]==='edit'?2:g.fields[fieldId]==='read'?1:0:Math.min(2,rank(g.level));
 let value:number,sources:ContentGrant[];
 if(own&&Object.hasOwn(own.fields,fieldId)){value=fieldRank(own);sources=[own];}
 else if(members.some(g=>Object.hasOwn(g.fields,fieldId))){value=Math.max(0,...members.map(fieldRank));sources=members.filter(g=>fieldRank(g)===value);}
 else {value=Math.min(2,objectRank);sources=objectSources;}
 const limit=Math.min(2,objectRank);
 return {level:contentLevels[Math.min(value,limit)],sources:value>limit?objectSources:sources};
}
