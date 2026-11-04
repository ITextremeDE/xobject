import {recordSecurity,saveRecordSecurity,writeRecordSecurity,initializeRecordSecurity} from './record-security.js';
import {getForeignAccess,foreignAccessView,configureForeignAccess,configureGroupInheritance} from './ownership-settings.js';
import {readableRecordJournal,withContentAccess,contentAccess,getContentPermissions,configureContentPermissions} from './content-permissions.js';
import {formLayoutElements,formEntryKey,formLayoutEntries,formRelationshipFields,resolveFormLayout,type FormLayouts} from '@xobject/contracts';
import {primaryChain} from './primary-chain.js';
import { applies, validateApplicability, applicabilityDependents } from './field-applicability.js';
import { journalValueContexts } from './record-journal.js';
import { lockOperation } from './operation-locks.js';
import { installObjectIntegrity } from './storage-integrity.js';
import {validateRestoredRelationships,recordLinkOptions,linkedRecordWrites, primaryChainContext, relationshipTreeBranch, recordRelationships, searchRelationshipCandidates, activateRelationship, writeRecordRelationships } from './record-relationships.js';
import { workspaceModules, configureWorkspaceModule, installSystemRelationships, relationshipTypes, configureRelationship } from './relationship-types.js';
import { enrichJournalContext } from './journal-context.js';
import { listWorkspaceRecords, workspaceDashboard } from './dashboard.js';
import { managedUsers, createUser, configureUser } from './user-management.js';
import { configureWorkspaceLanguages, workspaceGroups, configureGroup, createWorkspaceGroup, validateDefinitionLanguages } from './workspace-configuration.js';
import { normalizePersonalRegional, defaultRegionalSettings, type RegionalSettings, type PersonalRegionalSettings, installedTimeZones, languageCatalog, effectiveWorkspaceLanguage, type Language } from '@xobject/contracts';
import { sql } from 'kysely';
import { AccountSecurityService, isAccountSecurityOperation } from './account-security.js';
import { v7 } from 'uuid';
import type { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { fieldConfig, fieldStorage, normalizeFieldValue, validateReferences, convertFieldValue, storedParameter, isEmptyFieldValue, type TypedField } from './field-types.js';
import { AppError } from './errors.js';
export { AppError } from './errors.js';
import { addClassificationFields } from './database.js';
import { resolveChoices, validateChoices, validateRules, type Choices } from './classification.js';
import { schemas, hasReservedStandardFieldLabel, isReservedStandardFieldName, isCustomFieldKind, type FieldConfig, type FieldValue, type ClassificationConfig, type WorkspaceAppearance, type Operation } from '@xobject/contracts';
export { schemas, type Operation } from '@xobject/contracts';
import type { Database, Executor } from './database.js';

type Labels = Record<string, string>;
type ObjectType = { permissions_version:number; form_layouts?:FormLayouts; version: number; id: string; workspace_id: string; technical_name: string; code: string; labels: Labels; default_language: string; available_languages: Language[]; classification: ClassificationConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
type Field = { applicability?: import('@xobject/contracts').FieldApplicability; version: number; id: string; technical_name: string; labels: Labels; kind: string; required: boolean; config: FieldConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
type DataRecord = Record<string, unknown> & { id: string; version: number; keyword: string };
const reserved = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'keyword', 'type', 'status', 'category', 'business_number', 'access_principals', 'tableoid', 'xmin', 'xmax', 'cmin', 'cmax', 'ctid']);
// Keep initial user-defined SQL names clear of PostgreSQL reserved words as well.
async function checkName(db: Executor, name: string) {
  if (reserved.has(name)) throw new AppError(400, 'Reserved technical name');
  const result = await sql`SELECT 1 FROM pg_get_keywords() WHERE word = ${name} AND catcode = 'R'`.execute(db);
  if (result.rows.length) throw new AppError(400, 'Reserved SQL name');
}
const tableName = (type: ObjectType) => `${type.code}_${type.technical_name}`;

export function localizedLabel(labels: Labels, userLanguage: string | null, workspaceLanguage: string): string {
  for (const key of [userLanguage, workspaceLanguage, 'en', 'de']) {
    if (key && labels[key]) return labels[key];
  }
  return Object.values(labels)[0];
}

/** Every entry point resolves a real session and calls this shared application layer. */
export class Application {
  private accountSecurity = new AccountSecurityService();
  constructor(private db: Database) {}

  async execute(operation: Operation, input: unknown, userId: string, context?: { sessionId: string }): Promise<unknown> {
    const parsed = schemas[operation].parse(input);
    try {
      return await this.db.transaction().execute(async (tx) => withContentAccess(tx,userId,async()=>{
        await lockOperation(tx, operation, parsed as Record<string, unknown>);
        const access = await this.authorize(tx, operation, parsed as Record<string, unknown>, userId);
        if (isAccountSecurityOperation(operation)) return this.accountSecurity.execute(tx, operation, parsed, userId, context?.sessionId, (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
        if (['configure_field',  'set_labels'].includes(operation)) {
          const args = parsed as { fieldId?: string; id?: string; kind?: string; version?: number };
          const name = args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields';
          const row = (await sql<{version:number}>`SELECT version FROM ${sql.table(name)} WHERE id=${args.fieldId ?? args.id}::uuid AND state<>'deleted'`.execute(tx)).rows[0];
          if (!row) throw new AppError(404, 'Definition not found');
          if (row.version !== args.version) throw new AppError(409, 'Definition version conflict');
        }
        if(['configure_field','set_labels','set_definition_state'].includes(operation)){
          const input=parsed as {fieldId?:string;id?:string;kind?:string};
          if(input.fieldId||input.kind==='field'){
            const special=(await sql`SELECT 1 FROM sys_fields WHERE id=${input.fieldId??input.id}::uuid AND technical_name='access_principals'`.execute(tx)).rows.length;
            if(special)throw new AppError(403,'Access principals is managed by object security');
          }
        }
        await validateDefinitionLanguages(tx, operation, parsed as Record<string, unknown>);
        const configJournal = (kind: string, id: string, change: string, key: string, before: unknown, after: unknown) => this.journal(tx, userId, (parsed as { workspaceId: string }).workspaceId, null, kind, id, change, key, before, after);
        switch (operation) {
          case 'get_foreign_access_capabilities': {const a=schemas.get_foreign_access_capabilities.parse(parsed),config=await getForeignAccess(tx,a.workspaceId);return {manageOwn:access.isAdmin||config.users.some(u=>u.userId===userId&&u.manageOwn)};}
          case 'get_foreign_access':return foreignAccessView(tx,(parsed as {workspaceId:string}).workspaceId,userId);
          case 'configure_foreign_access':return configureForeignAccess(tx,schemas.configure_foreign_access.parse(parsed),configJournal,userId);
          case 'configure_group_inheritance':return configureGroupInheritance(tx,schemas.configure_group_inheritance.parse(parsed),configJournal);
          case 'get_record_security': {const a=schemas.get_record_security.parse(parsed);return recordSecurity(tx,a.objectTypeId,a.recordId);}
          case 'configure_record_security': {const a=schemas.configure_record_security.parse(parsed),t=await this.objectType(tx,a.objectTypeId);return saveRecordSecurity(tx,a,userId,(change,key,before,after,field)=>this.journal(tx,userId,t.workspace_id,t.id,'record',a.recordId,change,key,before,after,field));}
          case 'recycle_record':
          case 'restore_record': return this.recordLifecycle(tx,schemas.recycle_record.parse(parsed),userId,operation==='restore_record');
          case 'get_recycled_record': {
            const a=schemas.get_recycled_record.parse(parsed),type=await this.objectType(tx,a.objectTypeId);
            await contentAccess().require(type.id,a.recordId,'read',true);
            const state=(await sql`SELECT 1 FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${a.recordId}::uuid AND recycled_at IS NOT NULL`.execute(tx)).rows.length;
            if(!state)throw new AppError(404,'Recycled record not found');
            return contentAccess().project(type.id,await this.record(tx,type,a.recordId),true);
          }
          case 'list_recycled_records':return listWorkspaceRecords(tx,schemas.list_recycled_records.parse(parsed),userId,true);
          case 'duplicate_record': {
            const a=schemas.duplicate_record.parse(parsed),type=await this.objectType(tx,a.objectTypeId);await contentAccess().require(type.id,a.recordId,'duplicate');await contentAccess().require(type.id,undefined,'create');const source=await this.record(tx,type,a.recordId);if(source.version!==a.version)throw new AppError(409,'Record version conflict');
            const policy=await contentAccess().policy(type.id),fields=await this.fields(tx,type,{});const values:Record<string,FieldValue>={};for(const f of fields)if(f.state==='active'&&isCustomFieldKind(f.kind)&&!['keyword','access_principals'].includes(f.technical_name)&&policy.field(f.id,a.recordId).read&&policy.creationField(f.id))values[f.technical_name]=source[f.technical_name] as FieldValue;
            const classification=Object.fromEntries(['type','status','category'].filter(key=>fields.some(f=>f.technical_name===key&&policy.field(f.id,a.recordId).read&&policy.creationField(f.id))).map(key=>[key,source[key]]));
            return this.createRecord(tx,schemas.create_record.parse({objectTypeId:type.id,values,classification,...(fields.some(f=>f.technical_name==='keyword'&&policy.field(f.id,a.recordId).read)?{keyword:a.keyword??source.keyword}:{})}),userId);
          }
          case 'configure_object_settings': {
            const args=schemas.configure_object_settings.parse(parsed),type=await this.objectType(tx,args.objectTypeId),change=v7();
            if(type.version!==args.version)throw new AppError(409,'Definition version conflict');
            if(args.security){
              if(!access.isAdmin)throw new AppError(403,'Only Administrators manage content permissions');
              const previous=await getContentPermissions(tx,type.id);
              await configureContentPermissions(tx,{...previous,version:args.security.version,sensitive:args.security.sensitive,confirmWidening:args.security.confirmWidening},userId,(key,before,after,field)=>this.journal(tx,userId,type.workspace_id,type.id,'object_permissions',type.id,change,key,before,after,field));
            }
            if(!isDeepStrictEqual(type.labels,args.labels))await this.setLabels(tx,{kind:'object_type',id:type.id,labels:args.labels},userId,change);
            return this.definition(tx,type.id,userId);
          }
          case 'get_content_permissions':return getContentPermissions(tx,(parsed as {objectTypeId:string}).objectTypeId);
          case 'configure_content_permissions': {const args=schemas.configure_content_permissions.parse(parsed),type=await this.objectType(tx,args.objectTypeId),change=v7();return configureContentPermissions(tx,args,userId,(key,before,after,field)=>this.journal(tx,userId,type.workspace_id,type.id,'object_permissions',type.id,change,key,before,after,field));}
          case 'list_access_principals':return contentAccess().eligiblePrincipals((parsed as {objectTypeId:string}).objectTypeId);
          case 'get_relationship_tree_branch': return relationshipTreeBranch(tx,schemas.get_relationship_tree_branch.parse(parsed),userId);
          case 'list_record_link_options':return recordLinkOptions(tx,schemas.list_record_link_options.parse(parsed));
          case 'get_record_relationships': {const args=schemas.get_record_relationships.parse(parsed);return recordRelationships(tx,args.objectTypeId,args.recordId);}
          case 'search_relationship_candidates': return searchRelationshipCandidates(tx,schemas.search_relationship_candidates.parse(parsed));
          case 'activate_relationship_type': return activateRelationship(tx,schemas.activate_relationship_type.parse(parsed),userId);
          case 'get_primary_chain_context': return primaryChainContext(tx,schemas.get_primary_chain_context.parse(parsed),userId);
          case 'configure_form_layout': return this.configureFormLayout(tx, schemas.configure_form_layout.parse(parsed), userId);
          case 'list_workspace_modules': return workspaceModules(tx,schemas.list_workspace_modules.parse(parsed).workspaceId);
          case 'configure_workspace_module': return configureWorkspaceModule(tx,schemas.configure_workspace_module.parse(parsed),configJournal,()=>this.installProjectObjects(tx,(parsed as {workspaceId:string}).workspaceId,userId));
          case 'list_relationship_types': return relationshipTypes(tx, schemas.list_relationship_types.parse(parsed).workspaceId);
          case 'create_relationship_type': return configureRelationship(tx, schemas.create_relationship_type.parse(parsed), configJournal);
          case 'configure_relationship_type': return configureRelationship(tx, schemas.configure_relationship_type.parse(parsed), configJournal);
          case 'get_language_catalog': return languageCatalog;
          case 'get_time_zone_catalog': return installedTimeZones();
          case 'configure_user_localization': {
            const args = schemas.configure_user_localization.parse(parsed);
            const before = (await sql<{ language: Language | null; time_zone: string | null; regional_preferences: PersonalRegionalSettings | null }>`SELECT language, time_zone, regional_preferences FROM sys_users WHERE id = ${userId} FOR UPDATE`.execute(tx)).rows[0];
            if (before.language !== args.expectedLanguage || before.time_zone !== args.expectedTimeZone || (args.regional !== undefined && !isDeepStrictEqual(before.regional_preferences, normalizePersonalRegional(args.expectedRegional)))) throw new AppError(409, 'User localization version conflict');
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
          case 'configure_group': return configureGroup(tx, schemas.configure_group.parse(parsed), configJournal);

          case 'set_group_active': return configureGroup(tx, schemas.set_group_active.parse(parsed), configJournal);
          case 'set_definition_state': return this.setDefinitionState(tx, schemas.set_definition_state.parse(parsed), userId);
          case 'get_definition_journal': { const args = schemas.get_definition_journal.parse(parsed); const type = await this.objectType(tx, args.objectTypeId, true); return enrichJournalContext(tx, (await sql<Record<string, unknown>>`SELECT j.*, a.name AS actor_name, w.name AS workspace_name FROM sys_journal j LEFT JOIN sys_users a ON a.id = j.actor_id LEFT JOIN sys_workspaces w ON w.id = j.workspace_id WHERE j.object_type_id = ${type.id}::uuid AND j.entity_kind NOT IN ('record','relationship') ORDER BY j.created_at, j.id`.execute(tx)).rows, userId, false); }
          case 'get_access_context': return { isAdmin: access.isAdmin };
          case 'list_managed_users': return managedUsers(tx);
          case 'create_user': return createUser(tx, schemas.create_user.parse(parsed), (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
          case 'configure_user': return configureUser(tx, schemas.configure_user.parse(parsed), userId, (kind, id, change, key, before, after) => this.journal(tx, userId, null, null, kind, id, change, key, before, after));
          case 'list_system_journal': {
            const args = schemas.list_system_journal.parse(parsed);
            const filter = sql`${args.workspaceId ? sql`j.workspace_id = ${args.workspaceId}::uuid` : sql`true`} AND position(lower(${args.fieldKey}) in lower(j.field_key)) > 0 AND (${args.entityKind} = '' OR j.entity_kind = ${args.entityKind})`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM sys_journal j WHERE ${filter}`.execute(tx)).rows[0].total;
            const entries = (await sql<Record<string, unknown>>`SELECT j.*, a.name AS actor_name, w.name AS workspace_name, COALESCE(u.name, g.name, CASE WHEN j.entity_kind IN ('workspace', 'workspace_member') THEN w.name END, o.labels->>'en', o.labels->>'de', f.labels->>'en', f.labels->>'de', rt.labels->>'de', rt.labels->>'en') AS entity_name FROM sys_journal j LEFT JOIN sys_users a ON a.id = j.actor_id LEFT JOIN sys_workspaces w ON w.id = j.workspace_id LEFT JOIN sys_users u ON j.entity_kind IN ('user', 'account_security') AND u.id = j.entity_id::text LEFT JOIN sys_groups g ON j.entity_kind = 'group' AND g.id = j.entity_id LEFT JOIN sys_object_types o ON j.entity_kind = 'object_type' AND o.id = j.entity_id LEFT JOIN sys_fields f ON j.entity_kind IN ('field', 'classification_field') AND f.id = j.entity_id LEFT JOIN sys_relationship_types rt ON j.entity_kind = 'relationship_type' AND rt.id = j.entity_id WHERE ${filter} ORDER BY j.created_at DESC, j.id DESC LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { entries: await enrichJournalContext(tx, entries, userId, true), total, limit: args.limit, offset: args.offset };
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
          case 'list_workspaces': return (await sql`SELECT w.id, w.code, w.name, w.default_language, w.available_languages, w.label_languages, w.language_version, w.time_zone, w.regional, w.created_by, u.name AS created_by_name, w.created_at, w.appearance, w.appearance_version, CASE WHEN ${access.isAdmin} THEN 'administrator' ELSE m.role END AS role FROM sys_workspaces w JOIN sys_users u ON u.id = w.created_by LEFT JOIN sys_workspace_members m ON m.workspace_id = w.id AND m.user_id = ${userId} WHERE ${access.isAdmin} OR m.user_id IS NOT NULL ORDER BY w.code`.execute(tx)).rows;
          case 'list_object_types': {
            const args = schemas.list_object_types.parse(parsed);
            const workspace = (await sql<{ default_language: Language; available_languages: Language[] }>`SELECT default_language, available_languages FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
            if (!workspace) throw new AppError(404, 'Workspace not found');
            const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            const types = (await sql<{ id: string; technical_name: string; labels: Labels; state: string; is_protected: boolean }>`SELECT id, technical_name, labels, state, is_protected FROM sys_object_types WHERE workspace_id = ${args.workspaceId}::uuid AND (state = 'active' OR (${args.includeInactive} AND state = 'inactive') OR (${args.includeDeleted} AND state = 'deleted')) ORDER BY technical_name`.execute(tx)).rows;
            return Promise.all(types.map(async type => ({ permissions:(await contentAccess().policy(type.id)).capabilities,id: type.id, state: type.state, isProtected: type.is_protected, technicalName: type.technical_name, labels: type.labels,
              label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, workspace.available_languages, workspace.default_language), workspace.default_language) })));
          }
          case 'search_workspace': return this.searchWorkspace(tx, schemas.search_workspace.parse(parsed), userId);
          case 'get_workspace_dashboard': return workspaceDashboard(tx, schemas.get_workspace_dashboard.parse(parsed), userId);
          case 'list_workspace_records': return listWorkspaceRecords(tx, schemas.list_workspace_records.parse(parsed), userId);
          case 'list_records': {
            const args = schemas.list_records.parse(parsed);
            const type = await this.objectType(tx, args.objectTypeId);
            const sortableFields = (await sql<Field>`SELECT applicability, id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
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
            if (sortedField && ['single_choice', 'multiple_choice'].includes(sortedField.kind)) {
              const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
              const cases = (sortedField.config.options ?? []).map(option => sql`WHEN ${option.id}::uuid THEN ${localizedLabel(option.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language)}`);
              sortExpression = !cases.length ? sql`NULL::text` : sortedField.kind === 'multiple_choice'
                ? sql`(SELECT string_agg(label, ', ' ORDER BY label) FROM (SELECT CASE selection.id ${sql.join(cases, sql` `)} ELSE NULL END AS label FROM unnest(${sql.ref(args.sortBy)}) AS selection(id)) AS names)`
                : sql`CASE ${sql.ref(args.sortBy)} ${sql.join(cases, sql` `)} ELSE NULL END`;
            }
            if (sortedField?.kind === 'reference') sortExpression = sql`(SELECT string_agg(COALESCE(u.name, g.name), ', ' ORDER BY COALESCE(u.name, g.name), ref->>'id') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${sql.ref(args.sortBy)}) = 'array' THEN ${sql.ref(args.sortBy)} ELSE jsonb_build_array(${sql.ref(args.sortBy)}) END) AS ref LEFT JOIN sys_users u ON ref->>'kind' = 'user' AND u.id = ref->>'id' LEFT JOIN sys_groups g ON ref->>'kind' = 'group' AND g.id::text = ref->>'id' AND g.workspace_id = ${type.workspace_id}::uuid)`;
            const searchColumn = sortableFields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? sql`keyword` : sql`id::text`;
            const policy=await contentAccess().require(type.id,undefined);
            if(sortedField&&!policy.fieldReadableEverywhere(sortedField.id))throw new AppError(403,'Cannot sort a restricted field');
            const permittedSearch=await contentAccess().keywordValue(type.id);
            const predicate = sql`${policy.predicate()} AND position(lower(${args.query}) in lower(${permittedSearch})) > 0`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM ${sql.table(tableName(type))} WHERE ${predicate}`.execute(tx)).rows[0].total;
            const records = (await sql`SELECT * FROM ${sql.table(tableName(type))} WHERE ${predicate}
              ORDER BY ${sortExpression} ${direction} NULLS LAST, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { records: await Promise.all(records.map(row => contentAccess().project(type.id,this.outputRecord(row as DataRecord, sortableFields)))), total, limit: args.limit, offset: args.offset };
          }
          case 'create_object_type': return this.createObjectType(tx, schemas.create_object_type.parse(parsed), userId);
          case 'add_standard_field': {
            const args = schemas.add_standard_field.parse(parsed);
            const type = await this.objectType(tx, args.objectTypeId);
            const change = v7();
            await this.addStandardField(tx, type, args.field, userId, change, args.required ?? false);
            if (args.configuration) return this.configureClassification(tx, { objectTypeId: type.id, ...args.configuration }, userId, change);
            return this.definition(tx, type.id, userId);
          }
          case 'create_field': return this.createField(tx, schemas.create_field.parse(parsed), userId);
          case 'get_object_type': return this.definition(tx, schemas.get_object_type.parse(parsed).objectTypeId, userId);
          case 'configure_field': return this.configureField(tx, schemas.configure_field.parse(parsed), userId);

          case 'set_labels': return this.setLabels(tx, schemas.set_labels.parse(parsed), userId);
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

          case 'configure_classification': return this.configureClassification(tx, schemas.configure_classification.parse(parsed), userId);
          case 'create_record': return this.createRecord(tx, schemas.create_record.parse(parsed), userId);
          case 'update_record': return this.updateRecord(tx, schemas.update_record.parse(parsed), userId);
          case 'get_record': {
            const args = schemas.get_record.parse(parsed);
            return contentAccess().project(args.objectTypeId,await this.record(tx, await this.objectType(tx, args.objectTypeId), args.recordId));
          }
          case 'list_record_journal': {
            const args=schemas.list_record_journal.parse(parsed),type=await this.objectType(tx,args.objectTypeId);
            await contentAccess().require(type.id,args.recordId,'read',args.includeRecycled);
            await this.record(tx,type,args.recordId);
            if(args.fieldId&&!(await sql`SELECT 1 FROM sys_fields WHERE id=${args.fieldId}::uuid AND object_type_id=${type.id}::uuid`.execute(tx)).rows.length)throw new AppError(400,'Unknown journal field');
            const where=sql`j.workspace_id=${type.workspace_id}::uuid AND ((j.object_type_id=${type.id}::uuid AND j.entity_kind='record' AND j.entity_id=${args.recordId}::uuid) OR EXISTS(SELECT 1 FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id=j.id AND ep.workspace_id=${type.workspace_id}::uuid AND ep.object_type_id=${type.id}::uuid AND ep.record_id=${args.recordId}::uuid)) AND ${args.fieldId?sql`j.field_id=${args.fieldId}::uuid`:sql`true`} AND ${args.entityKind?sql`j.entity_kind=${args.entityKind}`:sql`true`}`;
            const all=(await sql<import('@xobject/contracts').JournalEntry>`SELECT j.*,a.name AS actor_name FROM sys_journal j LEFT JOIN sys_users a ON a.id=j.actor_id WHERE ${where} ORDER BY j.created_at DESC,j.id DESC`.execute(tx)).rows;
            const visible=await readableRecordJournal(type.id,all,args.includeRecycled);
            return {entries:await journalValueContexts(tx,visible.slice(args.offset,args.offset+args.limit)),total:visible.length,offset:args.offset,limit:args.limit};
          }

        }
      }));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Name already exists');
      throw error;
    }
  }

  private async authorize(tx: Executor, operation: Operation, args: Record<string, unknown>, actor: string) {
    const user = (await sql<{ is_admin: boolean; active: boolean; must_change_password: boolean }>`SELECT is_admin, active, must_change_password FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    if (!user || !user.active) throw new AppError(403, 'Access denied');
    if (user.must_change_password && !['get_account_security', 'change_password'].includes(operation)) throw new AppError(403, 'Password change required');
    if (isAccountSecurityOperation(operation)) return { isAdmin: user.is_admin };
    const recycledRead=operation==='get_recycled_record'||operation==='restore_record'||(operation==='list_record_journal'&&args.includeRecycled===true);
    if(typeof args.objectTypeId==='string'&&typeof args.recordId==='string'&&!recycledRead){
      await contentAccess().require(args.objectTypeId,args.recordId,'read',true);
      const recycled=(await sql`SELECT 1 FROM sys_record_identities WHERE object_type_id=${args.objectTypeId}::uuid AND record_id=${args.recordId}::uuid AND recycled_at IS NOT NULL`.execute(tx)).rows.length;
      if(recycled)throw new AppError(404,'Record is in the recycle bin');
    }
    if(['recycle_record','restore_record','get_recycled_record'].includes(operation)){
      await contentAccess().require(String(args.objectTypeId),String(args.recordId),operation==='recycle_record'?'delete':operation==='restore_record'?'full':'read',recycledRead);return {isAdmin:user.is_admin};
    }
    if(operation==='list_record_journal'&&recycledRead){await contentAccess().require(String(args.objectTypeId),String(args.recordId),'read',true);return {isAdmin:user.is_admin};}
    if (user.is_admin) return { isAdmin: true };
    if (operation==='create_group' && Array.isArray(args.members)&&args.members.length) throw new AppError(403, 'Only Administrators manage group memberships');
    if (['get_time_zone_catalog', 'configure_user_localization', 'get_language_catalog', 'get_access_context', 'list_workspaces',  'set_user_profile'].includes(operation)) return { isAdmin: false };
    if(['get_foreign_access','configure_foreign_access'].includes(operation)){await foreignAccessView(tx,String(args.workspaceId),actor);return {isAdmin:false};}
    if(['get_foreign_access','configure_foreign_access','configure_group_inheritance','get_content_permissions','configure_content_permissions'].includes(operation))throw new AppError(403,'Only Administrators manage content permissions');
    const contentOperations=['duplicate_record','get_record_security','configure_record_security','list_record_link_options','get_primary_chain_context','get_relationship_tree_branch','get_record_relationships','search_relationship_candidates','list_record_journal','get_record','list_records','create_record','update_record','list_access_principals'];
    if(contentOperations.includes(operation)){await contentAccess().require(String(args.objectTypeId),args.recordId as string|undefined,operation==='create_record'||(['get_record_relationships','get_primary_chain_context','search_relationship_candidates'].includes(operation)&&!args.recordId)?'create':operation==='update_record'?'edit':operation==='configure_record_security'?'full':operation==='duplicate_record'?'duplicate':'read');return {isAdmin:false};}
    if(['list_recycled_records','get_workspace_dashboard','list_workspace_records','search_workspace'].includes(operation)){if(!(await sql`SELECT 1 FROM sys_workspace_members WHERE workspace_id=${args.workspaceId}::uuid AND user_id=${actor}`.execute(tx)).rows.length)throw new AppError(403,'Access denied');return {isAdmin:false};}
    // Other instance operations remain Administrator-only.
    if (['get_primary_chain_context', 'get_relationship_tree_branch', 'get_record_relationships', 'search_relationship_candidates', 'list_record_journal', 'get_workspace_dashboard', 'list_workspace_records', 'list_managed_users', 'create_user', 'configure_user', 'list_system_journal',  'set_group_active', 'create_workspace', 'list_users', 'set_workspace_member', 'search_workspace', 'list_records', 'get_record',  'create_record', 'update_record'].includes(operation)) throw new AppError(403, 'Access denied');
    let workspaceId: string | undefined;
    if (typeof args.workspaceId === 'string') workspaceId = args.workspaceId;
    else if (typeof args.objectTypeId === 'string') workspaceId = (await sql<{ workspace_id: string }>`SELECT workspace_id FROM sys_object_types WHERE id = ${args.objectTypeId}::uuid`.execute(tx)).rows[0]?.workspace_id;
    else if (typeof args.fieldId === 'string' || (['set_labels', 'set_definition_state'].includes(operation) && args.kind === 'field')) {
      const fieldId = args.fieldId ?? args.id;
      workspaceId = (await sql<{ workspace_id: string }>`SELECT o.workspace_id FROM sys_fields f JOIN sys_object_types o ON o.id = f.object_type_id WHERE f.id = ${fieldId}::uuid`.execute(tx)).rows[0]?.workspace_id;
    } else if (['set_labels', 'set_definition_state'].includes(operation) && args.kind === 'object_type') workspaceId = (await sql<{ workspace_id: string }>`SELECT workspace_id FROM sys_object_types WHERE id = ${args.id}::uuid`.execute(tx)).rows[0]?.workspace_id;
    if (!workspaceId) throw new AppError(403, 'Access denied');
    const member = (await sql<{ role: string }>`SELECT role FROM sys_workspace_members WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${actor}`.execute(tx)).rows[0];
    if (!member) throw new AppError(403, 'Access denied');
    const reads: Operation[] = ['get_foreign_access_capabilities','list_workspace_modules', 'list_relationship_types', 'list_groups', 'list_object_types', 'get_object_type', 'list_workspace_members', 'list_field_principals', 'get_definition_journal'];
    const configuration: Operation[] = ['configure_object_settings','configure_form_layout', 'configure_workspace_module', 'activate_relationship_type', 'create_relationship_type', 'configure_relationship_type', 'configure_group', 'configure_workspace_languages', 'set_workspace_appearance', 'set_workspace_name',  'create_object_type', 'create_field', 'add_standard_field', 'configure_field',  'set_labels', 'configure_classification', 'create_group', 'set_definition_state'];
    if (!reads.includes(operation) && !(member.role === 'designer' && configuration.includes(operation))) throw new AppError(403, 'Access denied');
    return { isAdmin: false };
  }

  private async setWorkspaceMember(tx: Executor, args: z.infer<typeof schemas.set_workspace_member>, actor: string) {
    if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
    const target = (await sql<{ is_admin: boolean }>`SELECT is_admin FROM sys_users WHERE id = ${args.userId}`.execute(tx)).rows[0];
    if (!target) throw new AppError(404, 'User not found');
    if (target.is_admin) throw new AppError(400, 'Administrator membership is implicit');
    const previous = (await sql<{ role: 'user' | 'designer' }>`SELECT role FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid AND user_id = ${args.userId}`.execute(tx)).rows[0]?.role ?? null;
    if (previous !== args.expectedRole) throw new AppError(409, 'Membership version conflict');
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

  private requireActive(type: ObjectType) {
    if (type.state !== 'active') throw new AppError(400, 'Object type is inactive');
  }

  private sameFieldGroup(left: Field, right: Field) {
    return left.id === right.id || (['type', 'status'].includes(left.technical_name) && ['type', 'status'].includes(right.technical_name));
  }

  private effectiveClassification<T extends { type: ClassificationConfig['type']; status: ClassificationConfig['status']; category: ClassificationConfig['category']; options: ClassificationConfig['options'] }>(config: T, fields: Pick<Field, 'technical_name' | 'state'>[]): T {
    const active = (kind: string) => fields.some(field => field.technical_name === kind && field.state === 'active');
    return { ...config, type: active('type') ? config.type : { required: false, defaultId: null }, status: active('status') ? config.status : { required: false, defaults: [] }, category: active('category') ? config.category : { required: false, multiple: true, defaultIds: [] } };
  }

  private async objectUsed(tx: Executor, type: ObjectType) {
    if ((await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length) return true;
    return Boolean((await sql`SELECT 1 FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' LIMIT 1`.execute(tx)).rows.length);
  }

  private async fieldGroupUsed(tx: Executor, type: ObjectType, fields: Field[]) {
    if (!fields.length) return false;
    const names = fields.map(field => field.technical_name);
    const rows = (await sql<Record<string, unknown>>`SELECT ${sql.join(names.map(name => sql.ref(name)))} FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    if (rows.some(row => Object.values(row).some(value => !isEmptyFieldValue(value)))) return true;
    const history = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' AND field_id = ANY(${fields.map(field => field.id)}::uuid[])`.execute(tx)).rows;
    return history.some(entry => !isEmptyFieldValue(entry.old_value) || !isEmptyFieldValue(entry.new_value));
  }

  private async validateActiveFields(tx: Executor, type: ObjectType, fields: Field[]) {
    const rows = (await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    for (const raw of rows) {
      const record = this.outputRecord(raw, fields);
      for (const field of fields.filter(field => field.state === 'active' && isCustomFieldKind(field.kind))) {
        const applicable=applies(field,fields,record);
        if(!applicable&&!isEmptyFieldValue(record[field.technical_name]))throw new AppError(400,`Field not applicable: ${field.technical_name}`);
        const value = normalizeFieldValue({...field,required:field.required&&applicable}, record[field.technical_name], record[field.technical_name]);
        await validateReferences(tx, field, value, type.workspace_id, record[field.technical_name]);
      }
      const choices: Choices = { type: (record.type??null) as string|null, status: (record.status??null) as string|null, category: (record.category??[]) as string[] };
      validateChoices(this.effectiveClassification(type.classification, fields), choices, choices);
    }
  }

  private async setDefinitionState(tx: Executor, args: z.infer<typeof schemas.set_definition_state>, actor: string) {
    const field = args.kind === 'field' ? (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid AND state <> 'deleted'`.execute(tx)).rows[0] : undefined;
    if (args.kind === 'field' && !field) throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field?.object_type_id ?? args.id);
    const all = (await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' ORDER BY id`.execute(tx)).rows;
    if(!field&&args.state!=='active'&&(await sql`SELECT 1 FROM sys_module_object_bindings WHERE object_type_id=${type.id}::uuid LIMIT 1`.execute(tx)).rows.length)throw new AppError(409,'Object type is used by the Primary chain');
    if(field&&args.state!=='active'&&(await applicabilityDependents(tx,field.id)).length)throw new AppError(409,'Field is an applicability controller');
    const affected = field ? all.filter(item => this.sameFieldGroup(field, item)) : all;
    const previous = field?.state ?? type.state;
    if (previous !== args.expectedState || (field && affected.some(item => item.state !== args.expectedState))) throw new AppError(409, 'Definition state conflict');
    if ((field && affected.some(item => item.is_protected&&item.technical_name!=='access_principals')) || (!field && (type.is_protected || affected.some(item => item.is_protected&&item.technical_name!=='access_principals')))) throw new AppError(403, 'Module definition is protected');
    if (field) this.requireActive(type);
    if (args.state === previous) return { id: args.id, state: previous };
    if (args.state === 'deleted') {
      if (!field && (await sql`SELECT 1 FROM sys_relationship_type_pairs WHERE left_object_type_id=${type.id}::uuid OR right_object_type_id=${type.id}::uuid LIMIT 1`.execute(tx)).rows.length) throw new AppError(409, 'Definition has database dependencies');
      if (!args.confirm) throw new AppError(400, 'Definition deletion requires confirmation');
      if (field ? await this.fieldGroupUsed(tx, type, affected) : await this.objectUsed(tx, type)) throw new AppError(400, 'Definition was used; deactivate instead');
    }
    if (args.state === 'active') await this.validateActiveFields(tx, type, field ? all.map(item => affected.some(target => target.id === item.id) ? { ...item, state: 'active' } : item) : all);
    const change = v7();
    if (field && args.state === 'deleted' && affected.some(item => ['type', 'status', 'category'].includes(item.technical_name))) {
      const names = new Set(affected.map(item => item.technical_name));
      const { version, ...config } = type.classification;
      const removed = config.options.filter(option => names.has(option.kind));
      const next = { ...config, options: config.options.filter(option => !names.has(option.kind)),
        type: names.has('type') ? { required: false, defaultId: null } : config.type,
        status: names.has('status') ? { required: false, defaults: [] } : config.status,
        category: names.has('category') ? { required: false, multiple: false, defaultIds: [] } : config.category };
      await this.configureClassification(tx, { objectTypeId: type.id, version, config: next }, actor, change, new Set(removed.map(option => option.id)));
    }
    try {
      if (args.state === 'deleted') {
        if (field) for (const item of affected) await sql`ALTER TABLE ${sql.table(tableName(type))} DROP COLUMN ${sql.ref(item.technical_name)} RESTRICT`.execute(tx);
        else await sql`DROP TABLE ${sql.table(tableName(type))} RESTRICT`.execute(tx);
      }
    } catch (error) { if ((error as { code?: string }).code === '2BP01') throw new AppError(409, 'Definition has database dependencies'); throw error; }
    if (!field) {
      await sql`UPDATE sys_object_types SET state = ${args.state}, version = version + 1 WHERE id = ${type.id}::uuid`.execute(tx);
      await this.journal(tx, actor, type.workspace_id, type.id, 'object_type', type.id, change, 'state', previous, args.state);
    }
    for (const item of affected) if (field || args.state === 'deleted') {
      if (args.state === 'deleted') await this.journal(tx, actor, type.workspace_id, type.id, 'field', item.id, change, 'definition', item, null, item.id);
      await sql`UPDATE sys_fields SET state = ${args.state}, version = version + 1, required = ${args.state === 'deleted' && ['type', 'status', 'category'].includes(item.technical_name) ? type.classification[item.technical_name as 'type' | 'status' | 'category'].required : item.required} WHERE id = ${item.id}::uuid`.execute(tx);
      await this.journal(tx, actor, type.workspace_id, type.id, 'field', item.id, change, 'state', item.state, args.state, item.id);
    }
    return { id: args.id, state: args.state };
  }

  private async searchWorkspace(tx: Executor, args: z.infer<typeof schemas.search_workspace>, userId: string) {
    const workspace = (await sql<{ code: string; default_language: Language; available_languages: Language[] }>`SELECT code, default_language, available_languages FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!workspace) throw new AppError(404, 'Workspace not found');
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
    const types = (await sql<{ id: string; technical_name: string; labels: Labels; has_keyword: boolean }>`SELECT o.id, o.technical_name, o.labels, EXISTS (SELECT 1 FROM sys_fields f WHERE f.object_type_id = o.id AND f.technical_name = 'keyword' AND f.state = 'active') AS has_keyword FROM sys_object_types o WHERE workspace_id = ${args.workspaceId}::uuid AND o.state = 'active' ORDER BY technical_name`.execute(tx)).rows;
    const visibleTypes=[];for(const type of types)if((await contentAccess().policy(type.id)).capabilities.read)visibleTypes.push(type);
    const summaries = visibleTypes.map(type => ({ id: type.id, technicalName: type.technical_name, labels: type.labels, label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, workspace.available_languages, workspace.default_language), workspace.default_language) }));
    const needle = args.query.toLowerCase();
    const matches = summaries.filter(type => type.label.toLowerCase().includes(needle) || type.technicalName.includes(needle));
    // Search only this workspace's metadata-derived tables; user text is always a SQL value.
    const queries=[];
    for(const type of visibleTypes){const policy=await contentAccess().policy(type.id),hasKeyword=type.has_keyword&&await contentAccess().canField(type.id,'keyword'),keyword=await contentAccess().keywordValue(type.id);
      queries.push(sql`(SELECT id,${keyword} AS keyword,updated_at,${type.id}::uuid AS object_type_id FROM ${sql.table(`${workspace.code}_${type.technical_name}`)} WHERE ${policy.predicate()} AND position(lower(${args.query}) in lower(${keyword}))>0 ORDER BY updated_at DESC,id LIMIT ${args.limit+1})`);
    }
    const rows = queries.length ? (await sql<{ id: string; keyword: string; object_type_id: string }>`SELECT * FROM (${sql.join(queries, sql` UNION ALL `)}) AS matches
      ORDER BY updated_at DESC, id LIMIT ${args.limit + 1}`.execute(tx)).rows : [];
    const labels = new Map(summaries.map(type => [type.id, type.label]));
    return { objectTypes: matches.slice(0, args.limit),
      records: rows.slice(0, args.limit).map(row => ({ id: row.id, keyword: row.keyword, objectTypeId: row.object_type_id, objectLabel: labels.get(row.object_type_id)! })),
      hasMoreObjects: matches.length > args.limit, hasMoreRecords: rows.length > args.limit };
  }

  private async configureFormLayout(tx:Executor,args:z.infer<typeof schemas.configure_form_layout>,actor:string){
    const type=await this.objectType(tx,args.objectTypeId);this.requireActive(type);
    if(type.version!==args.version)throw new AppError(409,'Object version conflict');
    if(args.layout){
      const own=(await sql<{id:string;technical_name:string;kind:string}>`SELECT id,technical_name,kind FROM sys_fields WHERE object_type_id=${type.id}::uuid`.execute(tx)).rows.map(field=>({...field,technicalName:field.technical_name}));
      const relationships=formRelationshipFields(await relationshipTypes(tx,type.workspace_id),type.id,await primaryChain(tx,type.workspace_id));
      const elements=formLayoutElements(own,relationships);
      for(const entry of formLayoutEntries(args.layout)){
        const element=elements.find(element=>element.key===formEntryKey(entry));
        if(!element){
          const previous=(type.form_layouts?.[args.context]?formLayoutEntries(type.form_layouts[args.context]):[]).find(old=>formEntryKey(old)===formEntryKey(entry));
          if(previous&&isDeepStrictEqual(previous,entry))continue;
          throw new AppError(400,'Layout elements must belong to this object and use available relationship sides');
        }
        if(!element.single&&entry.width!=='full')throw new AppError(400,'Relationship tables and Primary chain require full width');
        if(!('fieldId' in entry)&&element.required&&entry.visible===false)throw new AppError(400,'Required relationships must remain visible');
      }
      const languages=(await sql<{label_languages:string[]}>`SELECT label_languages FROM sys_workspaces WHERE id=${type.workspace_id}::uuid`.execute(tx)).rows[0].label_languages;
      const old=type.form_layouts?.[args.context]??type.form_layouts?.default;
      for(const group of args.layout.groups){
        const proposed:Record<string,string|undefined>=group.labels;
        const previous:Record<string,string|undefined>=old?.groups.find(item=>item.id===group.id)?.labels??(!old?{en:'General',de:'Allgemein'}:{});
        for(const code of new Set([...Object.keys(group.labels),...Object.keys(previous)]))if(!languages.includes(code)&&proposed[code]!==previous[code])throw new AppError(400,'Definition language is unavailable');
      }
    }
    const before=type.form_layouts?.[args.context]??null,next={...type.form_layouts};
    if(args.layout)next[args.context]=args.layout;else delete next[args.context];
    if(!isDeepStrictEqual(before,args.layout)){
      await sql`UPDATE sys_object_types SET form_layouts=${JSON.stringify(next)}::jsonb,version=version+1 WHERE id=${type.id}::uuid`.execute(tx);
      await this.journal(tx,actor,type.workspace_id,type.id,'object_type',type.id,v7(),`form_layout.${args.context}`,before,args.layout);
    }
    return this.definition(tx,type.id,actor);
  }

  private async objectType(tx: Executor, id: string, includeDeleted = false) {
    const result = await sql<ObjectType>`SELECT o.*, w.code, w.default_language, w.available_languages FROM sys_object_types o
      JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ${id}::uuid`.execute(tx);
    if (!result.rows[0] || (!includeDeleted && result.rows[0].state === 'deleted')) throw new AppError(404, 'Object type not found');
    return result.rows[0];
  }

  private async record(tx: Executor, type: ObjectType, id: string) {
    const result = await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))} WHERE id = ${id}::uuid`.execute(tx);
    if (!result.rows[0]) throw new AppError(404, 'Record not found');
    const fields = (await sql<Field>`SELECT applicability, id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    return this.outputRecord(result.rows[0], fields);
  }

  private outputRecord(record: DataRecord, fields: Field[]): DataRecord {
    for (const [key, value] of Object.entries(record)) if (value instanceof Date) record[key] = value.toISOString();
    for (const field of fields.filter(field => isCustomFieldKind(field.kind)&&field.technical_name!=='access_principals')) record[field.technical_name] = normalizeFieldValue({ ...field, required: false }, record[field.technical_name], record[field.technical_name]);
    return record;
  }

  private async journal(tx: Executor, actor: string, workspace: string | null, type: string | null,
    entityKind: string, entityId: string, changeId: string, key: string, oldValue: unknown, newValue: unknown, fieldId: string | null = null) {
    await sql`INSERT INTO sys_journal
      (id, change_id, workspace_id, object_type_id, entity_kind, entity_id, field_id, field_key, old_value, new_value, actor_id)
      VALUES (${v7()}::uuid, ${changeId}::uuid, ${workspace}::uuid, ${type}::uuid, ${entityKind},
      ${entityId}::uuid, ${fieldId}::uuid, ${key}, ${JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(newValue)}::jsonb, ${actor})`.execute(tx);
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

  private async installProjectObjects(tx:Executor,workspaceId:string,actor:string) {
    const catalog=(await sql<{objects:{key:string;technicalName:string;labels:Record<string,string>;standardFields:('keyword'|'type_status'|'category')[]}[]}>`SELECT objects FROM sys_modules WHERE key='projects'`.execute(tx)).rows[0];
    const levels:Record<string,string>={};
    for(const proposal of catalog.objects){
      let binding=(await sql<{object_type_id:string}>`SELECT object_type_id FROM sys_module_object_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key=${proposal.key}`.execute(tx)).rows[0];
      if(!binding){
        if((await sql`SELECT 1 FROM sys_object_types WHERE workspace_id=${workspaceId}::uuid AND technical_name=${proposal.technicalName} AND state<>'deleted'`.execute(tx)).rows.length)throw new AppError(409,'Module object name conflicts with an existing custom object');
        const created=await this.createObjectType(tx,{workspaceId,technicalName:proposal.technicalName,labels:proposal.labels,standardFields:proposal.standardFields},actor,true);
        binding={object_type_id:created.id};
        await sql`INSERT INTO sys_module_object_bindings VALUES(${workspaceId}::uuid,${proposal.key},${created.id}::uuid)`.execute(tx);
        await sql`UPDATE sys_object_types SET is_protected=true WHERE id=${created.id}::uuid`.execute(tx);
        await sql`UPDATE sys_fields SET is_protected=true WHERE object_type_id=${created.id}::uuid`.execute(tx);
        const change=v7();
        await this.journal(tx,actor,workspaceId,created.id,'object_type',created.id,change,'module_binding',null,proposal.key);
        await this.journal(tx,actor,workspaceId,created.id,'object_type',created.id,change,'is_protected',false,true);
        const suppliedFields=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${created.id}::uuid`.execute(tx)).rows;
        for(const field of suppliedFields)await this.journal(tx,actor,workspaceId,created.id,'field',field.id,change,'is_protected',false,true,field.id);
      }
      const type=await this.objectType(tx,binding.object_type_id);this.requireActive(type);
      levels[proposal.key]=binding.object_type_id;
    }
    return {contact:levels.contact,project:levels.project,case:levels.case};
  }

  private async createObjectType(tx: Executor, args: z.infer<typeof schemas.create_object_type>, actor: string, supplied = false) {
    await checkName(tx, args.technicalName);
    if(!supplied&&(await sql`SELECT 1 FROM sys_modules m CROSS JOIN LATERAL jsonb_array_elements(m.objects) o WHERE o->>'technicalName'=${args.technicalName} LIMIT 1`.execute(tx)).rows.length)throw new AppError(400,'Technical name is reserved for a module object');
    const ws = (await sql<{ code: string }>`SELECT code FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!ws) throw new AppError(404, 'Workspace not found');
    const name = `${ws.code}_${args.technicalName}`;
    if (name.length > 63) throw new AppError(400, 'Complete table name exceeds 63 bytes');
    const id = v7();
    await sql`INSERT INTO sys_object_types (id, workspace_id, technical_name, labels)
      VALUES (${id}::uuid, ${args.workspaceId}::uuid, ${args.technicalName}, ${JSON.stringify(args.labels)}::jsonb)`.execute(tx);
    await tx.schema.createTable(name)
      .addColumn('id', 'uuid', c => c.primaryKey())
      .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
      .addColumn('created_by', 'text', c => c.notNull().references('sys_users.id'))
      .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
      .addColumn('updated_by', 'text', c => c.notNull().references('sys_users.id'))
      .addColumn('version', 'integer', c => c.notNull().defaultTo(1))
      .execute();
    await installObjectIntegrity(tx, { id, workspace_id: args.workspaceId, table_name: name });
    const change = v7();
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'technical_name', null, args.technicalName);
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'labels', null, args.labels);
    const type = await this.objectType(tx, id);
    for (const field of args.standardFields) await this.addStandardField(tx, type, field, actor, change);

    const initialFields=(await sql<{id:string;technical_name:string;kind:string}>`SELECT id,technical_name,kind FROM sys_fields WHERE object_type_id=${id}::uuid AND state<>'deleted' ORDER BY id`.execute(tx)).rows.map(field=>({...field,technicalName:field.technical_name}));
    const form=resolveFormLayout(undefined,initialFields);form.groups[0].id=v7();
    await sql`UPDATE sys_object_types SET form_layouts=${JSON.stringify({default:form})}::jsonb WHERE id=${id}::uuid`.execute(tx);
    return { id, ...args, tableName: name };
  }

  private async addStandardField(tx: Executor, type: ObjectType, kind: 'type_status' | 'category' | 'keyword', actor: string, change = v7(), keywordRequired = false) {
    this.requireActive(type);
    const names = kind === 'type_status' ? ['type', 'status'] : [kind];
    if ((await sql`SELECT 1 FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows.length) throw new AppError(409, 'Standard field already exists');
    if (kind === 'keyword') {
      if (keywordRequired && (await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Existing records have empty required fields');
      const labels = { de: 'Stichwort', en: 'Keyword' };
      await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN keyword text NOT NULL DEFAULT ''`.execute(tx);
      await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required) VALUES (${v7()}::uuid, ${type.id}::uuid, 'keyword', ${JSON.stringify(labels)}::jsonb, 'text', ${keywordRequired})`.execute(tx);
    } else await addClassificationFields(tx, type.id, tableName(type), names);
    const fields = (await sql<Field>`SELECT id, technical_name, labels, kind, required FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows;
    for (const field of fields) for (const [key, value] of Object.entries({ technical_name: field.technical_name, labels: field.labels, kind: field.kind, required: field.required })) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, null, value, field.id);
  }

  private async createField(tx: Executor, args: z.infer<typeof schemas.create_field>, actor: string) {
    await checkName(tx, args.technicalName);
    if (isReservedStandardFieldName(args.technicalName) || hasReservedStandardFieldLabel(args.labels)) throw new AppError(400, 'Reserved standard field name');
    const type = await this.objectType(tx, args.objectTypeId);
    this.requireActive(type);
    await validateApplicability(tx,type.id,'new',args.applicability);
    if(args.required){
      const existing=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
      const fields=(await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id=${type.id}::uuid AND state<>'deleted'`.execute(tx)).rows;
      if(existing.some(row=>applies({id:'new',technical_name:args.technicalName,applicability:args.applicability},fields,row)))throw new AppError(400,'Existing records have empty required fields');
    }
    const config = fieldConfig(args.kind, args.config);
    if (args.required && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    const id = v7();
    await this.checkOptionIdentities(tx, id, config);
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required, config, applicability)
      VALUES (${id}::uuid, ${type.id}::uuid, ${args.technicalName}, ${JSON.stringify(args.labels)}::jsonb, ${args.kind}, ${args.required}, ${JSON.stringify(config)}::jsonb, ${JSON.stringify(args.applicability??null)}::jsonb)`.execute(tx);
    await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN ${sql.ref(args.technicalName)} ${fieldStorage(args.kind, config)}`.execute(tx);
    const change = v7();
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'technical_name', null, args.technicalName, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'labels', null, args.labels, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'kind', null, args.kind, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'config', null, config, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'required', null, args.required, id);
    if(args.applicability)await this.journal(tx,actor,type.workspace_id,type.id,'field',id,change,'applicability',null,args.applicability,id);
    return { id, ...args, config };
  }

  private async usedClassificationIds(tx: Executor, type: ObjectType, fields: Pick<Field, 'technical_name'>[]) {
    const has = (name: string) => fields.some(field => field.technical_name === name);
    const values = (await sql<{ type: string | null; status: string | null }>`SELECT DISTINCT ${has('type') ? sql`type` : sql`NULL::uuid`} AS type, ${has('status') ? sql`status` : sql`NULL::uuid`} AS status FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    const history = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT DISTINCT old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' AND field_key IN ('type', 'status')`.execute(tx)).rows;
    return new Set([...values.flatMap(row => [row.type, row.status]), ...history.flatMap(row => [row.old_value, row.new_value])].filter((value): value is string => typeof value === 'string'));
  }

  private async definition(tx: Executor, id: string, actor: string) {
    const type = await this.objectType(tx, id, true);
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    const fields = (await sql<Field>`SELECT applicability, version, id, technical_name, labels, kind, required, config, state, is_protected FROM sys_fields
      WHERE object_type_id = ${id}::uuid ORDER BY id`.execute(tx)).rows;
    const columns = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${tableName(type)} AND ${type.state !== 'deleted'} ORDER BY ordinal_position`.execute(tx)).rows;
    const used = type.state !== 'deleted' && type.classification.options.some(option => option.kind !== 'category') ? await this.usedClassificationIds(tx, type, fields) : new Set<string>();
    return {
      permissionsVersion:type.permissions_version,sensitive:(await contentAccess().policy(type.id)).sensitive,permissions:(await contentAccess().policy(type.id)).capabilities,formRelationships:formRelationshipFields(await relationshipTypes(tx,type.workspace_id),type.id,await primaryChain(tx,type.workspace_id)), formLayouts:type.form_layouts??{}, version: type.version, id: type.id, state: type.state, isProtected: type.is_protected || fields.some(field => field.state !== 'deleted' && field.is_protected&&field.technical_name!=='access_principals'), canDelete: type.state !== 'deleted' && !type.is_protected && !fields.some(field => field.state !== 'deleted' && field.is_protected&&field.technical_name!=='access_principals') && !(await this.objectUsed(tx, type)) && !(await sql`SELECT 1 FROM sys_relationship_type_pairs WHERE left_object_type_id=${type.id}::uuid OR right_object_type_id=${type.id}::uuid LIMIT 1`.execute(tx)).rows.length, workspaceId: type.workspace_id, technicalName: type.technical_name,
      classification: { ...type.classification, options: type.classification.options.map(option => ({ ...option, label: localizedLabel(option.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language), canDelete: option.kind !== 'category' && !used.has(option.id) })) },
      labels: type.labels, label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language),
      fields: await Promise.all(fields.filter(f => f.state !== 'deleted'&&(f.technical_name!=='access_principals'||(type as ObjectType & {is_sensitive:boolean}).is_sensitive)).map(async f => ({ fieldPermissions:f.technical_name==='access_principals'?{read:(await contentAccess().policy(type.id)).capabilities.read,edit:(await contentAccess().policy(type.id)).capabilities.full}:{...(await contentAccess().policy(type.id)).field(f.id),create:(await contentAccess().policy(type.id)).creationField(f.id)},applicability: f.applicability??null, version: f.version, id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, isProtected: f.is_protected || fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected),
        canDelete: !fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected) && !(await this.fieldGroupUsed(tx, type, fields.filter(item => item.state !== 'deleted' && this.sameFieldGroup(f, item)))),
        required: isCustomFieldKind(f.kind) ? f.required : type.classification[f.kind as 'type' | 'status' | 'category'].required, labels: f.labels, label: localizedLabel(f.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language) }))),
      historicalFields: fields.filter(f => f.state === 'deleted').map(f => ({ applicability: f.applicability??null, version: f.version, id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, required: f.required, labels: f.labels, label: localizedLabel(f.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language) })),
      columns: columns.map(c => c.column_name),
    };
  }

  private async setFieldRequired(tx: Executor, args: Omit<{fieldId:string;version:number;required:boolean}, 'version'>, actor: string, changeId?: string): Promise<unknown> {
    const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.fieldId}::uuid`.execute(tx)).rows[0];
    if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field.object_type_id);
    this.requireActive(type);
    if (!isCustomFieldKind(field.kind)) {
      const kind = field.kind as 'type' | 'status' | 'category';
      const { version, ...config } = type.classification;
      return this.configureClassification(tx, { objectTypeId: type.id, version, config: { ...config, [kind]: { ...config[kind], required: args.required } } }, actor, changeId);
    }
    return this.configureField(tx, { fieldId: field.id, required: args.required }, actor, changeId);
  }

  private async setLabels(tx: Executor, args: Omit<z.infer<typeof schemas.set_labels>, 'version'>, actor: string, changeId?: string) {
    let type: ObjectType;
    let previous: Labels;
    if (args.kind === 'object_type') {
      type = await this.objectType(tx, args.id);
      this.requireActive(type);
      previous = type.labels;
    } else {
      const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid`.execute(tx)).rows[0];
      if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
      if (field.is_protected && !isDeepStrictEqual(field.labels,args.labels)) throw new AppError(403, 'Module definition is protected');
      if (['keyword', 'type', 'status', 'category'].includes(field.technical_name)) throw new AppError(400, 'Shared field labels are fixed');
      if (hasReservedStandardFieldLabel(args.labels)) throw new AppError(400, 'Reserved standard field name');
      type = await this.objectType(tx, field.object_type_id);
      this.requireActive(type);
      previous = field.labels;
    }
    if (args.kind === 'object_type' && type.is_protected && !isDeepStrictEqual(previous, args.labels)) throw new AppError(403, 'Module definition is protected');
    // Compare jsonb values semantically; key order must not create false change events.
    const result = await sql`UPDATE ${sql.table(args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields')}
      SET labels = ${JSON.stringify(args.labels)}::jsonb, version = version + 1
      WHERE id = ${args.id}::uuid AND labels IS DISTINCT FROM ${JSON.stringify(args.labels)}::jsonb RETURNING id`.execute(tx);
    if (result.rows.length) {
      await this.journal(tx, actor, type.workspace_id, type.id, args.kind, args.id, changeId ?? v7(), 'labels', previous, args.labels,
        args.kind === 'field' ? args.id : null);
    }
    return { id: args.id, kind: args.kind, labels: args.labels, version: (await sql<{version:number}>`SELECT version FROM ${sql.table(args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields')} WHERE id=${args.id}::uuid`.execute(tx)).rows[0].version };
  }

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
    if (previous.appearance_version !== args.version) throw new AppError(409, 'Workspace appearance version conflict');
    const changed = (Object.keys(args.appearance) as (keyof WorkspaceAppearance)[]).filter(key => !isDeepStrictEqual(previous.appearance[key], args.appearance[key]));
    const version = previous.appearance_version + (changed.length ? 1 : 0);
    if (changed.length) {
      await sql`UPDATE sys_workspaces SET appearance = ${JSON.stringify(args.appearance)}::jsonb, appearance_version = ${version} WHERE id = ${args.workspaceId}::uuid`.execute(tx);
      const change = v7();
      for (const key of changed) await this.journal(tx, actor, args.workspaceId, null, 'workspace', args.workspaceId, change, `appearance.${key}`, previous.appearance[key], args.appearance[key]);
    }
    return { workspaceId: args.workspaceId, appearance: args.appearance, version };
  }

  private async configureClassification(tx: Executor, args: z.infer<typeof schemas.configure_classification>, actor: string, changeId?: string, removable = new Set<string>()) {
    const type = await this.objectType(tx, args.objectTypeId);
    this.requireActive(type);
    if (type.classification.version !== args.version) throw new AppError(409, 'Classification version conflict');
    args.config.category.defaultIds.sort();
    args.config.status.defaults.sort((left, right) => (left.typeId ?? '').localeCompare(right.typeId ?? ''));
    const available = (await sql<Field>`SELECT applicability, id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    for (const kind of ['type', 'status', 'category'] as const) if (!available.some(field => field.technical_name === kind) && (!isDeepStrictEqual(args.config[kind], type.classification[kind]) || args.config.options.some(option => option.kind === kind))) throw new AppError(400, 'Standard field is not installed');
    const removed = type.classification.options.filter(old => !args.config.options.some(option => option.id === old.id));
    if (removed.length) {
      const used = await this.usedClassificationIds(tx, type, available);
      if (removed.some(option => used.has(option.id))) throw new AppError(400, 'Classification option is in use');
    }
    validateRules(args.config, type.classification, removable);
    const newIds = args.config.options.filter(option => !type.classification.options.some(old => old.id === option.id)).map(option => option.id);
    if (newIds.length && (await sql`SELECT 1 FROM sys_object_types, jsonb_array_elements(classification->'options') AS existing
      WHERE sys_object_types.id <> ${type.id}::uuid AND existing->>'id' = ANY(${newIds}::text[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity already belongs to another object type');
    if (newIds.length && (await sql`SELECT 1 FROM sys_journal WHERE entity_kind = 'classification_option' AND entity_id = ANY(${newIds}::uuid[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity was already used');
    const records = (await sql<Choices>`SELECT ${available.some(field => field.technical_name === 'type') ? sql`type` : sql`NULL::uuid`} AS type, ${available.some(field => field.technical_name === 'status') ? sql`status` : sql`NULL::uuid`} AS status, ${available.some(field => field.technical_name === 'category') ? sql`category` : sql`'{}'::uuid[]`} AS category FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    for (const record of records) validateChoices(this.effectiveClassification(args.config, available), record, record);
    const { version, ...previous } = type.classification;
    if (!isDeepStrictEqual(previous, args.config)) {
      const config = { ...args.config, version: version + 1 };
      await sql`UPDATE sys_object_types SET classification = ${JSON.stringify(config)}::jsonb WHERE id = ${type.id}::uuid`.execute(tx);
      const fields = (await sql<Field>`SELECT id, technical_name FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
      const change = changeId ?? v7();
      for (const kind of ['type', 'status', 'category'] as const) {
        const field = fields.find(field => field.technical_name === kind);
        if (!field) continue;
        if (!isDeepStrictEqual(previous[kind],args.config[kind]) || !isDeepStrictEqual(previous.options.filter(o=>o.kind===kind),args.config.options.filter(o=>o.kind===kind))) await sql`UPDATE sys_fields SET version=version+1 WHERE id=${field.id}::uuid`.execute(tx);
        const oldOrder = previous.options.filter(option => option.kind === kind).map(option => option.id);
        const newOrder = args.config.options.filter(option => option.kind === kind).map(option => option.id);
        if (!isDeepStrictEqual(oldOrder, newOrder)) await this.journal(tx, actor, type.workspace_id, type.id, 'classification_field', field.id, change, 'option_order', oldOrder, newOrder, field.id);
        for (const key of Object.keys(args.config[kind])) {
          const oldValue = (previous[kind] as Record<string, unknown>)[key];
          const newValue = (args.config[kind] as Record<string, unknown>)[key];
          if (!isDeepStrictEqual(oldValue, newValue)) await this.journal(tx, actor, type.workspace_id, type.id, 'classification_field', field.id, change, key, oldValue, newValue, field.id);
        }
      }
      for (const option of removed) await this.journal(tx, actor, type.workspace_id, type.id, 'classification_option', option.id, change, 'deleted', option, null, fields.find(field => field.technical_name === option.kind)!.id);
      for (const option of args.config.options) {
        const old = previous.options.find(item => item.id === option.id);
        const fieldId = fields.find(field => field.technical_name === option.kind)!.id;
        for (const key of ['kind', 'labels', 'active', 'typeId'] as const) {
          if (!isDeepStrictEqual(old?.[key], option[key])) await this.journal(tx, actor, type.workspace_id, type.id, 'classification_option', option.id, change, key, old?.[key] ?? null, option[key], fieldId);
        }
      }
    }
    return this.definition(tx, type.id, actor);
  }

  private async checkOptionIdentities(tx: Executor, fieldId: string, config: FieldConfig) {
    const ids = config.options?.map(option => option.id) ?? [];
    if (ids.length && (await sql`SELECT 1 FROM sys_fields, jsonb_array_elements(COALESCE(config->'options', '[]'::jsonb)) AS option WHERE sys_fields.id <> ${fieldId}::uuid AND option->>'id' = ANY(${ids}::text[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity belongs to another field');
  }

  private async normalizeRecordFields(tx: Executor, type: ObjectType, fields: Field[], data: Record<string, FieldValue>, previous?: DataRecord) {
    for (const field of fields.filter(field => field.state === 'active' && isCustomFieldKind(field.kind))) {
      const supplied = Object.hasOwn(data, field.technical_name);
      const input=supplied?data[field.technical_name]:previous?.[field.technical_name];
      const applicable=applies(field,fields,{...previous,...data});
      if(!applicable&&!isEmptyFieldValue(input))throw new AppError(400,`Field not applicable: ${field.technical_name}`);
      const value = normalizeFieldValue({...field,required:field.required&&applicable}, input, previous?.[field.technical_name]);
      await validateReferences(tx, field, value, type.workspace_id, previous?.[field.technical_name]);
      if (supplied) data[field.technical_name] = value;
    }
  }

  private async configureField(tx: Executor, args: Omit<z.infer<typeof schemas.configure_field>, 'version'>, actor: string, suppliedChangeId?: string): Promise<unknown> {
    const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.fieldId}::uuid`.execute(tx)).rows[0];
    if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field.object_type_id);
    this.requireActive(type);
    const change = suppliedChangeId ?? v7();
    if(args.applicability!==undefined&&['keyword','type','status','category'].includes(field.technical_name))throw new AppError(400,'Standard fields cannot have applicability rules');
    if (['keyword', 'type', 'status', 'category'].includes(field.technical_name)) {
      if ((args.kind && args.kind !== field.kind) || args.config) throw new AppError(400, 'Shared field type is fixed');
      if (args.labels) await this.setLabels(tx, { kind: 'field', id: field.id, labels: args.labels }, actor, change);
      if (field.technical_name !== 'keyword') return this.setFieldRequired(tx, { fieldId: field.id, required: args.required }, actor, change);
    }
    if (field.is_protected && ((args.kind && args.kind !== field.kind) || (args.config && !isDeepStrictEqual({ ...args.config, options: undefined }, { ...field.config, options: undefined })))) throw new AppError(403, 'Module definition is protected');
    const kind = args.kind ?? field.kind;
    if (!isCustomFieldKind(kind)) throw new AppError(400, 'Unsupported field type');
    const config = fieldConfig(kind, args.config ?? (kind === field.kind ? field.config : undefined), ['single_choice', 'multiple_choice'].includes(kind) && ['single_choice', 'multiple_choice'].includes(field.kind) ? field.config : undefined);
    if (args.required && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    await this.checkOptionIdentities(tx, field.id, config);
    const applicability=args.applicability===undefined?field.applicability??null:args.applicability;
    if(field.is_protected&&!isDeepStrictEqual(field.applicability??null,applicability))throw new AppError(403,'Module definition is protected');
    await validateApplicability(tx,type.id,field.id,applicability);
    if(kind!=='single_choice'&&(await applicabilityDependents(tx,field.id)).length)throw new AppError(409,'Field is an applicability controller');
    if((await sql<{applicability:NonNullable<Field['applicability']>}>`SELECT applicability FROM sys_fields WHERE state<>'deleted' AND applicability->>'fieldId'=${field.id} UNION ALL SELECT left_applicability AS applicability FROM sys_relationship_types WHERE left_applicability->>'fieldId'=${field.id} UNION ALL SELECT right_applicability AS applicability FROM sys_relationship_types WHERE right_applicability->>'fieldId'=${field.id}`.execute(tx)).rows.some(dependent=>dependent.applicability.optionIds.some(id=>!config.options?.some(option=>option.id===id))))throw new AppError(409,'Option is referenced by field applicability');
    const next: Field = { ...field, kind, config, required: args.required, applicability };
    const modelChanged = field.kind !== kind || !isDeepStrictEqual(field.config, config) || field.required !== args.required || !isDeepStrictEqual(field.applicability??null,applicability);
    const rows = modelChanged ? (await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows : [];
    const allFields=(await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id=${type.id}::uuid AND state<>'deleted'`.execute(tx)).rows;
    const converted: { row: DataRecord; value: FieldValue }[] = [];
    for (const row of rows) {
      let value: FieldValue;
      try {
        const applicable=applies(next,allFields,row);
        if(!applicable&&!isEmptyFieldValue(row[field.technical_name]))throw new AppError(400,'Existing values are not applicable');
        value = convertFieldValue(field, {...next,required:next.required&&applicable}, row[field.technical_name]);
      }
      catch (error) {
        if (args.required && isEmptyFieldValue(row[field.technical_name])) throw new AppError(400, 'Existing records have empty required fields');
        if (error instanceof AppError && error.status === 400) throw new AppError(400, 'Unsafe field conversion');
        throw error;
      }
      await validateReferences(tx, next, value, type.workspace_id, row[field.technical_name]);
      converted.push({ row, value });
    }
    const representationChanged = field.kind !== kind || (kind === 'decimal' && field.config.scale !== config.scale);
    if (representationChanged) {
      // Preflight completed above. Convert via a temporary text representation in the same transaction.
      await sql`ALTER TABLE ${sql.table(tableName(type))} ALTER COLUMN ${sql.ref(field.technical_name)} TYPE text USING ${sql.ref(field.technical_name)}::text`.execute(tx);
      for (const { row, value } of converted) await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.ref(field.technical_name)} = ${value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value)} WHERE id = ${row.id}::uuid`.execute(tx);
      if (kind === 'multiple_choice') {
        for (const { row, value } of converted) await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.ref(field.technical_name)} = ${value === null ? null : `{${(value as string[]).join(',')}}`} WHERE id = ${row.id}::uuid`.execute(tx);
      }
      await sql`ALTER TABLE ${sql.table(tableName(type))} ALTER COLUMN ${sql.ref(field.technical_name)} TYPE ${fieldStorage(kind, config)} USING ${sql.ref(field.technical_name)}::${fieldStorage(kind, config)}`.execute(tx);
    }
    for (const { row, value } of converted) {
      const original = row[field.technical_name] instanceof Date ? (row[field.technical_name] as Date).toISOString() : row[field.technical_name];
      if (!isDeepStrictEqual(original, value) || (representationChanged && !isEmptyFieldValue(original))) {
        if (!representationChanged) await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.ref(field.technical_name)} = ${storedParameter(next, value)} WHERE id = ${row.id}::uuid`.execute(tx);
        await sql`UPDATE ${sql.table(tableName(type))} SET version = version + 1, updated_at = now(), updated_by = ${actor} WHERE id = ${row.id}::uuid`.execute(tx);
        await this.journal(tx, actor, type.workspace_id, type.id, 'record', row.id, change, field.technical_name, original, value, field.id);
      }
    }
    if (args.labels) await this.setLabels(tx, { kind: 'field', id: field.id, labels: args.labels }, actor, change);
    await sql`UPDATE sys_fields SET kind = ${kind}, config = ${JSON.stringify(config)}::jsonb, required = ${args.required}, applicability=${JSON.stringify(applicability)}::jsonb, version = version + ${modelChanged ? 1 : 0} WHERE id = ${field.id}::uuid`.execute(tx);
    for (const key of ['kind', 'config', 'required', 'applicability'] as const) if (!isDeepStrictEqual(field[key], next[key])) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, field[key], next[key], field.id);
    return this.definition(tx, type.id, actor);
  }

  private async fields(tx: Executor, type: ObjectType, args: Record<string, FieldValue>) {
    const fields = (await sql<Field>`SELECT applicability, id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    for (const name of Object.keys(args)) {
      if (name === 'keyword' || !fields.some(f => f.state === 'active' && f.technical_name === name && isCustomFieldKind(f.kind))) throw new AppError(400, 'Unknown or reserved record field');
    }
    this.requireActive(type);
    return fields;
  }

  private checkStandardValues(fields: Field[], keyword: string | undefined, classification: Record<string, unknown>) {
    if (keyword !== undefined && !fields.some(field => field.state === 'active' && field.technical_name === 'keyword')) throw new AppError(400, 'Standard field is not installed');
    for (const kind of Object.keys(classification)) if (!fields.some(field => field.state === 'active' && field.technical_name === kind)) throw new AppError(400, 'Standard field is not installed');
  }

  private async checkRequiredPermissions(type:ObjectType,fields:Field[],data:Record<string,FieldValue>,previous?:DataRecord){
    const policy=await contentAccess().policy(type.id);if(policy.admin)return;
    const resulting={...previous,...data};
    for(const field of fields.filter(f=>f.state==='active')){
      const required=isCustomFieldKind(field.kind)?field.required:type.classification[field.kind as 'type'|'status'|'category']?.required;
      if(required&&applies(field,fields,resulting)&&isEmptyFieldValue(resulting[field.technical_name])&&!(previous?policy.field(field.id,previous.id).edit:policy.creationField(field.id)))throw new AppError(403,'Required fields cannot be completed with current field permissions');
    }
  }

  private async createRecord(tx: Executor, args: z.infer<typeof schemas.create_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    this.checkStandardValues(fields, args.keyword, args.classification);
    const policy=await contentAccess().require(type.id,undefined,'create');
    await contentAccess().checkWrites(type.id,{...args.values,...args.classification,...(args.keyword!==undefined?{keyword:args.keyword}:{})});
    const id = v7();
    const choices = resolveChoices(this.effectiveClassification(type.classification, fields), args.classification);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))), ...(fields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? { keyword: args.keyword ?? '' } : {}) };
    await this.checkRequiredPermissions(type,fields,data);
    await this.normalizeRecordFields(tx, type, fields, data);
    const columns = ['id', 'created_by', 'updated_by', ...Object.keys(data)];
    const params = [id, actor, actor, ...Object.entries(data).map(([key, value]) => storedParameter(fields.find(field => field.technical_name === key)!, value))];
    await sql`INSERT INTO ${sql.table(tableName(type))} (${sql.join(columns.map(n => sql.ref(n)))})
      VALUES (${sql.join(params)})`.execute(tx);
    const change = v7();
    const journalFields = Object.entries(data).filter(([key, value]) => !['type', 'status', 'category'].includes(key) || (value !== null && (!Array.isArray(value) || value.length)));
    if (!journalFields.length) await this.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, 'created', null, true);
    for (const [key, value] of journalFields) await this.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, key, null, value, fields.find(f => f.technical_name === key)!.id);
    await initializeRecordSecurity(tx,type.id,id,actor,args.security,(_change,key,before,after,field)=>this.journal(tx,actor,type.workspace_id,type.id,'record',id,change,key,before,after,field));
    const relationships=args.linkFrom?await linkedRecordWrites(tx,type.id,args.linkFrom,args.relationships):args.relationships;
    await writeRecordRelationships(tx,type.id,id,relationships,actor,change,true,true);
    return contentAccess().project(type.id,await this.record(tx, type, id));
  }

  private async recordLifecycle(tx:Executor,args:z.infer<typeof schemas.recycle_record>,actor:string,restore:boolean){
    const type=await this.objectType(tx,args.objectTypeId);
    await contentAccess().require(type.id,args.recordId,restore?'full':'delete',restore);
    this.requireActive(type);
    const row=await this.record(tx,type,args.recordId);
    if(row.version!==args.version)throw new AppError(409,'Record version conflict');
    const identity=(await sql<{recycled_at:Date|null}>`SELECT recycled_at FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx)).rows[0];
    if(Boolean(identity?.recycled_at)!==restore)throw new AppError(409,'Record lifecycle conflict');
    if(restore){
      const fields=await this.fields(tx,type,{});
      await this.normalizeRecordFields(tx,type,fields.filter(f=>f.technical_name!=='access_principals'),{},row);
      resolveChoices(this.effectiveClassification(type.classification,fields),{},row as unknown as Choices);
      await validateRestoredRelationships(tx,type.id,args.recordId);
    }
    await sql`UPDATE sys_record_identities SET recycled_at=${restore?sql`NULL`:sql`now()`},recycled_by=${restore?null:actor} WHERE object_type_id=${type.id}::uuid AND record_id=${args.recordId}::uuid`.execute(tx);
    await sql`UPDATE ${sql.table(tableName(type))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
    await this.journal(tx,actor,type.workspace_id,type.id,'record',args.recordId,v7(),'lifecycle',restore?'recycled':'active',restore?'active':'recycled');
    return {id:args.recordId,version:row.version+1};
  }

  private async updateRecord(tx: Executor, args: z.infer<typeof schemas.update_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    this.checkStandardValues(fields, args.keyword, args.classification);
    const previous = await this.record(tx, type, args.recordId);
    await contentAccess().require(type.id,args.recordId,'edit');
    await contentAccess().checkWrites(type.id,{...args.values,...args.classification,...(args.keyword!==undefined?{keyword:args.keyword}:{})},previous);
    if (previous.version !== args.version) throw new AppError(409, 'Record version conflict');
    if(args.security)await contentAccess().require(type.id,args.recordId,'full');
    const choices = resolveChoices(this.effectiveClassification(type.classification, fields), args.classification, previous as unknown as Choices);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))) };
    if (args.keyword !== undefined) data.keyword = args.keyword;
    await this.checkRequiredPermissions(type,fields,data,previous);
    await this.normalizeRecordFields(tx, type, fields, data, previous);
    const changed = Object.entries(data).filter(([key, value]) => !isDeepStrictEqual(previous[key], value));
    await contentAccess().checkWrites(type.id,Object.fromEntries(changed),previous);
    const change = v7();
    if(changed.length){
    const assignments = changed.map(([key, value]) => sql`${sql.ref(key)} = ${storedParameter(fields.find(field => field.technical_name === key)!, value)}`);
    await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.join(assignments)},
      version = version + 1, updated_at = now(), updated_by = ${actor}
      WHERE id = ${args.recordId}::uuid AND version = ${args.version}`.execute(tx);
    contentAccess().clear();
    for (const [key, value] of changed) await this.journal(tx, actor, type.workspace_id, type.id, 'record', args.recordId, change, key, previous[key], value, fields.find(f => f.technical_name === key)!.id);
    }
    const linksChanged=await writeRecordRelationships(tx,type.id,args.recordId,args.relationships,actor,change,changed.length>0);
    if(args.security){
      const policyChanged=await writeRecordSecurity(tx,{objectTypeId:type.id,recordId:args.recordId,...args.security},(_change,key,before,after,field)=>this.journal(tx,actor,type.workspace_id,type.id,'record',args.recordId,change,key,before,after,field));
      if(policyChanged&&!changed.length&&!linksChanged)await sql`UPDATE ${sql.table(tableName(type))} SET version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${args.recordId}::uuid`.execute(tx);
    }
    return contentAccess().project(type.id,await this.record(tx, type, args.recordId));
  }
}
