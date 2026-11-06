/** UUID-backed choice hierarchy shared by custom fields, Category and every transport. */
export type ChoiceNode={id:string;parentId?:string|null;active:boolean};
export function choiceAncestors(options:readonly ChoiceNode[],id:string):string[]{
 const nodes=new Map(options.map(option=>[option.id,option])),seen=new Set([id]),result:string[]=[];let parent=nodes.get(id)?.parentId;
 while(parent){if(seen.has(parent))throw new Error('Choice tree contains a cycle');const node=nodes.get(parent);if(!node)throw new Error('Unknown choice parent');seen.add(parent);result.push(parent);parent=node.parentId;}
 return result;
}
export function choiceDescendants(options:readonly ChoiceNode[],id:string){return options.filter(option=>choiceAncestors(options,option.id).includes(id)).map(option=>option.id);}
export function choiceTreeError(options:readonly ChoiceNode[]):string|null{
 if(new Set(options.map(option=>option.id)).size!==options.length)return 'Duplicate choice identities';
 try{for(const option of options){const ancestors=choiceAncestors(options,option.id);if(ancestors.length>20)return 'Choice tree exceeds 20 levels';if(option.active&&ancestors.some(id=>!options.find(parent=>parent.id===id)?.active))return 'Active choices need active ancestors';}}catch(error){return (error as Error).message;}return null;
}
export function closeChoiceSelection(options:readonly ChoiceNode[],selected:readonly string[]){
 const result=new Set(selected);for(const id of selected){if(!options.some(option=>option.id===id))throw new Error('Unknown choice value');for(const parent of choiceAncestors(options,id))result.add(parent);}return [...result].sort();
}
export function toggleChoiceSelection(options:readonly ChoiceNode[],selected:readonly string[],id:string,checked:boolean,tree:boolean){
 if(checked)return tree?closeChoiceSelection(options,[...new Set([...selected,id])]):[...new Set([...selected,id])].sort();
 const remove=new Set([id,...(tree?choiceDescendants(options,id):[])]);return selected.filter(value=>!remove.has(value)).sort();
}
export function setChoiceParent<T extends ChoiceNode>(options:readonly T[],id:string,parentId:string|null):T[]{return options.map(option=>option.id===id?{...option,parentId}:option);}
export function setChoiceActive<T extends ChoiceNode>(options:readonly T[],id:string,active:boolean,tree:boolean):T[]{
 const changed=new Set([id,...(tree?active?choiceAncestors(options,id):choiceDescendants(options,id):[])]);return options.map(option=>changed.has(option.id)?{...option,active}:option);
}
/** Dictionary/sibling order drives display; UUID sorting is only the storage canonical form. */
export function choiceDisplayOrder<T extends ChoiceNode>(options:readonly T[],tree:boolean):T[]{
 if(!tree)return [...options];const result:T[]=[],seen=new Set<string>();
 const visit=(parent:string|null)=>{for(const option of options.filter(option=>(option.parentId??null)===parent)){if(seen.has(option.id))continue;seen.add(option.id);result.push(option);visit(option.id);}};
 visit(null);return [...result,...options.filter(option=>!seen.has(option.id))];
}
