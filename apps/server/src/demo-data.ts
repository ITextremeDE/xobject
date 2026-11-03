import { v7 } from 'uuid';
import type { ClassificationRules, CustomFieldKind, FieldConfig, FieldValue, ObjectDefinition, DataRecord } from '@xobject/contracts';
import { Application } from './domain.js';
import type { Database } from './database.js';

type Labels = { de: string; en: string };
type SeedField = { name: string; labels: Labels; kind?: CustomFieldKind; config?: FieldConfig; required?: boolean };
export type DemoLink = { from: { objectTypeId: string; recordId: string }; to: { objectTypeId: string; recordId: string }; relation: 'primary' | 'contact_person' | 'vehicle' };
const labels = (de: string, en: string): Labels => ({ de, en });
const field = (name: string, de: string, en: string, kind: CustomFieldKind = 'text', config?: FieldConfig): SeedField => ({ name, labels: labels(de, en), kind, config });

/** Entirely fictional fixtures, created through the same rules as API/MCP. Never resets data. */
export async function seedDemoData(db: Database, actorId: string, code = 'itx') {
  const app = new Application(db);
  const workspaces = await app.execute('list_workspaces', {}, actorId) as { code: string }[];
  if (workspaces.some(workspace => workspace.code === code)) throw new Error('Demo workspace already exists; no data was changed');
  const workspace = await app.execute('create_workspace', { name: 'ITextreme', code, defaultLanguage: 'de', timeZone: 'Europe/Berlin' }, actorId) as { id: string };
  const module=(await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[]).find(item=>item.key==='projects')!;
  await app.execute('configure_workspace_module',{workspaceId:workspace.id,key:'projects',enabled:true,version:module.version},actorId);
  const installed=await app.execute('list_object_types',{workspaceId:workspace.id},actorId) as {id:string;technicalName:string}[];
  const objects: Record<string, ObjectDefinition> = {}, records: Record<string, DataRecord[]> = {}, links: DemoLink[] = [];
  const group = await app.execute('create_group', { workspaceId: workspace.id, name: 'Projektteam' }, actorId) as { id: string };
  await app.execute('set_group_members', { workspaceId: workspace.id, groupId: group.id, version: 1, memberIds: [actorId] }, actorId);
  async function object(name: string, de: string, en: string, fields: SeedField[], types: string[], statuses: string[]) {
    const created = installed.find(item=>item.technicalName===name) ?? await app.execute('create_object_type', { workspaceId: workspace.id, technicalName: name, labels: labels(de, en), standardFields: ['keyword', 'type_status', 'category'] }, actorId) as { id: string };
    let model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    const keyword = model.fields.find(item => item.technicalName === 'keyword')!;
    await app.execute('configure_field', { fieldId: keyword.id, version: keyword.version, required: true }, actorId);
    for (const item of fields) await app.execute('create_field', { objectTypeId: created.id, technicalName: item.name, labels: item.labels, kind: item.kind ?? 'text', config: item.config, required: item.required ?? false }, actorId);
    const typeOptions = types.map(name => ({ id: v7(), kind: 'type' as const, labels: labels(name, name), typeId: null, active: true }));
    const statusOptions = [null, ...typeOptions.map(item => item.id)].flatMap(typeId => statuses.map(name => ({ id: v7(), kind: 'status' as const, labels: labels(name, name), typeId, active: true })));
    const config: ClassificationRules = { type: { required: false, defaultId: typeOptions[0]?.id ?? null }, status: { required: false, defaults: [null, ...typeOptions.map(item => item.id)].map(typeId => ({ typeId, statusId: statusOptions.find(item => item.typeId === typeId)!.id })) }, category: { required: false, multiple: true, defaultIds: [] }, options: [...typeOptions, ...statusOptions, ...['Intern', 'Kundenarbeit', 'Priorität'].map(name => ({ id: v7(), kind: 'category' as const, labels: labels(name, name), typeId: null, active: true }))] };
    await app.execute('configure_classification', { objectTypeId: created.id, version: model.classification.version, config }, actorId);
    model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    objects[name] = model; records[name] = []; return model;
  }
  async function record(objectName: string, keyword: string, values: Record<string, FieldValue>, statusIndex = 0) {
    const model = objects[objectName], typeId = model.classification.type.defaultId;
    const statuses = model.classification.options.filter(option => option.kind === 'status' && option.typeId === typeId);
    const category = model.classification.options.filter(option => option.kind === 'category')[objectName === 'contacts' ? 1 : 0];
    const row = await app.execute('create_record', { objectTypeId: model.id, keyword, values, classification: { type: typeId, status: statuses[statusIndex % statuses.length].id, category: [category.id] } }, actorId) as DataRecord;
    records[objectName].push(row); return row;
  }
  function link(fromObject: string, from: DataRecord, toObject: string, to: DataRecord, relation: DemoLink['relation'] = 'primary') {
    links.push({ from: { objectTypeId: objects[fromObject].id, recordId: from.id }, to: { objectTypeId: objects[toObject].id, recordId: to.id }, relation });
  }
  const contactKinds = ['Organisation', 'Einzelkontakt', 'Ansprechpartner'].map((de, i) => ({ id: v7(), labels: labels(de, ['Organization', 'Individual contact', 'Contact person'][i]), active: true }));
  await object('contacts', 'Kontakte', 'Contacts', [
    { ...field('contact_kind', 'Kontaktart', 'Contact kind', 'single_choice', { options: contactKinds }), required: true },
    field('company_name', 'Firmenname', 'Company name'), field('last_name', 'Nachname', 'Last name'), field('first_name', 'Vorname', 'First name'),
    field('email_address', 'E-Mail-Adresse', 'Email address', 'email'), field('phone_number', 'Telefonnummer', 'Phone number', 'phone'), field('website', 'Webseite', 'Website', 'url'),
    field('street', 'Straße und Hausnummer', 'Street and number'), field('postal_code', 'Postleitzahl', 'Postal code'), field('city', 'Ort', 'City'), field('country', 'Land', 'Country'),
    field('commercial_register', 'Handelsregister', 'Commercial register'), field('birthday', 'Geburtsdatum', 'Date of birth', 'date'), field('notes', 'Notizen', 'Notes', 'multiline', { formatted: true }),
  ], ['Kunde', 'Lieferant', 'Partner'], ['Aktiv', 'In Klärung', 'Inaktiv']);
  const contactModel=objects.contacts,contactKind=contactModel.fields.find(field=>field.technicalName==='contact_kind')!;
  for(const name of ['first_name','last_name','birthday','commercial_register']) {
    const target=contactModel.fields.find(field=>field.technicalName===name)!;
    await app.execute('configure_field',{fieldId:target.id,version:target.version,required:target.required,applicability:{fieldId:contactKind.id,optionIds:(name==='commercial_register'?[contactKinds[0],contactKinds[1]]:[contactKinds[1],contactKinds[2]]).map(option=>option.id)}},actorId);
  }
  objects.contacts=await app.execute('get_object_type',{objectTypeId:contactModel.id},actorId) as ObjectDefinition;
  const organizations: DataRecord[] = [];
  const companies = ['Nordlicht Werkstätten GmbH', 'Bergwald Mobilität eG', 'Klarwasser Technik GmbH', 'Sonnenwinkel Kulturverein', 'Hafenblick Planung GmbH', 'Wiesenhof Logistik GmbH'];
  for (let i = 0; i < companies.length; i++) organizations.push(await record('contacts', companies[i], { contact_kind: contactKinds[0].id, company_name: companies[i], email_address: `kontakt${i+1}@example.test`, phone_number: `+4989201000${10+i}`, website: 'https://example.org', street: `${['Werkstattweg','Waldstraße','Am Bach'][i%3]} ${i+1}`, postal_code: '80331', city: 'München', country: 'Deutschland', commercial_register: i === 3 ? 'VR 900004 (fiktiv)' : `HRB ${900001+i} (fiktiv)`, notes: 'Fiktiver Testkontakt. Testkontakt für Projekte und Ansprechpartner.' }));
  for (const [i, person] of [['Mara','Beispiel'],['Jonas','Mustermann'],['Lea','Testmann']].entries()) {
    const individual = i === 2;
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[i]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, first_name: person[0], last_name: person[1], company_name: individual ? null : companies[i], email_address: `person${i+1}@example.test`, phone_number: `+4989201000${30+i}`, birthday: `199${i}-06-15`, city: 'München', country: 'Deutschland', notes: individual ? 'Selbstständiger Einzelkontakt für ein späteres eigenständiges Projekt.' : `Organisation: ${companies[i]}. Die Beziehung ist unter Verknüpfungen hinterlegt.` });
    if (!individual) link('contacts', organizations[i], 'contacts', row, 'contact_person');
  }
  await object('projects', 'Projekte', 'Projects', [field('objective', 'Projektziel', 'Objective', 'multiline', { formatted: true }), field('start_date', 'Beginn', 'Start date', 'date'), field('target_date', 'Zieldatum', 'Target date', 'date'), field('budget', 'Budget', 'Budget', 'money'), field('progress', 'Fortschritt (%)', 'Progress (%)', 'decimal', { scale: 1 }), field('project_owner', 'Verantwortlich', 'Owner', 'reference', { referenceTarget: 'user', multiple: false }), field('team', 'Projektteam', 'Team', 'reference', { referenceTarget: 'group', multiple: false })], ['Kundenprojekt', 'Internes Projekt'], ['Geplant', 'In Arbeit', 'Abgeschlossen']);
  await object('cases', 'Vorgänge', 'Cases', [field('description', 'Beschreibung', 'Description', 'multiline', { formatted: true }), field('opened_on', 'Eröffnet am', 'Opened on', 'date'), field('due_on', 'Fällig am', 'Due on', 'date'), field('responsible', 'Verantwortlich', 'Responsible', 'reference', { referenceTarget: 'user', multiple: false }), field('estimated_hours', 'Geschätzter Aufwand (h)', 'Estimated hours', 'decimal', { scale: 1 })], ['Arbeitspaket', 'Servicefall'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('tasks', 'Aufgaben', 'Tasks', [field('description', 'Beschreibung', 'Description', 'multiline', { formatted: true }), field('due_at', 'Fällig am', 'Due at', 'datetime'), field('assigned_to', 'Zugewiesen an', 'Assigned to', 'reference', { referenceTarget: 'user', multiple: false }), field('estimated_hours', 'Geschätzter Aufwand (h)', 'Estimated hours', 'decimal', { scale: 1 }), field('completed', 'Erledigt', 'Completed', 'boolean')], ['Aufgabe', 'Rückfrage'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('vehicles', 'Fahrzeuge', 'Vehicles', [field('registration_number', 'Kennzeichen', 'License plate'), field('manufacturer', 'Hersteller', 'Manufacturer'), field('model', 'Modell', 'Model'), field('first_registration', 'Erstzulassung', 'First registration', 'date'), field('mileage', 'Kilometerstand', 'Mileage', 'integer'), field('purchase_price', 'Anschaffungspreis', 'Purchase price', 'money'), field('electric', 'Elektroantrieb', 'Electric drive', 'boolean'), field('notes', 'Notizen', 'Notes', 'multiline')], ['Servicefahrzeug', 'Poolfahrzeug'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  const owners = { kind: 'user' as const, id: actorId }, team = { kind: 'group' as const, id: group.id };
  for (let i = 0; i < 4; i++) {
    const project = await record('projects', ['Nordlicht – Werkstattdigitalisierung', 'Bergwald – Fuhrparkplanung', 'Klarwasser – Serviceportal', 'Intern – Arbeitsplatzmodernisierung'][i], { objective: `## Ziel\n${['Auftragsannahme und Werkstattabläufe vereinfachen.', 'Fahrzeugbestand und Wartung planbar machen.', 'Servicefälle strukturiert bearbeiten.', 'Neue Arbeitsplätze für das Team vorbereiten.'][i]}`, start_date: '2026-10-01', target_date: `2027-0${i+1}-28`, budget: { amount: String(15000+i*8000), currency: 'EUR' }, progress: String(15+i*20), project_owner: owners, team }, i%2);
    if (i<3) link('contacts', organizations[i], 'projects', project);
    for (let j=0;j<2;j++) {
      const currentCase = await record('cases', `${project.keyword} – ${j ? 'Umsetzung' : 'Bestandsaufnahme'}`, { description: j ? 'Umsetzung und fachliche Abnahme vorbereiten.' : 'Anforderungen und vorhandene Arbeitsabläufe aufnehmen.', opened_on: '2026-10-15', due_on: `2026-12-${10+i*2+j}`, responsible: owners, estimated_hours: String(8+j*16) }, j);
      link('projects', project, 'cases', currentCase);
      for (let k=0;k<3;k++) {
        const done = k === 2 && j === 0;
        const task = await record('tasks', `${['Termin abstimmen', 'Ergebnisse dokumentieren', 'Checkliste prüfen'][k]} – ${project.keyword} / ${j ? 'Umsetzung' : 'Bestandsaufnahme'}`, { description: `Teil von „${currentCase.keyword}“. Fiktiver Testdatensatz mit Hauptzuordnung.`, due_at: `2026-11-${10+i*2+j}T${k===0?'08':'13'}:00:00Z`, assigned_to: owners, estimated_hours: String(k+1), completed: done }, done?2:k%2);
        link('cases', currentCase, 'tasks', task);
      }
    }
    const directTask = await record('tasks', `Projektauftakt organisieren – ${project.keyword}`, { description: 'Direkt am Projekt vorgesehen, ohne Vorgang.', assigned_to: owners, completed: false }, 0);
    link('projects', project, 'tasks', directTask);
  }
  const contactTask = await record('tasks', 'Kontaktdaten Nordlicht aktualisieren', { description: 'Direkt am Kontakt vorgesehen, ohne Projekt oder Vorgang.', assigned_to: owners, completed: false });
  link('contacts', organizations[0], 'tasks', contactTask);
  await record('tasks', 'Interne Ideenliste sichten', { description: 'Bewusst ohne Hauptzuordnung: eigenständig bearbeitbare Aufgabe.', assigned_to: owners, completed: false });
  for (let i=0;i<3;i++) {
    const vehicle = await record('vehicles', `Servicefahrzeug ${i+1} – TEST-${100+i}`, { registration_number: `TEST-${100+i}`, manufacturer: ['Volkswagen','Ford','Renault'][i], model: ['ID. Buzz','Transit','Kangoo'][i], first_registration: `202${3+i}-03-15`, mileage: String(45000+i*12500), purchase_price: { amount: String(28000+i*6000), currency:'EUR' }, electric: i===0, notes: 'Fiktives Fahrzeug mit Verknüpfung zu einem Vorgang.' },i);
    link('cases', records.cases[i], 'vehicles', vehicle, 'vehicle');
  }
  // A genuine edit creates before/after history through the common application layer.
  const firstTask = records.tasks[0];
  records.tasks[0] = await app.execute('update_record', { objectTypeId: objects.tasks.id, recordId: firstTask.id, version: firstTask.version, values: { estimated_hours: '2.5' } }, actorId) as DataRecord;
  await app.execute('create_relationship_type', { workspaceId: workspace.id, technicalName: 'contact_person', configuration: { labels: { de: 'Ansprechpartner', en: 'Contact person' }, leftLabels: { de: 'Ansprechpartner', en: 'Contact persons' }, rightLabels: { de: 'Organisation', en: 'Organization' },leftApplicability:{fieldId:contactKind.id,optionIds:[contactKinds[0].id]},rightApplicability:{fieldId:contactKind.id,optionIds:[contactKinds[2].id]}, directed: true, leftMin: 0, leftMax: null, rightMin: 0, rightMax: 1, allowAll: false, pairs: [{ leftObjectTypeId: objects.contacts.id, rightObjectTypeId: objects.contacts.id }], active: true } }, actorId);
  const identityRule={fieldId:contactKind.id,optionIds:[contactKinds[1].id,contactKinds[2].id]};
  const identity=await app.execute('create_relationship_type',{workspaceId:workspace.id,technicalName:'contact_identities',configuration:{labels:{de:'Identitäten',en:'Identities'},leftLabels:{de:'Identitäten',en:'Identities'},rightLabels:{de:'Identitäten',en:'Identities'},directed:false,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:objects.contacts.id,rightObjectTypeId:objects.contacts.id}],active:true,leftApplicability:identityRule,rightApplicability:identityRule}},actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type',{workspaceId:workspace.id,relationshipTypeId:identity.id,version:identity.version},actorId);
  await connectDemoRelationships(db,actorId,workspace.id,links);
  return { workspaceId: workspace.id, objects, records, links };
}

/** Apply the fictional fixture plan through normal operations; retain existing links and no-op on repeats. */
export async function connectDemoRelationships(db: Database, actorId: string, workspaceId: string, links: DemoLink[]) {
  const app=new Application(db);
  const objects=await app.execute('list_object_types',{workspaceId},actorId) as import('@xobject/contracts').ObjectSummary[];
  let definitions=await app.execute('list_relationship_types',{workspaceId},actorId) as import('@xobject/contracts').RelationshipType[];
  if(!definitions.some(type=>type.technicalName==='case_vehicle')) {
    const cases=objects.find(type=>type.technicalName==='cases'),vehicles=objects.find(type=>type.technicalName==='vehicles');
    if(!cases||!vehicles)throw new Error('Demo Cases/Vehicles missing');
    await app.execute('create_relationship_type',{workspaceId,technicalName:'case_vehicle',configuration:{labels:{de:'Fahrzeugbezug',en:'Vehicle reference'},leftLabels:{de:'Fahrzeuge',en:'Vehicles'},rightLabels:{de:'Vorgänge',en:'Cases'},directed:false,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:cases.id,rightObjectTypeId:vehicles.id}],active:true}},actorId);
    definitions=await app.execute('list_relationship_types',{workspaceId},actorId) as typeof definitions;
  }
  for(const type of definitions.filter(type=>['primary_association','general_relation','contact_person','case_vehicle'].includes(type.technicalName)))if(type.rulesState==='draft')await app.execute('activate_relationship_type',{workspaceId,relationshipTypeId:type.id,version:type.version},actorId);
  definitions=await app.execute('list_relationship_types',{workspaceId},actorId) as typeof definitions;
  for(const link of links) {
    if(!objects.some(type=>type.id===link.from.objectTypeId)||!objects.some(type=>type.id===link.to.objectTypeId))throw new Error('Demo plan does not match this workspace');
    const technicalName=link.relation==='primary'?'primary_association':link.relation==='contact_person'?'contact_person':'case_vehicle';
    const type=definitions.find(type=>type.technicalName===technicalName);if(!type)throw new Error('Demo relationship definition missing');
    const snapshot=await app.execute('get_record_relationships',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as import('@xobject/contracts').RecordRelationships;
    const field=snapshot.fields.find(field=>field.definition.id===type.id&&field.side==='left');if(!field)throw new Error('Demo relationship side missing');
    if(field.targets.some(target=>target.objectTypeId===link.to.objectTypeId&&target.recordId===link.to.recordId))continue;
    const record=await app.execute('get_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId,version:record.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[...field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId})),link.to]}]},actorId);
  }
}
