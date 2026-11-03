import {uuidSchema} from './identity.js';
import { z } from 'zod';
import type { RelatedRecord } from './record-relationships.js';
export const primaryChainRoles = ['contact', 'project', 'case'] as const;
export type PrimaryChainRole = typeof primaryChainRoles[number];
export const primaryChainSchema = z.object({contact:uuidSchema,project:uuidSchema,case:uuidSchema}).strict().refine(value=>new Set(Object.values(value).map(id=>id.toLowerCase())).size===3,'Primary levels require different object types');
export type PrimaryChain = z.infer<typeof primaryChainSchema>;
export interface PrimaryChainContext { configuration: PrimaryChain | null; levels: { role:PrimaryChainRole;objectTypeId:string;record:RelatedRecord|null;inherited:boolean }[]; direct:RelatedRecord|null }
export function primaryPairAllowed(chain:PrimaryChain,parentObject:string,childObject:string) {
  const ids=primaryChainRoles.map(role=>chain[role].toLowerCase()),parent=ids.indexOf(parentObject.toLowerCase()),child=ids.indexOf(childObject.toLowerCase());
  return parent>=0&&(child<0||parent<child);
}
export function primaryRolesForObject(chain:PrimaryChain,objectTypeId:string) {
  const source=primaryChainRoles.findIndex(role=>chain[role].toLowerCase()===objectTypeId.toLowerCase());
  return primaryChainRoles.filter((_,index)=>source<0||index<source);
}
