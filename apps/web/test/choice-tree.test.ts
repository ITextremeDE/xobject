import {test} from 'node:test';
import assert from 'node:assert/strict';
import {choiceDisplayOrder,choiceTreeError,closeChoiceSelection,toggleChoiceSelection,choiceDescendants,setChoiceActive,moveClassificationOption} from '@xobject/contracts';
const nodes=[{id:'root',active:true},{id:'branch',parentId:'root',active:true},{id:'leaf',parentId:'branch',active:true},{id:'other',parentId:'root',active:true}];
test('tree selection includes ancestors, supports independent branches and removes descendants with their parent',()=>{
 assert.deepEqual(closeChoiceSelection(nodes,['leaf']),['branch','leaf','root']);
 assert.deepEqual(toggleChoiceSelection(nodes,['branch','leaf','other','root'],'branch',false,true),['other','root']);
 assert.deepEqual(toggleChoiceSelection(nodes,['branch','leaf','other','root'],'root',false,true),[]);
 assert.deepEqual(toggleChoiceSelection(nodes,[],'root',true,true),['root']);
 assert.deepEqual(toggleChoiceSelection(nodes,['leaf'],'other',true,false),['leaf','other']);
 assert.deepEqual(choiceDescendants(nodes,'branch'),['leaf']);
});
test('hierarchies reject orphan/cyclic/inactive ancestry; activation/deactivation follows the hierarchy',()=>{
 assert.equal(choiceTreeError(nodes),null);
 assert.match(choiceTreeError([...nodes,{id:'orphan',parentId:'missing',active:true}])!,/Unknown/);
 assert.match(choiceTreeError(nodes.map(node=>node.id==='root'?{...node,parentId:'leaf'}:node))!,/cycle/);
 assert.match(choiceTreeError(nodes.map(node=>node.id==='root'?{...node,active:false}:node))!,/active ancestors/);
 assert.ok(setChoiceActive(nodes,'root',false,true).every(node=>!node.active));
 assert.ok(setChoiceActive(nodes.map(node=>({...node,active:false})),'leaf',true,true).filter(node=>node.id!=='other').every(node=>node.active));
});
test('choice ordering is limited to siblings',()=>{
 const options=nodes.map(node=>({...node,kind:'category' as const,labels:{en:node.id},typeId:null}));
 assert.equal(moveClassificationOption(options,'leaf','other'),options);
 assert.deepEqual(moveClassificationOption(options,'branch','other').map(option=>option.id),['root','other','leaf','branch']);
});

test('display follows configured sibling paths independently of canonical UUID order',()=>{
 assert.deepEqual(choiceDisplayOrder([nodes[2],nodes[0],nodes[1],nodes[3]],true).map(node=>node.id),['root','branch','leaf','other']);
 assert.deepEqual(choiceDisplayOrder([nodes[2],nodes[0]],false).map(node=>node.id),['leaf','root']);
});
