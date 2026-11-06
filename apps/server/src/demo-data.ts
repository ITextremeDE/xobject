import {scenarioSettings,scenarioOrganizations,projectStory,caseStory,taskStory,customStory,type DemoScenario} from './demo-scenarios.js';
import {workFormLayout,contactExtensionLayout,resolveFormLayout} from '@xobject/contracts';
import { randomBytes } from 'node:crypto';
import { v7 } from 'uuid';
import {sql} from 'kysely';
import type { ContentPermissions, ForeignSettings, ManagedUser, RecordSecurity, Workspace, WorkspaceGroup, AccessLevel, ClassificationRules, CustomFieldKind, FieldConfig, FieldValue, ObjectDefinition, DataRecord } from '@xobject/contracts';
import {emptyFieldInputRules,defaultNumbering,defaultWorkspaceAppearance,type WorkspaceAppearance} from '@xobject/contracts';
import { Application } from './domain.js';
import type { Database } from './database.js';

type Labels = { de: string; en: string };
type SeedField = { name: string; labels: Labels; kind?: CustomFieldKind; config?: FieldConfig; required?: boolean };
export type DemoLink = { from: { objectTypeId: string; recordId: string }; to: { objectTypeId: string; recordId: string }; relation: 'primary' | 'contact_person' | 'general' | 'identity' | 'support' | 'equipment' | 'distribution_member' };
// COS/itextreme.de approximation through the existing editable appearance controls.
// Fixed, locally served fonts and paired primary colors remain editable per workspace.
export const itextremeDemoAppearance:WorkspaceAppearance={...defaultWorkspaceAppearance,baseColor:'gray',theme:'rose',chartColor:'rose',primaryColor:'#C81E3A',primaryColorDark:'#F26074',logoIcon:'network',font:'inter',fontHeading:'orbitron',radius:'large'};
// Personal Design / juergen-schadek.de, expressed only through normal editable settings.
export const juergenSchadekDemoAppearance:WorkspaceAppearance={...defaultWorkspaceAppearance,baseColor:'gray',theme:'sky',chartColor:'cyan',primaryColor:'#0369A1',primaryColorDark:'#7DD3FC',secondaryColor:'#F1F5F9',secondaryColorDark:'#1E293B',logoIcon:'globe',font:'inter',fontHeading:'space-grotesk',radius:'large'};
export type DemoAccount={id:string;name:string;email:string;role:'designer'|'user';password?:string};
type DemoOptions={scenario?:DemoScenario;name?:string;appearance?:WorkspaceAppearance;members?:{id:string;role:'designer'|'user'}[]};
/** Current fictional examples: one direct parent, with ancestors derived normally. */
export function demoCustomPrimaryLinks(objects:Record<string,{id:string}>,records:Record<string,{id:string}[]>,scenario:DemoScenario='test'):DemoLink[]{
 const assignments:[string,number,string,number][]=scenario==='family'?[['projects',1,'mobile_workshops',0],['cases',2,'mobile_workshops',1],['contacts',8,'mobile_workshops',2],['projects',0,'support_packages',0],['cases',2,'support_packages',1],['contacts',2,'support_packages',2],['projects',1,'workshop_tools',0],['cases',1,'workshop_tools',1],['cases',3,'workshop_tools',2],['projects',0,'access_checks',0],['cases',1,'access_checks',1],['contacts',8,'access_checks',2]]:[
  ['cases',0,'mobile_workshops',0],['projects',1,'mobile_workshops',1],['contacts',2,'mobile_workshops',2],
  ['cases',0,'support_packages',0],['projects',1,'support_packages',1],['contacts',2,'support_packages',2],
  [scenario==='business'?'projects':'cases',scenario==='business'?3:1,'workshop_tools',0],['cases',scenario==='business'?1:3,'workshop_tools',1],['projects',scenario==='business'?1:3,'workshop_tools',2],
  ...Array.from({length:records.access_checks.length},(_,index):[string,number,string,number]=>[index%3===0?'projects':'cases',index%3===0?3:index%3===1?6:7,'access_checks',index]),
 ];
 return assignments.map(([parent,parentIndex,child,childIndex])=>{
  const from=records[parent]?.[parentIndex%records[parent].length],to=records[child]?.[childIndex];
  if(!objects[parent]||!objects[child]||!from||!to)throw Error('Incomplete fictional Primary-association fixture');
  return {from:{objectTypeId:objects[parent].id,recordId:from.id},to:{objectTypeId:objects[child].id,recordId:to.id},relation:'primary'};
 });
}
const labels = (de: string, en: string): Labels => ({ de, en });
const field = (name: string, de: string, en: string, kind: CustomFieldKind = 'text', config?: FieldConfig): SeedField => ({ name, labels: labels(de, en), kind, config:kind==='multiline'?{formatted:true,...config}:config });

