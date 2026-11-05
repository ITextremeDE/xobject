import type {RelatedRecord,RelationshipTreeChild} from '@xobject/contracts';
const identity=(record:RelatedRecord)=>`${record.objectTypeId}:${record.recordId}`;
/** Sequential, cancellable traversal of the same bounded Primary tree shown by the UI. */
export async function expandTree(record:RelatedRecord,nodeId:string,load:(record:RelatedRecord)=>Promise<RelationshipTreeChild[]>,open:(id:string)=>void,cancelled:()=>boolean,path:string[]=[],depth=0):Promise<void>{
 if(cancelled()||depth>=32||path.includes(identity(record)))return;
 const children=await load(record);
 if(cancelled())return;
 if(children.length)open(nodeId);
 for(const child of children){
  if(cancelled())return;
  if(child.hasChildren)await expandTree(child.record,`${nodeId}-${child.edgeId}`,load,open,cancelled,[...path,identity(record)],depth+1);
 }
}

/** Preserve immutable query-cache pages while loading every remaining page. */
export async function loadTreePages(initial:import('@xobject/contracts').RelationshipTreeBranch[],fetch:(offset:number)=>Promise<import('@xobject/contracts').RelationshipTreeBranch>,cache:(pages:import('@xobject/contracts').RelationshipTreeBranch[])=>void,cancelled:()=>boolean){
 let pages=[...initial];
 while(!cancelled()){
  const last=pages.at(-1),offset=last?last.offset+last.children.length:0;
  if(last&&offset>=last.total)break;
  const page=await fetch(offset);
  if(cancelled())return [];
  if(!page.children.length&&offset<page.total)throw new Error('Tree changed during expansion');
  pages=[...pages,page];cache(pages);
 }
 return pages.flatMap(page=>page.children);
}
