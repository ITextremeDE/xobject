import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contactOverviewLayout} from '../src/lib/contact-overview';
import type {FieldDefinition,FormLayout} from '@xobject/contracts';

test('Contact overview omits empty/unreadable values without omitting zero or false or changing the editor layout',()=>{
 const fields=[{id:'name',technicalName:'name'},{id:'empty',technicalName:'empty'},{id:'zero',technicalName:'zero'},{id:'false',technicalName:'false'},{id:'private',technicalName:'private'},{id:'owners',technicalName:'access_principals'}] as FieldDefinition[];
 const layout:FormLayout={groups:[{id:'name',labels:{en:'Name'},fields:[{fieldId:'name',width:'half'},{fieldId:'empty',width:'half'},{fieldId:'private',width:'half'}]},{id:'other',labels:{en:'Other'},fields:[{fieldId:'zero',width:'half'},{fieldId:'false',width:'half'},{fieldId:'owners',width:'full'}]},{id:'empty',labels:{en:'Empty'},fields:[{fieldId:'empty',width:'full'}]}]};
 const result=contactOverviewLayout(layout,fields,{name:'Taylor',empty:[],zero:'0',false:false,access_principals:[]},[]);
 assert.deepEqual(result.groups.map(group=>group.fields.map(field=>'fieldId'in field?field.fieldId:'')),[['name'],['zero','false','owners']]);
 assert.equal(layout.groups.length,3);assert.equal(layout.groups[0].fields.length,3);
});
