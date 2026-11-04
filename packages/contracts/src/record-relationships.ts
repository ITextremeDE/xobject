import {uuidSchema} from './identity.js';
import { z } from 'zod';
import type { ClassificationOption } from './classification.js';
import type { RelationshipType } from './relationship-types.js';
export const recordReferenceSchema = z.object({ objectTypeId: uuidSchema, recordId: uuidSchema }).strict();
export const relationshipWriteSchema = z.object({ relationshipTypeId: uuidSchema, version: z.number().int().positive(), side: z.enum(['left', 'right']), targets: z.array(recordReferenceSchema).max(1000) }).strict();
export const relationshipWritesSchema = z.array(relationshipWriteSchema).max(200);
export type RelationshipWrite = z.infer<typeof relationshipWriteSchema>;
export type RecordReference = z.infer<typeof recordReferenceSchema>;
export interface RelatedRecord extends RecordReference { keyword: string; objectTechnicalName: string; objectLabels: Record<string,string>; state: 'active' | 'inactive' }
export interface RelationshipField { editable?:boolean;restricted?:boolean; definition: RelationshipType; side: 'left' | 'right'; targets: RelatedRecord[] }
export interface RecordRelationship { id: string; definition: RelationshipType; left: RelatedRecord; right: RelatedRecord }
export interface DossierEntry {
  id: string;
  definition: RelationshipType;
  record: RelatedRecord & { type: string | null; status: string | null; category: string[]; classificationOptions: ClassificationOption[] };
}
export interface RecordRelationships { primaryChain?:import('./primary-chain.js').PrimaryChain|null; fields: RelationshipField[]; edges: RecordRelationship[]; dossier: DossierEntry[] }

export interface RelationshipTreeChild {
  edgeId: string;
  record: RelatedRecord;
  relationshipTypeId: string;
  kind: 'primary';
  labels: Record<string,string>;
  sideLabels: Record<string,string>;
  direction: 'outgoing';
  hasChildren: boolean;
}
export interface RelationshipTreeBranch {
  record: RelatedRecord;
  ancestors: RelatedRecord[];
  ancestorsTruncated: boolean;
  children: RelationshipTreeChild[];
  total: number;
  limit: number;
  offset: number;
}

export const linkedRecordSourceSchema=z.object({objectTypeId:uuidSchema,recordId:uuidSchema,recordVersion:z.number().int().positive(),relationshipTypeId:uuidSchema,version:z.number().int().positive(),side:z.enum(['left','right'])}).strict();
export type LinkedRecordSource=z.infer<typeof linkedRecordSourceSchema>;
export interface RecordLinkOption {objectType:{id:string;technicalName:string;labels:Record<string,string>};relationships:{relationshipTypeId:string;side:'left'|'right';canCreate:boolean;canLink?:boolean}[]}
export function oppositeRelationshipSide(type:RelationshipType,side:'left'|'right'):'left'|'right'{
 const symmetric=!type.directed&&(type.allowAll||type.pairs.some(p=>type.pairs.some(other=>other.leftObjectTypeId===p.rightObjectTypeId)));
 return symmetric?'left':side==='left'?'right':'left';
}
