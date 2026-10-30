import { z } from 'zod';

const id = z.uuid().toLowerCase();
const labels = z.object({ de: z.string().trim().min(1).max(200).optional(), en: z.string().trim().min(1).max(200).optional() }).strict().refine(value => Object.keys(value).length > 0, 'A label is required');
const ids = z.array(id).max(100).refine(value => new Set(value).size === value.length, 'Duplicate choices');
export const classificationRulesSchema = z.object({
  type: z.object({ required: z.boolean(), defaultId: id.nullable() }).strict(),
  status: z.object({ required: z.boolean(), defaults: z.array(z.object({ typeId: id.nullable(), statusId: id }).strict()).max(100) }).strict(),
  category: z.object({ required: z.boolean(), multiple: z.boolean(), defaultIds: ids }).strict(),
  options: z.array(z.object({ id, kind: z.enum(['type', 'status', 'category']), labels, active: z.boolean(), typeId: id.nullable() }).strict()).max(300),
}).strict();
export const classificationValuesSchema = z.object({ type: id.nullable().optional(), status: id.nullable().optional(), category: ids.optional() }).strict();
export type ClassificationRules = z.infer<typeof classificationRulesSchema>;
export type ClassificationOption = ClassificationRules['options'][number] & { label?: string; canDelete?: boolean };
export type ClassificationConfig = Omit<ClassificationRules, 'options'> & { version: number; options: ClassificationOption[] };
export const emptyClassification = (): ClassificationConfig => ({ version: 1, type: { required: false, defaultId: null }, status: { required: false, defaults: [] }, category: { required: false, multiple: false, defaultIds: [] }, options: [] });

// Reorder within a field and, for Status, its Type scope. Other slots remain untouched.
export function moveClassificationOption(options: ClassificationRules['options'], id: string, targetId: string): ClassificationRules['options'] {
  const source = options.find(option => option.id === id);
  const target = options.find(option => option.id === targetId);
  if (!source || !target || source.kind !== target.kind || source.typeId !== target.typeId || id === targetId) return options;
  const siblings = options.filter(option => option.kind === source.kind && option.typeId === source.typeId);
  const from = siblings.findIndex(option => option.id === id);
  const to = siblings.findIndex(option => option.id === targetId);
  siblings.splice(to, 0, siblings.splice(from, 1)[0]!);
  let index = 0;
  return options.map(option => option.kind === source.kind && option.typeId === source.typeId ? siblings[index++]! : option);
}
