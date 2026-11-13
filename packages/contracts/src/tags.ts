import {z} from 'zod';
export const maxTags=100,maxTagLength=200;
export const tagTextSchema=z.string().trim().min(1).max(maxTagLength).refine(value=>!/[\r\n,\u0000-\u001f\u007f]/u.test(value),'A tag is a single text without commas or control characters');
export const tagFiltersSchema=z.array(z.object({fieldId:z.uuid(),values:z.array(tagTextSchema.nullable()).min(1).max(maxTags)}).strict()).max(50).refine(filters=>new Set(filters.map(f=>f.fieldId)).size===filters.length,'Duplicate tag filter');
export type TagFilters=z.infer<typeof tagFiltersSchema>;
/** Contents keep their spelling; whitespace and Unicode composition cannot create duplicate chips. */
export function normalizeTags(value:unknown):string[]{
 const input=z.array(tagTextSchema).max(maxTags).parse(value),seen=new Set<string>();
 return input.map(v=>v.trim().normalize('NFC').replace(/\s+/gu,' ')).filter(v=>{const key=v.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}
