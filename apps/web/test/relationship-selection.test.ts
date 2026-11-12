import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {RelatedRecord,RelationshipType} from '@xobject/contracts';
import {toggleRelatedSelection,sameRelatedSelection,eligibleTargetObject} from '../src/lib/relationship-selection.js';

test('relationship selections keep composite identities and replace a single target without mutating the record draft',()=>{
  const a={objectTypeId:'object-a',recordId:'same-record-id',keyword:'A'} as RelatedRecord;
  const b={objectTypeId:'object-b',recordId:'same-record-id',keyword:'B'} as RelatedRecord;
  const baseline=[a];
  const multiple=toggleRelatedSelection(baseline,b,false);
  assert.equal(multiple.length,2);assert.deepEqual(baseline,[a]);assert.equal(sameRelatedSelection(multiple,[b,a]),true);
  assert.deepEqual(toggleRelatedSelection(multiple,a,false),[b]);assert.deepEqual(toggleRelatedSelection(baseline,b,true),[b]);
  assert.equal(sameRelatedSelection(baseline,[{...a,keyword:'Renamed'}]),true);assert.equal(sameRelatedSelection(baseline,[b]),false);assert.equal(sameRelatedSelection([a,b],[a,a]),false);
});
test('picker object choices reflect directed endpoints, undirected orientation and unrestricted definitions',()=>{
  const type={directed:true,allowAll:false,pairs:[{leftObjectTypeId:'a',rightObjectTypeId:'b'}]} as RelationshipType;
  assert.equal(eligibleTargetObject(type,'a','left','b'),true);assert.equal(eligibleTargetObject(type,'b','right','a'),true);
  assert.equal(eligibleTargetObject(type,'a','left','c'),false);assert.equal(eligibleTargetObject(type,'b','left','a'),false);
  assert.equal(eligibleTargetObject({...type,directed:false},'b','left','a'),true);
  assert.equal(eligibleTargetObject({...type,allowAll:true},'a','left','c'),true);
});

test('relationship object columns follow allowed endpoints and explicit form preferences',async()=>{
 const {relationshipShowsObjectColumn}=await import('../src/lib/relationship-selection.js');
 const field=(target:string)=>({definition:{allowAll:false,directed:true,pairs:[{leftObjectTypeId:'source',rightObjectTypeId:target}]},side:'left',targets:[]}) as any;
 assert.equal(relationshipShowsObjectColumn([field('contacts')],'source'),false,'empty fixed-target lists already hide redundant columns');
 assert.equal(relationshipShowsObjectColumn([field('contacts'),field('devices')],'source'),true,'mixed lists retain object context before records are selected');
 assert.equal(relationshipShowsObjectColumn([field('contacts')],'source','show'),true);
 assert.equal(relationshipShowsObjectColumn([field('contacts'),field('devices')],'source','hide'),false);
 assert.equal(relationshipShowsObjectColumn([{...field('contacts'),definition:{...field('contacts').definition,allowAll:true}}],'source'),true);
});
