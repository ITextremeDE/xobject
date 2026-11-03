import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchIcon, XIcon } from 'lucide-react';
import type { RelationshipField, RelatedRecord } from '@xobject/contracts';
import { api } from '@/lib/api';
import { eligibleTargetObject, relatedIdentity, sameRelatedSelection, toggleRelatedSelection } from '@/lib/relationship-selection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { DialogActions } from './dialog-actions';
import { TablePagination } from './table-pagination';
import { ErrorNotice, Loading } from './feedback';

type Props={dialogTitle?:string;description?:string;sourceValues?:Record<string,import('@xobject/contracts').FieldValue>;targetObjectTypeId?:string;objectTypeId:string;recordId?:string;field:RelationshipField;title:string;onClose:()=>void;onApply:(targets:RelatedRecord[])=>void;onDirtyChange:(dirty:boolean)=>void;finalFocus:()=>HTMLElement|true};
export function RelationshipPicker({dialogTitle,description,sourceValues,targetObjectTypeId,objectTypeId,recordId,field,title,onClose,onApply,onDirtyChange,finalFocus}:Props) {
  const {t,i18n}=useTranslation();
  const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.de??labels.en??Object.values(labels)[0]??'';
  const single=(field.side==='left'?field.definition.leftMax:field.definition.rightMax)===1;
  const [targets,setTargets]=useState([...field.targets]),[search,setSearch]=useState(''),[targetObject,setTargetObject]=useState(targetObjectTypeId??'all');
  const [mode,setMode]=useState('available'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[confirmClose,setConfirmClose]=useState(false);
  const dirty=!sameRelatedSelection(targets,field.targets);
  const objects=useQuery({queryKey:['relationship-picker-objects',field.definition.workspaceId],queryFn:()=>api('list_object_types',{workspaceId:field.definition.workspaceId})});
  const eligible=(objects.data??[]).filter(object=>eligibleTargetObject(field.definition,objectTypeId,field.side,object.id));
  const objectChoices=[{value:'all',label:t('allObjectTypes')},...Array.from(new Map([...eligible.map(object=>({value:object.id,label:label(object.labels)})),...field.targets.map(target=>({value:target.objectTypeId,label:label(target.objectLabels)}))].map(item=>[item.value,item])).values()).sort((a,b)=>a.label.localeCompare(b.label,i18n.language))];
  const candidates=useQuery({placeholderData:keepPreviousData,queryKey:['relationship-candidates',objectTypeId,recordId,field.definition.id,field.definition.version,field.side,sourceValues,search,targetObject,page,pageSize],queryFn:()=>api('search_relationship_candidates',{sourceValues,objectTypeId,recordId,relationshipTypeId:field.definition.id,side:field.side,query:search,targetObjectTypeId:targetObject==='all'?undefined:targetObject,offset:(page-1)*pageSize,limit:pageSize}),enabled:mode==='available'});
  const selected=targets.filter(target=>(targetObject==='all'||target.objectTypeId===targetObject)&&target.keyword.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>a.keyword.localeCompare(b.keyword,i18n.language)||relatedIdentity(a).localeCompare(relatedIdentity(b)));
  const selectedPage=Math.min(page,Math.max(1,Math.ceil(selected.length/pageSize)));
  const rows=mode==='selected'?selected.slice((selectedPage-1)*pageSize,selectedPage*pageSize):candidates.data?.records??[];
  const total=mode==='selected'?selected.length:candidates.data?.total??0;
  const fetching=mode==='available'&&candidates.isFetching;
  function change(next:RelatedRecord[]){setTargets(next);onDirtyChange(!sameRelatedSelection(next,field.targets));}
  const focusSearch=()=>requestAnimationFrame(()=>document.getElementById('relationship-picker-search')?.focus());
  function choose(target:RelatedRecord){const next=toggleRelatedSelection(targets,target,single);change(next);if(mode==='selected'&&next.length<targets.length)focusSearch();}
  function remove(target:RelatedRecord){change(targets.filter(item=>relatedIdentity(item)!==relatedIdentity(target)));focusSearch();}
  function close(){if(dirty)setConfirmClose(true);else onClose();}
  const limitReached=!single&&targets.length>=1000;
  const results=<div className="min-w-0 overflow-hidden rounded-lg border"><Table aria-label={t('relationshipPickerResults')} className="table-fixed [&_th]:whitespace-normal [&_th]:[overflow-wrap:anywhere]"><TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">{t('relationshipSelection')}</span></TableHead><TableHead>{t('keyword')}</TableHead><TableHead className="w-[34%]">{t('objectSingular')}</TableHead>{mode==='selected'?<TableHead className="w-10"><span className="sr-only">{t('action')}</span></TableHead>:null}</TableRow></TableHeader><TableBody>{rows.map(target=>{
    const key=relatedIdentity(target),checked=targets.some(item=>relatedIdentity(item)===key),id=`picker-${field.definition.id}-${field.side}-${target.objectTypeId}-${target.recordId}`;
    const disabled=fetching||(!checked&&limitReached);
    return <TableRow key={key} data-state={checked?'selected':undefined} onClick={event=>{if(disabled||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||window.getSelection()?.toString()||event.target instanceof Element&&event.target.closest('button,a,input,label,[role="checkbox"],[role="radio"]'))return;choose(target);}}><TableCell>{single?<RadioGroupItem id={id} value={key} disabled={disabled} aria-label={t('selectRecord',{name:target.keyword})}/>:<Checkbox id={id} disabled={disabled} checked={checked} aria-label={t('selectRecord',{name:target.keyword})} onCheckedChange={()=>choose(target)}/>}</TableCell><TableCell className="whitespace-normal"><FieldLabel htmlFor={id} className="w-full min-w-0"><span className="min-w-0 wrap-anywhere" title={target.keyword}>{target.keyword}</span></FieldLabel></TableCell><TableCell className="whitespace-normal wrap-anywhere">{label(target.objectLabels)}{target.state==='inactive'?<Badge variant="outline" className="ml-2">{t('definition_inactive')}</Badge>:null}</TableCell>{mode==='selected'?<TableCell><Button type="button" variant="ghost" size="icon-sm" aria-label={t('removeRelationship',{name:target.keyword})} onClick={()=>remove(target)}><XIcon/></Button></TableCell>:null}</TableRow>;
  })}</TableBody></Table>{!rows.length?<Empty><EmptyHeader><EmptyTitle>{t(mode==='selected'?'relationshipSelectedEmpty':'noRelatedMatches')}</EmptyTitle><EmptyDescription>{t(mode==='selected'?'relationshipSelectedEmptyHelp':'relationshipNoMatchesHelp')}</EmptyDescription></EmptyHeader></Empty>:null}</div>;
  return <><Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl" finalFocus={finalFocus} initialFocus={()=>document.getElementById('relationship-picker-search')??true}>
    <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{dialogTitle??t('relationshipPickerTitle',{name:title})}</DialogTitle><DialogDescription>{description??t(single?'relationshipPickerSingleHelp':'relationshipPickerManyHelp')}</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto px-4 pb-4"><FieldGroup>
      <FieldGroup className="gap-3 sm:flex-row sm:items-center"><Field className="min-w-0 flex-1"><FieldLabel htmlFor="relationship-picker-search" className="sr-only">{t('search')}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon/></InputGroupAddon><InputGroupInput id="relationship-picker-search" type="search" placeholder={t('search')} value={search} maxLength={200} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></InputGroup></Field>{!targetObjectTypeId&&objectChoices.length>2?<Select items={objectChoices} value={targetObject} onValueChange={value=>{if(value){setTargetObject(value);setPage(1);}}}><SelectTrigger className="w-full sm:w-fit" aria-label={t('objectFilter')}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{objectChoices.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>:null}</FieldGroup>
      <Tabs value={mode} onValueChange={value=>{setMode(value);setPage(1);}}><TabsList variant="line" aria-label={t('relationshipPickerViews')}><TabsTrigger value="available">{t('relationshipAvailable')}</TabsTrigger><TabsTrigger value="selected">{t('relationshipSelected',{count:targets.length})}</TabsTrigger></TabsList></Tabs>
      {objects.isError?<ErrorNotice error={objects.error} retry={()=>{void objects.refetch();}}/>:null}
      {mode==='available'&&candidates.isPending?<Loading variant="table" headings={[t('relationshipSelection'),t('keyword'),t('objectSingular')]} columnClasses={['w-10','whitespace-normal','w-[34%] whitespace-normal [overflow-wrap:anywhere]']}/>:mode==='available'&&candidates.isError?<ErrorNotice error={candidates.error} retry={()=>{void candidates.refetch();}}/>:single?<RadioGroup value={targets[0]?relatedIdentity(targets[0]):null} onValueChange={key=>{const target=rows.find(item=>relatedIdentity(item)===key);if(target)choose(target);}} aria-label={title}>{results}</RadioGroup>:results}
      <TablePagination total={total} page={mode==='selected'?selectedPage:page} pageSize={pageSize} countLabel={t('relatedCandidateCount',{count:total})} disabled={fetching} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}}/>
      <FieldDescription role="status">{t('relationshipSelected',{count:targets.length})}{limitReached?` · ${t('relationshipSelectionLimit',{count:1000})}`:''}</FieldDescription>
    </FieldGroup></div>
    <DialogActions onClose={close} closeLabel={t('cancel')}><Button type="button" disabled={!dirty} onClick={()=>onApply(targets)}>{t('relationshipApplySelection')}</Button></DialogActions>
  </DialogContent></Dialog>
  <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('relationshipDiscardSelection')}</AlertDialogTitle><AlertDialogDescription>{t('relationshipDiscardSelectionHelp')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{setConfirmClose(false);onClose();}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
