import {sql} from 'kysely';
import {workIssues,type WorkProfile,type ClassificationRules} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
export async function workBindings(tx:Executor,objectId:string){return (await sql<{id:string;technicalName:string;field_key:string;object_key:WorkProfile['kind']}>`SELECT f.id,f.technical_name AS "technicalName",b.field_key,b.object_key FROM sys_module_field_bindings b JOIN sys_fields f ON f.id=b.field_id WHERE f.object_type_id=${objectId}::uuid AND b.object_key IN ('project','case','task')`.execute(tx)).rows;}
export async function workProfile(tx:Executor,objectId:string):Promise<WorkProfile|undefined>{const fields=await workBindings(tx,objectId);return fields.length?{kind:fields[0].object_key,fields:Object.fromEntries(fields.map(f=>[f.field_key,f.id]))}:undefined;}
export async function validateWork(tx:Executor,objectId:string,values:Record<string,unknown>,config:ClassificationRules){
 const fields=await workBindings(tx,objectId),profile:WorkProfile|undefined=fields.length?{kind:fields[0].object_key,fields:Object.fromEntries(fields.map(f=>[f.field_key,f.id]))}:undefined;
 const issue=workIssues(profile,fields,values,config)[0];
 if(issue)throw new AppError(400,'Invalid project or task values',{code:issue.code,fieldId:issue.fieldId});
}
