import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { sql } from 'kysely';
import type { CustomFieldKind, FieldConfig, FieldValue, ReferenceValue } from '@xobject/contracts';
import { defaultFieldConfig } from '@xobject/contracts';
import { AppError } from './errors.js';
import type { Executor } from './database.js';

export type TypedField = { id: string; technical_name: string; kind: string; required: boolean; config: FieldConfig };
const choiceKinds = new Set(['single_choice', 'multiple_choice']);
const currencies = new Set(Intl.supportedValuesOf('currency'));
const fail = (message: string): never => { throw new AppError(400, message); };
export const isEmptyFieldValue = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);

export function fieldConfig(kind: CustomFieldKind, input?: FieldConfig, previous?: FieldConfig): FieldConfig {
  const config = { ...defaultFieldConfig(kind), ...(input ?? {}) };
  const allowed = Object.keys(defaultFieldConfig(kind));
  if (Object.keys(config).some(key => !allowed.includes(key))) fail('Configuration does not match field type');
  if (kind === 'money' && !currencies.has(config.currency!)) fail('Invalid currency');
  if (config.options) {
    if (new Set(config.options.map(option => option.id)).size !== config.options.length) fail('Duplicate field option identities');
    for (const old of previous?.options ?? []) if (!config.options.some(option => option.id === old.id)) fail('Field options must be retained; deactivate instead of deleting');
  }
  return config;
}
export function fieldStorage(kind: string, config: FieldConfig) {
  switch (kind) {
    case 'integer': return sql`bigint`;
    case 'decimal': return sql`numeric(38, ${sql.lit(config.scale ?? 2)})`;
    case 'boolean': return sql`boolean`;
    case 'date': return sql`date`;
    case 'datetime': return sql`timestamptz`;
    case 'single_choice': return sql`uuid`;
    case 'multiple_choice': return sql`uuid[]`;
    case 'money': case 'reference': return sql`jsonb`;
    default: return sql`text`;
  }
}
export function storedParameter(field: Pick<TypedField, 'kind'>, value: unknown) {
  if (field.kind === 'money' || field.kind === 'reference') return sql`${value === null ? null : JSON.stringify(value)}::jsonb`;
  if (field.kind === 'multiple_choice' || field.kind === 'category') return sql`${value}::uuid[]`;
  return sql`${value}`;
}
function decimal(value: unknown, scale: number): string {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) return fail('Invalid decimal value');
  const negative = value.startsWith('-');
  const [integer, fractional = ''] = value.replace(/^-/, '').split('.');
  const whole = integer.replace(/^0+(?=\d)/, '');
  const fraction = fractional.replace(/0+$/, '');
  if (fraction.length > scale || whole.length > 38 - scale) return fail('Decimal exceeds configured scale or precision');
  return `${negative && (whole !== '0' || fraction) ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
export function normalizeFieldValue(field: TypedField, input: unknown, previous?: unknown): FieldValue {
  let value = input;
  if (value instanceof Date) value = value.toISOString();
  if (value === undefined || value === null || (value === '' && !['text', 'multiline'].includes(field.kind))) value = null;
  if (field.required && isEmptyFieldValue(value)) return fail('Required field value missing');
  if (value === null) return null;
  switch (field.kind) {
    case 'integer': {
      if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return fail('Invalid integer value');
      const integer = BigInt(value);
      if (integer < -9223372036854775808n || integer > 9223372036854775807n) return fail('Integer out of range');
      return integer.toString();
    }
    case 'decimal': return decimal(value, field.config.scale ?? 2);
    case 'money': {
      const money = value as { amount?: unknown; currency?: unknown };
      if (!money || Array.isArray(money) || typeof money.amount !== 'string' || typeof money.currency !== 'string' || !currencies.has(money.currency)) return fail('Invalid money value');
      return { amount: decimal(money.amount, field.config.scale ?? 2), currency: money.currency };
    }
    case 'boolean': if (typeof value !== 'boolean') return fail('Invalid Boolean value'); return value;
    case 'date': if (typeof value !== 'string' || !z.iso.date().safeParse(value).success) return fail('Invalid date value'); return value;
    case 'datetime': if (typeof value !== 'string' || !z.iso.datetime({ offset: true }).safeParse(value).success || !Number.isFinite(Date.parse(value)) || (value.match(/\.(\d+)/)?.[1].length ?? 0) > 3) return fail('Invalid timestamp value'); return new Date(value).toISOString();
    case 'single_choice': case 'multiple_choice': {
      const selected = field.kind === 'multiple_choice' ? value : [value];
      if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string' || !z.uuid().safeParse(id).success)) return fail('Invalid choice value');
      const ids = selected.map(id => String(id).toLowerCase());
      if (new Set(ids).size !== ids.length || ids.length > 100) return fail('Duplicate or excessive choice values');
      for (const id of ids) {
        const option = field.config.options?.find(option => option.id === id);
        const retained = Array.isArray(previous) ? previous.includes(id) : previous === id;
        if (!option || (!option.active && !retained)) return fail('Unknown or inactive field option');
      }
      return field.kind === 'multiple_choice' ? ids.sort() : ids[0];
    }
    case 'reference': {
      const selected = field.config.multiple ? value : [value];
      if (!Array.isArray(selected) || selected.length > 100) return fail('Invalid reference cardinality');
      const refs: ReferenceValue[] = selected.map(reference => {
        if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return fail('Invalid reference value');
        const { kind, id } = reference as ReferenceValue;
        if (!['user', 'group'].includes(kind) || !z.uuid().safeParse(id).success || (field.config.referenceTarget !== 'both' && kind !== field.config.referenceTarget)) return fail('Invalid reference target');
        return { kind, id: id.toLowerCase() };
      });
      const keys = refs.map(ref => `${ref.kind}:${ref.id}`);
      if (new Set(keys).size !== keys.length) return fail('Duplicate references');
      refs.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
      return field.config.multiple ? refs : refs[0];
    }
    default: {
      if (typeof value !== 'string' || value.length > 10000) return fail('Invalid text value');
      if (field.kind === 'email' && !z.email().safeParse(value).success) return fail('Invalid email value');
      if (field.kind === 'url') { try { const url = new URL(value); if (value !== value.trim() || !['https:', 'http:'].includes(url.protocol)) return fail('Invalid URL value'); } catch { return fail('Invalid URL value'); } }
      if (field.kind === 'phone') { const phone = value.startsWith('+') ? parsePhoneNumberFromString(value) : undefined; if (!phone?.isValid()) return fail('Invalid international phone value'); return phone.number; }
      return value;
    }
  }
}
export async function validateReferences(tx: Executor, field: TypedField, value: FieldValue, workspaceId: string, previous?: unknown) {
  if (field.kind !== 'reference' || value === null) return;
  const refs = (Array.isArray(value) ? value : [value]) as ReferenceValue[];
  for (const ref of refs) {
    const found = ref.kind === 'user'
      ? await sql`SELECT 1 FROM sys_users WHERE id = ${ref.id}`.execute(tx)
      : await sql<{ active: boolean }>`SELECT active FROM sys_groups WHERE id = ${ref.id}::uuid AND workspace_id = ${workspaceId}::uuid`.execute(tx);
    if (!found.rows.length) fail('Reference not found in allowed scope');
    const retained = (Array.isArray(previous) ? previous : previous ? [previous] : []).some(old => old && typeof old === 'object' && old.kind === ref.kind && old.id === ref.id);
    if (ref.kind === 'group' && !(found.rows[0] as { active: boolean }).active && !retained) fail('Group is inactive');
  }
}
export function convertFieldValue(previous: TypedField, next: TypedField, input: unknown): FieldValue {
  if (input === null || input === undefined) return normalizeFieldValue(next, null, input);
  if (Array.isArray(input) && !input.length) return normalizeFieldValue(next, next.kind === 'multiple_choice' || (next.kind === 'reference' && next.config.multiple) ? [] : null, input);
  if (input === '') return normalizeFieldValue(next, ['text', 'multiline'].includes(next.kind) ? '' : null, input);
  let value = normalizeFieldValue({ ...previous, required: false }, input, input);
  if (previous.kind === 'reference' || next.kind === 'reference') {
    if (previous.kind !== next.kind) return fail('Unsafe field conversion');
    if (previous.config.multiple && !next.config.multiple) { if (!Array.isArray(value) || value.length !== 1) return fail('Unsafe field conversion'); value = value[0]; }
    else if (!previous.config.multiple && next.config.multiple) value = [value as ReferenceValue];
  } else if (choiceKinds.has(previous.kind) || choiceKinds.has(next.kind)) {
    if (!choiceKinds.has(previous.kind) || !choiceKinds.has(next.kind)) return fail('Unsafe field conversion');
    if (previous.kind === 'multiple_choice' && next.kind === 'single_choice') { if (!Array.isArray(value) || value.length !== 1) return fail('Unsafe field conversion'); value = value[0]; }
    else if (previous.kind === 'single_choice' && next.kind === 'multiple_choice') value = [value as string];
  } else if (previous.kind !== next.kind) {
    if (previous.kind === 'money' || next.kind === 'money') return fail('Unsafe field conversion');
    if (next.kind === 'boolean' && (value === 'true' || value === 'false')) value = value === 'true';
    else if (next.kind === 'text' || next.kind === 'multiline') value = String(value);
    else if (previous.kind === 'boolean') value = String(value);
    if (previous.kind === 'date' && next.kind === 'datetime') value = `${value}T00:00:00.000Z`;
    if (previous.kind === 'datetime' && next.kind === 'date') { if (typeof value !== 'string' || !value.endsWith('T00:00:00.000Z')) return fail('Unsafe field conversion'); value = value.slice(0, 10); }
  }
  const normalized = normalizeFieldValue(next, value, value);
  // Scalar conversions must be reversible; do not strip significant text such as leading zeros.
  if (previous.kind !== next.kind && !choiceKinds.has(previous.kind) && previous.kind !== 'reference') {
    const original = normalizeFieldValue({ ...previous, required: false }, input, input);
    let reverse: unknown = normalized;
    if (previous.kind === 'boolean' && (reverse === 'true' || reverse === 'false')) reverse = reverse === 'true';
    if (['text', 'multiline'].includes(previous.kind)) reverse = String(reverse);
    if (previous.kind === 'date' && next.kind === 'datetime') reverse = String(reverse).slice(0, 10);
    if (previous.kind === 'datetime' && next.kind === 'date') reverse = `${reverse}T00:00:00.000Z`;
    if (JSON.stringify(normalizeFieldValue({ ...previous, required: false }, reverse, original)) !== JSON.stringify(original)) return fail('Unsafe field conversion');
  }
  return normalized;
}
