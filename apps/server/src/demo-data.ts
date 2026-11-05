import {workFormLayout,contactExtensionLayout,resolveFormLayout} from '@xobject/contracts';
import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import type { ContentPermissions, ForeignSettings, ManagedUser, RecordSecurity, Workspace, WorkspaceGroup, AccessLevel, ClassificationRules, CustomFieldKind, FieldConfig, FieldValue, ObjectDefinition, DataRecord } from '@xobject/contracts';
import {emptyFieldInputRules,defaultNumbering} from '@xobject/contracts';
import { Application } from './domain.js';
import type { Database } from './database.js';

type Labels = { de: string; en: string };
type SeedField = { name: string; labels: Labels; kind?: CustomFieldKind; config?: FieldConfig; required?: boolean };
export type DemoLink = { from: { objectTypeId: string; recordId: string }; to: { objectTypeId: string; recordId: string }; relation: 'primary' | 'contact_person' | 'general' | 'identity' | 'support' | 'equipment' | 'distribution_member' };
const labels = (de: string, en: string): Labels => ({ de, en });
const field = (name: string, de: string, en: string, kind: CustomFieldKind = 'text', config?: FieldConfig): SeedField => ({ name, labels: labels(de, en), kind, config:kind==='multiline'?{formatted:true,...config}:config });

const choiceTranslations: Record<string, string> = {"Kunde": "Customer", "Lieferant": "Supplier", "Partner": "Partner", "Aktiv": "Active", "In Klärung": "Under review", "Inaktiv": "Inactive", "Kundenprojekt": "Customer project", "Internes Projekt": "Internal project", "Geplant": "Planned", "In Arbeit": "In progress", "Abgeschlossen": "Completed", "Arbeitspaket": "Work package", "Servicefall": "Service request", "Offen": "Open", "Erledigt": "Done", "Aufgabe": "Task", "Rückfrage": "Question", "Servicefahrzeug": "Service vehicle", "Poolfahrzeug": "Pool vehicle", "Verfügbar": "Available", "Im Einsatz": "In use", "In Wartung": "Under maintenance", "Intern": "Internal", "Kundenarbeit": "Customer work", "Priorität": "Priority", "Fernbetreuung": "Remote support", "Vor-Ort-Betreuung": "On-site care", "Versicherung": "Insurance", "Wartung": "Maintenance", "Entwurf": "Draft", "Ausgelaufen": "Expired", "Berechtigungstest": "Access check", "Notebook": "Laptop", "Diagnosegerät": "Diagnostic tool"};
const choiceLabels = (de: string): Labels => labels(de, choiceTranslations[de] ?? de);

