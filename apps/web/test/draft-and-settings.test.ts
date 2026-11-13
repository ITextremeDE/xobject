import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftPairReducer} from '../src/lib/use-draft-pair';
import {settingsSection,settingsSections} from '../src/lib/settings-route';
import {removeRelationshipTarget,removedRelationshipTargets} from '../src/lib/relationship-selection';
import type {RelationshipField,RelatedRecord} from '@xobject/contracts';

test('draft transitions keep the baseline and atomically adopt a reviewed snapshot',()=>{
 const original={value:{name:'Before'},baseline:{name:'Before'}};
 const edited=draftPairReducer(original,{kind:'value',value:old=>({...old,name:'After'})});
 assert.deepEqual(edited.baseline,original.baseline);assert.equal(original.value.name,'Before');
 assert.equal(draftPairReducer(edited,{kind:'value',value:edited.value}),edited);
 const reviewed=draftPairReducer(edited,{kind:'adopt',value:{name:'Reviewed'}});
 assert.deepEqual(reviewed.value,reviewed.baseline);assert.equal(reviewed.value.name,'Reviewed');
});
test('settings links accept known sections and retain Administrator guards',()=>{
 for(const section of settingsSections){assert.equal(settingsSection(section,true),section);assert.equal(settingsSection(section,false),section.startsWith('system')?'profile':section);}
 assert.equal(settingsSection(null,true),'profile');assert.equal(settingsSection('unknown',true),'profile');
});
test('removing a projected edge stages one sparse removal and leaves unloaded targets alone',()=>{
 const target={objectTypeId:'object',recordId:'record',edgeId:'edge'} as RelatedRecord;
 const field={paged:true,total:500,targets:[]} as unknown as RelationshipField;
 const next=removeRelationshipTarget(field,target);
 assert.deepEqual(removedRelationshipTargets(next),[{objectTypeId:'object',recordId:'record'}]);assert.equal(next.total,500);assert.deepEqual(field.targets,[]);
 assert.equal(removedRelationshipTargets(removeRelationshipTarget(next,target)).length,1);
 const pending={objectTypeId:'object',recordId:'new'} as RelatedRecord;
 assert.deepEqual(removedRelationshipTargets(removeRelationshipTarget({...field,targets:[pending]},pending)),[]);
});
