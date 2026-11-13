import {contactOverviewLayout,contactExtensionDisplayLayout} from '@/lib/contact-overview';
import {recordDisplayLayout} from '@/lib/record-form-layout';
import {relationshipShowsObjectColumn} from '@/lib/relationship-selection';
import {contactInheritanceSources} from '@xobject/contracts';
import {RecordPageHeader,RecordPageFooter,RecordSectionTabs,recordPageClassName} from './record-page-frame';
import {Tabs} from './ui/tabs';
import {recordLoadingModel} from '@/lib/record-loading';
import {RecordFormGroups} from './record-form-groups';
import {ContactCoreGroups} from './contact-core-groups';
import {contactCoreLayout,contactCoreFieldIds,contactExtensionLayout} from '@xobject/contracts';
import {SettingsSection} from './settings-section';
import {cn} from '@/lib/utils';
import {useLocation} from 'react-router';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {resolveFormLayout,type ObjectDefinition,type FieldValue,type FormEntry} from '@xobject/contracts';
import {Skeleton} from '@/components/ui/skeleton';
import {Spinner} from '@/components/ui/spinner';
import {Field,FieldGroup,FieldSet,FieldLegend,FieldLabel} from '@/components/ui/field';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter,CardAction} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarGroup,SidebarMenu,SidebarMenuItem,SidebarMenuSkeleton,SidebarFooter,SidebarInset} from '@/components/ui/sidebar';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogHeader} from '@/components/ui/dialog';
import {DialogActions} from './dialog-actions';
import {settingsDialogClassName} from '@/lib/settings-dialog-layout';

