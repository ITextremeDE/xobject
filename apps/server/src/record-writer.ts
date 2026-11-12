import type {z} from 'zod';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {schemas,applyFieldDefaults,isCustomFieldKind,type FieldValue} from '@xobject/contracts';
import type {Executor} from './database.js';
import type {ObjectType,Field,DataRecord} from './domain-types.js';
import {AppError} from './errors.js';
import {recordCreationRequest} from './record-creation.js';
import {contentAccess} from './content-permissions.js';
import {resolveChoices,effectiveClassification} from './classification.js';
import {normalizeFieldValue,storedParameter} from './field-types.js';
import {normalizeInputRules} from './field-input-rules.js';
import {allocateRecordNumber} from './record-numbering.js';
import {validateContact} from './contact-domain.js';
import {validateWork} from './work-domain.js';
import {initializeRecordSecurity} from './record-security.js';
import {linkedRecordWrites,writeRecordRelationships} from './record-relationships.js';
import {writeContactInheritance} from './contact-inheritance.js';
export interface RecordWriterServices {
 objectType(tx:Executor,id:string):Promise<ObjectType>;
 fields(tx:Executor,type:ObjectType,args:Record<string,FieldValue>):Promise<Field[]>;
 checkStandardValues(fields:Field[],keyword:string|undefined,classification:Record<string,unknown>):void;
 checkRequiredPermissions(type:ObjectType,fields:Field[],data:Record<string,FieldValue>):Promise<void>;
 normalizeRecordFields(tx:Executor,type:ObjectType,fields:Field[],data:Record<string,FieldValue>):Promise<void>;
 record(tx:Executor,type:ObjectType,id:string):Promise<DataRecord>;
 journal(tx:Executor,actor:string,workspace:string|null,type:string|null,entityKind:string,entityId:string,changeId:string,key:string,before:unknown,after:unknown,fieldId?:string|null):Promise<void>;
}
/** UI, API, MCP and conversion workflows share this one atomic creation writer. */
export async function createRecord(services:RecordWriterServices,tx:Executor,args:z.infer<typeof schemas.create_record>,actor:string,changeId?:string){
    const type = await services.objectType(tx, args.objectTypeId);
    await contentAccess().require(type.id,undefined,'create');
    const receipt=await recordCreationRequest(tx,actor,args.requestId,args);
    if(receipt?.previous){
      if(receipt.previous.object_type_id!==type.id)throw new AppError(409,'Creation request key was already used for different input',{code:'creation_request_conflict'});
      // Reapply current read rights; never replay stale business data from a cached response.
      await contentAccess().require(type.id,receipt.previous.record_id);
      return contentAccess().project(type.id,await services.record(tx,type,receipt.previous.record_id));
    }
    if(args.duplicateFrom){await contentAccess().require(type.id,args.duplicateFrom.recordId,'duplicate');const source=await services.record(tx,type,args.duplicateFrom.recordId);if(source.version!==args.duplicateFrom.version)throw new AppError(409,'Record version conflict',{code:"version_conflict"});}
    const fields = await services.fields(tx, type, args.values);
    services.checkStandardValues(fields, args.keyword, args.classification);
    const policy=await contentAccess().require(type.id,undefined,'create');
    await contentAccess().checkWrites(type.id,{...args.values,...args.classification,...(args.keyword!==undefined?{keyword:args.keyword}:{})});
    const id = v7();
    const choices = resolveChoices(effectiveClassification(type.classification, fields), args.classification);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))), ...(fields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? { keyword: args.keyword ?? '' } : {}) };
    for(const field of fields.filter(f=>f.state==='active'&&!f.applicability&&isCustomFieldKind(f.kind)&&Object.hasOwn(data,f.technical_name)))data[field.technical_name]=normalizeFieldValue({...field,required:false},data[field.technical_name]);
    const suppliedNames=new Set([...Object.keys(args.values),...Object.keys(args.classification),...(args.keyword===undefined?[]:['keyword'])]);
    const defaultFields=fields.map(field=>({...field,technicalName:field.technical_name,inputRules:field.state==='active'&&policy.creationField(field.id)?field.input_rules:undefined}));
    if(args.keyword===undefined)delete data.keyword;
    Object.assign(data,applyFieldDefaults(defaultFields,data));
    for(const field of fields)if(!suppliedNames.has(field.technical_name)&&Object.hasOwn(data,field.technical_name)&&field.input_rules?.defaultValue!==null&&field.input_rules?.defaultValue!==undefined)await normalizeInputRules(tx,field,field.input_rules,type.workspace_id);
    if(fields.some(field=>field.state==='active'&&field.technical_name==='keyword')&&!Object.hasOwn(data,'keyword'))data.keyword='';
    const recordNumber=await allocateRecordNumber(tx,type.id,id,type.numbering,type.time_zone);
    if(recordNumber!==undefined)data.record_number=recordNumber;
    for(const f of fields)if(f.value_mode==='derived')delete data[f.technical_name];
    await services.checkRequiredPermissions(type,fields,data);
    await services.normalizeRecordFields(tx, type, fields, data);
    await validateContact(tx,type.id,data);
    await validateWork(tx,type.id,data,type.classification);
    for(const f of fields)if(f.value_mode==='derived')delete data[f.technical_name];
    const columns = ['id', 'created_by', 'updated_by', ...Object.keys(data)];
    const params = [id, actor, actor, ...Object.entries(data).map(([key, value]) => storedParameter(fields.find(field => field.technical_name === key)!, value))];
    await sql`INSERT INTO ${sql.table(`${type.code}_${type.technical_name}`)} (${sql.join(columns.map(n => sql.ref(n)))})
      VALUES (${sql.join(params)})`.execute(tx);
    const change = changeId ?? v7();
    const journalFields = Object.entries(data).filter(([key, value]) => !['type', 'status', 'category'].includes(key) || (value !== null && (!Array.isArray(value) || value.length)));
    if (!journalFields.length) await services.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, 'created', null, true);
    for (const [key, value] of journalFields) await services.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, key, null, value, fields.find(f => f.technical_name === key)!.id);
    await initializeRecordSecurity(tx,type.id,id,actor,args.security,(_change,key,before,after,field)=>services.journal(tx,actor,type.workspace_id,type.id,'record',id,change,key,before,after,field));
    const relationships=args.linkFrom?await linkedRecordWrites(tx,type.id,args.linkFrom,args.relationships):args.relationships;
    await writeRecordRelationships(tx,type.id,id,relationships,actor,change,true,true,args.relationshipAttributes);
    await writeContactInheritance(tx,type.id,id,args.contactInheritance,(key,before,after,field)=>services.journal(tx,actor,type.workspace_id,type.id,'record',id,change,key,before,after,field),true);
    await receipt?.complete(type.id,id);
    return contentAccess().project(type.id,await services.record(tx, type, id));
}
