import {sql} from 'kysely';
import {normalizeTags,type TagFilters} from '@xobject/contracts';
import type {Executor} from './database.js';
import {contentAccess} from './content-permissions.js';
import {AppError} from './errors.js';

export async function tagFilterPredicate(objectTypeId:string,fields:{id:string;technical_name:string;kind:string;state?:string}[],filters:TagFilters){
 const policy=await contentAccess().require(objectTypeId,undefined),parts=[];
 for(const filter of filters){
  const field=fields.find(f=>f.id===filter.fieldId&&f.kind==='tags'&&f.state!=='deleted'&&f.state!=='inactive');
  if(!field)throw new AppError(400,'Unknown tags field');
  if(!policy.field(field.id).read)throw new AppError(403,'Cannot filter an unreadable field');
  const value=await contentAccess().fieldValueByName(objectTypeId,field.technical_name),texts=normalizeTags(filter.values.filter((v):v is string=>v!==null)),empty=filter.values.includes(null);
  parts.push(sql`${policy.fieldPredicate(field.id)} AND (${empty?sql`COALESCE(cardinality(${value}),0)=0`:sql`false`} OR EXISTS(SELECT 1 FROM unnest(${value}) AS tag(value) WHERE lower(tag.value)=ANY(SELECT lower(input.value) FROM unnest(${texts}::text[]) AS input(value))))`);
 }
 return parts.length?sql`(${sql.join(parts,sql` AND `)})`:sql`true`;
}
export async function listFieldTags(tx:Executor,args:{objectTypeId:string;fieldId:string;query:string;limit:number}){
 const policy=await contentAccess().require(args.objectTypeId,undefined);
 const field=(await sql<{technical_name:string}>`SELECT technical_name FROM sys_fields WHERE object_type_id=${args.objectTypeId}::uuid AND id=${args.fieldId}::uuid AND kind='tags' AND state='active'`.execute(tx)).rows[0];
 if(!field)throw new AppError(400,'Unknown tags field');
 if(!policy.field(args.fieldId).read)throw new AppError(403,'Cannot suggest values from an unreadable field');
 const value=await contentAccess().fieldValueByName(args.objectTypeId,field.technical_name,'r');
 const values=(await sql<{value:string}>`SELECT value FROM (SELECT DISTINCT ON (lower(tag.value)) tag.value FROM ${sql.table(policy.table)} r CROSS JOIN LATERAL unnest(${value}) AS tag(value) WHERE ${policy.predicate('r')} AND ${policy.fieldPredicate(args.fieldId,'r')} AND position(lower(${args.query.normalize('NFC')}) IN lower(tag.value))>0 ORDER BY lower(tag.value),tag.value) AS choices ORDER BY value LIMIT ${args.limit+1}`.execute(tx)).rows;
 return {values:values.slice(0,args.limit).map(v=>v.value),hasMore:values.length>args.limit};
}
