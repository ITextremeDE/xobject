import { z } from 'zod';
import { customFieldKindSchema, fieldConfigSchema, fieldValueSchema, type CustomFieldKind, type FieldConfig, type FieldValue, type FieldPrincipal } from './field-types.js';
export * from './field-types.js';
import { classificationRulesSchema, classificationValuesSchema, type ClassificationConfig } from './classification.js';
export * from './classification.js';

const uuid = z.uuid();
const label = z.string().trim().min(1).max(200);
const language = z.enum(['de', 'en']);
const labels = z.object({ de: label.optional(), en: label.optional() }).strict()
  .refine(value => Object.keys(value).length > 0, 'At least one translated label is required');
const technicalName = z.string().regex(/^[a-z][a-z0-9_]*$/).max(63);
const standardField = z.enum(['type_status', 'category', 'keyword']);
const values = z.record(z.string(), fieldValueSchema).refine(
  (value) => Object.keys(value).length <= 100, 'At most 100 fields per write',
);
const definitionState = z.enum(['active', 'inactive', 'deleted']);
const workspaceRole = z.enum(['user', 'designer']);
export const schemas = {
  set_definition_state: z.object({ kind: z.enum(['object_type', 'field']), id: uuid, expectedState: z.enum(['active', 'inactive']), state: definitionState, confirm: z.boolean().default(false) }).strict(),
  get_definition_journal: z.object({ objectTypeId: uuid }).strict(),
  get_access_context: z.object({}).strict(),
  list_users: z.object({}).strict(),
  list_workspace_members: z.object({ workspaceId: uuid }).strict(),
  set_workspace_member: z.object({ workspaceId: uuid, userId: uuid, role: workspaceRole.nullable(), expectedRole: workspaceRole.nullable() }).strict(),
  create_workspace: z.object({ name: label, code: z.string().regex(/^[a-z][a-z0-9]*$/).max(61), defaultLanguage: language.default('en') }).strict(),
  create_group: z.object({ workspaceId: uuid, name: label }).strict(),
  list_field_principals: z.object({ workspaceId: uuid }).strict(),
  list_workspaces: z.object({}).strict(),
  search_workspace: z.object({ workspaceId: uuid, query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  list_object_types: z.object({ workspaceId: uuid, includeInactive: z.boolean().default(false), includeDeleted: z.boolean().default(false) }).strict(),
  list_records: z.object({ objectTypeId: uuid, query: z.string().max(200).default(''), sortBy: technicalName.default('updated_at'), sortDirection: z.enum(['asc', 'desc']).default('desc'), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  create_object_type: z.object({ workspaceId: uuid, technicalName, labels, standardFields: z.array(standardField).max(3).refine(items => new Set(items).size === items.length, 'Duplicate standard fields').default([]) }).strict(),
  add_standard_field: z.object({ objectTypeId: uuid, field: standardField }).strict(),
  create_field: z.object({ objectTypeId: uuid, technicalName, labels, kind: customFieldKindSchema.default('text'), config: fieldConfigSchema.optional(), required: z.boolean().default(false) }).strict(),
  get_object_type: z.object({ objectTypeId: uuid }).strict(),
  configure_field: z.object({ fieldId: uuid, labels: labels.optional(), kind: customFieldKindSchema.optional(), config: fieldConfigSchema.optional(), required: z.boolean() }).strict(),
  set_field_required: z.object({ fieldId: uuid, required: z.boolean() }).strict(),
  set_labels: z.object({ kind: z.enum(['object_type', 'field']), id: uuid, labels }).strict(),
  set_workspace_name: z.object({ workspaceId: uuid, name: label }).strict(),
  set_workspace_language: z.object({ workspaceId: uuid, language }).strict(),
  set_user_language: z.object({ language: language.nullable() }).strict(),
  configure_classification: z.object({ objectTypeId: uuid, version: z.number().int().positive(), config: classificationRulesSchema }).strict(),
  create_record: z.object({ objectTypeId: uuid, keyword: z.string().trim().max(200).optional(), values: values.default({}), classification: classificationValuesSchema.default({}) }).strict(),
  update_record: z.object({ objectTypeId: uuid, recordId: uuid, version: z.number().int().positive(), keyword: z.string().trim().max(200).optional(), values: values.default({}), classification: classificationValuesSchema.default({}) }).strict(),
  get_record: z.object({ objectTypeId: uuid, recordId: uuid }).strict(),
  get_journal: z.object({ objectTypeId: uuid, recordId: uuid }).strict(),
};
export type Operation = keyof typeof schemas;

export type Language = 'de' | 'en';
export type Labels = Record<string, string>;
export interface Workspace { id: string; code: string; name: string; default_language: Language; role: 'administrator' | 'designer' | 'user' }
export type DefinitionState = 'active' | 'inactive' | 'deleted';
export interface ObjectSummary { state?: DefinitionState; isProtected?: boolean; canDelete?: boolean; id: string; technicalName: string; labels: Labels; label: string }
export interface FieldDefinition extends ObjectSummary { kind: CustomFieldKind | 'type' | 'status' | 'category'; required: boolean; config: FieldConfig }
export interface ObjectDefinition extends ObjectSummary { workspaceId: string; classification: ClassificationConfig; fields: FieldDefinition[]; historicalFields?: FieldDefinition[]; columns: string[] }
export interface DataRecord { id: string; keyword: string; version: number; created_at: string; created_by: string; updated_at: string; updated_by: string; type: string | null; status: string | null; category: string[]; [field: string]: FieldValue | number }
export interface RecordPage { records: DataRecord[]; total: number; limit: number; offset: number }
export interface SearchRecord { id: string; keyword: string; objectTypeId: string; objectLabel: string }
export interface WorkspaceSearch { objectTypes: ObjectSummary[]; records: SearchRecord[]; hasMoreObjects: boolean; hasMoreRecords: boolean }
export interface JournalEntry { id: string; change_id: string; field_id: string | null; field_key: string; old_value: unknown; new_value: unknown; created_at: string; actor_id: string }
export interface AuthUser { id: string; name: string; email: string; language?: Language | null; isAdmin?: boolean }
export type Inputs = { [K in Operation]: z.input<(typeof schemas)[K]> };
export interface WorkspaceMember { id: string; name: string; email: string; role: 'administrator' | 'designer' | 'user' }
export interface UserSummary { id: string; name: string; email: string; isAdmin: boolean }
export interface Outputs {
  set_definition_state: { id: string; state: DefinitionState };
  get_definition_journal: JournalEntry[];
  get_access_context: { isAdmin: boolean };
  list_users: UserSummary[];
  list_workspace_members: WorkspaceMember[];
  set_workspace_member: { workspaceId: string; userId: string; role: 'user' | 'designer' | null };
  create_workspace: { id: string };
  create_group: { id: string };
  list_field_principals: FieldPrincipal[];
  list_workspaces: Workspace[];
  list_object_types: ObjectSummary[];
  search_workspace: WorkspaceSearch;
  list_records: RecordPage;
  create_object_type: { id: string };
  add_standard_field: ObjectDefinition;
  create_field: { id: string };
  get_object_type: ObjectDefinition;
  configure_field: ObjectDefinition;
  set_field_required: ObjectDefinition;
  set_labels: { id: string; kind: string; labels: Labels };
  set_workspace_name: { workspaceId: string; name: string };
  set_workspace_language: { workspaceId: string; defaultLanguage: Language };
  set_user_language: { language: Language | null };
  configure_classification: ObjectDefinition;
  create_record: DataRecord;
  update_record: DataRecord;
  get_record: DataRecord;
  get_journal: JournalEntry[];
}

const reservedStandardFieldNames = new Set(['keyword', 'stichwort', 'type', 'typ', 'status', 'category', 'kategorie']);
export function isReservedStandardFieldName(value: string) { return reservedStandardFieldNames.has(value.normalize('NFKC').trim().toLowerCase()); }
export function hasReservedStandardFieldLabel(labels: Record<string, string>) { return Object.values(labels).some(isReservedStandardFieldName); }
