import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyFieldDefaults,emptyFieldInputRules,numberingPeriod,formatBusinessNumber,defaultNumbering,numberingSchema} from '@xobject/contracts';
test('creation defaults preserve explicit values, follow controller defaults and never mutate definitions',()=>{
 const fields=[{id:'dependent',technicalName:'detail',applicability:{fieldId:'controller',optionIds:['yes']},inputRules:{...emptyFieldInputRules(),defaultValue:'Suggested'}},{id:'controller',technicalName:'kind',inputRules:{...emptyFieldInputRules(),defaultValue:'yes'}},{id:'flag',technicalName:'flag',inputRules:{...emptyFieldInputRules(),defaultValue:true}}];
 const before=structuredClone(fields);
 assert.deepEqual(applyFieldDefaults(fields,{}),{kind:'yes',detail:'Suggested',flag:true});
 assert.deepEqual(applyFieldDefaults(fields,{kind:'no',flag:false,detail:null}),{kind:'no',flag:false,detail:null});
 assert.deepEqual(applyFieldDefaults(fields,{kind:null,flag:false}),{kind:null,flag:false});assert.deepEqual(fields,before);
});
test('number periods follow workspace zones at year/month boundaries and formatting preserves exact large integers',()=>{
 const yearly={...defaultNumbering(),enabled:true,restart:'yearly' as const,prefix:'ITX-',suffix:'-A',padding:4};
 const instant=new Date('2026-12-31T23:30:00Z');assert.equal(numberingPeriod(yearly,instant,'Europe/Berlin'),'2027');assert.equal(numberingPeriod(yearly,instant,'America/New_York'),'2026');
 assert.equal(numberingPeriod({...yearly,restart:'monthly'},instant,'Europe/Berlin'),'2027-01');
 assert.equal(formatBusinessNumber(yearly,'10','2027'),'ITX-2027-0010-A');assert.equal(formatBusinessNumber(yearly,'999999999999999999999999999999','2027'),'ITX-2027-999999999999999999999999999999-A');
 assert.equal(numberingSchema.safeParse({...yearly,start:'0'}).success,false);assert.equal(numberingSchema.safeParse({...yearly,increment:'1.5'}).success,false);assert.equal(numberingSchema.safeParse({...yearly,padding:31}).success,false);
});
