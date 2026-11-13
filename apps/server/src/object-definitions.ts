import {contactFields} from './contact-domain.js';
import {inheritedContactFields} from './contact-inheritance.js';
import {closeChoiceSelection} from '@xobject/contracts';
import {isActivityObject} from './activity.js';
import {workProfile,validateWork} from './work-domain.js';
import {incidentFields,relationshipFieldOwner,saveRelationshipField} from './relationship-fields.js';
import {contactCoreEntry} from '@xobject/contracts';
import {contactProfile} from './contact-domain.js';
import {normalizeInputRules,configureUniqueIndex,writeInputRules,uniqueIndexName,validateUniqueLength} from './field-input-rules.js';
import {emptyFieldInputRules} from '@xobject/contracts';
import {contentAccess} from './content-permissions.js';
import {formLayoutSchema,formLayoutElements,formEntryKey,formLayoutEntries,formRelationshipFields,resolveFormLayout} from '@xobject/contracts';
import {primaryChain} from './primary-chain.js';
import {applies,validateApplicability,applicabilityDependents} from './field-applicability.js';
import {installObjectIntegrity} from './storage-integrity.js';
import {relationshipTypes} from './relationship-types.js';
import {validateDefinitionLanguages} from './workspace-configuration.js';
import {effectiveWorkspaceLanguage,type Language} from '@xobject/contracts';
import {sql} from 'kysely';
import {v7} from 'uuid';
import type {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {fieldConfig,fieldStorage,normalizeFieldValue,validateReferences,convertFieldValue,storedParameter,isEmptyFieldValue} from './field-types.js';
import {AppError} from './errors.js';
import {addClassificationFields} from './database.js';
import {effectiveClassification,resolveChoices,validateChoices,validateRules,type Choices} from './classification.js';
import {schemas,hasReservedStandardFieldLabel,isReservedStandardFieldName,isCustomFieldKind,type FieldConfig,type FieldValue,type Inputs} from '@xobject/contracts';
import type {Executor} from './database.js';
import type {Labels,ObjectType,Field,DataRecord} from './domain-types.js';
import {checkName,tableName,localizedLabel} from './definition-metadata.js';
import type {JournalWriter} from './domain-types.js';

/** Definition writes share the caller's authorization, transaction and immutable journal. */
export class ObjectDefinitions {
  constructor(private journal:JournalWriter,private outputRecord:(record:DataRecord,fields:Field[])=>DataRecord){}
  async createObjectType(tx: Executor, args: z.infer<typeof schemas.create_object_type>, actor: string, supplied = false) {
    await checkName(tx, args.technicalName);
    if(!supplied&&(await sql`SELECT 1 FROM sys_modules m CROSS JOIN LATERAL jsonb_array_elements(m.objects) o WHERE o->>'technicalName'=${args.technicalName} LIMIT 1`.execute(tx)).rows.length)throw new AppError(400,'Technical name is reserved for a module object',{code:"moduleNameReserved"});
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

  async addStandardField(tx: Executor, type: ObjectType, kind: 'type_status' | 'category' | 'keyword' | 'tags', actor: string, change = v7(), keywordRequired = false) {
    this.requireActive(type);
    const names = kind === 'type_status' ? ['type', 'status'] : [kind];
    if ((await sql`SELECT 1 FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows.length) throw new AppError(409, 'Standard field already exists');
    if(kind==='tags'){
      if(keywordRequired&&(await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length)throw new AppError(400,'Existing records have empty required fields',{code:'requiredExisting'});
      await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN tags text[]`.execute(tx);
      await sql`INSERT INTO sys_fields(id,object_type_id,technical_name,labels,kind,required) VALUES(${v7()}::uuid,${type.id}::uuid,'tags','{"de":"Schlagworte","en":"Tags"}'::jsonb,'tags',${keywordRequired})`.execute(tx);
    } else if (kind === 'keyword') {
      if (keywordRequired && (await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length) throw new AppError(400,'Existing records have empty required fields',{code:"requiredExisting"});
      const labels = { de: 'Stichwort', en: 'Keyword' };
      await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN keyword text NOT NULL DEFAULT ''`.execute(tx);
      await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required) VALUES (${v7()}::uuid, ${type.id}::uuid, 'keyword', ${JSON.stringify(labels)}::jsonb, 'text', ${keywordRequired})`.execute(tx);
    } else await addClassificationFields(tx, type.id, tableName(type), names);
    const fields = (await sql<Field>`SELECT id, technical_name, labels, kind, required FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' AND technical_name = ANY(${names}::text[])`.execute(tx)).rows;
    if(kind==='tags')await this.placeTagsField(tx,type,fields[0].id,actor,change);
    for (const field of fields) for (const [key, value] of Object.entries({ technical_name: field.technical_name, labels: field.labels, kind: field.kind, required: field.required })) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, null, value, field.id);
  }

  private async placeTagsField(tx:Executor,type:ObjectType,fieldId:string,actor:string,change:string){
    const previous=(await this.objectType(tx,type.id)).form_layouts?.default;
    if(!previous)return;
    if(formLayoutEntries(previous).some(entry=>'fieldId'in entry&&entry.fieldId===fieldId))return;
    const classificationIds=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${type.id}::uuid AND technical_name IN ('type','status','category') AND state='active'`.execute(tx)).rows.map(f=>f.id);
    const next=structuredClone(previous),group=next.groups.find(g=>g.fields.some(e=>'fieldId'in e&&classificationIds.includes(e.fieldId)));
    if(group)group.fields.push({fieldId,width:'half'});else next.groups.push({id:v7(),labels:{en:'Classification',de:'Einordnung'},fields:[{fieldId,width:'half'}]});
    formLayoutSchema.parse(next);
    await sql`UPDATE sys_object_types SET form_layouts=jsonb_set(form_layouts,'{default}',${JSON.stringify(next)}::jsonb),version=version+1 WHERE id=${type.id}::uuid`.execute(tx);
    await this.journal(tx,actor,type.workspace_id,type.id,'object_type',type.id,change,'form_layout.default',previous,next);
  }

  async createField(tx: Executor, args: z.infer<typeof schemas.create_field>, actor: string) {
    await checkName(tx, args.technicalName);
    if(args.relationshipTypeId)return saveRelationshipField(tx,args,actor);
    if(!args.objectTypeId)throw new AppError(400,'Field owner is required');
    if (isReservedStandardFieldName(args.technicalName) || hasReservedStandardFieldLabel(args.labels)) throw new AppError(400, 'Reserved standard field name');
    const type = await this.objectType(tx, args.objectTypeId);
    this.requireActive(type);
    await validateApplicability(tx,type.id,'new',args.applicability);
    if(args.required){
      const existing=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
      const fields=(await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id=${type.id}::uuid AND state<>'deleted'`.execute(tx)).rows;
      if(existing.some(row=>applies({id:'new',technical_name:args.technicalName,applicability:args.applicability},fields,row)))throw new AppError(400,'Existing records have empty required fields',{code:"requiredExisting"});
    }
    const config = fieldConfig(args.kind, args.config);
    if (args.required && ['single_choice','multiple_choice','tree_choice'].includes(args.kind) && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    const id = v7();
    const inputRules=await normalizeInputRules(tx,{id,technical_name:args.technicalName,kind:args.kind,required:args.required,config},args.inputRules??emptyFieldInputRules(),type.workspace_id);
    await this.checkOptionIdentities(tx, id, config);
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind, required, config, applicability,input_rules)
      VALUES (${id}::uuid, ${type.id}::uuid, ${args.technicalName}, ${JSON.stringify(args.labels)}::jsonb, ${args.kind}, ${args.required}, ${JSON.stringify(config)}::jsonb, ${JSON.stringify(args.applicability??null)}::jsonb,${JSON.stringify(inputRules)}::jsonb)`.execute(tx);
    await sql`ALTER TABLE ${sql.table(tableName(type))} ADD COLUMN ${sql.ref(args.technicalName)} ${fieldStorage(args.kind, config)}`.execute(tx);
    await configureUniqueIndex(tx,tableName(type),{id,technical_name:args.technicalName,kind:args.kind,required:args.required,config,input_rules:inputRules});
    const change = v7();
    for(const key of ['description','helpText','defaultValue','unique'] as const)if(!isDeepStrictEqual(inputRules[key],emptyFieldInputRules()[key]))await this.journal(tx,actor,type.workspace_id,type.id,'field',id,change,`input.${key}`,emptyFieldInputRules()[key],inputRules[key],id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'technical_name', null, args.technicalName, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'labels', null, args.labels, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'kind', null, args.kind, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'config', null, config, id);
    await this.journal(tx, actor, type.workspace_id, type.id, 'field', id, change, 'required', null, args.required, id);
    if(args.applicability)await this.journal(tx,actor,type.workspace_id,type.id,'field',id,change,'applicability',null,args.applicability,id);
    if(args.kind==='tags')await this.placeTagsField(tx,type,id,actor,change);
    return { id, ...args, config,inputRules };
  }

  async usedClassificationIds(tx: Executor, type: ObjectType, fields: Pick<Field, 'technical_name'>[]) {
    const has = (name: string) => fields.some(field => field.technical_name === name);
    const values = (await sql<{ type: string | null; status: string | null }>`SELECT DISTINCT ${has('type') ? sql`type` : sql`NULL::uuid`} AS type, ${has('status') ? sql`status` : sql`NULL::uuid`} AS status FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    const history = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT DISTINCT old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' AND field_key IN ('type', 'status')`.execute(tx)).rows;
    return new Set([...values.flatMap(row => [row.type, row.status]), ...history.flatMap(row => [row.old_value, row.new_value])].filter((value): value is string => typeof value === 'string'));
  }

  async setFieldRequired(tx: Executor, args: Omit<{fieldId:string;version:number;required:boolean}, 'version'>, actor: string, changeId?: string): Promise<unknown> {
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

  async setLabels(tx: Executor, args: Omit<z.infer<typeof schemas.set_labels>, 'version'>, actor: string, changeId?: string) {
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
      if (['keyword', 'type', 'status', 'category','tags'].includes(field.technical_name)) throw new AppError(400, 'Shared field labels are fixed');
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

  async configureField(tx: Executor, args: Omit<z.infer<typeof schemas.configure_field>, 'version'>, actor: string, suppliedChangeId?: string): Promise<unknown> {
    const field = (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.fieldId}::uuid`.execute(tx)).rows[0];
    if (!field || field.state === 'deleted') throw new AppError(404, 'Field not found');
    if(await relationshipFieldOwner(tx,field.id))return saveRelationshipField(tx,args as Inputs['configure_field'],actor);
    const type = await this.objectType(tx, field.object_type_id);
    this.requireActive(type);
    const change = suppliedChangeId ?? v7();
    if(field.value_mode==='derived'&&(args.required!==field.required||args.kind&&args.kind!==field.kind||args.config&&!isDeepStrictEqual(args.config,field.config)||args.inputRules&&(args.inputRules.defaultValue!==null||args.inputRules.unique)))throw new AppError(403,'Derived field definition is protected');
    if(args.applicability!==undefined&&['keyword','type','status','category','tags'].includes(field.technical_name))throw new AppError(400,'Standard fields cannot have applicability rules');
    if (['keyword', 'type', 'status', 'category','tags'].includes(field.technical_name)) {
      if ((args.kind && args.kind !== field.kind) || args.config) throw new AppError(400, 'Shared field type is fixed');
      if (args.labels) await this.setLabels(tx, { kind: 'field', id: field.id, labels: args.labels }, actor, change);
      if (!['keyword','tags'].includes(field.technical_name)) {
        const rules=await normalizeInputRules(tx,field,args.inputRules??field.input_rules,type.workspace_id);
        const changed=await writeInputRules(tx,field,rules,(key,before,after)=>this.journal(tx,actor,type.workspace_id,type.id,'field',field.id,change,key,before,after,field.id));
        if(changed&&field.required===args.required)await sql`UPDATE sys_fields SET version=version+1 WHERE id=${field.id}::uuid`.execute(tx);
        return this.setFieldRequired(tx, { fieldId: field.id, required: args.required }, actor, change);
      }
    }
    const kind = args.kind ?? field.kind;
    if (!isCustomFieldKind(kind)) throw new AppError(400, 'Unsupported field type');
    const config = fieldConfig(kind, args.config ?? (kind === field.kind ? field.config : undefined), (['single_choice', 'multiple_choice','tree_choice'].includes(kind) && ['single_choice', 'multiple_choice','tree_choice'].includes(field.kind))||(kind==='structured'&&field.kind==='structured'&&(args.config?.schema??field.config.schema)===field.config.schema) ? field.config : undefined);
    if(field.is_protected&&((kind!==field.kind)||!isDeepStrictEqual({...config,options:undefined},{...field.config,options:undefined})))throw new AppError(403,'Module definition is protected');
    if(field.is_protected&&field.config.fixedOptions&&field.required&&!args.required)throw new AppError(403,'Contact kind is required');
    if (args.required && ['single_choice','multiple_choice','tree_choice'].includes(kind) && config.options && !config.options.some(option => option.active)) throw new AppError(400, 'Required choice needs active options');
    await this.checkOptionIdentities(tx, field.id, config);
    const applicability=args.applicability===undefined?field.applicability??null:args.applicability;
    if(field.is_protected&&!isDeepStrictEqual(field.applicability??null,applicability))throw new AppError(403,'Module definition is protected');
    await validateApplicability(tx,type.id,field.id,applicability);
    if(kind!=='single_choice'&&(await applicabilityDependents(tx,field.id)).length)throw new AppError(409,'Field is an applicability controller',{code:"fieldApplicabilityDependency"});
    if((await sql<{applicability:NonNullable<Field['applicability']>}>`SELECT applicability FROM sys_fields WHERE state<>'deleted' AND applicability->>'fieldId'=${field.id} UNION ALL SELECT left_applicability AS applicability FROM sys_relationship_types WHERE left_applicability->>'fieldId'=${field.id} UNION ALL SELECT right_applicability AS applicability FROM sys_relationship_types WHERE right_applicability->>'fieldId'=${field.id}`.execute(tx)).rows.some(dependent=>dependent.applicability.optionIds.some(id=>!config.options?.some(option=>option.id===id))))throw new AppError(409,'Option is referenced by field applicability',{code:"fieldApplicabilityDependency"});
    const rulesInput=args.inputRules??{...field.input_rules,defaultValue:field.kind!==kind&&field.input_rules.defaultValue!==null?convertFieldValue({...field,required:false},{...field,kind,config,required:false},field.input_rules.defaultValue):field.input_rules.defaultValue};
    const inputRules=await normalizeInputRules(tx,{...field,kind,config},rulesInput,type.workspace_id);
    const rulesChanged=!isDeepStrictEqual(field.input_rules,inputRules);
    const next: Field = { ...field, kind, config, required: args.required, applicability,input_rules:inputRules };
    const modelChanged = field.kind !== kind || !isDeepStrictEqual(field.config, config) || field.required !== args.required || !isDeepStrictEqual(field.applicability??null,applicability);
    const rows = modelChanged||(!field.input_rules.unique&&inputRules.unique) ? (await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows : [];
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
        if (args.required && isEmptyFieldValue(row[field.technical_name])) throw new AppError(400,'Existing records have empty required fields',{code:"requiredExisting"});
        if (error instanceof AppError && error.status === 400) throw new AppError(400,'Unsafe field conversion',{code:"unsafeFieldConversion"});
        throw error;
      }
      await validateReferences(tx, next, value, type.workspace_id, row[field.technical_name]);
      validateUniqueLength(next,value,inputRules.unique);
      converted.push({ row, value });
    }
    const representationChanged = field.kind !== kind || (kind === 'decimal' && field.config.scale !== config.scale);
    if (representationChanged&&field.input_rules.unique)await sql`DROP INDEX IF EXISTS ${sql.ref(uniqueIndexName(field.id))}`.execute(tx);
    if (representationChanged) {
      // Preflight completed above. Convert via a temporary text representation in the same transaction.
      await sql`ALTER TABLE ${sql.table(tableName(type))} ALTER COLUMN ${sql.ref(field.technical_name)} TYPE text USING ${sql.ref(field.technical_name)}::text`.execute(tx);
      for (const { row, value } of converted) await sql`UPDATE ${sql.table(tableName(type))} SET ${sql.ref(field.technical_name)} = ${value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value)} WHERE id = ${row.id}::uuid`.execute(tx);
      if (kind === 'multiple_choice'||kind==='tree_choice') {
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
    await sql`UPDATE sys_fields SET kind = ${kind}, config = ${JSON.stringify(config)}::jsonb, required = ${args.required}, applicability=${JSON.stringify(applicability)}::jsonb, version = version + ${modelChanged||rulesChanged ? 1 : 0} WHERE id = ${field.id}::uuid`.execute(tx);
    if(rulesChanged)await writeInputRules(tx,field,inputRules,(key,before,after)=>this.journal(tx,actor,type.workspace_id,type.id,'field',field.id,change,key,before,after,field.id));
    if(representationChanged||field.input_rules.unique!==inputRules.unique)await configureUniqueIndex(tx,tableName(type),next);
    for (const key of ['kind', 'config', 'required', 'applicability'] as const) if (!isDeepStrictEqual(field[key], next[key])) await this.journal(tx, actor, type.workspace_id, type.id, 'field', field.id, change, key, field[key], next[key], field.id);
    return this.definition(tx, type.id, actor);
  }

  requireActive(type: ObjectType) {
    if (type.state !== 'active') throw new AppError(400, 'Object type is inactive');
  }

  sameFieldGroup(left: Field, right: Field) {
    return left.id === right.id || (['type', 'status'].includes(left.technical_name) && ['type', 'status'].includes(right.technical_name));
  }

  async objectUsed(tx: Executor, type: ObjectType) {
    if ((await sql`SELECT 1 FROM ${sql.table(tableName(type))} LIMIT 1`.execute(tx)).rows.length) return true;
    return Boolean((await sql`SELECT 1 FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' LIMIT 1`.execute(tx)).rows.length);
  }

  async fieldGroupUsed(tx: Executor, type: ObjectType, fields: Field[]) {
    if (!fields.length) return false;
    const names = fields.map(field => field.technical_name);
    const rows = (await sql<Record<string, unknown>>`SELECT ${sql.join(names.map(name => sql.ref(name)))} FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    if (rows.some(row => Object.values(row).some(value => !isEmptyFieldValue(value)))) return true;
    const history = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'record' AND field_id = ANY(${fields.map(field => field.id)}::uuid[])`.execute(tx)).rows;
    return history.some(entry => !isEmptyFieldValue(entry.old_value) || !isEmptyFieldValue(entry.new_value));
  }

  async validateActiveFields(tx: Executor, type: ObjectType, fields: Field[]) {
    const rows = (await sql<DataRecord>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    for (const raw of rows) {
      const record = this.outputRecord(raw, fields);
      for (const field of fields.filter(field => field.state === 'active' && field.value_mode!=='derived' && isCustomFieldKind(field.kind))) {
        const applicable=applies(field,fields,record);
        if(!applicable&&!isEmptyFieldValue(record[field.technical_name]))throw new AppError(400,`Field not applicable: ${field.technical_name}`);
        const value = normalizeFieldValue({...field,required:field.required&&applicable}, record[field.technical_name], record[field.technical_name]);
        await validateReferences(tx, field, value, type.workspace_id, record[field.technical_name]);
      }
      const choices: Choices = { type: (record.type??null) as string|null, status: (record.status??null) as string|null, category: (record.category??[]) as string[] };
      validateChoices(effectiveClassification(type.classification, fields), choices, choices);
    }
  }

  async setDefinitionState(tx: Executor, args: z.infer<typeof schemas.set_definition_state>, actor: string) {
    const field = args.kind === 'field' ? (await sql<Field & { object_type_id: string }>`SELECT * FROM sys_fields WHERE id = ${args.id}::uuid AND state <> 'deleted'`.execute(tx)).rows[0] : undefined;
    if (args.kind === 'field' && !field) throw new AppError(404, 'Field not found');
    const type = await this.objectType(tx, field?.object_type_id ?? args.id);
    const all = (await sql<Field>`SELECT * FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted' ORDER BY id`.execute(tx)).rows;
    if(!field&&args.state!=='active'&&(await sql`SELECT 1 FROM sys_module_object_bindings WHERE object_type_id=${type.id}::uuid LIMIT 1`.execute(tx)).rows.length)throw new AppError(409,'Object type is used by the Primary chain',{code:"primaryChainObjectUsed"});
    if(field&&args.state!=='active'&&(await applicabilityDependents(tx,field.id)).length)throw new AppError(409,'Field is an applicability controller',{code:"fieldApplicabilityDependency"});
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

  async configureClassification(tx: Executor, args: z.infer<typeof schemas.configure_classification>, actor: string, changeId?: string, removable = new Set<string>()) {
    const type = await this.objectType(tx, args.objectTypeId);
    changeId ??= v7();
    const ruleFields=new Set<string>();
    for(const update of args.fieldInputRules??[]){
      const field=(await sql<Field>`SELECT * FROM sys_fields WHERE id=${update.fieldId}::uuid AND object_type_id=${type.id}::uuid AND technical_name IN ('type','status','category') AND state='active'`.execute(tx)).rows[0];
      if(!field||ruleFields.has(field.id))throw new AppError(400,'Invalid classification field input rules');
      if(field.version!==update.version)throw new AppError(409,'Definition version conflict',{code:"version_conflict"});
      await validateDefinitionLanguages(tx,'configure_field',{fieldId:field.id,inputRules:update.inputRules});
      const rules=await normalizeInputRules(tx,field,update.inputRules,type.workspace_id);
      if(await writeInputRules(tx,field,rules,(key,before,after)=>this.journal(tx,actor,type.workspace_id,type.id,'classification_field',field.id,changeId!,key,before,after,field.id))){ruleFields.add(field.id);await sql`UPDATE sys_fields SET version=version+1 WHERE id=${field.id}::uuid`.execute(tx);}
    }
    this.requireActive(type);
    if (type.classification.version !== args.version) throw new AppError(409,'Classification version conflict',{code:"version_conflict"});
    if(args.config.category.tree){try{args.config.category.defaultIds=closeChoiceSelection(args.config.options.filter(option=>option.kind==='category'),args.config.category.defaultIds);}catch(error){throw new AppError(400,(error as Error).message);}}
    if(args.config.category.defaultIds.length>100)throw new AppError(400,'At most 100 default choices including ancestors');
    args.config.category.defaultIds.sort();
    args.config.status.defaults.sort((left, right) => (left.typeId ?? '').localeCompare(right.typeId ?? ''));
    const available = (await sql<Field>`SELECT value_mode,applicability, id, technical_name, kind, required, config,input_rules, state, is_protected FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
    for (const kind of ['type', 'status', 'category'] as const) if (!available.some(field => field.technical_name === kind) && (!isDeepStrictEqual(args.config[kind], type.classification[kind]) || args.config.options.some(option => option.kind === kind))) throw new AppError(400, 'Standard field is not installed');
    const removed = type.classification.options.filter(old => !args.config.options.some(option => option.id === old.id));
    if (removed.length) {
      const used = await this.usedClassificationIds(tx, type, available);
      if (removed.some(option => used.has(option.id))) throw new AppError(400,'Classification option is in use',{code:"choiceInUse"});
    }
    validateRules(args.config, type.classification, removable);
    const newIds = args.config.options.filter(option => !type.classification.options.some(old => old.id === option.id)).map(option => option.id);
    if (newIds.length && (await sql`SELECT 1 FROM sys_object_types, jsonb_array_elements(classification->'options') AS existing
      WHERE sys_object_types.id <> ${type.id}::uuid AND existing->>'id' = ANY(${newIds}::text[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity already belongs to another object type');
    if (newIds.length && (await sql`SELECT 1 FROM sys_journal WHERE entity_kind = 'classification_option' AND entity_id = ANY(${newIds}::uuid[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity was already used');
    const records = (await sql<Choices&{id:string}>`SELECT id, ${available.some(field => field.technical_name === 'type') ? sql`type` : sql`NULL::uuid`} AS type, ${available.some(field => field.technical_name === 'status') ? sql`status` : sql`NULL::uuid`} AS status, ${available.some(field => field.technical_name === 'category') ? sql`category` : sql`'{}'::uuid[]`} AS category FROM ${sql.table(tableName(type))}`.execute(tx)).rows;
    for (const record of records){
      const next=resolveChoices(effectiveClassification(args.config,available),record,record);
      if(!isDeepStrictEqual(next.category,record.category)){
        await sql`UPDATE ${sql.table(tableName(type))} SET category=${next.category}::uuid[],version=version+1,updated_at=now(),updated_by=${actor} WHERE id=${record.id}::uuid`.execute(tx);
        await this.journal(tx,actor,type.workspace_id,type.id,'record',record.id,changeId,'category',record.category,next.category,available.find(field=>field.technical_name==='category')!.id);
      }
    }
    if(await workProfile(tx,type.id)){const rows=(await sql<Record<string,unknown>>`SELECT * FROM ${sql.table(tableName(type))}`.execute(tx)).rows;for(const row of rows)await validateWork(tx,type.id,row,args.config);}
    const { version, ...previous } = type.classification;
    if (!isDeepStrictEqual(previous, args.config)) {
      const config = { ...args.config, version: version + 1 };
      await sql`UPDATE sys_object_types SET classification = ${JSON.stringify(config)}::jsonb WHERE id = ${type.id}::uuid`.execute(tx);
      const fields = (await sql<Field>`SELECT id, technical_name FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND state <> 'deleted'`.execute(tx)).rows;
      const change = changeId ?? v7();
      for (const kind of ['type', 'status', 'category'] as const) {
        const field = fields.find(field => field.technical_name === kind);
        if (!field) continue;
        if (!ruleFields.has(field.id)&&(!isDeepStrictEqual(previous[kind],args.config[kind]) || !isDeepStrictEqual(previous.options.filter(o=>o.kind===kind),args.config.options.filter(o=>o.kind===kind)))) await sql`UPDATE sys_fields SET version=version+1 WHERE id=${field.id}::uuid`.execute(tx);
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
        for (const key of ['kind', 'labels', 'active', 'typeId','meaning','parentId'] as const) {
          if (!isDeepStrictEqual(old?.[key], option[key])) await this.journal(tx, actor, type.workspace_id, type.id, 'classification_option', option.id, change, key, old?.[key] ?? null, option[key], fieldId);
        }
      }
    }
    return this.definition(tx, type.id, actor);
  }

  async checkOptionIdentities(tx: Executor, fieldId: string, config: FieldConfig) {
    const ids = config.options?.map(option => option.id) ?? [];
    if (ids.length && (await sql`SELECT 1 FROM sys_fields, jsonb_array_elements(COALESCE(config->'options', '[]'::jsonb)) AS option WHERE sys_fields.id <> ${fieldId}::uuid AND option->>'id' = ANY(${ids}::text[]) LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Option identity belongs to another field');
  }

  async objectType(tx: Executor, id: string, includeDeleted = false) {
    const result = await sql<ObjectType>`SELECT o.*, w.code, w.default_language, w.available_languages,w.time_zone FROM sys_object_types o
      JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ${id}::uuid`.execute(tx);
    if (!result.rows[0] || (!includeDeleted && result.rows[0].state === 'deleted')) throw new AppError(404, 'Object type not found');
    return result.rows[0];
  }

  async definition(tx: Executor, id: string, actor: string) {
    const type = await this.objectType(tx, id, true);
    const user = (await sql<{ language: string | null }>`SELECT language FROM sys_users WHERE id = ${actor}`.execute(tx)).rows[0];
    const fields = (await sql<Field>`SELECT value_mode,applicability, version, id, technical_name, labels, kind, required, config,input_rules, state, is_protected FROM sys_fields
      WHERE object_type_id = ${id}::uuid ORDER BY id`.execute(tx)).rows;
    const contactMetadata=await contactFields(tx,id);
    for(const field of fields){const effective=contactMetadata.find(f=>f.id===field.id);if(effective&&field.value_mode==='derived'&&effective.config.schema)field.config=effective.config;}
    const columns = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${tableName(type)} AND ${type.state !== 'deleted'} ORDER BY ordinal_position`.execute(tx)).rows;
    const used = type.state !== 'deleted' && type.classification.options.some(option => option.kind !== 'category') ? await this.usedClassificationIds(tx, type, fields) : new Set<string>();
    return {
      relationshipFields:(await incidentFields(tx,type.id)).filter(f=>f.state!=='deleted').map(f=>({id:f.id,relationshipTypeId:f.relationship_type_id,technicalName:f.technical_name,label:localizedLabel(f.labels,user.language,type.default_language),labels:f.labels,kind:f.kind,config:f.config,required:f.required,version:f.version,state:f.state,isProtected:f.is_protected})),moduleFieldIds:Object.fromEntries((await sql<{module_key:string;fields:string[]}>`SELECT module_key,array_agg(field_id::text) AS fields FROM sys_module_field_contributions WHERE object_type_id=${type.id}::uuid GROUP BY module_key`.execute(tx)).rows.map(m=>[m.module_key,m.fields])),moduleKeys:(await sql<{module_key:string}>`SELECT c.module_key FROM sys_module_contributions c JOIN sys_workspace_modules m ON m.workspace_id=c.workspace_id AND m.module_key=c.module_key WHERE c.object_type_id=${type.id}::uuid AND m.enabled`.execute(tx)).rows.map(m=>m.module_key),workProfile:await workProfile(tx,type.id),contactProfile:await contactProfile(tx,type.id),numbering:type.numbering,permissionsVersion:type.permissions_version,sensitive:(await contentAccess().policy(type.id)).sensitive,permissions:(await contentAccess().policy(type.id)).capabilities,formRelationships:formRelationshipFields(await relationshipTypes(tx,type.workspace_id),type.id,await primaryChain(tx,type.workspace_id),type.primary_requirements), formLayouts:type.form_layouts??{}, version: type.version, id: type.id, state: type.state, isProtected: type.is_protected || fields.some(field => field.state !== 'deleted' && field.is_protected&&!['access_principals','record_number'].includes(field.technical_name)), canDelete: type.state !== 'deleted' && !type.is_protected && !fields.some(field => field.state !== 'deleted' && field.is_protected&&!['access_principals','record_number'].includes(field.technical_name)) && !(await this.objectUsed(tx, type)) && !(await sql`SELECT 1 FROM sys_relationship_type_pairs WHERE left_object_type_id=${type.id}::uuid OR right_object_type_id=${type.id}::uuid LIMIT 1`.execute(tx)).rows.length, workspaceId: type.workspace_id, technicalName: type.technical_name,
      primaryRequirements:type.primary_requirements,primaryChain:await primaryChain(tx,type.workspace_id),
      activity:await isActivityObject(tx,type.id),
      classification: { ...type.classification, options: type.classification.options.map(option => ({ ...option, label: localizedLabel(option.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language), canDelete: option.kind !== 'category' && !used.has(option.id) })) },
      labels: type.labels, label: localizedLabel(type.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language),
      fields: await Promise.all(fields.filter(f => f.state !== 'deleted'&&(f.technical_name!=='access_principals'||(type as ObjectType & {is_sensitive:boolean}).is_sensitive)).map(async f => ({ isDerived:f.value_mode==='derived',fieldPermissions:f.value_mode==='derived'?{...(await contentAccess().policy(type.id)).field(f.id),edit:false,create:inheritedContactFields.includes(f.technical_name as typeof inheritedContactFields[number])&&(await contentAccess().policy(type.id)).creationField(f.id)}:f.technical_name==='access_principals'?{read:(await contentAccess().policy(type.id)).capabilities.read,edit:(await contentAccess().policy(type.id)).capabilities.full}:{...(await contentAccess().policy(type.id)).field(f.id),create:(await contentAccess().policy(type.id)).creationField(f.id)},description:localizedLabel(f.input_rules.description,effectiveWorkspaceLanguage(user.language as Language,type.available_languages,type.default_language as Language),type.default_language)??'',helpText:localizedLabel(f.input_rules.helpText,effectiveWorkspaceLanguage(user.language as Language,type.available_languages,type.default_language as Language),type.default_language)??'',inputRules:f.input_rules,applicability: f.applicability??null, version: f.version, id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, isProtected: f.is_protected || fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected),
        canDelete: !fields.some(item => item.state !== 'deleted' && this.sameFieldGroup(f, item) && item.is_protected) && !(await this.fieldGroupUsed(tx, type, fields.filter(item => item.state !== 'deleted' && this.sameFieldGroup(f, item)))),
        required: isCustomFieldKind(f.kind) ? f.required : type.classification[f.kind as 'type' | 'status' | 'category'].required, labels: f.labels, label: localizedLabel(f.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language) }))),
      historicalFields: fields.filter(f => f.state === 'deleted').map(f => ({ description:localizedLabel(f.input_rules.description,effectiveWorkspaceLanguage(user.language as Language,type.available_languages,type.default_language as Language),type.default_language)??'',helpText:localizedLabel(f.input_rules.helpText,effectiveWorkspaceLanguage(user.language as Language,type.available_languages,type.default_language as Language),type.default_language)??'',inputRules:f.input_rules,applicability: f.applicability??null, version: f.version, id: f.id, technicalName: f.technical_name, kind: f.kind, config: f.config, state: f.state, required: f.required, labels: f.labels, label: localizedLabel(f.labels, effectiveWorkspaceLanguage(user.language as Language, type.available_languages, type.default_language as Language), type.default_language) })),
      columns: columns.map(c => c.column_name),
    };
  }

  async configureFormLayout(tx:Executor,args:z.infer<typeof schemas.configure_form_layout>,actor:string){
    const type=await this.objectType(tx,args.objectTypeId);this.requireActive(type);
    if(type.version!==args.version)throw new AppError(409,'Object version conflict',{code:"version_conflict"});
    if(args.layout){
      const own=(await sql<{id:string;technical_name:string;kind:string}>`SELECT id,technical_name,kind FROM sys_fields WHERE object_type_id=${type.id}::uuid`.execute(tx)).rows.map(field=>({...field,technicalName:field.technical_name}));
      const relationships=formRelationshipFields(await relationshipTypes(tx,type.workspace_id),type.id,await primaryChain(tx,type.workspace_id),type.primary_requirements);
      const elements=formLayoutElements(own,relationships);
      const profile=await contactProfile(tx,type.id);
      if(profile&&formLayoutEntries(args.layout).some(entry=>contactCoreEntry(profile,own,entry)))throw new AppError(400,'Contact core layout is supplied by the module; only extensions are configurable');
      for(const entry of formLayoutEntries(args.layout)){
        const element=elements.find(element=>element.key===formEntryKey(entry));
        if(!element){
          const previous=(type.form_layouts?.default?formLayoutEntries(type.form_layouts.default):[]).find(old=>formEntryKey(old)===formEntryKey(entry));
          if(previous&&isDeepStrictEqual(previous,entry))continue;
          throw new AppError(400,'Layout elements must belong to this object and use available relationship sides');
        }
        if(!element.single&&entry.width!=='full')throw new AppError(400,'Relationship tables and Primary chain require full width');
        if(!('fieldId' in entry)&&element.required&&entry.visible===false)throw new AppError(400,'Required relationships must remain visible');
      }
      for(const group of args.layout.groups)if(group.relationshipList&&group.fields.some(entry=>{const element=elements.find(e=>e.key===formEntryKey(entry));return !element?.relationship||element.single||element.relationship.definition.kind==='primary';}))throw new AppError(400,'Combined lists require to-many non-Primary relationship sides');
      const languages=(await sql<{label_languages:string[]}>`SELECT label_languages FROM sys_workspaces WHERE id=${type.workspace_id}::uuid`.execute(tx)).rows[0].label_languages;
      const old=type.form_layouts?.default;
      for(const group of args.layout.groups){
        const proposed:Record<string,string|undefined>=group.labels;
        const previous:Record<string,string|undefined>=old?.groups.find(item=>item.id===group.id)?.labels??(!old?{en:'General',de:'Allgemein'}:{});
        for(const code of new Set([...Object.keys(group.labels),...Object.keys(previous)]))if(!languages.includes(code)&&proposed[code]!==previous[code])throw new AppError(400,'Definition language is unavailable',{code:"definitionLanguageUnavailable"});
      }
    }
    const before=type.form_layouts?.default??null,next={...type.form_layouts};
    if(args.layout)next.default=args.layout;else delete next.default;
    if(!isDeepStrictEqual(before,args.layout)){
      await sql`UPDATE sys_object_types SET form_layouts=${JSON.stringify(next)}::jsonb,version=version+1 WHERE id=${type.id}::uuid`.execute(tx);
      await this.journal(tx,actor,type.workspace_id,type.id,'object_type',type.id,v7(),'form_layout.default',before,args.layout);
    }
    return this.definition(tx,type.id,actor);
  }


}
