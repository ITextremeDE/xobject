import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formLayoutSchema,resolveFormLayout,formEntryKey,formLayoutEntries} from '@xobject/contracts';
const a={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',technicalName:'keyword',kind:'text'};
const b={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',technicalName:'notes',kind:'multiline'};
const c={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',technicalName:'serial',kind:'text'};
test('module views keep explicit selections while standard forms append new fields without duplicating or mutating views',()=>{
 const saved={groups:[{id:'main',labels:{en:'Main'},fields:[{fieldId:b.id,width:'half' as const}]}]};
 assert.deepEqual(resolveFormLayout(saved,[a,b,c],false),saved);
 const standard=resolveFormLayout(saved,[a,b,c],true);assert.deepEqual(standard.groups[0].fields.map(formEntryKey),[b.id]);
 assert.deepEqual(standard.unassigned?.map(formEntryKey),[a.id,c.id]);
 assert.equal(saved.groups[0].fields.length,1);assert.equal(standard.groups[0].fields[0].width,'half');
 assert.deepEqual(resolveFormLayout(saved,[a,c],false).groups[0].fields,[],'inactive/deleted fields are omitted without changing stored configuration');
});
test('layout input rejects duplicate identities and unsupported width values',()=>{
 const group={id:'main',labels:{en:'Main'},fields:[{fieldId:a.id,width:'full'}]};
 assert.equal(formLayoutSchema.safeParse({groups:[group,group]}).success,false);
 assert.equal(formLayoutSchema.safeParse({groups:[group,{...group,id:'other'}]}).success,false);
 assert.equal(formLayoutSchema.safeParse({groups:[{...group,fields:[{fieldId:a.id,width:'free_css'}]}]}).success,false);
});

test('relationship layout keeps defaults, coerces changed cardinality/requiredness and distinguishes directed self sides',async()=>{
 const {formLayoutElements,formRelationshipFields}=await import('@xobject/contracts');
 const relation:any={id:c.id,kind:'custom',rulesState:'active',active:true,directed:true,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:a.id}],leftLabels:{en:'Left'},rightLabels:{en:'Right'},leftMin:0,rightMin:0,leftMax:1,rightMax:null};
 const sides=formRelationshipFields([relation],a.id);assert.deepEqual(sides.map(field=>field.side),['left','right']);
 const entries=formLayoutElements([],sides);assert.notEqual(entries[0].key,entries[1].key);
 const hidden:any={relationshipTypeId:relation.id,side:'left',width:'half',visible:false,expanded:'closed'};
 const layout={groups:[{id:'mixed',labels:{en:'Mixed'},fields:[hidden]}]};
 relation.leftMin=1;relation.leftMax=null;
 const resolved=resolveFormLayout(layout,[],true,formRelationshipFields([relation],a.id));
 assert.equal('visible' in resolved.groups[0].fields[0]&&resolved.groups[0].fields[0].visible,true);
 assert.equal(resolved.groups[0].fields[0].width,'full');assert.equal(hidden.visible,false,'stored configuration is not mutated');
 const retained=resolveFormLayout(layout,[],true,[],true);assert.deepEqual(retained.groups[0].fields,[hidden]);
 assert.equal(resolveFormLayout(layout,[],true,[]).groups[0].fields.length,0,'unavailable relationships do not render');
 const symmetric={...relation,directed:false};assert.equal(formRelationshipFields([symmetric],a.id).length,1);
 assert.equal(formRelationshipFields([{...relation,kind:'general'}],a.id).length,0);
});


test('new forms use an editable starter structure and group names never decide where later elements go',()=>{
 const initial=resolveFormLayout(undefined,[a,b]);assert.equal(initial.groups.length,2);assert.equal(initial.groups[0].labels.en,'General');assert.deepEqual(initial.groups[0].fields.map(formEntryKey),[a.id]);assert.equal(initial.groups[1].labels.en,'Notes');assert.deepEqual(initial.groups[1].fields.map(formEntryKey),[b.id]);
 const custom={groups:[{id:'business',labels:{en:'My own group'},fields:[{fieldId:b.id,width:'half' as const}]}]};
 const next=resolveFormLayout(custom,[a,b,c]);assert.equal(next.groups.length,1);assert.deepEqual(next.groups[0].fields,custom.groups[0].fields);assert.deepEqual(next.unassigned?.map(formEntryKey),[a.id,c.id]);
 const placed={...next,groups:[{...next.groups[0],fields:[...next.groups[0].fields,next.unassigned![0]]}],unassigned:next.unassigned!.slice(1)};
 assert.deepEqual(resolveFormLayout(placed,[a,b,c]),placed,'assigned elements do not reappear in the unassigned collection');
 assert.equal(new Set(formLayoutEntries(placed).map(formEntryKey)).size,3);
 assert.equal(formLayoutSchema.safeParse({...placed,unassigned:[placed.groups[0].fields[0]]}).success,false,'duplicates are rejected across groups and unassigned elements');
});


test('all groups may be removed without losing or hiding form elements',()=>{
 const layout=resolveFormLayout({groups:[]},[a,b]);assert.deepEqual(layout.groups,[]);assert.deepEqual(layout.unassigned?.map(formEntryKey),[a.id,b.id]);assert.equal(formLayoutSchema.safeParse(layout).success,true);
});

test('adding a group preserves unassigned field and relationship drafts, including hidden/order/width settings',async()=>{
 const {appendFormGroup}=await import('../src/lib/form-layout-editing.js');
 const relation:any={relationshipTypeId:c.id,side:'left',width:'half',visible:false,expanded:'closed'};
 const initial:any={groups:[{id:'existing',labels:{en:'Existing'},fields:[{fieldId:b.id,width:'full'}]}],unassigned:[relation,{fieldId:a.id,width:'half'}]};
 const snapshot=structuredClone(initial);
 const next=appendFormGroup(initial,{id:'new',labels:{en:'New'},fields:[]});
 assert.deepEqual(initial,snapshot,'draft operations must not mutate the previous layout');
 assert.deepEqual(next.unassigned,snapshot.unassigned);
 assert.deepEqual(formLayoutEntries(next),formLayoutEntries(initial));
 assert.deepEqual(resolveFormLayout(next,[a,b],true,[],true).unassigned,snapshot.unassigned,'save/read normalization retains unassigned settings');
});

test('Access principals uses its existing field identity for placement, width and unassigned behavior',async()=>{
 const {formLayoutElements,defaultFormWidth}=await import('@xobject/contracts');
 const security={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',technicalName:'access_principals',kind:'reference',state:'active'};
 assert.equal(defaultFormWidth(security),'full');
 const element=formLayoutElements([security])[0];assert.equal(element.key,security.id);assert.equal(element.single,true);
 const placed={groups:[{id:'security',labels:{en:'Security',de:'Zugriff'},fields:[{fieldId:security.id,width:'half' as const},{fieldId:a.id,width:'half' as const}]}]};
 assert.deepEqual(resolveFormLayout(placed,[a,security]),placed);
 const removed=resolveFormLayout({groups:[]},[a,security]);assert.ok(removed.unassigned?.some(entry=>formEntryKey(entry)===security.id));
 const disabled=resolveFormLayout(placed,[a],true,[],true);assert.ok(disabled.groups[0].fields.some(entry=>formEntryKey(entry)===security.id),'stored placement can survive temporary unavailability');
 assert.equal(resolveFormLayout(placed,[a]).groups[0].fields.some(entry=>formEntryKey(entry)===security.id),false,'inactive security field does not render');
});


test('starter layout separates classification and relationships while keeping notes last without altering authored layouts',()=>{
 const fields=[b,{id:'type',technicalName:'type',kind:'type'},{id:'category',technicalName:'category',kind:'category'},{id:'status',technicalName:'status',kind:'status'},c,a];
 const definition:any={id:'relation',kind:'custom',active:true,leftMin:0,rightMin:0,leftMax:1,rightMax:null};
 const primary={...definition,id:'primary',kind:'primary'};
 const result=resolveFormLayout(undefined,fields,true,[{definition,side:'left'},{definition,side:'right'},{definition:primary,side:'right'}]);
 assert.deepEqual(result.groups.map(g=>g.labels.en),['General','Primary association','Classification','Relationships','Notes']);
 assert.deepEqual(result.groups[0].fields.map(formEntryKey),[a.id,c.id,'relationship:relation:left']);
 assert.deepEqual(result.groups[1].fields.map(formEntryKey),['primary_chain']);
 assert.deepEqual(result.groups[2].fields.map(formEntryKey),['type','status','category']);assert.equal(result.groups[2].fields[2].width,'full');
 assert.deepEqual(result.groups[3].fields.map(formEntryKey),['relationship:relation:right']);assert.deepEqual(result.groups[4].fields.map(formEntryKey),[b.id]);
 const authored={groups:[{id:'classification',labels:{en:'My group'},fields:[{fieldId:b.id,width:'half' as const}]}]};
 assert.deepEqual(resolveFormLayout(authored,fields).groups,authored.groups);
});
