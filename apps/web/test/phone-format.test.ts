import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {TFunction} from 'i18next';
import {formatPhoneNumber} from '../src/lib/phone-format';
import {displayFieldValue} from '../src/lib/field-display';

test('international phone presentation groups complete numbers and retains partial input',()=>{
  assert.equal(formatPhoneNumber('+12025550123'),'+1 202 555 0123');
  assert.equal(formatPhoneNumber('+49891234567'),'+49 89 1234567');
  assert.equal(formatPhoneNumber('+442079460018'),'+44 20 7946 0018');
  for(const value of ['', '+', '+49 1', '089 123', 'not a number'])assert.equal(formatPhoneNumber(value),value);
});

test('scalar and collection phone summaries share grouping across usage/type labels without mutating values',()=>{
  const t=((key:string)=>key) as TFunction;
  assert.equal(displayFieldValue({kind:'phone',config:{}},'+12025550123','de',t),'+1 202 555 0123');
  const entries=[{id:'one',value:'+12025550123',contexts:['home','mobile'],preference:1},{id:'two',value:'+49891234567',contexts:['work','fax'],preference:2}];
  const before=structuredClone(entries);
  const options=['home','mobile','work','fax'].map(id=>({id,active:true,labels:{en:id}}));
  assert.equal(displayFieldValue({kind:'structured',config:{schema:'phone_entries',options}},entries,'en',t),'+1 202 555 0123 (home · mobile); +49 89 1234567 (work · fax)');
  assert.deepEqual(entries,before);
});
