import {ClassificationFiltersBar} from './classification-filters';
import {readClassificationFilters,classificationFilterQuery} from '@/lib/classification-filters';
import {RecordIcon} from './record-icon';
import {contactKindLabel} from '@/lib/contact-kind';
import {contactKindOrder} from '@xobject/contracts';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './ui/dropdown-menu';
import {useColumnPreferences} from '@/lib/column-preferences';
import { useDeferredValue, useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PlusIcon, SearchIcon, ChevronDownIcon } from 'lucide-react';
import { isCustomFieldKind, type ObjectDefinition, type DataRecord } from '@xobject/contracts';
import { api } from '@/lib/api';
import { useTimeZone } from '@/lib/time-zone-context';
import { useRegional } from '@/lib/regional-context';
import { formatRegionalDate } from '@/lib/regional';
import { keyboardCommands } from '@/lib/keyboard';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { displayClassification } from './classification-values';
import { displayFieldValue } from './custom-field-control';
import { RecordDataTable, RecordTableToolbar, ColumnMenu, type RecordColumn } from './record-data-table';
import { pageSizes } from './table-pagination';
import { ErrorNotice } from './feedback';
export function RecordList({ definition, selectedRecord, basePath, disabled }: { definition: ObjectDefinition; selectedRecord: string | null; basePath: string; disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').slice(0, 200);
  const pageSize = pageSizes.includes(Number(params.get('size')) as typeof pageSizes[number]) ? Number(params.get('size')) : 25;
  const pageValue = Number(params.get('page') ?? 1), page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= Math.floor(100000 / pageSize) + 1 ? pageValue : 1;
  const offset = (page - 1) * pageSize;
  const timeZone = useTimeZone(), regional = useRegional();
  const activeFields = definition.fields.filter(field => field.fieldPermissions?.read!==false&&(!field.state || field.state === 'active'));
  const allowed = ['id', 'created_at', 'updated_at', ...activeFields.filter(field => field.technicalName !== 'access_principals').map(field => field.technicalName)];
  const sort = { by: allowed.includes(params.get('sort') ?? '') ? params.get('sort')! : 'updated_at', direction: params.get('direction') === 'asc' ? 'asc' as const : 'desc' as const };
  function change(values: Record<string, string | null>, replace = false) { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value === null || value === '') next.delete(key); else next.set(key, value); } setParams(next, { replace }); }
  useEffect(() => { if (params.has('sort') && !allowed.includes(params.get('sort')!)) change({sort:null,direction:null,page:null}, true); }, [params, definition]);
  const contactKindId=Object.values(definition.contactProfile?.kinds??{}).includes(params.get('kind')??'')?params.get('kind')!:undefined;
  const contactKindKey=contactKindId?contactKindOrder.find(key=>definition.contactProfile?.kinds[key]===contactKindId):undefined;
  useEffect(()=>{if(params.has('kind')&&!contactKindId)change({kind:null,nav:null,page:null},true);},[params,contactKindId]);
  const classifications = (['type', 'status', 'category'] as const).filter(kind => activeFields.some(field => field.technicalName === kind));
  const classificationFilters=readClassificationFilters(params,definition.classification,classifications);
  const filterQuery=classificationFilterQuery(classificationFilters),filterKey=JSON.stringify(filterQuery);
  useEffect(()=>{if(Object.entries(filterQuery).some(([key,value])=>(params.get(key)||null)!==value))change({...filterQuery,page:null},true);},[filterKey,params]);
  const query = useDeferredValue(search);
  const result = useQuery({ queryKey: ['records', definition.id, i18n.language, query, offset, pageSize, sort,contactKindId,classificationFilters], placeholderData: keepPreviousData, queryFn: () => api('list_records', { objectTypeId: definition.id,contactKindId,classificationFilters, query, limit: pageSize, offset, sortBy: sort.by, sortDirection: sort.direction }) });
  useEffect(() => { if (result.data && !result.isPlaceholderData && page > 1 && offset >= result.data.total) change({ page: String(Math.max(1, Math.ceil(result.data.total / pageSize))) }, true); }, [result.data, result.isPlaceholderData, page, pageSize]);
  const fields = activeFields.filter(f => isCustomFieldKind(f.kind) && !['keyword','record_number'].includes(f.technicalName));
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }), enabled: fields.some(field => field.kind === 'reference') });
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');

  const columns: RecordColumn<DataRecord>[] = [
    { key: hasKeyword ? 'keyword' : 'id', label: t(hasKeyword ? 'keyword' : 'recordIdentity'), required: true, cell: row => <Button variant="link" className="max-w-80 justify-start truncate px-0" render={<Link to={`${basePath}/${row.id}?${params}`} state={{ recordOrigin: `${basePath}?${params}` }} />} nativeButton={false} disabled={disabled}><RecordIcon iconKey={row.iconKey} objectLabel={definition.label}/><span className="truncate">{row.keyword || row.id}</span></Button> },
    ...activeFields.filter(field=>field.technicalName==='record_number').map(field=>({key:field.technicalName,label:field.label,cell:(row:DataRecord)=>String(row.record_number??'—')})),
    ...classifications.map(kind => ({ key: kind, label: t(kind === 'type' ? 'classificationType' : kind === 'status' ? 'classificationStatus' : 'classificationCategory'), cell: (row: DataRecord) => displayClassification(definition.classification, kind, row[kind]) })),
    { key: 'created_at', label: t('createdAt'), cell: row => formatRegionalDate(row.created_at, regional, timeZone) },
    { key: 'updated_at', label: t('updated'), cell: row => formatRegionalDate(row.updated_at, regional, timeZone) },
    ...fields.map(field => ({ key: field.technicalName, label: field.label, sortable: field.kind!=='structured'&&field.technicalName !== 'access_principals', cell: (row: DataRecord) => field.technicalName === 'access_principals' && Array.isArray(row.access_principals) && !row.access_principals.length ? t('workspacePublic') : displayFieldValue(field, row[field.technicalName], i18n.language, t, principals.data, timeZone, regional) })),
  ];
  const {hidden,toggle}=useColumnPreferences(`objects:${definition.workspaceId}:${definition.id}`,columns,fields.map(field=>field.technicalName));
  const inactive = Boolean(definition.state && definition.state !== 'active');
  const readOnly = definition.permissions?.create !== true || inactive;
  return <>{inactive ? <p className="text-muted-foreground">{t('inactiveObjectHelp')}</p> : null}<h1 className="py-2 text-2xl font-semibold tracking-tight">{definition.label}{contactKindKey?` · ${t(`navigationKind_${contactKindKey}`)}`:''}</h1>
    <RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="record-search" className="sr-only">{t(hasKeyword ? 'search' : activeFields.some(field=>field.technicalName==='record_number')?'searchByIdOrNumber':'searchById')}</FieldLabel><InputGroup className="h-7"><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput className="h-full py-0" data-record-search id="record-search" aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t(hasKeyword ? 'search' : activeFields.some(field=>field.technicalName==='record_number')?'searchByIdOrNumber':'searchById')} value={search} maxLength={200} onChange={event => change({ q: event.target.value, page: null }, true)} /><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>}><ColumnMenu columns={columns} hidden={hidden} disabled={disabled} onToggle={toggle} />{!readOnly ? definition.contactProfile?<DropdownMenu><DropdownMenuTrigger render={<Button size="sm" data-record-create disabled={disabled}/> }><PlusIcon data-icon="inline-start"/>{t('newRecord')}<ChevronDownIcon data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{contactKindOrder.map(kind=><DropdownMenuItem key={kind} onClick={()=>{const next=new URLSearchParams(params);next.set('contactKind',definition.contactProfile!.kinds[kind]);void navigate(`${basePath}/new?${next}`,{state:{recordOrigin:`${basePath}?${params}`}});}}>{contactKindLabel(definition,kind,i18n.language,t(`contactKind_${kind}`))}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>:<Button size="sm" render={<Link data-record-create to={`${basePath}/new?${params}`} state={{ recordOrigin: `${basePath}?${params}` }} />} nativeButton={false} disabled={disabled}><PlusIcon data-icon="inline-start" />{t('newRecord')}</Button> : null}</RecordTableToolbar>
    {classifications.length?<ClassificationFiltersBar config={definition.classification} available={classifications} value={classificationFilters} disabled={disabled} onChange={filters=>change({...classificationFilterQuery(filters),page:null})}/>:null}
    {result.isError ? <ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /> : <RecordDataTable recordTarget={row=>({objectTypeId:definition.id,recordId:row.id,workspaceCode:basePath.split('/')[2]})} loading={result.isPending} rows={result.data?.records??[]} columns={columns} hidden={hidden} total={result.data?.total??0} page={page} pageSize={pageSize} sort={sort} disabled={disabled || result.isFetching} selectedRecord={selectedRecord} labels={{empty:t(search||Object.keys(classificationFilters).length?'noMatches':'noRecords')}} emptyAction={search?<Button type="button" variant="outline" size="sm" onClick={()=>change({q:null,page:null},true)}>{t('clearSearch')}</Button>:undefined} onSort={key => change({ sort: key, direction: sort.by === key && sort.direction === 'asc' ? 'desc' : 'asc', page: null })} onPage={page => change({ page: page === 1 ? null : String(page) })} onPageSize={size => change({ size: String(size), page: null })} onOpen={row => { if (row.id !== selectedRecord) void navigate(`${basePath}/${row.id}?${params}`, { state: { recordOrigin: `${basePath}?${params}` } }); }} />}</>;
}
