import {test} from 'node:test';
import assert from 'node:assert/strict';
import {primaryPairAllowed,primaryRolesForObject,recordReferenceSchema} from '@xobject/contracts';
test('Primary role order permits skipped levels and arbitrary children while rejecting reverse, repeated and unknown parent levels',()=>{
  const chain={contact:'00000000-0000-4000-8000-00000000000a',project:'00000000-0000-4000-8000-00000000000b',case:'00000000-0000-4000-8000-00000000000c'},other='00000000-0000-4000-8000-00000000000d';
  assert.deepEqual(primaryRolesForObject(chain,chain.contact),[]);
  assert.deepEqual(primaryRolesForObject(chain,chain.project),['contact']);
  assert.deepEqual(primaryRolesForObject(chain,chain.case),['contact','project']);
  assert.deepEqual(primaryRolesForObject(chain,other),['contact','project','case']);
  for(const parent of Object.values(chain))assert.ok(primaryPairAllowed(chain,parent,other));
  assert.ok(primaryPairAllowed(chain,chain.contact,chain.case));
  assert.ok(primaryPairAllowed(chain,chain.project.toUpperCase(),chain.case.toUpperCase()));
  assert.equal(primaryPairAllowed(chain,chain.case,chain.project),false);
  assert.equal(primaryPairAllowed(chain,chain.project,chain.project),false);
  assert.equal(primaryPairAllowed(chain,other,chain.case),false);
  assert.deepEqual(recordReferenceSchema.parse({objectTypeId:chain.contact.toUpperCase(),recordId:chain.project.toUpperCase()}),{objectTypeId:chain.contact,recordId:chain.project});
});

import {primaryPreviousRecord} from '../src/lib/primary-chain-selection';
test('clearing a Primary level falls back to the nearest visible earlier level without retaining descendants',()=>{
 const make=(role:'contact'|'project'|'case',record:boolean=true)=>({role,objectTypeId:role,record:record?{objectTypeId:role,recordId:role,keyword:role,objectTechnicalName:role,objectLabels:{en:role},state:'active' as const}:null,inherited:true});
 const levels=[make('contact'),make('project'),make('case')];
 assert.equal(primaryPreviousRecord(levels,'contact'),null);
 assert.equal(primaryPreviousRecord(levels,'project')?.recordId,'contact');
 assert.equal(primaryPreviousRecord(levels,'case')?.recordId,'project');
 assert.equal(primaryPreviousRecord([make('contact'),make('project',false),make('case')],'case')?.recordId,'contact');
 assert.equal(primaryPreviousRecord([make('contact',false),make('project',false),make('case')],'case'),null);
});

import {primaryRequirementsSatisfied,primaryRequirementsSchema,formLayoutElements,formRelationshipFields} from '@xobject/contracts';
test('Primary requiredness distinguishes any parent from specific ancestors and keeps required form elements visible',()=>{
 assert.ok(primaryRequirementsSatisfied({associationRequired:false,requiredLevels:[]},[]));
 assert.equal(primaryRequirementsSatisfied({associationRequired:true,requiredLevels:[]},[]),false);
 assert.ok(primaryRequirementsSatisfied({associationRequired:true,requiredLevels:[]},['contact']));
 assert.equal(primaryRequirementsSatisfied({associationRequired:false,requiredLevels:['project']},['contact','case']),false);
 assert.ok(primaryRequirementsSatisfied({associationRequired:false,requiredLevels:['contact','case']},['contact','project','case']));
 assert.equal(primaryRequirementsSchema.safeParse({associationRequired:false,requiredLevels:['project','project']}).success,false);
 const definition={id:'primary',kind:'primary',rulesState:'active',active:true,allowAll:true,directed:true,pairs:[],leftMin:0,leftMax:null,rightMin:0,rightMax:1} as any;
 const elements=formLayoutElements([],formRelationshipFields([definition],'child',null,{associationRequired:false,requiredLevels:['project']}));
 assert.equal(elements[0].required,true);
});

test('Primary requirement history uses translated property and level labels',async()=>{
 const {journalPrimaryRequirementsValue,journalPropertyLabel}=await import('../src/lib/journal-presentation');const t=((key:string)=>key) as any;
 assert.equal(journalPropertyLabel('primaryRequirements.requiredLevels',t),'primaryChainTitle · primaryRequiredLevels');
 assert.equal(journalPrimaryRequirementsValue({entity_kind:'object_type',field_key:'primaryRequirements.requiredLevels'},['contact','project'],t),'primaryRole_contact, primaryRole_project');
});
