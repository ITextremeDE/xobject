import {DashboardSummaryLoading} from './loading';
import {useColumnPreferences} from '@/lib/column-preferences';
import { useDeferredValue, useEffect, useId, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { DatabaseIcon, FileTextIcon, PlusIcon, CalendarPlusIcon, PencilLineIcon, SearchIcon } from 'lucide-react';
import type { Workspace, ObjectSummary, WorkspaceRecord } from '@xobject/contracts';
import { api } from '@/lib/api';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate, formatRegionalNumber } from '@/lib/regional';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { keyboardCommands } from '@/lib/keyboard';
import { Field, FieldLabel } from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { RecordDataTable, RecordTableToolbar, ColumnMenu, type RecordColumn } from './record-data-table';
import { pageSizes } from './table-pagination';
import { ErrorNotice } from './feedback';

type Props = { canManage: boolean; canReadContent: boolean; workspace: Workspace; types: ObjectSummary[]; onOpen: (id: string, recordId?: string) => void; onCreate: () => void };
export function Dashboard({ canManage, canReadContent, workspace, types, onOpen, onCreate }: Props) {
  const { t } = useTranslation();
  if (!canReadContent) return <><h1 className="text-2xl font-semibold tracking-tight">{t('dashboard')}</h1><Empty><EmptyHeader><EmptyTitle>{t('dashboardObjects')}: {types.length}</EmptyTitle><EmptyDescription>{t('contentAccessPending')}</EmptyDescription></EmptyHeader>{types.map(type => <Button key={type.id} variant="outline" onClick={() => onOpen(type.id)}><DatabaseIcon data-icon="inline-start" />{type.label}</Button>)}{canManage ? <Button variant="outline" onClick={onCreate}><PlusIcon data-icon="inline-start" />{t('newObject')}</Button> : null}</Empty></>;
  return <DashboardContents key={workspace.id} workspace={workspace} types={types} onOpen={onOpen} />;
}
function DashboardContents({ workspace, types, onOpen }: Pick<Props, 'workspace' | 'types' | 'onOpen'>) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone();
  const gradientId = `activity-${useId().replace(/:/g, '')}`;
  const [days, setDays] = useState<7 | 30 | 90>(90);
  const [params, setParams] = useSearchParams();
  const sections = [...new Set([...types.slice(0, 2).map(type => type.id), ...(params.get('sections') ?? '').split(',').filter(id => types.some(type => type.id === id))])];
  const objectTypeId = types.some(type => type.id === params.get('object')) ? params.get('object')! : undefined;
  const query = (params.get('q') ?? '').slice(0, 200), deferredQuery = useDeferredValue(query);
  const pageSize = pageSizes.includes(Number(params.get('size')) as typeof pageSizes[number]) ? Number(params.get('size')) : 10;
  const pageValue = Number(params.get('page') ?? 1), page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= Math.floor(100000 / pageSize) + 1 ? pageValue : 1;
  function change(values: Record<string, string | null>, replace = false) { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value === null || value === '') next.delete(key); else next.set(key, value); } setParams(next, { replace }); }
  const sortable = ['business_number','keyword', 'objectLabel', 'type', 'status', 'category', 'created_at', 'updated_at', 'createdByName', 'updatedByName', 'version'] as const;
  const sortBy = sortable.find(key => key === params.get('sort')) ?? 'updated_at';
  const sort = { by: sortBy, direction: params.get('direction') === 'asc' ? 'asc' as const : 'desc' as const };
  const summary = useQuery({ queryKey: ['dashboard', workspace.id, days, timeZone], placeholderData: keepPreviousData, queryFn: () => api('get_workspace_dashboard', { workspaceId: workspace.id, days }) });
  const records = useQuery({ queryKey: ['workspace-records', workspace.id, objectTypeId, i18n.language, deferredQuery, sort, page, pageSize], placeholderData: keepPreviousData, queryFn: () => api('list_workspace_records', { workspaceId: workspace.id, objectTypeId, query: deferredQuery, sortBy, sortDirection: sort.direction, limit: pageSize, offset: (page - 1) * pageSize }) });
  useEffect(() => { if (records.data && !records.isPlaceholderData && page > 1 && (page - 1) * pageSize >= records.data.total) change({ page: String(Math.max(1, Math.ceil(records.data.total / pageSize))) }, true); }, [records.data, records.isPlaceholderData, page, pageSize]);
  const count = (value: number) => formatRegionalNumber(String(value), regional, 0);
  const columns: RecordColumn<WorkspaceRecord>[] = [
    { key: 'keyword', label: t('keyword'), required: true, cell: row => <Button variant="link" className="max-w-80 justify-start truncate px-0" render={<Link to={`/w/${workspace.code}/objects/${row.objectTechnicalName}/${row.id}`} state={{ recordOrigin: `/w/${workspace.code}?${params}` }} />} nativeButton={false}>{row.keyword || row.id}</Button> },
    {key:'business_number',label:t('businessNumber'),cell:row=>row.business_number??'—'},
    { key: 'objectLabel', label: t('objectType'), cell: row => row.objectLabel },
    ...(['type', 'status', 'category'] as const).map(key => ({ key, label: t(key === 'type' ? 'classificationType' : key === 'status' ? 'classificationStatus' : 'classificationCategory'), cell: (row: WorkspaceRecord) => row[key] ?? '—' })),
    { key: 'created_at', label: t('createdAt'), cell: row => formatRegionalDate(row.created_at, regional, timeZone) },
    { key: 'updated_at', label: t('updated'), cell: row => formatRegionalDate(row.updated_at, regional, timeZone) },
    { key: 'createdByName', label: t('createdBy'), cell: row => row.createdByName },
    { key: 'updatedByName', label: t('changedBy'), cell: row => row.updatedByName },
    { key: 'version', label: t('recordVersion'), cell: row => count(row.version) },
  ];
  const {hidden,toggle}=useColumnPreferences(`dashboard:${workspace.id}`,columns,['createdByName','updatedByName','version']);
  const activeSections = types.filter(type => sections.includes(type.id) || type.id === objectTypeId);
  const filters = [{ value: 'all', label: t('allRecords') }, ...activeSections.map(type => ({ value: type.id, label: type.label }))];
  return <div className="@container/main flex flex-col gap-6"><h1 className="sr-only">{t('dashboard')}</h1>
    {summary.isPending ? <DashboardSummaryLoading/> : summary.isError ? <ErrorNotice error={summary.error} retry={() => { void summary.refetch(); }} /> : <>
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card @xl/main:grid-cols-2 @5xl/main:grid-cols-4">{[
        { label: 'dashboardRecords', value: summary.data.total, help: 'dashboardRecordsHelp', summary: 'dashboardRecordsSummary', icon: FileTextIcon },
        { label: 'dashboardObjects', value: summary.data.objectTypes, help: 'dashboardObjectsHelp', summary: 'dashboardObjectsSummary', icon: DatabaseIcon },
        { label: 'dashboardCreated', value: summary.data.created30, help: 'dashboardCreatedHelp', summary: 'dashboardCreatedSummary', icon: CalendarPlusIcon },
        { label: 'dashboardUpdated', value: summary.data.updated7, help: 'dashboardUpdatedHelp', summary: 'dashboardUpdatedSummary', icon: PencilLineIcon },
      ].map(stat => <Card key={stat.label} className="@container/card"><CardHeader><CardDescription>{t(stat.label)}</CardDescription><CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{count(stat.value)}</CardTitle><CardAction><Badge variant="outline"><stat.icon />{t('liveData')}</Badge></CardAction></CardHeader><CardFooter className="flex-col items-start gap-1.5 text-sm"><div className="line-clamp-1 flex gap-2 font-medium">{t(stat.summary)}<stat.icon className="size-4" aria-hidden="true" /></div><div className="text-muted-foreground">{t(stat.help)}</div></CardFooter></Card>)}</div>
      <Card className="@container/card" aria-busy={summary.isFetching}>
        <CardHeader>
          <CardTitle>{t('recordActivity')}</CardTitle>
          <CardDescription><span className="hidden @[540px]/card:block">{t('recordActivityHelp', { timezone: summary.data.timeZone })}</span><span className="@[540px]/card:hidden">{t('lastDays', { count: days })} · {summary.data.timeZone}</span></CardDescription>
          <CardAction>
            <ToggleGroup multiple={false} value={[String(days)]} onValueChange={values => { const next = values[0]; if (next) setDays(Number(next) as 7 | 30 | 90); }} variant="outline" aria-label={t('chartPeriod')} className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex">
              {[90, 30, 7].map(value => <ToggleGroupItem key={value} value={String(value)}>{t('lastDays', { count: value })}</ToggleGroupItem>)}
            </ToggleGroup>
            <Select items={[90, 30, 7].map(value => ({ value: String(value), label: t('lastDays', { count: value }) }))} value={String(days)} onValueChange={value => { if (value) setDays(Number(value) as 7 | 30 | 90); }}>
              <SelectTrigger size="sm" aria-label={t('chartPeriod')} className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl"><SelectGroup>{[90, 30, 7].map(value => <SelectItem key={value} value={String(value)} className="rounded-lg">{t('lastDays', { count: value })}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          <ChartContainer config={{ created: { label: t('activityCreated'), color: 'var(--chart-1)' }, updated: { label: t('activityUpdated'), color: 'var(--chart-2)' } }} className="aspect-auto h-[250px] w-full">
            <AreaChart accessibilityLayer data={summary.data.activity}>
              <defs>
                <linearGradient id={`${gradientId}-created`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-created)" stopOpacity={1} /><stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.1} /></linearGradient>
                <linearGradient id={`${gradientId}-updated`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-updated)" stopOpacity={0.8} /><stop offset="95%" stopColor="var(--color-updated)" stopOpacity={0.1} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={value => formatRegionalDate(String(value), regional, 'UTC', false, true)} />
              <ChartTooltip cursor={false} content={({ active, payload, label }) => <ChartTooltipContent active={active} label={label} indicator="dot" payload={payload?.map(item => ({ ...item, value: typeof item.value === 'number' ? count(item.value) : item.value }))} labelFormatter={value => formatRegionalDate(String(value), regional, 'UTC', false, true)} />} />
              {/* Counts must not curve below zero or sum overlapping creations/edits. */}
              <Area dataKey="created" type="monotone" fill={`url(#${gradientId}-created)`} stroke="var(--color-created)" isAnimationActive={false} />
              <Area dataKey="updated" type="monotone" fill={`url(#${gradientId}-updated)`} stroke="var(--color-updated)" isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </>}
    <div className="flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><Tabs value={objectTypeId ?? 'all'} onValueChange={value => change({ object: value === 'all' ? null : String(value), page: null })} className="hidden min-w-0 overflow-x-auto overflow-y-hidden @4xl/main:flex"><TabsList>{filters.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList></Tabs><Select items={filters} value={objectTypeId ?? 'all'} onValueChange={value => { if (value) change({ object: value === 'all' ? null : value, page: null }); }}><SelectTrigger size="sm" aria-label={t('objectFilter')} className="w-fit @4xl/main:hidden"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{filters.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      <RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="dashboard-record-search" className="sr-only">{t('search')}</FieldLabel><InputGroup className="h-7"><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput className="h-full py-0" data-record-search id="dashboard-record-search" aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t('search')} value={query} onChange={event => change({ q: event.target.value, page: null }, true)} /><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>}><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle} /><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={activeSections.length === types.length} />}><PlusIcon data-icon="inline-start" />{t('addSection')}</DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{types.filter(type => !activeSections.some(item => item.id === type.id)).map(type => <DropdownMenuItem key={type.id} onClick={() => { change({ sections: [...sections, type.id].join(','), object: type.id, page: null }); }}>{type.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></RecordTableToolbar>
      {records.isError ? <ErrorNotice error={records.error} retry={() => { void records.refetch(); }} /> : <RecordDataTable loading={records.isPending} rows={records.data?.records??[]} columns={columns} hidden={hidden} total={records.data?.total??0} page={page} pageSize={pageSize} sort={sort} disabled={records.isFetching} onSort={key => change({ sort: key, direction: sort.by === key && sort.direction === 'asc' ? 'desc' : 'asc', page: null })} onPage={page => change({ page: page === 1 ? null : String(page) })} onPageSize={size => change({ size: String(size), page: null })} onOpen={row => onOpen(row.objectTypeId, row.id)} onObject={row => onOpen(row.objectTypeId)} labels={{empty:t(query||objectTypeId?'noMatches':'noRecords')}} />}
    </div>
  </div>;
}
