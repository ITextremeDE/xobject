import { test } from 'node:test';
import assert from 'node:assert/strict';
import i18next from 'i18next';
import { journalEntryTitle, journalPropertyLabel, journalEntityLabel } from '../src/lib/journal-presentation.js';

test('journal titles distinguish group changes, workspace removals and role changes', async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: { journalGroupMemberAdded: 'Group member added', journalGroupMemberRemoved: 'Group member removed', journalWorkspaceMemberRemoved: 'Workspace member removed', journalMemberRoleChanged: 'Role changed' } } } });
  const t = i18n.t.bind(i18n);
  const base = { field_key: 'member:retained-identity', entity_kind: 'group', old_value: false, new_value: true };
  assert.equal(journalEntryTitle(base, t), 'Group member added');
  assert.equal(journalEntryTitle({ ...base, old_value: true, new_value: false }, t), 'Group member removed');
  assert.equal(journalEntryTitle({ ...base, entity_kind: 'workspace_member', old_value: 'designer', new_value: null }, t), 'Workspace member removed');
  assert.equal(journalEntryTitle({ ...base, entity_kind: 'workspace_member', old_value: 'user', new_value: 'designer' }, t), 'Role changed');
});
test('journal presentation retains readable fallbacks for unknown and technical properties', async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: { timeZone: 'Time zone', journalOtherProperty: 'Property changed', journalOtherEntity: 'Other entity', theme: 'Appearance', dateFormat: 'Date format' } } } });
  const t = i18n.t.bind(i18n);
  assert.equal(journalPropertyLabel('time_zone', t), 'Time zone');
  assert.equal(journalPropertyLabel('regional.dateFormat', t), 'Date format');
  assert.equal(journalPropertyLabel('new_custom_field', t), 'Property changed');
  assert.equal(journalPropertyLabel('appearance.futureToken', t), 'Appearance');
  assert.equal(journalEntityLabel('future_kind', t), 'Other entity');
});


test('record journal titles prefer current field labels and retain a meaningful technical fallback', async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en' });
  const entry = { entity_kind: 'record', field_key: 'registration_number', old_value: null, new_value: 'TEST 1' };
  assert.equal(journalEntryTitle({ ...entry, field_label: 'License plate' }, i18n.t), 'License plate');
  assert.equal(journalEntryTitle(entry, i18n.t), 'registration_number');
});


test('journal table previews preserve empty/false values and readable relationship direction', async () => {
  const {journalValueSummary}=await import('../src/lib/journal-value-summary.js');
  const summary=(value:unknown)=>journalValueSummary(value,'de','Nicht gesetzt','Ja','Nein');
  assert.equal(summary(null),'Nicht gesetzt');
  assert.equal(summary(false),'Nein');
  assert.equal(summary(0),'0');
  assert.equal(summary('true'),'true');
  const snapshot={relationshipTypeId:'retained-definition-id',labels:{de:'Hauptzuordnung',en:'Primary'},left:{keyword:'Projekt A'},right:{keyword:'Aufgabe B'},directed:true};
  assert.equal(summary(snapshot),'Hauptzuordnung: Projekt A → Aufgabe B');
  assert.equal(summary({...snapshot,directed:false}),'Hauptzuordnung: Projekt A ↔ Aufgabe B');
  assert.equal(snapshot.relationshipTypeId,'retained-definition-id');
});
