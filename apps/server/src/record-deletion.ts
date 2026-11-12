import {sql} from 'kysely';
import {v7} from 'uuid';
import {schemas,defaultRecordSecurity,effectiveWorkspaceLanguage,type Language} from '@xobject/contracts';
import type {Executor} from './database.js';
import {AppError} from './errors.js';
import {contentAccess,withContentAccess,readableRecordJournal} from './content-permissions.js';
import {modelFor,removeDeletedRecordRelationships} from './record-relationships.js';
import {validatePrimaryRequirements} from './primary-chain.js';
export async function permanentlyDeleteRecord(tx:Executor,input:unknown,actor:string,journal:(change:string)=>Promise<void>){
 const args=schemas.permanently_delete_record.parse(input),model=await modelFor(tx,args.objectTypeId),table=`${model.code}_${model.technical_name}`;
 await contentAccess().require(model.id,args.recordId,'full',true);
 const identity=(await sql<{recycled_at:Date|null;deleted_at:Date|null}>`SELECT recycled_at,deleted_at FROM sys_record_identities WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid FOR UPDATE`.execute(tx)).rows[0];
 if(!identity?.recycled_at||identity.deleted_at)throw new AppError(409,'Only recycled records can be permanently deleted');
 const row=(await sql<{version:number}>`SELECT version FROM ${sql.table(table)} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0];
 if(!row||row.version!==args.version)throw new AppError(409,'Record version conflict',{code:"version_conflict"});
 const fields=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${model.id}::uuid`.execute(tx)).rows;
 const users=(await sql<{id:string;is_admin:boolean}>`SELECT DISTINCT u.id,u.is_admin FROM sys_users u LEFT JOIN sys_workspace_members m ON m.user_id=u.id AND m.workspace_id=${model.workspace_id}::uuid WHERE u.active AND (u.is_admin OR m.user_id IS NOT NULL)`.execute(tx)).rows;
 // The retained display caption is private Administrator history, independent of the deleting actor's field restrictions.
 const administrator=users.find(user=>user.is_admin);if(!administrator)throw new AppError(500,'Installation Administrator is missing');
 const keyword=await withContentAccess(tx,administrator.id,async()=>{const expression=await contentAccess().keywordValue(model.id);return (await sql<{keyword:string}>`SELECT ${expression} AS keyword FROM ${sql.table(table)} WHERE id=${args.recordId}::uuid`.execute(tx)).rows[0].keyword;});
 const readers:Record<string,{fields:string[];events:string[];contexts:string[]}>={};
 const histories=(await sql<import('@xobject/contracts').JournalEntry>`SELECT j.* FROM sys_journal j WHERE j.entity_kind='relationship' AND EXISTS(SELECT 1 FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id=j.id AND ep.object_type_id=${model.id}::uuid AND ep.record_id=${args.recordId}::uuid)`.execute(tx)).rows;
 const historicalEndpoints=(await sql<{journal_id:string;object_type_id:string;record_id:string}>`SELECT * FROM sys_relationship_journal_endpoints WHERE journal_id=ANY(${histories.map(e=>e.id)}::uuid[])`.execute(tx)).rows;
 for(const user of users)await withContentAccess(tx,user.id,async()=>{
  const access=contentAccess();if(!await access.readable(model.id,args.recordId,true))return;
  const policy=await access.policy(model.id),visible=await readableRecordJournal(model.id,histories,true,args.recordId),events=visible.filter(e=>e.entity_kind==='relationship').map(e=>e.id),contexts=new Set([`${model.id}:${args.recordId}`]);
  for(const endpoint of historicalEndpoints)if(events.includes(endpoint.journal_id))contexts.add(`${endpoint.object_type_id}:${endpoint.record_id}`);
  readers[user.id]={fields:fields.filter(f=>policy.field(f.id,args.recordId).read).map(f=>f.id),events,contexts:[...contexts]};
 });
 const policy=(await sql<{policy:unknown}>`SELECT policy FROM sys_record_security WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx)).rows[0]?.policy??defaultRecordSecurity();
 const change=v7();await removeDeletedRecordRelationships(tx,model.id,args.recordId,actor,change);
 await sql`UPDATE sys_record_identities SET deleted_keyword=${keyword},deleted_at=clock_timestamp(),deleted_by=${actor},deleted_policy=${JSON.stringify(policy)}::jsonb,deleted_readers=${JSON.stringify(readers)}::jsonb WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx);
 await sql`DELETE FROM sys_contact_field_overrides WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx);
 await sql`DELETE FROM sys_record_security WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx);
 await sql`DELETE FROM ${sql.table(table)} WHERE id=${args.recordId}::uuid`.execute(tx);
 await validatePrimaryRequirements(tx,model.workspace_id);
 await journal(change);
 // Project one reduced deletion event into every retained relationship context, including unlinked edges.
 const event=(await sql<{id:string}>`SELECT id FROM sys_journal WHERE change_id=${change}::uuid AND entity_kind='record' AND entity_id=${args.recordId}::uuid AND field_key='lifecycle'`.execute(tx)).rows[0];
 await sql`INSERT INTO sys_relationship_journal_endpoints(journal_id,workspace_id,object_type_id,record_id) SELECT DISTINCT ${event.id}::uuid,ep.workspace_id,ep.object_type_id,ep.record_id FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id IN (SELECT journal_id FROM sys_relationship_journal_endpoints WHERE object_type_id=${model.id}::uuid AND record_id=${args.recordId}::uuid) ON CONFLICT DO NOTHING`.execute(tx);
 contentAccess().clear();return {id:args.recordId,deleted:true};
}
export async function deletedRecordIdentity(tx:Executor,objectTypeId:string,recordId:string){return (await sql<{deleted_at:Date|null;deleted_readers:Record<string,{fields:string[];events:string[];contexts:string[]}>|null}>`SELECT deleted_at,deleted_readers FROM sys_record_identities WHERE object_type_id=${objectTypeId}::uuid AND record_id=${recordId}::uuid`.execute(tx)).rows[0];}

