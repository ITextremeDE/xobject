import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nameInputText,nameInputValue} from '../src/lib/name-input';
test('plain name input displays every component and preserves unchanged structured identities',()=>{
 const parts=[{id:'first',text:'Anna'},{id:'second',text:'Maria'}];
 assert.equal(nameInputText(parts),'Anna Maria');
 assert.equal(nameInputValue(parts,'Anna Maria',()=>{throw new Error('Unexpected identity allocation');}),parts);
 assert.deepEqual(parts,[{id:'first',text:'Anna'},{id:'second',text:'Maria'}]);
});
test('edited compound names stay one value, retain the first identity and can be cleared',()=>{
 assert.deepEqual(nameInputValue([{id:'first',text:'Anna'},{id:'second',text:'Maria'}],'Anna Maria Louise',()=> 'new'),[{id:'first',text:'Anna Maria Louise'}]);
 assert.deepEqual(nameInputValue([],'Müller-Lüdenscheidt',()=> 'new'),[{id:'new',text:'Müller-Lüdenscheidt'}]);
 assert.equal(nameInputValue([{id:'first',text:'Anna'}],'',()=> 'new'),null);
});
