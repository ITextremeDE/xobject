import {test} from 'node:test';
import assert from 'node:assert/strict';
import i18next from 'i18next';
import {postalAddressLines,postalAddressLimits,postalAddressLineLimit,postalAddressSchema,structuredSummary,defaultRegionalSettings,type JournalEntry} from '@xobject/contracts';
import {addressDraftProblems} from '../src/lib/structured-entry-validation';
import {journalFieldValue} from '../src/lib/journal-field-value';
const blank={poBox:'',extended:'',streetLines:[] as string[],houseNumber:'',postalCode:'',locality:'',region:'',country:'',formatted:''};
const id='019da41b-2082-79e3-9bcc-7700db769817';

test('address projection includes all components and preserves source values and street-line order',()=>{
 const address={...blank,extended:'Building B · Floor 3',streetLines:['Example Road','North entrance'],houseNumber:'10a',poBox:'123',postalCode:'80331',locality:'Munich',region:'Bavaria',country:'Germany',formatted:'Outdated external label'};
 const before=structuredClone(address);
 assert.deepEqual(postalAddressLines(address),['Building B · Floor 3','Example Road 10a','North entrance','PO Box: 123','80331 Munich','Bavaria','Germany']);
 assert.ok(postalAddressLines(address,'Postfach').includes('Postfach: 123'));
 assert.ok(structuredSummary('address_entries',[{id,contexts:[],preference:1,address}]).includes('Bavaria'));
 assert.deepEqual(address,before);
 assert.deepEqual(postalAddressLines({...blank,formatted:'Retained\nexternal label'}),['Retained','external label']);
 assert.deepEqual(postalAddressLines(blank),[]);
});

test('shared address component boundaries identify only the offending visible field',()=>{
 for(const key of ['poBox','extended','houseNumber','postalCode','locality','region','country'] as const){
  const atLimit={...blank,[key]:'x'.repeat(postalAddressLimits[key])};
  assert.equal(postalAddressSchema.safeParse(atLimit).success,true);
  assert.deepEqual(addressDraftProblems({...atLimit,[key]:'x'.repeat(postalAddressLimits[key]+1)}).fields,{[key]:{kind:'tooLong',limit:postalAddressLimits[key]}});
 }
 assert.deepEqual(addressDraftProblems({...blank,streetLines:['x'.repeat(201)]}).fields,{streetLines:{kind:'tooLong',limit:200}});
 assert.deepEqual(addressDraftProblems(blank),{empty:true,general:false,fields:{}});
});

test('additional-line errors are separate from the valid main street and unrelated components',()=>{
 assert.deepEqual(addressDraftProblems({...blank,streetLines:['Street','x'.repeat(201)]}).fields,{additionalStreetLines:{kind:'tooLong',limit:200}});
 assert.deepEqual(addressDraftProblems({...blank,streetLines:['Street','']}).fields,{additionalStreetLines:{kind:'emptyLine'}});
 assert.deepEqual(addressDraftProblems({...blank,streetLines:['','Second line']}).fields,{streetLines:{kind:'emptyLine'}});
 assert.deepEqual(addressDraftProblems({...blank,streetLines:Array(postalAddressLineLimit+1).fill('Line')}).fields,{additionalStreetLines:{kind:'tooManyLines',limit:20}});
});

test('historical address display retains postbox, supplementary lines and region with localized labels',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'de',resources:{de:{translation:{structured_poBox:'Postfach'}}}});
 const entry={value_context:{after:{kind:'structured',config:{schema:'address_entries'}}}} as JournalEntry;
 const value=[{id,contexts:[],preference:1,address:{...blank,poBox:'42',extended:'Hinterhaus',streetLines:['Musterstraße','Eingang West'],houseNumber:'10',postalCode:'80331',locality:'München',region:'Bayern',country:'Deutschland'}}];
 const text=journalFieldValue(entry,value,'after','de',i18n.t,'Europe/Berlin',defaultRegionalSettings);
 assert.equal(text,'Hinterhaus\nMusterstraße 10\nEingang West\nPostfach: 42\n80331 München\nBayern\nDeutschland');
 assert.equal(value[0].address.formatted,'');
});
