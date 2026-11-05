import {test} from 'node:test';
import assert from 'node:assert/strict';
import {structuredEntryInvalid} from '../src/lib/structured-entry-validation';
const id='018f1234-5678-7890-8123-123456789abc';
test('invalid collection drafts leave correct sibling entries valid',()=>{
 for(const [schema,value] of [['email_entries','one@example.test'],['phone_entries','+4989123456'],['url_entries','https://example.test']] as const){
  const good={id,value,contexts:[],preference:1};
  assert.equal(structuredEntryInvalid(schema,good),false);
  assert.equal(structuredEntryInvalid(schema,{...good,value:''}),true);
  assert.equal(structuredEntryInvalid(schema,good),false);
 }
 const address={poBox:'',extended:'',streetLines:['Example Road'],houseNumber:'',postalCode:'',locality:'',region:'',country:'',formatted:''};
 assert.equal(structuredEntryInvalid('address_entries',{id,contexts:[],preference:1,address}),false);
 assert.equal(structuredEntryInvalid('address_entries',{id,contexts:[],preference:1,address:{...address,streetLines:[]}}),true);
});

test('language and messenger drafts report errors on their own entries',()=>{
 const base={id,contexts:[],preference:1};
 assert.equal(structuredEntryInvalid('language_entries',{...base,value:'de-DE'}),false);
 assert.equal(structuredEntryInvalid('language_entries',{...base,value:'de_DE'}),true);
 assert.equal(structuredEntryInvalid('messenger_entries',{...base,value:'xmpp:ada@example.test'}),false);
 assert.equal(structuredEntryInvalid('messenger_entries',{...base,value:'javascript:alert(1)'}),true);
});
