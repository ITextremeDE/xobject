import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contactIssues,contactRequiredFields,contactCoreLayout,contactCoreFieldIds,contactExtensionLayout,contactCoreEntry,type ContactProfile} from '@xobject/contracts';
// Renamed columns/labels cannot change the UUID-bound domain meaning.
const profile:ContactProfile={relationships:{},fields:{contact_kind:'kind-id',company_name:'company-id',last_name:'last-id'},kinds:{organization:'organization-id',individual:'individual-id',person:'person-id'}};
const fields=[{id:'kind-id',technicalName:'renamed_kind'},{id:'company-id',technicalName:'renamed_company'},{id:'last-id',technicalName:'renamed_family'}];
test('contact creation validates exclusive contact kinds, organization name and either/or individual names',()=>{
 assert.equal(contactIssues(profile,fields,{} as Record<string,unknown>)[0].code,'contactKindRequired');
 assert.equal(contactIssues(profile,fields,{renamed_kind:'organization-id'})[0].code,'contactCompanyRequired');
 assert.deepEqual(contactIssues(profile,fields,{renamed_kind:'organization-id',renamed_company:'ITextreme'}),[]);
 assert.deepEqual(contactRequiredFields(profile,fields,{renamed_kind:'organization-id',renamed_company:'ITextreme'}),['company-id']);
 assert.equal(contactIssues(profile,fields,{renamed_kind:'individual-id'})[0].code,'contactCompanyOrLastRequired');
 assert.deepEqual(contactIssues(profile,fields,{renamed_kind:'individual-id',renamed_company:'Company'}),[]);
 assert.deepEqual(contactIssues(profile,fields,{renamed_kind:'individual-id',renamed_family:[{text:'Doe'}]}),[]);
 assert.equal(contactIssues(profile,fields,{renamed_kind:'person-id'})[0].code,'contactLastRequired');
 assert.deepEqual(contactIssues(profile,fields,{renamed_kind:'person-id',renamed_family:[{text:'Doe'}]}),[]);
 assert.equal(contactIssues(profile,fields,{renamed_kind:'person-id',renamed_family:[{text:'Doe'}],renamed_company:'Manual copy'})[0].code,'contactCompanyDerived');
 assert.deepEqual(contactIssues(undefined,fields,{renamed_kind:'unknown'}),[]);
});


test('fixed core uses binding IDs, omits derived/controller inputs and preserves configurable extensions',()=>{
 const bound={...profile,fields:{...profile.fields,gender:'gender-id',salutation:'salutation-id',academic_title:'title-id',additional_names:'additional-id',name_suffix:'suffix-id',first_name:'first-id',keyword:'keyword-id',formatted_name:'formatted-id'}};
 const all=[...fields.map(f=>({...f,kind:'text'})),{id:'first-id',technicalName:'anything',kind:'structured'},{id:'keyword-id',technicalName:'keyword',kind:'text'},{id:'formatted-id',technicalName:'renamed_projection',kind:'text'},{id:'number-id',technicalName:'record_number',kind:'text'},{id:'custom-id',technicalName:'custom',kind:'text'}];
 all.push(...['salutation-id','title-id','additional-id','suffix-id','gender-id'].map(id=>({id,technicalName:id,kind:'text'})));
 const core=contactCoreLayout(bound,all,[]),ids=core.groups.flatMap(g=>g.fields).flatMap(e=>'fieldId'in e?[e.fieldId]:[]);
 assert.deepEqual(core.groups[0].fields.flatMap(e=>'fieldId'in e?[e.fieldId]:[]),['company-id','salutation-id','title-id','first-id','additional-id','last-id','suffix-id']);assert.ok(!core.groups.some(g=>g.id==='contact-name-details'));
 assert.deepEqual(core.groups.find(g=>g.id==='contact-details')?.fields,[{fieldId:'number-id',width:'half'},{fieldId:'gender-id',width:'half'}]);assert.ok(!core.groups.find(g=>g.id==='contact-classification')?.fields.some(e=>'fieldId'in e&&e.fieldId==='number-id'));
 assert.ok(ids.includes('first-id'));assert.ok(ids.includes('company-id'));
 assert.ok(!ids.includes('kind-id'));assert.ok(!ids.includes('keyword-id'));assert.ok(!ids.includes('formatted-id'));assert.ok(!ids.includes('custom-id'));
 assert.ok(contactCoreFieldIds(bound,all).has('kind-id'));
 assert.ok(contactCoreFieldIds(bound,all).has('number-id'));
 assert.ok(contactCoreEntry(bound,all,{fieldId:'company-id',width:'half'}));
 const extensions=contactExtensionLayout(bound,all,{groups:[{id:'extra',labels:{en:'Extra'},fields:[{fieldId:'company-id',width:'half'},{fieldId:'number-id',width:'full'},{fieldId:'custom-id',width:'full'}]},{id:'empty',labels:{en:'Empty'},fields:[]}]})!;
 assert.deepEqual(extensions.groups[0].fields,[{fieldId:'custom-id',width:'full'}]);assert.equal(extensions.groups[1].id,'empty');
});

test('additional Contact fields use semantic identities in the fixed name, details and communication groups',()=>{
 const purposes=['nickname','birthday','death_date','wedding_anniversary','languages','messenger_addresses','contact_time_zone'];
 const bindings=Object.fromEntries(purposes.map((purpose,index)=>[purpose,`new-${index}`]));
 const bound={...profile,fields:{...profile.fields,...bindings}};
 const all=purposes.map(purpose=>({id:bindings[purpose],technicalName:`renamed_${purpose}`,kind:purpose==='nickname'?'text':'structured'}));
 const layout=contactCoreLayout(bound,all,[]);
 const ids=(group:string)=>layout.groups.find(g=>g.id===group)?.fields.flatMap(e=>'fieldId'in e?[e.fieldId]:[]);
 assert.deepEqual(ids('contact-name'),[bindings.nickname]);
 assert.deepEqual(ids('contact-details'),[bindings.birthday,bindings.death_date,bindings.wedding_anniversary]);
 assert.deepEqual(ids('contact-locale'),[bindings.contact_time_zone,bindings.languages]);
 assert.deepEqual(ids('contact-communication'),[bindings.messenger_addresses]);
 assert.ok(purposes.every(purpose=>contactCoreFieldIds(bound,all).has(bindings[purpose])));
});

test('professional fields form their own fixed section, independent of Organization links or company name',()=>{
 const fields=['job_title','department','function'].map(purpose=>({id:`professional-${purpose}`,technicalName:`renamed-${purpose}`,kind:purpose==='function'?'multiple_choice':'text'}));
 const bound={...profile,fields:{...profile.fields,...Object.fromEntries(fields.map(f=>[f.technicalName.slice(8),f.id]))}};
 const layout=contactCoreLayout(bound,fields,[]),business=layout.groups.find(g=>g.id==='contact-business')!;
 assert.equal(business.labels.en,'Professional details');assert.equal(business.labels.de,'Berufliche Angaben');assert.deepEqual(business.fields.flatMap(e=>'fieldId'in e?[e.fieldId]:[]),fields.map(f=>f.id));assert.ok(!layout.groups.some(g=>g.id==='contact-name'));
});
