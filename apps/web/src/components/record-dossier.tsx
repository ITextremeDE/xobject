import {RecordIcon} from './record-icon';
import {useColumnPreferences} from '@/lib/column-preferences';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SearchIcon } from 'lucide-react';
import type { RecordRelationships } from '@xobject/contracts';
import { dossierRows, sortDossierRows, type DossierRow, type DossierSort } from '@/lib/dossier-presentation';
import { keyboardCommands } from '@/lib/keyboard';
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RecordDataTable, RecordTableToolbar, ColumnMenu, type RecordColumn } from './record-data-table';
import { useSettingsTable } from './settings-table';
export function RecordDossier({data,workspaceCode}:{data:RecordRelationships;recordId:string;workspaceCode:string}) {
  const {t,i18n}=useTranslation(),navigate=useNavigate();
  const [sort,setSort]=useState<DossierSort>({by:'keyword',direction:'asc'});
  const [objectTypeId,setObjectTypeId]=useState('all');
  const rows=dossierRows(data.dossier,i18n.language);
  const objects=[{value:'all',label:t('allObjectTypes')},...Array.from(new Map(rows.map(row=>[row.objectTypeId,{value:row.objectTypeId,label:row.object}])).values()).sort((a,b)=>a.label.localeCompare(b.label,i18n.language))];
  const table=useSettingsTable(sortDossierRows(rows.filter(row=>objectTypeId==='all'||row.objectTypeId===objectTypeId),sort,i18n.language),row=>`${row.relationship} ${row.object} ${row.keyword} ${row.type} ${row.status} ${row.category}`);
  const path=(row:DossierRow)=>`/w/${workspaceCode}/objects/${row.objectTechnicalName}/${row.recordId}`;
  const columns:RecordColumn<DossierRow>[]=[
    {key:'relationship',label:t('relationshipType'),cell:row=>row.relationship},
    {key:'object',label:t('objectSingular'),cell:row=>row.object},
    {key:'keyword',label:t('keyword'),required:true,cell:row=><Button type="button" variant="link" className="max-w-80 justify-start truncate px-0" nativeButton={false} render={<Link to={path(row)}/>}><RecordIcon iconKey={row.iconKey} objectLabel={row.object}/><span className="truncate">{row.keyword}</span></Button>},
    {key:'type',label:t('classificationType'),cell:row=>row.type},
    {key:'status',label:t('classificationStatus'),cell:row=>row.status},
    {key:'category',label:t('classificationCategory'),cell:row=>row.category},
  ];
  const {hidden,toggle}=useColumnPreferences(`dossier:${data.fields[0]?.definition.workspaceId??workspaceCode}`,columns);
  return <FieldGroup><FieldDescription>{t('dossierSavedRelationships')}</FieldDescription>
    <RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="dossier-search" className="sr-only">{t('dossierSearch')}</FieldLabel><InputGroup className="h-7"><InputGroupAddon><SearchIcon/></InputGroupAddon><InputGroupInput id="dossier-search" data-record-search type="search" aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t('dossierSearch')} value={table.search} maxLength={200} onChange={event=>table.onSearch(event.target.value)}/><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>}><Select items={objects} value={objectTypeId} onValueChange={value=>{if(value){setObjectTypeId(value);table.pagination.onPage(1);}}}><SelectTrigger size="sm" aria-label={t('objectFilter')} className="w-full sm:w-fit"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{objects.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle}/></RecordTableToolbar>
    <RecordDataTable rows={table.pagination.rows} columns={columns} hidden={hidden} total={table.pagination.total} page={table.pagination.page} pageSize={table.pagination.pageSize} sort={sort} onSort={by=>{setSort({by,direction:sort.by===by&&sort.direction==='asc'?'desc':'asc'});table.pagination.onPage(1);}} onPage={table.pagination.onPage} onPageSize={table.pagination.onPageSize} onOpen={row=>{void navigate(path(row));}} onObject={row=>{void navigate(`/w/${workspaceCode}/objects/${row.objectTechnicalName}`);}} getCopyId={row=>row.recordId} rowName={row=>row.keyword} ariaLabel={t('recordDossier')} labels={{empty:t(table.search||objectTypeId!=='all'?'noMatches':'noRelationships')}}/>
  </FieldGroup>;
}
