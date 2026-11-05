import test from 'node:test';
import assert from 'node:assert/strict';
import {countryOptions,countryMatches} from '../src/lib/countries';
test('country choices localize and sort without rewriting current address text',()=>{
 const german=countryOptions('de','Germany'),english=countryOptions('en','Germany');
 assert.ok(german.length>=249);assert.equal(english.length,german.length);
 assert.equal(german.find(c=>c.value==='Germany')?.label,'Deutschland');
 assert.deepEqual(german.map(c=>c.label),german.map(c=>c.label).sort((a,b)=>a.localeCompare(b,'de')));
 const existing=countryOptions('en','Deutschland').find(c=>c.value==='Deutschland');assert.equal(existing?.label,'Germany');
 assert.ok(countryOptions('de','Custom region').some(c=>c.value==='Custom region'&&c.label==='Custom region'));
 const germany=german.find(c=>c.value==='Germany')!;
 for(const query of ['Deutschland','germany','DE'])assert.ok(countryMatches(germany,query));
 assert.ok(!countryMatches(germany,'Austria'));
 assert.equal(countryOptions('de','').some(c=>!c.value),false);
});
