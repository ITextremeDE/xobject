import { z } from 'zod';

/** Installed interface/definition languages. More packs will be added in a later change. */
export const languageCatalog = [{ code: 'de', nativeName: 'Deutsch', interfaceAvailable: true }, { code: 'en', nativeName: 'English', interfaceAvailable: true }] as const;
export const languageCodes = languageCatalog.map(item => item.code);
export const languageSchema = z.enum(languageCodes);
export type Language = z.infer<typeof languageSchema>;
export const languageListSchema = z.array(languageSchema).min(1).max(languageCodes.length).refine(items => new Set(items).size === items.length, 'Duplicate languages');
export const workspaceLanguageSchema = z.object({
  availableLanguages: languageListSchema,
  defaultLanguage: languageSchema,
  labelLanguages: languageListSchema,
}).strict().refine(value => value.availableLanguages.includes(value.defaultLanguage), 'Default language must be available');
export type WorkspaceLanguages = z.infer<typeof workspaceLanguageSchema>;
export const defaultWorkspaceLanguages: WorkspaceLanguages = { availableLanguages: [...languageCodes], defaultLanguage: 'en', labelLanguages: [...languageCodes] };
export function effectiveWorkspaceLanguage(preference: Language | null | undefined, available: readonly Language[], fallback: Language): Language {
  return preference && available.includes(preference) ? preference : fallback;
}
