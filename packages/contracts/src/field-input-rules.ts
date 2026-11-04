import {z} from 'zod';
import {fieldValueSchema,type FieldConfig} from './field-types.js';
import {languageSchema} from './languages.js';
const translatedText=z.partialRecord(languageSchema,z.string().trim().min(1).max(2000));
export const fieldInputRulesSchema=z.object({description:translatedText.default({}),helpText:translatedText.default({}),defaultValue:fieldValueSchema.default(null),unique:z.boolean().default(false)}).strict();
export type FieldInputRules=z.infer<typeof fieldInputRulesSchema>;
export const emptyFieldInputRules=():FieldInputRules=>({description:{},helpText:{},defaultValue:null,unique:false});
export const supportsUniqueField=(kind:string,config:FieldConfig)=>!['multiline','multiple_choice','category','type','status'].includes(kind)&&!(kind==='reference'&&config.multiple);
export const numberingSchema=z.object({enabled:z.boolean(),prefix:z.string().max(80),suffix:z.string().max(80),start:z.string().regex(/^[1-9]\d{0,29}$/),increment:z.string().regex(/^[1-9]\d{0,29}$/),padding:z.number().int().min(1).max(30),restart:z.enum(['never','yearly','monthly'])}).strict();
export type Numbering=z.infer<typeof numberingSchema>;
export const defaultNumbering=():Numbering=>({enabled:false,prefix:'',suffix:'',start:'1',increment:'1',padding:1,restart:'never'});
export function numberingPeriod(config:Numbering,date:Date,timeZone:string){
 if(config.restart==='never')return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit'}).formatToParts(date),get=(type:string)=>parts.find(part=>part.type===type)!.value;
 return config.restart==='yearly'?get('year'):`${get('year')}-${get('month')}`;
}
export function formatBusinessNumber(config:Numbering,value:string,period:string){return `${config.prefix}${period?`${period}-`:''}${value.padStart(config.padding,'0')}${config.suffix}`;}

import {fieldApplies,type FieldApplicability} from './field-applicability.js';
/** Omission triggers a default; explicit null/false/zero/empty values never do. */
export function applyFieldDefaults(fields:{id:string;technicalName:string;inputRules?:FieldInputRules;applicability?:FieldApplicability}[],values:Record<string,import('./field-types.js').FieldValue>){
 const result=structuredClone(values);
 for(const conditional of [false,true])for(const field of fields)if(Boolean(field.applicability)===conditional&&!Object.hasOwn(result,field.technicalName)&&field.inputRules?.defaultValue!==null&&field.inputRules?.defaultValue!==undefined&&fieldApplies(field,fields,result))result[field.technicalName]=structuredClone(field.inputRules.defaultValue);
 return result;
}
