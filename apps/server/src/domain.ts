import {listFieldTags,tagFilterPredicate} from './tags.js';
import {relationshipPage,relationshipSummary} from './relationship-reader.js';
import {recordJournalPage} from './journal-reader.js';
import {ObjectDefinitions} from './object-definitions.js';
import {ModuleInstallation} from './module-installation.js';
import {tableName,localizedLabel} from './definition-metadata.js';
export {localizedLabel} from './definition-metadata.js';
import {createRecord} from './record-writer.js';

import {contactFields} from './contact-domain.js';
import {contactConversionPlan} from './contact-conversion.js';
import {contactInheritance,inheritedContactFields,writeContactInheritance} from './contact-inheritance.js';
import {classificationFilterPredicate} from './record-filters.js';

import {withChangeNotifications} from './change-notifications.js';
import {manageOAuth} from './oauth.js';
import {validateRequestContext} from './request-context.js';
import {permanentlyDeleteRecord,deletedRecordIdentity,listDeletedRecords} from './record-deletion.js';
import {ApiCredentials,credentialOperation,type RequestContext} from './api-credentials.js';

import {recordIconExpression,objectRecordIcon} from './record-icons.js';
import {getNavigation,configureNavigation} from './navigation.js';

import {validateWork} from './work-domain.js';
import {relationshipFieldLifecycle,relationshipFieldOwner,saveRelationshipField} from './relationship-fields.js';

import {validateContact,contactProfile} from './contact-domain.js';
import {structuredChanges,structuredSchemaKeys,structuredSchemaLabels} from '@xobject/contracts';

import {validateUniqueLength} from './field-input-rules.js';
import {numberingBackfillPlan,backfillRecordNumbers,configureNumbering} from './record-numbering.js';

import {recordSecurity,saveRecordSecurity,writeRecordSecurity} from './record-security.js';
import {getForeignAccess,foreignAccessView,configureForeignAccess,configureGroupInheritance} from './ownership-settings.js';
import {readableRecordJournal,withContentAccess,contentAccess,getContentPermissions,configureContentPermissions} from './content-permissions.js';

import {configurePrimaryRequirements,validatePrimaryRequirements} from './primary-chain.js';
import {applies} from './field-applicability.js';
import {journalValueContexts} from './record-journal.js';
import {lockOperation} from './operation-locks.js';

