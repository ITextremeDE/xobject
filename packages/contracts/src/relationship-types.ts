import {uuidSchema} from './identity.js';
import {fieldApplicabilitySchema} from './field-applicability.js';
import { z } from 'zod';
import { languageSchema } from './languages.js';
const labels = z.partialRecord(languageSchema, z.string().trim().min(1).max(200)).refine(value => Object.keys(value).length > 0, 'A label is required');
export const relationshipConfigurationSchema = z.object({
  labels, leftLabels: labels, rightLabels: labels,
  leftApplicability:fieldApplicabilitySchema.optional(),rightApplicability:fieldApplicabilitySchema.optional(),
  directed: z.boolean(), leftMin: z.union([z.literal(0), z.literal(1)]), leftMax: z.literal(1).nullable(), rightMin: z.union([z.literal(0), z.literal(1)]), rightMax: z.literal(1).nullable(),
  allowAll: z.boolean(), pairs: z.array(z.object({ leftObjectTypeId: uuidSchema, rightObjectTypeId: uuidSchema }).strict()).max(200), active: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.allowAll && value.pairs.length) ctx.addIssue({ code: 'custom', message: 'Unrestricted relationships cannot have object pairs', path: ['pairs'] });
  const keys = value.pairs.map(pair => value.directed ? `${pair.leftObjectTypeId}:${pair.rightObjectTypeId}` : [pair.leftObjectTypeId, pair.rightObjectTypeId].sort().join(':'));
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate object pairs', path: ['pairs'] });
  const left = new Set(value.pairs.map(pair => pair.leftObjectTypeId));
  const symmetric = !value.directed && (value.allowAll || value.pairs.some(pair => left.has(pair.rightObjectTypeId)));
  if (symmetric && JSON.stringify(Object.entries(value.leftLabels).sort()) !== JSON.stringify(Object.entries(value.rightLabels).sort())) ctx.addIssue({ code: 'custom', message: 'Symmetric relationships need equal side labels', path: ['rightLabels'] });
  if(symmetric&&JSON.stringify(value.leftApplicability??null)!==JSON.stringify(value.rightApplicability??null))ctx.addIssue({code:'custom',message:'Symmetric relationships need equal endpoint conditions',path:['rightApplicability']});
  if (symmetric && (value.leftMin !== value.rightMin || value.leftMax !== value.rightMax)) ctx.addIssue({ code: 'custom', message: 'Symmetric relationships need equal cardinalities', path: ['rightMax'] });
});
export type RelationshipConfiguration = z.infer<typeof relationshipConfigurationSchema>;
export interface RelationshipType extends RelationshipConfiguration { id: string; workspaceId: string; technicalName: string; kind: 'primary' | 'general' | 'custom'; rulesState: 'draft' | 'active'; version: number; pairLocked?: boolean }

export const customRelationshipConfigurationSchema = relationshipConfigurationSchema.refine(value=>!value.allowAll&&value.pairs.length===1,{message:"Custom relationships require exactly one object pair",path:["pairs"]});
export interface WorkspaceModule {key:"projects";enabled:boolean;version:number;primaryChain:import('./primary-chain.js').PrimaryChain|null}
