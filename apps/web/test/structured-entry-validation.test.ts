import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pronounDraftProblems,structuredEntryInvalid} from '../src/lib/structured-entry-validation';
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


test('pronouns accept free wording with canonical language tags and isolated draft errors',async()=>{
 const {parseStructuredValue,structuredSummary}=await import('@xobject/contracts');
 const entry={id,language:'EN-gb',value:'they / them'};
 assert.deepEqual(parseStructuredValue('pronoun_entries',[entry]),[{...entry,language:'en-GB'}]);
 assert.equal(structuredSummary('pronoun_entries',[entry]),'EN-gb: they / them');
 assert.equal(structuredEntryInvalid('pronoun_entries',entry),false);
 assert.equal(structuredEntryInvalid('pronoun_entries',{...entry,language:'en_gb'}),true);
 assert.equal(structuredEntryInvalid('pronoun_entries',{...entry,value:''}),true);
 assert.throws(()=>parseStructuredValue('pronoun_entries',[entry,entry]));
 assert.throws(()=>parseStructuredValue('pronoun_entries',[{...entry,gender:'other'}]));
});


test('pronoun validation identifies only the invalid input within an entry',()=>{
 const entry={id,language:'de',value:'sie/ihr'};
 assert.deepEqual(pronounDraftProblems(entry),{language:false,value:false});
 assert.deepEqual(pronounDraftProblems({...entry,language:'de_DE'}),{language:true,value:false});
 assert.deepEqual(pronounDraftProblems({...entry,value:''}),{language:false,value:true});
 assert.deepEqual(pronounDraftProblems({...entry,language:'',value:''}),{language:true,value:true});
});
