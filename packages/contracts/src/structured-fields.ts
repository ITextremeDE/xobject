import {z} from 'zod';
import {uuidSchema} from './identity.js';

export const structuredSchemaKeys=['name_components','email_entries','phone_entries','address_entries','url_entries','partial_date'] as const;
export const structuredSchemaKey=z.enum(structuredSchemaKeys);
export type StructuredSchemaKey=z.infer<typeof structuredSchemaKey>;
const component=z.string().trim().min(1).max(200);
const contexts=z.array(uuidSchema).max(100).refine(ids=>new Set(ids).size===ids.length,'Duplicate contexts');
const metadata={id:uuidSchema,contexts,preference:z.number().int().min(1).max(100).nullable().default(null)};
const address=z.object({poBox:z.string().max(200),extended:z.string().max(200),streetLines:z.array(component).max(20),houseNumber:z.string().max(100),postalCode:z.string().max(100),locality:z.string().max(200),region:z.string().max(200),country:z.string().max(200),formatted:z.string().max(2000)}).strict().refine(a=>a.streetLines.length>0||Object.values(a).some(v=>typeof v==='string'&&v.trim()),'Empty address');
const entries=<T extends z.ZodType<{id:string}>>(entry:T,limit=100)=>z.array(entry).max(limit).refine(items=>new Set(items.map(item=>item.id.toLowerCase())).size===items.length,'Duplicate entry identity');
export const structuredSchemas={
 name_components:entries(z.object({id:uuidSchema,text:component}).strict(),20),
 email_entries:entries(z.object({...metadata,value:z.email().max(1000)}).strict()),
 phone_entries:entries(z.object({...metadata,value:z.string().max(100).regex(/^\+[\d ()-]+$/)}).strict()),
 url_entries:entries(z.object({...metadata,value:z.url({protocol:/^https?$/}).max(2000)}).strict()),
 address_entries:entries(z.object({...metadata,address}).strict()),
 partial_date:z.object({month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31),year:z.number().int().min(1).max(9999).nullable()}).strict().refine(p=>{const year=p.year??2000;return p.day<=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][p.month-1];},'Invalid birthday'),
};
export const structuredValueSchema=z.union([structuredSchemas.name_components,structuredSchemas.email_entries,structuredSchemas.phone_entries,structuredSchemas.url_entries,structuredSchemas.address_entries,structuredSchemas.partial_date]);
export type StructuredValue=z.infer<typeof structuredValueSchema>;
export type StructuredEntry=Exclude<StructuredValue,{month:number}>[number];
export function parseStructuredValue(schema:StructuredSchemaKey,input:unknown):StructuredValue{
 const value=structuredSchemas[schema].parse(input);
 if(new TextEncoder().encode(JSON.stringify(value)).length>262144)throw new Error('Structured field exceeds 256 KiB');
 return value as StructuredValue;
}
export const structuredSchemaLabels:Record<StructuredSchemaKey,{en:string;de:string}>={
 name_components:{en:'Name components',de:'Namensbestandteile'},email_entries:{en:'Email addresses',de:'E-Mail-Adressen'},phone_entries:{en:'Telephone numbers',de:'Telefonnummern'},address_entries:{en:'Postal addresses',de:'Postanschriften'},url_entries:{en:'Websites',de:'Webseiten'},partial_date:{en:'Birthday (optional year)',de:'Geburtsdatum (Jahr optional)'},
};
export function structuredSummary(schema:StructuredSchemaKey,value:unknown):string{
 if(value===null||value===undefined)return '—';
 if(schema==='partial_date'){const p=value as {month:number;day:number;year:number|null};return `${p.year===null?'--':String(p.year).padStart(4,'0')+'-'}${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
 return (value as StructuredEntry[]).map(entry=>'text'in entry?entry.text:'value'in entry?entry.value:[...entry.address.streetLines,entry.address.houseNumber,entry.address.postalCode,entry.address.locality,entry.address.country].filter(Boolean).join(' ')).join('; ')||'—';
}

/** Describe one field event without converting entry moves into value changes. */
export function structuredChanges(before:unknown,after:unknown):{entryId?:string;path:string}[]{
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const changes:{entryId?:string;path:string}[]=[];
 function walk(a:unknown,b:unknown,path:string,entryId?:string){
  if(same(a,b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   const old=a as Record<string,unknown>,next=b as Record<string,unknown>;
   for(const key of new Set([...Object.keys(old),...Object.keys(next)]))walk(old[key],next[key],path?`${path}.${key}`:key,entryId);
  }else changes.push({...entryId?{entryId}:{},path:path||'$value'});
 }
 if((before===null||Array.isArray(before))&&(after===null||Array.isArray(after))){
  const old=(before??[]) as {id:string}[],next=(after??[]) as {id:string}[];
  if(!same(old.map(e=>e.id),next.map(e=>e.id)))changes.push({path:'$order'});
  for(const id of new Set([...old.map(e=>e.id),...next.map(e=>e.id)]))walk(old.find(e=>e.id===id),next.find(e=>e.id===id),'',id);
 }else walk(before,after,'');
 return changes;
}
