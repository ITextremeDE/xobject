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
 const draft=localizedFieldDraft(money,value,de);assert.deepEqual(draft,{amount:'9.007.199.254.740.993,12',currency:'EUR'});
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

test('loaded and blurred numeric fields group valid values while retaining invalid drafts',async()=>{
 const {formatNumericDraft,sameFieldDraft}=await import('../src/lib/numeric-input.js');
 const integer={kind:'integer',config:{}};
 assert.equal(localizedFieldDraft(integer,'66000',de),'66.000');
 assert.deepEqual(formatNumericDraft(money,{amount:'44000',currency:'EUR'},de),{amount:'44.000,00',currency:'EUR'});
 assert.deepEqual(formatNumericDraft(money,{amount:'1,',currency:'EUR'},de),{amount:'1,',currency:'EUR'});
 assert.equal(sameFieldDraft(money,{amount:'44000',currency:'EUR'},{amount:'44.000,00',currency:'EUR'},de),true);
 assert.equal(sameFieldDraft(integer,'0001','1',de),true);
 assert.equal(sameFieldDraft({kind:'decimal',config:{scale:2}},'-0,00','0',de),true);
 assert.equal(sameFieldDraft(money,{amount:'44.000,00',currency:'EUR'},{amount:'44.000,00',currency:'USD'},de),false);
});
test('supported spacing and apostrophe variants remain strict about group placement',()=>{
 const at={...de,locale:'de-AT' as const},ch={...de,locale:'de-CH' as const};
 for(const separator of [' ','\u00a0','\u202f'])assert.equal(parseNumericDraft(`1${separator}234${separator}567,89`,at),'1234567.89');
 assert.equal(parseNumericDraft('1’234’567.89',ch),'1234567.89');
 assert.equal(parseNumericDraft('1 23,45',at),null);assert.equal(parseNumericDraft('1 234,56',de),null);
});
test('format transitions preserve exact draft values and fail closed for incomplete input',async()=>{
 const {reformatNumericDrafts}=await import('../src/lib/numeric-input.js');
 const fields=[{...money,technicalName:'amount'},{kind:'decimal',config:{scale:3},technicalName:'ratio'}];
 const values={amount:{amount:'9.007.199.254.740.993,12',currency:'EUR'},ratio:'1,234',title:'Unchanged'};
 const changed=reformatNumericDrafts(fields,values,de,en)!;
 assert.deepEqual(changed,{amount:{amount:'9,007,199,254,740,993.12',currency:'EUR'},ratio:'1.234',title:'Unchanged'});
 assert.deepEqual(reformatNumericDrafts(fields,changed,en,de),{...values,ratio:'1,234'});
 assert.equal(reformatNumericDrafts(fields,{...values,ratio:'1,'},de,en),null);
 assert.equal(values.ratio,'1,234','the original draft remains untouched');
});

test('grouped numeric drafts round trip every regional catalog entry and number-format override exactly',async()=>{
 const {regionalLocales}=await import('@xobject/contracts');
 for(const locale of regionalLocales)for(const numberFormat of ['locale','dot','comma'] as const){
  const regional={...de,locale,numberFormat};
  for(const amount of ['0.00','-9007199254740993.12','9007199254740993.12']){
   const value={amount,currency:'EUR'};
   assert.deepEqual(normalizedFieldDraft(money,localizedFieldDraft(money,value,regional),regional),value,`${locale}/${numberFormat}/${amount}`);
  }
 }
});
