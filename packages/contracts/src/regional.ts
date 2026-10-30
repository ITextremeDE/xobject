import { z } from 'zod';
export const regionalLocales = ['de-DE', 'de-AT', 'de-CH', 'en-US', 'en-GB', 'en-CA', 'en-AU'] as const;
export const regionalSchema = z.object({
  locale: z.enum(regionalLocales),
  dateFormat: z.enum(['locale', 'iso', 'dmy', 'mdy']),
  hourCycle: z.enum(['locale', 'h12', 'h23']),
  numberFormat: z.enum(['locale', 'dot', 'comma']),
  weekStart: z.enum(['locale', 'monday', 'sunday']),
}).strict();
export type RegionalSettings = z.infer<typeof regionalSchema>;
export const personalRegionalSchema = z.object({
  locale: regionalSchema.shape.locale.nullable(), dateFormat: regionalSchema.shape.dateFormat.nullable(), hourCycle: regionalSchema.shape.hourCycle.nullable(), numberFormat: regionalSchema.shape.numberFormat.nullable(), weekStart: regionalSchema.shape.weekStart.nullable(),
}).strict();
export type PersonalRegionalSettings = z.infer<typeof personalRegionalSchema>;
export const defaultRegionalSettings: RegionalSettings = { locale: 'en-US', dateFormat: 'locale', hourCycle: 'locale', numberFormat: 'locale', weekStart: 'locale' };
export const inheritRegionalSettings: PersonalRegionalSettings = { locale: null, dateFormat: null, hourCycle: null, numberFormat: null, weekStart: null };
export function effectiveRegionalSettings(workspace: RegionalSettings = defaultRegionalSettings, personal?: PersonalRegionalSettings | null): RegionalSettings {
  return Object.fromEntries(Object.entries(workspace).map(([key, value]) => [key, personal?.[key as keyof RegionalSettings] ?? value])) as RegionalSettings;
}

export const normalizePersonalRegional = (value: PersonalRegionalSettings | null | undefined): PersonalRegionalSettings | null => !value || Object.values(value).every(item => item === null) ? null : value;
