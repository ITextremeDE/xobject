import { sql } from 'kysely';
import { v7 } from 'uuid';
import type { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { fieldConfig, fieldStorage, normalizeFieldValue, validateReferences, convertFieldValue, storedParameter, isEmptyFieldValue, type TypedField } from './field-types.js';
import { AppError } from './errors.js';
export { AppError } from './errors.js';
import { addClassificationFields } from './database.js';
import { resolveChoices, validateChoices, validateRules, type Choices } from './classification.js';
import { schemas, hasReservedStandardFieldLabel, isReservedStandardFieldName, isCustomFieldKind, type FieldConfig, type FieldValue, type ClassificationConfig, type Operation } from '@xobject/contracts';
export { schemas, type Operation } from '@xobject/contracts';
import type { Database, Executor } from './database.js';

type Labels = Record<string, string>;
type ObjectType = { id: string; workspace_id: string; technical_name: string; code: string; labels: Labels; default_language: string; classification: ClassificationConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
type Field = { id: string; technical_name: string; labels: Labels; kind: string; required: boolean; config: FieldConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
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
  for (const key of [userLanguage, workspaceLanguage, 'en', 'de', 'und']) {
    if (key && labels[key]) return labels[key];
  }
  return Object.values(labels)[0];
}

/** Every entry point resolves a real session and calls this shared application layer. */
export class Application {
  constructor(private db: Database) {}

  async execute(operation: Operation, input: unknown, userId: string): Promise<unknown> {
    const parsed = schemas[operation].parse(input);
    try {
      return await this.db.transaction().execute(async (tx) => {
        // Serialise model changes and record writes until a finer locking strategy is designed.
        // This is a spike trade-off, not a scalability claim.
        await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
        const access = await this.authorize(tx, operation, parsed as Record<string, unknown>, userId);
        switch (operation) {
          case 'set_definition_state': return this.setDefinitionState(tx, schemas.set_definition_state.parse(parsed), userId);
          case 'get_definition_journal': { const args = schemas.get_definition_journal.parse(parsed); const type = await this.objectType(tx, args.objectTypeId, true); return (await sql`SELECT id, change_id, field_id, field_key, old_value, new_value, actor_id, created_at FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind <> 'record' ORDER BY created_at, id`.execute(tx)).rows; }
          case 'get_access_context': return { isAdmin: access.isAdmin };
          case 'list_users': return (await sql`SELECT id, name, email, is_admin AS "isAdmin" FROM sys_users ORDER BY name, id`.execute(tx)).rows;
          case 'list_workspace_members': { const args = schemas.list_workspace_members.parse(parsed); if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found'); return (await sql`SELECT u.id, u.name, u.email, CASE WHEN u.is_admin THEN 'administrator' ELSE m.role END AS role FROM sys_users u LEFT JOIN sys_workspace_members m ON m.user_id = u.id AND m.workspace_id = ${args.workspaceId}::uuid WHERE u.is_admin OR m.user_id IS NOT NULL ORDER BY u.name, u.id`.execute(tx)).rows; }
          case 'set_workspace_member': return this.setWorkspaceMember(tx, schemas.set_workspace_member.parse(parsed), userId);
          case 'create_workspace': return this.createWorkspace(tx, schemas.create_workspace.parse(parsed), userId);
          case 'create_group': {
            const args = schemas.create_group.parse(parsed);
            if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
            const id = v7();
            await sql`INSERT INTO sys_groups (id, workspace_id, name) VALUES (${id}::uuid, ${args.workspaceId}::uuid, ${args.name})`.execute(tx);
            await this.journal(tx, userId, args.workspaceId, null, 'group', id, v7(), 'name', null, args.name);
            return { id };
          }
          case 'list_field_principals': {
            const args = schemas.list_field_principals.parse(parsed);
            if (!(await sql`SELECT 1 FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows.length) throw new AppError(404, 'Workspace not found');
            return (await sql`SELECT id, name, 'user' AS kind FROM sys_users WHERE ${access.isAdmin} OR is_admin OR id IN (SELECT user_id FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid) UNION ALL SELECT id::text, name, 'group' AS kind FROM sys_groups WHERE workspace_id = ${args.workspaceId}::uuid ORDER BY name, id`.execute(tx)).rows;
          }
          case 'list_workspaces': return (await sql`SELECT w.id, w.code, w.name, w.default_language, CASE WHEN ${access.isAdmin} THEN 'administrator' ELSE m.role END AS role FROM sys_workspaces w LEFT JOIN sys_workspace_members m ON m.workspace_id = w.id AND m.user_id = ${userId} WHERE ${access.isAdmin} OR m.user_id IS NOT NULL ORDER BY w.code`.execute(tx)).rows;
          case 'list_object_types': {
            const args = schemas.list_object_types.parse(parsed);
            const workspace = (await sql<{ default_language: string }>`SELECT default_language FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
            if (!workspace) throw new AppError(404, 'Workspace not found');
            const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            const types = (await sql<{ id: string; technical_name: string; labels: Labels; state: string; is_protected: boolean }>`SELECT id, technical_name, labels, state, is_protected FROM sys_object_types WHERE workspace_id = ${args.workspaceId}::uuid AND (state = 'active' OR (${args.includeInactive} AND state = 'inactive') OR (${args.includeDeleted} AND state = 'deleted')) ORDER BY technical_name`.execute(tx)).rows;
            return types.map(type => ({ id: type.id, state: type.state, isProtected: type.is_protected, technicalName: type.technical_name, labels: type.labels,
              label: localizedLabel(type.labels, user.language, workspace.default_language) }));
          }
          case 'search_workspace': return this.searchWorkspace(tx, schemas.search_workspace.parse(parsed), userId);
          case 'list_records': {
            const args = schemas.list_records.parse(parsed);
            const type = await this.objectType(tx, args.objectTypeId);
            const sortableFields = (await sql<Field>`SELECT id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
            if (!['id', 'updated_at'].includes(args.sortBy) && !sortableFields.some(field => field.state === 'active' && field.technical_name === args.sortBy)) {
              throw new AppError(400, 'Unknown sort field');
            }
            const direction = args.sortDirection === 'asc' ? sql`ASC` : sql`DESC`;
            let sortExpression = sql`${sql.ref(args.sortBy)}`;
            if (['type', 'status', 'category'].includes(args.sortBy)) {
              const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
              const options = type.classification.options.filter(option => option.kind === args.sortBy);
              const cases = options.map(option => sql`WHEN ${option.id}::uuid THEN ${localizedLabel(option.labels, user.language, type.default_language)}`);
              sortExpression = !cases.length ? sql`NULL::text` : args.sortBy === 'category'
                ? sql`(SELECT string_agg(label, ', ' ORDER BY label) FROM (SELECT CASE selection.id ${sql.join(cases, sql` `)} ELSE NULL END AS label FROM unnest(category) AS selection(id)) AS names)`
                : sql`CASE ${sql.ref(args.sortBy)} ${sql.join(cases, sql` `)} ELSE NULL END`;
            }

            const sortedField = sortableFields.find(field => field.technical_name === args.sortBy);
            if (sortedField?.kind === 'money') sortExpression = sql`CASE WHEN ${sql.ref(args.sortBy)} IS NULL THEN NULL ELSE ROW(${sql.ref(args.sortBy)}->>'currency', (${sql.ref(args.sortBy)}->>'amount')::numeric) END`;
            if (sortedField && ['single_choice', 'multiple_choice'].includes(sortedField.kind)) {
              const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
              const cases = (sortedField.config.options ?? []).map(option => sql`WHEN ${option.id}::uuid THEN ${localizedLabel(option.labels, user.language, type.default_language)}`);
              sortExpression = !cases.length ? sql`NULL::text` : sortedField.kind === 'multiple_choice'
                ? sql`(SELECT string_agg(label, ', ' ORDER BY label) FROM (SELECT CASE selection.id ${sql.join(cases, sql` `)} ELSE NULL END AS label FROM unnest(${sql.ref(args.sortBy)}) AS selection(id)) AS names)`
                : sql`CASE ${sql.ref(args.sortBy)} ${sql.join(cases, sql` `)} ELSE NULL END`;
            }
            if (sortedField?.kind === 'reference') sortExpression = sql`(SELECT string_agg(COALESCE(u.name, g.name), ', ' ORDER BY COALESCE(u.name, g.name), ref->>'id') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${sql.ref(args.sortBy)}) = 'array' THEN ${sql.ref(args.sortBy)} ELSE jsonb_build_array(${sql.ref(args.sortBy)}) END) AS ref LEFT JOIN sys_users u ON ref->>'kind' = 'user' AND u.id = ref->>'id' LEFT JOIN sys_groups g ON ref->>'kind' = 'group' AND g.id::text = ref->>'id' AND g.workspace_id = ${type.workspace_id}::uuid)`;
            const searchColumn = sortableFields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? sql`keyword` : sql`id::text`;
            const predicate = sql`position(lower(${args.query}) in lower(${searchColumn})) > 0`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM ${sql.table(tableName(type))} WHERE ${predicate}`.execute(tx)).rows[0].total;
            const records = (await sql`SELECT * FROM ${sql.table(tableName(type))} WHERE ${predicate}
              ORDER BY ${sortExpression} ${direction} NULLS LAST, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { records: records.map(row => this.outputRecord(row as DataRecord, sortableFields)), total, limit: args.limit, offset: args.offset };
          }
          case 'create_object_type': return this.createObjectType(tx, schemas.create_object_type.parse(parsed), userId);
          case 'add_standard_field': { const args = schemas.add_standard_field.parse(parsed); const type = await this.objectType(tx, args.objectTypeId); await this.addStandardField(tx, type, args.field, userId); return this.definition(tx, type.id, userId); }
          case 'create_field': return this.createField(tx, schemas.create_field.parse(parsed), userId);
          case 'get_object_type': return this.definition(tx, schemas.get_object_type.parse(parsed).objectTypeId, userId);
          case 'configure_field': return this.configureField(tx, schemas.configure_field.parse(parsed), userId);
          case 'set_field_required': return this.setFieldRequired(tx, schemas.set_field_required.parse(parsed), userId);
          case 'set_labels': return this.setLabels(tx, schemas.set_labels.parse(parsed), userId);
          case 'set_workspace_name': return this.setWorkspaceName(tx, schemas.set_workspace_name.parse(parsed), userId);
          case 'set_workspace_language': return this.setWorkspaceLanguage(tx, schemas.set_workspace_language.parse(parsed), userId);
          case 'set_user_language': return this.setUserLanguage(tx, schemas.set_user_language.parse(parsed).language, userId);
          case 'configure_classification': return this.configureClassification(tx, schemas.configure_classification.parse(parsed), userId);
          case 'create_record': return this.createRecord(tx, schemas.create_record.parse(parsed), userId);
          case 'update_record': return this.updateRecord(tx, schemas.update_record.parse(parsed), userId);
          case 'get_record': {
            const args = schemas.get_record.parse(parsed);
            return this.record(tx, await this.objectType(tx, args.objectTypeId), args.recordId);
          }
          case 'get_journal': {
            const args = schemas.get_journal.parse(parsed);
            const type = await this.objectType(tx, args.objectTypeId);
            await this.record(tx, type, args.recordId);
            return (await sql`SELECT * FROM sys_journal WHERE workspace_id = ${type.workspace_id}::uuid
              AND object_type_id = ${type.id}::uuid AND entity_kind = 'record'
              AND entity_id = ${args.recordId}::uuid ORDER BY created_at, id`.execute(tx)).rows;
          }
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new AppError(409, 'Name already exists');
      throw error;
    }
  }

  private async authorize(tx: Executor, operation: Operation, args: Record<string, unknown>, actor: string) {
    const user = (await sql<{ is_admin: boolean }>`SELECT is_admin FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    if (!user) throw new AppError(403, 'Access denied');
    if (user.is_admin) return { isAdmin: true };
    if (['get_access_context', 'list_workspaces', 'set_user_language'].includes(operation)) return { isAdmin: false };
    // Workspace roles do not grant content access; that awaits object/record/field permissions.
    if (['create_workspace', 'list_users', 'set_workspace_member', 'search_workspace', 'list_records', 'get_record', 'get_journal', 'create_record', 'update_record'].includes(operation)) throw new AppError(403, 'Access denied');
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
    const reads: Operation[] = ['list_object_types', 'get_object_type', 'list_workspace_members', 'list_field_principals', 'get_definition_journal'];
    const configuration: Operation[] = ['set_workspace_name', 'set_workspace_language', 'create_object_type', 'create_field', 'add_standard_field', 'configure_field', 'set_field_required', 'set_labels', 'configure_classification', 'create_group', 'set_definition_state'];
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
      if (args.role === null) await sql`DELETE FROM sys_workspace_members WHERE workspace_id = ${args.workspaceId}::uuid AND user_id = ${args.userId}`.execute(tx);
      else await sql`INSERT INTO sys_workspace_members (workspace_id, user_id, role) VALUES (${args.workspaceId}::uuid, ${args.userId}, ${args.role}) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`.execute(tx);
      await this.journal(tx, actor, args.workspaceId, null, 'workspace_member', args.workspaceId, v7(), `member:${args.userId}`, previous, args.role);
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
    const history = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' AND (field_id = ANY(${fields.map(field => field.id)}::uuid[]) OR (field_id IS NULL AND field_key = ANY(${names}::text[])))`.execute(tx)).rows;
    return history.some(entry => !isEmptyFieldValue(entry.old_value) || !isEmptyFieldValue(entry.new_value));
  }

  private async validateActiveFields(tx: Executor, type: ObjectType, fields: Field[]) {
    const rows = (await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    for (const raw of rows) {
      const record = this.outputRecord(raw, fields);
      for (const field of fields.filter(field => field.state === 'active' && isCustomFieldKind(field.kind))) {
        const value = normalizeFieldValue(field, record[field.technical_name], record[field.technical_name]);
        await validateReferences(tx, field, value, type.workspace_id);
      }
      const choices: Choices = { type: record.type as string | null, status: record.status as string | null, category: record.category as string[] };
      validateChoices(this.effectiveClassification(type.classification, fields), choices, choices);
    }
  }

  private async setDefinitionState(tx: Executor, args: z.infer<typeof schemas.set_definition_state>, actor: string) {
    const field = args.kind === 'field' ? (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid AND state <> 'deleted'`.execute(tx)).rows[0] : undefined;
    if (args.kind === 'field' && !field) throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field?.object_type_id ?? args.id);
    const all = (await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' ORDER BY id`.execute(tx)).rows;
    const affected = field ? all.filter(item => this.sameFieldGroup(field, item)) : all;
    const previous = field?.state ?? type.state;
    if (previous !== args.expectedState || (field && affected.some(item => item.state !== args.expectedState))) throw new AppError(409, 'Definition state conflict');
    if ((field && affected.some(item => item.is_protected)) || (!field && (type.is_protected || affected.some(item => item.is_protected)))) throw new AppError(403, 'Module definition is protected');
    if (field) this.requireActive(type);
    if (args.state === previous) return { id: args.id, state: previous };
    if (args.state === 'deleted') {
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
      await sql`UPDATE sys_object_types SET state = ${args.state} WHERE id = ${type.id}::uuid`.execute(tx);
      await this.journal(tx, actor, type.workspace_id, type.id, 'object_type', type.id, change, 'state', previous, args.state);
    }
    for (const item of affected) if (field || args.state === 'deleted') {
      if (args.state === 'deleted') await this.journal(tx, actor, type.workspace_id, type.id, 'field', item.id, change, 'definition', item, null, item.id);
      await sql`UPDATE sys_fields SET state = ${args.state}, required = ${args.state === 'deleted' && ['type', 'status', 'category'].includes(item.technical_name) ? type.classification[item.technical_name as 'type' | 'status' | 'category'].required : item.required} WHERE id = ${item.id}::uuid`.execute(tx);
      await this.journal(tx, actor, type.workspace_id, type.id, 'field', item.id, change, 'state', item.state, args.state, item.id);
    }
    return { id: args.id, state: args.state };
  }

  private async searchWorkspace(tx: Executor, args: z.infer<typeof schemas.search_workspace>, userId: string) {
    const workspace = (await sql<{ code: string; default_language: string }>`SELECT code, default_language FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!workspace) throw new AppError(404, 'Workspace not found');
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
    const types = (await sql<{ id: string; technical_name: string; labels: Labels; has_keyword: boolean }>`SELECT o.id, o.technical_name, o.labels, EXISTS (SELECT 1 FROM sys_fields f WHERE f.object_type_id = o.id AND f.technical_name = 'keyword' AND f.state = 'active') AS has_keyword FROM sys_object_types o WHERE workspace_id = ${args.workspaceId}::uuid AND o.state = 'active' ORDER BY technical_name`.execute(tx)).rows;
    const summaries = types.map(type => ({ id: type.id, technicalName: type.technical_name, labels: type.labels, label: localizedLabel(type.labels, user.language, workspace.default_language) }));
    const needle = args.query.toLowerCase();
    const matches = summaries.filter(type => type.label.toLowerCase().includes(needle) || type.technicalName.includes(needle));
    // Search only this workspace's metadata-derived tables; user text is always a SQL value.
    const queries = types.map(type => sql`(SELECT id, ${type.has_keyword ? sql`keyword` : sql`id::text`} AS keyword, updated_at, ${type.id}::uuid AS object_type_id FROM ${sql.table(`${workspace.code}_${type.technical_name}`)}
      WHERE position(lower(${args.query}) in lower(${type.has_keyword ? sql`keyword` : sql`id::text`})) > 0 ORDER BY updated_at DESC, id LIMIT ${args.limit + 1})`);
    const rows = queries.length ? (await sql<{ id: string; keyword: string; object_type_id: string }>`SELECT * FROM (${sql.join(queries, sql` UNION ALL `)}) AS matches
      ORDER BY updated_at DESC, id LIMIT ${args.limit + 1}`.execute(tx)).rows : [];
    const labels = new Map(summaries.map(type => [type.id, type.label]));
    return { objectTypes: matches.slice(0, args.limit),
      records: rows.slice(0, args.limit).map(row => ({ id: row.id, keyword: row.keyword, objectTypeId: row.object_type_id, objectLabel: labels.get(row.object_type_id)! })),
      hasMoreObjects: matches.length > args.limit, hasMoreRecords: rows.length > args.limit };
  }

  private async objectType(tx: Executor, id: string, includeDeleted = false) {
    const result = await sql<ObjectType>`SELECT o.*, w.code, w.default_language FROM sys_object_types o
      JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ${id}::uuid`.execute(tx);
    if (!result.rows[0] || (!includeDeleted && result.rows[0].state === 'deleted')) throw new AppError(404, 'Object type not found');
    return result.rows[0];
  }

  private async record(tx: Executor, type: ObjectType, id: string) {
    const result = await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))} WHERE id = ${id}::uuid`.execute(tx);
    if (!result.rows[0]) throw new AppError(404, 'Record not found');
    const fields = (await sql<Field>`SELECT id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    return this.outputRecord(result.rows[0], fields);
  }

  private outputRecord(record: DataRecord, fields: Field[]): DataRecord {
    for (const [key, value] of Object.entries(record)) if (value instanceof Date) record[key] = value.toISOString();
    for (const field of fields.filter(field => isCustomFieldKind(field.kind))) record[field.technical_name] = normalizeFieldValue({ ...field, required: false }, record[field.technical_name], record[field.technical_name]);
    return Object.assign({ keyword: '', type: null, status: null, category: [] }, record);
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
    await sql`INSERT INTO sys_workspaces (id, code, name, created_by, default_language)
      VALUES (${id}::uuid, ${args.code}, ${args.name}, ${actor}, ${args.defaultLanguage})`.execute(tx);
    const change = v7();
    for (const [key, value] of Object.entries({ name: args.name, code: args.code, default_language: args.defaultLanguage })) {
      await this.journal(tx, actor, id, null, 'workspace', id, change, key, null, value);
    }
    return { id, ...args };
  }

  private async createObjectType(tx: Executor, args: z.infer<typeof schemas.create_object_type>, actor: string) {
    await checkName(tx, args.technicalName);
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
    const change = v7();
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'technical_name', null, args.technicalName);
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'labels', null, args.labels);
    const type = await this.objectType(tx, id);
    for (const field of args.standardFields) await this.addStandardField(tx, type, field, actor, change);

    return { id, ...args, tableName: name };
  }

  private async addStandardField(tx: Executor, type: ObjectType, kind: 'type_status' | 'category' | 'keyword', actor: string, change = v7()) {
    this.requireActive(type);
    const names = kind === 'type_status' ? ['type', 'status'] : [kind];
    if ((await sql`SELECT 1 FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows.length) throw new AppError(409, 'Standard field already exists');
    if (kind === 'keyword') {
      const labels = { de: 'Stichwort', en: 'Keyword' };
      await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN keyword text NOT NULL DEFAULT ''`.execute(tx);
      await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required) VALUES (${v7()}::uuid, ${type.id}::uuid, 'keyword', ${JSON.stringify(labels)}::jsonb, 'text', false)`.execute(tx);
    } else await addClassificationFields(tx, type.id, tableName(type), names);
    const fields = (await sql<Field>`SELECT id, technical_name, labels, kind FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows;
    for (const field of fields) for (const [key, value] of Object.entries({ technical_name: field.technical_name, labels: field.labels, kind: field.kind, required: false })) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, null, value, field.id);
  }

  private async createField(tx: Executor, args: z.infer<typeof schemas.create_field>, actor: string) {
    await checkName(tx, args.technicalName);
    if (isReservedStandardFieldName(args.technicalName) || hasReservedStandardFieldLabel(args.labels)) throw new AppError(400, 'Reserved standard field name');
    const type = await this.objectType(tx, args.objectTypeId);
    this.requireActive(type);
    if (args.required && (await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Existing records have empty required fields');
    const config = fieldConfig(args.kind, args.config);
    if (args.required && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    const id = v7();
    await this.checkOptionIdentities(tx, id, config);
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required, config)
      VALUES (${id}::uuid, ${type.id}::uuid, ${args.technicalName}, ${JSON.stringify(args.labels)}::jsonb, ${args.kind}, ${args.required}, ${JSON.stringify(config)}::jsonb)`.execute(tx);
    await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN ${sql.ref(args.technicalName)} ${fieldStorage(args.kind, config)}`.execute(tx);
    const change = v7();
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'technical_name', null, args.technicalName, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'labels', null, args.labels, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'kind', null, args.kind, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'config', null, config, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'required', null, args.required, id);
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
    const fields = (await sql<Field>`SELECT id, technical_name, labels, kind, required, config, state, is_protected FROM sys_fields
      WHERE object_type_id = ${id}::uuid ORDER BY id`.execute(tx)).rows;
    const columns = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${tableName(type)} AND ${type.state !== 'deleted'} ORDER BY ordinal_position`.execute(tx)).rows;
    const used = type.state !== 'deleted' && type.classification.options.some(option => option.kind !== 'category') ? await this.usedClassificationIds(tx, type, fields) : new Set<string>();
    return {
      id: type.id, state: type.state, isProtected: type.is_protected || fields.some(field => field.state !== 'deleted' && field.is_protected), canDelete: type.state !== 'deleted' && !type.is_protected && !fields.some(field => field.state !== 'deleted' && field.is_protected) && !(await this.objectUsed(tx, type)), workspaceId: type.workspace_id, technicalName: type.technical_name,
      classification: { ...type.classification, options: type.classification.options.map(option => ({ ...option, label: localizedLabel(option.labels, user.language, type.default_language), canDelete: option.kind !== 'category' && !used.has(option.id) })) },
      labels: type.labels, label: localizedLabel(type.labels, user.language, type.default_language),
      fields: await Promise.all(fields.filter(f => f.state !== 'deleted').map(async f => ({ id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, isProtected: f.is_protected || fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected),
        canDelete: !fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected) && !(await this.fieldGroupUsed(tx, type, fields.filter(item => item.state !== 'deleted' && this.sameFieldGroup(f, item)))),
        required: isCustomFieldKind(f.kind) ? f.required : type.classification[f.kind as 'type' | 'status' | 'category'].required, labels: f.labels, label: localizedLabel(f.labels, user.language, type.default_language) }))),
      historicalFields: fields.filter(f => f.state === 'deleted').map(f => ({ id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, required: f.required, labels: f.labels, label: localizedLabel(f.labels, user.language, type.default_language) })),
      columns: columns.map(c => c.column_name),
    };
  }

  private async setFieldRequired(tx: Executor, args: z.infer<typeof schemas.set_field_required>, actor: string, changeId?: string): Promise<unknown> {
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

  private async setLabels(tx: Executor, args: z.infer<typeof schemas.set_labels>, actor: string, changeId?: string) {
    let type: ObjectType;
    let previous: Labels;
    if (args.kind === 'object_type') {
      type = await this.objectType(tx, args.id);
      this.requireActive(type);
      previous = type.labels;
    } else {
      const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid`.execute(tx)).rows[0];
      if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
      if (['keyword', 'type', 'status', 'category'].includes(field.technical_name)) throw new AppError(400, 'Shared field labels are fixed');
      if (hasReservedStandardFieldLabel(args.labels)) throw new AppError(400, 'Reserved standard field name');
      type = await this.objectType(tx, field.object_type_id);
      this.requireActive(type);
      previous = field.labels;
    }
    // Compare jsonb values semantically; key order must not create false change events.
    const result = await sql`UPDATE ${sql.table(args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields')}
      SET labels = ${JSON.stringify(args.labels)}::jsonb
      WHERE id = ${args.id}::uuid AND labels IS DISTINCT FROM ${JSON.stringify(args.labels)}::jsonb RETURNING id`.execute(tx);
    if (result.rows.length) {
      await this.journal(tx, actor, type.workspace_id, type.id, args.kind, args.id, changeId ?? v7(), 'labels', previous, args.labels,
        args.kind === 'field' ? args.id : null);
    }
    return { id: args.id, kind: args.kind, labels: args.labels };
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

  private async setWorkspaceLanguage(tx: Executor, args: z.infer<typeof schemas.set_workspace_language>, actor: string) {
    const workspace = (await sql<{ default_language: string }>`SELECT default_language FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
    if (!workspace) throw new AppError(404, 'Workspace not found');
    if (workspace.default_language !== args.language) {
      await sql`UPDATE sys_workspaces SET default_language = ${args.language} WHERE id = ${args.workspaceId}::uuid`.execute(tx);
      await this.journal(tx, actor, args.workspaceId, null, 'workspace', args.workspaceId, v7(), 'default_language', workspace.default_language, args.language);
    }
    return { workspaceId: args.workspaceId, defaultLanguage: args.language };
  }

  private async setUserLanguage(tx: Executor, preference: string | null, actor: string) {
    const previous = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    if (previous.language !== preference) {
      await sql`UPDATE sys_users SET language = ${preference}, updated_at = now() WHERE id = ${actor}`.execute(tx);
      await this.journal(tx, actor, null, null, 'user', actor, v7(), 'language', previous.language, preference);
    }
    return { language: preference };
  }

  private async configureClassification(tx: Executor, args: z.infer<typeof schemas.configure_classification>, actor: string, changeId?: string, removable = new Set<string>()) {
    const type = await this.objectType(tx, args.objectTypeId);
    this.requireActive(type);
    if (type.classification.version !== args.version) throw new AppError(409, 'Classification version conflict');
    args.config.category.defaultIds.sort();
    args.config.status.defaults.sort((left, right) => (left.typeId ?? '').localeCompare(right.typeId ?? ''));
    const available = (await sql<Field>`SELECT id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
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
      const value = normalizeFieldValue(field, supplied ? data[field.technical_name] : previous?.[field.technical_name], previous?.[field.technical_name]);
      await validateReferences(tx, field, value, type.workspace_id);
      if (supplied) data[field.technical_name] = value;
    }
  }

  private async configureField(tx: Executor, args: z.infer<typeof schemas.configure_field>, actor: string, suppliedChangeId?: string): Promise<unknown> {
    const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.fieldId}::uuid`.execute(tx)).rows[0];
    if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field.object_type_id);
    this.requireActive(type);
    const change = suppliedChangeId ?? v7();
    if (['keyword', 'type', 'status', 'category'].includes(field.technical_name)) {
      if ((args.kind && args.kind !== field.kind) || args.config) throw new AppError(400, 'Shared field type is fixed');
      if (args.labels) await this.setLabels(tx, { kind: 'field', id: field.id, labels: args.labels }, actor, change);
      if (field.technical_name !== 'keyword') return this.setFieldRequired(tx, { fieldId: field.id, required: args.required }, actor, change);
    }
    const kind = args.kind ?? field.kind;
    if (!isCustomFieldKind(kind)) throw new AppError(400, 'Unsupported field type');
    const config = fieldConfig(kind, args.config ?? (kind === field.kind ? field.config : undefined), ['single_choice', 'multiple_choice'].includes(kind) && ['single_choice', 'multiple_choice'].includes(field.kind) ? field.config : undefined);
    if (args.required && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    await this.checkOptionIdentities(tx, field.id, config);
    const next: Field = { ...field, kind, config, required: args.required };
    const modelChanged = field.kind !== kind || !isDeepStrictEqual(field.config, config) || field.required !== args.required;
    const rows = modelChanged ? (await sql<DataRecord>`SELECT id, version, ${sql.ref(field.technical_name)} FROM ${sql.table(tableName(type))}`.execute(tx)).rows : [];
    const converted: { row: DataRecord; value: FieldValue }[] = [];
    for (const row of rows) {
      let value: FieldValue;
      try { value = convertFieldValue(field, next, row[field.technical_name]); }
      catch (error) {
        if (args.required && isEmptyFieldValue(row[field.technical_name])) throw new AppError(400, 'Existing records have empty required fields');
        if (error instanceof AppError && error.status === 400) throw new AppError(400, 'Unsafe field conversion');
        throw error;
      }
      await validateReferences(tx, next, value, type.workspace_id);
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
    await sql`UPDATE sys_fields SET kind = ${kind}, config = ${JSON.stringify(config)}::jsonb, required = ${args.required} WHERE id = ${field.id}::uuid`.execute(tx);
    for (const key of ['kind', 'config', 'required'] as const) if (!isDeepStrictEqual(field[key], next[key])) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, field[key], next[key], field.id);
    return this.definition(tx, type.id, actor);
  }

  private async fields(tx: Executor, type: ObjectType, args: Record<string, FieldValue>) {
    const fields = (await sql<Field>`SELECT id, technical_name, kind, required, config, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
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

  private async createRecord(tx: Executor, args: z.infer<typeof schemas.create_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    this.checkStandardValues(fields, args.keyword, args.classification);
    const id = v7();
    const choices = resolveChoices(this.effectiveClassification(type.classification, fields), args.classification);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))), ...(fields.some(field => field.state === 'active' && field.technical_name === 'keyword') ? { keyword: args.keyword ?? '' } : {}) };
    await this.normalizeRecordFields(tx, type, fields, data);
    const columns = ['id', 'created_by', 'updated_by', ...Object.keys(data)];
    const params = [id, actor, actor, ...Object.entries(data).map(([key, value]) => storedParameter(fields.find(field => field.technical_name === key)!, value))];
    await sql`INSERT INTO ${sql.table(tableName(type))} (${sql.join(columns.map(n => sql.ref(n)))})
      VALUES (${sql.join(params)})`.execute(tx);
    const change = v7();
    const journalFields = Object.entries(data).filter(([key, value]) => !['type', 'status', 'category'].includes(key) || (value !== null && (!Array.isArray(value) || value.length)));
    if (!journalFields.length) await this.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, 'created', null, true);
    for (const [key, value] of journalFields) await this.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, key, null, value, fields.find(f => f.technical_name === key)!.id);
    return this.record(tx, type, id);
  }

  private async updateRecord(tx: Executor, args: z.infer<typeof schemas.update_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    this.checkStandardValues(fields, args.keyword, args.classification);
    const previous = await this.record(tx, type, args.recordId);
    if (previous.version !== args.version) throw new AppError(409, 'Record version conflict');
    const choices = resolveChoices(this.effectiveClassification(type.classification, fields), args.classification, previous as unknown as Choices);
    const data: Record<string, FieldValue> = { ...args.values, ...Object.fromEntries(Object.entries(choices).filter(([key]) => fields.some(field => field.state === 'active' && field.technical_name === key))) };
    if (args.keyword !== undefined) data.keyword = args.keyword;
    await this.normalizeRecordFields(tx, type, fields, data, previous);
    const changed = Object.entries(data).filter(([key, value]) => !isDeepStrictEqual(previous[key], value));
    if (!changed.length) return previous;
    const assignments = changed.map(([key, value]) => sql`${sql.ref(key)} = ${storedParameter(fields.find(field => field.technical_name === key)!, value)}`);
    await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.join(assignments)},
      version = version + 1, updated_at = now(), updated_by = ${actor}
      WHERE id = ${args.recordId}::uuid AND version = ${args.version}`.execute(tx);
    const change = v7();
    for (const [key, value] of changed) await this.journal(tx, actor, type.workspace_id, type.id, 'record', args.recordId, change, key, previous[key], value, fields.find(f => f.technical_name === key)!.id);
    return this.record(tx, type, args.recordId);
  }
}
