import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialInterfaceLanguage} from '../src/lib/interface-language';
test('cold start keeps the last resolved language despite a different browser locale',()=>{
 assert.equal(initialInterfaceLanguage('en','de-DE'),'en');
 assert.equal(initialInterfaceLanguage('de','en-US'),'de');
});
test('missing or unsupported cached language falls back to the browser locale',()=>{
 assert.equal(initialInterfaceLanguage(null,'de-DE'),'de');
 assert.equal(initialInterfaceLanguage('fr','en-GB'),'en');
 assert.equal(initialInterfaceLanguage(null,'fr-FR'),'en');
});
