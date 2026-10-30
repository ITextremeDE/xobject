import { TablePagination } from './table-pagination';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ErrorNotice, Loading } from './feedback';

export function SystemJournal() {
  const { t } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone();
  const [field, setField] = useState(''), [kind, setKind] = useState(''), [workspaceId, setWorkspaceId] = useState(''), [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const fieldKey = useDeferredValue(field);
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api('list_workspaces', {}) });
  const journal = useQuery({ queryKey: ['system-journal', fieldKey, kind, workspaceId, offset, pageSize], queryFn: () => api('list_system_journal', { fieldKey, entityKind: kind, ...(workspaceId ? { workspaceId } : {}), offset, limit: pageSize }) });
  const value = (item: unknown) => item === null ? t('journalNotSet') : typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item);
  return <FieldGroup><FieldDescription>{t('systemJournalHelp')}</FieldDescription><FieldGroup className="gap-3"><Field><FieldLabel htmlFor="journal-workspace">{t('workspace')}</FieldLabel><NativeSelect id="journal-workspace" value={workspaceId} onChange={event => { setWorkspaceId(event.target.value); setOffset(0); }}><NativeSelectOption value="">{t('allWorkspaces')}</NativeSelectOption>{workspaces.data?.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="journal-field">{t('journalFieldFilter')}</FieldLabel><Input id="journal-field" value={field} onChange={event => { setField(event.target.value); setOffset(0); }} /></Field><Field><FieldLabel htmlFor="journal-kind">{t('journalEntityKind')}</FieldLabel><Input id="journal-kind" value={kind} placeholder="user, workspace, group, record …" onChange={event => { setKind(event.target.value); setOffset(0); }} /></Field></FieldGroup>
    {journal.isPending ? <Loading /> : journal.isError ? <ErrorNotice error={journal.error} retry={() => { void journal.refetch(); }} /> : !journal.data.entries.length ? <Empty><EmptyHeader><EmptyTitle>{t('journalNoEntries')}</EmptyTitle></EmptyHeader></Empty> : <><ol>{journal.data.entries.map((entry, index) => <li key={entry.id}>{index ? <Separator /> : null}<article className="flex flex-col gap-2 py-4"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium wrap-anywhere">{entry.field_key}</span><time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{formatRegionalDate(entry.created_at, regional, timeZone, true)}</time></div><FieldDescription>{entry.actor_name ?? entry.actor_id} · {entry.workspace_name ?? t('instance')} · {entry.entity_kind} · {entry.entity_name ?? entry.entity_id}</FieldDescription><dl className="grid min-w-0 grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">{t('before')}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{value(entry.old_value)}</dd></div><div><dt className="text-xs text-muted-foreground">{t('after')}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{value(entry.new_value)}</dd></div></dl><Collapsible><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>{t('journalShowDetails')}</CollapsibleTrigger><CollapsibleContent><FieldDescription>{t('changeId')}: {entry.change_id}<br />{t('entityId')}: {entry.entity_id}<br />ID: {entry.id}</FieldDescription></CollapsibleContent></Collapsible></article></li>)}</ol><TablePagination total={journal.data.total} page={Math.floor(offset / pageSize) + 1} pageSize={pageSize} disabled={journal.isFetching} onPage={page => setOffset((page - 1) * pageSize)} onPageSize={size => { setPageSize(size); setOffset(0); }} /></>}
  </FieldGroup>;
}
