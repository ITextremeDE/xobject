import {structuredSchemas,postalAddressSchema,type PostalAddress,parseStructuredValue,type StructuredEntry,type StructuredSchemaKey} from '@xobject/contracts';

/** A draft error in one collection item must not mark its valid siblings. */
export function structuredEntryInvalid(schema:StructuredSchemaKey,entry:StructuredEntry):boolean{
 try{parseStructuredValue(schema,[entry]);return false;}catch{return true;}
}

export type AddressInput=Exclude<keyof PostalAddress,'formatted'>|'additionalStreetLines';
export type AddressProblem={kind:'tooLong'|'tooManyLines'|'emptyLine'|'invalid';limit?:number};
/** Project shared codec paths onto the exact visible input, never onto valid siblings. */
export function addressDraftProblems(value:unknown):{empty:boolean;general:boolean;fields:Partial<Record<AddressInput,AddressProblem>>}{
 const result=postalAddressSchema.safeParse(value),fields:Partial<Record<AddressInput,AddressProblem>>={};
 let empty=false,general=false;
 if(!result.success)for(const issue of result.error.issues){
  const [component,index]=issue.path;
  if(!component){if(issue.code==='custom'&&issue.message==='Empty address')empty=true;else general=true;continue;}
  if(component==='formatted'){general=true;continue;}
  const input=component==='streetLines'&&(typeof index==='number'?index>0:issue.code==='too_big')?'additionalStreetLines':component as AddressInput;
  if(fields[input])continue;
  fields[input]=issue.code==='too_big'?{kind:issue.origin==='array'?'tooManyLines':'tooLong',limit:Number(issue.maximum)}:issue.code==='too_small'?{kind:'emptyLine'}:{kind:'invalid'};
 }
 return {empty,general,fields};
}

/** Keep a bad language tag separate from otherwise valid pronoun wording, and vice versa. */
export function pronounDraftProblems(entry:unknown):{language:boolean;value:boolean}{
 const result=structuredSchemas.pronoun_entries.safeParse([entry]);
 return {language:!result.success&&result.error.issues.some(issue=>issue.path[1]==='language'),value:!result.success&&result.error.issues.some(issue=>issue.path[1]==='value')};
}
