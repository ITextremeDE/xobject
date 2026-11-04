import {contactExtensionLayout,resolveFormLayout} from '@xobject/contracts';
import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import type { ContentPermissions, ForeignSettings, ManagedUser, RecordSecurity, Workspace, WorkspaceGroup, AccessLevel, ClassificationRules, CustomFieldKind, FieldConfig, FieldValue, ObjectDefinition, DataRecord } from '@xobject/contracts';
import {emptyFieldInputRules,defaultNumbering} from '@xobject/contracts';
import { Application } from './domain.js';
import type { Database } from './database.js';

type Labels = { de: string; en: string };
type SeedField = { name: string; labels: Labels; kind?: CustomFieldKind; config?: FieldConfig; required?: boolean };
export type DemoLink = { from: { objectTypeId: string; recordId: string }; to: { objectTypeId: string; recordId: string }; relation: 'primary' | 'contact_person' | 'vehicle' | 'general' | 'identity' | 'coverage' | 'assigned_vehicle' | 'distribution_member' };
const labels = (de: string, en: string): Labels => ({ de, en });
const field = (name: string, de: string, en: string, kind: CustomFieldKind = 'text', config?: FieldConfig): SeedField => ({ name, labels: labels(de, en), kind, config:kind==='multiline'?{formatted:true,...config}:config });

const choiceTranslations: Record<string, string> = {"Kunde": "Customer", "Lieferant": "Supplier", "Partner": "Partner", "Aktiv": "Active", "In Klärung": "Under review", "Inaktiv": "Inactive", "Kundenprojekt": "Customer project", "Internes Projekt": "Internal project", "Geplant": "Planned", "In Arbeit": "In progress", "Abgeschlossen": "Completed", "Arbeitspaket": "Work package", "Servicefall": "Service request", "Offen": "Open", "Erledigt": "Done", "Aufgabe": "Task", "Rückfrage": "Question", "Servicefahrzeug": "Service vehicle", "Poolfahrzeug": "Pool vehicle", "Verfügbar": "Available", "Im Einsatz": "In use", "In Wartung": "Under maintenance", "Intern": "Internal", "Kundenarbeit": "Customer work", "Priorität": "Priority", "Versicherung": "Insurance", "Wartung": "Maintenance", "Entwurf": "Draft", "Ausgelaufen": "Expired", "Berechtigungstest": "Access check", "Notebook": "Laptop", "Diagnosegerät": "Diagnostic tool"};
const choiceLabels = (de: string): Labels => labels(de, choiceTranslations[de] ?? de);

