import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegionalSettings} from '@xobject/contracts';
import {parseNumericDraft,localizedFieldDraft,numericDraftError,normalizedFieldDraft} from '../src/lib/numeric-input.js';
const de={...defaultRegionalSettings,locale:'de-DE' as const},en={...defaultRegionalSettings,locale:'en-US' as const};
const money={kind:'money',config:{scale:2,currency:'EUR'}};
test('regional number input preserves exact decimals and validates grouping without floating point',()=>{
 assert.equal(parseNumericDraft('9.007.199.254.740.993,12',de),'9007199254740993.12');
 assert.equal(parseNumericDraft('-9,007,199,254,740,993.12',en),'-9007199254740993.12');
 for(const input of ['12.34,50','1,23,45','123e3','Infinity','NaN','--1','1,'])assert.equal(parseNumericDraft(input,de),null,input);
 assert.equal(parseNumericDraft('1,234.50',de),null);
 assert.equal(parseNumericDraft('1234.50',{...de,numberFormat:'dot'}),'1234.50');
});
test('canonical values become regional drafts and money saves back with exact strings',()=>{
 const value={amount:'9007199254740993.12',currency:'EUR'};
 const draft=localizedFieldDraft(money,value,de);assert.deepEqual(draft,{amount:'9007199254740993,12',currency:'EUR'});
 assert.deepEqual(normalizedFieldDraft(money,draft,de),value);
 assert.deepEqual(normalizedFieldDraft(money,{amount:'1.150,50',currency:'EUR'},de),{amount:'1150.50',currency:'EUR'});
 assert.equal(normalizedFieldDraft(money,{amount:'',currency:'EUR'},de),null);
});
test('invalid numeric drafts cannot pass save validation or silently round precision and bounds',()=>{
 assert.equal(numericDraftError(money,{amount:'1,234',currency:'EUR'},de),'numericPrecisionError');
 assert.equal(numericDraftError(money,{amount:'1,2300',currency:'EUR'},de),null);
 assert.equal(numericDraftError(money,{amount:'1,23',currency:'ZZZ'},de),'invalidCurrencyInput');
 assert.equal(numericDraftError(money,{amount:'text',currency:'EUR'},de),'invalidNumericInput');
 assert.throws(()=>normalizedFieldDraft(money,{amount:'text',currency:'EUR'},de));
 const integer={kind:'integer',config:{}};
 assert.equal(numericDraftError(integer,'9223372036854775807',de),null);
 assert.equal(numericDraftError(integer,'9223372036854775808',de),'numericOutOfRange');
 assert.equal(numericDraftError(integer,'1,5',de),'invalidIntegerInput');
 assert.equal(numericDraftError({kind:'decimal',config:{scale:12}},'1'.repeat(27),de),'numericPrecisionError');
});
