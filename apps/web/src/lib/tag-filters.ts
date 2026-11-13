import {tagFiltersSchema,type TagFilters} from '@xobject/contracts';
export function readTagFilters(params:URLSearchParams,fieldIds:string[]):TagFilters{
 try{const result=tagFiltersSchema.safeParse(JSON.parse(params.get('tags')??'[]'));return result.success?result.data.filter(f=>fieldIds.includes(f.fieldId)):[];}catch{return [];}
}
export function tagFilterQuery(filters:TagFilters):string|null{return filters.length?JSON.stringify(filters):null;}
