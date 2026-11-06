import type {ClassificationConfig,ClassificationFilters} from '@xobject/contracts';
export const classificationKinds=['type','status','category'] as const;
export function normalizeClassificationFilters(filters:ClassificationFilters,config:ClassificationConfig,available:readonly string[]):ClassificationFilters{
 const result:ClassificationFilters={};
 for(const kind of classificationKinds){
  if(!available.includes(kind))continue;
  const values=[...new Set(filters[kind]??[])].filter(id=>id===null||config.options.some(option=>option.kind===kind&&option.id===id)).slice(0,100);
  const eligible=kind==='status'&&result.type?.length?values.filter(id=>id===null||config.options.some(option=>option.id===id&&result.type!.includes(option.typeId))):values;
  if(eligible.length)result[kind]=eligible;
 }
 return result;
}
export function readClassificationFilters(params:URLSearchParams,config:ClassificationConfig,available:readonly string[]):ClassificationFilters{
 return normalizeClassificationFilters(Object.fromEntries(classificationKinds.map(kind=>[kind,(params.get(kind)??'').slice(0,10000).split(',').filter(Boolean).map(value=>value==='empty'?null:value)])),config,available);
}
export function classificationFilterQuery(filters:ClassificationFilters):Record<string,string|null>{
 return Object.fromEntries(classificationKinds.map(kind=>[kind,filters[kind]?.length?filters[kind]!.map(value=>value??'empty').join(','):null]));
}
