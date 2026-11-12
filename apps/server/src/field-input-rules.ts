import {sql} from 'kysely';
import {isDeepStrictEqual} from 'node:util';
import {emptyFieldInputRules,supportsUniqueField,type FieldInputRules,type FieldValue} from '@xobject/contracts';
import {normalizeFieldValue,validateReferences,type TypedField,isEmptyFieldValue} from './field-types.js';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
export type InputField=TypedField&{input_rules?:FieldInputRules};
export async function normalizeInputRules(tx:Executor,field:TypedField,input:FieldInputRules,workspace:string):Promise<FieldInputRules>{
 if(input.unique&&!supportsUniqueField(field.kind,field.config))throw new AppError(400,'Uniqueness is not supported for this field type');
 if(['type','status','category','record_number','access_principals'].includes('technical_name' in field?field.technical_name:'')){
  if(input.defaultValue!==null||input.unique)throw new AppError(400,'Standard field defaults use their dedicated configuration');
  return input;
 }
 if(field.technical_name==='keyword'&&typeof input.defaultValue==='string'&&input.defaultValue.length>200)throw new AppError(400,'Default Keyword is too long');
 const value=normalizeFieldValue({...field,required:false},input.defaultValue);
 await validateReferences(tx,field,value,workspace);
 if(field.kind==='reference'&&value!==null)for(const ref of (Array.isArray(value)?value:[value]) as {kind:string;id:string}[])if(ref.kind==='user'&&!(await sql`SELECT 1 FROM sys_users u WHERE u.id=${ref.id} AND u.active AND (u.is_admin OR EXISTS(SELECT 1 FROM sys_workspace_members m WHERE m.user_id=u.id AND m.workspace_id=${workspace}::uuid))`.execute(tx)).rows.length)throw new AppError(400,'Default user is not an active workspace member');
 validateUniqueLength(field,value,input.unique);
 return {...input,defaultValue:value};
}
export function validateUniqueLength(field:TypedField,value:unknown,unique:boolean){
 if(unique&&typeof value==='string'&&Buffer.byteLength(value,'utf8')>2000)throw new AppError(400,'Unique text values may contain at most 2000 UTF-8 bytes',{code:"uniqueValueTooLong"});
}
export function uniqueIndexName(id:string){return `xobject_unique_${id.replaceAll('-','')}`;}
export async function configureUniqueIndex(tx:Executor,table:string,field:InputField){
 const index=uniqueIndexName(field.id);await sql`DROP INDEX IF EXISTS ${sql.ref(index)}`.execute(tx);
 if(!field.input_rules?.unique)return;
 const column=sql.ref(field.technical_name);
 // Same value semantics as PostgreSQL storage; text is compared ignoring case and surrounding ASCII whitespace.
 const expression=['text','email','phone','url'].includes(field.kind)?sql`NULLIF(lower(btrim(${column},chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11))), '')`:column;
 await sql`CREATE UNIQUE INDEX ${sql.ref(index)} ON ${sql.table(table)} ((${expression}))`.execute(tx);
}
export async function writeInputRules(tx:Executor,field:InputField,rules:FieldInputRules,journal:(key:string,before:unknown,after:unknown)=>Promise<void>){
 const before=field.input_rules??emptyFieldInputRules();
 if(isDeepStrictEqual(before,rules))return false;
 await sql`UPDATE sys_fields SET input_rules=${JSON.stringify(rules)}::jsonb WHERE id=${field.id}::uuid`.execute(tx);
 for(const key of ['description','helpText','defaultValue','unique'] as const)if(!isDeepStrictEqual(before[key],rules[key]))await journal(`input.${key}`,before[key],rules[key]);
 return true;
}
