import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readTagFilters,tagFilterQuery} from '../src/lib/tag-filters.js';
test('tag filters retain arbitrary text and explicit empty values in URLs and reject stale or malformed criteria',()=>{
 const id=randomUUID(),filters=[{fieldId:id,values:['A & B','Café',null,'null']}];
 const params=new URLSearchParams({tags:tagFilterQuery(filters)!,q:'Keep search'});
 assert.deepEqual(readTagFilters(params,[id]),filters);assert.equal(params.get('q'),'Keep search');
 assert.deepEqual(readTagFilters(params,[]),[]);assert.equal(tagFilterQuery([]),null);
 for(const raw of ['oops','{}',JSON.stringify([...filters,...filters]),JSON.stringify([{fieldId:id,values:['x'.repeat(201)]}])])assert.deepEqual(readTagFilters(new URLSearchParams({tags:raw}),[id]),[]);
});
