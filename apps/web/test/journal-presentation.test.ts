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
  assert.equal(summary({de:'Standort',en:'Location'}),'Standort');
  assert.equal(journalValueSummary({scale:2,required:true},'de','Nicht gesetzt','Ja','Nein',(_kind,count)=>`${count} Eigenschaften`),'2 Eigenschaften');
  assert.equal(summary([false,0]),'Nein, 0');
  const snapshot={relationshipTypeId:'retained-definition-id',labels:{de:'Hauptzuordnung',en:'Primary'},left:{keyword:'Projekt A'},right:{keyword:'Aufgabe B'},directed:true};
  assert.equal(summary(snapshot),'Hauptzuordnung: Projekt A → Aufgabe B');
  assert.equal(summary({...snapshot,directed:false}),'Hauptzuordnung: Projekt A ↔ Aufgabe B');
  assert.equal(snapshot.relationshipTypeId,'retained-definition-id');
});

test('form journals present translated groups/settings and resolve metadata names without changing historical values',async()=>{
 const {formSnapshotGroups}=await import('../src/lib/form-layout-presentation.js');
 const {journalValueSummary}=await import('../src/lib/journal-value-summary.js');
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{formLayoutTitle:'Form layout',formDefault:'Standard form',formHalf:'Half width',formFull:'Full width',formHidden:'Hidden',formShown:'Shown',formExpansionClosed:'Initially closed',formUnassigned:'Unassigned',formUnknownField:'Unavailable field'}}}});
 const field='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',relation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const layout:any={groups:[{id:'saved',labels:{en:'Historical group',de:'Historische Gruppe'},fields:[{fieldId:field,width:'half'},{relationshipTypeId:relation,side:'right',width:'full',visible:false,expanded:'closed'}]}],unassigned:[{fieldId:relation,width:'full'}]};
 const before=structuredClone(layout),context={fields:{[field]:'Current field name'},relationships:{[relation]:{left:'Parent',right:'Children'}}};
 const groups=formSnapshotGroups(layout,context,'en',i18n.t);
 assert.equal(journalPropertyLabel('form_layout.default',i18n.t),'Form layout · Standard form');
 assert.equal(groups[0].label,'Historical group');assert.equal(groups[0].entries[0].label,'Current field name');
 assert.equal(groups[0].entries[1].label,'Children');assert.deepEqual(groups[0].entries[1].settings,['Full width','Hidden','Initially closed']);
 assert.equal(groups[1].label,'Unassigned');assert.equal(groups[1].entries[0].label,'Unavailable field');
 assert.deepEqual(layout,before,'presentation does not rewrite stored audit snapshots');
 assert.equal(journalValueSummary(layout,'en','None','Yes','No',(kind,count)=>`${count} ${kind}`),'1 groups · 3 elements');
});

test('record lifecycle labels are translated without interpreting business field values',async()=>{
 const {journalLifecycleValue}=await import('../src/lib/journal-presentation.js');
 const i18n=i18next.createInstance();await i18n.init({lng:'de',resources:{de:{translation:{recordLifecycle:'Datensatz-Lebenszyklus',recordActive:'Aktiv',recordRecycled:'Im Papierkorb'}}}});const t=i18n.t.bind(i18n);
 const entry={entity_kind:'record',field_key:'lifecycle',field_id:null};
 assert.equal(journalEntryTitle({...entry,old_value:'active',new_value:'recycled'},t),'Datensatz-Lebenszyklus');
 assert.equal(journalLifecycleValue(entry,'recycled',t),'Im Papierkorb');assert.equal(journalLifecycleValue(entry,'active',t),'Aktiv');
 assert.equal(journalLifecycleValue({...entry,field_id:'custom-business-field'},'active',t),undefined);
});

test('security history translates owners and grades without interpreting business values or mutating snapshots',async()=>{
 const {journalSecurityValue}=await import('../src/lib/journal-presentation.js');
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{accessPrincipalsLabel:'Access principals',reference_user:'User',reference_group:'Group',permission_full:'Full access',permission_read:'Read',recordFieldExceptions:'Field exceptions',workspacePublic:'All (workspace)',privacy_confidential:'Confidential',journalNotSet:'Not set',journalUnknownPrincipal:'Unavailable',permissionInherit:'Inherit'}},de:{translation:{accessPrincipalsLabel:'Zugriffsberechtigte',reference_user:'Benutzer',reference_group:'Gruppe',permission_full:'Vollzugriff',permission_read:'Lesen',workspacePublic:'Alle (Arbeitsbereich)',privacy_confidential:'Vertraulich'}}}});
 const entry={entity_kind:'record',field_key:'access.owners',field_label:'access.owners',old_value:null,new_value:[{kind:'user',id:'one',level:'full'},{kind:'group',id:'two',level:'read'}],security_context:{principals:{'user:one':'John Doe','group:two':'Sales'}}};
 const snapshot=structuredClone(entry);
 assert.equal(journalEntryTitle(entry,i18n.t),'Access principals');
 assert.equal(journalSecurityValue(entry,entry.new_value,i18n.t),'John Doe (User) · Full access; Sales (Group) · Read');
 assert.equal(journalSecurityValue(entry,[],i18n.t),'All (workspace)');
 assert.equal(journalSecurityValue({...entry,security_context:undefined},entry.new_value,i18n.t),'Unavailable (User) · Full access; Unavailable (Group) · Read');
 assert.equal(journalSecurityValue({...entry,field_key:'access.field.user:one.field'},'read',i18n.t),'John Doe (User) · Read');
 assert.equal(journalSecurityValue({...entry,field_key:'access.field.user:one.field'},null,i18n.t),'John Doe (User) · Inherit');
 assert.equal(journalSecurityValue({...entry,field_key:'access.privacy'},'confidential',i18n.t),'Confidential');
 assert.equal(journalSecurityValue({...entry,field_key:'business_field'},'full',i18n.t),undefined);
 await i18n.changeLanguage('de');assert.equal(journalEntryTitle(entry,i18n.t),'Zugriffsberechtigte');assert.equal(journalSecurityValue(entry,entry.new_value,i18n.t),'John Doe (Benutzer) · Vollzugriff; Sales (Gruppe) · Lesen');
 assert.deepEqual(entry,snapshot);
});

test('relationship attribute history uses its field label rather than the structural link title',()=>{
 const t=((key:string)=>key) as any;
 assert.equal(journalEntryTitle({entity_kind:'relationship',field_id:'attribute',field_label:'Position',field_key:'job_title',old_value:'Director',new_value:'Chair'},t,'de'),'Position');
});
