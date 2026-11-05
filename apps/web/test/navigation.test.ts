import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationChildren,moveNavigationNode,visibleNavigationNodes,navigationHref,defaultNavigationLayout,navigationLayoutSchema,type NavigationNode} from '@xobject/contracts';
const node=(id:string,parentId:string|null,kind:NavigationNode['kind']='object'):NavigationNode=>({id,parentId,kind,labels:{en:id},available:true,permitted:true});
const nodes=[node('module:contacts',null,'section'),node('contacts','module:contacts'),node('organizations','contacts','contact_kind'),node('persons','contacts','contact_kind'),node('individuals','contacts','contact_kind'),node('lists','module:contacts'),node('module:projects',null,'section'),node('projects','module:projects'),node('contacts-again','module:projects'),node('custom',null,'section')];
test('navigation defaults retain module importance, duplicates and all three hierarchy levels',()=>{
 const layout=defaultNavigationLayout();assert.equal(layout.resources,true);
 assert.deepEqual(navigationChildren(nodes,null,layout).map(n=>n.id),['module:contacts','module:projects','custom']);
 assert.deepEqual(navigationChildren(nodes,'contacts',layout).map(n=>n.id),['organizations','persons','individuals']);
 assert.equal(navigationLayoutSchema.safeParse({...layout,order:['contacts','contacts']}).success,false);
});
test('drag and keyboard moves reorder siblings without changing hierarchy or mutating the source',()=>{
 const initial=defaultNavigationLayout(),moved=moveNavigationNode(nodes,initial,'module:projects','module:contacts');
 assert.deepEqual(navigationChildren(nodes,null,moved).map(n=>n.id),['module:projects','module:contacts','custom']);
 const children=moveNavigationNode(nodes,moved,'individuals','organizations');assert.deepEqual(navigationChildren(nodes,'contacts',children).map(n=>n.id),['individuals','organizations','persons']);
 assert.equal(moveNavigationNode(nodes,children,'persons','projects'),children);assert.deepEqual(initial,defaultNavigationLayout());
 assert.deepEqual(navigationChildren([...nodes,node('new','contacts')],'contacts',children).map(n=>n.id),['individuals','organizations','persons','new']);
});
test('hidden/inactive/unreadable parents remove complete branches without modifying saved preferences',()=>{
 for(const changes of [{hidden:['module:contacts']},{hidden:['contacts']}]){const layout={...defaultNavigationLayout(),...changes},visible=visibleNavigationNodes(nodes,layout);assert.ok(!visible.some(n=>n.id==='organizations'));assert.ok(visible.some(n=>n.id==='contacts-again'));assert.equal(layout.hidden.length,1);}
 const disabled=nodes.map(n=>n.id==='module:contacts'?{...n,available:false}:n);assert.ok(!visibleNavigationNodes(disabled,defaultNavigationLayout()).some(n=>n.id==='organizations'));
 const unreadable=nodes.map(n=>n.id==='contacts'?{...n,permitted:false}:n);assert.ok(!visibleNavigationNodes(unreadable,defaultNavigationLayout()).some(n=>n.id==='organizations'));
});
test('filtered navigation URLs carry stable entry identity and Contact-kind filter through list/record navigation',()=>{
 const entry={...node('module:contacts:object:kind','contacts','contact_kind'),technicalName:'contacts',contactKindId:'kind-id'};
 const url=navigationHref(entry,'itx'),parsed=new URL(url,'https://example.test');assert.equal(parsed.pathname,'/w/itx/objects/contacts');assert.equal(parsed.searchParams.get('nav'),entry.id);assert.equal(parsed.searchParams.get('kind'),'kind-id');
});

test('duplicate destinations retain one selected entry and direct URLs respect the personal section order',async()=>{
 const {activeNavigationNode}=await import('@xobject/contracts');
 const copies=nodes.map(n=>['contacts','contacts-again','organizations'].includes(n.id)?{...n,objectTypeId:'shared',...(n.id==='organizations'?{contactKindId:'org'}:{})}:n);
 copies.push({...node('org-again','contacts-again','contact_kind'),objectTypeId:'shared',contactKindId:'org'});
 const layout={...defaultNavigationLayout(),order:['module:projects','module:contacts']};
 assert.equal(activeNavigationNode(copies,layout,'shared',null,null)?.id,'contacts-again');
 assert.equal(activeNavigationNode(copies,layout,'shared','contacts',null)?.id,'contacts');
 assert.equal(activeNavigationNode(copies,layout,'shared',null,'org')?.id,'org-again');
 assert.equal(activeNavigationNode(copies,{...layout,hidden:['module:contacts']},'shared','organizations','org')?.id,'org-again');
});

test('navigation journal titles distinguish shared and personal changes',async()=>{
 const {journalPropertyLabel}=await import('../src/lib/journal-presentation');
 const t=((key:string)=>key) as any;
 assert.equal(journalPropertyLabel('navigation.workspace.order',t),'navigationWorkspace · navigationOrder');
 assert.equal(journalPropertyLabel('navigation.personal.resources',t),'navigationPersonal · navigationResources');
});
