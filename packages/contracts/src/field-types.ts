import { z } from 'zod';

export const customFieldKinds = ['text', 'multiline', 'integer', 'decimal', 'money', 'boolean', 'date', 'datetime', 'single_choice', 'multiple_choice', 'email', 'phone', 'url', 'reference'] as const;
export const customFieldKindSchema = z.enum(customFieldKinds);
export type CustomFieldKind = z.infer<typeof customFieldKindSchema>;
const translated = z.object({ de: z.string().trim().min(1).max(200).optional(), en: z.string().trim().min(1).max(200).optional() }).strict().refine(value => Object.keys(value).length > 0, 'A label is required');
export const fieldConfigSchema = z.object({
  scale: z.number().int().min(0).max(12).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  formatted: z.boolean().optional(),
  options: z.array(z.object({ id: z.uuid().toLowerCase(), labels: translated, active: z.boolean() }).strict()).max(300).optional(),
  referenceTarget: z.enum(['user', 'group', 'both']).optional(),
  multiple: z.boolean().optional(),
}).strict();
export type FieldConfig = z.infer<typeof fieldConfigSchema>;
export const referenceValueSchema = z.object({ kind: z.enum(['user', 'group']), id: z.uuid() }).strict();
export const moneyValueSchema = z.object({ amount: z.string().max(100), currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
export const fieldValueSchema = z.union([z.string().max(10000), z.boolean(), moneyValueSchema, referenceValueSchema, z.array(z.union([z.string().max(200), referenceValueSchema])).max(100), z.null()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;
export type ReferenceValue = z.infer<typeof referenceValueSchema>;
export type MoneyValue = z.infer<typeof moneyValueSchema>;
export interface FieldPrincipal { id: string; kind: 'user' | 'group'; name: string }
export function isCustomFieldKind(kind: string): kind is CustomFieldKind { return (customFieldKinds as readonly string[]).includes(kind); }
export function defaultFieldConfig(kind: CustomFieldKind): FieldConfig {
  switch (kind) {
    case 'decimal': return { scale: 2 };
    case 'money': return { scale: 2, currency: 'EUR' };
    case 'multiline': return { formatted: false };
    case 'single_choice': case 'multiple_choice': return { options: [] };
    case 'reference': return { referenceTarget: 'both', multiple: false };
    default: return {};
  }
}
