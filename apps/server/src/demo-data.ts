import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import type { ContentPermissions, ForeignSettings, ManagedUser, RecordSecurity, Workspace, WorkspaceGroup, FormEntry, AccessLevel, ClassificationRules, CustomFieldKind, FieldConfig, FieldValue, ObjectDefinition, DataRecord } from '@xobject/contracts';
import { Application } from './domain.js';
import type { Database } from './database.js';

type Labels = { de: string; en: string };
type SeedField = { name: string; labels: Labels; kind?: CustomFieldKind; config?: FieldConfig; required?: boolean };
export type DemoLink = { from: { objectTypeId: string; recordId: string }; to: { objectTypeId: string; recordId: string }; relation: 'primary' | 'contact_person' | 'vehicle' | 'general' | 'identity' | 'coverage' | 'assigned_vehicle' };
const labels = (de: string, en: string): Labels => ({ de, en });
const field = (name: string, de: string, en: string, kind: CustomFieldKind = 'text', config?: FieldConfig): SeedField => ({ name, labels: labels(de, en), kind, config });

const choiceTranslations: Record<string, string> = {"Kunde": "Customer", "Lieferant": "Supplier", "Partner": "Partner", "Aktiv": "Active", "In Klärung": "Under review", "Inaktiv": "Inactive", "Kundenprojekt": "Customer project", "Internes Projekt": "Internal project", "Geplant": "Planned", "In Arbeit": "In progress", "Abgeschlossen": "Completed", "Arbeitspaket": "Work package", "Servicefall": "Service request", "Offen": "Open", "Erledigt": "Done", "Aufgabe": "Task", "Rückfrage": "Question", "Servicefahrzeug": "Service vehicle", "Poolfahrzeug": "Pool vehicle", "Verfügbar": "Available", "Im Einsatz": "In use", "In Wartung": "Under maintenance", "Intern": "Internal", "Kundenarbeit": "Customer work", "Priorität": "Priority", "Versicherung": "Insurance", "Wartung": "Maintenance", "Entwurf": "Draft", "Ausgelaufen": "Expired", "Berechtigungstest": "Access check", "Notebook": "Laptop", "Diagnosegerät": "Diagnostic tool"};
const choiceLabels = (de: string): Labels => labels(de, choiceTranslations[de] ?? de);

