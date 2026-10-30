import { useDeferredValue, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PlusIcon, SearchIcon } from 'lucide-react';
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
import { RecordDataTable, ColumnMenu, type RecordColumn } from './record-data-table';
import { pageSizes } from './table-pagination';
import { ErrorNotice, Loading } from './feedback';
export function RecordList({ definition, selectedRecord, basePath, disabled }: { definition: ObjectDefinition; selectedRecord: string | null; basePath: string; disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [hidden, setHidden] = useState(new Set<string>());
  const search = (params.get('q') ?? '').slice(0, 200);
  const pageSize = pageSizes.includes(Number(params.get('size')) as typeof pageSizes[number]) ? Number(params.get('size')) : 25;
  const pageValue = Number(params.get('page') ?? 1), page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= Math.floor(100000 / pageSize) + 1 ? pageValue : 1;
  const offset = (page - 1) * pageSize;
  const timeZone = useTimeZone(), regional = useRegional();
  const activeFields = definition.fields.filter(field => !field.state || field.state === 'active');
  const allowed = ['id', 'updated_at', ...activeFields.map(field => field.technicalName)];
  const sort = { by: allowed.includes(params.get('sort') ?? '') ? params.get('sort')! : 'updated_at', direction: params.get('direction') === 'asc' ? 'asc' as const : 'desc' as const };
  function change(values: Record<string, string | null>, replace = false) { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value === null || value === '') next.delete(key); else next.set(key, value); } setParams(next, { replace }); }
  const query = useDeferredValue(search);
  const result = useQuery({ queryKey: ['records', definition.id, i18n.language, query, offset, pageSize, sort], placeholderData: keepPreviousData, queryFn: () => api('list_records', { objectTypeId: definition.id, query, limit: pageSize, offset, sortBy: sort.by, sortDirection: sort.direction }) });
  useEffect(() => { if (result.data && !result.isPlaceholderData && page > 1 && offset >= result.data.total) change({ page: String(Math.max(1, Math.ceil(result.data.total / pageSize))) }, true); }, [result.data, result.isPlaceholderData, page, pageSize]);
  const fields = activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword');
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }), enabled: fields.some(field => field.kind === 'reference') });
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');
  const classifications = (['type', 'status', 'category'] as const).filter(kind => activeFields.some(field => field.technicalName === kind));
  const columns: RecordColumn<DataRecord>[] = [
    { key: hasKeyword ? 'keyword' : 'id', label: t(hasKeyword ? 'keyword' : 'recordIdentity'), required: true, cell: row => <Button variant="link" className="max-w-80 justify-start truncate px-0 hover:no-underline" render={<Link to={`${basePath}/${row.id}?${params}`} />} nativeButton={false} disabled={disabled}>{row.keyword || row.id}</Button> },
    ...classifications.map(kind => ({ key: kind, label: t(kind === 'type' ? 'classificationType' : kind === 'status' ? 'classificationStatus' : 'classificationCategory'), cell: (row: DataRecord) => displayClassification(definition.classification, kind, row[kind]) })),
    ...fields.map(field => ({ key: field.technicalName, label: field.label, cell: (row: DataRecord) => displayFieldValue(field, row[field.technicalName], i18n.language, t, principals.data, timeZone, regional) })),
    { key: 'updated_at', label: t('updated'), cell: row => formatRegionalDate(row.updated_at, regional, timeZone) },
  ];
  const readOnly = Boolean(definition.state && definition.state !== 'active');
  return <>{readOnly ? <p className="text-muted-foreground">{t('inactiveObjectHelp')}</p> : null}<div className="flex flex-wrap items-center justify-between gap-4 py-2"><h1 className="text-2xl font-semibold tracking-tight">{definition.label}</h1><div className="flex flex-wrap gap-2"><ColumnMenu columns={columns} hidden={hidden} disabled={disabled} onToggle={key => setHidden(old => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />{!readOnly ? <Button render={<Link to={`${basePath}/new?${params}`} />} nativeButton={false} disabled={disabled}><PlusIcon data-icon="inline-start" />{t('newRecord')}</Button> : null}</div></div><Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="record-search" className="sr-only">{t(hasKeyword ? 'search' : 'searchById')}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput data-record-search id="record-search" aria-keyshortcuts={keyboardCommands.search.aria} placeholder={t(hasKeyword ? 'search' : 'searchById')} value={search} maxLength={200} onChange={event => change({ q: event.target.value, page: null }, true)} /><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>{result.isPending ? <Loading /> : result.isError ? <ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /> : <RecordDataTable rows={result.data.records} columns={columns} hidden={hidden} total={result.data.total} page={page} pageSize={pageSize} sort={sort} disabled={disabled || result.isFetching} selectedRecord={selectedRecord} onSort={key => change({ sort: key, direction: sort.by === key && sort.direction === 'asc' ? 'desc' : 'asc', page: null })} onPage={page => change({ page: page === 1 ? null : String(page) })} onPageSize={size => change({ size: String(size), page: null })} onOpen={row => { if (row.id !== selectedRecord) void navigate(`${basePath}/${row.id}?${params}`); }} />}</>;
}
