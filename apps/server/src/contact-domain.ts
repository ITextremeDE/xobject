import {sql,type RawBuilder} from 'kysely';
import type {Executor} from './database.js';
import {contactIssues,type ContactProfile} from '@xobject/contracts';
import {AppError} from './errors.js';
export interface ContactField {id:string;technical_name:string;field_key:string;option_keys:Record<string,string>;config:import('@xobject/contracts').FieldConfig}
export async function contactFields(tx:Executor,objectId:string){return (await sql<ContactField>`SELECT f.id,f.technical_name,f.config,b.field_key,b.option_keys FROM sys_module_field_bindings b JOIN sys_fields f ON f.id=b.field_id WHERE f.object_type_id=${objectId}::uuid AND b.object_key='contact'`.execute(tx)).rows;}
export async function contactProfile(tx:Executor,objectId:string):Promise<ContactProfile|undefined>{
 const bindings=await contactFields(tx,objectId),kind=bindings.find(field=>field.field_key==='contact_kind');
 if(!kind)return undefined;
 const relationships=(await sql<{relationship_key:string;relationship_type_id:string}>`SELECT relationship_key,relationship_type_id FROM sys_module_relationship_bindings WHERE workspace_id=(SELECT workspace_id FROM sys_object_types WHERE id=${objectId}::uuid) AND module_key='contacts'`.execute(tx)).rows;
 const language=(await sql<{default_language:string}>`SELECT w.default_language FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${objectId}::uuid`.execute(tx)).rows[0].default_language;
 return {defaultLanguage:language,choiceKeys:Object.fromEntries(bindings.map(f=>[f.field_key,f.option_keys])),fields:Object.fromEntries(bindings.map(field=>[field.field_key,field.id])),relationships:Object.fromEntries(relationships.map(r=>[r.relationship_key,r.relationship_type_id])),kinds:kind.option_keys as ContactProfile['kinds']};
}
/** The UI and application writer evaluate the same UUID-bound requirements. */
export async function validateContact(tx:Executor,objectId:string,values:Record<string,unknown>){
 const bindings=await contactFields(tx,objectId),profile=await contactProfile(tx,objectId);
 const issue=contactIssues(profile,bindings.map(field=>({id:field.id,technicalName:field.technical_name})),values)[0];
 if(issue){
  const messages={contactKindRequired:'Contact kind is required',contactCompanyRequired:'Organization needs a company name',contactCompanyOrLastRequired:'Individual contact needs a company or last name',contactLastRequired:'Contact person needs a last name',contactCompanyDerived:'Contact person company is derived from the Organization'};
  throw new AppError(400,messages[issue.code],{code:issue.code,fieldId:issue.fieldId});
 }
}