const choiceTranslations: Record<string, string> = {"Kunde": "Customer", "Lieferant": "Supplier", "Partner": "Partner", "Aktiv": "Active", "In Klärung": "Under review", "Inaktiv": "Inactive", "Kundenprojekt": "Customer project", "Internes Projekt": "Internal project", "Geplant": "Planned", "In Arbeit": "In progress", "Abgeschlossen": "Completed", "Arbeitspaket": "Work package", "Servicefall": "Service request", "Offen": "Open", "Erledigt": "Done", "Aufgabe": "Task", "Rückfrage": "Question", "Servicefahrzeug": "Service vehicle", "Poolfahrzeug": "Pool vehicle", "Verfügbar": "Available", "Im Einsatz": "In use", "In Wartung": "Under maintenance", "Intern": "Internal", "Kundenarbeit": "Customer work", "Priorität": "Priority", "Fernbetreuung": "Remote support", "Vor-Ort-Betreuung": "On-site care", "Versicherung": "Insurance", "Wartung": "Maintenance", "Entwurf": "Draft", "Ausgelaufen": "Expired", "Berechtigungstest": "Access check", "Notebook": "Laptop", "Diagnosegerät": "Diagnostic tool"};
Object.assign(choiceTranslations,{'Familienauto':'Family car','Lastenrad':'Cargo bicycle','Anhänger':'Trailer','Haushaltsprojekt':'Household project','Familienprojekt':'Family project','Planung':'Planning','Durchführung':'Execution','Erledigung':'Action','Abstimmung':'Coordination','Computer':'Computer','Werkzeug':'Tool','Freizeitgerät':'Leisure equipment','Netzwerkgerät':'Network device','Prüfung':'Review','Haushalt':'Household','Privat':'Private'});
const choiceLabels = (de: string): Labels => labels(de, choiceTranslations[de] ?? de);

function demoDescription(_objectName:string,keyword:string,context:string):string{
 return [`## ${keyword}`,context,'### Outcome\nKeep the agreed result **clear**, the context *specific*, and the linked records up to date.',
 '### Acceptance\n1. Review the details with the responsible person.\n2. Verify the result against the linked working context.\n3. Record the decision in Notes.',
 '> Resolve open questions before marking the work complete.',
 'Use `record references` when documenting a handover.',
 '```text\nPrepare → Carry out → Verify\n```',
 'Further reading: [Example reference](https://example.org/).','---','*Fictional demonstration content; no real customer or family data.*'].join('\n\n');
}