/** Entirely fictional fixtures, created through the same rules as API/MCP. Never resets data. */
export async function seedDemoData(db: Database, actorId: string, code = 'itx') {
  const app = new Application(db);
  const workspaces = await app.execute('list_workspaces', {}, actorId) as { code: string }[];
  if (workspaces.some(workspace => workspace.code === code)) throw new Error('Demo workspace already exists; no data was changed');
  const workspace = await app.execute('create_workspace', { name: 'ITextreme', code, defaultLanguage: 'en', timeZone: 'Europe/Berlin' }, actorId) as Workspace;
  const accounts = [];
  for (const [name, local, role] of [['Jane Doe', 'jane.doe', 'designer'], ['James Doe', 'james.doe', 'user']] as const) {
    const email = `${local}${code === 'itx' ? '' : `+${code}`}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const user = await app.execute('create_user', { name, email, initialPassword: password }, actorId) as ManagedUser;
    await app.execute('set_workspace_member', { workspaceId: workspace.id, userId: user.id, role, expectedRole: null }, actorId);
    accounts.push({ id: user.id, name, email, role, password });
  }
  const [designer, member] = accounts;
  const module=(await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[]).find(item=>item.key==='projects')!;
  await app.execute('configure_workspace_module',{workspaceId:workspace.id,key:'projects',enabled:true,version:module.version},actorId);
  const installed=await app.execute('list_object_types',{workspaceId:workspace.id},actorId) as {id:string;technicalName:string}[];
  const objects: Record<string, ObjectDefinition> = {}, records: Record<string, DataRecord[]> = {}, links: DemoLink[] = [];
  const group = await app.execute('create_group', { workspaceId: workspace.id, name: 'Project team' }, actorId) as { id: string };
  await app.execute('configure_group_inheritance', { workspaceId: workspace.id, groupId: group.id, version: 1, members:[{kind:'user',id:member.id,level:'full'}] }, actorId);
  const management = await app.execute('create_group', { workspaceId: workspace.id, name: 'Management', members: [{kind: 'user', id: designer.id, level: 'full'}, {kind: 'group', id: group.id, level: 'read'}] }, actorId) as WorkspaceGroup;
  async function object(name: string, de: string, en: string, fields: SeedField[], types: string[], statuses: string[]) {
    const created = installed.find(item=>item.technicalName===name) ?? await app.execute('create_object_type', { workspaceId: workspace.id, technicalName: name, labels: labels(de, en), standardFields: ['keyword', 'type_status', 'category'] }, actorId) as { id: string };
    let model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    const keyword = model.fields.find(item => item.technicalName === 'keyword')!;
    await app.execute('configure_field', { fieldId: keyword.id, version: keyword.version, required: true }, actorId);
    for (const item of fields) await app.execute('create_field', { objectTypeId: created.id, technicalName: item.name, labels: item.labels, kind: item.kind ?? 'text', config: item.config, required: item.required ?? false }, actorId);
    const typeOptions = types.map(name => ({ id: v7(), kind: 'type' as const, labels: choiceLabels(name), typeId: null, active: true }));
    const statusOptions = [null, ...typeOptions.map(item => item.id)].flatMap(typeId => statuses.map(name => ({ id: v7(), kind: 'status' as const, labels: choiceLabels(name), typeId, active: true })));
    const config: ClassificationRules = { type: { required: false, defaultId: typeOptions[0]?.id ?? null }, status: { required: false, defaults: [null, ...typeOptions.map(item => item.id)].map(typeId => ({ typeId, statusId: statusOptions.find(item => item.typeId === typeId)!.id })) }, category: { required: false, multiple: true, defaultIds: [] }, options: [...typeOptions, ...statusOptions, ...['Intern', 'Kundenarbeit', 'Priorität'].map(name => ({ id: v7(), kind: 'category' as const, labels: choiceLabels(name), typeId: null, active: true }))] };
    await app.execute('configure_classification', { objectTypeId: created.id, version: model.classification.version, config }, actorId);
    model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    objects[name] = model; records[name] = []; return model;
  }
  async function record(objectName: string, keyword: string, values: Record<string, FieldValue>, statusIndex = 0) {
    const model = objects[objectName];
    const types = model.classification.options.filter(option => option.kind === 'type');
    const typeId = types[records[objectName].length % types.length].id;
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
  const companies = ['Northlight Workshops Ltd', 'Forest Mobility Cooperative', 'Clearwater Technology Ltd', 'Sunridge Arts Association', 'Harbour Planning Ltd', 'Meadow Logistics Ltd'];
  for (let i = 0; i < companies.length; i++) organizations.push(await record('contacts', companies[i], { contact_kind: contactKinds[0].id, company_name: companies[i], email_address: `contact${i+1}@example.test`, phone_number: `+4989201000${10+i}`, website: 'https://example.org', street: `${['Workshop Road','Forest Lane','River Street'][i%3]} ${i+1}`, postal_code: '80331', city: 'Munich', country: 'Germany', commercial_register: i === 3 ? 'VR 900004 (fictional)' : `HRB ${900001+i} (fictional)`, notes: 'Fictional organization for project and contact-person testing.' }));
  for (const [i, person] of [['Emily','Example'],['Oliver','Sample'],['Emily','Example']].entries()) {
    const individual = i === 2;
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[i]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, first_name: person[0], last_name: person[1], company_name: individual ? null : companies[i], email_address: `person${i+1}@example.test`, phone_number: `+4989201000${30+i}`, birthday: `199${i===2?0:i}-06-15`, city: 'Munich', country: 'Germany', notes: individual ? 'Independent individual contact for a future standalone project.' : `Organization: ${companies[i]}. The relationship is stored as a real link.` });
    if (!individual) link('contacts', organizations[i], 'contacts', row, 'contact_person');
  }
  await object('projects', 'Projekte', 'Projects', [field('objective', 'Projektziel', 'Objective', 'multiline', { formatted: true }), field('start_date', 'Beginn', 'Start date', 'date'), field('target_date', 'Zieldatum', 'Target date', 'date'), field('budget', 'Budget', 'Budget', 'money'), field('progress', 'Fortschritt (%)', 'Progress (%)', 'decimal', { scale: 1 }), field('project_owner', 'Verantwortlich', 'Owner', 'reference', { referenceTarget: 'user', multiple: false }), field('team', 'Projektteam', 'Team', 'reference', { referenceTarget: 'group', multiple: false })], ['Kundenprojekt', 'Internes Projekt'], ['Geplant', 'In Arbeit', 'Abgeschlossen']);
  await object('cases', 'Vorgänge', 'Cases', [field('description', 'Beschreibung', 'Description', 'multiline', { formatted: true }), field('opened_on', 'Eröffnet am', 'Opened on', 'date'), field('due_on', 'Fällig am', 'Due on', 'date'), field('responsible', 'Verantwortlich', 'Responsible', 'reference', { referenceTarget: 'user', multiple: false }), field('estimated_hours', 'Geschätzter Aufwand (h)', 'Estimated hours', 'decimal', { scale: 1 })], ['Arbeitspaket', 'Servicefall'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('tasks', 'Aufgaben', 'Tasks', [field('description', 'Beschreibung', 'Description', 'multiline', { formatted: true }), field('due_at', 'Fällig am', 'Due at', 'datetime'), field('assigned_to', 'Zugewiesen an', 'Assigned to', 'reference', { referenceTarget: 'user', multiple: false }), field('estimated_hours', 'Geschätzter Aufwand (h)', 'Estimated hours', 'decimal', { scale: 1 }), field('completed', 'Erledigt', 'Completed', 'boolean'), field('reviewers', 'Prüfer', 'Reviewers', 'reference', {referenceTarget: 'both', multiple: true})], ['Aufgabe', 'Rückfrage'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('vehicles', 'Fahrzeuge', 'Vehicles', [field('registration_number', 'Kennzeichen', 'License plate'), field('manufacturer', 'Hersteller', 'Manufacturer'), field('model', 'Modell', 'Model'), field('first_registration', 'Erstzulassung', 'First registration', 'date'), field('mileage', 'Kilometerstand', 'Mileage', 'integer'), field('purchase_price', 'Anschaffungspreis', 'Purchase price', 'money'), field('electric', 'Elektroantrieb', 'Electric drive', 'boolean'), field('notes', 'Notizen', 'Notes', 'multiline')], ['Servicefahrzeug', 'Poolfahrzeug'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  const owners = { kind: 'user' as const, id: actorId }, team = { kind: 'group' as const, id: group.id };
  for (let i = 0; i < 4; i++) {
    const project = await record('projects', ['Northlight – Workshop modernization', 'Forest – Fleet planning', 'Clearwater – Service portal', 'Internal – Workplace modernization'][i], { objective: `## Objective\n${['Simplify order intake and workshop operations.', 'Plan vehicle capacity and maintenance.', 'Handle service requests consistently.', 'Prepare new workstations for the team.'][i]}`, start_date: '2026-10-01', target_date: `2027-0${i+1}-28`, budget: { amount: String(15000+i*8000), currency: 'EUR' }, progress: String(15+i*20), project_owner: owners, team }, i%2);
    if (i<3) link('contacts', organizations[i], 'projects', project);
    for (let j=0;j<2;j++) {
      const currentCase = await record('cases', `${project.keyword} – ${j ? 'Implementation' : 'Discovery'}`, { description: j ? 'Prepare implementation and acceptance.' : 'Document requirements and existing workflows.', opened_on: '2026-10-15', due_on: `2026-12-${10+i*2+j}`, responsible: owners, estimated_hours: String(8+j*16) }, j);
      link('projects', project, 'cases', currentCase);
      for (let k=0;k<3;k++) {
        const done = k === 2 && j === 0;
        const task = await record('tasks', `${['Arrange meeting', 'Document results', 'Review checklist'][k]} – ${project.keyword} / ${j ? 'Implementation' : 'Discovery'}`, { description: `Part of ${currentCase.keyword}. Fictional task with a Primary association.`, due_at: `2026-11-${10+i*2+j}T${k===0?'08':'13'}:00:00Z`, assigned_to: {kind: 'user', id: member.id}, estimated_hours: String(k+1), completed: done, reviewers: [{kind:'user',id:designer.id},team] }, done?2:k%2);
        link('cases', currentCase, 'tasks', task);
      }
    }
    const directTask = await record('tasks', `Arrange project kickoff – ${project.keyword}`, { description: 'Assigned directly to the Project without a Case.', assigned_to: {kind: 'user', id: member.id}, completed: false }, 0);
    link('projects', project, 'tasks', directTask);
  }
  const contactTask = await record('tasks', 'Update Northlight contact details', { description: 'Assigned directly to the Contact without a Project or Case.', assigned_to: {kind: 'user', id: member.id}, completed: false });
  link('contacts', organizations[0], 'tasks', contactTask);
  await record('tasks', 'Review internal ideas', { description: 'Standalone task without a Primary association.', assigned_to: {kind: 'user', id: member.id}, completed: false });
  for (let i=0;i<3;i++) {
    const vehicle = await record('vehicles', `Service vehicle ${i+1} – TEST-${100+i}`, { registration_number: `TEST-${100+i}`, manufacturer: ['Volkswagen','Ford','Renault'][i], model: ['ID. Buzz','Transit','Kangoo'][i], first_registration: `202${3+i}-03-15`, mileage: String(45000+i*12500), purchase_price: { amount: String(28000+i*6000), currency:'EUR' }, electric: i===0, notes: 'Fictional vehicle linked to a service Case.' },i);
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
  // Additional generic objects exercise every currently implemented custom field kind.
  const serviceOptions = [labels('Reparatur', 'Repair'), labels('Ersatz', 'Replacement'), labels('Vor-Ort-Service', 'On-site service')].map(value => ({id: v7(), labels: value, active: true}));
  await object('contracts', 'Verträge', 'Contracts', [
    field('contract_number', 'Vertragsnummer', 'Contract number'),
    field('valid_from', 'Gültig ab', 'Valid from', 'date'), field('valid_until', 'Gültig bis', 'Valid until', 'date'),
    field('annual_fee', 'Jahresbeitrag', 'Annual fee', 'money', {scale: 2, currency: 'EUR'}),
    field('services', 'Leistungen', 'Services', 'multiple_choice', {options: serviceOptions}),
    field('renewal', 'Automatische Verlängerung', 'Automatic renewal', 'boolean'),
    field('internal_notes', 'Interne Notizen', 'Internal notes', 'multiline'),
  ], ['Versicherung', 'Wartung'], ['Entwurf', 'Aktiv', 'Ausgelaufen']);
  await object('devices', 'Geräte', 'Devices', [
    field('serial_number', 'Seriennummer', 'Serial number'), field('model', 'Modell', 'Model'),
    field('purchase_price', 'Kaufpreis', 'Purchase price', 'money', {scale: 2, currency: 'USD'}),
    field('quantity', 'Anzahl', 'Quantity', 'integer'), field('weight', 'Gewicht (kg)', 'Weight (kg)', 'decimal', {scale: 3}),
    field('custodians', 'Verantwortliche', 'Custodians', 'reference', {referenceTarget: 'group', multiple: true}),
    field('instructions', 'Anleitung', 'Instructions', 'multiline', {formatted: true}),
    field('retired_tag', 'Frühere Kennzeichnung', 'Retired tag'),
  ], ['Notebook', 'Diagnosegerät'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  for (let i = 0; i < 3; i++) await record('contracts', ['Workshop equipment cover', 'Mobile service maintenance', 'Expired equipment cover'][i], {
    contract_number: `DEMO-${2026}-${100+i}`, valid_from: '2026-01-01', valid_until: i === 2 ? '2026-06-30' : '2027-12-31',
    annual_fee: {amount: ['1234.56', '98765.43', '0.00'][i], currency: 'EUR'}, services: serviceOptions.slice(0, i+1).map(option => option.id), renewal: i === 0,
    internal_notes: 'Fictional pricing note. This field is hidden from James by the object-level field ceiling.',
  }, i);
  for (let i = 0; i < 4; i++) await record('devices', ['Workshop laptop', 'Mobile diagnostic kit', 'Spare laptop', 'Unassigned diagnostic kit'][i], {
    serial_number: `DEMO-SN-${1000+i}`, model: i % 2 ? 'Diagnostic Kit D2' : 'Notebook L14',
    purchase_price: {amount: i === 2 ? '0.00' : '12345.67', currency: 'USD'}, quantity: String(i === 2 ? 0 : 1),
    weight: ['1.250', '12.345', '0.000', '2.500'][i], custodians: [{kind:'group',id:group.id}, {kind:'group',id:management.id}],
    instructions: '## Getting started\n\n- Check the serial number.\n- Review the linked contract.\n\n**Fictional equipment; no attachments.**', retired_tag: i === 0 ? 'OLD-100' : null,
  }, i);
  const coverage = await app.execute('create_relationship_type', {workspaceId: workspace.id, technicalName: 'device_coverage', configuration: {
    labels: labels('Geräteabdeckung', 'Device coverage'), leftLabels: labels('Abdeckender Vertrag', 'Covering contract'), rightLabels: labels('Abgedeckte Geräte', 'Covered devices'),
    directed: true, leftMin: 0, leftMax: 1, rightMin: 0, rightMax: null, allowAll: false,
    pairs: [{leftObjectTypeId: objects.devices.id, rightObjectTypeId: objects.contracts.id}], active: true,
  }}, actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type', {workspaceId: workspace.id, relationshipTypeId: coverage.id, version: coverage.version}, actorId);
  const assignment = await app.execute('create_relationship_type', {workspaceId: workspace.id, technicalName: 'vehicle_equipment', configuration: {
    labels: labels('Fahrzeugausrüstung', 'Vehicle equipment'), leftLabels: labels('Festes Gerät', 'Dedicated device'), rightLabels: labels('Zugeordnetes Fahrzeug', 'Assigned vehicle'),
    directed: true, leftMin: 0, leftMax: 1, rightMin: 0, rightMax: 1, allowAll: false,
    pairs: [{leftObjectTypeId: objects.vehicles.id, rightObjectTypeId: objects.devices.id}], active: true,
  }}, actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type', {workspaceId: workspace.id, relationshipTypeId: assignment.id, version: assignment.version}, actorId);
  link('devices', records.devices[0], 'contracts', records.contracts[0], 'coverage');
  link('devices', records.devices[1], 'contracts', records.contracts[0], 'coverage');
  link('devices', records.devices[2], 'contracts', records.contracts[1], 'coverage');
  link('vehicles', records.vehicles[0], 'devices', records.devices[0], 'assigned_vehicle');
  link('projects', records.projects[0], 'contracts', records.contracts[0], 'general');
  link('contacts', records.contacts[6], 'contacts', records.contacts[8], 'identity');
  await connectDemoRelationships(db, actorId, workspace.id, links);

  // Explicit ceilings for regular users; Designer controls structure, not content rights.
  for (const [name, model] of Object.entries(objects)) {
    const before = await app.execute('get_content_permissions', {objectTypeId: model.id}, actorId) as ContentPermissions;
    const privateField = model.fields.find(item => item.technicalName === 'internal_notes');
    const price = model.fields.find(item => item.technicalName === 'purchase_price');
    await app.execute('configure_content_permissions', {...before, sensitive: ['tasks', 'contracts'].includes(name), grants: [
      {kind:'group',id:group.id,level:'full',create:true,fields:{}},
      {kind:'user',id:designer.id,level:'full',create:true,fields:{}},
      {kind:'user',id:member.id,level:'full',create:null,fields:{...(privateField?{[privateField.id]:'none'}:{}),...(price?{[price.id]:'read'}:{})}},
    ]}, actorId);
  }
  const foreign = await app.execute('get_foreign_access', {workspaceId: workspace.id}, actorId) as ForeignSettings;
  await app.execute('configure_foreign_access', {...foreign, rules: [
    {id:v7(),requester:{kind:'user',id:member.id},owner:{kind:'user',id:designer.id},level:'full',confidential:false,objects:{}},
    {id:v7(),requester:{kind:'user',id:designer.id},owner:{kind:'group',id:group.id},level:'read',confidential:true,objects:{}},
  ], users: [{userId:member.id,inherit:true,manageOwn:false},{userId:designer.id,inherit:true,manageOwn:true}]}, actorId);
  async function security(name: string, row: DataRecord, policy: RecordSecurity) {
    const current = await app.execute('get_record', {objectTypeId:objects[name].id, recordId:row.id}, actorId) as DataRecord;
    return app.execute('configure_record_security', {objectTypeId:objects[name].id, recordId:row.id, version:current.version, policy, confirmPublic:policy.publicLevel !== null}, actorId);
  }
  const own = (kind: 'user'|'group', id: string): RecordSecurity => ({owners:[{kind,id,level:'full'}],publicLevel:null,privacy:'normal',foreignMax:'full',fields:[]});
  await security('tasks',records.tasks[0],own('user',member.id));
  await security('tasks',records.tasks[1],own('group',group.id));
  await security('tasks',records.tasks[2],{...own('user',designer.id),privacy:'personal'});
  await security('tasks',records.tasks[3],{...own('user',designer.id),privacy:'confidential'});
  await security('contracts',records.contracts[0],own('group',group.id));
  await security('contracts',records.contracts[1],own('user',designer.id));

  await object('access_checks', 'Berechtigungstests', 'Access checks', [
    {...field('expected_result', 'Erwartetes Ergebnis', 'Expected result', 'multiline'), required:true},
    field('sample_amount', 'Beispielbetrag', 'Sample amount', 'decimal', {scale:2}),
  ], ['Berechtigungstest'], ['Aktiv']);
  const accessBefore = await app.execute('get_content_permissions', {objectTypeId:objects.access_checks.id}, actorId) as ContentPermissions;
  await app.execute('configure_content_permissions', {...accessBefore,sensitive:true,grants:[designer,member].map(user=>({kind:'user',id:user.id,level:'full',create:true,fields:{}}))}, actorId);
  for (const level of ['none','availability','read','duplicate','schedule','edit','delete','full'] as AccessLevel[]) {
    const row = await record('access_checks', `Foreign access – ${level}`, {expected_result:`James has ${level} access through foreign access to Jane, bounded by this record's foreign maximum. Availability has no content projection yet. Jane owns this record with Full; John is Administrator.`,sample_amount:'1234567.89'});
    await security('access_checks',row,{...own('user',designer.id),foreignMax:level});
  }
  for (const privacy of ['personal','confidential'] as const) {
    const row=await record('access_checks',`Privacy – ${privacy}`,{expected_result:`Jane owns this ${privacy} record. James's foreign rule does not grant access. John retains Administrator access.`,sample_amount:'0.00'});
    await security('access_checks',row,{...own('user',designer.id),privacy});
  }
  const publicRow=await record('access_checks','Workspace-public – read',{expected_result:'No named owners; James and Jane can read. John has Administrator access. Other object ceilings still apply.',sample_amount:'-1234.56'});
  await security('access_checks',publicRow,{owners:[],publicLevel:'read',privacy:'normal',foreignMax:'full',fields:[]});
  const exception=await record('access_checks','Direct ownership – field exception',{expected_result:'James owns this record with Full but cannot read Sample amount. Direct ownership takes precedence over the foreign rule.',sample_amount:'98765.43'});
  await security('access_checks',exception,{...own('user',member.id),fields:[{kind:'user',id:member.id,fields:{[objects.access_checks.fields.find(item=>item.technicalName==='sample_amount')!.id]:'none'}}]});

  // Real lifecycle samples retain values/history and expose inactive definitions.
  const retired=objects.devices.fields.find(item=>item.technicalName==='retired_tag')!;
  await app.execute('set_definition_state',{kind:'field',id:retired.id,expectedState:'active',state:'inactive'},actorId);
  const archived=await app.execute('create_object_type',{workspaceId:workspace.id,technicalName:'retired_equipment',labels:labels('Ausgemusterte Geräte','Retired equipment'),standardFields:['keyword']},actorId) as {id:string};
  await app.execute('create_record',{objectTypeId:archived.id,keyword:'Archived workshop scanner'},actorId);
  await app.execute('set_definition_state',{kind:'object_type',id:archived.id,expectedState:'active',state:'inactive'},actorId);

  // Explicit bilingual groups demonstrate form layout independently of column order.
  for (const name of Object.keys(objects)) {
    let model=await app.execute('get_object_type',{objectTypeId:objects[name].id},actorId) as ObjectDefinition;
    const general:FormEntry[]=[],details:FormEntry[]=[],relations:FormEntry[]=[];
    for(const item of model.fields.filter(item=>item.state==='active')) {
      const standard=['keyword','type','status','category','access_principals'].includes(item.technicalName);
      (standard?general:details).push({fieldId:item.id,width:['keyword','category','access_principals'].includes(item.technicalName)||['multiline','multiple_choice'].includes(item.kind)?'full':'half'});
    }
    for(const item of model.formRelationships??[])relations.push(item.definition.kind==='primary'?{primary:true,width:'full',visible:true}:{relationshipTypeId:item.definition.id,side:item.side,width:(item.side==='left'?item.definition.leftMax:item.definition.rightMax)===1?'half':'full',visible:true,expanded:'open'});
    const groups=[{id:'general',labels:labels('Allgemein','General'),fields:general},{id:'details',labels:labels('Details','Details'),fields:details},...(relations.length?[{id:'relationships',labels:labels('Verknüpfungen','Relationships'),fields:relations}]:[])];
    model=await app.execute('configure_form_layout',{objectTypeId:model.id,version:model.version,layout:{groups}},actorId) as ObjectDefinition;
    if(name==='contacts') {
      await app.execute('configure_form_layout',{objectTypeId:model.id,version:model.version,context:'projects',layout:{groups:groups.map(item=>item.id==='details'?{...item,fields:item.fields.filter(entry=>'fieldId'in entry&&!model.fields.some(f=>f.id===entry.fieldId&&['commercial_register','birthday'].includes(f.technicalName)))}:item)}},actorId);
    }
    objects[name]=await app.execute('get_object_type',{objectTypeId:model.id},actorId) as ObjectDefinition;
    // Return current versions after relationship/security changes, not stale creation snapshots.
    for(let i=0;i<records[name].length;i++)records[name][i]=await app.execute('get_record',{objectTypeId:model.id,recordId:records[name][i].id},actorId) as DataRecord;
  }
  return { workspaceId: workspace.id, objects, records, links, accounts, groups: {team: group.id, management: management.id} };
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
    const technicalName=({primary:'primary_association',contact_person:'contact_person',vehicle:'case_vehicle',general:'general_relation',identity:'contact_identities',coverage:'device_coverage',assigned_vehicle:'vehicle_equipment'} as const)[link.relation];
    const type=definitions.find(type=>type.technicalName===technicalName);if(!type)throw new Error('Demo relationship definition missing');
    const snapshot=await app.execute('get_record_relationships',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as import('@xobject/contracts').RecordRelationships;
    const field=snapshot.fields.find(field=>field.definition.id===type.id&&field.side==='left');if(!field)throw new Error('Demo relationship side missing');
    if(field.targets.some(target=>target.objectTypeId===link.to.objectTypeId&&target.recordId===link.to.recordId))continue;
    const record=await app.execute('get_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId,version:record.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[...field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId})),link.to]}]},actorId);
  }
}
