import {formLayoutEntries,type FormEntry,type FormLayout,type FormRelationship} from './form-layout.js';

/** Supplied semantics use field/choice UUIDs; labels and technical names carry no domain meaning. */
export interface ContactProfile {
 fields:Record<string,string>;
 choiceKeys?:Record<string,Record<string,string>>;
 defaultLanguage?:string;
 relationships:Record<string,string>;
 kinds:{organization:string;individual:string;person:string};
}
export type ContactIssue={fieldId:string;code:'contactKindRequired'|'contactCompanyRequired'|'contactCompanyOrLastRequired'|'contactLastRequired'|'contactCompanyDerived'};
export function contactIssues(profile:ContactProfile|undefined,fields:{id:string;technicalName:string}[],values:Record<string,unknown>):ContactIssue[]{
 if(!profile)return [];
 const value=(purpose:string)=>values[fields.find(field=>field.id===profile.fields[purpose])?.technicalName??''];
 const present=(purpose:string)=>{const item=value(purpose);return Array.isArray(item)?item.length>0:typeof item==='string'?Boolean(item.trim()):item!==null&&item!==undefined;};
 const kind=value('contact_kind'),issue=(purpose:string,code:ContactIssue['code'])=>[{fieldId:profile.fields[purpose],code}];
 if(!Object.values(profile.kinds).includes(String(kind)))return issue('contact_kind','contactKindRequired');
 if(kind===profile.kinds.organization&&!present('company_name'))return issue('company_name','contactCompanyRequired');
 if(kind===profile.kinds.individual&&!present('company_name')&&!present('last_name'))return issue('last_name','contactCompanyOrLastRequired');
 if(kind===profile.kinds.person&&!present('last_name'))return issue('last_name','contactLastRequired');
 if(kind===profile.kinds.person&&present('company_name'))return issue('company_name','contactCompanyDerived');
 return [];
}

export function contactRequiredFields(profile:ContactProfile|undefined,fields:{id:string;technicalName:string}[],values:Record<string,unknown>):string[]{
 if(!profile)return [];
 const value=(purpose:string)=>values[fields.find(field=>field.id===profile.fields[purpose])?.technicalName??''];
 const kind=value('contact_kind');
 if(kind===profile.kinds.organization)return [profile.fields.company_name];
 if(kind===profile.kinds.person||kind===profile.kinds.individual&&!String(value('company_name')??'').trim())return [profile.fields.last_name];
 return [];
}

export type ContactKind=keyof ContactProfile['kinds'];
export const contactKindOrder:ContactKind[]=['organization','person','individual'];
type ContactLayoutField={id:string;technicalName:string;kind:string;config?:{schema?:string}};
/** Module-owned core is fixed; designer metadata contains only additional fields/links. */
export function contactCoreFieldIds(profile:ContactProfile,fields:ContactLayoutField[]):Set<string>{
 return new Set([...Object.entries(profile.fields).filter(([purpose])=>["contact_kind", "company_name", "first_name", "additional_names", "last_name", "salutation", "academic_title", "name_suffix", "formatted_name", "organization_name", "organization_addresses", "organization_phones", "organization_emails", "emails", "phones", "addresses", "websites", "birthday", "gender", "commercial_register", "notes", "nickname", "languages", "messenger_addresses", "contact_time_zone", "wedding_anniversary", "death_date", "job_title", "function", "department", "keyword", "address_form", "letter_salutation", "pronouns"].includes(purpose)).map(([,id])=>id),...fields.filter(f=>['type','status','category','record_number'].includes(f.technicalName)).map(f=>f.id)]);
}
export function contactCoreEntry(profile:ContactProfile,fields:ContactLayoutField[],entry:FormEntry):boolean{
 return 'fieldId'in entry?contactCoreFieldIds(profile,fields).has(entry.fieldId):'relationshipTypeId'in entry?entry.relationshipTypeId===profile.relationships.contact_person&&entry.side==='right':false;
}
/** Apply the module's Family suggestion to a new template or an explicitly requested layout update. */
export function contactFamilyListLayout(profile:ContactProfile,layout:FormLayout):FormLayout{
 const ids=new Set(['contact_parent','contact_partner','contact_sibling'].map(key=>profile.relationships[key]).filter(Boolean));
 const family=(entry:FormEntry)=>'relationshipTypeId'in entry&&ids.has(entry.relationshipTypeId);
 const entries=formLayoutEntries(layout).filter(family);
 if(!entries.length||layout.groups.some(group=>group.relationshipList&&group.fields.length===entries.length&&group.fields.every(family)))return layout;
 const groups=layout.groups.flatMap(group=>{const fields=group.fields.filter(entry=>!family(entry));return group.fields.length&&!fields.length?[]:[{...group,fields}];});
 let id='contact-family',index=1;while(groups.some(group=>group.id===id))id=`contact-family-${++index}`;
 groups.push({id,labels:{en:'Family',de:'Familie'},width:'full',relationshipList:true,fields:entries.map(entry=>({...entry,width:'full'}))});
 return {...layout,groups,unassigned:layout.unassigned?.filter(entry=>!family(entry))};
}
export function contactExtensionLayout(profile:ContactProfile,fields:ContactLayoutField[],layout:FormLayout|undefined):FormLayout|undefined{
 if(!layout)return undefined;
 return {...layout,groups:layout.groups.map(g=>({...g,fields:g.fields.filter(e=>!contactCoreEntry(profile,fields,e))})),unassigned:layout.unassigned?.filter(e=>!contactCoreEntry(profile,fields,e))};
}
export function contactCoreLayout(profile:ContactProfile,fields:ContactLayoutField[],relationships:FormRelationship[]):FormLayout{
 const entry=(purpose:string):FormEntry[]=>fields.some(f=>f.id===profile.fields[purpose])?[{fieldId:profile.fields[purpose],width:['company_name','organization_name','organization_phones','organization_emails','organization_addresses','notes','emails','phones','addresses','websites','messenger_addresses','function','letter_salutation','pronouns'].includes(purpose)?'full':'half'}]:[];
 const relation=(key:string)=>relationships.filter(r=>r.definition.id===profile.relationships[key]).map(r=>({relationshipTypeId:r.definition.id,side:r.side,width:(r.side==='left'?r.definition.leftMax:r.definition.rightMax)===1?'half':'full',visible:true,expanded:'open'} as FormEntry));
 const group=(id:string,en:string,de:string,entries:FormEntry[])=>({id,labels:{en,de},fields:entries});
 return {groups:[
 group('contact-name','Name & organization','Name & Organisation',[...entry('company_name'),...entry('salutation'),...entry('academic_title'),...entry('first_name'),...entry('additional_names'),...entry('last_name'),...entry('name_suffix'),...entry('nickname'),...entry('pronouns'),...relation('contact_person').filter(e=>'side'in e&&e.side==='right').map(e=>({...e,width:'full' as const}))]),
 group('contact-organization','Organization','Organisation',['organization_name','organization_phones','organization_emails','organization_addresses'].flatMap(entry).map(e=>'fieldId'in e?{...e,width:[profile.fields.organization_phones,profile.fields.organization_emails].includes(e.fieldId)?'half' as const:'full' as const}:e)),
 group('contact-business','Professional details','Berufliche Angaben',['job_title','department','function'].flatMap(entry)),
 group('contact-details','Further details','Weitere Angaben',[...fields.filter(f=>f.technicalName==='record_number').map(f=>({fieldId:f.id,width:'half' as const})),...['birthday','death_date','wedding_anniversary','gender','commercial_register'].flatMap(entry)]),
 group('contact-locale','Language & time zone','Sprache & Zeitzone',['contact_time_zone','languages'].flatMap(entry)),
 group('contact-correspondence','Correspondence','Korrespondenz',['address_form','letter_salutation'].flatMap(entry)),
 group('contact-communication','Contact details','Kontaktdaten',['phones','emails','websites','messenger_addresses'].flatMap(entry)),
 group('contact-addresses','Addresses','Adressen',entry('addresses')),
 group('contact-classification','Classification','Einordnung',fields.filter(f=>['type','status','category'].includes(f.technicalName)).map(f=>({fieldId:f.id,width:f.technicalName==='category'?'full':'half'}))),
 group('contact-notes','Notes','Notizen',entry('notes'))
 ].filter(g=>g.fields.length)};
}

