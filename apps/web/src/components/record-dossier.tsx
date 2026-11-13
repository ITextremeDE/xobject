import {useEffect,useState as usePageState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
import {ErrorNotice} from './feedback';
import {TruncatedText} from './truncated-text';
import {RecordIcon} from './record-icon';
import {useColumnPreferences} from '@/lib/column-preferences';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SearchIcon } from 'lucide-react';
import type { RecordRelationships } from '@xobject/contracts';
import { dossierRows, type DossierRow, type DossierSort } from '@/lib/dossier-presentation';
import { keyboardCommands } from '@/lib/keyboard';
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RecordDataTable, RecordTableToolbar, ColumnMenu, type RecordColumn } from './record-data-table';
export function RecordDossier({data,workspaceCode,recordId,objectTypeId}:{data:RecordRelationships;objectTypeId:string;recordId:string;workspaceCode:string}) {
  const {t,i18n}=useTranslation(),navigate=useNavigate();
  const [sort,setSort]=useState<DossierSort>({by:'keyword',direction:'asc'});
  const [filterObject,setObjectTypeId]=useState('all');
  const [page,setPage]=usePageState(1),[pageSize,setPageSize]=usePageState(10),[search,setSearch]=usePageState('');
  const query=useQuery({queryKey:['relationship-page','dossier',objectTypeId,recordId,filterObject,search,sort,page,pageSize],queryFn:()=>api('get_record_relationship_page',{objectTypeId,recordId,query:search,sortBy:sort.by as import('@xobject/contracts').Inputs['get_record_relationship_page']['sortBy'],sortDirection:sort.direction,targetObjectTypeId:filterObject==='all'?undefined:filterObject,offset:(page-1)*pageSize,limit:pageSize})});
  const rows=dossierRows(query.data?.entries??[],i18n.language);
  const objects=[{value:'all',label:t('allObjectTypes')},...(query.data?.objects??[]).map(object=>({value:object.id,label:object.label}))];
  useEffect(()=>{if(query.data)setPage(current=>Math.min(current,Math.max(1,Math.ceil(query.data.total/pageSize))));},[query.data,pageSize]);
  const table={search,onSearch:(value:string)=>{setSearch(value);setPage(1);},pagination:{rows,total:query.data?.total??0,page,pageSize,onPage:setPage,onPageSize:(size:number)=>{setPageSize(size);setPage(1);}}};
  const path=(row:DossierRow)=>`/w/${workspaceCode}/objects/${row.objectTechnicalName}/${row.recordId}`;
  const columns:RecordColumn<DossierRow>[]=[
    {key:'relationship',label:t('relationshipType'),cell:row=>row.relationship},
    {key:'object',label:t('objectSingular'),cell:row=>row.object},
    {key:'keyword',label:t('keyword'),required:true,cell:row=><Button type="button" variant="link" className="max-w-80 justify-start truncate px-0" nativeButton={false} render={<Link to={path(row)}/>}><RecordIcon iconKey={row.iconKey} objectLabel={row.object}/><TruncatedText>{row.keyword}</TruncatedText></Button>},
    ...(rows.some(row=>row.contactPerson)?(['jobTitle','department','function'] as const).map((key,index)=>({key,label:t(['contactPersonJobTitle','contactPersonDepartment','contactPersonFunction'][index]),cell:(row:DossierRow)=>row[key]||'—'})):[]),
    {key:'type',label:t('classificationType'),cell:row=>row.type},
    {key:'status',label:t('classificationStatus'),cell:row=>row.status},
    {key:'category',label:t('classificationCategory'),cell:row=>row.category},
  ];
  const {hidden,toggle}=useColumnPreferences(`dossier:${data.fields[0]?.definition.workspaceId??workspaceCode}`,columns);
  return <FieldGroup><FieldDescription>{t('dossierSavedRelationships')}</FieldDescription>
    <RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="dossier-search" className="sr-only">{t('dossierSearch')}</FieldLabel><InputGroup className="h-7"><InputGroupAddon><SearchIcon/></InputGroupAddon><InputGroupInput id="dossier-search" data-record-search type="search" aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t('dossierSearch')} value={table.search} maxLength={200} onChange={event=>table.onSearch(event.target.value)}/><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>}><Select items={objects} value={filterObject} onValueChange={value=>{if(value){setObjectTypeId(value);table.pagination.onPage(1);}}}><SelectTrigger size="sm" aria-label={t('objectFilter')} className="w-full sm:w-fit"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{objects.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle}/></RecordTableToolbar>
    {query.isError?<ErrorNotice error={query.error} retry={()=>{void query.refetch();}}/>:null}
    <RecordDataTable loading={query.isPending} recordTarget={row=>({objectTypeId:row.objectTypeId,recordId:row.recordId,workspaceCode})} rows={table.pagination.rows} columns={columns} hidden={hidden} total={table.pagination.total} page={table.pagination.page} pageSize={table.pagination.pageSize} sort={sort} onSort={by=>{setSort({by,direction:sort.by===by&&sort.direction==='asc'?'desc':'asc'});table.pagination.onPage(1);}} onPage={table.pagination.onPage} onPageSize={table.pagination.onPageSize} onOpen={row=>{void navigate(path(row));}} onObject={row=>{void navigate(`/w/${workspaceCode}/objects/${row.objectTechnicalName}`);}} getCopyId={row=>row.recordId} rowName={row=>row.keyword} ariaLabel={t('recordDossier')} labels={{empty:t(table.search||filterObject!=='all'?'noMatches':'noRelationships')}}/>
  </FieldGroup>;
}