export async function listDeletedRecords(tx:Executor,input:unknown,actor:string){
 const args=schemas.list_deleted_records.parse(input);
 const workspace=(await sql<{default_language:Language;available_languages:Language[]}>`SELECT default_language,available_languages FROM sys_workspaces WHERE id=${args.workspaceId}::uuid`.execute(tx)).rows[0];if(!workspace)throw new AppError(404,'Workspace not found');
 if(args.objectTypeId&&!(await sql`SELECT 1 FROM sys_object_types WHERE workspace_id=${args.workspaceId}::uuid AND id=${args.objectTypeId}::uuid`.execute(tx)).rows.length)throw new AppError(400,'Unknown object filter');
 const user=(await sql<{language:Language|null}>`SELECT language FROM sys_users WHERE id=${actor}`.execute(tx)).rows[0],language=effectiveWorkspaceLanguage(user.language,workspace.available_languages,workspace.default_language);
 const where=sql`r.workspace_id=${args.workspaceId}::uuid AND r.deleted_at IS NOT NULL AND ${args.objectTypeId?sql`r.object_type_id=${args.objectTypeId}::uuid`:sql`true`} AND strpos(lower(concat_ws(' ',r.deleted_keyword,r.record_id::text)),lower(${args.query}))>0`;
 const records=(await sql`SELECT r.record_id AS id,r.deleted_keyword AS keyword,r.object_type_id AS "objectTypeId",COALESCE(o.labels->>${language},o.labels->>${workspace.default_language},o.labels->>'en',o.labels->>'de') AS "objectLabel",r.deleted_at AS "deletedAt",u.name AS "deletedByName" FROM sys_record_identities r JOIN sys_object_types o ON o.id=r.object_type_id JOIN sys_users u ON u.id=r.deleted_by WHERE ${where} ORDER BY ${sql.ref(args.sortBy)} ${args.sortDirection==='asc'?sql`ASC`:sql`DESC`},r.record_id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
 const total=(await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_record_identities r WHERE ${where}`.execute(tx)).rows[0].n;
 return {records,total,limit:args.limit,offset:args.offset};
}
