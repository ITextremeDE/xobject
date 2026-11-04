import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegionalSettings,type RegionalSettings} from '@xobject/contracts';
import {birthdayValue,birthdayPattern,birthdayInputText,parseBirthdayInput} from '../src/lib/birthday-input';

test('birthdays round-trip regional full and yearless formats without inventing a year',()=>{
 for(const [locale,dateFormat,full,partial] of [['en-US','locale','02/29/2000','02/29'],['de-DE','locale','29.02.2000','29.02'],['en-GB','locale','29/02/2000','29/02'],['en-US','iso','2000-02-29','02-29'],['en-US','dmy','29.02.2000','29.02'],['de-DE','mdy','02/29/2000','02/29']] as const){
  const region:RegionalSettings={...defaultRegionalSettings,locale,dateFormat};
  assert.equal(birthdayInputText({year:2000,month:2,day:29},region),full);
  assert.equal(birthdayInputText({year:null,month:2,day:29},region),partial);
  assert.deepEqual(parseBirthdayInput(full,region),{year:2000,month:2,day:29});
  assert.deepEqual(parseBirthdayInput(partial,region),{year:null,month:2,day:29});
  assert.ok(!birthdayPattern(region,false).includes('YYYY'));
 }
});
test('birthday input rejects incomplete and impossible dates, accepts ISO paste and retains explicit unknown years',()=>{
 const region=defaultRegionalSettings;
 for(const raw of ['02/','02/30','02/29/2023','00/12','13/10','02/15/0000','not a date'])assert.equal(parseBirthdayInput(raw,region),null,raw);
 assert.deepEqual(parseBirthdayInput('1990-06-15',region),{year:1990,month:6,day:15});
 assert.deepEqual(parseBirthdayInput('2/9',region),{year:null,month:2,day:9});
 assert.deepEqual(parseBirthdayInput('29.02.',{...region,locale:'de-DE'}),{year:null,month:2,day:29});
 assert.equal(birthdayValue('unfinished draft'),null);assert.equal(birthdayValue(null),null);
});
