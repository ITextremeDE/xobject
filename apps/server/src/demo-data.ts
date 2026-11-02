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
  const objects: Record<string, ObjectDefinition> = {}, records: Record<string, DataRecord[]> = {}, links: DemoLink[] = [];
  const group = await app.execute('create_group', { workspaceId: workspace.id, name: 'Projektteam' }, actorId) as { id: string };
  await app.execute('set_group_members', { workspaceId: workspace.id, groupId: group.id, version: 1, memberIds: [actorId] }, actorId);
  async function object(name: string, de: string, en: string, fields: SeedField[], types: string[], statuses: string[]) {
    const created = await app.execute('create_object_type', { workspaceId: workspace.id, technicalName: name, labels: labels(de, en), standardFields: ['keyword', 'type_status', 'category'] }, actorId) as { id: string };
    let model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    const keyword = model.fields.find(item => item.technicalName === 'keyword')!;
    await app.execute('configure_field', { fieldId: keyword.id, required: true }, actorId);
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
  const organizations: DataRecord[] = [];
  const companies = ['Nordlicht Werkstätten GmbH', 'Bergwald Mobilität eG', 'Klarwasser Technik GmbH', 'Sonnenwinkel Kulturverein', 'Hafenblick Planung GmbH', 'Wiesenhof Logistik GmbH'];
  for (let i = 0; i < companies.length; i++) organizations.push(await record('contacts', companies[i], { contact_kind: contactKinds[0].id, company_name: companies[i], email_address: `kontakt${i+1}@example.test`, phone_number: `+4989201000${10+i}`, website: 'https://example.org', street: `${['Werkstattweg','Waldstraße','Am Bach'][i%3]} ${i+1}`, postal_code: '80331', city: 'München', country: 'Deutschland', commercial_register: i === 3 ? 'VR 900004 (fiktiv)' : `HRB ${900001+i} (fiktiv)`, notes: 'Fiktiver Testkontakt. Ausgangspunkt für spätere Projekt- und Ansprechpartnerverknüpfungen.' }));
  for (const [i, person] of [['Mara','Beispiel'],['Jonas','Mustermann'],['Lea','Testmann']].entries()) {
    const individual = i === 2;
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[i]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, first_name: person[0], last_name: person[1], company_name: individual ? null : companies[i], email_address: `person${i+1}@example.test`, phone_number: `+4989201000${30+i}`, birthday: `199${i}-06-15`, city: 'München', country: 'Deutschland', notes: individual ? 'Selbstständiger Einzelkontakt für ein späteres eigenständiges Projekt.' : `Vorgesehene Hauptorganisation: ${companies[i]}. Die tatsächliche Beziehung folgt später.` });
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
        const task = await record('tasks', `${['Termin abstimmen', 'Ergebnisse dokumentieren', 'Checkliste prüfen'][k]} – ${project.keyword} / ${j ? 'Umsetzung' : 'Bestandsaufnahme'}`, { description: `Teil von „${currentCase.keyword}“. Fiktiver Testdatensatz für die spätere Hauptzuordnung.`, due_at: `2026-11-${10+i*2+j}T${k===0?'08':'13'}:00:00Z`, assigned_to: owners, estimated_hours: String(k+1), completed: done }, done?2:k%2);
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
    const vehicle = await record('vehicles', `Servicefahrzeug ${i+1} – TEST-${100+i}`, { registration_number: `TEST-${100+i}`, manufacturer: ['Volkswagen','Ford','Renault'][i], model: ['ID. Buzz','Transit','Kangoo'][i], first_registration: `202${3+i}-03-15`, mileage: String(45000+i*12500), purchase_price: { amount: String(28000+i*6000), currency:'EUR' }, electric: i===0, notes: 'Fiktives Fahrzeug für spätere Servicefall- und Projektverknüpfungen.' },i);
    link('cases', records.cases[i], 'vehicles', vehicle, 'vehicle');
  }
  // A genuine edit creates before/after history through the common application layer.
  const firstTask = records.tasks[0];
  records.tasks[0] = await app.execute('update_record', { objectTypeId: objects.tasks.id, recordId: firstTask.id, version: firstTask.version, values: { estimated_hours: '2.5' } }, actorId) as DataRecord;
  const relationTypes = await app.execute('list_relationship_types', { workspaceId: workspace.id }, actorId) as import('@xobject/contracts').RelationshipType[];
  const primary = relationTypes.find(type => type.kind === 'primary')!;
  const { id: _id, workspaceId: _workspace, technicalName: _name, kind: _kind, rulesState: _rules, version, ...configuration } = primary;
  await app.execute('configure_relationship_type', { workspaceId: workspace.id, relationshipTypeId: primary.id, version, configuration: { ...configuration, pairs: [['contacts','projects'],['projects','cases'],['cases','tasks'],['projects','tasks'],['contacts','tasks']].map(([left,right]) => ({ leftObjectTypeId: objects[left].id, rightObjectTypeId: objects[right].id })) } }, actorId);
  await app.execute('create_relationship_type', { workspaceId: workspace.id, technicalName: 'contact_person', configuration: { labels: { de: 'Ansprechpartner', en: 'Contact person' }, leftLabels: { de: 'Ansprechpartner', en: 'Contact persons' }, rightLabels: { de: 'Hauptorganisation', en: 'Main organization' }, directed: true, leftMin: 0, leftMax: null, rightMin: 0, rightMax: 1, allowAll: false, pairs: [{ leftObjectTypeId: objects.contacts.id, rightObjectTypeId: objects.contacts.id }], active: true } }, actorId);
  return { workspaceId: workspace.id, objects, records, links };
}
