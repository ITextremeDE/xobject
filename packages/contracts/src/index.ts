import { z } from 'zod';

const uuid = z.uuid();
const label = z.string().trim().min(1).max(200);
const language = z.enum(['de', 'en']);
const labels = z.object({ de: label.optional(), en: label.optional() }).strict()
  .refine(value => Object.keys(value).length > 0, 'At least one translated label is required');
const technicalName = z.string().regex(/^[a-z][a-z0-9_]*$/).max(63);
const values = z.record(z.string(), z.string().max(10000).nullable()).refine(
  (value) => Object.keys(value).length <= 100, 'At most 100 fields per write',
);
export const schemas = {
  create_workspace: z.object({ name: label, code: z.string().regex(/^[a-z][a-z0-9]*$/).max(61), defaultLanguage: language.default('en') }).strict(),
  list_workspaces: z.object({}).strict(),
  search_workspace: z.object({ workspaceId: uuid, query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  list_object_types: z.object({ workspaceId: uuid }).strict(),
  list_records: z.object({ objectTypeId: uuid, query: z.string().max(200).default(''), sortBy: technicalName.default('updated_at'), sortDirection: z.enum(['asc', 'desc']).default('desc'), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  create_object_type: z.object({ workspaceId: uuid, technicalName, labels }).strict(),
  create_field: z.object({ objectTypeId: uuid, technicalName, labels }).strict(),
  get_object_type: z.object({ objectTypeId: uuid }).strict(),
  set_labels: z.object({ kind: z.enum(['object_type', 'field']), id: uuid, labels }).strict(),
  set_workspace_language: z.object({ workspaceId: uuid, language }).strict(),
  set_user_language: z.object({ language: language.nullable() }).strict(),
  create_record: z.object({ objectTypeId: uuid, keyword: label, values: values.default({}) }).strict(),
  update_record: z.object({ objectTypeId: uuid, recordId: uuid, version: z.number().int().positive(), keyword: label.optional(), values: values.default({}) }).strict(),
  get_record: z.object({ objectTypeId: uuid, recordId: uuid }).strict(),
  get_journal: z.object({ objectTypeId: uuid, recordId: uuid }).strict(),
};
export type Operation = keyof typeof schemas;

export type Language = 'de' | 'en';
export type Labels = Record<string, string>;
export interface Workspace { id: string; code: string; name: string; default_language: Language }
export interface ObjectSummary { id: string; technicalName: string; labels: Labels; label: string }
export interface FieldDefinition extends ObjectSummary {}
export interface ObjectDefinition extends ObjectSummary { workspaceId: string; fields: FieldDefinition[]; columns: string[] }
export interface DataRecord { id: string; keyword: string; version: number; created_at: string; created_by: string; updated_at: string; updated_by: string; [field: string]: string | number | null }
export interface RecordPage { records: DataRecord[]; total: number; limit: number; offset: number }
export interface SearchRecord { id: string; keyword: string; objectTypeId: string; objectLabel: string }
export interface WorkspaceSearch { objectTypes: ObjectSummary[]; records: SearchRecord[]; hasMoreObjects: boolean; hasMoreRecords: boolean }
export interface JournalEntry { id: string; change_id: string; field_id: string | null; field_key: string; old_value: unknown; new_value: unknown; created_at: string; actor_id: string }
export interface AuthUser { id: string; name: string; email: string; language?: Language | null }
export type Inputs = { [K in Operation]: z.input<(typeof schemas)[K]> };
export interface Outputs {
  create_workspace: { id: string };
  list_workspaces: Workspace[];
  list_object_types: ObjectSummary[];
  search_workspace: WorkspaceSearch;
  list_records: RecordPage;
  create_object_type: { id: string };
  create_field: { id: string };
  get_object_type: ObjectDefinition;
  set_labels: { id: string; kind: string; labels: Labels };
  set_workspace_language: { workspaceId: string; defaultLanguage: Language };
  set_user_language: { language: Language | null };
  create_record: DataRecord;
  update_record: DataRecord;
  get_record: DataRecord;
  get_journal: JournalEntry[];
}
