import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FormLayout} from '@xobject/contracts';
import {recordDisplayLayout} from '../src/lib/record-form-layout';
import {contactExtensionDisplayLayout} from '../src/lib/contact-overview';

test('record fallback separates additional fields from relationships without losing or rewriting designer entries',()=>{
 const layout:FormLayout={groups:[{id:'authored',labels:{en:'Custom name'},width:'half',fields:[{fieldId:'placed',width:'half'}]}],unassigned:[{fieldId:'extra',width:'half'},{relationshipTypeId:'family',side:'right',width:'full',visible:true},{primary:true,width:'full',visible:false}]};
 const saved=structuredClone(layout),result=recordDisplayLayout(layout);
 assert.deepEqual(layout,saved);
 assert.deepEqual(result.groups[0],layout.groups[0]);
 assert.deepEqual(result.groups.slice(1).map(g=>g.labels.de),['Weitere Felder','Verknüpfungen']);
 assert.deepEqual(result.groups.slice(1).flatMap(g=>g.fields),layout.unassigned);
 assert.deepEqual(result.unassigned,[]);
 assert.deepEqual(recordDisplayLayout({groups:[]}).groups,[]);
});

test('Contact extensions place authored fields before combined lists and other links independently of translated names',()=>{
 const layout:FormLayout={groups:[{id:'combined',labels:{de:'Beliebiger Name'},relationshipList:true,fields:[{relationshipTypeId:'r',side:'left',width:'full'}]},{id:'other',labels:{en:'Links'},fields:[{primary:true,width:'full'}]},{id:'source',labels:{de:'Eigene Quelle'},width:'full',fields:[{fieldId:'f',width:'half'}]}]};
 const original=structuredClone(layout),display=contactExtensionDisplayLayout(layout);
 assert.deepEqual(display.groups.map(g=>g.id),['source','combined','other']);
 assert.deepEqual(display.groups.find(g=>g.id==='source'),layout.groups[2]);
 assert.deepEqual(layout,original);
});
