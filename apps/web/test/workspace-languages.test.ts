import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWorkspaceLanguage, workspaceLanguageSchema, languageCatalog } from '@xobject/contracts';

test('unavailable personal languages fall back without changing the saved preference', () => {
  const preference = 'en';
  assert.equal(effectiveWorkspaceLanguage(preference, ['de'], 'de'), 'de');
  assert.equal(preference, 'en');
  assert.equal(effectiveWorkspaceLanguage(preference, ['de', 'en'], 'de'), 'en');
  assert.equal(effectiveWorkspaceLanguage(null, ['en'], 'en'), 'en');
});

test('only the installed German/English packs are configurable with independent nonempty label languages', () => {
  assert.deepEqual(languageCatalog.map(item => item.code), ['de', 'en']);
  assert.equal(workspaceLanguageSchema.safeParse({ availableLanguages: ['de'], defaultLanguage: 'de', labelLanguages: ['en'] }).success, true);
  for (const input of [{ availableLanguages: [], defaultLanguage: 'de', labelLanguages: ['en'] }, { availableLanguages: ['de'], defaultLanguage: 'en', labelLanguages: ['en'] }, { availableLanguages: ['de'], defaultLanguage: 'de', labelLanguages: [] }, { availableLanguages: ['fr'], defaultLanguage: 'fr', labelLanguages: ['de'] }]) assert.equal(workspaceLanguageSchema.safeParse(input).success, false);
});
