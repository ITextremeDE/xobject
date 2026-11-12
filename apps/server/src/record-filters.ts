import {sql,type RawBuilder} from 'kysely';
import type {ClassificationConfig,ClassificationFilters} from '@xobject/contracts';
import type {ObjectAccess} from './content-permissions.js';
import {AppError} from './errors.js';

/** Apply visibility and business predicates before counts and pages, including empty-value filters. */
export function classificationFilterPredicate(config:ClassificationConfig,fields:{id:string;technical_name:string;state?:string}[],filters:ClassificationFilters,policy:ObjectAccess):RawBuilder<boolean>{
 const predicates:RawBuilder<boolean>[]=[];
 for(const kind of ['type','status','category'] as const){
  const selected=filters[kind];if(!selected?.length)continue;
  const field=fields.find(field=>field.technical_name===kind&&field.state==='active');
  if(!field)throw new AppError(400,'Classification filter field is unavailable');
  if(!policy.field(field.id).read)throw new AppError(403,'Cannot filter an unreadable field');
  const ids=selected.filter((id):id is string=>id!==null);
  if(ids.some(id=>!config.options.some(option=>option.id===id&&option.kind===kind)))throw new AppError(400,'Unknown classification filter choice');
  // Masked values must never match "empty". Exclude unreadable records altogether.
  if(policy.sensitive&&!policy.admin){
   predicates.push(policy.fieldPredicate(field.id));
  }
  const column=sql.ref(kind),empty=selected.includes(null);
  if(kind==='category')predicates.push(sql<boolean>`(${ids.length?sql`${column} && ${ids}::uuid[]`:sql`false`} OR ${empty?sql`cardinality(${column})=0`:sql`false`})`);
  else predicates.push(sql<boolean>`(${ids.length?sql`${column}=ANY(${ids}::uuid[])`:sql`false`} OR ${empty?sql`${column} IS NULL`:sql`false`})`);
 }
 return predicates.length?sql<boolean>`(${sql.join(predicates,sql` AND `)})`:sql<boolean>`true`;
}
