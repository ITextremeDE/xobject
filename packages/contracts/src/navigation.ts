import {z} from 'zod';
const nodeId=z.string().min(1).max(250);
const unique=(ids:string[])=>new Set(ids).size===ids.length;
export const navigationLayoutSchema=z.object({order:z.array(nodeId).max(5000).refine(unique,'Duplicate navigation entry'),hidden:z.array(nodeId).max(5000).refine(unique,'Duplicate hidden entry'),resources:z.boolean()}).strict();
export type NavigationLayout=z.infer<typeof navigationLayoutSchema>;
export const defaultNavigationLayout=():NavigationLayout=>({order:[],hidden:[],resources:true});
export interface NavigationNode {iconKey?:import('./record-icons.js').RecordIconKey;id:string;parentId:string|null;kind:'section'|'object'|'contact_kind';labels:Record<string,string>;available:boolean;permitted:boolean;objectTypeId?:string;technicalName?:string;contactKindId?:string;contactKind?:'organization'|'person'|'individual'}
export interface NavigationSettings {nodes:NavigationNode[];workspace:{version:number;layout:NavigationLayout|null};personal:{version:number;layout:NavigationLayout|null};canManage:boolean}
export function navigationChildren(nodes:NavigationNode[],parentId:string|null,layout:NavigationLayout,includeHidden=false):NavigationNode[]{
 const positions=new Map(layout.order.map((id,index)=>[id,index]));
 return nodes.filter(n=>n.parentId===parentId&&(includeHidden||!layout.hidden.includes(n.id))).map((node,index)=>({node,index})).sort((a,b)=>(positions.get(a.node.id)??Number.MAX_SAFE_INTEGER)-(positions.get(b.node.id)??Number.MAX_SAFE_INTEGER)||a.index-b.index).map(item=>item.node);
}
/** Only sibling positions change; the semantic hierarchy remains intact. */
export function moveNavigationNode(nodes:NavigationNode[],layout:NavigationLayout,id:string,targetId:string):NavigationLayout{
 const node=nodes.find(n=>n.id===id),target=nodes.find(n=>n.id===targetId);if(!node||!target||node.parentId!==target.parentId||id===targetId)return layout;
 const siblings=navigationChildren(nodes,node.parentId,layout,true).map(n=>n.id),from=siblings.indexOf(id),to=siblings.indexOf(targetId);siblings.splice(to,0,siblings.splice(from,1)[0]!);
 const siblingSet=new Set(siblings);return {...layout,order:[...layout.order.filter(key=>!siblingSet.has(key)),...siblings]};
}
export function navigationHref(node:NavigationNode,workspaceCode:string):string{
 const query=new URLSearchParams({nav:node.id});if(node.contactKindId)query.set('kind',node.contactKindId);
 return `/w/${workspaceCode}/objects/${node.technicalName}?${query}`;
}

/** Apply parent availability/visibility as well as each entry's current authorization. */
export function visibleNavigationNodes(nodes:NavigationNode[],layout:NavigationLayout):NavigationNode[]{
 const byId=new Map(nodes.map(node=>[node.id,node]));
 return nodes.filter(node=>{let current:NavigationNode|undefined=node;const visited=new Set<string>();while(current){if(visited.has(current.id)||!current.available||!current.permitted||layout.hidden.includes(current.id))return false;visited.add(current.id);if(current.parentId===null)return true;current=byId.get(current.parentId);}return false;});
}

/** A saved entry identity wins; direct URLs choose the first currently ordered visible copy. */
export function activeNavigationNode(nodes:NavigationNode[],layout:NavigationLayout,objectTypeId:string|undefined,entryId:string|null,contactKindId:string|null):NavigationNode|undefined{
 const visible=visibleNavigationNodes(nodes,layout),ordered=navigationChildren(visible,null,layout).flatMap(section=>navigationChildren(visible,section.id,layout).flatMap(object=>[object,...navigationChildren(visible,object.id,layout)]));
 const candidates=ordered.filter(node=>node.objectTypeId===objectTypeId&&(contactKindId?node.contactKindId===contactKindId:node.kind==='object'));
 return candidates.find(node=>node.id===entryId)??candidates[0];
}
