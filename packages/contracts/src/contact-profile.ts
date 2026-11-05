import {type FormEntry,type FormLayout,type FormRelationship} from './form-layout.js';

/** Supplied semantics use field/choice UUIDs; labels and technical names carry no domain meaning. */
export interface ContactProfile {
 fields:Record<string,string>;
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
 return new Set([...Object.entries(profile.fields).filter(([purpose])=>["contact_kind", "company_name", "first_name", "additional_names", "last_name", "salutation", "name_prefix", "name_suffix", "formatted_name", "organization_name", "emails", "phones", "addresses", "websites", "birthday", "gender", "commercial_register", "notes", "nickname", "languages", "messenger_addresses", "contact_time_zone", "anniversary", "death_date", "job_title", "function", "department", "keyword"].includes(purpose)).map(([,id])=>id),...fields.filter(f=>['type','status','category','business_number'].includes(f.technicalName)).map(f=>f.id)]);
}
export function contactCoreEntry(profile:ContactProfile,fields:ContactLayoutField[],entry:FormEntry):boolean{
 return 'fieldId'in entry?contactCoreFieldIds(profile,fields).has(entry.fieldId):'relationshipTypeId'in entry?Object.values(profile.relationships).includes(entry.relationshipTypeId):false;
}
export function contactExtensionLayout(profile:ContactProfile,fields:ContactLayoutField[],layout:FormLayout|undefined):FormLayout|undefined{
 if(!layout)return undefined;
 return {...layout,groups:layout.groups.map(g=>({...g,fields:g.fields.filter(e=>!contactCoreEntry(profile,fields,e))})),unassigned:layout.unassigned?.filter(e=>!contactCoreEntry(profile,fields,e))};
}
export function contactCoreLayout(profile:ContactProfile,fields:ContactLayoutField[],relationships:FormRelationship[]):FormLayout{
 const entry=(purpose:string):FormEntry[]=>fields.some(f=>f.id===profile.fields[purpose])?[{fieldId:profile.fields[purpose],width:['company_name','notes','emails','phones','addresses','websites','messenger_addresses','function'].includes(purpose)?'full':'half'}]:[];
 const relation=(key:string)=>relationships.filter(r=>r.definition.id===profile.relationships[key]).map(r=>({relationshipTypeId:r.definition.id,side:r.side,width:(r.side==='left'?r.definition.leftMax:r.definition.rightMax)===1?'half':'full',visible:true,expanded:'open'} as FormEntry));
 const group=(id:string,en:string,de:string,entries:FormEntry[])=>({id,labels:{en,de},fields:entries});
 return {groups:[
 group('contact-name','Name & organization','Name & Organisation',[...entry('company_name'),...entry('salutation'),...entry('name_prefix'),...entry('first_name'),...entry('additional_names'),...entry('last_name'),...entry('name_suffix'),...entry('nickname'),...relation('contact_person').filter(e=>'side'in e&&e.side==='right').map(e=>({...e,width:'full' as const}))]),
 group('contact-business','Professional details','Berufliche Angaben',['job_title','department','function'].flatMap(entry)),
 group('contact-details','Further details','Weitere Angaben',[...fields.filter(f=>f.technicalName==='business_number').map(f=>({fieldId:f.id,width:'half' as const})),...['birthday','death_date','anniversary','gender','commercial_register'].flatMap(entry)]),
 group('contact-locale','Language & time zone','Sprache & Zeitzone',['contact_time_zone','languages'].flatMap(entry)),
 group('contact-communication','Contact details','Kontaktdaten',['phones','emails','websites','messenger_addresses'].flatMap(entry)),
 group('contact-addresses','Addresses','Adressen',entry('addresses')),
 group('contact-classification','Classification','Einordnung',fields.filter(f=>['type','status','category'].includes(f.technicalName)).map(f=>({fieldId:f.id,width:f.technicalName==='category'?'full':'half'}))),
 group('contact-relationships','Relationships','Beziehungen',relationships.filter(r=>Object.values(profile.relationships).includes(r.definition.id)&&!(r.definition.id===profile.relationships.contact_person&&r.side==='right')).map(r=>({relationshipTypeId:r.definition.id,side:r.side,width:'full',visible:true,expanded:'open'}))),
 group('contact-notes','Notes','Notizen',entry('notes'))
 ].filter(g=>g.fields.length)};
}
