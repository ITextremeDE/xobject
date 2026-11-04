import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRecordSecurity,resolveRecordAccess,membershipRights,type Membership,type ForeignRule,type Ownership} from '@xobject/contracts';
const own=(id:string,level:Ownership['level']='full'):Ownership=>({kind:'user',id,level});
const group=(id:string,level:Ownership['level']='full'):Ownership=>({kind:'group',id,level});
const member=(id:string,groupId:string,level:Membership['level']='full',kind:Membership['kind']='user'):Membership=>({id,groupId,level,kind});
const foreign=(from:string,to:string,level:ForeignRule['level']='edit',confidential=false,requesterKind:'user'|'group'='user',ownerKind:'user'|'group'='user'):ForeignRule=>({id:from+to,requester:{kind:requesterKind,id:from},owner:{kind:ownerKind,id:to},level,confidential,objects:{}});
test('direct ownership precedes higher group ownership and foreign access',()=>{
 const security=defaultRecordSecurity([own('Hans','read'),group('Sales')]);
 const rule=resolveRecordAccess('Hans','obj',security,[member('Hans','Sales')],[foreign('Hans','Sales','full',true,'user','group')]);assert.equal(rule.level,'read');assert.equal(rule.source,'ownership');
});
test('graded nested memberships take the weakest edge and independent paths the strongest',()=>{
 const memberships=[member('Hans','Team','read'),member('Team','Sales','full','group')];assert.equal(membershipRights('Hans',memberships).get('Sales'),2);
 assert.equal(resolveRecordAccess('Hans','obj',defaultRecordSecurity([group('Sales')]),memberships,[]).level,'read');assert.deepEqual(resolveRecordAccess('Hans','obj',defaultRecordSecurity([group('Sales')]),memberships,[]).path,['user:Hans','group:Team','group:Sales']);
 memberships.push(member('Hans','Sales','edit'));assert.equal(resolveRecordAccess('Hans','obj',defaultRecordSecurity([group('Sales')]),memberships,[]).level,'edit');
});
test('Management foreign access to Sales reaches Hans directly owned data without assigning Martin',()=>{
 const s=defaultRecordSecurity([own('Hans')]),m=[member('Martin','Management'),member('Hans','Sales')],r=[foreign('Management','Sales','edit',false,'group','group')];
 const access=resolveRecordAccess('Martin','obj',s,m,r);assert.equal(access.level,'edit');assert.equal(access.source,'foreign');assert.deepEqual(s.owners,[own('Hans')]);
 assert.equal(resolveRecordAccess('Martin','obj',s,m,r,false).level,'none');
});
test('membership alone never grants coworker access; an explicit self-rule does',()=>{
 const m=[member('Hans','Sales'),member('Clara','Sales')],s=defaultRecordSecurity([own('Clara')]);
 assert.equal(resolveRecordAccess('Hans','obj',s,m,[]).level,'none');assert.equal(resolveRecordAccess('Hans','obj',s,m,[foreign('Sales','Sales','read',false,'group','group')]).level,'read');
});
test('transitive foreign access is capped, cycles terminate, explicit object None removes a path',()=>{
 const s=defaultRecordSecurity([own('D')]),rules=[foreign('E','A','full'),foreign('A','D','read'),foreign('A','E','full')];assert.equal(resolveRecordAccess('E','obj',s,[],rules).level,'read');
 rules[1].objects.obj={level:'none'};assert.equal(resolveRecordAccess('E','obj',s,[],rules).level,'none');
});
test('Personal blocks foreign access, Confidential requires the capability on every path',()=>{
 const s=defaultRecordSecurity([own('D')]);s.privacy='personal';assert.equal(resolveRecordAccess('E','obj',s,[],[foreign('E','D','full',true)]).level,'none');
 s.privacy='confidential';assert.equal(resolveRecordAccess('E','obj',s,[],[foreign('E','D','full')]).level,'none');assert.equal(resolveRecordAccess('E','obj',s,[],[foreign('E','D','edit',true)]).level,'edit');
 s.foreignMax='read';assert.equal(resolveRecordAccess('E','obj',s,[],[foreign('E','D','full',true)]).level,'read');
});
test('inactive ownership is not public and public fallback does not override explicit ownership',()=>{
 const s=defaultRecordSecurity([group('Inactive')]);assert.equal(resolveRecordAccess('E','obj',s,[],[]).level,'none');s.publicLevel='full';s.owners.push(own('E','read'));assert.equal(resolveRecordAccess('E','obj',s,[],[]).level,'read');assert.equal(resolveRecordAccess('Other','obj',s,[],[]).source,'public');
});
test('intermediate direct ownership restricts paths forwarded through its group',()=>{
 const s=defaultRecordSecurity([group('Sales'),own('A','read')]),m=[member('A','Sales')];assert.equal(resolveRecordAccess('E','obj',s,m,[foreign('E','A','full')]).level,'read');
});
