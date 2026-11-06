import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveContentRule,type ContentGrant} from '@xobject/contracts';
import {displayedFieldLevel,systemManagedField} from '../src/lib/field-permission-display.js';

test('permission previews retain denials and never promise editing generated fields',()=>{
 const number={technicalName:'record_number'},derived={technicalName:'keyword',isDerived:true},custom={technicalName:'notes'};
 for(const field of [number,derived]){
  assert.equal(systemManagedField(field),true);
  assert.equal(displayedFieldLevel('none',field),'none');
  assert.equal(displayedFieldLevel('edit',field),'read');
  assert.equal(displayedFieldLevel('read',field),'read');
 }
 assert.equal(displayedFieldLevel('edit',custom),'edit');
});

test('effective permission explanations follow additive groups, user overrides and the object cap',()=>{
 const field='field',reader:ContentGrant={kind:'group',id:'reader',level:'read',fields:{[field]:'none'}},editor:ContentGrant={kind:'group',id:'editor',level:'edit',fields:{}};
 let grants=[reader,editor];
 assert.equal(resolveContentRule(grants,'user',['reader','editor']).level,'edit');
 assert.deepEqual(resolveContentRule(grants,'user',['reader'],field),{level:'none',sources:[reader]});
 assert.deepEqual(resolveContentRule(grants,'user',['reader','editor'],field),{level:'edit',sources:[editor]});
 const own:ContentGrant={kind:'user',id:'user',level:'read',fields:{[field]:'edit'}};grants=[...grants,own];
 assert.deepEqual(resolveContentRule(grants,'user',['reader','editor'],field),{level:'read',sources:[own]});
 own.level='none';assert.equal(resolveContentRule(grants,'user',['reader','editor'],field).level,'none');
 own.level=null;own.fields[field]='none';assert.deepEqual(resolveContentRule(grants,'user',['reader','editor'],field),{level:'none',sources:[own]});
 assert.deepEqual(resolveContentRule(grants,'different',[],field),{level:'none',sources:[]});
});
