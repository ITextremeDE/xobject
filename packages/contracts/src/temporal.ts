import {Temporal} from '@js-temporal/polyfill';
import {z} from 'zod';
import {timeZoneSchema} from './time-zones.js';
export function timestampCandidates(value:string,timeZone:string):string[]{
 try{const plain=Temporal.PlainDateTime.from(value);return [...new Set((['earlier','later'] as const).map(disambiguation=>plain.toZonedDateTime(timeZone,{disambiguation})).filter(result=>result.toPlainDateTime().equals(plain)).map(result=>result.toInstant().toString({fractionalSecondDigits:3})))];}catch{return [];}
}
export const temporalSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('date'),date:z.iso.date().refine(value=>!value.startsWith('0000'))}).strict(),
 z.object({kind:z.literal('instant'),instant:z.iso.datetime({offset:true,precision:undefined}).refine(value=>!value.startsWith('0000')&&!/\.\d{4}/.test(value)&&/^(?!0000)\d{4}-/.test(Temporal.Instant.from(value).toString())).transform(value=>Temporal.Instant.from(value).toString({fractionalSecondDigits:3}))}).strict(),
 z.object({kind:z.literal('zoned'),local:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/).refine(value=>{try{return !value.startsWith('0000')&&Temporal.PlainDateTime.from(value).toString()!=='';}catch{return false;}}),timeZone:timeZoneSchema,occurrence:z.enum(['earlier','later']).nullable()}).strict()
]).superRefine((value,ctx)=>{if(value.kind==='zoned'){const candidates=timestampCandidates(value.local,value.timeZone);if(!candidates.length|| (candidates.length===2?value.occurrence===null:value.occurrence!==null))ctx.addIssue({code:'custom',message:candidates.length===2?'Choose an occurrence for this overlapping time':'Invalid local time or occurrence'});}});
export type TemporalValue=z.infer<typeof temporalSchema>;
export function temporalInstant(value:Exclude<TemporalValue,{kind:'date'}>):string{return value.kind==='instant'?value.instant:timestampCandidates(value.local,value.timeZone)[value.occurrence==='later'?1:0]!;}
export function compareTemporal(start:TemporalValue,end:TemporalValue):number|undefined{
 if(start.kind!==end.kind)return undefined;
 if(start.kind==='date'&&end.kind==='date')return Temporal.PlainDate.compare(start.date,end.date);
 if(start.kind!=='date'&&end.kind!=='date')return Temporal.Instant.compare(temporalInstant(start),temporalInstant(end));
 return undefined;
}
