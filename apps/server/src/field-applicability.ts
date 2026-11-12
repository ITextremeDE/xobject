import { sql } from 'kysely';
import type { Executor } from './database.js';
import type { FieldApplicability } from '@xobject/contracts';
import { AppError } from './errors.js';
export type ApplicableField={id:string;technical_name:string;applicability?:FieldApplicability};
export function applies(field:ApplicableField,fields:ApplicableField[],record:Record<string,unknown>) {
  if(!field.applicability)return true;
  const source=fields.find(item=>item.id===field.applicability!.fieldId);
  return Boolean(source&&field.applicability.optionIds.includes(String(record[source.technical_name]??'')));
}
export async function validateApplicability(tx:Executor,objectTypeId:string,fieldId:string,rule:FieldApplicability|undefined) {
  if(!rule)return;
  if(rule.fieldId===fieldId)throw new AppError(400,'Applicability cannot reference itself');
  const source=(await sql<{kind:string;config:{options?:{id:string}[]};applicability:unknown}>`SELECT kind,config,applicability FROM sys_fields WHERE id=${rule.fieldId}::uuid AND object_type_id=${objectTypeId}::uuid AND state='active'`.execute(tx)).rows[0];
  if(!source||source.kind!=='single_choice'||source.applicability)throw new AppError(400,'Applicability requires an unconditional active single-choice field',{code:"fieldApplicabilityDependency"});
  if(rule.optionIds.some(id=>!source.config.options?.some(option=>option.id===id)))throw new AppError(400,'Unknown applicability option',{code:"fieldApplicabilityDependency"});
  if((await applicabilityDependents(tx,fieldId)).length)throw new AppError(400,'Applicability controller must remain unconditional',{code:"fieldApplicabilityDependency"});
}
export async function applicabilityDependents(tx:Executor,fieldId:string) {
  return (await sql`SELECT id FROM sys_fields WHERE state<>'deleted' AND applicability->>'fieldId'=${fieldId} UNION SELECT id FROM sys_relationship_types WHERE left_applicability->>'fieldId'=${fieldId} OR right_applicability->>'fieldId'=${fieldId}`.execute(tx)).rows;
}
