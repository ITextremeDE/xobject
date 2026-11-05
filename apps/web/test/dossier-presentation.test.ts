import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DossierEntry} from '@xobject/contracts';
import {dossierRows,sortDossierRows} from '../src/lib/dossier-presentation.js';

test('dossier retains edge and record identities, localized retained choices and sorts all rows before paging',()=>{
  const entries=[1,2,3,4,5,6,7,8,9,10,11].map(n=>({id:`edge-${n}`,definition:{labels:{de:'Hauptzuordnung',en:'Primary'}},record:{iconKey:'task',recordId:`record-${n}`,objectTypeId:'object-id',objectTechnicalName:'tasks',objectLabels:{de:'Aufgaben',en:'Tasks'},keyword:`Task ${n}`,type:'type-id',status:null,category:['missing-category'],classificationOptions:[{id:'type-id',kind:'type',labels:{de:'Alt',en:'Old'},active:false}]}})) as DossierEntry[];
  const rows=dossierRows(entries,'de');
  assert.equal(rows[0].iconKey,'task');assert.equal(rows[0].id,'edge-1');assert.equal(rows[0].recordId,'record-1');assert.equal(rows[0].relationship,'Hauptzuordnung');assert.equal(rows[0].object,'Aufgaben');assert.equal(rows[0].type,'Alt');assert.equal(rows[0].status,'—');assert.equal(rows[0].category,'missing-category');
  assert.equal(dossierRows(entries,'en')[0].type,'Old');
  const sorted=sortDossierRows(rows,{by:'keyword',direction:'desc'},'de');
  assert.equal(sorted[0].keyword,'Task 11');assert.equal(sorted.slice(0,10).length,10);assert.equal(sorted[10].keyword,'Task 1');assert.equal(rows[0].keyword,'Task 1');
  const categorized=structuredClone(entries[0]);categorized.record.category=['category-b','category-a'];
  categorized.record.classificationOptions.push({id:'category-a',kind:'category',typeId:null,labels:{en:'A'},active:true},{id:'category-b',kind:'category',typeId:null,labels:{en:'B'},active:true});
  assert.equal(dossierRows([categorized],'en')[0].category,'A, B');
  const duplicate={...entries[0],id:'other-edge'};assert.equal(dossierRows([entries[0],duplicate],'de').length,2);
});
