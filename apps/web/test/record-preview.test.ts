import test from 'node:test';
import assert from 'node:assert/strict';
import type {DataRecord,ObjectDefinition,FieldDefinition} from '@xobject/contracts';
import {recordPreviewLayout} from '../src/lib/record-preview';

test('recycle previews preserve authored order/width, unassigned values and inactive separation without exposing restricted fields',()=>{
 const field=(id:string,state='active',extra:Partial<FieldDefinition>={}):FieldDefinition=>({id,technicalName:id,kind:'text',labels:{en:id},label:id,version:1,required:false,config:{},state:state as 'active',...extra});
 const fields=[field('first'),field('second'),field('new'),field('hidden'),field('archived','inactive'),field('deleted','deleted'),field('conditional','active',{applicability:{fieldId:'controller',optionIds:['yes']}}),field('controller')];
 const definition={fields,formLayouts:{default:{groups:[{id:'group',labels:{en:'Custom section',de:'Eigener Bereich'},fields:[{fieldId:'second',width:'full'},{fieldId:'first',width:'half'},{fieldId:'hidden',width:'half'},{fieldId:'archived',width:'full'},{fieldId:'conditional',width:'half'}]}]}}} as ObjectDefinition;
 const record={first:'A',second:'B',new:'C',hidden:'Private',archived:'Retained',deleted:'Deleted',conditional:'Condition value',controller:'no',fieldAccess:{hidden:{read:false,edit:false}}} as unknown as DataRecord;
 const before=structuredClone({definition,record}),preview=recordPreviewLayout(definition,record,'Unassigned');
 assert.deepEqual(preview.layout.groups[0].fields,[{fieldId:'second',width:'full'},{fieldId:'first',width:'half'}]);
 assert.equal(preview.layout.groups[0].labels.en,'Custom section');
 assert.deepEqual(preview.inactive.map(field=>field.id),['archived']);
 assert.deepEqual(preview.layout.groups[1].fields.map(entry=>'fieldId' in entry?entry.fieldId:''),['new','controller']);
 assert.ok(!preview.fields.some(field=>['hidden','deleted'].includes(field.id)));
 const hiddenController={...record,applicableFieldIds:['conditional']};delete hiddenController.controller;
 assert.ok(recordPreviewLayout(definition,hiddenController,'Unassigned').layout.groups[0].fields.some(entry=>'fieldId' in entry&&entry.fieldId==='conditional'));
 assert.deepEqual({definition,record},before);
});