const demoBriefs:Record<string,{title:string;focus:string;steps:string[]}>= {
 contacts:{title:'Contact notes',focus:'Maintain a reliable contact profile and keep organization and person identities separate.',steps:['Confirm the preferred telephone number and email address.','Review organization membership and related identities.','Record the next conversation here; keep access settings intentional.']},
 projects:{title:'Project brief',focus:'Coordinate scope, ownership and a clear outcome across the linked Cases and Tasks.',steps:['Confirm scope, budget and the target date with the project owner.','Use Cases for discovery and implementation work.','Review open Tasks before the next project meeting.']},
 cases:{title:'Case brief',focus:'Keep the working context, decisions and acceptance criteria together.',steps:['Document the current workflow and unanswered questions.','Assign follow-up Tasks and check the linked Project.','Review the result with the responsible person before closing the Case.']},
 tasks:{title:'Work instructions',focus:'Complete one concrete result and document the outcome for the next person.',steps:['Check the assignment, due date and parent context.','Carry out the work and note any blockers.','Review the result and update the Task status when finished.']},
 mobile_workshops:{title:'Mobile workshop overview',focus:'Keep the mobile workshop ready for the next on-site visit.',steps:['Check mileage, equipment and upcoming maintenance.','Review the linked service Cases and dedicated device.','Report damage or availability changes before the next assignment.']},
 distribution_lists:{title:'Distribution notes',focus:'Maintain the intended audience without duplicating contact data.',steps:['Review the linked members and their current contact details.','Remove obsolete memberships through the relationship controls.','Check the audience before any future communication.']},
 support_packages:{title:'Support package overview',focus:'Describe the agreed care services, package duration and review criteria.',steps:['Review the validity dates and selected services.','Check the supported tools and associated costs.','Record the renewal decision before the package ends.']},
 workshop_tools:{title:'Equipment instructions',focus:'Keep the device identifiable, usable and assigned to the correct custodians.',steps:['Verify the serial number and physical condition.','Check support contacts and the selected support package.','Return the device with its accessories after use.']},
};
function demoDescription(objectName:string,keyword:string,original:string):string{
 const brief=demoBriefs[objectName]??{title:'Overview',focus:'Inspect the record and its linked context.',steps:['Review the available information.','Agree the next action.','Check the result.']};
 const context=original.replace(/^#{1,6}\s+/gm,'').trim()||brief.focus;
 return [`## ${brief.title}`,`**${keyword}**`,context,`### Purpose\n${brief.focus}`,
  `### Scope\n${brief.steps.map(step=>'- '+step).join('\n')}`,
  '### Acceptance\n1. Confirm the details with the owner.\n2. Check the linked records and any open questions.\n3. Record the outcome in Notes.',
  '> Review the facts before making a decision. Keep the description focused on the agreed scope.',
  '### Working convention\nUse **bold** for the expected result, *italics* for context and `record references` for exact identifiers.',
  '```text\nReview → Agree → Verify\n```',
  'Further reading: [Example reference](https://example.org/).',
  '---', '*This record belongs to the fictional ITextreme demonstration.*'].join('\n\n');
}
function demoNotes(objectName:string,keyword:string,privateNotes=false):string{
 const history:Record<string,string[]>={
  contacts:['Verified the name, contact channels and postal address.','Checked the organization membership and related identities.','Updated the preferred contact route after the follow-up conversation.'],
  projects:['Agreed the objective and initial scope with the project owner.','Reviewed the planned milestones and collected the open questions.','Checked progress with the team and handed the next steps to the linked Cases.'],
  cases:['Recorded the request and captured the current situation.','Reviewed the acceptance criteria and linked the relevant working records.','Assigned the follow-up Tasks and documented the agreed next review.'],
  tasks:['Clarified the expected result and checked the assignment.','Carried out the first checks and recorded a remaining dependency.','Reviewed the available result and prepared the next handover.'],
  mobile_workshops:['Checked the mobile workshop, accessories and mileage before dispatch.','Reviewed the equipment list with the on-site team.','Completed the return inspection and reported the next maintenance check.'],
  support_packages:['Agreed the selected services and recorded the package period.','Checked the supported tools and reviewed the proposed service costs.','Confirmed the next package review with the support team.'],
  workshop_tools:['Recorded the serial number and checked the delivered accessories.','Tested the tool and assigned the responsible support team.','Completed the inspection and prepared the tool for its next assignment.'],
  distribution_lists:['Compiled the initial audience for workshop planning.','Reviewed the linked members and removed a duplicate suggestion.','Confirmed the audience with the coordination team.']
 };
 const events=privateNotes?['Recorded the proposed service costs and internal review limit.','Reviewed the restricted pricing assumptions with the package owner.','Prepared the internal follow-up for the next commercial review.']:history[objectName]??['Created the working record.','Checked the entered values.','Reviewed the next action.'];
 return [`----- Nov 2, 2026 9:15 AM (John Doe) -----\n${events[0]}\nRecord: ${keyword}.`,
  `----- Nov 3, 2026 2:35 PM (Jane Doe) -----\n${events[1]}`,
  `----- Nov 4, 2026 10:20 AM (James Doe) -----\n${events[2]}`].join('\n\n');
}

function demoGuide(keyword:string):string{
 return `## Operating guide\n\nBefore using **${keyword}**, check its condition and identify the responsible team.\n\n### Preparation\n1. Inspect the equipment.\n2. Check the power supply and accessories.\n3. Confirm the current support package.\n\n### During use\n- Follow the agreed procedure.\n- Stop if the condition changes.\n\n> Report defects before the next handover.\n\nUse the identifier printed on the tool, for example \`TOOL-1000\`.\n\n\`\`\`text\nInspect → Use → Clean → Return\n\`\`\`\n\n[Reference instructions](https://example.org/support)`;
}

/** Demo-only authored layouts exhibit the designer; module starter forms remain canonical. */
function customDemoGroups(name:string,groups:import('@xobject/contracts').FormLayout['groups'],fields:ObjectDefinition['fields']):import('@xobject/contracts').FormLayout['groups']{
 const plans:Record<string,{id:string;labels:Labels;names:string[];width:'half'|'full'}[]>={
  mobile_workshops:[{id:'workshop_identity',labels:labels('Werkstattprofil','Workshop profile'),names:['keyword','business_number','registration_number','manufacturer','model'],width:'half'},{id:'operation',labels:labels('Betrieb & Kosten','Operation & costs'),names:['first_registration','mileage','electric','purchase_price'],width:'half'}],
  support_packages:[{id:'package_identity',labels:labels('Paketübersicht','Package overview'),names:['keyword','business_number','package_code','valid_from','valid_until'],width:'half'},{id:'service_terms',labels:labels('Leistungen & Konditionen','Services & terms'),names:['services','annual_fee','renewal','access_principals'],width:'half'},{id:'restricted_notes',labels:labels('Interner Verlauf','Internal history'),names:['internal_notes'],width:'full'}],
  workshop_tools:[{id:'tool_identity',labels:labels('Geräteprofil','Tool profile'),names:['keyword','business_number','serial_number','model'],width:'half'},{id:'inventory',labels:labels('Bestand & Bewertung','Inventory & valuation'),names:['quantity','weight','purchase_price'],width:'half'},{id:'support',labels:labels('Team & Support','Team & support'),names:['custodians','supplier_email','support_phone','support_portal','support_emails'],width:'full'},{id:'inspection',labels:labels('Prüfung & Freigabe','Inspection & release'),names:['last_inspection','inspection_result','inspected_by'],width:'full'},{id:'guide',labels:labels('Bedienung','Operating guide'),names:['instructions'],width:'full'}]
 };
 const plan=[{id:'overview',labels:labels('Überblick','Overview'),names:['description'],width:'full' as const},...plans[name]];
 const entries=groups.flatMap(group=>group.fields),assigned=new Set(plan.flatMap(plan=>plan.names).map(name=>fields.find(field=>field.technicalName===name)?.id).filter(Boolean));
 const remaining=groups.map(group=>({...group,fields:group.fields.filter(entry=>!('fieldId'in entry)||!assigned.has(entry.fieldId))})).filter(group=>group.fields.length);
 const authored=plan.map(plan=>({id:plan.id,labels:plan.labels,width:plan.width,fields:plan.names.flatMap(name=>entries.filter(entry=>'fieldId'in entry&&entry.fieldId===fields.find(field=>field.technicalName===name)?.id)).map(entry=>({...entry,width:'full' as const}))}));
 const notes=remaining.filter(group=>group.id==='notes'),body=remaining.filter(group=>group.id!=='notes');
 return [...authored,...body,...notes];
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
  const availableModules=await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[];
  for(const available of availableModules.filter(module=>module.available)){
    const current=(await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[]).find(module=>module.key===available.key)!;
    if(!current.enabled)await app.execute('configure_workspace_module',{workspaceId:workspace.id,key:current.key,enabled:true,version:current.version},actorId);
  }
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
      if(['registration_number','serial_number','package_code'].includes(item.name)){rules.unique=true;rules.description=labels('Eindeutige Kennung dieses Datensatzes.','Unique identifier for this record.');rules.helpText=labels('Eine bereits verwendete Kennung darf nicht erneut vergeben werden.','An identifier already in use cannot be assigned again.');}
      if(item.name==='country'){rules.defaultValue='Germany';rules.description=labels('Land der Anschrift.','Country of the postal address.');rules.helpText=labels('Den englischen Ländernamen verwenden.','Use the English country name.');}
      if(item.name==='completed')rules.defaultValue=false;
      if(item.name==='mileage'){rules.defaultValue='0';rules.description=labels('Aktueller Kilometerstand des Fahrzeugs.','Current mileage of the mobile workshop.');rules.helpText=labels('Ganze Kilometer ohne Einheit eingeben.','Enter whole kilometres without a unit.');}
      await app.execute('create_field', { objectTypeId: created.id, technicalName: item.name, labels: item.labels, kind: item.kind ?? 'text', config: item.config, required: item.required ?? false,inputRules:rules }, actorId);
    }
    model=await app.execute('get_object_type',{objectTypeId:created.id},actorId) as ObjectDefinition;
    if(name!=='distribution_lists')await app.execute('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,numbering:{...defaultNumbering(),enabled:true,prefix:({contacts:'CON',projects:'PRJ',cases:'CAS',tasks:'TSK',mobile_workshops:'MWK',support_packages:'SUP',workshop_tools:'TOOL',access_checks:'CHK',distribution_lists:'DST'} as Record<string,string>)[name]+'-',padding:5}},actorId);
    const typeOptions = types.map(name => ({ id: v7(), kind: 'type' as const, labels: choiceLabels(name), typeId: null, active: true }));
    const statusOptions = [null, ...typeOptions.map(item => item.id)].flatMap(typeId => statuses.map(name => ({ id: v7(), kind: 'status' as const, labels: choiceLabels(name), typeId, active: true,...(model.workProfile?.kind==='task'?{meaning:(['open','in_progress','done'] as const)[statuses.indexOf(name)]}:{}) })));
    const config: ClassificationRules = { type: { required: false, defaultId: typeOptions[0]?.id ?? null }, status: { required: false, defaults: [null, ...typeOptions.map(item => item.id)].map(typeId => ({ typeId, statusId: statusOptions.find(item => item.typeId === typeId)!.id })) }, category: { required: false, multiple: true, defaultIds: [] }, options: [...typeOptions, ...statusOptions, ...['Intern', 'Kundenarbeit', 'Priorität'].map(name => ({ id: v7(), kind: 'category' as const, labels: choiceLabels(name), typeId: null, active: true }))] };
    await app.execute('configure_classification', { objectTypeId: created.id, version: model.classification.version, config }, actorId);
    model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    objects[name] = model; records[name] = []; return model;
  }
  async function record(objectName: string, keyword: string, values: Record<string, FieldValue>, statusIndex = 0) {
    const model = objects[objectName];
    values={...values};
    for(const field of model.fields.filter(field=>field.kind==='multiline'&&field.config.formatted)){
      const key=field.technicalName,original=typeof values[key]==='string'?values[key] as string:'';
      if(key==='notes'||key.endsWith('_notes'))values[key]=demoNotes(objectName,keyword,key==='internal_notes');
      else if(key==='description')values[key]=demoDescription(objectName,keyword,original);
      else if(key==='instructions')values[key]=demoGuide(keyword);
    }
    const types = model.classification.options.filter(option => option.kind === 'type');
    const typeId = types[records[objectName].length % types.length].id;
    const statuses = model.classification.options.filter(option => option.kind === 'status' && option.typeId === typeId);
    const category = model.classification.options.filter(option => option.kind === 'category')[objectName === 'contacts' ? 1 : 0];
    if(model.workProfile?.kind==='task'&&statuses[statusIndex % statuses.length].meaning==='done'){values.progress='100';values.completed_at='2026-11-03T14:35:00.000Z';}
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
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[i]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, salutation:contactChoice('salutation',i===1?'Mr':'Ms'), name_prefix:i===0?contactChoice('name_prefix','Dr.'):null, nickname: i===0?'Em':null, languages:[{id:v7(),value:'en-GB',contexts:[],preference:1},{id:v7(),value:'de-DE',contexts:[],preference:2}], messenger_addresses:[{id:v7(),value:`xmpp:person${i+1}@example.test`,contexts:[contactChoice('messenger_addresses','Work'),contactChoice('messenger_addresses','XMPP')],preference:1}], contact_time_zone:{timeZone:i===1?'America/New_York':'Europe/Berlin'}, anniversary:i===2?{year:null,month:9,day:12}:null, death_date:i===1?{year:2024,month:11,day:3}:null, first_name: name(person[0]), last_name: name(person[1]), emails: email(`person${i+1}@example.test`), phones: email(`+4989201000${30+i}`,'phones','Mobile'), birthday: {year:i===2?null:1990+i,month:6,day:15}, addresses: address('Example Lane','10'), notes: individual ? 'Independent individual contact for a future standalone project.' : `Organization: ${companies[i]}. The relationship is stored as a real link.` });
    if (!individual) link('contacts', organizations[i], 'contacts', row, 'contact_person');
  }
  await object('projects', 'Projekte', 'Projects', [], ['Kundenprojekt', 'Internes Projekt'], ['Geplant', 'In Arbeit', 'Abgeschlossen']);
  await object('cases', 'Vorgänge', 'Cases', [], ['Arbeitspaket', 'Servicefall'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('tasks', 'Aufgaben', 'Tasks', [], ['Aufgabe', 'Rückfrage'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('mobile_workshops', 'Mobile Werkstätten', 'Mobile workshops', [field('description','Beschreibung','Description','multiline'),field('registration_number', 'Kennzeichen', 'License plate'), field('manufacturer', 'Hersteller', 'Manufacturer'), field('model', 'Modell', 'Model'), field('first_registration', 'Erstzulassung', 'First registration', 'date'), field('mileage', 'Kilometerstand', 'Mileage', 'integer'), field('purchase_price', 'Anschaffungspreis', 'Purchase price', 'money'), field('electric', 'Elektroantrieb', 'Electric drive', 'boolean'), field('notes', 'Notizen', 'Notes', 'multiline')], ['Servicefahrzeug', 'Poolfahrzeug'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  const owners = { kind: 'user' as const, id: actorId }, team = { kind: 'group' as const, id: group.id };
  for (let i = 0; i < 4; i++) {
    const project = await record('projects', ['Northlight – Workshop modernization', 'Forest – Fleet planning', 'Clearwater – Service portal', 'Internal – Workplace modernization'][i], { description: `## Objective\n${['Simplify order intake and workshop operations.', 'Plan vehicle capacity and maintenance.', 'Handle service requests consistently.', 'Prepare new workstations for the team.'][i]}`, start_date: '2026-10-01', target_date: `2027-0${i+1}-28`, responsible: owners }, i%2);
    if (i<3) link('contacts', organizations[i], 'projects', project);
    for (let j=0;j<2;j++) {
      const currentCase = await record('cases', `${project.keyword} – ${j ? 'Implementation' : 'Discovery'}`, { description: j ? 'Prepare implementation and acceptance.' : 'Document requirements and existing workflows.', start_date:j?'2026-11-01':'2026-10-01',target_date:j?'2027-01-15':'2026-10-31', responsible: owners }, j);
      link('projects', project, 'cases', currentCase);
      for (let k=0;k<3;k++) {
        const done = k === 2 && j === 0;
        const task = await record('tasks', `${['Arrange meeting', 'Document results', 'Review checklist'][k]} – ${project.keyword} / ${j ? 'Implementation' : 'Discovery'}`, { description: `Part of ${currentCase.keyword}. Fictional task with a Primary association.`, start:k===0?{kind:'date',date:`2026-11-${10+i*2+j}`}:{kind:'zoned',local:`2026-11-${10+i*2+j}T09:00:00`,timeZone:'Europe/Berlin',occurrence:null}, due:k===0?{kind:'date',date:`2026-11-${11+i*2+j}`}:{kind:'zoned',local:`2026-11-${10+i*2+j}T13:00:00`,timeZone:'Europe/Berlin',occurrence:null}, responsible:owners, progress:done?'100':String(k*25) }, done?2:k%2);
        link('cases', currentCase, 'tasks', task);
      }
    }
    const directTask = await record('tasks', `Arrange project kickoff – ${project.keyword}`, { description: 'Assigned directly to the Project without a Case.' }, 0);
    link('projects', project, 'tasks', directTask);
  }
  const contactTask = await record('tasks', 'Update Northlight contact details', { description: 'Assigned directly to the Contact without a Project or Case.' });
  link('contacts', organizations[0], 'tasks', contactTask);
  await record('tasks', 'Review internal ideas', { description: 'Standalone task without a Primary association.', due:{kind:'instant',instant:'2026-11-18T16:00:00.000Z'} });
  for (let i=0;i<3;i++) {
    const vehicle = await record('mobile_workshops', `Mobile workshop ${i+1} – TEST-${100+i}`, { registration_number: `TEST-${100+i}`, manufacturer: ['Volkswagen','Ford','Renault'][i], model: ['ID. Buzz','Transit','Kangoo'][i], first_registration: `202${3+i}-03-15`, mileage: String(45000+i*12500), purchase_price: { amount: String(28000+i*6000), currency:'EUR' }, electric: i===0, notes: 'Prepared the mobile workshop for its first on-site assignment.' },i);
    link('cases', records.cases[i], 'mobile_workshops', vehicle, 'general');
  }
  // A genuine edit creates before/after history through the common application layer.
  const firstTask = records.tasks[0];
  records.tasks[0] = await app.execute('update_record', { objectTypeId: objects.tasks.id, recordId: firstTask.id, version: firstTask.version, values: { progress: '25' } }, actorId) as DataRecord;
  await object('distribution_lists','Verteiler','Distribution lists',[],['Partner'],['Aktiv','Inaktiv']);
  const distribution=await record('distribution_lists','Workshop partners',{description:'Contacts involved in workshop planning.\nIncludes organization and contact-person records.\nMembership is maintained manually.',notes:'Fictional working notes for reviewing the workshop partner audience.'});
  for(const target of [organizations[0],organizations[1],records.contacts[6]])link('distribution_lists',distribution,'contacts',target,'distribution_member');
  await connectDemoRelationships(db,actorId,workspace.id,links);
  // Additional generic objects exercise every currently implemented custom field kind.
  const serviceOptions = [labels('Reparatur', 'Repair'), labels('Ersatz', 'Replacement'), labels('Vor-Ort-Service', 'On-site service')].map(value => ({id: v7(), labels: value, active: true}));
  await object('support_packages', 'Servicepakete', 'Support packages', [field('description','Beschreibung','Description','multiline'),field('notes','Notizen','Notes','multiline'),
    field('package_code', 'Paketkennung', 'Package code'),
    field('valid_from', 'Gültig ab', 'Valid from', 'date'), field('valid_until', 'Gültig bis', 'Valid until', 'date'),
    field('annual_fee', 'Jahresbeitrag', 'Annual fee', 'money', {scale: 2, currency: 'EUR'}),
    field('services', 'Leistungen', 'Services', 'multiple_choice', {options: serviceOptions}),
    field('renewal', 'Automatische Verlängerung', 'Automatic renewal', 'boolean'),
    field('internal_notes', 'Interne Notizen', 'Internal notes', 'multiline'),
  ], ['Fernbetreuung', 'Vor-Ort-Betreuung'], ['Entwurf', 'Aktiv', 'Ausgelaufen']);
  const inspectionOptions=[{id:v7(),labels:labels('Geprüft','Checked'),active:true},{id:v7(),labels:labels('Nacharbeit nötig','Needs attention'),active:true}];
  await object('workshop_tools', 'Werkstattgeräte', 'Workshop tools', [field('description','Beschreibung','Description','multiline'),field('notes','Notizen','Notes','multiline'),
    field('last_inspection','Letzte Prüfung','Last inspection','datetime'),field('inspection_result','Prüfergebnis','Inspection result','single_choice',{options:inspectionOptions}),field('inspected_by','Geprüft von','Inspected by','reference',{referenceTarget:'user',multiple:false}),field('serial_number', 'Seriennummer', 'Serial number'), field('model', 'Modell', 'Model'),
    field('purchase_price', 'Kaufpreis', 'Purchase price', 'money', {scale: 2, currency: 'USD'}),
    field('quantity', 'Anzahl', 'Quantity', 'integer'), field('weight', 'Gewicht (kg)', 'Weight (kg)', 'decimal', {scale: 3}),
    field('custodians', 'Verantwortliche', 'Custodians', 'reference', {referenceTarget: 'group', multiple: true}),
    field('instructions', 'Anleitung', 'Instructions', 'multiline', {formatted: true}),
    field('retired_tag', 'Frühere Kennzeichnung', 'Retired tag'),
    field('supplier_email','Lieferanten-E-Mail','Supplier email','email'),field('support_phone','Support-Telefon','Support telephone','phone'),field('support_portal','Support-Portal','Support portal','url'),
    field('support_emails','Support-E-Mail-Adressen','Support email addresses','structured',{schema:'email_entries',options:[]}),
  ], ['Notebook', 'Diagnosegerät'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  for (let i = 0; i < 3; i++) await record('support_packages', ['Workshop support package', 'Mobile workshop care package', 'Completed tool care package'][i], {
    package_code: `DEMO-${2026}-${100+i}`, valid_from: '2026-01-01', valid_until: i === 2 ? '2026-06-30' : '2027-12-31',
    annual_fee: {amount: ['1234.56', '98765.43', '0.00'][i], currency: 'EUR'}, services: serviceOptions.slice(0, i+1).map(option => option.id), renewal: i === 0,
    internal_notes: 'Recorded the proposed service costs and the internal review limit.',
  }, i);
  for (let i = 0; i < 4; i++) await record('workshop_tools', ['Workshop laptop', 'Mobile diagnostic kit', 'Spare laptop', 'Unassigned diagnostic kit'][i], {
    last_inspection:`2026-11-0${i+1}T09:30:00.000Z`,inspection_result:inspectionOptions[i%2].id,inspected_by:{kind:'user',id:designer.id},
    supplier_email:`supplier${i+1}@example.test`,support_phone:'+498920100010',support_portal:'https://example.org/support',
    support_emails:[{id:v7(),value:`support${i+1}@example.test`,contexts:[],preference:1}],
    serial_number: `DEMO-SN-${1000+i}`, model: i % 2 ? 'Diagnostic Kit D2' : 'Notebook L14',
    purchase_price: {amount: i === 2 ? '0.00' : '12345.67', currency: 'USD'}, quantity: String(i === 2 ? 0 : 1),
    weight: ['1.250', '12.345', '0.000', '2.500'][i], custodians: [{kind:'group',id:group.id}, {kind:'group',id:management.id}],
    instructions: '## Getting started\n\n- Check the serial number.\n- Review the selected support package.\n\n**Fictional equipment; no attachments.**', retired_tag: i === 0 ? 'OLD-100' : null,
  }, i);
  const coverage = await app.execute('create_relationship_type', {workspaceId: workspace.id, technicalName: 'tool_support', configuration: {
    labels: labels('Gerätebetreuung', 'Tool support'), leftLabels: labels('Servicepaket', 'Support package'), rightLabels: labels('Betreute Geräte', 'Supported tools'),
    directed: true, leftMin: 0, leftMax: 1, rightMin: 0, rightMax: null, allowAll: false,
    pairs: [{leftObjectTypeId: objects.workshop_tools.id, rightObjectTypeId: objects.support_packages.id}], active: true,
  }}, actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type', {workspaceId: workspace.id, relationshipTypeId: coverage.id, version: coverage.version}, actorId);
  const assignment = await app.execute('create_relationship_type', {workspaceId: workspace.id, technicalName: 'workshop_equipment', configuration: {
    labels: labels('Werkstattausrüstung', 'Workshop equipment'), leftLabels: labels('Festes Gerät', 'Dedicated device'), rightLabels: labels('Mobile Werkstatt', 'Mobile workshop'),
    directed: true, leftMin: 0, leftMax: 1, rightMin: 0, rightMax: 1, allowAll: false,
    pairs: [{leftObjectTypeId: objects.mobile_workshops.id, rightObjectTypeId: objects.workshop_tools.id}], active: true,
  }}, actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type', {workspaceId: workspace.id, relationshipTypeId: assignment.id, version: assignment.version}, actorId);
  link('workshop_tools', records.workshop_tools[0], 'support_packages', records.support_packages[0], 'support');
  link('workshop_tools', records.workshop_tools[1], 'support_packages', records.support_packages[0], 'support');
  link('workshop_tools', records.workshop_tools[2], 'support_packages', records.support_packages[1], 'support');
  link('mobile_workshops', records.mobile_workshops[0], 'workshop_tools', records.workshop_tools[0], 'equipment');
  link('projects', records.projects[0], 'support_packages', records.support_packages[0], 'general');
  link('contacts', records.contacts[6], 'contacts', records.contacts[8], 'identity');
  await connectDemoRelationships(db, actorId, workspace.id, links);

  // One Contact person belongs to at most one Organization; professional details are Contact fields.
  const contactDefinition=await app.execute('get_object_type',{objectTypeId:objects.contacts.id},actorId) as ObjectDefinition;
  const role=contactDefinition.fields.find(f=>f.id===contactDefinition.contactProfile!.fields.function)!;
  const roleChoices=[{id:v7(),labels:{en:'Board member',de:'Vorstand'},active:true},{id:v7(),labels:{en:'Advisory board member',de:'Aufsichtsrat'},active:true},{id:v7(),labels:{en:'Member',de:'Mitglied'},active:true}];
  await app.execute('configure_field',{fieldId:role.id,version:role.version,required:false,config:{...role.config,options:roleChoices}},actorId);
  for(const [index,title,department] of [[6,'Managing director','Sales'],[7,'Service coordinator','Operations'],[8,'Consultant','Independent services']] as const){
    const contact=await app.execute('get_record',{objectTypeId:objects.contacts.id,recordId:records.contacts[index].id},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:objects.contacts.id,recordId:contact.id,version:contact.version,values:{job_title:title,department,function:[roleChoices[index===6?0:index===7?1:2].id]}},actorId);
  }

  // Explicit ceilings for regular users; Designer controls structure, not content rights.
  for (const [name, model] of Object.entries(objects)) {
    const before = await app.execute('get_content_permissions', {objectTypeId: model.id}, actorId) as ContentPermissions;
    const privateField = model.fields.find(item => item.technicalName === 'internal_notes');
    const price = model.fields.find(item => item.technicalName === 'purchase_price');
    await app.execute('configure_content_permissions', {...before, sensitive: Boolean(model.activity)||name==='support_packages', grants: [
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
  // Access principals are the Task assignees; there is no separate assignment field.
  for(const task of records.tasks)await security('tasks',task,own('user',member.id));
  await security('tasks',records.tasks[1],own('group',group.id));
  await security('tasks',records.tasks[2],{...own('user',designer.id),privacy:'personal'});
  await security('tasks',records.tasks[3],{...own('user',designer.id),privacy:'confidential'});
  await security('support_packages',records.support_packages[0],own('group',group.id));
  await security('support_packages',records.support_packages[1],own('user',designer.id));

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
  const retired=objects.workshop_tools.fields.find(item=>item.technicalName==='retired_tag')!;
  await app.execute('set_definition_state',{kind:'field',id:retired.id,expectedState:'active',state:'inactive'},actorId);
  const archived=await app.execute('create_object_type',{workspaceId:workspace.id,technicalName:'retired_fixture_tools',labels:labels('Ausgemusterte Geräte','Retired equipment'),standardFields:['keyword']},actorId) as {id:string};
  await app.execute('create_record',{objectTypeId:archived.id,keyword:'Archived workshop scanner'},actorId);
  await app.execute('set_definition_state',{kind:'object_type',id:archived.id,expectedState:'active',state:'inactive'},actorId);

  // Explicit bilingual groups demonstrate form layout independently of column order.
  for (const name of Object.keys(objects)) {
    let model=await app.execute('get_object_type',{objectTypeId:objects[name].id},actorId) as ObjectDefinition;
    const base= model.workProfile?workFormLayout(model.workProfile,model.fields.filter(item=>item.state==='active'),model.formRelationships??[]):resolveFormLayout(undefined,model.fields.filter(item=>item.state==='active'),true,model.formRelationships??[]);
    let groups=model.contactProfile?contactExtensionLayout(model.contactProfile,model.fields,base)!.groups.filter(g=>g.fields.length):base.groups;
    if(['mobile_workshops','support_packages','workshop_tools'].includes(name))groups=customDemoGroups(name,groups,model.fields);
    model=await app.execute('configure_form_layout',{objectTypeId:model.id,version:model.version,layout:{groups}},actorId) as ObjectDefinition;
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
  for(const type of definitions.filter(type=>['primary_association','general_relation','contact_person'].includes(type.technicalName)))if(type.rulesState==='draft')await app.execute('activate_relationship_type',{workspaceId,relationshipTypeId:type.id,version:type.version},actorId);
  definitions=await app.execute('list_relationship_types',{workspaceId},actorId) as typeof definitions;
  for(const link of links) {
    if(!objects.some(type=>type.id===link.from.objectTypeId)||!objects.some(type=>type.id===link.to.objectTypeId))throw new Error('Demo plan does not match this workspace');
    const technicalName=({primary:'primary_association',contact_person:'contact_person',general:'general_relation',identity:'contact_identity',support:'tool_support',equipment:'workshop_equipment',distribution_member:'distribution_members'} as const)[link.relation];
    const type=definitions.find(type=>type.technicalName===technicalName);if(!type)throw new Error('Demo relationship definition missing');
    const snapshot=await app.execute('get_record_relationships',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as import('@xobject/contracts').RecordRelationships;
    const field=snapshot.fields.find(field=>field.definition.id===type.id&&field.side==='left');if(!field)throw new Error('Demo relationship side missing');
    if(field.targets.some(target=>target.objectTypeId===link.to.objectTypeId&&target.recordId===link.to.recordId))continue;
    const record=await app.execute('get_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:link.from.objectTypeId,recordId:link.from.recordId,version:record.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[...field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId})),link.to]}]},actorId);
  }
}
