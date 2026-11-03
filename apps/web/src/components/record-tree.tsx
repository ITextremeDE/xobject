import { Fragment, useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from 'lucide-react';
import type { RelatedRecord, RelationshipTreeChild } from '@xobject/contracts';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { FieldDescription, FieldGroup, FieldSet, FieldLegend } from '@/components/ui/field';
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
export function RecordTree({objectTypeId,recordId,workspaceCode,primaryAvailable=true}:{objectTypeId:string;recordId:string;workspaceCode:string;primaryAvailable?:boolean}) {
  const {t,i18n}=useTranslation(),query=useBranch(objectTypeId,recordId,true),prefix=useId(),[activeId,setActive]=useState(`${prefix}-root`);
  useEffect(()=>setActive(`${prefix}-root`),[i18n.language,prefix]);
  if(query.isPending)return <Loading variant="tree"/>;
  if(query.isError&&!query.data)return <ErrorNotice error={query.error} retry={()=>{void query.refetch();}}/>;
  const branch=query.data!.pages[0];
  return <FieldGroup><FieldDescription>{t(primaryAvailable?'treeSavedHelp':'treeCrossReferencesHelp')}</FieldDescription>
    {primaryAvailable?<FieldSet><FieldLegend>{t('primaryContext')}</FieldLegend>
      {branch.ancestorsTruncated?<FieldDescription>{t('treeMoreAncestors')}</FieldDescription>:null}
      {branch.ancestors.length?<Breadcrumb aria-label={t('primaryContext')}><BreadcrumbList>{branch.ancestors.map(ancestor=><Fragment key={identity(ancestor)}><BreadcrumbItem className="min-w-0"><BreadcrumbLink className="whitespace-normal wrap-anywhere" render={<Link to={recordPath(workspaceCode,ancestor)}/>}>{ancestor.keyword}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator/></Fragment>)}<BreadcrumbItem className="min-w-0"><BreadcrumbPage className="whitespace-normal wrap-anywhere">{branch.record.keyword}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>:<FieldDescription>{t('treeNoAncestors')}</FieldDescription>}
    </FieldSet>:null}
    <Collapsible><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="w-fit px-0"/>}>{t('keyboardHelp')}<ChevronRightIcon data-icon="inline-end"/></CollapsibleTrigger><CollapsibleContent><FieldDescription id={`${prefix}-help`}>{t('treeKeyboardHelp')}</FieldDescription></CollapsibleContent></Collapsible>
    <div className="min-w-0 overflow-x-auto rounded-lg border p-2"><ul role="tree" aria-label={t('recordTree')} className="min-w-0">
      <TreeNode record={branch.record} hasChildren={branch.total>0} root workspaceCode={workspaceCode} depth={0} path={[]} nodeId={`${prefix}-root`} position={1} total={1} activeId={activeId} setActive={setActive}/>
    </ul></div>
    {!branch.total?<FieldDescription>{t('treeEmpty')}</FieldDescription>:null}
  </FieldGroup>;
}
type NodeProps={record:RelatedRecord;hasChildren:boolean;root?:boolean;via?:RelationshipTreeChild;workspaceCode:string;depth:number;path:string[];nodeId:string;parentId?:string;position:number;total:number;activeId:string;setActive:(id:string)=>void};
function TreeNode({record,hasChildren,root=false,via,workspaceCode,depth,path,nodeId,parentId,position,total,activeId,setActive}:NodeProps) {
  const {t,i18n}=useTranslation(),navigate=useNavigate(),[open,setOpen]=useState(root);
  const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.de??labels.en??Object.values(labels)[0]??'';
  const repeated=path.includes(identity(record)),depthLimit=depth>=32,canExpand=hasChildren&&!repeated&&!depthLimit;
  const query=useBranch(record.objectTypeId,record.recordId,open&&canExpand);
  const children=query.data?.pages.flatMap(page=>page.children)??[];
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
  return <Collapsible open={open&&canExpand} onOpenChange={setOpen} render={<li/>} role="treeitem" id={nodeId} aria-label={`${record.keyword} · ${label(record.objectLabels)}${via?` · ${label(via.sideLabels)}`:''}${repeated?` · ${t('treeRepeated')}`:''}`} aria-expanded={canExpand?open:undefined} aria-level={depth+1} aria-posinset={position} aria-setsize={total} tabIndex={activeId===nodeId?0:-1} onFocus={event=>{event.stopPropagation();setActive(nodeId);}} onKeyDown={keyboard} className="min-w-0 rounded-md outline-none [&:focus-visible>div:first-child]:ring-2 [&:focus-visible>div:first-child]:ring-ring">
    <div className="flex min-w-48 items-start gap-2 rounded-md p-1">
      {canExpand?<CollapsibleTrigger tabIndex={-1} aria-label={t(open?'collapseTreeRecord':'expandTreeRecord',{name:record.keyword})} render={<Button type="button" variant="ghost" size="icon-sm"/>}><ChevronRightIcon className={cn('transition-transform',open&&'rotate-90')}/></CollapsibleTrigger>:<span aria-hidden="true" className="size-8 shrink-0"/>}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">{root?<span className="font-medium wrap-anywhere">{record.keyword}</span>:<Button type="button" variant="link" tabIndex={-1} className="h-auto w-fit max-w-full justify-start px-0 text-left whitespace-normal wrap-anywhere" render={<Link to={recordPath(workspaceCode,record)}/>}>{record.keyword}</Button>}
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{label(record.objectLabels)}</span>{via?<><Badge variant={via.kind==='primary'?'secondary':'outline'}>{label(via.labels)}</Badge>{via.kind!=='primary'?<span className="text-xs text-muted-foreground">{label(via.sideLabels)} · {t(`treeDirection_${via.direction}`)}</span>:null}</>:null}{record.state==='inactive'?<Badge variant="outline">{t('definition_inactive')}</Badge>:null}{repeated?<Badge variant="outline">{t('treeRepeated')}</Badge>:null}{depthLimit&&hasChildren?<span className="text-xs text-muted-foreground">{t('treeDepthLimit')}</span>:null}</div>
      </div>
    </div>
    {canExpand?<CollapsibleContent><ul role="group" className="ml-4 min-w-0 border-l pl-3">
      {query.isPending?<li role="none" className="p-2"><Loading variant="tree"/></li>:null}
      {query.isError?<li role="none" data-tree-control className="p-2"><ErrorNotice error={query.error} retry={()=>{void query.refetch();}}/></li>:null}
      {children.map((child,index)=><TreeNode key={child.edgeId} record={child.record} hasChildren={child.hasChildren} via={child} workspaceCode={workspaceCode} depth={depth+1} path={[...path,identity(record)]} nodeId={`${nodeId}-${child.edgeId}`} parentId={nodeId} position={index+1} total={query.data?.pages[0].total??children.length} activeId={activeId} setActive={setActive}/>)}
      {query.hasNextPage?<li role="none" data-tree-control className="flex flex-col items-start gap-2 p-2"><FieldDescription>{t('treeLoadedCount',{count:children.length,total:query.data?.pages[0].total??0})}</FieldDescription><Button type="button" variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={()=>{void query.fetchNextPage();}}>{query.isFetchingNextPage?<Spinner data-icon="inline-start"/>:null}{t('treeLoadMore')}</Button></li>:null}
      {query.data&&!query.isPending&&!children.length?<li role="none" className="p-2"><FieldDescription>{t('treeEmpty')}</FieldDescription></li>:null}
    </ul></CollapsibleContent>:null}
  </Collapsible>;
}
