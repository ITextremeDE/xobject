import {recordIcons} from './record-icon';
import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {activeNavigationNode,visibleNavigationNodes,navigationChildren,navigationHref,type NavigationNode,type NavigationLayout,type NavigationSettings} from '@xobject/contracts';
import {ChevronRightIcon} from 'lucide-react';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './ui/collapsible';
import {SidebarGroup,SidebarGroupLabel,SidebarGroupContent,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarMenuSub,SidebarMenuSubItem,SidebarMenuSubButton,SidebarMenuAction,useSidebar} from './ui/sidebar';

export function WorkspaceNavigation({settings,layout,workspaceCode,selectedObjectId,recordId,search,disabled,onNavigate}:{settings:NavigationSettings;layout:NavigationLayout;workspaceCode:string;selectedObjectId?:string;recordId:string|null;search:string;disabled:boolean;onNavigate:(path:string)=>void}){
 const {i18n,t}=useTranslation(),{state,isMobile}=useSidebar();
 const iconOnly=state==='collapsed'&&!isMobile;
 const nodes=visibleNavigationNodes(settings.nodes,layout),params=new URLSearchParams(search),kind=params.get('kind');
 const active=activeNavigationNode(settings.nodes,layout,selectedObjectId,params.get('nav'),kind);
 const label=(n:NavigationNode)=>n.labels[i18n.language]??n.labels.en??n.labels.de??Object.values(n.labels)[0];
 function open(node:NavigationNode){onNavigate(active?.id===node.id&&!recordId?`/w/${workspaceCode}/objects/${node.technicalName}${search}`:navigationHref(node,workspaceCode));}
 function item(node:NavigationNode){
  const children=navigationChildren(nodes,node.id,layout),childActive=active?.parentId===node.id;
  return <NavigationItem key={node.id} node={node} childrenNodes={children} label={label} activeId={active?.id} expanded={childActive} iconOnly={iconOnly} disabled={disabled} onOpen={open} contextName={`${label(node)} · ${label(settings.nodes.find(n=>n.id===node.parentId)!)}`} toggleLabel={t('navigationToggle',{name:label(node)})}/>;
 }
 return <>{navigationChildren(nodes,null,layout).map(section=>{
  const entries=navigationChildren(nodes,section.id,layout);if(!entries.length)return null;
  const content=<SidebarGroupContent><SidebarMenu className="gap-1">{entries.map(item)}</SidebarMenu></SidebarGroupContent>;
  return iconOnly?<SidebarGroup role="group" aria-label={label(section)} key={section.id}><SidebarGroupLabel>{label(section)}</SidebarGroupLabel>{content}</SidebarGroup>:<Collapsible key={section.id} defaultOpen className="group/navigation-section"><SidebarGroup role="group" aria-label={label(section)}><SidebarGroupLabel render={<CollapsibleTrigger disabled={disabled}/>} className="w-full justify-between">{label(section)}<ChevronRightIcon className="transition-transform group-data-[open]/navigation-section:rotate-90"/></SidebarGroupLabel><CollapsibleContent>{content}</CollapsibleContent></SidebarGroup></Collapsible>;
 })}</>;

}
function NavigationItem({node,childrenNodes,label,activeId,expanded,iconOnly,disabled,onOpen,toggleLabel,contextName}:{node:NavigationNode;childrenNodes:NavigationNode[];label:(node:NavigationNode)=>string;activeId?:string;expanded:boolean;iconOnly:boolean;disabled:boolean;onOpen:(node:NavigationNode)=>void;toggleLabel:string;contextName:string}){
 const [open,setOpen]=useState(expanded);
 useEffect(()=>{if(expanded)setOpen(true);},[expanded]);
 const ObjectIcon=recordIcons[node.iconKey??'object'];
 const icon=(child:NavigationNode)=>recordIcons[child.contactKind??'contact'];
 return <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem/>} className="group/navigation-item">
  <SidebarMenuButton tooltip={contextName} aria-label={iconOnly?contextName:undefined} disabled={disabled} isActive={activeId===node.id} aria-current={activeId===node.id?'page':undefined} onClick={()=>onOpen(node)}><ObjectIcon/><span>{label(node)}</span></SidebarMenuButton>
  {childrenNodes.length&&!iconOnly?<><CollapsibleTrigger render={<SidebarMenuAction/>} disabled={disabled} aria-label={toggleLabel}><ChevronRightIcon className="transition-transform group-data-[open]/navigation-item:rotate-90"/></CollapsibleTrigger><CollapsibleContent><SidebarMenuSub className="gap-1">{childrenNodes.map(child=>{const Icon=icon(child);return <SidebarMenuSubItem key={child.id}><SidebarMenuSubButton render={<button type="button" disabled={disabled}/>} isActive={activeId===child.id} aria-current={activeId===child.id?'page':undefined} aria-disabled={disabled} onClick={()=>{if(!disabled)onOpen(child);}}><Icon/><span>{label(child)}</span></SidebarMenuSubButton></SidebarMenuSubItem>})}</SidebarMenuSub></CollapsibleContent></>:null}
 </Collapsible>;
}
