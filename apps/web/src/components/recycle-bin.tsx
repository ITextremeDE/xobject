import {DeletedRecords} from './deleted-records';
import {RecordIcon} from './record-icon';
import {RecordPreview} from './record-preview';
import {DialogActions} from './dialog-actions';
import {useDeferredValue,useEffect,useState} from 'react';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router';
import {useTranslation} from 'react-i18next';
import {SearchIcon} from 'lucide-react';
import type {AuthUser,RecycledRecord} from '@xobject/contracts';
import {api} from '@/lib/api';
import {useColumnPreferences} from '@/lib/column-preferences';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {formatRegionalDate} from '@/lib/regional';
import {keyboardCommands} from '@/lib/keyboard';
import {Button} from '@/components/ui/button';
import {Field,FieldLabel} from '@/components/ui/field';
import {InputGroup,InputGroupInput,InputGroupAddon} from '@/components/ui/input-group';
import {Kbd} from '@/components/ui/kbd';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {RecordDataTable,RecordTableToolbar,ColumnMenu,type RecordColumn} from './record-data-table';
import {pageSizes} from './table-pagination';
import {ErrorNotice,Loading} from './feedback';
import {RecordLifecycleAction} from './record-lifecycle-action';
import {Journal} from './record-journal';
export function RecycleBin({workspace,user,types,onBusyChange}:{workspace:{id:string;name:string};user:AuthUser;types:{id:string;label:string}[];onBusyChange:(busy:boolean)=>void}){
 const {t,i18n}=useTranslation(),regional=useRegional(),zone=useTimeZone(),[params,setParams]=useSearchParams(),[selected,setSelected]=useState<RecycledRecord|null>(null);
 const search=(params.get('q')??'').slice(0,200),query=useDeferredValue(search),object=params.get('object')??'all';
 const size=Number(params.get('size')??25),pageSize=pageSizes.includes(size as typeof pageSizes[number])?size:25;
 const candidate=Number(params.get('page')??1),page=Number.isInteger(candidate)&&candidate>0&&candidate<=Math.floor(100000/pageSize)+1?candidate:1;
 const sort={by:['business_number','keyword','objectLabel','recycled_at'].includes(params.get('sort')??'')?params.get('sort')!:'recycled_at',direction:params.get('direction')==='asc'?'asc' as const:'desc' as const};
 function change(values:Record<string,string|null>,replace=false){const next=new URLSearchParams(params);for(const [key,value] of Object.entries(values))if(value===null)next.delete(key);else next.set(key,value);setParams(next,{replace});}
 const result=useQuery({queryKey:['recycled-records',workspace.id,i18n.language,query,object,page,pageSize,sort],placeholderData:keepPreviousData,queryFn:()=>api('list_recycled_records',{workspaceId:workspace.id,objectTypeId:object==='all'?undefined:object,query,sortBy:sort.by as 'business_number'|'keyword'|'objectLabel'|'recycled_at',sortDirection:sort.direction,limit:pageSize,offset:(page-1)*pageSize})});
 useEffect(()=>{if(result.data&&!result.isPlaceholderData&&page>1&&(page-1)*pageSize>=result.data.total)change({page:String(Math.max(1,Math.ceil(result.data.total/pageSize)))},true);},[result.data,result.isPlaceholderData,page,pageSize]);
 const columns:RecordColumn<RecycledRecord>[]=[{key:'keyword',label:t('keyword'),required:true,cell:row=><Button type="button" variant="link" className="max-w-80 justify-start truncate px-0" onClick={()=>setSelected(row)}><RecordIcon iconKey={row.iconKey} objectLabel={row.objectLabel}/><span className="truncate">{row.keyword||row.id}</span></Button>},{key:'business_number',label:t('businessNumber'),cell:row=>row.business_number??'—'},{key:'objectLabel',label:t('objectType'),cell:row=>row.objectLabel},{key:'recycled_at',label:t('recycledAt'),cell:row=>formatRegionalDate(row.recycled_at,regional,zone)},{key:'recycledByName',label:t('recycledBy'),sortable:false,cell:row=>row.recycledByName}];
 const {hidden,toggle}=useColumnPreferences(`recycle-bin:${workspace.id}`,columns,[]);
 const items=[{value:'all',label:t('allObjectTypes')},...types.map(type=>({value:type.id,label:type.label}))];
 return <><header className="flex flex-col gap-2 py-2"><h1 className="text-2xl font-semibold tracking-tight">{t('recycleBin')}</h1><p className="text-sm text-muted-foreground">{t('recycleBinHelp')}</p></header><RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="recycle-search" className="sr-only">{t('search')}</FieldLabel><InputGroup className="h-7"><InputGroupAddon><SearchIcon/></InputGroupAddon><InputGroupInput id="recycle-search" data-record-search aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t('search')} maxLength={200} value={search} onChange={e=>change({q:e.target.value,page:null},true)}/><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>}><Select items={items} value={object} onValueChange={value=>{if(value)change({object:value==='all'?null:value,page:null});}}><SelectTrigger aria-label={t('objectType')}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle}/></RecordTableToolbar>{result.isError?<ErrorNotice error={result.error} retry={()=>{void result.refetch();}}/>:<RecordDataTable rows={result.data?.records??[]} columns={columns} hidden={hidden} total={result.data?.total??0} page={page} pageSize={pageSize} sort={sort} loading={result.isPending} disabled={result.isFetching} onOpen={setSelected} rowName={row=>row.keyword||row.id} emptyAction={search||object!=='all'?<Button type="button" variant="outline" size="sm" onClick={()=>change({q:null,object:null,page:null},true)}>{t('clearSearch')}</Button>:undefined} onSort={key=>change({sort:key,direction:sort.by===key&&sort.direction==='asc'?'desc':'asc',page:null})} onPage={value=>change({page:value===1?null:String(value)})} onPageSize={value=>change({size:String(value),page:null})} labels={{empty:t(search?'noMatches':'recycleBinEmpty'),open:t('details')}}/>}{selected?<RecycledDetails key={selected.id} row={selected} user={user} workspaceName={workspace.name} onBusyChange={onBusyChange} onClose={()=>setSelected(null)}/>:null}{user.isAdmin?<DeletedRecords workspaceId={workspace.id} workspaceName={workspace.name}/>:null}</>;
}
function RecycledDetails({row,user,workspaceName,onClose,onBusyChange}:{row:RecycledRecord;user:AuthUser;workspaceName:string;onClose:()=>void;onBusyChange:(busy:boolean)=>void}){
 const {t,i18n}=useTranslation(),[busy,setBusy]=useState(false);
 function busyChange(value:boolean){setBusy(value);onBusyChange(value);}
 const record=useQuery({queryKey:['recycled-record',row.objectTypeId,row.id],queryFn:()=>api('get_recycled_record',{objectTypeId:row.objectTypeId,recordId:row.id})});
 const definition=useQuery({queryKey:['definition',row.objectTypeId,i18n.language],queryFn:()=>api('get_object_type',{objectTypeId:row.objectTypeId})});
 const principals=useQuery({queryKey:['field-principals',definition.data?.workspaceId],queryFn:()=>api('list_field_principals',{workspaceId:definition.data!.workspaceId}),enabled:Boolean(definition.data)});
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-4xl" closeButtonDisabled={busy}><DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{row.keyword||row.id}</DialogTitle><DialogDescription>{t('recycledRecordHelp',{object:row.objectLabel})}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto px-4 pb-4">{record.isError||definition.isError?<ErrorNotice error={record.error??definition.error}/>:record.isPending||definition.isPending?<Loading/>:<Tabs defaultValue="details" className="gap-4"><TabsList variant="line"><TabsTrigger value="details">{t('details')}</TabsTrigger><TabsTrigger value="journal">{t('journal')}</TabsTrigger></TabsList><TabsContent value="details"><RecordPreview definition={definition.data} record={record.data} principals={principals.data}/></TabsContent><TabsContent value="journal"><Journal includeRecycled definition={definition.data} recordId={row.id} record={record.data} workspaceName={workspaceName} user={user}/></TabsContent></Tabs>}</div><DialogActions disabled={busy} onClose={onClose}>{record.data?.permissions?.full?<><RecordLifecycleAction permanent disabled={busy} objectTypeId={row.objectTypeId} recordId={row.id} version={record.data.version} name={row.keyword||row.id} onBusyChange={busyChange} onDone={onClose}/>{definition.data?.state==='active'?<RecordLifecycleAction restore disabled={busy} objectTypeId={row.objectTypeId} recordId={row.id} version={record.data.version} name={row.keyword||row.id} onBusyChange={busyChange} onDone={onClose}/>:null}</>:record.isSuccess&&definition.isSuccess?<p className="text-sm text-muted-foreground">{t('restoreFullRequired')}</p>:null}</DialogActions></DialogContent></Dialog>;
}
