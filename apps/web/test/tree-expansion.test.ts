import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {RelatedRecord,RelationshipTreeChild} from '@xobject/contracts';
import {expandTree} from '../src/lib/tree-expansion.js';
const record=(id:string):RelatedRecord=>({objectTypeId:'object',recordId:id,keyword:id,objectTechnicalName:'objects',objectLabels:{en:'Objects'},state:'active'});
const child=(id:string,hasChildren=true):RelationshipTreeChild=>({edgeId:id,record:{...record(id),statusLabels:null},relationshipTypeId:'primary',kind:'primary',labels:{en:'Primary'},sideLabels:{en:'Children'},direction:'outgoing',hasChildren});
test('expand all follows each Primary branch sequentially and stops cyclic paths',async()=>{
 const loaded:string[]=[],opened:string[]=[];
 await expandTree(record('root'),'root-node',async r=>{loaded.push(r.recordId);return r.recordId==='root'?[child('case'),child('leaf',false)]:[child('root')];},id=>opened.push(id),()=>false);
 assert.deepEqual(loaded,['root','case']);assert.deepEqual(opened,['root-node','root-node-case']);
});
test('cancelling expansion ignores an outstanding response and requests no further branches',async()=>{
 let cancelled=false,calls=0;const opened:string[]=[];
 await expandTree(record('root'),'root-node',async()=>{calls++;cancelled=true;return [child('case')];},id=>opened.push(id),()=>cancelled);
 assert.equal(calls,1);assert.deepEqual(opened,[]);
});
test('expand all keeps the viewer depth boundary for unique descendant chains',async()=>{
 let calls=0;await expandTree(record('0'),'root',async r=>{calls++;return [child(String(Number(r.recordId)+1))];},()=>{},()=>false);
 assert.equal(calls,32);
});

test('expansion loads all pages without mutating cached page arrays',async()=>{
 const {loadTreePages}=await import('../src/lib/tree-expansion.js');
 const page=(offset:number,ids:string[])=>({record:{...record('root'),statusLabels:null},ancestors:[],ancestorsTruncated:false,children:ids.map(id=>child(id,false)),total:3,offset,limit:2});
 const first=page(0,['a','b']),initial=[first],offsets:number[]=[],snapshots:unknown[][]=[];
 const result=await loadTreePages(initial,async offset=>{offsets.push(offset);return page(offset,['c']);},pages=>snapshots.push(pages),()=>false);
 assert.deepEqual(offsets,[2]);assert.deepEqual(result.map(child=>child.record.recordId),['a','b','c']);assert.equal(initial.length,1);assert.notEqual(snapshots[0],initial);
});
