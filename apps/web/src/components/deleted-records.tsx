import {useDeferredValue,useEffect,useState} from 'react';
import {useQuery,keepPreviousData} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import type {DeletedRecord,Inputs} from '@xobject/contracts';
import {api} from '@/lib/api';
import {useColumnPreferences} from '@/lib/column-preferences';
import {Button} from '@/components/ui/button';
import {InputGroup,InputGroupInput,InputGroupAddon} from '@/components/ui/input-group';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {ChevronDownIcon,SearchIcon} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {RecordDataTable,RecordTableToolbar,ColumnMenu,type RecordColumn} from './record-data-table';
import {Journal} from './record-journal';
import {DialogActions} from './dialog-actions';
import {RecordJournalLoading} from './loading';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {formatRegionalDate} from '@/lib/regional';
import {Field,FieldLabel,FieldDescription,FieldGroup} from '@/components/ui/field';
import {ErrorNotice} from './feedback';
export function DeletedRecords({workspaceId,workspaceName}:{workspaceId:string;workspaceName:string}){
 const {t,i18n}=useTranslation(),regional=useRegional(),zone=useTimeZone();
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[size,setSize]=useState(25),[selected,setSelected]=useState<DeletedRecord|null>(null),[search,setSearch]=useState(''),[object,setObject]=useState('all');
 const [sort,setSort]=useState<{by:NonNullable<Inputs['list_deleted_records']['sortBy']>;direction:'asc'|'desc'}>({by:'deletedAt',direction:'desc'}),query=useDeferredValue(search);
 const types=useQuery({queryKey:['deleted-object-types',workspaceId,i18n.language],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true,includeDeleted:true}),enabled:open});
 const result=useQuery({queryKey:['deleted-records',workspaceId,i18n.language,query,object,sort,page,size],queryFn:()=>api('list_deleted_records',{workspaceId,query,objectTypeId:object==='all'?undefined:object,sortBy:sort.by,sortDirection:sort.direction,offset:(page-1)*size,limit:size}),enabled:open,placeholderData:keepPreviousData});
 useEffect(()=>{if(result.data&&!result.isPlaceholderData&&page>1&&(page-1)*size>=result.data.total)setPage(Math.max(1,Math.ceil(result.data.total/size)));},[result.data,result.isPlaceholderData,page,size]);
 const columns:RecordColumn<DeletedRecord>[]=[{key:'keyword',label:t('keyword'),required:true,cell:row=><Button type="button" variant="link" className="max-w-64 justify-start truncate px-0" onClick={()=>setSelected(row)}><span className="truncate">{row.keyword||row.id}</span></Button>},{key:'objectLabel',label:t('objectType'),cell:row=>row.objectLabel},{key:'deletedAt',label:t('deletedAt'),cell:row=>formatRegionalDate(row.deletedAt,regional,zone,true)},{key:'deletedByName',label:t('deletedBy'),cell:row=>row.deletedByName}];
 const {hidden,toggle}=useColumnPreferences(`deleted-records:${workspaceId}`,columns,[]);
 const objects=[{value:'all',label:t('allObjectTypes')},...(types.data??[]).map(type=>({value:type.id,label:type.label})).sort((a,b)=>a.label.localeCompare(b.label,i18n.language))];
 const filters=<FieldGroup className="gap-4 sm:flex-row"><Field className="sm:max-w-xs"><FieldLabel htmlFor="deleted-record-search">{t('deletedRecordSearch')}</FieldLabel><InputGroup><InputGroupInput id="deleted-record-search" maxLength={200} value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/><InputGroupAddon><SearchIcon/></InputGroupAddon></InputGroup></Field><Field className="sm:max-w-xs"><FieldLabel htmlFor="deleted-object-filter">{t('objectType')}</FieldLabel><Select items={objects} value={object} disabled={types.isPending||types.isError} onValueChange={value=>{if(value){setObject(value);setPage(1);}}}><SelectTrigger id="deleted-object-filter" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{objects.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup>;
 return <Collapsible open={open} onOpenChange={setOpen} className="min-w-0"><CollapsibleTrigger className="group/deleted" render={<Button type="button" variant="outline"/>}>{t('deletedRecordsHistory')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/deleted:rotate-180"/></CollapsibleTrigger><CollapsibleContent><FieldGroup className="pt-4"><FieldDescription>{t('deletedRecordsHistoryHelp')}</FieldDescription><RecordTableToolbar search={filters} alignEnd><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle}/></RecordTableToolbar>{types.isError?<ErrorNotice error={types.error} retry={()=>{void types.refetch();}}/>:null}{result.isError?<ErrorNotice error={result.error} retry={()=>{void result.refetch();}}/>:<RecordDataTable rows={result.data?.records??[]} columns={columns} hidden={hidden} total={result.data?.total??0} page={page} pageSize={size} sort={sort} loading={result.isPending} disabled={result.isFetching} onOpen={setSelected} rowName={row=>row.keyword||row.id} onSort={by=>{setSort(previous=>({by:by as typeof previous.by,direction:previous.by===by&&previous.direction==='asc'?'desc':'asc'}));setPage(1);}} onPage={setPage} onPageSize={value=>{setSize(value);setPage(1);}} labels={{empty:t(search||object!=='all'?'settingsNoMatches':'noDeletedRecords'),open:t('journal')}}/>}</FieldGroup></CollapsibleContent>{selected?<DeletedHistory row={selected} workspaceName={workspaceName} onClose={()=>setSelected(null)}/>:null}</Collapsible>;
}
function DeletedHistory({row,workspaceName,onClose}:{row:DeletedRecord;workspaceName:string;onClose:()=>void}){
 const {t,i18n}=useTranslation();
 const definition=useQuery({queryKey:['definition',row.objectTypeId,'deleted-history',i18n.language],queryFn:()=>api('get_object_type',{objectTypeId:row.objectTypeId})});
 return <Dialog open onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-4xl"><DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('deletedRecordJournal',{object:row.objectLabel})}</DialogTitle><DialogDescription>{t('deletedRecordJournalHelp',{name:row.keyword||row.id,id:row.id})}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto px-4 pb-4">{definition.isPending?<RecordJournalLoading/>:definition.isError?<ErrorNotice error={definition.error} retry={()=>{void definition.refetch();}}/>:<Journal definition={definition.data} recordId={row.id} record={{id:row.id,keyword:row.keyword}} workspaceName={workspaceName} includeDeleted/>}</div><DialogActions onClose={onClose}/></DialogContent></Dialog>;
}
