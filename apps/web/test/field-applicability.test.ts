import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldApplies,fieldApplicabilitySchema} from '@xobject/contracts';

test('applicability uses stable controller/option identities and rejects ambiguous rules',()=>{
  const fieldId='00000000-0000-4000-8000-000000000001',person='00000000-0000-4000-8000-000000000002',organization='00000000-0000-4000-8000-000000000003';
  const field={applicability:{fieldId,optionIds:[person]}};
  const fields=[{id:fieldId,technicalName:'renamed_controller'}];
  assert.equal(fieldApplies(field,fields,{renamed_controller:person}),true);
  assert.equal(fieldApplies(field,fields,{renamed_controller:organization}),false);
  assert.equal(fieldApplies(field,fields,{}),false);
  assert.equal(fieldApplies(field,[],{renamed_controller:person}),false);
  assert.equal(fieldApplies({applicability:null},fields,{}),true);
  assert.equal(fieldApplicabilitySchema.safeParse({fieldId,optionIds:[]}).success,false);
  assert.equal(fieldApplicabilitySchema.safeParse({fieldId,optionIds:[person,person]}).success,false);
});