import {captureRelationshipJournalBefore,type RelationshipJournalSnapshots,validateRestoredRelationships,recordLinkOptions,primaryChainContext,relationshipTreeBranch,recordRelationships,searchRelationshipCandidates,activateRelationship,writeRecordRelationships} from './record-relationships.js';
import {workspaceModules,configureWorkspaceModule,installSystemRelationships,relationshipTypes,configureRelationship} from './relationship-types.js';
import {enrichJournalContext} from './journal-context.js';
import {listWorkspaceRecords,workspaceDashboard} from './dashboard.js';
import {managedUsers,createUser,configureUser} from './user-management.js';
import {configureWorkspaceLanguages,workspaceGroups,configureGroup,createWorkspaceGroup,validateDefinitionLanguages} from './workspace-configuration.js';
import {normalizePersonalRegional,defaultRegionalSettings,type RegionalSettings,type PersonalRegionalSettings,installedTimeZones,languageCatalog,effectiveWorkspaceLanguage,type Language} from '@xobject/contracts';
import {sql} from 'kysely';
import {AccountSecurityService,isAccountSecurityOperation} from './account-security.js';
import {v7} from 'uuid';
import type {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {normalizeFieldValue,validateReferences,storedParameter,isEmptyFieldValue} from './field-types.js';
import {AppError} from './errors.js';
export { AppError } from './errors.js';

import {effectiveClassification,resolveChoices,type Choices} from './classification.js';
import {schemas,isCustomFieldKind,type FieldConfig,type FieldValue,type WorkspaceAppearance,type Operation,type Inputs} from '@xobject/contracts';
export { schemas, type Operation,type Inputs } from '@xobject/contracts';
import type {Database,Executor} from './database.js';

import type {Labels,ObjectType,Field,DataRecord} from './domain-types.js';
/** Every entry point resolves a real session and calls this shared application layer. */
export class Application {
  private definitions = new ObjectDefinitions(this.journal.bind(this),this.outputRecord.bind(this));
  private modules = new ModuleInstallation(this.definitions,this.journal.bind(this));
  async refreshInstalledModuleTemplates(tx:Executor){return this.modules.refreshInstalledModuleTemplates(tx);}
  private accountSecurity = new AccountSecurityService();
  private apiCredentials = new ApiCredentials();
  constructor(private db: Database) {}

  async execute(operation: Operation, input: unknown, userId: string, context?:RequestContext): Promise<unknown> {
    const parsed = schemas[operation].parse(input);
    try {
      return await this.db.transaction().execute(async (tx) => withChangeNotifications(tx,()=>withContentAccess(tx,userId,async()=>{
        await lockOperation(tx, operation, parsed as Record<string, unknown>);
        await validateRequestContext(tx,userId,operation,context);
        await sql`SELECT set_config('xobject.actor_id',${userId},true),set_config('xobject.channel',${context?.channel??'internal'},true),set_config('xobject.credential_id',${context?.credentialId??context?.oauthTokenId??''},true),set_config('xobject.agent_name',${context?.agentName??''},true)`.execute(tx);
        const access = await this.authorize(tx, operation, parsed as Record<string, unknown>, userId);
        if(operation==='list_oauth_authorizations'||operation==='revoke_oauth_authorization'){const args=parsed as {clientId?:string};return manageOAuth(tx,operation,userId,context,args.clientId,before=>this.journal(tx,userId,null,null,'account_security',userId,v7(),'oauth_revoked',before,true));}
        if(credentialOperation(operation)){const change=v7();return this.apiCredentials.execute(tx,operation,parsed,userId,access.isAdmin,context,(id,key,before,after)=>this.journal(tx,userId,null,null,'api_credential',id,change,key,before,after));}

        if (isAccountSecurityOperation(operation)) return this.accountSecurity.execute(tx, operation, parsed, userId, context?.sessionId, (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
        if (['configure_field',  'set_labels'].includes(operation)) {
          const args = parsed as { fieldId?: string; id?: string; kind?: string; version?: number };
          const name = args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields';
          const row = (await sql<{version:number}>`SELECT version FROM ${sql.table(name)} WHERE id=${args.fieldId ?? args.id}::uuid AND state<>'deleted'`.execute(tx)).rows[0];
          if (!row) throw new AppError(404, 'Definition not found');
          if (row.version !== args.version) throw new AppError(409,'Definition version conflict',{code:"version_conflict"});
        }
        if(['configure_field','set_labels','set_definition_state'].includes(operation)){
          const input=parsed as {fieldId?:string;id?:string;kind?:string};
          if(input.fieldId||input.kind==='field'){
            const special=(await sql`SELECT 1 FROM sys_fields WHERE id=${input.fieldId??input.id}::uuid AND technical_name IN ('access_principals','record_number')`.execute(tx)).rows.length;
            if(special)throw new AppError(403,'System field definition is protected');
          }
        }
        await validateDefinitionLanguages(tx, operation, parsed as Record<string, unknown>);
        if(operation==='set_definition_state'){const input=schemas.set_definition_state.parse(parsed);if(input.kind==='field'&&await relationshipFieldOwner(tx,input.id))return relationshipFieldLifecycle(tx,input,userId);}
        if(operation==='set_labels'){const input=schemas.set_labels.parse(parsed);if(input.kind==='field'&&await relationshipFieldOwner(tx,input.id)){const f=(await sql<{required:boolean}>`SELECT required FROM sys_fields WHERE id=${input.id}::uuid`.execute(tx)).rows[0];return saveRelationshipField(tx,{fieldId:input.id,version:input.version,labels:input.labels,required:f.required},userId);}}
        const configJournal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => this.journal(tx, userId, (parsed as { workspaceId: string }).workspaceId, null, kind, id, change, key, before, after);
        switch (operation) {
          case 'get_workspace_navigation':return getNavigation(tx,schemas.get_workspace_navigation.parse(parsed).workspaceId,userId);
          case 'configure_navigation':return configureNavigation(tx,schemas.configure_navigation.parse(parsed),userId,configJournal);
          case 'get_foreign_access_capabilities': {const a=schemas.get_foreign_access_capabilities.parse(parsed),config=await getForeignAccess(tx,a.workspaceId);return {manageOwn:access.isAdmin||config.users.some(u=>u.userId===userId&&u.manageOwn)};}
          case 'get_foreign_access':return foreignAccessView(tx,(parsed as {workspaceId:string}).workspaceId,userId);
          case 'configure_foreign_access':return configureForeignAccess(tx,schemas.configure_foreign_access.parse(parsed),configJournal,userId);
          case 'configure_group_inheritance':return configureGroupInheritance(tx,schemas.configure_group_inheritance.parse(parsed),configJournal);
          case 'get_record_security': {const a=schemas.get_record_security.parse(parsed);return recordSecurity(tx,a.objectTypeId,a.recordId);}
          case 'configure_record_security': {const a=schemas.configure_record_security.parse(parsed),t=await this.definitions.objectType(tx,a.objectTypeId);return saveRecordSecurity(tx,a,userId,(change,key,before,after,field)=>this.journal(tx,userId,t.workspace_id,t.id,'record',a.recordId,change,key,before,after,field));}
          case 'recycle_record': return this.recordLifecycle(tx,schemas.recycle_record.parse(parsed),userId,false);
          case 'permanently_delete_record': {const args=schemas.permanently_delete_record.parse(parsed),type=await this.definitions.objectType(tx,args.objectTypeId);return permanentlyDeleteRecord(tx,args,userId,change=>this.journal(tx,userId,type.workspace_id,type.id,'record',args.recordId,change,'lifecycle','recycled','deleted'));}
          case 'list_deleted_records':return listDeletedRecords(tx,parsed,userId);
          case 'restore_record': return this.recordLifecycle(tx,schemas.recycle_record.parse(parsed),userId,operation==='restore_record');
          case 'get_recycled_record': {
            const a=schemas.get_recycled_record.parse(parsed),type=await this.definitions.objectType(tx,a.objectTypeId);
            await contentAccess().require(type.id,a.recordId,'read',true);
            const state=(await sql`SELECT 1 FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${a.recordId}::uuid AND recycled_at IS NOT NULL`.execute(tx)).rows.length;
            if(!state)throw new AppError(404,'Recycled record not found');
            return contentAccess().project(type.id,await this.record(tx,type,a.recordId),true);
          }
          case 'list_recycled_records':return listWorkspaceRecords(tx,schemas.list_recycled_records.parse(parsed),userId,true);
          case 'get_record_duplicate': {
            const a=schemas.get_record_duplicate.parse(parsed),type=await this.definitions.objectType(tx,a.objectTypeId);await contentAccess().require(type.id,a.recordId,'duplicate');await contentAccess().require(type.id,undefined,'create');
            return this.duplicateDraft(tx,type,await this.record(tx,type,a.recordId),a.recordId);
          }
          case 'duplicate_record': {
            const a=schemas.duplicate_record.parse(parsed),type=await this.definitions.objectType(tx,a.objectTypeId);await contentAccess().require(type.id,a.recordId,'duplicate');await contentAccess().require(type.id,undefined,'create');const source=await this.record(tx,type,a.recordId);if(source.version!==a.version)throw new AppError(409,'Record version conflict',{code:"version_conflict"});
            const {sourceVersion,...draft}=await this.duplicateDraft(tx,type,source,a.recordId);
            return this.createRecord(tx,schemas.create_record.parse({objectTypeId:type.id,...draft,...(a.keyword!==undefined?{keyword:a.keyword}:{})}),userId);
          }
          case 'get_numbering_backfill_preview':
          case 'backfill_record_numbers': {
            const args=parsed as Inputs['backfill_record_numbers'],type=await this.definitions.objectType(tx,args.objectTypeId);
            this.definitions.requireActive(type);if(type.version!==args.version)throw new AppError(409,'Definition version conflict',{code:"version_conflict"});
            if(operation==='get_numbering_backfill_preview')return (await numberingBackfillPlan(tx,type,tableName(type))).preview;
            const change=v7();return backfillRecordNumbers(tx,type,tableName(type),args.previewToken,userId,(recordId,fieldId,number)=>this.journal(tx,userId,type.workspace_id,type.id,'record',recordId,change,'record_number',null,number,fieldId));
          }
          case 'configure_object_settings': {
            const args=schemas.configure_object_settings.parse(parsed),type=await this.definitions.objectType(tx,args.objectTypeId),change=v7();
            if(type.version!==args.version)throw new AppError(409,'Definition version conflict',{code:"version_conflict"});
            if(args.security){
              if(!access.isAdmin)throw new AppError(403,'Only Administrators manage content permissions');
              const previous=await getContentPermissions(tx,type.id);
              await configureContentPermissions(tx,{...previous,version:args.security.version,sensitive:args.security.sensitive,confirmWidening:args.security.confirmWidening},userId,(key,before,after,field)=>this.journal(tx,userId,type.workspace_id,type.id,'object_permissions',type.id,change,key,before,after,field));
            }
            if(args.primaryRequirements){this.definitions.requireActive(type);await configurePrimaryRequirements(tx,type,args.primaryRequirements,(key,before,after)=>this.journal(tx,userId,type.workspace_id,type.id,'object_type',type.id,change,key,before,after));}
            if(args.numbering){contentAccess().clear();this.definitions.requireActive(type);if(await configureNumbering(tx,type,args.numbering,tableName(type),(key,before,after)=>this.journal(tx,userId,type.workspace_id,type.id,'object_type',type.id,change,key,before,after))&&isDeepStrictEqual(type.labels,args.labels))await sql`UPDATE sys_object_types SET version=version+1 WHERE id=${type.id}::uuid`.execute(tx);}
            if(!isDeepStrictEqual(type.labels,args.labels))await this.definitions.setLabels(tx,{kind:'object_type',id:type.id,labels:args.labels},userId,change);
            if(args.primaryRequirements&&!isDeepStrictEqual(type.primary_requirements,args.primaryRequirements)){const current=await this.definitions.objectType(tx,type.id);if(current.version===type.version)await sql`UPDATE sys_object_types SET version=version+1 WHERE id=${type.id}::uuid`.execute(tx);}
            return this.definitions.definition(tx,type.id,userId);
          }
          case 'get_content_permissions':return getContentPermissions(tx,(parsed as {objectTypeId:string}).objectTypeId);
          case 'configure_content_permissions': {const args=schemas.configure_content_permissions.parse(parsed),type=await this.definitions.objectType(tx,args.objectTypeId),change=v7();return configureContentPermissions(tx,args,userId,(key,before,after,field)=>this.journal(tx,userId,type.workspace_id,type.id,'object_permissions',type.id,change,key,before,after,field));}
          case 'list_access_principals':return contentAccess().eligiblePrincipals((parsed as {objectTypeId:string}).objectTypeId);
          case 'get_relationship_tree_branch': return relationshipTreeBranch(tx,schemas.get_relationship_tree_branch.parse(parsed),userId);
          case 'list_record_link_options':return recordLinkOptions(tx,schemas.list_record_link_options.parse(parsed));
          case 'get_record_relationships': {const args=schemas.get_record_relationships.parse(parsed);return args.view==='summary'?relationshipSummary(tx,args.objectTypeId,args.recordId):recordRelationships(tx,args.objectTypeId,args.recordId);}
          case 'get_record_relationship_page':return relationshipPage(tx,schemas.get_record_relationship_page.parse(parsed));
          case 'search_relationship_candidates': return searchRelationshipCandidates(tx,schemas.search_relationship_candidates.parse(parsed));
          case 'activate_relationship_type': return activateRelationship(tx,schemas.activate_relationship_type.parse(parsed),userId);
          case 'get_primary_chain_context': return primaryChainContext(tx,schemas.get_primary_chain_context.parse(parsed),userId);
          case 'configure_form_layout': return this.definitions.configureFormLayout(tx, schemas.configure_form_layout.parse(parsed), userId);
          case 'list_workspace_modules': return workspaceModules(tx,schemas.list_workspace_modules.parse(parsed).workspaceId);
          case 'configure_workspace_module': return configureWorkspaceModule(tx,schemas.configure_workspace_module.parse(parsed),configJournal,()=>this.modules.installModuleObjects(tx,(parsed as {workspaceId:string}).workspaceId,userId,schemas.configure_workspace_module.parse(parsed).key));
          case 'list_relationship_types': return relationshipTypes(tx, schemas.list_relationship_types.parse(parsed).workspaceId);
          case 'create_relationship_type': return configureRelationship(tx, schemas.create_relationship_type.parse(parsed), configJournal);
          case 'configure_relationship_type': return configureRelationship(tx, schemas.configure_relationship_type.parse(parsed), configJournal);
          case 'list_field_schemas': return structuredSchemaKeys.map(key=>({key,labels:structuredSchemaLabels[key]}));
          case 'get_language_catalog': return languageCatalog;
          case 'get_time_zone_catalog': return installedTimeZones();
          case 'configure_user_localization': {
            const args = schemas.configure_user_localization.parse(parsed);
            const before = (await sql<{ language: Language | null; time_zone: string | null; regional_preferences: PersonalRegionalSettings | null }>`SELECT language, time_zone, regional_preferences FROM sys_users WHERE id = ${userId} FOR UPDATE`.execute(tx)).rows[0];
            if (before.language !== args.expectedLanguage || before.time_zone !== args.expectedTimeZone || (args.regional !== undefined && !isDeepStrictEqual(before.regional_preferences, normalizePersonalRegional(args.expectedRegional)))) throw new AppError(409,'User localization version conflict',{code:"version_conflict"});
            const next = { language: args.language, time_zone: args.timeZone, regional_preferences: args.regional === undefined ? before.regional_preferences : normalizePersonalRegional(args.regional) };
            const keys = (Object.keys(next) as (keyof typeof next)[]).filter(key => !isDeepStrictEqual(before[key], next[key]));
            if (keys.length) {
              await sql`UPDATE sys_users SET language = ${next.language}, time_zone = ${next.time_zone}, regional_preferences = ${JSON.stringify(next.regional_preferences)}::jsonb, updated_at = now() WHERE id = ${userId}`.execute(tx);
              const change = v7();
              for (const key of keys) {
                if (key === 'regional_preferences') { for (const property of Object.keys({ ...before.regional_preferences, ...next.regional_preferences }) as (keyof RegionalSettings)[]) if ((before.regional_preferences?.[property] ?? null) !== (next.regional_preferences?.[property] ?? null)) await this.journal(tx, userId, null, null, 'user', userId, change, `regional.${property}`, before.regional_preferences?.[property] ?? null, next.regional_preferences?.[property] ?? null); }
                else await this.journal(tx, userId, null, null, 'user', userId, change, key, before[key], next[key]);
              }
            }
            return { language: next.language, timeZone: next.time_zone, regional: next.regional_preferences };
          }
          case 'configure_workspace_languages': return configureWorkspaceLanguages(tx, schemas.configure_workspace_languages.parse(parsed), configJournal);
          case 'list_groups': return workspaceGroups(tx, schemas.list_groups.parse(parsed).workspaceId);
          case 'configure_group': {const args=schemas.configure_group.parse(parsed);return args.members?configureGroupInheritance(tx,{...args,members:args.members},configJournal):configureGroup(tx,args,configJournal);}

          case 'set_group_active': return configureGroup(tx, schemas.set_group_active.parse(parsed), configJournal);
          case 'set_definition_state': return this.definitions.setDefinitionState(tx, schemas.set_definition_state.parse(parsed), userId);
          case 'get_definition_journal': { const args = schemas.get_definition_journal.parse(parsed); const type = await this.definitions.objectType(tx, args.objectTypeId, true); return enrichJournalContext(tx, (await sql<Record<string, unknown>>`SELECT j.*, a.name AS actor_name, w.name AS workspace_name FROM sys_journal j LEFT JOIN sys_users a ON a.id = j.actor_id LEFT JOIN sys_workspaces w ON w.id = j.workspace_id WHERE (j.object_type_id = ${type.id}::uuid OR j.field_id IN (SELECT f.id FROM sys_fields f JOIN sys_relationship_type_pairs p ON p.relationship_type_id=f.relationship_type_id WHERE p.left_object_type_id=${type.id}::uuid OR p.right_object_type_id=${type.id}::uuid)) AND j.entity_kind NOT IN ('record','relationship') ORDER BY j.created_at, j.id`.execute(tx)).rows, userId, false); }
          case 'get_access_context': {
            const user = (await sql<{ id: string; name: string }>`SELECT id, name FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            return { user, isAdmin: access.isAdmin };
          }
          case 'list_managed_users': return managedUsers(tx);
          case 'create_user': return createUser(tx, schemas.create_user.parse(parsed), (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
          case 'configure_user': return configureUser(tx, schemas.configure_user.parse(parsed), userId, (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
          case 'list_system_journal': {
            const args = schemas.list_system_journal.parse(parsed);
            const filter = sql`${args.workspaceId ? sql`j.workspace_id = ${args.workspaceId}::uuid` : sql`true`} AND position(lower(${args.fieldKey}) in lower(j.field_key)) > 0 AND (${args.entityKind} = '' OR j.entity_kind = ${args.entityKind})`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM sys_journal j WHERE ${filter}`.execute(tx)).rows[0].total;
            const entries = (await sql<Record<string, unknown>>`SELECT j.*, a.name AS actor_name, w.name AS workspace_name, COALESCE(u.name, g.name, CASE WHEN j.entity_kind IN ('workspace', 'workspace_member') THEN w.name END, o.labels->>'en', o.labels->>'de', f.labels->>'en', f.labels->>'de', rt.labels->>'de', rt.labels->>'en') AS entity_name FROM sys_journal j LEFT JOIN sys_users a ON a.id = j.actor_id LEFT JOIN sys_workspaces w ON w.id = j.workspace_id LEFT JOIN sys_users u ON j.entity_kind IN ('user', 'account_security') AND u.id = j.entity_id::text LEFT JOIN sys_groups g ON j.entity_kind = 'group' AND g.id = j.entity_id LEFT JOIN sys_object_types o ON j.entity_kind = 'object_type' AND o.id = j.entity_id LEFT JOIN sys_fields f ON j.entity_kind IN ('field', 'classification_field') AND f.id = j.entity_id LEFT JOIN sys_relationship_types rt ON j.entity_kind = 'relationship_type' AND rt.id = j.entity_id WHERE ${filter} ORDER BY j.created_at DESC, j.id DESC LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { entries: await journalValueContexts(tx,await enrichJournalContext(tx, entries, userId, true) as unknown as import('@xobject/contracts').JournalEntry[]), total, limit: args.limit, offset: args.offset };
          }
          case 'list_users': return (await sql`SELECT id, name, email, active, is_admin AS "isAdmin" FROM sys_users ORDER BY name, id`.execute(tx)).rows;
          case 'list_workspace_members': { const args = schemas.list_workspace_members.parse(parsed); if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found'); return (await sql`SELECT u.id, u.name, u.email, u.active, CASE WHEN u.is_admin THEN 'administrator' ELSE m.role END AS role FROM sys_users u LEFT JOIN sys_workspace_members m ON m.user_id = u.id AND m.workspace_id = ${args.workspaceId}::uuid WHERE u.is_admin OR m.user_id IS NOT NULL ORDER BY u.name, u.id`.execute(tx)).rows; }
          case 'set_workspace_member': return this.setWorkspaceMember(tx, schemas.set_workspace_member.parse(parsed), userId);
          case 'create_workspace': return this.createWorkspace(tx, schemas.create_workspace.parse(parsed), userId);
          case 'create_group': {
            const a=schemas.create_group.parse(parsed),change=v7();
            const journal:typeof configJournal=(kind,id,_change,key,before,after)=>configJournal(kind,id,change,key,before,after);
            const group=await createWorkspaceGroup(tx,a,journal);
            if(a.members.length){const created=await configureGroupInheritance(tx,{workspaceId:a.workspaceId,groupId:group.id,version:group.version,members:a.members},journal);await sql`UPDATE sys_groups SET version=1 WHERE id=${group.id}::uuid`.execute(tx);return {...created,version:1};}
            return group;
          }
          case 'list_field_principals': {
            const args = schemas.list_field_principals.parse(parsed);
            if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
            return (await sql`SELECT id, name, 'user' AS kind, active FROM sys_users WHERE ${access.isAdmin} OR is_admin OR id IN (SELECT user_id FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid) UNION ALL SELECT id::text, name, 'group' AS kind, active FROM sys_groups WHERE workspace_id = ${args.workspaceId}::uuid ORDER BY name, id`.execute(tx)).rows;
          }
          case 'list_workspaces': {
            const locale=(await sql<{language:string|null}>`SELECT language FROM sys_users WHERE id=${userId}`.execute(tx)).rows[0]?.language??'en';
            const collator=new Intl.Collator(locale,{sensitivity:'base',numeric:true});
            const workspaces=(await sql<{id:string;name:string;code:string}>`SELECT w.id, w.code, w.name, w.default_language, w.available_languages, w.label_languages, w.language_version, w.time_zone, w.regional, w.created_by, u.name AS created_by_name, w.created_at, w.appearance, w.appearance_version, CASE WHEN ${access.isAdmin} THEN 'administrator' ELSE m.role END AS role FROM sys_workspaces w JOIN sys_users u ON u.id = w.created_by LEFT JOIN sys_workspace_members m ON m.workspace_id = w.id AND m.user_id = ${userId} WHERE ${access.isAdmin} OR m.user_id IS NOT NULL `.execute(tx)).rows;
            return workspaces.sort((a,b)=>collator.compare(a.name,b.name)||a.code.localeCompare(b.code));
          }
          case 'list_object_types': {
            const args = schemas.list_object_types.parse(parsed);
            const workspace = (await sql<{ default_language: Language; available_languages: Language[] }>`SELECT default_language, available_languages FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
            if (!workspace) throw new AppError(404, 'Workspace not found');
            const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            const types = (await sql<{ id: string; technical_name: string; labels: Labels; state: string; is_protected: boolean }>`SELECT id, technical_name, labels, state, is_protected FROM sys_object_types WHERE workspace_id = ${args.workspaceId}::uuid AND (state = 'active' OR (${args.includeInactive} AND state = 'inactive') OR (${args.includeDeleted} AND state = 'deleted')) ORDER BY technical_name`.execute(tx)).rows;
            return Promise.all(types.map(async type => ({ iconKey:await objectRecordIcon(tx,type.id), permissions:(await contentAccess().policy(type.id)).capabilities,id: type.id, state: type.state, isProtected: type.is_protected, technicalName: type.technical_name, labels: type.labels,
              label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, workspace.available_languages, workspace.default_language), workspace.default_language) })));
          }
          case 'search_workspace': return this.searchWorkspace(tx, schemas.search_workspace.parse(parsed), userId);
          case 'get_workspace_dashboard': return workspaceDashboard(tx, schemas.get_workspace_dashboard.parse(parsed), userId);
          case 'list_workspace_records': return listWorkspaceRecords(tx, schemas.list_workspace_records.parse(parsed), userId);
          case 'list_field_tags':return listFieldTags(tx,schemas.list_field_tags.parse(parsed));
          case 'list_records': {
            const args = schemas.list_records.parse(parsed);
            const type = await this.definitions.objectType(tx, args.objectTypeId);
            const sortableFields = (await sql<Field>`SELECT value_mode,applicability, id, technical_name, kind, required, config,input_rules, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
            if (!['id', 'created_at', 'updated_at'].includes(args.sortBy) && !sortableFields.some(field => field.state === 'active' && field.technical_name === args.sortBy)) {
              throw new AppError(400, 'Unknown sort field');
            }
            const direction = args.sortDirection === 'asc' ? sql`ASC` : sql`DESC`;
            let sortExpression = sql`${sql.ref(args.sortBy)}`;
            if (['type', 'status', 'category'].includes(args.sortBy)) {
              const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
              const options = type.classification.options.filter(option => option.kind === args.sortBy);
              const cases = options.map(option => sql`WHEN ${option.id}::uuid THEN ${localizedLabel(option.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language)}`);
              sortExpression = !cases.length ? sql`NULL::text` : args.sortBy === 'category'
                ? sql`(SELECT string_agg(label, ', ' ORDER BY label) FROM (SELECT CASE selection.id ${sql.join(cases, sql` `)} ELSE NULL END AS label FROM unnest(category) AS selection(id)) AS names)`
                : sql`CASE ${sql.ref(args.sortBy)} ${sql.join(cases, sql` `)} ELSE NULL END`;
            }

            const sortedField = sortableFields.find(field => field.technical_name === args.sortBy);
            if(sortedField?.technical_name==='access_principals')throw new AppError(400,'Record security is not a sortable business column');
            if (sortedField?.kind === 'money') sortExpression = sql`CASE WHEN ${sql.ref(args.sortBy)} IS NULL THEN NULL ELSE ROW(${sql.ref(args.sortBy)}->>'currency', (${sql.ref(args.sortBy)}->>'amount')::numeric) END`;
            if (sortedField && ['single_choice', 'multiple_choice','tree_choice'].includes(sortedField.kind)) {
              const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
              const cases = (sortedField.config.options ?? []).map(option => sql`WHEN ${option.id}::uuid THEN ${localizedLabel(option.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language)}`);
              sortExpression = !cases.length ? sql`NULL::text` : ['multiple_choice','tree_choice'].includes(sortedField.kind)
                ? sql`(SELECT string_agg(label, ', ' ORDER BY label) FROM (SELECT CASE selection.id ${sql.join(cases, sql` `)} ELSE NULL END AS label FROM unnest(${sql.ref(args.sortBy)}) AS selection(id)) AS names)`
                : sql`CASE ${sql.ref(args.sortBy)} ${sql.join(cases, sql` `)} ELSE NULL END`;
            }
            if (sortedField?.kind === 'reference') sortExpression = sql`(SELECT string_agg(COALESCE(u.name, g.name), ', ' ORDER BY COALESCE(u.name, g.name), ref->>'id') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${sql.ref(args.sortBy)}) = 'array' THEN ${sql.ref(args.sortBy)} ELSE jsonb_build_array(${sql.ref(args.sortBy)}) END) AS ref LEFT JOIN sys_users u ON ref->>'kind' = 'user' AND u.id = ref->>'id' LEFT JOIN sys_groups g ON ref->>'kind' = 'group' AND g.id::text = ref->>'id' AND g.workspace_id = ${type.workspace_id}::uuid)`;
            const searchColumn = sortableFields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? sql`keyword` : sql`id::text`;
            const policy=await contentAccess().require(type.id,undefined);
            if(sortedField?.value_mode==='derived')sortExpression=await contentAccess().fieldValueByName(type.id,sortedField.technical_name);
            if(sortedField?.kind==='structured')throw new AppError(400,'Structured fields cannot be sorted');
            if(sortedField&&!await policy.fieldReadableEverywhere(sortedField.id))throw new AppError(403,'Cannot sort a restricted field');
            const permittedSearch=await contentAccess().keywordValue(type.id),numberSearch=await contentAccess().fieldValueByName(type.id,'record_number');
            let contactFilter=sql`true`;
            if(args.contactKindId){const profile=await contactProfile(tx,type.id),kind=sortableFields.find(f=>f.id===profile?.fields.contact_kind);if(!profile||!kind||!Object.values(profile.kinds).includes(args.contactKindId))throw new AppError(400,'Unknown Contact kind');if(!policy.field(kind.id).read)throw new AppError(403,'Cannot filter an unreadable field');contactFilter=sql`${await contentAccess().fieldValueByName(type.id,kind.technical_name)}=${args.contactKindId}::uuid`;}
            const classificationFilter=classificationFilterPredicate(type.classification,sortableFields,args.classificationFilters,policy);
            const tagsFilter=await tagFilterPredicate(type.id,sortableFields,args.tagFilters);
            const predicate = sql`${policy.predicate()} AND ${contactFilter} AND ${classificationFilter} AND ${tagsFilter} AND (position(lower(${args.query}) in lower(${permittedSearch})) > 0 OR position(lower(${args.query}) in lower(${numberSearch})) > 0)`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM ${sql.table(tableName(type))} WHERE ${predicate}`.execute(tx)).rows[0].total;
            const records = (await sql`SELECT *, ${await recordIconExpression(tx,type.id)} AS "iconKey" FROM ${sql.table(tableName(type))} WHERE ${predicate}
              ORDER BY ${sortExpression} ${direction} NULLS LAST, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { records: await Promise.all(records.map(row => contentAccess().project(type.id,this.outputRecord(row as DataRecord, sortableFields)))), total, limit: args.limit, offset: args.offset };
          }
          case 'create_object_type': return this.definitions.createObjectType(tx, schemas.create_object_type.parse(parsed), userId);
          case 'add_standard_field': {
            const args = schemas.add_standard_field.parse(parsed);
            const type = await this.definitions.objectType(tx, args.objectTypeId);
            const change = v7();
            await this.definitions.addStandardField(tx, type, args.field, userId, change, args.required ?? false);
            if(args.inputRules){if(!['keyword','tags'].includes(args.field))throw new AppError(400,'Standard field defaults use their dedicated configuration');const field=(await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id=${type.id}::uuid AND technical_name=${args.field} AND state='active'`.execute(tx)).rows[0];await this.definitions.configureField(tx,{fieldId:field.id,required:field.required,inputRules:args.inputRules},userId,change);}
            if (args.configuration) return this.definitions.configureClassification(tx, { objectTypeId: type.id, ...args.configuration }, userId, change);
            return this.definitions.definition(tx, type.id, userId);
          }
          case 'create_field': return this.definitions.createField(tx, schemas.create_field.parse(parsed), userId);
          case 'get_object_type': return this.definitions.definition(tx, schemas.get_object_type.parse(parsed).objectTypeId, userId);
          case 'configure_field': return this.definitions.configureField(tx, schemas.configure_field.parse(parsed), userId);

          case 'set_labels': return this.definitions.setLabels(tx, schemas.set_labels.parse(parsed), userId);
          case 'set_workspace_name': return this.setWorkspaceName(tx, schemas.set_workspace_name.parse(parsed), userId);
          case 'set_workspace_appearance': return this.setWorkspaceAppearance(tx, schemas.set_workspace_appearance.parse(parsed), userId);

          case 'set_user_profile': {
            const args = schemas.set_user_profile.parse(parsed);
            const previous = (await sql<{ name: string }>`SELECT name FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            if (previous.name !== args.name) {
              await sql`UPDATE sys_users SET name = ${args.name}, management_version = management_version + 1, updated_at = now() WHERE id = ${userId}`.execute(tx);
              await this.journal(tx, userId, null, null, 'user', userId, v7(), 'name', previous.name, args.name);
            }
            return { name: args.name };
          }

          case 'configure_classification': return this.definitions.configureClassification(tx, schemas.configure_classification.parse(parsed), userId);
          case 'get_contact_conversion_preview':return (await contactConversionPlan(tx,schemas.get_contact_conversion_preview.parse(parsed))).preview;
          case 'convert_contact':{
            const args=schemas.convert_contact.parse(parsed),input=schemas.get_contact_conversion_preview.parse(Object.fromEntries(Object.entries(args).filter(([key])=>!['confirm','previewToken'].includes(key))));
            const plan=await contactConversionPlan(tx,input);
            if(args.previewToken!==plan.preview.previewToken)throw new AppError(409,'Contact conversion preview is stale',{code:"contactConversionStale"});
            if(!plan.preview.canExecute)throw new AppError(409,'Resolve Contact conversion conflicts before confirming',{code:"contactConversionBlocked"});
            const changeId=v7();let organization=plan.organization;
            if(args.action==='new_organization'){
              const policy=(await sql<{policy:import('@xobject/contracts').RecordSecurity}>`SELECT policy FROM sys_record_security WHERE object_type_id=${args.objectTypeId}::uuid AND record_id=${args.recordId}::uuid`.execute(tx)).rows[0]?.policy;
              const created=await this.createRecord(tx,schemas.create_record.parse({objectTypeId:args.objectTypeId,values:plan.preview.organizationValues,classification:args.organizationClassification,...(policy?{security:{policy,confirmPublic:true}}:{})}),userId,changeId);
              organization=created as unknown as {id:string;version:number};
            }
            const relationshipBefore:RelationshipJournalSnapshots=new Map();
            for(const item of plan.plans)for(const [id,snapshot] of await captureRelationshipJournalBefore(tx,args.objectTypeId,item.row.id,item.relationships))relationshipBefore.set(id,snapshot);
            const records=[];
            for(const item of plan.plans){
              const relationships=[...item.relationships];
              if(organization)relationships.push({relationshipTypeId:plan.membership.id,version:plan.membership.version,side:'right',targets:[{objectTypeId:args.objectTypeId,recordId:organization.id}]});
              if(args.action==='individual'||args.action==='dissolve_organization'){
                const overrides=(await sql<{field_id:string;value:unknown;technical_name:string}>`SELECT o.field_id,o.value,f.technical_name FROM sys_contact_field_overrides o JOIN sys_fields f ON f.id=o.field_id WHERE o.object_type_id=${args.objectTypeId}::uuid AND o.record_id=${item.row.id}::uuid`.execute(tx)).rows;
                for(const own of overrides)await this.journal(tx,userId,plan.model.workspace_id,args.objectTypeId,'record',item.row.id,changeId,own.technical_name,{mode:'own',value:own.value},null,own.field_id);
                await sql`DELETE FROM sys_contact_field_overrides WHERE object_type_id=${args.objectTypeId}::uuid AND record_id=${item.row.id}::uuid`.execute(tx);
              }
              records.push(await this.updateRecord(tx,schemas.update_record.parse({objectTypeId:args.objectTypeId,recordId:item.row.id,version:item.row.version,values:item.values,relationships,contactInheritance:item.inheritance}),userId,{changeId,relationshipBefore}));
            }
            return {records,...(organization?{organization:await contentAccess().project(args.objectTypeId,await this.record(tx,await this.definitions.objectType(tx,args.objectTypeId),organization.id))}:{})};
          }
          case 'create_record': return this.createRecord(tx, schemas.create_record.parse(parsed), userId);
          case 'update_record': return this.updateRecord(tx, schemas.update_record.parse(parsed), userId);
          case 'get_record': {
            const args = schemas.get_record.parse(parsed);
            const type=await this.definitions.objectType(tx,args.objectTypeId),record=await this.record(tx,type,args.recordId);
            return contentAccess().project(args.objectTypeId,record);
          }
          case 'list_record_journal': {
            const args=schemas.list_record_journal.parse(parsed),type=await this.definitions.objectType(tx,args.objectTypeId);
            const deleted=await deletedRecordIdentity(tx,type.id,args.recordId);
            if(deleted?.deleted_at){if(!args.includeDeleted||!await contentAccess().historyReadable(type.id,args.recordId))throw new AppError(403,'Content access denied');}else{await contentAccess().require(type.id,args.recordId,'read',args.includeRecycled);await this.record(tx,type,args.recordId);}
            if(args.fieldId&&!(await sql`SELECT 1 FROM sys_fields WHERE id=${args.fieldId}::uuid AND object_type_id=${type.id}::uuid`.execute(tx)).rows.length)throw new AppError(400,'Unknown journal field');
            return recordJournalPage(tx,args,type.workspace_id);
          }

        }
      })));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {const name=String((error as {constraint?:string}).constraint??'');
        if(/^xobject_unique_[a-f0-9]{32}$/.test(name)){const id=name.slice('xobject_unique_'.length);throw new AppError(409,'A unique field value already exists',{code:'unique_value',fieldId:`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`,context:['create_record','update_record','duplicate_record'].includes(operation)?'record':'definition'});}
        throw new AppError(409,name.includes('number_allocations')||name.startsWith('xobject_number_')?'Record number is already assigned':'Name already exists');}
      throw error;
    }
  }

  private async authorize(tx: Executor, operation: Operation, args: Record<string, unknown>, actor: string) {
    const user = (await sql<{ is_admin: boolean; active: boolean; must_change_password: boolean }>`SELECT is_admin, active, must_change_password FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    if (!user || !user.active) throw new AppError(403, 'Access denied');
    if (user.must_change_password && !['get_account_security', 'change_password'].includes(operation)) throw new AppError(403, 'Password change required');
    if (isAccountSecurityOperation(operation)||credentialOperation(operation)||operation==='list_oauth_authorizations'||operation==='revoke_oauth_authorization') return { isAdmin: user.is_admin };
    const recycledRead=operation==='get_recycled_record'||operation==='restore_record'||operation==='permanently_delete_record'||(operation==='list_record_journal'&&(args.includeRecycled===true||args.includeDeleted===true));
    if(operation==='list_deleted_records'){if(!user.is_admin)throw new AppError(403,'Access denied');return {isAdmin:true};}
    if(operation==='list_record_journal'&&args.includeDeleted===true){const removed=await deletedRecordIdentity(tx,String(args.objectTypeId),String(args.recordId));if(removed?.deleted_at){if(!await contentAccess().historyReadable(String(args.objectTypeId),String(args.recordId)))throw new AppError(403,'Content access denied');return {isAdmin:user.is_admin};}}
    if(typeof args.objectTypeId==='string'&&typeof args.recordId==='string'&&!recycledRead){
      await contentAccess().require(args.objectTypeId,args.recordId,'read',true);
      const recycled=(await sql`SELECT 1 FROM sys_record_identities WHERE object_type_id=${args.objectTypeId}::uuid AND record_id=${args.recordId}::uuid AND recycled_at IS NOT NULL`.execute(tx)).rows.length;
      if(recycled)throw new AppError(404,'Record is in the recycle bin');
    }
    if(['permanently_delete_record','recycle_record','restore_record','get_recycled_record'].includes(operation)){
      await contentAccess().require(String(args.objectTypeId),String(args.recordId),operation==='recycle_record'?'delete':operation==='restore_record'||operation==='permanently_delete_record'?'full':'read',recycledRead);return {isAdmin:user.is_admin};
    }
    if(operation==='list_record_journal'&&recycledRead){await contentAccess().require(String(args.objectTypeId),String(args.recordId),'read',true);return {isAdmin:user.is_admin};}
    if(['get_numbering_backfill_preview','backfill_record_numbers'].includes(operation)&&!user.is_admin)throw new AppError(403,'Only Administrators assign missing record numbers');
    if (user.is_admin) return { isAdmin: true };
    if(operation==='configure_group'&&args.members!==undefined)throw new AppError(403,'Only Administrators manage group memberships');
    if (operation==='create_group' && Array.isArray(args.members)&&args.members.length) throw new AppError(403, 'Only Administrators manage group memberships');
    if (['list_field_schemas','get_time_zone_catalog', 'configure_user_localization', 'get_language_catalog', 'get_access_context', 'list_workspaces',  'set_user_profile'].includes(operation)) return { isAdmin: false };
    if(['get_foreign_access','configure_foreign_access'].includes(operation)){await foreignAccessView(tx,String(args.workspaceId),actor);return {isAdmin:false};}
    if(['get_foreign_access','configure_foreign_access','configure_group_inheritance','get_content_permissions','configure_content_permissions'].includes(operation))throw new AppError(403,'Only Administrators manage content permissions');
    const contentOperations=['get_contact_conversion_preview','convert_contact','get_record_duplicate','duplicate_record','get_record_security','configure_record_security','list_record_link_options','get_primary_chain_context','get_relationship_tree_branch','get_record_relationships','get_record_relationship_page','search_relationship_candidates','list_record_journal','get_record','list_records','list_field_tags','create_record','update_record','list_access_principals'];
    if(contentOperations.includes(operation)){await contentAccess().require(String(args.objectTypeId),args.recordId as string|undefined,operation==='create_record'||(['get_record_relationships','get_primary_chain_context','search_relationship_candidates'].includes(operation)&&!args.recordId)?'create':operation==='update_record'?'edit':['configure_record_security','get_contact_conversion_preview','convert_contact'].includes(operation)?'full':['duplicate_record','get_record_duplicate'].includes(operation)?'duplicate':'read');return {isAdmin:false};}
    if(['list_recycled_records','get_workspace_dashboard','list_workspace_records','search_workspace'].includes(operation)){if(!(await sql`SELECT 1 FROM sys_workspace_members WHERE workspace_id=${args.workspaceId}::uuid AND user_id=${actor}`.execute(tx)).rows.length)throw new AppError(403,'Access denied');return {isAdmin:false};}
    // Other instance operations remain Administrator-only.
    if (['get_primary_chain_context', 'get_relationship_tree_branch', 'get_record_relationships', 'search_relationship_candidates', 'list_record_journal', 'get_workspace_dashboard', 'list_workspace_records', 'list_managed_users', 'create_user', 'configure_user', 'list_system_journal',  'set_group_active', 'create_workspace', 'list_users', 'set_workspace_member', 'search_workspace', 'list_records', 'get_record',  'create_record', 'update_record'].includes(operation)) throw new AppError(403, 'Access denied');
    let workspaceId: string | undefined;
    if (typeof args.workspaceId === 'string') workspaceId = args.workspaceId;
    else if (typeof args.objectTypeId === 'string') workspaceId = (await sql<{ workspace_id: string }>`SELECT workspace_id FROM sys_object_types WHERE id = ${args.objectTypeId}::uuid`.execute(tx)).rows[0]?.workspace_id;
    else if(typeof args.relationshipTypeId==='string')workspaceId=(await sql<{workspace_id:string}>`SELECT workspace_id FROM sys_relationship_types WHERE id=${args.relationshipTypeId}::uuid`.execute(tx)).rows[0]?.workspace_id;
    else if (typeof args.fieldId === 'string' || (['set_labels', 'set_definition_state'].includes(operation) && args.kind === 'field')) {
      const fieldId = args.fieldId ?? args.id;
      workspaceId = (await sql<{ workspace_id: string }>`SELECT COALESCE(o.workspace_id,r.workspace_id) AS workspace_id FROM sys_fields f LEFT JOIN sys_object_types o ON o.id = f.object_type_id LEFT JOIN sys_relationship_types r ON r.id=f.relationship_type_id WHERE f.id = ${fieldId}::uuid`.execute(tx)).rows[0]?.workspace_id;
    } else if (['set_labels', 'set_definition_state'].includes(operation) && args.kind === 'object_type') workspaceId = (await sql<{ workspace_id: string }>`SELECT workspace_id FROM sys_object_types WHERE id = ${args.id}::uuid`.execute(tx)).rows[0]?.workspace_id;
    if (!workspaceId) throw new AppError(403, 'Access denied');
    const member = (await sql<{ role: string }>`SELECT role FROM sys_workspace_members WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${actor}`.execute(tx)).rows[0];
    if (!member) throw new AppError(403, 'Access denied');
    if(operation==='configure_navigation'&&args.scope==='personal')return {isAdmin:false};
    const reads: Operation[] = ['get_workspace_navigation','get_foreign_access_capabilities','list_workspace_modules', 'list_relationship_types', 'list_groups', 'list_object_types', 'get_object_type', 'list_workspace_members', 'list_field_principals', 'get_definition_journal'];
    const configuration: Operation[] = ['configure_navigation','configure_object_settings','configure_form_layout', 'configure_workspace_module', 'activate_relationship_type', 'create_relationship_type', 'configure_relationship_type', 'configure_group', 'configure_workspace_languages', 'set_workspace_appearance', 'set_workspace_name',  'create_object_type', 'create_field', 'add_standard_field', 'configure_field',  'set_labels', 'configure_classification', 'create_group', 'set_definition_state'];
    if (!reads.includes(operation) && !(member.role === 'designer' && configuration.includes(operation))) throw new AppError(403, 'Access denied');
    return { isAdmin: false };
  }

  private async setWorkspaceMember(tx: Executor, args: z.infer<typeof schemas.set_workspace_member>, actor: string) {
    if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
    const target = (await sql<{ is_admin: boolean }>`SELECT is_admin FROM sys_users WHERE id = ${args.userId}`.execute(tx)).rows[0];
    if (!target) throw new AppError(404, 'User not found');
    if (target.is_admin) throw new AppError(400, 'Administrator membership is implicit');
    const previous = (await sql<{ role: 'user' | 'designer' }>`SELECT role FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid AND user_id = ${args.userId}`.execute(tx)).rows[0]?.role ?? null;
    if (previous !== args.expectedRole) throw new AppError(409,'Membership version conflict',{code:"version_conflict"});
    if (previous !== args.role) {
      const change = v7();
      if (args.role === null) {
        const groups = (await sql<{ id: string;level:string }>`SELECT g.id,m.level FROM sys_groups g JOIN sys_group_members m ON m.group_id = g.id WHERE g.workspace_id = ${args.workspaceId}::uuid AND m.user_id = ${args.userId}`.execute(tx)).rows;
        for (const group of groups) {
          await sql`DELETE FROM sys_group_members WHERE group_id = ${group.id}::uuid AND user_id = ${args.userId}`.execute(tx);
          await sql`UPDATE sys_groups SET version = version + 1 WHERE id = ${group.id}::uuid`.execute(tx);
          await this.journal(tx, actor, args.workspaceId, null, 'group', group.id, change, `membership.user:${args.userId}`, group.level, null);
        }
        const removed=(await sql<{object_type_id:string;level:string|null;can_create:boolean|null;fields:Record<string,string>}>`SELECT object_type_id,level,can_create,fields FROM sys_content_grants WHERE principal_kind='user' AND principal_id=${args.userId} AND object_type_id IN(SELECT id FROM sys_object_types WHERE workspace_id=${args.workspaceId}::uuid)`.execute(tx)).rows;
        for(const grant of removed){
          if(grant.can_create!==null)await this.journal(tx,actor,args.workspaceId,grant.object_type_id,'object_permissions',grant.object_type_id,change,`permission.user:${args.userId}.create`,grant.can_create,null);
          if(grant.level!==null)await this.journal(tx,actor,args.workspaceId,grant.object_type_id,'object_permissions',grant.object_type_id,change,`permission.user:${args.userId}.level`,grant.level,null);
          for(const [field,level] of Object.entries(grant.fields))await this.journal(tx,actor,args.workspaceId,grant.object_type_id,'object_permissions',grant.object_type_id,change,`permission.user:${args.userId}.field.${field}`,level,null,field);
          await sql`UPDATE sys_object_types SET permissions_version=permissions_version+1 WHERE id=${grant.object_type_id}::uuid`.execute(tx);
        }
        await sql`DELETE FROM sys_content_grants WHERE principal_kind='user' AND principal_id=${args.userId} AND object_type_id IN(SELECT id FROM sys_object_types WHERE workspace_id=${args.workspaceId}::uuid)`.execute(tx);
      await sql`DELETE FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid AND user_id = ${args.userId}`.execute(tx);
      }
      else await sql`INSERT INTO sys_workspace_members (workspace_id, user_id, role) VALUES (${args.workspaceId}::uuid, ${args.userId}, ${args.role}) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`.execute(tx);
      await this.journal(tx, actor, args.workspaceId, null, 'workspace_member', args.workspaceId, change, `member:${args.userId}`, previous, args.role);
    }
    return { workspaceId: args.workspaceId, userId: args.userId, role: args.role };
  }

  private async searchWorkspace(tx: Executor, args: z.infer<typeof schemas.search_workspace>, userId: string) {
    const workspace = (await sql<{ code: string; default_language: Language; available_languages: Language[] }>`SELECT code, default_language, available_languages FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!workspace) throw new AppError(404, 'Workspace not found');
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
    const types = (await sql<{ id: string; technical_name: string; labels: Labels; has_keyword: boolean }>`SELECT o.id, o.technical_name, o.labels, EXISTS (SELECT 1 FROM sys_fields f WHERE f.object_type_id = o.id AND f.technical_name = 'keyword' AND f.state = 'active') AS has_keyword FROM sys_object_types o WHERE workspace_id = ${args.workspaceId}::uuid AND o.state = 'active' ORDER BY technical_name`.execute(tx)).rows;
    const visibleTypes=[];for(const type of types)if((await contentAccess().policy(type.id)).capabilities.read)visibleTypes.push(type);
    const summaries = await Promise.all(visibleTypes.map(async type => ({ iconKey:await objectRecordIcon(tx,type.id), id: type.id, technicalName: type.technical_name, labels: type.labels, label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, workspace.available_languages, workspace.default_language), workspace.default_language) })));
    const needle = args.query.toLowerCase();
    const matches = summaries.filter(type => type.label.toLowerCase().includes(needle) || type.technicalName.includes(needle));
    // Search only this workspace's metadata-derived tables; user text is always a SQL value.
    const queries=[];
    for(const type of visibleTypes){const policy=await contentAccess().policy(type.id),hasKeyword=type.has_keyword&&await contentAccess().canField(type.id,'keyword'),keyword=await contentAccess().keywordValue(type.id),number=await contentAccess().fieldValueByName(type.id,'record_number');
      queries.push(sql`(SELECT id,${await recordIconExpression(tx,type.id)} AS "iconKey",${keyword} AS keyword,${number} AS record_number,updated_at,${type.id}::uuid AS object_type_id FROM ${sql.table(`${workspace.code}_${type.technical_name}`)} WHERE ${policy.predicate()} AND (position(lower(${args.query}) in lower(${keyword}))>0 OR position(lower(${args.query}) in lower(${number}))>0) ORDER BY updated_at DESC,id LIMIT ${args.limit+1})`);
    }
    const rows = queries.length ? (await sql<{ id: string; keyword: string; record_number:string|null; iconKey:import('@xobject/contracts').RecordIconKey; object_type_id: string }>`SELECT * FROM (${sql.join(queries, sql` UNION ALL `)}) AS matches
      ORDER BY updated_at DESC, id LIMIT ${args.limit + 1}`.execute(tx)).rows : [];
    const labels = new Map(summaries.map(type => [type.id, type.label]));
    return { objectTypes: matches.slice(0, args.limit),
      records: rows.slice(0, args.limit).map(row => ({ id: row.id, iconKey:row.iconKey, keyword: row.keyword,recordNumber:row.record_number, objectTypeId: row.object_type_id, objectLabel: labels.get(row.object_type_id)! })),
      hasMoreObjects: matches.length > args.limit, hasMoreRecords: rows.length > args.limit };
  }

  private async record(tx: Executor, type: ObjectType, id: string) {
    const result = await sql<DataRecord>`SELECT *, ${await recordIconExpression(tx,type.id)} AS "iconKey" FROM ${sql.table(tableName(type))} WHERE id = ${id}::uuid`.execute(tx);
    if (!result.rows[0]) throw new AppError(404, 'Record not found');
    const fields = (await sql<Field>`SELECT value_mode,applicability, id, technical_name, kind, required, config,input_rules, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    return this.outputRecord(result.rows[0], fields);
  }

  private outputRecord(record: DataRecord, fields: Field[]): DataRecord {
    for (const [key, value] of Object.entries(record)) if (value instanceof Date) record[key] = value.toISOString();
    for (const field of fields.filter(field => field.value_mode!=='derived'&&isCustomFieldKind(field.kind)&&!['access_principals','record_number'].includes(field.technical_name))) record[field.technical_name] = normalizeFieldValue({ ...field, required: false }, record[field.technical_name], record[field.technical_name]);
    return record;
  }

  private async journal(tx: Executor, actor: string, workspace: string | null, type: string | null,
    entityKind: string, entityId: string, changeId: string, key: string, oldValue: unknown, newValue: unknown, fieldId: string | null = null) {
    const field=entityKind==='record'&&fieldId?(await sql<{kind:string;config:FieldConfig;value_mode:string}>`SELECT kind,config,value_mode FROM sys_fields WHERE id=${fieldId}::uuid`.execute(tx)).rows[0]:undefined;
    const effective=field?.kind==='structured'&&field.value_mode==='derived'&&type?(await contactFields(tx,type)).find(f=>f.id===fieldId):undefined;
    const detail=field?.kind==='structured'?{schema:field.config.schema,changes:structuredChanges(oldValue,newValue),...(effective&&inheritedContactFields.includes(effective.field_key as typeof inheritedContactFields[number])?{valueContext:{kind:field.kind,config:effective.config}}:{})}:null;
    await sql`INSERT INTO sys_journal
      (id, change_id, workspace_id, object_type_id, entity_kind, entity_id, field_id, field_key, detail_context,old_value, new_value, actor_id)
      VALUES (${v7()}::uuid, ${changeId}::uuid, ${workspace}::uuid, ${type}::uuid, ${entityKind},
      ${entityId}::uuid, ${fieldId}::uuid, ${key}, ${JSON.stringify(detail)}::jsonb,${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(newValue)}::jsonb, ${actor})`.execute(tx);
  }

  private async createWorkspace(tx: Executor, args: z.infer<typeof schemas.create_workspace>, actor: string) {
    if (args.code === 'sys') throw new AppError(400, 'Reserved workspace code');
    const id = v7();
    await sql`INSERT INTO sys_workspaces (id, code, name, created_by, default_language, time_zone, regional)
      VALUES (${id}::uuid, ${args.code}, ${args.name}, ${actor}, ${args.defaultLanguage}, ${args.timeZone}, ${JSON.stringify(args.regional ?? { ...defaultRegionalSettings, locale: args.defaultLanguage === 'de' ? 'de-DE' : 'en-US' })}::jsonb)`.execute(tx);
    const change = v7();
    for (const [key, value] of Object.entries({ name: args.name, code: args.code, default_language: args.defaultLanguage, time_zone: args.timeZone })) {
      await this.journal(tx, actor, id, null, 'workspace', id, change, key, null, value);
    }
    const regional = args.regional ?? { ...defaultRegionalSettings, locale: args.defaultLanguage === 'de' ? 'de-DE' : 'en-US' };
    for (const [key, value] of Object.entries(regional)) await this.journal(tx, actor, id, null, 'workspace', id, change, `regional.${key}`, null, value);
    await installSystemRelationships(tx, id, actor);
    await sql`INSERT INTO sys_workspace_modules(workspace_id,module_key) SELECT ${id}::uuid,key FROM sys_modules ON CONFLICT DO NOTHING`.execute(tx);
    return { id, ...args };
  }

  /** Upgrade-tool entry point; all writers are stopped and the caller owns the model lock. */
  private async setWorkspaceName(tx: Executor, args: z.infer<typeof schemas.set_workspace_name>, actor: string) {
    const workspace = (await sql<{ name: string }>`SELECT name FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!workspace) throw new AppError(404, 'Workspace not found');
    if (workspace.name !== args.name) {
      await sql`UPDATE sys_workspaces SET name = ${args.name} WHERE id = ${args.workspaceId}::uuid`.execute(tx);
      await this.journal(tx, actor, args.workspaceId, null, 'workspace', args.workspaceId, v7(), 'name', workspace.name, args.name);
    }
    return { workspaceId: args.workspaceId, name: args.name };
  }

  private async setWorkspaceAppearance(tx: Executor, args: z.infer<typeof schemas.set_workspace_appearance>, actor: string) {
    const previous = (await sql<{ appearance: WorkspaceAppearance; appearance_version: number }>`SELECT appearance, appearance_version FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid FOR UPDATE`.execute(tx)).rows[0];
    if (!previous) throw new AppError(404, 'Workspace not found');
    if (previous.appearance_version !== args.version) throw new AppError(409,'Workspace appearance version conflict',{code:"version_conflict"});
    const changed = (Object.keys(args.appearance) as (keyof WorkspaceAppearance)[]).filter(key => !isDeepStrictEqual(previous.appearance[key], args.appearance[key]));
    const version = previous.appearance_version + (changed.length ? 1 : 0);
    if (changed.length) {
      await sql`UPDATE sys_workspaces SET appearance = ${JSON.stringify(args.appearance)}::jsonb, appearance_version = ${version} WHERE id = ${args.workspaceId}::uuid`.execute(tx);
      const change = v7();
      for (const key of changed) await this.journal(tx, actor, args.workspaceId, null, 'workspace', args.workspaceId, change, `appearance.${key}`, previous.appearance[key], args.appearance[key]);
    }
    return { workspaceId: args.workspaceId, appearance: args.appearance, version };
  }

  private async normalizeRecordFields(tx: Executor, type: ObjectType, fields: Field[], data: Record<string, FieldValue>, previous?: DataRecord) {
    for (const field of fields.filter(field => field.state === 'active' && field.value_mode!=='derived' && isCustomFieldKind(field.kind))) {
      const supplied = Object.hasOwn(data, field.technical_name);
      const input=supplied?data[field.technical_name]:previous?.[field.technical_name];
      const applicable=applies(field,fields,{...previous,...data});
      if(!applicable&&!isEmptyFieldValue(input))throw new AppError(400,`Field not applicable: ${field.technical_name}`);
      const value = normalizeFieldValue({...field,required:field.required&&applicable}, input, previous?.[field.technical_name]);
      validateUniqueLength(field,value,field.input_rules?.unique??false);
      await validateReferences(tx, field, value, type.workspace_id, previous?.[field.technical_name]);
      if (supplied) data[field.technical_name] = value;
    }
  }

  private async fields(tx: Executor, type: ObjectType, args: Record<string, FieldValue>) {
    const fields = (await sql<Field>`SELECT value_mode,applicability, id, technical_name, kind, required, config,input_rules, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    for (const name of Object.keys(args)) {
      if (['keyword','record_number'].includes(name)||fields.some(f=>f.technical_name===name&&f.value_mode==='derived') || !fields.some(f => f.state === 'active' && f.technical_name === name && isCustomFieldKind(f.kind))) throw new AppError(400, 'Unknown or reserved record field; values keys must be writable technical field names, not field IDs');
    }
    this.definitions.requireActive(type);
    return fields;
  }

  private checkStandardValues(fields: Field[], keyword: string | undefined, classification: Record<string, unknown>) {
    if(keyword!==undefined&&fields.some(f=>f.technical_name==='keyword'&&f.value_mode==='derived'))throw new AppError(400,'Derived field cannot be assigned');
    if (keyword !== undefined && !fields.some(field => field.state === 'active' && field.technical_name === 'keyword')) throw new AppError(400, 'Standard field is not installed');
    for (const kind of Object.keys(classification)) if (!fields.some(field => field.state === 'active' && field.technical_name === kind)) throw new AppError(400, 'Standard field is not installed');
  }

  private async checkRequiredPermissions(type:ObjectType,fields:Field[],data:Record<string,FieldValue>,previous?:DataRecord){
    const policy=await contentAccess().policy(type.id);if(policy.admin)return;
    const resulting={...previous,...data};
    for(const field of fields.filter(f=>f.state==='active')){
      const required=isCustomFieldKind(field.kind)?field.required:type.classification[field.kind as 'type'|'status'|'category']?.required;
      if(field.value_mode!=='derived'&&required&&applies(field,fields,resulting)&&isEmptyFieldValue(resulting[field.technical_name])&&!(previous?policy.field(field.id,previous.id).edit:policy.creationField(field.id)))throw new AppError(403,'Required fields cannot be completed with current field permissions',{code:"permissionRequiredFields"});
    }
  }

  private async duplicateDraft(tx:Executor,type:ObjectType,source:DataRecord,recordId:string) {
            const policy=await contentAccess().policy(type.id),fields=await this.fields(tx,type,{});const values:Record<string,FieldValue>={};for(const f of fields)if(f.state==='active'&&f.value_mode!=='derived'&&isCustomFieldKind(f.kind)&&!['keyword','access_principals','record_number'].includes(f.technical_name)&&!f.input_rules?.unique&&policy.field(f.id,recordId).read&&policy.creationField(f.id))values[f.technical_name]=source[f.technical_name] as FieldValue;
            const classification=Object.fromEntries(['type','status','category'].filter(key=>fields.some(f=>f.technical_name===key&&policy.field(f.id,recordId).read&&policy.creationField(f.id))).map(key=>[key,source[key]]));
    return {contactInheritance:(await contactInheritance(tx,type.id,recordId)).filter(f=>f.mode==='own'&&policy.creationField(f.fieldId)).map(f=>({fieldId:f.fieldId,mode:'own' as const,value:f.value})),sourceVersion:source.version,values,classification,...(fields.some(f=>f.technical_name==='keyword'&&f.value_mode!=='derived'&&!f.input_rules?.unique&&policy.field(f.id,recordId).read&&policy.creationField(f.id))?{keyword:source.keyword}:{})};
  }

  private async createRecord(tx:Executor,args:z.infer<typeof schemas.create_record>,actor:string,changeId?:string){
    return createRecord({objectType:this.definitions.objectType.bind(this.definitions),fields:this.fields.bind(this),checkStandardValues:this.checkStandardValues.bind(this),checkRequiredPermissions:this.checkRequiredPermissions.bind(this),normalizeRecordFields:this.normalizeRecordFields.bind(this),record:this.record.bind(this),journal:this.journal.bind(this)},tx,args,actor,changeId);
  }

  private async recordLifecycle(tx:Executor,args:z.infer<typeof schemas.recycle_record>,actor:string,restore:boolean){
    const type=await this.definitions.objectType(tx,args.objectTypeId);
    await contentAccess().require(type.id,args.recordId,restore?'full':'delete',restore);
    this.definitions.requireActive(type);
    const row=await this.record(tx,type,args.recordId);
    if(row.version!==args.version)throw new AppError(409,'Record version conflict',{code:"version_conflict"});
    const identity=(await sql<{recycled_at:Date|null}>`SELECT recycled_at FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx)).rows[0];
    if(Boolean(identity?.recycled_at)!==restore)throw new AppError(409,'Record lifecycle conflict');
    if(restore){
      const fields=await this.fields(tx,type,{});
      await this.normalizeRecordFields(tx,type,fields.filter(f=>f.technical_name!=='access_principals'),{},row);
      resolveChoices(effectiveClassification(type.classification,fields),{},row as unknown as Choices);
      await validateContact(tx,type.id,row);
      await validateWork(tx,type.id,row,type.classification);
      await validateRestoredRelationships(tx,type.id,args.recordId);
      await validatePrimaryRequirements(tx,type.workspace_id);
    }
    await sql`UPDATE sys_record_identities SET recycled_at=${restore?sql`NULL`:sql`now()`},recycled_by=${restore?null:actor} WHERE object_type_id=${type.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx);
    await sql`UPDATE ${sql.table(tableName(type))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
    await this.journal(tx,actor,type.workspace_id,type.id,'record',args.recordId,v7(),'lifecycle',restore?'recycled':'active',restore?'active':'recycled');
    return {id:args.recordId,version:row.version+1};
  }

  private async updateRecord(tx: Executor, args: z.infer<typeof schemas.update_record>, actor: string, conversion?:{changeId:string;relationshipBefore?:RelationshipJournalSnapshots}) {
    const type = await this.definitions.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    this.checkStandardValues(fields, args.keyword, args.classification);
    const previous = await this.record(tx, type, args.recordId);
    await contentAccess().require(type.id,args.recordId,'edit');
    await contentAccess().checkWrites(type.id,{...args.values,...args.classification,...(args.keyword!==undefined?{keyword:args.keyword}:{})},previous);
    if (previous.version !== args.version) throw new AppError(409,'Record version conflict',{code:"version_conflict"});
    if(args.security)await contentAccess().require(type.id,args.recordId,'full');
    const choices = resolveChoices(effectiveClassification(type.classification, fields), args.classification, previous as unknown as Choices);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))) };
    if (args.keyword !== undefined) data.keyword = args.keyword;
    await this.checkRequiredPermissions(type,fields,data,previous);
    await this.normalizeRecordFields(tx, type, fields, data, previous);
    const profile=await contactProfile(tx,type.id),kind=fields.find(f=>f.id===profile?.fields.contact_kind);
    if(!conversion&&kind&&data[kind.technical_name]!==undefined&&!isDeepStrictEqual(data[kind.technical_name],previous[kind.technical_name]))throw new AppError(400,'Contact kind cannot be changed after creation',{code:'contactKindImmutable',fieldId:kind.id});
    await validateContact(tx,type.id,{...previous,...data});
    await validateWork(tx,type.id,{...previous,...data},type.classification);
    const changed = Object.entries(data).filter(([key, value]) => !isDeepStrictEqual(previous[key], value));
    await contentAccess().checkWrites(type.id,Object.fromEntries(changed),previous);
    const relationshipBefore=conversion?.relationshipBefore??await captureRelationshipJournalBefore(tx,type.id,args.recordId,args.relationships);
    const change = conversion?.changeId ?? v7();
    if(changed.length){
    const assignments = changed.map(([key, value]) => sql`${sql.ref(key)} = ${storedParameter(fields.find(field => field.technical_name === key)!, value)}`);
    await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.join(assignments)},
      version = version + 1, updated_at = now(), updated_by = ${actor}
      WHERE id = ${args.recordId}::uuid AND version = ${args.version}`.execute(tx);
    contentAccess().clear();
    for (const [key, value] of changed) await this.journal(tx, actor, type.workspace_id, type.id, 'record', args.recordId, change, key, previous[key], value, fields.find(f => f.technical_name === key)!.id);
    }
    const linksChanged=await writeRecordRelationships(tx,type.id,args.recordId,args.relationships,actor,change,changed.length>0,false,args.relationshipAttributes,relationshipBefore);
    const inheritanceChanged=await writeContactInheritance(tx,type.id,args.recordId,args.contactInheritance,(key,before,after,field)=>this.journal(tx,actor,type.workspace_id,type.id,'record',args.recordId,change,key,before,after,field));
    if(inheritanceChanged&&!changed.length&&!linksChanged)await sql`UPDATE ${sql.table(tableName(type))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
    if(args.security){
      const policyChanged=await writeRecordSecurity(tx,{objectTypeId:type.id,recordId:args.recordId,...args.security},(_change,key,before,after,field)=>this.journal(tx,actor,type.workspace_id,type.id,'record',args.recordId,change,key,before,after,field));
      if(policyChanged&&!changed.length&&!linksChanged&&!inheritanceChanged)await sql`UPDATE ${sql.table(tableName(type))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
    }
    return contentAccess().project(type.id,await this.record(tx, type, args.recordId));
  }
}
