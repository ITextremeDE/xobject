import {uuidSchema} from './identity.js';
import { z } from 'zod';
export const fieldApplicabilitySchema=z.object({fieldId:uuidSchema,optionIds:z.array(uuidSchema).min(1).max(300).refine(ids=>new Set(ids).size===ids.length,'Duplicate applicability options')}).strict().nullable();
export type FieldApplicability=z.infer<typeof fieldApplicabilitySchema>;
export function fieldApplies(field:{applicability?:FieldApplicability},fields:{id:string;technicalName:string}[],values:Record<string,unknown>) {
  if(!field.applicability)return true;
  const source=fields.find(item=>item.id===field.applicability!.fieldId);
  return Boolean(source&&field.applicability.optionIds.includes(String(values[source.technicalName]??'')));
}
