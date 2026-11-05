import {test} from 'node:test';
import assert from 'node:assert/strict';
import {v7} from 'uuid';
import {parseStructuredValue,defaultFieldConfig} from '@xobject/contracts';
import {normalizeFieldValue,convertFieldValue,fieldConfig} from '../src/field-types.js';
const field=(schema:Parameters<typeof parseStructuredValue>[0])=>({id:v7(),technical_name:'details',kind:'structured',required:false,config:{...defaultFieldConfig('structured'),schema}});
test('structured contact values preserve entry order, precise preference and partial dates without invented years',()=>{
 const one={id:v7(),text:'Ada'},two={id:v7(),text:'Augusta'};assert.deepEqual(normalizeFieldValue(field('name_components'),[two,one]),[two,one]);
 assert.deepEqual(normalizeFieldValue(field('partial_date'),{month:2,day:29,year:null}),{month:2,day:29,year:null});
 for(const value of [{month:2,day:29,year:1900},{month:4,day:31,year:null},{month:1,day:0,year:null},{month:1,day:1,year:null,unknown:true}])assert.throws(()=>normalizeFieldValue(field('partial_date'),value));
 assert.throws(()=>normalizeFieldValue(field('name_components'),[one,one]));assert.throws(()=>normalizeFieldValue({...field('name_components'),required:true},[]));
 assert.deepEqual(convertFieldValue(field('name_components'),field('name_components'),[]),[]);
});
test('typed collections validate scopes, phone normalization, protocols and exact structure before storage',()=>{
 const entry={id:v7(),contexts:[],preference:1,value:'+49 89 20100010'};
 assert.equal((normalizeFieldValue(field('phone_entries'),[entry]) as typeof entry[])[0].value,'+498920100010');
 assert.throws(()=>normalizeFieldValue(field('phone_entries'),[{...entry,value:'123'}]));
 assert.throws(()=>normalizeFieldValue(field('email_entries'),[{...entry,value:'not-email'}]));
 assert.throws(()=>normalizeFieldValue(field('url_entries'),[{...entry,value:'javascript:alert(1)'}]));
 assert.throws(()=>normalizeFieldValue(field('email_entries'),[{...entry,value:'ada@example.test',contexts:[v7()]}]));
 assert.throws(()=>normalizeFieldValue(field('email_entries'),[{...entry,value:'ada@example.test',preference:0}]));
 assert.throws(()=>parseStructuredValue('name_components',Array.from({length:21},()=>({id:v7(),text:'Name'}))));
 assert.throws(()=>convertFieldValue(field('name_components'),{...field('name_components'),kind:'text',config:{}},[{id:v7(),text:'Ada'}]));
 assert.throws(()=>convertFieldValue(field('name_components'),field('email_entries'),[{id:v7(),text:'Ada'}]));
 assert.throws(()=>fieldConfig('structured',{schema:'name_components',formatted:true}));
 const option={id:v7(),labels:{en:'Work'},active:false},retained={...entry,value:'ada@example.test',contexts:[option.id]};
 const configured={...field('email_entries'),config:{...field('email_entries').config,options:[option]}};
 assert.throws(()=>normalizeFieldValue(configured,[retained]));
 assert.deepEqual(normalizeFieldValue(configured,[retained],[retained]),[retained]);
 assert.throws(()=>normalizeFieldValue(configured,[{...retained,id:v7()}],[retained]));
 assert.throws(()=>parseStructuredValue('address_entries',Array.from({length:100},()=>({id:v7(),contexts:[],preference:null,address:{poBox:'',extended:'',streetLines:Array(20).fill('ä'.repeat(200)),houseNumber:'',postalCode:'',locality:'',region:'',country:'',formatted:'x'.repeat(2000)}}))));
});