/** Suggestions use only explicitly readable sources. Pronouns and gender never select a form. */
export function contactLetterSalutation(profile:ContactProfile,fields:{id:string;technicalName:string;fieldPermissions?:{read?:boolean}}[],values:Record<string,unknown>):string|null{
 const source=(purpose:string)=>{const f=fields.find(f=>f.id===profile.fields[purpose]);return f&&f.fieldPermissions?.read!==false&&Object.hasOwn(values,f.technicalName)?values[f.technicalName]:undefined;};
 const required=['contact_kind','first_name','last_name','academic_title','salutation','address_form','languages','company_name'];
 if(required.some(key=>source(key)===undefined))return null;
 const name=(key:string)=>{const v=source(key);return Array.isArray(v)?v.map(p=>typeof p==='object'&&p&&'text'in p?String(p.text):'').join(' ').trim():'';};
 const first=name('first_name'),last=name('last_name');
 const titleId=source('academic_title'),titleField=fields.find(f=>f.id===profile.fields.academic_title) as {config?:{options?:{id:string;labels:Record<string,string>}[]}}|undefined;
 const languages=source('languages'),tag=Array.isArray(languages)&&languages.length?String(languages[0]?.value??''):profile.defaultLanguage??'en';
 const language=tag.split('-')[0].toLowerCase(),de=language==='de';
 if(!['de','en'].includes(language))return null;
 const titleOption=titleField?.config?.options?.find(o=>o.id===titleId),title=titleOption?.labels[language]??titleOption?.labels.en??titleOption?.labels.de??'';
 const form=source('address_form'),forms=profile.choiceKeys?.address_form??{},salutation=source('salutation'),salutations=profile.choiceKeys?.salutation??{};
 if(source('contact_kind')===profile.kinds.organization)return de?'Guten Tag,':'Hello,';
 if(form===forms.informal&&form!=null)return first?`${de?'Hallo':'Hello'} ${first},`:de?'Hallo,':'Hello,';
 const full=[first,last].filter(Boolean).join(' ')||String(source('company_name')??'').trim();
 if(form===forms.formal&&form!=null&&last){
  const family=[title,last].filter(Boolean).join(' ');
  if(!de&&title)return `Dear ${family},`;
  if(salutation===salutations.mr&&salutation!=null)return de?`Sehr geehrter Herr ${family},`:`Dear Mr ${family},`;
  if(salutation===salutations.ms&&salutation!=null)return de?`Sehr geehrte Frau ${family},`:`Dear Ms ${family},`;
  if(!de&&salutation===salutations.mx&&salutation!=null)return `Dear Mx ${family},`;
 }
 return `${de?'Guten Tag':'Hello'}${full?' '+full:''},`;
}