const demoBriefs:Record<string,{title:string;focus:string;steps:string[]}>= {
 contacts:{title:'Contact notes',focus:'Maintain a reliable contact profile and keep organization and person identities separate.',steps:['Confirm the preferred telephone number and email address.','Review organization membership and related identities.','Record the next conversation here; keep access settings intentional.']},
 projects:{title:'Project brief',focus:'Coordinate scope, ownership and a clear outcome across the linked Cases and Tasks.',steps:['Confirm scope, budget and the target date with the project owner.','Use Cases for discovery and implementation work.','Review open Tasks before the next project meeting.']},
 cases:{title:'Case brief',focus:'Keep the working context, decisions and acceptance criteria together.',steps:['Document the current workflow and unanswered questions.','Assign follow-up Tasks and check the linked Project.','Review the result with the responsible person before closing the Case.']},
 tasks:{title:'Work instructions',focus:'Complete one concrete result and document the outcome for the next person.',steps:['Check the assignment, due date and parent context.','Carry out the work and note any blockers.','Review the result and update the Task status when finished.']},
 vehicles:{title:'Vehicle notes',focus:'Keep the service vehicle available and its operational information current.',steps:['Check mileage, equipment and upcoming maintenance.','Review the linked service Cases and dedicated device.','Report damage or availability changes before the next assignment.']},
 distribution_lists:{title:'Distribution notes',focus:'Maintain the intended audience without duplicating contact data.',steps:['Review the linked members and their current contact details.','Remove obsolete memberships through the relationship controls.','Check the audience before any future communication.']},
 contracts:{title:'Contract review',focus:'Track coverage, commercial conditions and upcoming renewal decisions.',steps:['Review the validity dates and selected services.','Check the covered devices and associated costs.','Record the renewal decision before the contract expires.']},
 devices:{title:'Equipment instructions',focus:'Keep the device identifiable, usable and assigned to the correct custodians.',steps:['Verify the serial number and physical condition.','Check support contacts and the related service agreement.','Return the device with its accessories after use.']},
};
function demoMarkdown(objectName:string,keyword:string,original:string):string{
 const brief=demoBriefs[objectName]??{title:'Review notes',focus:'Review this fictional record and its linked context.',steps:['Inspect the fields and relationships.','Check the expected access behavior.','Record the test outcome.']};
 return [`## ${brief.title}`,`**Record:** ${keyword}`, '*Fictional demonstration text. The dated notes below are sample content, not journal events.*',original||brief.focus,`### Next actions\n${brief.steps.map(step=>'- '+step).join('\n')}`,'### Working notes','----- Nov 2, 2026 9:15 AM (John Doe) -----\nPrepared the initial information. '+brief.focus,'----- Nov 3, 2026 2:35 PM (Jane Doe) -----\nReviewed the details and linked records. The next review should confirm the open actions and document any changes.','> Keep business notes here. The journal independently records who actually saved each change.'].join('\n\n');
}

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
  await app.execute('configure_workspace_module',{workspaceId:workspace.id,key:'contacts',enabled:true,version:1},actorId);
  const installed=await app.execute('list_object_types',{workspaceId:workspace.id},actorId) as {id:string;technicalName:string}[];
  const objects: Record<string, ObjectDefinition> = {}, records: Record<string, DataRecord[]> = {}, links: DemoLink[] = [];
  const group = await app.execute('create_group', { workspaceId: workspace.id, name: 'Project team' }, actorId) as { id: string };
  await app.execute('configure_group_inheritance', { workspaceId: workspace.id, groupId: group.id, version: 1, members:[{kind:'user',id:member.id,level:'full'}] }, actorId);
  const management = await app.execute('create_group', { workspaceId: workspace.id, name: 'Management', members: [{kind: 'user', id: designer.id, level: 'full'}, {kind: 'group', id: group.id, level: 'read'}] }, actorId) as WorkspaceGroup;
  async function object(name: string, de: string, en: string, fields: SeedField[], types: string[], statuses: string[]) {
    const created = installed.find(item=>item.technicalName===name) ?? await app.execute('create_object_type', { workspaceId: workspace.id, technicalName: name, labels: labels(de, en), standardFields: ['keyword', 'type_status', 'category'] }, actorId) as { id: string };
    let model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    const keyword = model.fields.find(item => item.technicalName === 'keyword')!;
    if(!keyword.isDerived)await app.execute('configure_field', { fieldId: keyword.id, version: keyword.version, required: true }, actorId);
    for (const item of fields) {
      if(model.fields.some(existing=>existing.technicalName===item.name))throw new Error('Demo field duplicates a supplied field');
      const rules=emptyFieldInputRules();
      if(['registration_number','serial_number','contract_number'].includes(item.name)){rules.unique=true;rules.description=labels('Eindeutige Kennung dieses Datensatzes.','Unique identifier for this record.');rules.helpText=labels('Eine bereits verwendete Kennung darf nicht erneut vergeben werden.','An identifier already in use cannot be assigned again.');}
      if(item.name==='country'){rules.defaultValue='Germany';rules.description=labels('Land der Anschrift.','Country of the postal address.');rules.helpText=labels('Den englischen Ländernamen verwenden.','Use the English country name.');}
      if(item.name==='completed')rules.defaultValue=false;
      if(item.name==='mileage'){rules.defaultValue='0';rules.description=labels('Aktueller Kilometerstand des Fahrzeugs.','Current vehicle mileage.');rules.helpText=labels('Ganze Kilometer ohne Einheit eingeben.','Enter whole kilometres without a unit.');}
      await app.execute('create_field', { objectTypeId: created.id, technicalName: item.name, labels: item.labels, kind: item.kind ?? 'text', config: item.config, required: item.required ?? false,inputRules:rules }, actorId);
    }
    model=await app.execute('get_object_type',{objectTypeId:created.id},actorId) as ObjectDefinition;
    if(name!=='distribution_lists')await app.execute('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,numbering:{...defaultNumbering(),enabled:true,prefix:({contacts:'CON',projects:'PRJ',cases:'CAS',tasks:'TSK',vehicles:'VEH',contracts:'CTR',devices:'DEV',access_checks:'CHK',distribution_lists:'DST'} as Record<string,string>)[name]+'-',padding:5}},actorId);
    const typeOptions = types.map(name => ({ id: v7(), kind: 'type' as const, labels: choiceLabels(name), typeId: null, active: true }));
    const statusOptions = [null, ...typeOptions.map(item => item.id)].flatMap(typeId => statuses.map(name => ({ id: v7(), kind: 'status' as const, labels: choiceLabels(name), typeId, active: true })));
    const config: ClassificationRules = { type: { required: false, defaultId: typeOptions[0]?.id ?? null }, status: { required: false, defaults: [null, ...typeOptions.map(item => item.id)].map(typeId => ({ typeId, statusId: statusOptions.find(item => item.typeId === typeId)!.id })) }, category: { required: false, multiple: true, defaultIds: [] }, options: [...typeOptions, ...statusOptions, ...['Intern', 'Kundenarbeit', 'Priorität'].map(name => ({ id: v7(), kind: 'category' as const, labels: choiceLabels(name), typeId: null, active: true }))] };
    await app.execute('configure_classification', { objectTypeId: created.id, version: model.classification.version, config }, actorId);
    model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    objects[name] = model; records[name] = []; return model;
  }
  async function record(objectName: string, keyword: string, values: Record<string, FieldValue>, statusIndex = 0) {
    const model = objects[objectName];
    values={...values};
    for(const field of model.fields.filter(field=>field.kind==='multiline'&&field.config.formatted))if(values[field.technicalName]!==null)values[field.technicalName]=demoMarkdown(objectName,keyword,typeof values[field.technicalName]==='string'?values[field.technicalName] as string:'');
    const types = model.classification.options.filter(option => option.kind === 'type');
    const typeId = types[records[objectName].length % types.length].id;
    const statuses = model.classification.options.filter(option => option.kind === 'status' && option.typeId === typeId);
    const category = model.classification.options.filter(option => option.kind === 'category')[objectName === 'contacts' ? 1 : 0];
    const row = await app.execute('create_record', { objectTypeId: model.id, ...(!model.fields.some(field=>field.technicalName==='keyword'&&field.isDerived)?{keyword}:{}), values, classification: { type: typeId, status: statuses[statusIndex % statuses.length].id, category: [category.id] } }, actorId) as DataRecord;
    records[objectName].push(row); return row;
  }
  function link(fromObject: string, from: DataRecord, toObject: string, to: DataRecord, relation: DemoLink['relation'] = 'primary') {
    links.push({ from: { objectTypeId: objects[fromObject].id, recordId: from.id }, to: { objectTypeId: objects[toObject].id, recordId: to.id }, relation });
  }
  await object('contacts', 'Kontakte', 'Contacts', [], ['Kunde', 'Lieferant', 'Partner'], ['Aktiv', 'In Klärung', 'Inaktiv']);
  const contactKinds=objects.contacts.fields.find(item=>item.technicalName==='contact_kind')!.config.options!;
  const contactChoice=(purpose:string,label:string)=>objects.contacts.fields.find(f=>f.id===objects.contacts.contactProfile!.fields[purpose])!.config.options!.find(o=>o.labels.en===label)!.id;
  const name=(text:string)=>[{id:v7(),text}];
  const email=(value:string,purpose='emails',context='Work')=>[{id:v7(),value,contexts:purpose==='phones'?[contactChoice(purpose,'Work'),contactChoice(purpose,context==='Work'?'Voice calls':context)]:[contactChoice(purpose,context)],preference:1}];
  const address=(street:string,houseNumber:string)=>[{id:v7(),contexts:[contactChoice('addresses','Work')],preference:1,address:{poBox:'',extended:'',streetLines:[street],houseNumber,postalCode:'80331',locality:'Munich',region:'Bavaria',country:'Germany',formatted:''}}];
  const organizations: DataRecord[] = [];
  const companies = ['Northlight Workshops Ltd', 'Forest Mobility Cooperative', 'Clearwater Technology Ltd', 'Sunridge Arts Association', 'Harbour Planning Ltd', 'Meadow Logistics Ltd'];
  for (let i = 0; i < companies.length; i++) organizations.push(await record('contacts', companies[i], { contact_kind: contactKinds[0].id, company_name: companies[i], emails: email(`contact${i+1}@example.test`), phones: email(`+4989201000${10+i}`,'phones'), websites: email('https://example.org','websites'), addresses: address(['Workshop Road','Forest Lane','River Street'][i%3],String(i+1)), commercial_register: i === 3 ? 'VR 900004 (fictional)' : `HRB ${900001+i} (fictional)`, notes: 'Fictional organization for project and contact-person testing.' }));
  for (const [i, person] of [['Emily','Example'],['Oliver','Sample'],['Emily','Example']].entries()) {
    const individual = i === 2;
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[i]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, salutation:contactChoice('salutation',i===1?'Mr':'Ms'), name_prefix:i===0?contactChoice('name_prefix','Dr.'):null, first_name: name(person[0]), last_name: name(person[1]), emails: email(`person${i+1}@example.test`), phones: email(`+4989201000${30+i}`,'phones','Mobile'), birthday: {year:i===2?null:1990+i,month:6,day:15}, addresses: address('Example Lane','10'), notes: individual ? 'Independent individual contact for a future standalone project.' : `Organization: ${companies[i]}. The relationship is stored as a real link.` });
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
  await object('distribution_lists','Verteiler','Distribution lists',[],['Partner'],['Aktiv','Inaktiv']);
  const distribution=await record('distribution_lists','Workshop partners',{description:'Contacts involved in workshop planning.\nIncludes organization and contact-person records.\nMembership is maintained manually.',notes:'Fictional working notes for reviewing the workshop partner audience.'});
  for(const target of [organizations[0],organizations[1],records.contacts[6]])link('distribution_lists',distribution,'contacts',target,'distribution_member');
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
    field('supplier_email','Lieferanten-E-Mail','Supplier email','email'),field('support_phone','Support-Telefon','Support telephone','phone'),field('support_portal','Support-Portal','Support portal','url'),
    field('support_emails','Support-E-Mail-Adressen','Support email addresses','structured',{schema:'email_entries',options:[]}),
  ], ['Notebook', 'Diagnosegerät'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  for (let i = 0; i < 3; i++) await record('contracts', ['Workshop equipment cover', 'Mobile service maintenance', 'Expired equipment cover'][i], {
    contract_number: `DEMO-${2026}-${100+i}`, valid_from: '2026-01-01', valid_until: i === 2 ? '2026-06-30' : '2027-12-31',
    annual_fee: {amount: ['1234.56', '98765.43', '0.00'][i], currency: 'EUR'}, services: serviceOptions.slice(0, i+1).map(option => option.id), renewal: i === 0,
    internal_notes: 'Fictional pricing note. This field is hidden from James by the object-level field ceiling.',
  }, i);
  for (let i = 0; i < 4; i++) await record('devices', ['Workshop laptop', 'Mobile diagnostic kit', 'Spare laptop', 'Unassigned diagnostic kit'][i], {
    supplier_email:`supplier${i+1}@example.test`,support_phone:'+498920100010',support_portal:'https://example.org/support',
    support_emails:[{id:v7(),value:`support${i+1}@example.test`,contexts:[],preference:1}],
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
    const baseGroups=resolveFormLayout(undefined,model.fields.filter(item=>item.state==='active'),true,model.formRelationships??[]).groups;
    const groups=model.contactProfile?contactExtensionLayout(model.contactProfile,model.fields,{groups:baseGroups})!.groups.filter(g=>g.fields.length):baseGroups;
    model=await app.execute('configure_form_layout',{objectTypeId:model.id,version:model.version,layout:{groups}},actorId) as ObjectDefinition;
    if(name==='contacts') {
      await app.execute('configure_form_layout',{objectTypeId:model.id,version:model.version,context:'projects',layout:{groups}},actorId);
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
    const technicalName=({primary:'primary_association',contact_person:'contact_person',vehicle:'case_vehicle',general:'general_relation',identity:'contact_identity',coverage:'device_coverage',assigned_vehicle:'vehicle_equipment',distribution_member:'distribution_members'} as const)[link.relation];
    const type=definitions.find(type=>type.technicalName===technicalName);if(!type)throw new Error('Demo relationship definition missing');
    const snapshot=await app.execute('get_record_relationships',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as import('@xobject/contracts').RecordRelationships;
    const field=snapshot.fields.find(field=>field.definition.id===type.id&&field.side==='left');if(!field)throw new Error('Demo relationship side missing');
    if(field.targets.some(target=>target.objectTypeId===link.to.objectTypeId&&target.recordId===link.to.recordId))continue;
    const record=await app.execute('get_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId,version:record.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[...field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId})),link.to]}]},actorId);
  }
}
