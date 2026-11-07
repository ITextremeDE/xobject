import {TreeBranchLoading} from './loading';
import {expandTree,loadTreePages} from '@/lib/tree-expansion';
import {RecordIcon} from './record-icon';
import { Fragment, useEffect, useId, useState, useRef, type KeyboardEvent } from 'react';
import {useQueryClient,type InfiniteData} from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, ListCollapseIcon, ListTreeIcon, KeyboardIcon, XIcon } from 'lucide-react';
import type { RelatedRecord, TreeRecord, RelationshipTreeBranch } from '@xobject/contracts';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { FieldDescription, FieldGroup } from '@/components/ui/field';
import {Popover,PopoverTrigger,PopoverContent} from './ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { ErrorNotice, Loading } from './feedback';

const identity=(record:RelatedRecord)=>`${record.objectTypeId}:${record.recordId}`;
const recordPath=(code:string,record:RelatedRecord)=>`/w/${code}/objects/${record.objectTechnicalName}/${record.recordId}`;
function useBranch(objectTypeId:string,recordId:string,enabled:boolean) {
  const {i18n}=useTranslation();
  return useInfiniteQuery({queryKey:['relationship-tree',objectTypeId,recordId,i18n.language],initialPageParam:0,
    queryFn:({pageParam})=>api('get_relationship_tree_branch',{objectTypeId,recordId,offset:pageParam,limit:25}),
    getNextPageParam:last=>last.offset+last.children.length<last.total?last.offset+last.children.length:undefined,
    enabled,staleTime:15_000});
}
export function RecordTree({objectTypeId,recordId,workspaceCode}:{objectTypeId:string;recordId:string;workspaceCode:string}) {
  const {t,i18n}=useTranslation(),query=useBranch(objectTypeId,recordId,true),prefix=useId(),[activeId,setActive]=useState(`${prefix}-root`),[openNodes,setOpenNodes]=useState(()=>new Set([`${prefix}-root`]));
  const client=useQueryClient(),run=useRef(0),[expanding,setExpanding]=useState(false),[expandError,setExpandError]=useState<unknown>(null);
  useEffect(()=>()=>{run.current++;},[]);
  useEffect(()=>{run.current++;setExpanding(false);setExpandError(null);setActive(`${prefix}-root`);setOpenNodes(new Set([`${prefix}-root`]));},[i18n.language,prefix,objectTypeId,recordId]);
  const toggle=(id:string,open:boolean)=>{if(expanding){run.current++;setExpanding(false);}setOpenNodes(previous=>{const next=new Set(previous);if(open)next.add(id);else next.delete(id);return next;});if(!open&&activeId.startsWith(`${id}-`)){setActive(id);document.getElementById(id)?.focus();}};
  async function expandAll(){
    const ticket=++run.current,cancelled=()=>run.current!==ticket;setExpanding(true);setExpandError(null);
    try{
      const load=async(record:RelatedRecord)=>{
        const queryKey=['relationship-tree',record.objectTypeId,record.recordId,i18n.language],state=client.getQueryState(queryKey);
        const cached=client.getQueryData<InfiniteData<RelationshipTreeBranch>>(queryKey);
        const pages=state&&!state.isInvalidated&&Date.now()-state.dataUpdatedAt<15_000?[...(cached?.pages??[])]:[];
        return loadTreePages(pages,offset=>api('get_relationship_tree_branch',{objectTypeId:record.objectTypeId,recordId:record.recordId,offset,limit:25}),pages=>client.setQueryData(queryKey,{pages,pageParams:pages.map(page=>page.offset)}),cancelled);
      };
      await expandTree(query.data!.pages[0].record,`${prefix}-root`,load,id=>setOpenNodes(previous=>new Set([...previous,id])),cancelled);
    }catch(error){if(!cancelled())setExpandError(error instanceof Error&&error.message==='Tree changed during expansion'?new Error(t('treeChangedDuringExpansion')):error);}
    finally{if(!cancelled())setExpanding(false);}
  }
  if(query.isPending)return <Loading variant="tree"/>;
  if(query.isError&&!query.data)return <ErrorNotice error={query.error} retry={()=>{void query.refetch();}}/>;
  const branch=query.data!.pages[0];
  return <FieldGroup className="gap-4"><FieldDescription>{t('treeSavedHelp')}</FieldDescription>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1 basis-full sm:basis-0">{branch.ancestors.length?<Breadcrumb aria-label={t('primaryContext')}><BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1">{branch.ancestors.map(ancestor=><Fragment key={identity(ancestor)}><BreadcrumbItem className="min-w-0"><BreadcrumbLink className="max-w-48 truncate" title={ancestor.keyword} render={<Link to={recordPath(workspaceCode,ancestor)}/>}>{ancestor.keyword}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator/></Fragment>)}<BreadcrumbItem className="min-w-0"><BreadcrumbPage className="max-w-64 truncate" title={branch.record.keyword}>{branch.record.keyword}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>:<FieldDescription>{t('treeNoAncestors')}</FieldDescription>}{branch.ancestorsTruncated?<FieldDescription>{t('treeMoreAncestors')}</FieldDescription>:null}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={!branch.total||expanding} onClick={()=>{void expandAll();}}>{expanding?<Spinner aria-label={t('loading')} data-icon="inline-start"/>:<ListTreeIcon data-icon="inline-start"/>}{t('treeExpandAll')}</Button>{expanding?<Button type="button" variant="ghost" size="icon-sm" aria-label={t('cancel')} title={t('cancel')} onClick={()=>{run.current++;setExpanding(false);}}><XIcon/></Button>:null}<Button type="button" variant="outline" size="sm" disabled={!branch.total||!openNodes.size} onClick={()=>{run.current++;setExpanding(false);setOpenNodes(new Set());setActive(`${prefix}-root`);document.getElementById(`${prefix}-root`)?.focus();}}><ListCollapseIcon data-icon="inline-start"/>{t('treeCollapseAll')}</Button><Popover><PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t('keyboardHelp')} title={t('keyboardHelp')}/> }><KeyboardIcon/></PopoverTrigger><PopoverContent align="end" className="max-w-[calc(100vw-2rem)]"><p className="text-sm">{t('treeKeyboardHelp')}</p></PopoverContent></Popover></div>
    </div>
    {expandError?<ErrorNotice error={expandError} retry={()=>{void expandAll();}}/>:null}
    <div className="min-w-0 overflow-x-auto rounded-lg border p-2"><ul role="tree" aria-label={t('recordTree')} className="min-w-0">
      <TreeNode record={branch.record} hasChildren={branch.total>0} root workspaceCode={workspaceCode} depth={0} path={[]} nodeId={`${prefix}-root`} position={1} total={1} activeId={activeId} setActive={setActive} openNodes={openNodes} toggle={toggle}/>
    </ul></div>
    {!branch.total?<FieldDescription>{t('treeEmpty')}</FieldDescription>:null}
  </FieldGroup>;
}
type NodeProps={record:TreeRecord;hasChildren:boolean;root?:boolean;workspaceCode:string;depth:number;path:string[];nodeId:string;parentId?:string;position:number;total:number;activeId:string;setActive:(id:string)=>void;openNodes:Set<string>;toggle:(id:string,open:boolean)=>void};
function TreeNode({record,hasChildren,root=false,workspaceCode,depth,path,nodeId,parentId,position,total,activeId,setActive,openNodes,toggle}:NodeProps) {
  const {t,i18n}=useTranslation(),navigate=useNavigate();
  const open=openNodes.has(nodeId),setOpen=(value:boolean)=>toggle(nodeId,value);
  const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.de??labels.en??Object.values(labels)[0]??'';
  const repeated=path.includes(identity(record)),depthLimit=depth>=32,canExpand=hasChildren&&!repeated&&!depthLimit;
  const query=useBranch(record.objectTypeId,record.recordId,open&&canExpand);
  const children=query.data?.pages.flatMap(page=>page.children)??[];
  const nodeContent=<><RecordIcon iconKey={record.iconKey} objectLabel={label(record.objectLabels)}/><span className="min-w-0 flex-1 truncate text-left">{record.keyword}</span>{' '}<span className="hidden max-w-28 truncate text-xs text-muted-foreground sm:inline">{label(record.objectLabels)}</span>{' '}{record.statusLabels?<Badge variant="outline" className="max-w-28 truncate">{label(record.statusLabels)}</Badge>:null}{record.state==='inactive'?<Badge variant="outline">{t('definition_inactive')}</Badge>:null}{repeated?<Badge variant="outline">{t('treeRepeated')}</Badge>:null}{depthLimit&&hasChildren?<span className="text-xs text-muted-foreground">{t('treeDepthLimit')}</span>:null}</>;
  function keyboard(event:KeyboardEvent<HTMLElement>) {
    if(event.altKey||event.ctrlKey||event.metaKey||event.nativeEvent.isComposing)return;
    if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;
    event.stopPropagation();
    if(event.target instanceof Element&&event.target.closest('[data-tree-control]'))return;
    if((event.key==='Enter'||event.key===' ')&&event.target instanceof Element&&event.target.closest('button,a'))return;
    event.preventDefault();const current=event.currentTarget;
    if(event.key==='ArrowRight'){if(canExpand&&!open)setOpen(true);else if(open)current.querySelector<HTMLElement>('[role="group"] [role="treeitem"]')?.focus();return;}
    if(event.key==='ArrowLeft'){if(canExpand&&open)setOpen(false);else if(parentId)document.getElementById(parentId)?.focus();return;}
    if(event.key===' '){if(canExpand)setOpen(!open);return;}
    if(event.key==='Enter'){if(!root)void navigate(recordPath(workspaceCode,record));return;}
    const nodes=Array.from(current.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]')??[]).filter(node=>node.getClientRects().length);
    const index=nodes.indexOf(current),next=event.key==='Home'?0:event.key==='End'?nodes.length-1:event.key==='ArrowDown'?Math.min(index+1,nodes.length-1):Math.max(0,index-1);
    nodes[next]?.focus();
  }
  return <Collapsible open={open&&canExpand} onOpenChange={setOpen} render={<li/>} role="treeitem" id={nodeId} aria-expanded={canExpand?open:undefined} aria-level={depth+1} aria-posinset={position} aria-setsize={total} tabIndex={activeId===nodeId?0:-1} onFocus={event=>{event.stopPropagation();setActive(nodeId);}} onKeyDown={keyboard} className="min-w-0 rounded-md outline-none [&:focus-visible>div:first-child]:ring-2 [&:focus-visible>div:first-child]:ring-ring">
    <div className="flex min-w-56 items-center gap-1 rounded-md py-0.5">
      {canExpand?<CollapsibleTrigger tabIndex={-1} aria-label={t(open?'collapseTreeRecord':'expandTreeRecord',{name:record.keyword})} render={<Button type="button" variant="ghost" size="icon-sm"/>}><ChevronRightIcon className={cn('transition-transform',open&&'rotate-90')}/></CollapsibleTrigger>:<span aria-hidden="true" className="size-7 shrink-0"/>}
      {root?<span className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 font-medium" title={record.keyword}>{nodeContent}</span>:<Button variant="ghost" tabIndex={-1} nativeButton={false} render={<Link to={recordPath(workspaceCode,record)}/>} className="min-w-0 flex-1 justify-start gap-2" title={`${record.keyword} · ${label(record.objectLabels)}`}>{nodeContent}</Button>}
    </div>
    {canExpand?<CollapsibleContent><ul role="group" className="ml-4 min-w-0 border-l pl-3">
      {query.isPending?<li role="none" className="p-2"><TreeBranchLoading/></li>:null}
      {query.isError?<li role="none" data-tree-control className="p-2"><ErrorNotice error={query.error} retry={()=>{void query.refetch();}}/></li>:null}
      {children.map((child,index)=><TreeNode key={child.edgeId} record={child.record} hasChildren={child.hasChildren} workspaceCode={workspaceCode} depth={depth+1} path={[...path,identity(record)]} nodeId={`${nodeId}-${child.edgeId}`} parentId={nodeId} position={index+1} total={query.data?.pages[0].total??children.length} activeId={activeId} setActive={setActive} openNodes={openNodes} toggle={toggle}/>)}
      {query.hasNextPage?<li role="none" data-tree-control className="flex flex-col items-start gap-2 p-2"><FieldDescription>{t('treeLoadedCount',{count:children.length,total:query.data?.pages[0].total??0})}</FieldDescription><Button type="button" variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={()=>{void query.fetchNextPage();}}>{query.isFetchingNextPage?<Spinner data-icon="inline-start"/>:null}{t('treeLoadMore')}</Button></li>:null}
      {query.data&&!query.isPending&&!children.length?<li role="none" className="p-2"><FieldDescription>{t('treeEmpty')}</FieldDescription></li>:null}
    </ul></CollapsibleContent>:null}
  </Collapsible>;
}
