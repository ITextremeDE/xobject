import { sql } from 'kysely';
import { v7 } from 'uuid';
import type { z } from 'zod';
import { schemas, type Operation } from '@xobject/contracts';
export { schemas, type Operation } from '@xobject/contracts';
import type { Database, Executor } from './database.js';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Labels = Record<string, string>;
type ObjectType = { id: string; workspace_id: string; technical_name: string; code: string; labels: Labels; default_language: string };
type Field = { id: string; technical_name: string; labels: Labels };
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
    // The spike deliberately fails closed for all non-administrators.
    const admin = await sql`SELECT 1 FROM sys_administrators WHERE user_id = ${userId}`.execute(this.db);
    if (!admin.rows.length) throw new AppError(403, 'This technical spike is limited to Administrators');
    try {
      return await this.db.transaction().execute(async (tx) => {
        // Serialise model changes and record writes until a finer locking strategy is designed.
        // This is a spike trade-off, not a scalability claim.
        await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
        switch (operation) {
          case 'create_workspace': return this.createWorkspace(tx, schemas.create_workspace.parse(parsed), userId);
          case 'list_workspaces': return (await sql`SELECT id, code, name, default_language FROM sys_workspaces ORDER BY code`.execute(tx)).rows;
          case 'list_object_types': {
            const args = schemas.list_object_types.parse(parsed);
            const workspace = (await sql<{ default_language: string }>`SELECT default_language FROM sys_workspaces WHERE id = ${args.workspaceId}::uuid`.execute(tx)).rows[0];
            if (!workspace) throw new AppError(404, 'Workspace not found');
            const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${userId}`.execute(tx)).rows[0];
            const types = (await sql<{ id: string; technical_name: string; labels: Labels }>`SELECT id, technical_name, labels FROM sys_object_types WHERE workspace_id = ${args.workspaceId}::uuid ORDER BY technical_name`.execute(tx)).rows;
            return types.map(type => ({ id: type.id, technicalName: type.technical_name, labels: type.labels,
              label: localizedLabel(type.labels, user.language, workspace.default_language) }));
          }
          case 'list_records': {
            const args = schemas.list_records.parse(parsed);
            const type = await this.objectType(tx, args.objectTypeId);
            const predicate = sql`position(lower(${args.query}) in lower(keyword)) > 0`;
            const total = (await sql<{ total: number }>`SELECT count(*)::integer AS total FROM ${sql.table(tableName(type))} WHERE ${predicate}`.execute(tx)).rows[0].total;
            const records = (await sql`SELECT * FROM ${sql.table(tableName(type))} WHERE ${predicate}
              ORDER BY updated_at DESC, id LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
            return { records, total, limit: args.limit, offset: args.offset };
          }
          case 'create_object_type': return this.createObjectType(tx, schemas.create_object_type.parse(parsed), userId);
          case 'create_field': return this.createField(tx, schemas.create_field.parse(parsed), userId);
          case 'get_object_type': return this.definition(tx, schemas.get_object_type.parse(parsed).objectTypeId, userId);
          case 'set_labels': return this.setLabels(tx, schemas.set_labels.parse(parsed), userId);
          case 'set_workspace_language': return this.setWorkspaceLanguage(tx, schemas.set_workspace_language.parse(parsed), userId);
          case 'set_user_language': return this.setUserLanguage(tx, schemas.set_user_language.parse(parsed).language, userId);
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

  private async objectType(tx: Executor, id: string) {
    const result = await sql<ObjectType>`SELECT o.*, w.code, w.default_language FROM sys_object_types o
      JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ${id}::uuid`.execute(tx);
    if (!result.rows[0]) throw new AppError(404, 'Object type not found');
    return result.rows[0];
  }

  private async record(tx: Executor, type: ObjectType, id: string) {
    const result = await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))} WHERE id = ${id}::uuid`.execute(tx);
    if (!result.rows[0]) throw new AppError(404, 'Record not found');
    return result.rows[0];
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
      .addColumn('keyword', 'text', c => c.notNull())
      .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
      .addColumn('created_by', 'text', c => c.notNull().references('sys_users.id'))
      .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
      .addColumn('updated_by', 'text', c => c.notNull().references('sys_users.id'))
      .addColumn('version', 'integer', c => c.notNull().defaultTo(1))
      .execute();
    const fieldId = v7();
    const keywordLabels = { de: 'Stichwort', en: 'Keyword' };
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind)
      VALUES (${fieldId}::uuid, ${id}::uuid, 'keyword', ${JSON.stringify(keywordLabels)}::jsonb, 'text')`.execute(tx);
    const change = v7();
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'technical_name', null, args.technicalName);
    await this.journal(tx, actor, args.workspaceId, id, 'object_type', id, change, 'labels', null, args.labels);
    await this.journal(tx, actor, args.workspaceId, id, 'field', fieldId, change, 'labels', null, keywordLabels, fieldId);
    return { id, ...args, tableName: name };
  }

  private async createField(tx: Executor, args: z.infer<typeof schemas.create_field>, actor: string) {
    await checkName(tx, args.technicalName);
    const type = await this.objectType(tx, args.objectTypeId);
    const id = v7();
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind)
      VALUES (${id}::uuid, ${type.id}::uuid, ${args.technicalName}, ${JSON.stringify(args.labels)}::jsonb, 'text')`.execute(tx);
    await tx.schema.alterTable(tableName(type)).addColumn(args.technicalName, 'text').execute();
    const change = v7();
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'technical_name', null, args.technicalName, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'labels', null, args.labels, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'kind', null, 'text', id);
    return { id, ...args, kind: 'text' };
  }

  private async definition(tx: Executor, id: string, actor: string) {
    const type = await this.objectType(tx, id);
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    const fields = (await sql<Field>`SELECT id, technical_name, labels FROM sys_fields
      WHERE object_type_id = ${id}::uuid ORDER BY id`.execute(tx)).rows;
    const columns = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${tableName(type)} ORDER BY ordinal_position`.execute(tx)).rows;
    return {
      id: type.id, workspaceId: type.workspace_id, technicalName: type.technical_name,
      labels: type.labels, label: localizedLabel(type.labels, user.language, type.default_language),
      fields: fields.map(f => ({ id: f.id, technicalName: f.technical_name, labels: f.labels,
        label: localizedLabel(f.labels, user.language, type.default_language) })),
      columns: columns.map(c => c.column_name),
    };
  }

  private async setLabels(tx: Executor, args: z.infer<typeof schemas.set_labels>, actor: string) {
    let type: ObjectType;
    let previous: Labels;
    if (args.kind === 'object_type') {
      type = await this.objectType(tx, args.id);
      previous = type.labels;
    } else {
      const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid`.execute(tx)).rows[0];
      if (!field) throw new AppError(404, 'Field not found');
      if (field.technical_name === 'keyword') throw new AppError(400, 'Shared Keyword labels are fixed');
      type = await this.objectType(tx, field.object_type_id);
      previous = field.labels;
    }
    // Compare jsonb values semantically; key order must not create false change events.
    const result = await sql`UPDATE ${sql.table(args.kind === 'object_type' ? 'sys_object_types' : 'sys_fields')}
      SET labels = ${JSON.stringify(args.labels)}::jsonb
      WHERE id = ${args.id}::uuid AND labels IS DISTINCT FROM ${JSON.stringify(args.labels)}::jsonb RETURNING id`.execute(tx);
    if (result.rows.length) {
      await this.journal(tx, actor, type.workspace_id, type.id, args.kind, args.id, v7(), 'labels', previous, args.labels,
        args.kind === 'field' ? args.id : null);
    }
    return { id: args.id, kind: args.kind, labels: args.labels };
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

  private async fields(tx: Executor, type: ObjectType, args: Record<string, string | null>) {
    const fields = (await sql<Field>`SELECT id, technical_name FROM sys_fields WHERE object_type_id = ${type.id}::uuid`.execute(tx)).rows;
    for (const name of Object.keys(args)) {
      if (name === 'keyword' || !fields.some(f => f.technical_name === name)) throw new AppError(400, 'Unknown or reserved record field');
    }
    return fields;
  }

  private async createRecord(tx: Executor, args: z.infer<typeof schemas.create_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    const id = v7();
    const data = { keyword: args.keyword, ...args.values };
    const columns = ['id', 'created_by', 'updated_by', ...Object.keys(data)];
    const params = [id, actor, actor, ...Object.values(data)];
    await sql`INSERT INTO ${sql.table(tableName(type))} (${sql.join(columns.map(n => sql.ref(n)))})
      VALUES (${sql.join(params)})`.execute(tx);
    const change = v7();
    for (const [key, value] of Object.entries(data)) await this.journal(tx, actor, type.workspace_id, type.id, 'record', id, change, key, null, value, fields.find(f => f.technical_name === key)!.id);
    return this.record(tx, type, id);
  }

  private async updateRecord(tx: Executor, args: z.infer<typeof schemas.update_record>, actor: string) {
    const type = await this.objectType(tx, args.objectTypeId);
    const fields = await this.fields(tx, type, args.values);
    const previous = await this.record(tx, type, args.recordId);
    if (previous.version !== args.version) throw new AppError(409, 'Record version conflict');
    const data: Record<string, string | null> = { ...args.values };
    if (args.keyword !== undefined) data.keyword = args.keyword;
    const changed = Object.entries(data).filter(([key, value]) => previous[key] !== value);
    if (!changed.length) return previous;
    const assignments = changed.map(([key, value]) => sql`${sql.ref(key)} = ${value}`);
    await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.join(assignments)},
      version = version + 1, updated_at = now(), updated_by = ${actor}
      WHERE id = ${args.recordId}::uuid AND version = ${args.version}`.execute(tx);
    const change = v7();
    for (const [key, value] of changed) await this.journal(tx, actor, type.workspace_id, type.id, 'record', args.recordId, change, key, previous[key], value, fields.find(f => f.technical_name === key)!.id);
    return this.record(tx, type, args.recordId);
  }
}
