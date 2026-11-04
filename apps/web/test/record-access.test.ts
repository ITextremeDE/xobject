import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRecordSecurity} from '@xobject/contracts';
import {toggleRecordOwner,sameRecordSecurity,validRecordSecurityDraft} from '../src/lib/record-access.ts';
test('quick selection preserves graded owners and leaves public widening explicit',()=>{
 const original=defaultRecordSecurity([{kind:'user',id:'jane',level:'read'}]);
 const added=toggleRecordOwner(original,{kind:'group',id:'team'});
 assert.deepEqual(added.owners,[...original.owners,{kind:'group',id:'team',level:'full'}]);
 const empty=toggleRecordOwner(original,{kind:'user',id:'jane'});
 assert.equal(empty.publicLevel,null);assert.equal(validRecordSecurityDraft(original,empty,false),false);
 const publicDraft={...empty,publicLevel:'full' as const};
 assert.equal(validRecordSecurityDraft(original,publicDraft,false),false);assert.equal(validRecordSecurityDraft(original,publicDraft,true),true);
 assert.equal(validRecordSecurityDraft(original,{...publicDraft,privacy:'personal'},true),false);
 assert.ok(sameRecordSecurity(added,{...added,owners:[...added.owners].reverse()}));
 assert.ok(!sameRecordSecurity(original,{...original,foreignMax:'read'}));
});
