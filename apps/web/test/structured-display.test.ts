import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {TFunction} from 'i18next';
import {displayFieldValue} from '../src/lib/field-display';
const t=((key:string)=>key) as TFunction;
const id='018f1234-5678-7890-8123-123456789abc';
const options=[{id:'work',labels:{en:'Work',de:'Geschäftlich'},active:true},{id:'mobile',labels:{en:'Mobile',de:'Mobil'},active:true},{id:'voice',labels:{en:'Voice calls',de:'Sprachanrufe'},active:false}];
test('structured history makes usage/type-only changes visible using the supplied snapshot labels',()=>{
 const field={kind:'structured',config:{schema:'phone_entries' as const,options}};
 const entry={id,value:'+49891234567',contexts:['work','mobile','voice'],preference:1};
 assert.equal(displayFieldValue(field,[entry],'de',t),'+49 89 1234567 (Geschäftlich · Mobil · Sprachanrufe)');
 assert.equal(displayFieldValue(field,[{...entry,contexts:['work','mobile']}],'en',t),'+49 89 1234567 (Work · Mobile)');
 const snapshot={...field,config:{...field.config,options:options.map(o=>({...o,labels:{en:'Historical '+o.labels.en,de:'Früher '+o.labels.de}}))}};
 assert.match(displayFieldValue(snapshot,[entry],'de',t),/Früher Sprachanrufe/);
});
test('address, language and pronoun summaries retain contents and only applicable context labels',()=>{
 const address={id,contexts:['work'],preference:1,address:{poBox:'',extended:'',streetLines:['Example Lane'],houseNumber:'1',postalCode:'80331',locality:'Munich',region:'Bavaria',country:'Germany',formatted:''}};
 assert.match(displayFieldValue({kind:'structured',config:{schema:'address_entries',options}},[address],'en',t),/Example Lane 1\n80331 Munich\nBavaria\nGermany \(Work\)$/);
 assert.equal(displayFieldValue({kind:'structured',config:{schema:'pronoun_entries'}},[{id,language:'de',value:'sie/ihr'}],'en',t),'de: sie/ihr');
 assert.equal(displayFieldValue({kind:'structured',config:{schema:'language_entries'}},[{id,value:'en-GB',contexts:[],preference:1}],'en',t),'en-GB');
});
