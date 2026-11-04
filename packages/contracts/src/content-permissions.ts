import {accessLevels,accessLevelSchema,accessRank} from './ownership.js';
import {z} from 'zod';
import {uuidSchema} from './identity.js';
export const contentLevels=accessLevels;
export const contentLevelSchema=z.enum(contentLevels);
export type ContentLevel=z.infer<typeof contentLevelSchema>;
export const fieldLevelSchema=z.enum(['none','read','edit']);
export type FieldLevel=z.infer<typeof fieldLevelSchema>;
export const contentGrantSchema=z.object({kind:z.enum(['user','group']),id:z.string().min(1).max(200),level:contentLevelSchema.nullable(),create:z.boolean().nullable().optional(),fields:z.record(uuidSchema,fieldLevelSchema).default({})}).strict();
export type ContentGrant=z.infer<typeof contentGrantSchema>;
export interface ContentPermissions {objectTypeId:string;version:number;sensitive:boolean;grants:ContentGrant[]}
export interface ContentCapabilities {read:boolean;edit:boolean;delete:boolean;full:boolean;create?:boolean;duplicate?:boolean;schedule?:boolean}
export interface FieldCapabilities {read:boolean;edit:boolean;create?:boolean}

/** Shared by authorization and the administrator's draft preview. Sources identify
 * the rules that win; the object cap is included when it limits a field grant. */
export function resolveContentRule(grants:ContentGrant[],actor:string,groups:string[],fieldId?:string):{level:ContentLevel;sources:ContentGrant[]} {
 const rank=(value:ContentLevel|null)=>Math.max(0,contentLevels.indexOf(value??'none'));
 const own=grants.find(g=>g.kind==='user'&&g.id===actor),members=grants.filter(g=>g.kind==='group'&&groups.includes(g.id));
 const objectRank=own?.level!=null?rank(own.level):Math.max(0,...members.map(g=>rank(g.level)));
 const objectSources=own?.level!=null?[own]:members.filter(g=>rank(g.level)===objectRank&&g.level!==null);
 if(!fieldId)return {level:contentLevels[objectRank],sources:objectSources};
 const fieldRank=(g:ContentGrant)=>Object.hasOwn(g.fields,fieldId)?g.fields[fieldId]==='edit'?5:g.fields[fieldId]==='read'?2:0:(rank(g.level)>=5?5:rank(g.level)>=2?2:0);
 let value:number,sources:ContentGrant[];
 if(own&&Object.hasOwn(own.fields,fieldId)){value=fieldRank(own);sources=[own];}
 else if(members.some(g=>Object.hasOwn(g.fields,fieldId))){value=Math.max(0,...members.map(fieldRank));sources=members.filter(g=>fieldRank(g)===value);}
 else {value=objectRank>=5?5:objectRank>=2?2:0;sources=objectSources;}
 const limit=objectRank>=5?5:objectRank>=2?2:0;
 return {level:contentLevels[Math.min(value,limit)],sources:value>limit?objectSources:sources};
}