export function LoadingRegion({children,className}:{children:ReactNode;className?:string}){
  const {t}=useTranslation();
  return <div role="status" aria-label={t('loading')} aria-busy="true" className={className}><div aria-hidden="true">{children}</div></div>;
}
function TreeRowsPlaceholder(){return <div className="flex flex-col gap-1">{Array.from({length:3},(_,index)=><div key={index} className={cn("flex h-8 min-w-0 items-center gap-2",index>0&&"pl-7")}><Skeleton className="size-7 shrink-0"/><Skeleton className="h-4 min-w-0 flex-1"/><Skeleton className="h-5 w-16 shrink-0"/></div>)}</div>;}
export function TreeBranchLoading(){return <LoadingRegion><TreeRowsPlaceholder/></LoadingRegion>;}
export function FieldSkeleton({multiline=false,label}:{multiline?:boolean;label?:ReactNode}){
  return <Field>{label?<FieldLabel>{label}</FieldLabel>:<Skeleton className="h-4 w-28"/>}<Skeleton className={multiline?'h-20 w-full':'h-8 w-full'}/></Field>;
}
export function TemporalFieldSkeleton({label,datetime=false,showZone=false}:{label:ReactNode;datetime?:boolean;showZone?:boolean}){
  const {t}=useTranslation();
  return <Field className="@container/temporal min-w-0"><FieldGroup className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @lg/temporal:grid-cols-[8rem_minmax(0,1fr)_auto]"><div className="flex min-w-0 flex-col gap-1 @lg/temporal:pt-1.5"><FieldLabel>{label}</FieldLabel>{showZone?<Skeleton className="h-4 w-24 max-w-full"/>:null}</div><FieldGroup className={cn('col-span-2 row-start-2 min-w-0 gap-2 @lg/temporal:col-span-1 @lg/temporal:col-start-2 @lg/temporal:row-start-1',datetime&&'grid @[17rem]/temporal:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]')}><Field><span className="sr-only">{t('date')}</span><Skeleton className="h-8 w-full"/></Field>{datetime?<Field><span className="sr-only">{t('time')}</span><Skeleton className="h-8 w-full"/></Field>:null}</FieldGroup><Skeleton className="col-start-2 row-start-1 size-8 @lg/temporal:col-start-3"/></FieldGroup></Field>;
}
export function TableSkeletonRows({columns,rows=5,columnClasses=[],dense=false,selectable=false}:{columns:number;rows?:number;columnClasses?:string[];dense?:boolean;selectable?:boolean}){
  return <>{Array.from({length:rows},(_,row)=><TableRow key={row} aria-hidden="true" className={dense?'h-10':'h-12'}>{Array.from({length:columns},(_,column)=><TableCell key={column} className={columnClasses[column]}><Skeleton className={selectable&&column===0?'size-4':selectable&&column===columns-1?'size-7':'h-4 w-full'}/></TableCell>)}</TableRow>)}</>;
}
function TablePlaceholder({columns=4,rows=5,headings,columnClasses=[],dense=true,selectable=false}:{columns?:number;rows?:number;headings?:ReactNode[];columnClasses?:string[];dense?:boolean;selectable?:boolean}){
  const count=headings?.length??columns;
  return <div className="flex min-w-0 flex-col gap-5"><div className="overflow-hidden rounded-lg border"><Table className="table-fixed"><TableHeader><TableRow>{Array.from({length:count},(_,index)=><TableHead key={index} className={columnClasses[index]}>{headings?.[index]??<Skeleton className="h-4 w-20 max-w-full"/>}</TableHead>)}</TableRow></TableHeader><TableBody><TableSkeletonRows columns={count} rows={rows} dense={dense} selectable={selectable} columnClasses={columnClasses}/></TableBody></Table></div><div className="flex flex-wrap items-center justify-between gap-4 px-1"><Skeleton className="h-5 w-32"/><div className="flex flex-wrap items-center gap-4"><Skeleton className="h-7 w-40"/><Skeleton className="h-7 w-56"/></div></div></div>;
}
function FormPlaceholder({designer=false}:{designer?:boolean}){
  if(designer)return <FieldGroup><SettingsSection><FieldSkeleton/></SettingsSection><Skeleton className="h-5 w-full"/><Skeleton className="h-7 w-44"/><SettingsSection><FieldSet className="min-w-0"><FieldLegend><Skeleton className="h-5 w-36"/></FieldLegend><FieldSkeleton/>{Array.from({length:3},(_,index)=><FieldSet key={index} className="min-w-0"><FieldLegend><Skeleton className="h-4 w-28"/></FieldLegend><FieldGroup className="grid gap-3 sm:grid-cols-2"><FieldSkeleton/><FieldSkeleton/></FieldGroup></FieldSet>)}</FieldSet></SettingsSection></FieldGroup>;
  return <FieldGroup><FieldSet><FieldLegend><Skeleton className="h-5 w-36"/></FieldLegend><FieldGroup className="grid gap-6 sm:grid-cols-2">{Array.from({length:6},(_,index)=><FieldSkeleton key={index}/>)}</FieldGroup></FieldSet></FieldGroup>;
}
export function Loading({variant='inline',columns=4,rows=5,headings,columnClasses,label}:{variant?:'inline'|'form'|'field'|'table'|'sidebar'|'designer'|'object'|'tree'|'module';label?:ReactNode;columns?:number;rows?:number;headings?:ReactNode[];columnClasses?:string[]}){
  const {t}=useTranslation();
  if(variant==='inline')return <div role="status" aria-label={t('loading')} className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Spinner aria-hidden="true"/>{t('loading')}</div>;
  return <LoadingRegion>{variant==='table'?<TablePlaceholder columns={columns} rows={rows} headings={headings} columnClasses={columnClasses}/>:variant==='field'?<FieldSkeleton label={label}/>:variant==='sidebar'?<SidebarMenu className="gap-1">{Array.from({length:4},(_,index)=><SidebarMenuItem key={index}><SidebarMenuSkeleton showIcon/></SidebarMenuItem>)}</SidebarMenu>:variant==='module'?<FieldGroup><Skeleton className="h-4 w-full"/>{Array.from({length:3},(_,index)=><SettingsSection key={index}><Skeleton className="h-5 w-48 max-w-full"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-64 max-w-full"/><Skeleton className="h-8 w-52 max-w-full"/></SettingsSection>)}</FieldGroup>:variant==='tree'?<div className="flex flex-col gap-4"><Skeleton className="h-4 w-96 max-w-full"/><div className="flex flex-wrap items-center justify-between gap-3"><Skeleton className="h-4 w-64 max-w-full"/><div className="flex gap-2"><Skeleton className="h-7 w-24"/><Skeleton className="h-7 w-24"/><Skeleton className="size-7"/></div></div><div className="rounded-lg border p-2"><TreeRowsPlaceholder/></div></div>:variant==='object'?<FieldGroup><SettingsSection><Skeleton className="h-5 w-44"/><Skeleton className="h-4 w-full"/><FieldSkeleton/></SettingsSection><SettingsSection><div className="flex justify-between gap-4"><Skeleton className="h-6 w-20"/><Skeleton className="h-8 w-40"/></div><Skeleton className="h-8 w-80 max-w-full"/><TablePlaceholder headings={[t('objectName'),t('technicalName'),t('fieldType'),t('requiredField'),t('definitionState')]} columnClasses={['','hidden sm:table-cell','','','hidden sm:table-cell']}/></SettingsSection></FieldGroup>:<FormPlaceholder designer={variant==='designer'}/>}</LoadingRegion>;
}
export function DashboardSummaryLoading(){
  return <LoadingRegion><div className="@container/main flex flex-col gap-6"><div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">{Array.from({length:4},(_,index)=><Card key={index}><CardHeader><CardDescription><Skeleton className="h-5 w-40 max-w-full"/></CardDescription><CardTitle><Skeleton className="h-9 w-16"/></CardTitle><CardAction><Skeleton className="h-5 w-16"/></CardAction></CardHeader><CardFooter className="flex-col items-start gap-1.5"><Skeleton className="h-5 w-52 max-w-full"/><Skeleton className="h-5 w-60 max-w-full"/></CardFooter></Card>)}</div><Card><CardHeader><CardTitle><Skeleton className="h-5 w-40"/></CardTitle><CardDescription><Skeleton className="h-5 w-80 max-w-full"/></CardDescription><CardAction><Skeleton className="h-8 w-28 sm:w-64"/></CardAction></CardHeader><CardContent className="px-2 pt-4 sm:px-6 sm:pt-6"><Skeleton className="h-[250px] w-full"/></CardContent></Card></div></LoadingRegion>;
}
export function DashboardLoading(){
  return <div className="flex flex-col gap-6"><DashboardSummaryLoading/><LoadingRegion><div className="flex flex-col gap-4"><Skeleton className="h-8 w-72 max-w-full"/><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-7 w-80 max-w-full"/><Skeleton className="h-7 w-64 max-w-full"/></div><TablePlaceholder columns={9} rows={10} dense={false} selectable columnClasses={['w-10','','','','','','','','w-10']}/></div></LoadingRegion></div>;
}
export function RecordPageLoading({definition,values,contactKind,applicableFieldIds,isNew=false,treeAvailable}:{definition?:ObjectDefinition;values?:Record<string,FieldValue>;contactKind?:string;applicableFieldIds?:string[];isNew?:boolean;treeAvailable?:boolean}){
  const {t,i18n}=useTranslation();
  const kindField=definition?.fields.find(field=>field.id===definition.contactProfile?.fields.contact_kind);
  const loadingValues=values??(kindField&&contactKind?{[kindField.technicalName]:contactKind}:undefined);
  const {fields,relationships,knownKind}=recordLoadingModel(definition,loadingValues,applicableFieldIds);
  const core=definition?.contactProfile&&knownKind?contactCoreLayout(definition.contactProfile,fields,relationships):undefined;
  const extension=definition?.contactProfile&&knownKind?resolveFormLayout(contactExtensionLayout(definition.contactProfile,definition.fields,definition.formLayouts?.default),fields.filter(f=>!contactCoreFieldIds(definition.contactProfile!,definition.fields).has(f.id)),true,relationships.filter(r=>!(r.definition.id===definition.contactProfile!.relationships.contact_person&&r.side==='right'))):undefined;
  const layout=core?{groups:[...core.groups,...(extension?.groups??[])],unassigned:extension?.unassigned}:definition&&knownKind?resolveFormLayout(definition.formLayouts?.default,fields,true,relationships):undefined;
  const displayLayout=layout?recordDisplayLayout(layout):undefined;
  const groups=displayLayout?(core?contactExtensionDisplayLayout(displayLayout):displayLayout).groups:[];
  const extensionGroups=groups.filter(group=>!core?.groups.some(item=>item.id===group.id));
  const renderEntry=(entry:FormEntry)=>{
    const field='fieldId' in entry?fields.find(field=>field.id===entry.fieldId):undefined;
    const relation='relationshipTypeId' in entry?definition?.formRelationships?.find(item=>item.definition.id===entry.relationshipTypeId&&item.side===entry.side):undefined;
    const names=relation?(relation.side==='left'?relation.definition.leftLabels:relation.definition.rightLabels) as Record<string,string>:undefined;
    const label=field?.label??('primary' in entry?t('primaryChainTitle'):names?.[i18n.language]??names?.en??names?.de);
    if(field&&Object.keys(contactInheritanceSources).map(key=>definition?.contactProfile?.fields[key]).includes(field.id))return <Field><Skeleton className="h-4 w-36"/><div className="flex gap-2"><Skeleton className="h-7 w-36"/><Skeleton className="h-7 w-24"/></div><Skeleton className="h-8 w-full"/><Skeleton className="h-4 w-full"/></Field>;
    if(field?.kind==='structured'&&field.config.schema==='temporal'){
      const value=values?.[field.technicalName],kind=value&&typeof value==='object'&&!Array.isArray(value)&&'kind' in value?value.kind:undefined;
      return <TemporalFieldSkeleton label={label} datetime={kind!=='date'} showZone={kind!=='date'}/>;
    }
    return field?.kind==='date'||field?.kind==='datetime'?<TemporalFieldSkeleton label={label} datetime={field.kind==='datetime'}/>:<FieldSkeleton label={label} multiline={field?.kind==='multiline'}/>;
  };
  const renderRelationshipList=(group:typeof groups[number])=>{
   const sides=(definition?.formRelationships??[]).filter(side=>group.fields.some(entry=>'relationshipTypeId'in entry&&entry.relationshipTypeId===side.definition.id&&entry.side===side.side)).map(side=>({...side,targets:[]}));
   return <TablePlaceholder rows={3} headings={[t('relationshipType'),...(relationshipShowsObjectColumn(sides,definition?.id??'',group.objectColumn)?[t('objectSingular')]:[]),t('keyword')]}/>;
  };
  const renderGroup=(group:typeof groups[number],singleColumn=false)=>core&&!isNew?<SettingsSection key={group.id}><Skeleton className="h-5 w-36"/><div className={cn('grid min-w-0 gap-4',!singleColumn&&'sm:grid-cols-2')}>{group.fields.map((entry,index)=><div key={index} className="flex min-w-0 flex-col gap-2"><Skeleton className="h-4 w-24"/><Skeleton className="h-5 w-full"/></div>)}</div></SettingsSection>:<RecordFormGroups key={group.id} layout={{groups:[group]}} singleColumn={singleColumn} renderEntry={renderEntry} renderRelationshipList={renderRelationshipList}/>;
  return <LoadingRegion className="w-full min-w-0"><div className={recordPageClassName}><RecordPageHeader navigation={<><Skeleton className="h-8 w-36"/><Skeleton className="h-8 w-64 max-w-full"/></>} title={<Skeleton className="h-8 w-72 max-w-full"/>} description={<Skeleton className="h-5 w-full"/>} actions={!isNew?<><Skeleton className="h-8 w-36"/><Skeleton className="h-8 w-36"/></>:undefined}/><Tabs value="details" className="gap-4"><RecordSectionTabs isNew={isNew} treeAvailable={treeAvailable} loading/><div className="flex flex-col gap-6">{isNew?<Skeleton className="h-5 w-full"/>:null}{groups.length?<>{core?<ContactCoreGroups extensions={<RecordFormGroups layout={{groups:extensionGroups}} renderEntry={renderEntry} renderRelationshipList={renderRelationshipList}/>} layout={!isNew&&values?contactOverviewLayout(core,fields,values,[],true):core} media={<SettingsSection data-contact-section="contact-media"><div className="flex flex-col gap-4"><Skeleton className="h-5 w-28"/><div className="flex items-center gap-3"><Skeleton className="size-12 rounded-full"/><Skeleton className="h-8 w-28"/></div><Skeleton className="h-10 w-full"/></div></SettingsSection>} renderGroup={renderGroup}/>:null}{!core?<RecordFormGroups layout={{groups:extensionGroups}} renderEntry={renderEntry} renderRelationshipList={renderRelationshipList}/>:null}</>:<Skeleton className="h-64 w-full rounded-xl"/>}</div></Tabs>{!definition?.contactProfile||isNew?<RecordPageFooter><Skeleton className="h-5 w-56 max-w-full"/><div className="ml-auto flex gap-2">{!isNew?<Skeleton className="h-8 w-28"/>:null}<Skeleton className="h-8 w-40"/></div></RecordPageFooter>:null}</div></LoadingRegion>;
}
export function RecordJournalLoading(){
 const {t}=useTranslation();
 return <LoadingRegion><FieldGroup><FieldGroup className="gap-4 sm:max-w-xl sm:flex-row"><FieldSkeleton label={t('recordJournalChangeFilter')}/><FieldSkeleton label={t('field')}/></FieldGroup><div className="flex justify-end"><Skeleton className="h-7 w-40"/></div><Skeleton className="h-5 w-80 max-w-full"/><TablePlaceholder rows={10} dense={false} selectable headings={['',t('changedAt'),t('journalChangedBy'),t('journalFieldOrRelationship'),t('before'),t('after'),'']} columnClasses={['w-10','','hidden sm:table-cell','','hidden sm:table-cell','','w-10']}/></FieldGroup></LoadingRegion>;
}
export function ApiCredentialLoading(){
 const {t}=useTranslation();
 return <SettingsSection><FieldSet><FieldLegend>{t('apiAccess')}</FieldLegend><Skeleton className="h-12 w-full"/><div className="flex flex-wrap gap-2"><Skeleton className="h-8 w-44"/><Skeleton className="h-8 w-36"/><Skeleton className="h-8 w-28"/></div><Skeleton className="h-8 w-full sm:max-w-xs"/><TablePlaceholder rows={3} headings={[t('objectName'),t('tokenAccess'),t('tokenExpires'),t('tokenLastUsed'),t('tokenStatus'),'']} columnClasses={['','hidden sm:table-cell','hidden sm:table-cell','hidden sm:table-cell','hidden sm:table-cell','w-12 sm:w-24']}/></FieldSet></SettingsSection>;
}
export function RecycleBinLoading(){
 const {t}=useTranslation();
 return <><header className="flex flex-col gap-2 py-2"><h1 className="text-2xl font-semibold tracking-tight">{t('recycleBin')}</h1><p className="text-sm text-muted-foreground">{t('recycleBinHelp')}</p></header><LoadingRegion><div className="flex flex-col gap-4"><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-7 w-80 max-w-full"/><Skeleton className="h-7 w-64 max-w-full"/></div><TablePlaceholder rows={10} dense={false} selectable headings={['',t('keyword'),t('objectType'),t('recycledAt'),t('recycledBy'),'']} columnClasses={['w-10','','','','','w-10']}/></div></LoadingRegion></>;
}
export function RecordListLoading({title}:{title?:string}){
  return <><h1 className="py-2 text-2xl font-semibold tracking-tight">{title??<Skeleton className="h-8 w-48"/>}</h1><LoadingRegion><div className="flex flex-col gap-4"><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-7 w-80 max-w-full"/><Skeleton className="h-7 w-64 max-w-full"/></div><TablePlaceholder columns={8} rows={10} dense={false} selectable columnClasses={['w-10','','','','','','','w-10']}/></div></LoadingRegion></>;
}
export function WorkspaceLoading({children}:{children?:ReactNode}){
  const location=useLocation();
  const pathname=location.pathname==='/settings'&&typeof location.state?.backgroundPath==='string'?location.state.backgroundPath:location.pathname;
  const record=/^\/w\/[^/]+\/objects\/[^/]+\/([^/]+)/.exec(pathname);
  const content=children??(record?<RecordPageLoading isNew={record[1]==='new'}/>:pathname.includes('/objects/')?<RecordListLoading/>:<DashboardLoading/>);
  return <LoadingRegion><SidebarProvider><Sidebar collapsible="icon" variant="inset"><SidebarHeader><Skeleton className="h-12 w-full"/><Skeleton className="h-7 w-full"/></SidebarHeader><SidebarContent><SidebarGroup><Skeleton className="h-8 w-full"/></SidebarGroup><SidebarGroup><Skeleton className="mb-3 h-4 w-24"/><Loading variant="sidebar"/></SidebarGroup></SidebarContent><SidebarFooter><Skeleton className="h-12 w-full"/></SidebarFooter></Sidebar><SidebarInset className="min-w-0"><header className="flex h-16 items-center justify-between px-4"><Skeleton className="h-5 w-56 max-w-full"/><Skeleton className="h-9 w-32"/></header><div className="flex min-w-0 flex-col gap-4 p-4 pt-0">{content}</div></SidebarInset></SidebarProvider></LoadingRegion>;
}
function ActionSkeletons(){
  return <><Skeleton className="h-8 w-full sm:w-28"/><Skeleton className="h-8 w-full sm:w-40"/></>;
}
export function SettingsLoading({onClose}:{onClose:()=>void}){
  const {t}=useTranslation();
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={settingsDialogClassName}><DialogTitle className="sr-only">{t('settings')}</DialogTitle><DialogDescription className="sr-only">{t('settingsDescription')}</DialogDescription><div className="flex h-full min-h-0"><aside className="hidden w-64 shrink-0 flex-col gap-6 bg-sidebar p-4 md:flex"><Loading variant="sidebar"/><Loading variant="sidebar"/><Loading variant="sidebar"/></aside><div className="flex min-h-0 min-w-0 flex-1 flex-col"><LoadingRegion className="flex-1 overflow-hidden p-4"><div className="flex flex-col gap-6"><Skeleton className="h-8 w-64 max-w-full"/><SettingsSection><div className="flex items-center gap-4"><Skeleton className="size-12 rounded-full"/><Skeleton className="h-8 w-36"/></div><FieldSkeleton/></SettingsSection></div></LoadingRegion><DialogActions className="rounded-none bg-sidebar" onClose={onClose}><ActionSkeletons/></DialogActions></div></div></DialogContent></Dialog>;
}

export function ClassificationLoading({category,objectLabel,onClose}:{category:boolean;objectLabel:string;onClose:()=>void}){
  const {t}=useTranslation();
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={cn('bg-background text-foreground flex max-h-[85svh] flex-col overflow-hidden p-0',category?'sm:max-w-xl':'sm:max-w-4xl')}><DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t(category?'classificationCategory':'typesAndStatuses')}</DialogTitle><DialogDescription>{objectLabel} · {t('classificationDescription')}</DialogDescription></DialogHeader><LoadingRegion className="min-h-0 overflow-y-auto px-4 pb-4"><FieldGroup><Skeleton className="h-7 w-44"/>{category?<><SettingsSection><FieldSkeleton label={t('requiredField')}/><FieldSkeleton label={t('selectionMode')}/></SettingsSection><SettingsSection><Skeleton className="h-5 w-36"/>{Array.from({length:3},(_,index)=><Skeleton key={index} className="h-8 w-full"/>)}</SettingsSection><SettingsSection><FieldSkeleton label={t('defaultValue')}/></SettingsSection></>:<FieldGroup className="grid items-start gap-6 sm:grid-cols-2">{['classificationType','associatedStatuses'].map((key,index)=><SettingsSection key={key}><FieldSet className="min-w-0"><FieldLegend>{t(key)}</FieldLegend><FieldSkeleton label={t('requiredField')}/>{index===0?<FieldSkeleton label={t('statusTypeSelection')}/>:null}{Array.from({length:index===0?1:3},(_,row)=><Skeleton key={row} className="h-8 w-full"/>)}<FieldSkeleton label={t(index===0?'defaultType':'defaultStatus')}/></FieldSet></SettingsSection>)}</FieldGroup>}</FieldGroup></LoadingRegion><DialogActions onClose={onClose}><ActionSkeletons/></DialogActions></DialogContent></Dialog>;
}

export function AccountSecurityLoading({initialOnly=false}:{initialOnly?:boolean}){
  const {t}=useTranslation();
  return <LoadingRegion><FieldGroup>{!initialOnly?<SettingsSection><FieldSkeleton label={t('email')}/><Skeleton className="h-4 w-full"/><Skeleton className="h-7 w-52 max-w-full"/></SettingsSection>:null}<SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('changePassword')}</FieldLegend><FieldSkeleton label={t('currentPassword')}/><FieldSkeleton label={t('newPassword')}/><FieldSkeleton label={t('confirmPassword')}/><Skeleton className="h-5 w-80 max-w-full"/><div className="flex justify-end gap-2"><Skeleton className="h-8 w-28"/><Skeleton className="h-8 w-44"/></div></FieldSet></SettingsSection>{!initialOnly?<><SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('activeSessions')}</FieldLegend><Skeleton className="h-4 w-full"/><div className="flex flex-wrap justify-end gap-2"><Skeleton className="h-8 w-40"/><Skeleton className="h-8 w-48"/></div><TablePlaceholder headings={[t('sessionDevice'),t('sessionUpdated'),<span className="sr-only">{t('action')}</span>]} rows={2} columnClasses={['w-full sm:w-[45%]','hidden sm:table-cell sm:w-[30%]','hidden sm:table-cell sm:w-[25%]']}/></FieldSet></SettingsSection><ApiCredentialLoading/></>:null}</FieldGroup></LoadingRegion>;
}
