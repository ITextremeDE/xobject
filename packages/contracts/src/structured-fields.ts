import {temporalSchema} from './temporal.js';
import {z} from 'zod';
import {timeZoneSchema} from './time-zones.js';
import {uuidSchema} from './identity.js';

export const structuredSchemaKeys=['name_components','pronoun_entries','email_entries','phone_entries','address_entries','url_entries','language_entries','messenger_entries','time_zone','partial_date','temporal'] as const;
export const structuredSchemaKey=z.enum(structuredSchemaKeys);
export type StructuredSchemaKey=z.infer<typeof structuredSchemaKey>;
const component=z.string().trim().min(1).max(200);
const contexts=z.array(uuidSchema).max(100).refine(ids=>new Set(ids).size===ids.length,'Duplicate contexts');
const metadata={id:uuidSchema,contexts,preference:z.number().int().min(1).max(100).nullable().default(null)};
export const postalAddressLimits={poBox:200,extended:200,streetLines:200,houseNumber:100,postalCode:100,locality:200,region:200,country:200,formatted:2000} as const;
export const postalAddressLineLimit=20;
export const postalAddressSchema=z.object({
 poBox:z.string().max(postalAddressLimits.poBox),extended:z.string().max(postalAddressLimits.extended),
 streetLines:z.array(z.string().trim().min(1).max(postalAddressLimits.streetLines)).max(postalAddressLineLimit),
 houseNumber:z.string().max(postalAddressLimits.houseNumber),postalCode:z.string().max(postalAddressLimits.postalCode),
 locality:z.string().max(postalAddressLimits.locality),region:z.string().max(postalAddressLimits.region),
 country:z.string().max(postalAddressLimits.country),formatted:z.string().max(postalAddressLimits.formatted)
}).strict().refine(a=>a.streetLines.length>0||Object.values(a).some(v=>typeof v==='string'&&v.trim()),'Empty address');
export type PostalAddress=z.infer<typeof postalAddressSchema>;
/** A readable component projection, not a country-specific postal-delivery formatter. */
export function postalAddressLines(address:PostalAddress,poBoxLabel='PO Box'):string[]{
 const street=address.streetLines.map(line=>line.trim());
 const lines=[address.extended.trim(),[street[0],address.houseNumber.trim()].filter(Boolean).join(' '),...street.slice(1),address.poBox.trim()?`${poBoxLabel}: ${address.poBox.trim()}`:'',[address.postalCode.trim(),address.locality.trim()].filter(Boolean).join(' '),address.region.trim(),address.country.trim()].filter(Boolean);
 return lines.length?lines:address.formatted.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
}
const entries=<T extends z.ZodType<{id:string}>>(entry:T,limit=100)=>z.array(entry).max(limit).refine(items=>new Set(items.map(item=>item.id.toLowerCase())).size===items.length,'Duplicate entry identity');
export const communicationLanguage=z.string().trim().min(1).max(100).transform((value,ctx)=>{
 try{return Intl.getCanonicalLocales(value)[0]!;}catch{ctx.addIssue({code:'custom',message:'Invalid communication language tag'});return z.NEVER;}
});
export const messagingURI=z.string().trim().min(1).max(2000).refine(value=>{
 try{const uri=new URL(value);return ['xmpp:','sip:','sips:','im:','irc:','ircs:','matrix:','skype:','https:','http:'].includes(uri.protocol)&&value.length>uri.protocol.length&&!/\s/.test(value)&&!uri.password;}catch{return false;}
},'Unsupported messaging URI');
export const structuredSchemas={
 temporal:temporalSchema,
 pronoun_entries:entries(z.object({id:uuidSchema,language:communicationLanguage,value:z.string().trim().min(1).max(200)}).strict(),20),
 language_entries:entries(z.object({...metadata,value:communicationLanguage}).strict()),
 messenger_entries:entries(z.object({...metadata,value:messagingURI}).strict()),
 time_zone:z.object({timeZone:timeZoneSchema}).strict(),
 name_components:entries(z.object({id:uuidSchema,text:component}).strict(),20),
 email_entries:entries(z.object({...metadata,value:z.email().max(1000)}).strict()),
 phone_entries:entries(z.object({...metadata,value:z.string().max(100).regex(/^\+[\d ()-]+$/)}).strict()),
 url_entries:entries(z.object({...metadata,value:z.url({protocol:/^https?$/}).max(2000)}).strict()),
 address_entries:entries(z.object({...metadata,address:postalAddressSchema}).strict()),
 partial_date:z.object({month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31),year:z.number().int().min(1).max(9999).nullable()}).strict().refine(p=>{const year=p.year??2000;return p.day<=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][p.month-1];},'Invalid partial date'),
};
export const structuredValueSchema=z.union([structuredSchemas.temporal,structuredSchemas.pronoun_entries,structuredSchemas.name_components,structuredSchemas.email_entries,structuredSchemas.phone_entries,structuredSchemas.url_entries,structuredSchemas.address_entries,structuredSchemas.partial_date,structuredSchemas.language_entries,structuredSchemas.messenger_entries,structuredSchemas.time_zone]);
export type StructuredValue=z.infer<typeof structuredValueSchema>;
export type StructuredEntry=Extract<StructuredValue,{id:string}[]>[number];
export function parseStructuredValue(schema:StructuredSchemaKey,input:unknown):StructuredValue{
 const value=structuredSchemas[schema].parse(input);
 if(new TextEncoder().encode(JSON.stringify(value)).length>262144)throw new Error('Structured field exceeds 256 KiB');
 return value as StructuredValue;
}
export const structuredSchemaLabels:Record<StructuredSchemaKey,{en:string;de:string}>={
 pronoun_entries:{en:'Pronouns by language',de:'Pronomen nach Sprache'},
 temporal:{en:'Date or time',de:'Datum oder Zeitpunkt'},
 name_components:{en:'Name components',de:'Namensbestandteile'},email_entries:{en:'Email addresses',de:'E-Mail-Adressen'},phone_entries:{en:'Telephone numbers',de:'Telefonnummern'},address_entries:{en:'Postal addresses',de:'Postanschriften'},url_entries:{en:'Websites',de:'Webseiten'},language_entries:{en:'Communication languages',de:'Kommunikationssprachen'},messenger_entries:{en:'Messenger addresses',de:'Messenger-Adressen'},time_zone:{en:'Named time zone',de:'Benannte Zeitzone'},partial_date:{en:'Date (optional year)',de:'Datum (Jahr optional)'},
};
export function structuredSummary(schema:StructuredSchemaKey,value:unknown):string{
 if(value===null||value===undefined)return '—';
 if(schema==='temporal'){const p=temporalSchema.parse(value);return p.kind==='date'?p.date:p.kind==='instant'?p.instant:`${p.local} [${p.timeZone}]${p.occurrence?' · '+p.occurrence:''}`;}
 if(schema==='time_zone')return (value as {timeZone:string}).timeZone;
 if(schema==='partial_date'){const p=value as {month:number;day:number;year:number|null};return `${p.year===null?'--':String(p.year).padStart(4,'0')+'-'}${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
 return (value as StructuredEntry[]).map(entry=>'text'in entry?entry.text:'value'in entry?('language'in entry?`${entry.language}: ${entry.value}`:entry.value):postalAddressLines(entry.address).join(', ')).join('; ')||'—';
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

export type StructuredOptionGroup='usage'|'phone_type'|'messenger_type';
/** Codec-owned dimensions; option identities and translated labels remain field metadata. */
export function structuredOptionGroups(schema:StructuredSchemaKey|undefined):StructuredOptionGroup[]{
 return schema==='phone_entries'?['usage','phone_type']:schema==='messenger_entries'?['usage','messenger_type']:[];
}
