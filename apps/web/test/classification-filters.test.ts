import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyClassification} from '@xobject/contracts';
import {readClassificationFilters,classificationFilterQuery,normalizeClassificationFilters} from '../src/lib/classification-filters.js';
const config={...emptyClassification(),options:[
 {id:'a',kind:'type' as const,labels:{en:'A'},active:true,typeId:null},
 {id:'b',kind:'type' as const,labels:{en:'B'},active:true,typeId:null},
 {id:'sa',kind:'status' as const,labels:{en:'A status'},active:true,typeId:'a'},
 {id:'sb',kind:'status' as const,labels:{en:'B status'},active:false,typeId:'b'},
 {id:'su',kind:'status' as const,labels:{en:'Untyped'},active:true,typeId:null},
 {id:'parent',kind:'category' as const,labels:{en:'Parent'},active:true,typeId:null},
 {id:'leaf',kind:'category' as const,labels:{en:'Leaf'},parentId:'parent',active:true,typeId:null},
]};
test('classification list filters round-trip in URLs, retain inactive values and scope statuses without expanding tree selections',()=>{
 const initial=readClassificationFilters(new URLSearchParams('type=a,empty&status=sa,sb,su&category=leaf'),config,['type','status','category']);
 assert.deepEqual(initial,{type:['a',null],status:['sa','su'],category:['leaf']});
 assert.equal(classificationFilterQuery(initial).category,'leaf','a leaf filter must not include parents and match siblings');
 assert.deepEqual(readClassificationFilters(new URLSearchParams('status=sb'),config,['status']),{status:['sb']});
 assert.deepEqual(normalizeClassificationFilters({...initial,type:['b']},config,['type','status','category']),{type:['b'],category:['leaf']});
});
test('unknown, duplicate, removed and unreadable classification URL filters are cleared while unrelated list context survives',()=>{
 const params=new URLSearchParams('q=example&page=2&type=unknown,a,a&status=sb&category=empty,unknown');
 const normalized=readClassificationFilters(params,config,['type','status']);
 assert.deepEqual(normalized,{type:['a']});
 const changes=classificationFilterQuery(normalized);assert.equal(changes.status,null);assert.equal(changes.category,null);
 assert.equal(params.get('q'),'example');assert.equal(params.get('page'),'2');
 assert.deepEqual(readClassificationFilters(new URLSearchParams('type=a&status=sb'),config,['status']),{status:['sb']});
});
