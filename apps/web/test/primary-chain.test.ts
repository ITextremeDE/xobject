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