function demoGuide(keyword:string):string{
 return `## Operating guide\n\nBefore using **${keyword}**, check its condition and identify the responsible team.\n\n### Preparation\n1. Inspect the equipment.\n2. Check the power supply and accessories.\n3. Confirm the current support package.\n\n### During use\n- Follow the agreed procedure.\n- Stop if the condition changes.\n\n> Report defects before the next handover.\n\nUse the identifier printed on the tool, as shown in the business-number field.\n\n\`\`\`text\nInspect → Use → Clean → Return\n\`\`\`\n\n[Reference instructions](https://example.org/support)`;
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
export async function seedDemoData(db: Database, actorId: string, code = 'itx', options:DemoOptions = {}) {
  const scenario=options.scenario??(code==='itx'?'business':code==='js'?'family':'test');
  const settings=scenarioSettings[scenario];
  const app = new Application(db);
  const workspaces = await app.execute('list_workspaces', {}, actorId) as { code: string }[];
  if (workspaces.some(workspace => workspace.code === code)) throw new Error('Demo workspace already exists; no data was changed');
  const sharedMembers=new Map<string,Pick<ManagedUser,'id'|'name'|'email'>>();
  if(options.members){
    if(options.members.length!==2||new Set(options.members.map(member=>member.id)).size!==2||new Set(options.members.map(member=>member.role)).size!==2)throw Error('Demo requires one distinct Designer and User');
    for(const member of options.members){const existing=(await sql<{id:string;name:string;email:string}>`SELECT id,name,email FROM sys_users WHERE id=${member.id} AND active`.execute(db)).rows[0];if(!existing)throw Error('Demo member is unavailable');sharedMembers.set(member.id,existing);}
  }
  const workspace = await app.execute('create_workspace', { name: options.name??'ITextreme', code, defaultLanguage: 'en', timeZone: 'Europe/Berlin' }, actorId) as Workspace;
  const initialWorkspace=(await app.execute('list_workspaces',{},actorId) as Workspace[]).find(current=>current.id===workspace.id)!;
  await app.execute('set_workspace_appearance',{workspaceId:workspace.id,version:initialWorkspace.appearance_version,appearance:options.appearance??(scenario==='family'?juergenSchadekDemoAppearance:scenario==='business'?itextremeDemoAppearance:defaultWorkspaceAppearance)},actorId);
  const accounts:DemoAccount[] = [];
  for (const [name, local, role] of [['Jane Doe', 'jane.doe', 'designer'], ['James Doe', 'james.doe', 'user']] as const) {
    let user:Pick<ManagedUser,'id'|'name'|'email'>,password:string|undefined;
    if(options.members){
      const member=options.members.find(member=>member.role===role);
      const existing=member?sharedMembers.get(member.id):undefined;
      if(!existing)throw Error('Demo member is unavailable');
      user=existing;
    }else{
      const email = `${local}${code === 'itx' ? '' : `+${code}`}@example.test`;
      password = randomBytes(24).toString('base64url');
      user = await app.execute('create_user', { name, email, initialPassword: password }, actorId) as ManagedUser;
    }
    await app.execute('set_workspace_member', { workspaceId: workspace.id, userId: user.id, role, expectedRole: null }, actorId);
    accounts.push({ id: user.id, name:user.name, email:user.email, role, ...(password?{password}:{}) });
  }
  const [designer, member] = accounts;
  const extras:Record<string,DemoAccount>={};
  for(const [key,name,local] of scenario==='business'?[['lead','Alex Doe','alex.doe'],['field','Casey Doe','casey.doe'],['sales','Morgan Doe','morgan.doe'],['auditor','Taylor Doe','taylor.doe']]:scenario==='family'?[['child','Jamie Doe','jamie.doe']]:[]){
    const password=randomBytes(24).toString('base64url');
    const email=`${local}${['itx','js'].includes(code)?'':`+${code}`}@example.test`;
    const user=await app.execute('create_user',{name,email,initialPassword:password},actorId) as ManagedUser;
    await app.execute('set_workspace_member',{workspaceId:workspace.id,userId:user.id,role:'user',expectedRole:null},actorId);
    extras[key]={id:user.id,name,email,role:'user',password};accounts.push(extras[key]);
  }
  const availableModules=await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[];
  for(const available of availableModules.filter(module=>module.available)){
    const current=(await app.execute('list_workspace_modules',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').WorkspaceModule[]).find(module=>module.key===available.key)!;
    if(!current.enabled)await app.execute('configure_workspace_module',{workspaceId:workspace.id,key:current.key,enabled:true,version:current.version},actorId);
  }
  const installed=await app.execute('list_object_types',{workspaceId:workspace.id},actorId) as {id:string;technicalName:string}[];
  const objects: Record<string, ObjectDefinition> = {}, records: Record<string, DataRecord[]> = {}, links: DemoLink[] = [];
  const group = await app.execute('create_group', { workspaceId: workspace.id, name: settings.group }, actorId) as { id: string };
  await app.execute('configure_group_inheritance', { workspaceId: workspace.id, groupId: group.id, version: 1, members:[{kind:'user',id:member.id,level:'full'}] }, actorId);
  const management = await app.execute('create_group', { workspaceId: workspace.id, name: settings.management, members: [{kind: 'user', id: designer.id, level: 'full'}, {kind: 'group', id: group.id, level: 'read'}] }, actorId) as WorkspaceGroup;
  const scenarioGroups:Record<string,WorkspaceGroup>={};
  async function object(name: string, de: string, en: string, fields: SeedField[], types: string[], statuses: string[]) {
    const created = installed.find(item=>item.technicalName===name) ?? await app.execute('create_object_type', { workspaceId: workspace.id, technicalName: (settings.objects as Record<string,readonly string[]>)[name]?.[0]??name, labels: (settings.objects as Record<string,readonly string[]>)[name]?labels((settings.objects as Record<string,readonly string[]>)[name][1],(settings.objects as Record<string,readonly string[]>)[name][2]):labels(de, en), standardFields: ['keyword', 'type_status', 'category'] }, actorId) as { id: string };
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
    if(name!=='distribution_lists')await app.execute('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,numbering:{...defaultNumbering(),enabled:true,prefix:(scenario==='business'?'ITx-':scenario==='family'?'JS-':'')+((settings.objects as Record<string,readonly string[]>)[name]?.[3]??({contacts:'CON',projects:'PRJ',cases:'CAS',tasks:'TSK',mobile_workshops:'MWK',support_packages:'SUP',workshop_tools:'TOOL',access_checks:'CHK',distribution_lists:'DST'} as Record<string,string>)[name])+'-',start:scenario==='business'?'1001':'1',padding:scenario==='family'?1:scenario==='business'?4:5}},actorId);
    const typeOptions = types.map(name => ({ id: v7(), kind: 'type' as const, labels: choiceLabels(name), typeId: null, active: true }));
    const statusOptions = [null, ...typeOptions.map(item => item.id)].flatMap(typeId => statuses.map(name => ({ id: v7(), kind: 'status' as const, labels: choiceLabels(name), typeId, active: true,...(model.workProfile?.kind==='task'?{meaning:(['open','in_progress','done'] as const)[statuses.indexOf(name)]}:{}) })));
    const config: ClassificationRules = { type: { required: false, defaultId: typeOptions[0]?.id ?? null }, status: { required: false, defaults: [null, ...typeOptions.map(item => item.id)].map(typeId => ({ typeId, statusId: statusOptions.find(item => item.typeId === typeId)!.id })) }, category: { required: false, multiple: true, defaultIds: [] }, options: [...typeOptions, ...statusOptions, ...settings.categories.map(([de,en]) => ({ id: v7(), kind: 'category' as const, labels: labels(de,en), typeId: null, active: true }))] };
    await app.execute('configure_classification', { objectTypeId: created.id, version: model.classification.version, config }, actorId);
    model = await app.execute('get_object_type', { objectTypeId: created.id }, actorId) as ObjectDefinition;
    objects[name] = model; records[name] = []; return model;
  }
  async function record(objectName: string, keyword: string, values: Record<string, FieldValue>, statusIndex = 0) {
    const model = objects[objectName];
    values={...values};
    if(values.responsible&&scenario!=='test')values.responsible={kind:'user',id:scenario==='business'?extras.lead.id:member.id};
    const index=records[objectName].length,projectCount=settings.projectCount;
    let story=objectName==='projects'?projectStory(scenario,index):objectName==='cases'?caseStory(scenario,Math.floor(index/2),index%2):objectName==='tasks'&&index<projectCount*7&&index%7<6?taskStory(scenario,Math.floor(index/7),Math.floor((index%7)/3),index%3):customStory(scenario,objectName,index,keyword);
    if(['projects','cases','tasks','mobile_workshops','support_packages','workshop_tools'].includes(objectName))keyword=story.keyword;
    Object.assign(values,story.values??{});
    if(objectName==='projects'&&scenario==='family'){values.start_date=index===0?'2026-11-01':'2027-04-01';values.target_date=index===0?'2027-02-28':'2027-07-10';}
    if(objectName==='tasks'&&index%7===6&&index<projectCount*7)story={...story,summary:`Agree responsibilities and the next review for ${projectStory(scenario,Math.floor(index/7)).keyword}.`,events:['Collected the next actions for this Project.','Agreed who will prepare each item.','Confirmed the next review with the participants.']};
    if(objectName==='tasks'&&index===projectCount*7)story={...story,summary:scenario==='family'?'Check the parents’ telephone numbers and the school collection contacts.':'Confirm the escalation telephone number, preferred contact and response hours.',events:['Checked the existing contact routes.','Confirmed the preferred escalation contact.','Recorded the updated contact details.']};
    if(objectName==='tasks'&&index===projectCount*7+1)story={...story,summary:scenario==='family'?'Choose a card together and keep the surprise private until the birthday.':'Collect improvement ideas before the next planning meeting.',events:['Recorded the idea.','Checked the options and the budget.','Agreed the next small action.']};
    if(objectName==='tasks'&&index%7===6&&index<projectCount*7)keyword=`${scenario==='family'?'Agree the next family steps':'Arrange the kickoff'} – ${projectStory(scenario,Math.floor(index/7)).keyword}`;
    if(objectName==='tasks'&&index===projectCount*7)keyword=scenario==='family'?'Update the school emergency contacts':scenario==='business'?'Confirm Northlight escalation contacts':'Test – Contact-only Task';
    if(objectName==='tasks'&&index===projectCount*7+1)keyword=scenario==='family'?'Buy a birthday card':scenario==='business'?'Review next quarter’s service improvements':'Test – Standalone Task';
    const writers=scenario==='family'?['Jane Doe','Alex Doe','Jamie Doe']:scenario==='business'?['Jane Doe','Alex Doe','James Doe']:['John Doe','Jane Doe','James Doe'];
    for(const field of model.fields.filter(field=>field.kind==='multiline'&&field.config.formatted)){
      const key=field.technicalName,original=typeof values[key]==='string'?values[key] as string:'';
      if(key==='notes'||key.endsWith('_notes'))values[key]=story.events.map((event,i)=>`----- Nov ${2+i}, 2026 ${i===1?'2:35 PM':'9:15 AM'} (${writers[i]}) -----\n${key==='internal_notes'?(scenario==='business'?'Commercial estimate: 18 engineering hours at EUR 95.00; external cost allowance EUR 720.00. ':scenario==='family'?'Parents’ budget note: keep the renewal reserve separate from pocket money. ':'Restricted test value: 98765.43. '):''}${event}\n${i===0?`Record: ${keyword}.`:''}`).join('\n\n');
      else if(key==='description')values[key]=demoDescription(objectName,keyword,story.summary+'\n\n'+story.steps.map(step=>'- '+step).join('\n'));
      else if(key==='instructions')values[key]=demoGuide(keyword);
    }
    const types = model.classification.options.filter(option => option.kind === 'type');
    const typeIndex=objectName==='projects'&&scenario==='business'?(index===3?1:0):index%types.length;
    const typeId = types[typeIndex].id;
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
  const companies = scenarioOrganizations[scenario];
  for (let i = 0; i < companies.length; i++) organizations.push(await record('contacts', companies[i], { contact_kind: contactKinds[0].id, company_name: companies[i], emails: email(`${scenario==='family'?['school','dentist','insurance','cycling','energy','campsite'][i]:scenario==='business'?['northlight','dispatch','practice','distribution','cloud','training'][i]:`test-contact${i+1}`}@example.test`), phones: email(`+4989201000${10+i}`,'phones'), websites: email('https://example.org','websites'), addresses: address((scenario==='family'?['School Lane','Market Street','Park Road','River Path','Oak Street','Lake Road']:scenario==='business'?['Design Avenue','Harbour Road','Cedar Street','Rack Lane','Cloud Park','Training Road']:['Test Road','Boundary Lane','Example Street'])[i%(scenario==='test'?3:6)],String(i+1)), commercial_register: scenario==='family'?null:i === 3 ? 'VR 900004 (fictional)' : `HRB ${900001+i} (fictional)`, notes: 'Fictional organization for project and contact-person testing.' }));
  for (const [i, person] of (scenario==='family'?[['Jane','Doe'],['Alex','Doe'],['Jane','Doe']]:scenario==='business'?[['Emily','Brooks'],['Oliver','Reed'],['Emily','Brooks']]:[['Emily','Example'],['Oliver','Sample'],['Emily','Example']]).entries()) {
    const individual = i === 2;
    const organizationIndex=scenario==='family'&&i===1?3:i;
    const row = await record('contacts', `${person[1]}, ${person[0]}${individual ? '' : ` (${companies[organizationIndex]})`}`, { contact_kind: contactKinds[individual ? 1 : 2].id, salutation:contactChoice('salutation',i===1?'Mr':'Ms'), name_prefix:i===0?contactChoice('name_prefix','Dr.'):null, nickname: i===0?(scenario==='family'?'Janey':'Em'):null, languages:[{id:v7(),value:'en-GB',contexts:[],preference:1},{id:v7(),value:'de-DE',contexts:[],preference:2}], messenger_addresses:[{id:v7(),value:`xmpp:person${i+1}@example.test`,contexts:[contactChoice('messenger_addresses','Work'),contactChoice('messenger_addresses','XMPP')],preference:1}], contact_time_zone:{timeZone:i===1?'America/New_York':'Europe/Berlin'}, anniversary:i===2?{year:null,month:9,day:12}:null, death_date:scenario==='test'&&i===1?{year:2024,month:11,day:3}:null, first_name: name(person[0]), last_name: name(person[1]), emails: email(`person${i+1}@example.test`), phones: email(`+4989201000${30+i}`,'phones','Mobile'), birthday: {year:i===2?null:1990+i,month:6,day:15}, addresses: address('Example Lane','10'), notes: individual ? 'Independent individual contact for a future standalone project.' : `Organization: ${companies[organizationIndex]}. The relationship is stored as a real link.` });
    if (!individual) link('contacts', organizations[organizationIndex], 'contacts', row, 'contact_person');
  }
  if(scenario==='family'){
    for(const [first,last]of [['Jamie','Doe'],['Alex','Doe']])await record('contacts',`${last}, ${first}`,{contact_kind:contactKinds[1].id,first_name:name(first),last_name:name(last),emails:email(`${first.toLowerCase()}.family@example.test`),notes:'Family contact profile.'});
    link('contacts',records.contacts[7],'contacts',records.contacts[10],'identity');
    link('contacts',records.contacts[8],'contacts',records.contacts[9],'general');
    link('contacts',records.contacts[10],'contacts',records.contacts[9],'general');
  }
  await object('projects', 'Projekte', 'Projects', [], scenario==='family'?['Haushaltsprojekt','Familienprojekt']:['Kundenprojekt', 'Internes Projekt'], ['Geplant', 'In Arbeit', 'Abgeschlossen']);
  await object('cases', 'Vorgänge', 'Cases', [], scenario==='family'?['Planung','Durchführung']:['Arbeitspaket', 'Servicefall'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('tasks', 'Aufgaben', 'Tasks', [], scenario==='family'?['Erledigung','Abstimmung']:['Aufgabe', 'Rückfrage'], ['Offen', 'In Arbeit', 'Erledigt']);
  await object('mobile_workshops', 'Mobile Werkstätten', 'Mobile workshops', [field('description','Beschreibung','Description','multiline'),field('registration_number', 'Kennzeichen', 'License plate'), field('manufacturer', 'Hersteller', 'Manufacturer'), field('model', 'Modell', 'Model'), field('first_registration', 'Erstzulassung', 'First registration', 'date'), field('mileage', 'Kilometerstand', 'Mileage', 'integer'), field('purchase_price', 'Anschaffungspreis', 'Purchase price', 'money'), field('electric', 'Elektroantrieb', 'Electric drive', 'boolean'), field('notes', 'Notizen', 'Notes', 'multiline')], scenario==='family'?['Familienauto','Lastenrad','Anhänger']:['Servicefahrzeug', 'Poolfahrzeug'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  const owners = { kind: 'user' as const, id: actorId }, team = { kind: 'group' as const, id: group.id };
  for (let i = 0; i < settings.projectCount; i++) {
    const project = await record('projects', ['Northlight – Workshop modernization', 'Forest – Fleet planning', 'Clearwater – Service portal', 'Internal – Workplace modernization'][i], { description: `## Objective\n${['Simplify order intake and workshop operations.', 'Plan vehicle capacity and maintenance.', 'Handle service requests consistently.', 'Prepare new workstations for the team.'][i]}`, start_date: '2026-10-01', target_date: `2027-0${i+1}-28`, responsible: owners }, i%2);
    if(scenario==='family'){if(i===0)link('contacts',records.contacts[8],'projects',project);}else if (i<3) link('contacts', organizations[i], 'projects', project);
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
  const distribution=await record('distribution_lists',scenario==='family'?'Family emergency contacts':scenario==='business'?'Customer service contacts':'Test – Mixed Contact kinds',{description:scenario==='family'?'School, dentist and parents for everyday coordination.\nReview contact details before each school term.\nMembership is maintained manually.':scenario==='business'?'Customer contacts for service reviews and escalation.\nReview membership before each customer handover.\nMembership is maintained manually.':'Three distinct Contact records in a test audience.\nIncludes Organizations and a Contact person.\nMembership is maintained manually.',notes:'Fictional working notes for reviewing the workshop partner audience.'});
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
  ], scenario==='family'?['Versicherung','Wartung']:['Fernbetreuung', 'Vor-Ort-Betreuung'], ['Entwurf', 'Aktiv', 'Ausgelaufen']);
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
  ], scenario==='family'?['Computer','Werkzeug','Freizeitgerät']:scenario==='business'?['Notebook','Netzwerkgerät']:['Notebook', 'Diagnosegerät'], ['Verfügbar', 'Im Einsatz', 'In Wartung']);
  for (let i = 0; i < 3; i++) await record('support_packages', ['Workshop support package', 'Mobile workshop care package', 'Completed tool care package'][i], {
    package_code: `DEMO-${2026}-${100+i}`, valid_from: '2026-01-01', valid_until: i === 2 ? '2026-06-30' : '2027-12-31',
    annual_fee: {amount: ['1234.56', '98765.43', '0.00'][i], currency: 'EUR'}, services: serviceOptions.slice(0, i+1).map(option => option.id), renewal: i === 0,
    internal_notes: 'Recorded the proposed service costs and the internal review limit.',
  }, scenario==='test'?i:i===2?2:1);
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
    labels: scenario==='family'?labels('Geräteabsicherung','Item cover'):scenario==='business'?labels('Verwaltete Gerätebetreuung','Managed device coverage'):labels('Gerätebetreuung', 'Tool support'), leftLabels: scenario==='family'?labels('Absicherungsplan','Cover plan'):scenario==='business'?labels('IT-Serviceplan','Managed service plan'):labels('Servicepaket', 'Support package'), rightLabels: scenario==='family'?labels('Abgedeckte Geräte','Covered items'):scenario==='business'?labels('Betreute Geräte','Covered assets'):labels('Betreute Geräte', 'Supported tools'),
    directed: true, leftMin: 0, leftMax: 1, rightMin: 0, rightMax: null, allowAll: false,
    pairs: [{leftObjectTypeId: objects.workshop_tools.id, rightObjectTypeId: objects.support_packages.id}], active: true,
  }}, actorId) as import('@xobject/contracts').RelationshipType;
  await app.execute('activate_relationship_type', {workspaceId: workspace.id, relationshipTypeId: coverage.id, version: coverage.version}, actorId);
  const assignment = await app.execute('create_relationship_type', {workspaceId: workspace.id, technicalName: 'workshop_equipment', configuration: {
    labels:scenario==='family'?labels('Fahrzeugausstattung','Vehicle equipment'):labels('Serviceausstattung','Service equipment'), leftLabels:labels('Festes Gerät','Dedicated device'), rightLabels:scenario==='family'?labels('Familienfahrzeug','Family vehicle'):scenario==='business'?labels('Servicefahrzeug','Field-service vehicle'):labels('Mobile Werkstatt','Mobile workshop'),
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

  const coverageField=await app.execute('create_field',{relationshipTypeId:coverage.id,technicalName:'coverage_notes',labels:labels('Deckungsumfang','Coverage notes'),kind:'text'},actorId) as {id:string};
  const coverageDefinition=(await app.execute('list_relationship_types',{workspaceId:workspace.id},actorId) as import('@xobject/contracts').RelationshipType[]).find(t=>t.id===coverage.id)!;
  const covered=records.workshop_tools[0],coveredTarget=records.support_packages[0];
  for(const text of [scenario==='business'?'Remote support during business hours':scenario==='family'?'Household use; accidental damage excluded':'Initial edge-attribute test value',scenario==='business'?'Remote support during business hours; escalation to Alex':scenario==='family'?'Household use; review accidental-damage cover at renewal':'Updated edge-attribute test value']){
    const current=await app.execute('get_record',{objectTypeId:objects.workshop_tools.id,recordId:covered.id},actorId) as DataRecord;
    const snapshot=await app.execute('get_record_relationships',{objectTypeId:objects.workshop_tools.id,recordId:covered.id},actorId) as import('@xobject/contracts').RecordRelationships;
    const edge=snapshot.fields.find(f=>f.definition.id===coverage.id)!.targets.find(t=>t.recordId===coveredTarget.id)!;
    await app.execute('update_record',{objectTypeId:objects.workshop_tools.id,recordId:covered.id,version:current.version,relationshipAttributes:[{relationshipTypeId:coverage.id,definitionVersion:coverageDefinition.version,target:{objectTypeId:objects.support_packages.id,recordId:coveredTarget.id},edgeId:edge.edgeId,version:edge.edgeVersion,values:{[coverageField.id]:text}}]},actorId);
  }

  // One Contact person belongs to at most one Organization; professional details are Contact fields.
  const contactDefinition=await app.execute('get_object_type',{objectTypeId:objects.contacts.id},actorId) as ObjectDefinition;
  const role=contactDefinition.fields.find(f=>f.id===contactDefinition.contactProfile!.fields.function)!;
  const roleChoices=[{id:v7(),labels:{en:'Board member',de:'Vorstand'},active:true},{id:v7(),labels:{en:'Advisory board member',de:'Aufsichtsrat'},active:true},{id:v7(),labels:{en:'Member',de:'Mitglied'},active:true}];
  await app.execute('configure_field',{fieldId:role.id,version:role.version,required:false,config:{...role.config,options:roleChoices}},actorId);
  for(const [index,title,department] of [[6,'Managing director','Sales'],[7,'Service coordinator','Operations'],[8,'Consultant','Independent services']] as const){
    const contact=await app.execute('get_record',{objectTypeId:objects.contacts.id,recordId:records.contacts[index].id},actorId) as DataRecord;
    await app.execute('update_record',{objectTypeId:objects.contacts.id,recordId:contact.id,version:contact.version,values:{job_title:scenario==='family'?(index===6?'School contact':index===7?'Club volunteer':'Parent'):title,department:scenario==='family'?(index===7?'Cycling club':'Family coordination'):department,function:[roleChoices[scenario==='family'?2:index===6?0:index===7?1:2].id]}},actorId);
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
    {...field('expected_result', scenario==='test'?'Erwartetes Ergebnis':scenario==='family'?'Zusammenhang':'Prüffeststellung', scenario==='test'?'Expected result':scenario==='family'?'Context':'Review findings', 'multiline'), required:true},
    field('sample_amount', scenario==='test'?'Beispielbetrag':'Betrag', scenario==='test'?'Sample amount':'Amount', 'decimal', {scale:2}),
  ], scenario==='family'?['Haushalt','Privat']:scenario==='business'?['Prüfung']:['Berechtigungstest'], ['Aktiv']);
  const accessBefore = await app.execute('get_content_permissions', {objectTypeId:objects.access_checks.id}, actorId) as ContentPermissions;
  await app.execute('configure_content_permissions', {...accessBefore,sensitive:true,grants:[...[designer,member].map(user=>({kind:'user' as const,id:user.id,level:'full' as const,create:true,fields:{}})),...(scenario==='family'?[group.id,management.id].map(id=>({kind:'group' as const,id,level:'full' as const,create:true,fields:{}})):[])]}, actorId);
  if(scenario!=='family'){
  for (const level of ['none','availability','read','duplicate','schedule','edit','delete','full'] as AccessLevel[]) {
    const row = await record('access_checks', scenario==='business'?`Service Desk entitlement – ${level}`:`Foreign access – ${level}`, {expected_result:`James has ${level} access through foreign access to Jane, bounded by this record's foreign maximum. Availability has no content projection yet. Jane owns this record with Full; John is Administrator.`,sample_amount:'1234567.89'});
    await security('access_checks',row,{...own('user',designer.id),foreignMax:level});
  }
  for (const privacy of ['personal','confidential'] as const) {
    const row=await record('access_checks',scenario==='business'?`Management review – ${privacy}`:`Privacy – ${privacy}`,{expected_result:`Jane owns this ${privacy} record. James's foreign rule does not grant access. John retains Administrator access.`,sample_amount:'0.00'});
    await security('access_checks',row,{...own('user',designer.id),privacy});
  }
  const publicRow=await record('access_checks',scenario==='business'?'Published support review':'Workspace-public – read',{expected_result:'No named owners; James and Jane can read. John has Administrator access. Other object ceilings still apply.',sample_amount:'-1234.56'});
  await security('access_checks',publicRow,{owners:[],publicLevel:'read',privacy:'normal',foreignMax:'full',fields:[]});
  const exception=await record('access_checks',scenario==='business'?'Technician approval – redacted amount':'Direct ownership – field exception',{expected_result:'James owns this record with Full but cannot read Sample amount. Direct ownership takes precedence over the foreign rule.',sample_amount:'98765.43'});
  await security('access_checks',exception,{...own('user',member.id),fields:[{kind:'user',id:member.id,fields:{[objects.access_checks.fields.find(item=>item.technicalName==='sample_amount')!.id]:'none'}}]});

  }else{
    for(const [index,title,context,amount] of [[0,'Shared household costs','Visible to the Family group; Jamie can read but cannot see the Amount field.','246.80'],[1,'Parents – Heating reserve','Confidential Parents record. Jamie is not a member of Parents and cannot read it.','4500.00'],[2,'Personal – Birthday surprise','Jane’s Personal record. Alex and Jamie have no foreign access to Personal contents.','65.00']] as const){const row=await record('access_checks',title,{expected_result:context,sample_amount:amount});await security('access_checks',row,index===0?own('group',group.id):index===1?{...own('group',management.id),privacy:'confidential'}:{...own('user',designer.id),privacy:'personal'});}
  }
  await configureScenarioRights();
  links.push(...demoCustomPrimaryLinks(objects,records,scenario));
  await connectDemoRelationships(db,actorId,workspace.id,links);

  async function configureScenarioRights(){
    if(scenario==='test')return;
    const addGroup=async(key:string,name:string,members:WorkspaceGroup['members'])=>{scenarioGroups[key]=await app.execute('create_group',{workspaceId:workspace.id,name,members},actorId) as WorkspaceGroup;return scenarioGroups[key];};
    const setMembers=async(id:string,members:WorkspaceGroup['members'])=>{const current=(await app.execute('list_groups',{workspaceId:workspace.id},actorId) as WorkspaceGroup[]).find(g=>g.id===id)!;await app.execute('configure_group_inheritance',{workspaceId:workspace.id,groupId:id,version:current.version,members},actorId);};
    if(scenario==='business'){
      const field=await addGroup('field','Field Service',[{kind:'user',id:extras.field.id,level:'full'}]);
      await addGroup('sales','Sales',[{kind:'user',id:extras.sales.id,level:'full'}]);
      await addGroup('audit','Audit',[{kind:'user',id:extras.auditor.id,level:'read'}]);
      await setMembers(group.id,[{kind:'user',id:member.id,level:'full'},{kind:'user',id:extras.field.id,level:'edit'}]);
      await setMembers(management.id,[{kind:'user',id:designer.id,level:'full'},{kind:'user',id:extras.lead.id,level:'full'},{kind:'group',id:group.id,level:'read'},{kind:'group',id:field.id,level:'read'}]);
    }else{
      await addGroup('children','Children',[{kind:'user',id:extras.child.id,level:'edit'}]);
      await setMembers(group.id,[{kind:'user',id:designer.id,level:'full'},{kind:'user',id:member.id,level:'full'},{kind:'user',id:extras.child.id,level:'read'}]);
      await setMembers(management.id,[{kind:'user',id:designer.id,level:'full'},{kind:'user',id:member.id,level:'full'}]);
    }
    for(const [name,model]of Object.entries(objects)){
      const before=await app.execute('get_content_permissions',{objectTypeId:model.id},actorId) as ContentPermissions;
      const restricted=Object.fromEntries(model.fields.filter(f=>['internal_notes','purchase_price'].includes(f.technicalName)).map(f=>[f.id,'none' as const]));
      const grants:ContentPermissions['grants']=scenario==='business'?[...before.grants,
        {kind:'group',id:management.id,level:'full',create:true,fields:{}},
        {kind:'group',id:scenarioGroups.field.id,level:'edit',create:true,fields:restricted},
        {kind:'group',id:scenarioGroups.sales.id,level:'read',create:false,fields:restricted},
        {kind:'group',id:scenarioGroups.audit.id,level:'read',create:false,fields:{}},
        {kind:'user',id:extras.lead.id,level:'full',create:true,fields:{}},
        {kind:'user',id:extras.field.id,level:'edit',create:true,fields:restricted},
        {kind:'user',id:extras.sales.id,level:name==='access_checks'?'none':['contacts','projects','support_packages'].includes(name)?'edit':'read',create:['contacts','projects','support_packages'].includes(name),fields:restricted},
        {kind:'user',id:extras.auditor.id,level:'read',create:false,fields:{}},
      ]:[
        {kind:'group',id:group.id,level:'full',create:true,fields:{}},
        {kind:'group',id:management.id,level:'full',create:true,fields:{}},
        {kind:'group',id:scenarioGroups.children.id,level:'read',create:false,fields:restricted},
        {kind:'user',id:designer.id,level:'full',create:true,fields:{}},
        {kind:'user',id:member.id,level:'full',create:true,fields:{}},
        {kind:'user',id:extras.child.id,level:name==='tasks'?'edit':'read',create:false,fields:{...restricted,...(name==='access_checks'?{[model.fields.find(f=>f.technicalName==='sample_amount')!.id]:'none' as const}:{})}},
      ];
      await app.execute('configure_content_permissions',{...before,grants},actorId);
    }
    const before=await app.execute('get_foreign_access',{workspaceId:workspace.id},actorId) as ForeignSettings;
    if(scenario==='business')await app.execute('configure_foreign_access',{...before,rules:[...before.rules,
      ...[group.id,scenarioGroups.field.id].map(owner=>({id:v7(),requester:{kind:'group' as const,id:management.id},owner:{kind:'group' as const,id:owner},level:'full' as const,confidential:true,objects:{}})),
      ...[group.id,management.id].map(owner=>({id:v7(),requester:{kind:'group' as const,id:scenarioGroups.sales.id},owner:{kind:'group' as const,id:owner},level:'read' as const,confidential:false,objects:{}})),
      ...[group.id,management.id].map(owner=>({id:v7(),requester:{kind:'group' as const,id:scenarioGroups.audit.id},owner:{kind:'group' as const,id:owner},level:'read' as const,confidential:false,objects:{}})),
      {id:v7(),requester:{kind:'group',id:group.id},owner:{kind:'group',id:scenarioGroups.field.id},level:'edit',confidential:false,objects:{}},
    ],users:[...before.users,...Object.values(extras).map(u=>({userId:u.id,inherit:true,manageOwn:u===extras.lead}))]},actorId);
    else await app.execute('configure_foreign_access',{...before,rules:[{id:v7(),requester:{kind:'group',id:management.id},owner:{kind:'group',id:scenarioGroups.children.id},level:'edit',confidential:false,objects:{}},{id:v7(),requester:{kind:'group',id:scenarioGroups.children.id},owner:{kind:'group',id:management.id},level:'read',confidential:false,objects:{}},{id:v7(),requester:{kind:'user',id:member.id},owner:{kind:'user',id:designer.id},level:'edit',confidential:false,objects:{}}],users:[{userId:member.id,inherit:true,manageOwn:false},{userId:designer.id,inherit:true,manageOwn:true},{userId:extras.child.id,inherit:true,manageOwn:false}]},actorId);
    for(const name of ['projects','cases'])for(const row of records[name])await security(name,row,own('group',scenario==='business'&&name==='cases'?group.id:management.id));
    for(const [index,row]of records.tasks.entries()){
      if(scenario==='business'){
        if([2,3].includes(index))continue;
        await security('tasks',row,index%3===0?own('user',extras.field.id):index%3===1?own('group',group.id):own('user',extras.lead.id));
      }else await security('tasks',row,index===2?{...own('user',designer.id),privacy:'personal'}:index===3?{...own('group',management.id),privacy:'confidential'}:index%6===0?own('user',extras.child.id):index%3===0?own('group',scenarioGroups.children.id):own('group',group.id));
    }
    if(scenario==='family')for(const row of records.support_packages)await security('support_packages',row,own('group',management.id));

  }

  const recycled=await app.execute('create_record',{objectTypeId:objects.tasks.id,keyword:scenario==='test'?'Test – Restore this recycled Task':scenario==='business'?'Cancelled duplicate – Dispatch follow-up':'Duplicate packing list – restore exercise',values:{description:scenario==='test'?'Recycle-bin acceptance fixture. Restore, inspect the journal, then recycle again.':scenario==='business'?'A duplicate follow-up was cancelled after the dispatch handover.':'An older packing reminder was replaced by the shared holiday checklist.',notes:'----- Nov 4, 2026 10:20 AM (John Doe) -----\nRetained for a reversible recycle-bin exercise.'}},actorId) as DataRecord;
  await security('tasks',recycled,own('group',group.id));
  const recycleCurrent=await app.execute('get_record',{objectTypeId:objects.tasks.id,recordId:recycled.id},actorId) as DataRecord;
  await app.execute('recycle_record',{objectTypeId:objects.tasks.id,recordId:recycled.id,version:recycleCurrent.version},actorId);

  // Real lifecycle samples retain values/history and expose inactive definitions.
  const retired=objects.workshop_tools.fields.find(item=>item.technicalName==='retired_tag')!;
  await app.execute('set_definition_state',{kind:'field',id:retired.id,expectedState:'active',state:'inactive'},actorId);
  const archived=await app.execute('create_object_type',{workspaceId:workspace.id,technicalName:'retired_fixture_tools',labels:labels('Ausgemusterte Geräte','Retired equipment'),standardFields:['keyword']},actorId) as {id:string};
  await app.execute('create_record',{objectTypeId:archived.id,keyword:scenario==='family'?'Retired washing machine':scenario==='business'?'Decommissioned office switch':'Archived workshop scanner'},actorId);
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
  return { workspaceId: workspace.id, workspaceCode:code,workspaceName:options.name??'ITextreme', objects, records, links, accounts, groups: {team: group.id, management: management.id,...Object.fromEntries(Object.entries(scenarioGroups).map(([key,g])=>[key,g.id]))}, lifecycle:{recycledRecordId:recycled.id} };
}

/** Three comparable workspaces, one installation account for each role. */
export async function seedDemoWorkspaces(db:Database,actorId:string){
 const branded=await seedDemoData(db,actorId);
 const standard=await seedDemoData(db,actorId,'demo',{name:'Demo',appearance:defaultWorkspaceAppearance,members:branded.accounts.slice(0,2).map(({id,role})=>({id,role}))});
 const personal=await seedDemoData(db,actorId,'js',{name:'Jürgen Schadek',appearance:juergenSchadekDemoAppearance,members:[{id:branded.accounts[0].id,role:'designer'},{id:branded.accounts.find(a=>a.email==='alex.doe@example.test')!.id,role:'user'}]});
 const accounts=[...new Map([...branded.accounts,...personal.accounts.filter(a=>a.password)].map(a=>[a.id,a])).values()];
 return {...branded,accounts,workspaces:[branded,standard,personal]};
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