import type {ObjectAccess} from './content-permissions.js';
export async function contactDerivedValue(tx:Executor,objectId:string,policy:ObjectAccess,purpose:string,alias?:string,draft?:{values:Record<string,unknown>;organization:{present:boolean;name:string|null}}):Promise<RawBuilder<unknown>>{
 const fields=await contactFields(tx,objectId);const binding=(key:string)=>fields.find(f=>f.field_key===key)!;
 if(!fields.length)return sql`NULL::text`;
 const meta=(await sql<{name:string;language:string}>`SELECT w.default_language AS language,w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${objectId}::uuid`.execute(tx)).rows[0];
 const root=alias??meta.name,id=sql.ref(`${root}.id`),column=(key:string)=>draft&&Object.hasOwn(draft.values,binding(key).technical_name)?['first_name','last_name','additional_names','name_suffix'].includes(key)?sql`${JSON.stringify(draft.values[binding(key).technical_name])}::jsonb`:key==='contact_kind'?sql`${draft.values[binding(key).technical_name]}::uuid`:sql`${draft.values[binding(key).technical_name]}::text`:sql.ref(`${root}.${binding(key).technical_name}`);
 const allowed=(key:string,tableAlias=root)=>{const f=binding(key);if(!policy.field(f.id).read)return sql`false`;if(!policy.sensitive||policy.admin)return sql`true`;return sql`${sql.ref(`${tableAlias}.id`)}=ANY(${[...policy.records.keys()].filter(record=>policy.field(f.id,record).read)}::uuid[])`;};
 const names=(key:string)=>key==='academic_title'?sql`(SELECT COALESCE(option->'labels'->>${meta.language},option->'labels'->>'en',option->'labels'->>'de') FROM jsonb_array_elements(${JSON.stringify(binding(key).config.options??[])}::jsonb) AS option WHERE option->>'id'=${column(key)}::text)`:sql`(SELECT string_agg(part->>'text',' ' ORDER BY ordinal) FROM jsonb_array_elements(COALESCE(${column(key)},'[]'::jsonb)) WITH ORDINALITY AS parts(part,ordinal))`;
 const kind=column('contact_kind'),keys=binding('contact_kind').option_keys;
 const personal=purpose==='formatted_name'?sql`concat_ws(' ',NULLIF(${names('academic_title')},''),NULLIF(${names('first_name')},''),NULLIF(${names('additional_names')},''),NULLIF(${names('last_name')},''),NULLIF(${names('name_suffix')},''))`:sql`concat_ws(', ',NULLIF(${names('last_name')},''),NULLIF(${names('first_name')},''))`;
 const personalKeys=purpose==='formatted_name'?['academic_title','first_name','additional_names','last_name','name_suffix']:['last_name','first_name'];
 const personalAllowed=sql.join(personalKeys.map(key=>allowed(key)),sql` AND `);
 const edge=(await sql<{relationship_type_id:string}>`SELECT relationship_type_id FROM sys_module_relationship_bindings WHERE workspace_id=${policy.workspace}::uuid AND relationship_key='contact_person'`.execute(tx)).rows[0];
 const company=sql.ref(`organization.${binding('company_name').technical_name}`);
 const organization=draft?sql`${draft.organization.name}::text`:edge?sql`(SELECT CASE WHEN ${policy.predicate('organization')} AND ${allowed('company_name','organization')} THEN ${company} ELSE NULL END FROM sys_relationships edge JOIN ${sql.table(meta.name)} organization ON organization.id=edge.left_record_id WHERE edge.relationship_type_id=${edge.relationship_type_id}::uuid AND edge.right_record_id=${id})`:sql`NULL::text`;
 const hasOrganization=draft?sql`${draft.organization.present}`:edge?sql`EXISTS(SELECT 1 FROM sys_relationships edge WHERE edge.relationship_type_id=${edge.relationship_type_id}::uuid AND edge.right_record_id=${id})`:sql`false`;
 if(purpose==='organization_name'||purpose==='organization_commercial_register'){
  const inherited=purpose==='organization_name'?organization:edge?sql`(SELECT CASE WHEN ${policy.predicate('organization')} AND ${allowed('commercial_register','organization')} THEN ${sql.ref(`organization.${binding('commercial_register').technical_name}`)} ELSE NULL END FROM sys_relationships edge JOIN ${sql.table(meta.name)} organization ON organization.id=edge.left_record_id WHERE edge.relationship_type_id=${edge.relationship_type_id}::uuid AND edge.right_record_id=${id})`:sql`NULL::text`;
  return sql`CASE WHEN ${allowed('contact_kind')} AND ${kind}=${keys.person}::uuid THEN CASE WHEN EXISTS(SELECT 1 FROM sys_contact_field_overrides o WHERE o.object_type_id=${objectId}::uuid AND o.record_id=${id} AND o.field_id=${binding(purpose).id}::uuid) THEN (SELECT value #>> '{}' FROM sys_contact_field_overrides o WHERE o.object_type_id=${objectId}::uuid AND o.record_id=${id} AND o.field_id=${binding(purpose).id}::uuid) ELSE ${inherited} END ELSE NULL END`;
 }
 return sql`CASE WHEN NOT (${allowed('contact_kind')}) THEN ${id}::text WHEN ${kind}=${keys.organization}::uuid THEN CASE WHEN ${allowed('company_name')} THEN ${column('company_name')} ELSE ${id}::text END WHEN ${kind}=${keys.individual}::uuid THEN CASE WHEN NOT (${allowed('company_name')}) THEN ${id}::text WHEN COALESCE(${column('company_name')},'')<>'' THEN ${column('company_name')} WHEN ${personalAllowed} THEN ${personal} ELSE ${id}::text END WHEN ${kind}=${keys.person}::uuid THEN CASE WHEN NOT (${personalAllowed}) OR (${hasOrganization} AND ${organization} IS NULL) THEN ${id}::text ELSE concat(${personal},CASE WHEN ${organization} IS NOT NULL AND ${purpose==='keyword'} THEN concat(' (',${organization},')') ELSE '' END) END ELSE ${id}::text END`;
}