test('communication languages, messenger URIs and named domain zones are typed without network or display-zone conversion',()=>{
 const entry={id:v7(),value:'EN-gb',contexts:[],preference:null};
 assert.deepEqual(normalizeFieldValue(field('language_entries'),[entry]),[{...entry,value:'en-GB',preference:1}]);
 assert.throws(()=>normalizeFieldValue(field('language_entries'),[{...entry,value:'not_a_language'}]));
 assert.deepEqual(normalizeFieldValue(field('messenger_entries'),[{...entry,value:'xmpp:ada@example.test'}]),[{...entry,value:'xmpp:ada@example.test',preference:1}]);
 for(const uri of ['javascript:alert(1)','data:text/plain,test','file:///etc/passwd','xmpp:','xmpp:ada smith@example.test','https://user:secret@example.test'])assert.throws(()=>normalizeFieldValue(field('messenger_entries'),[{...entry,value:uri}]));
 assert.deepEqual(normalizeFieldValue(field('time_zone'),{timeZone:'America/New_York'}),{timeZone:'America/New_York'});
 assert.throws(()=>normalizeFieldValue(field('time_zone'),{timeZone:'Unknown/Somewhere'}));
 assert.throws(()=>normalizeFieldValue(field('time_zone'),{timeZone:'+02:00'}));
 assert.throws(()=>normalizeFieldValue(field('partial_date'),{month:2,day:29,year:2025}));
 assert.deepEqual(normalizeFieldValue(field('partial_date'),{month:2,day:29,year:null}),{month:2,day:29,year:null});
});

test('telephone and messenger option groups remain codec-specific and immutable',()=>{
 const usage={id:v7(),labels:{en:'Work'},active:true,group:'usage' as const},type={id:v7(),labels:{en:'XMPP'},active:true,group:'messenger_type' as const};
 const config={schema:'messenger_entries' as const,options:[usage,type]};
 assert.deepEqual(fieldConfig('structured',config),{...defaultFieldConfig('structured'),...config});
 assert.throws(()=>fieldConfig('structured',{...config,options:[{...type,group:'phone_type'}]}));
 assert.throws(()=>fieldConfig('structured',{...config,options:[{id:v7(),labels:{en:'No group'},active:true}]}));
 assert.throws(()=>fieldConfig('structured',{schema:'phone_entries',options:[type]}));
 assert.throws(()=>fieldConfig('structured',{schema:'email_entries',options:[usage]}));
 assert.throws(()=>fieldConfig('structured',{...config,options:[usage,{...type,group:'usage'}]},config));
 const stored={id:v7(),value:'xmpp:ada@example.test',contexts:[usage.id,type.id],preference:1};
 const inactive={...field('messenger_entries'),config:{...config,options:[usage,{...type,active:false}]}};
 assert.throws(()=>normalizeFieldValue(inactive,[stored]));
 assert.deepEqual(normalizeFieldValue(inactive,[{...stored,value:'xmpp:ada.new@example.test'}],[stored]),[{...stored,value:'xmpp:ada.new@example.test'}]);
});

test('postal address limits reject oversized components and preserve supplemental data without generating a stored label',()=>{
 const address={poBox:'42',extended:'Building B',streetLines:['Example Road','North entrance'],houseNumber:'10',postalCode:'80331',locality:'Munich',region:'Bavaria',country:'Germany',formatted:''};
 const entry={id:v7(),contexts:[],preference:null,address};
 assert.deepEqual(normalizeFieldValue(field('address_entries'),[entry]),[{...entry,preference:1}]);
 for(const [key,limit] of [['houseNumber',100],['postalCode',100],['poBox',200],['extended',200],['region',200]] as const)assert.throws(()=>normalizeFieldValue(field('address_entries'),[{...entry,address:{...address,[key]:'x'.repeat(limit+1)}}]));
 assert.throws(()=>normalizeFieldValue(field('address_entries'),[{...entry,address:{...address,streetLines:['Example Road','x'.repeat(201)]}}]));
 assert.equal(address.formatted,'');
});
