import { JournalEntryCard } from './journal-entry-card';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { journalEntityKinds, journalEntityLabel, journalPropertyLabel } from '@/lib/journal-presentation';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { TablePagination } from './table-pagination';
import { ErrorNotice, Loading } from './feedback';

export function SystemJournal() {
  const { t } = useTranslation();
  const [field, setField] = useState(''), [kind, setKind] = useState(''), [workspaceId, setWorkspaceId] = useState(''), [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const deferredField = useDeferredValue(field);
  const knownProperties = ['time_zone', 'name', 'email', 'labels', 'technical_name', 'kind', 'required', 'state', 'active', 'language', 'is_admin', 'must_change_password', 'member:', 'regional.locale', 'regional.dateFormat', 'regional.hourCycle', 'regional.numberFormat', 'regional.weekStart'];
  const fieldKey = knownProperties.find(key => journalPropertyLabel(key, t).toLocaleLowerCase() === deferredField.trim().toLocaleLowerCase()) ?? deferredField;
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('list_users', {}) });
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api('list_workspaces', {}) });
  const journal = useQuery({ queryKey: ['system-journal', fieldKey, kind, workspaceId, offset, pageSize], queryFn: () => api('list_system_journal', { fieldKey, entityKind: kind, ...(workspaceId ? { workspaceId } : {}), offset, limit: pageSize }) });
  const workspaceItems = [{ value: 'all', label: t('journalAllScopes') }, ...(workspaces.data ?? []).map(item => ({ value: item.id, label: item.name }))];
  const kindItems = [{ value: 'all', label: t('journalAllEntities') }, ...journalEntityKinds.map(value => ({ value, label: journalEntityLabel(value, t) }))];
  const filtered = Boolean(field || kind || workspaceId);

  return <FieldGroup>
    <FieldDescription>{t('systemJournalHelp')}</FieldDescription>
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0 flex w-full flex-wrap items-center justify-between gap-2"><span>{t('journalFilters')}</span>
        {filtered ? <Button type="button" variant="ghost" size="sm" onClick={() => { setField(''); setKind(''); setWorkspaceId(''); setOffset(0); }}>{t('journalResetFilters')}</Button> : null}</FieldLegend>
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="journal-workspace">{t('journalScope')}</FieldLabel>
          <Select items={workspaceItems} value={workspaceId || 'all'} onValueChange={value => { if (value) { setWorkspaceId(value === 'all' ? '' : value); setOffset(0); } }}>
            <SelectTrigger id="journal-workspace" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="all">{t('journalAllScopes')}</SelectItem></SelectGroup><SelectGroup><SelectLabel>{t('workspace')}</SelectLabel>{workspaceItems.slice(1).map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="journal-kind">{t('journalEntityKind')}</FieldLabel>
          <Select items={kindItems} value={kind || 'all'} onValueChange={value => { if (value) { setKind(value === 'all' ? '' : value); setOffset(0); } }}>
            <SelectTrigger id="journal-kind" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{kindItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="journal-field">{t('journalFieldFilter')}</FieldLabel>
          <InputGroup><InputGroupInput id="journal-field" type="search" placeholder={t('journalPropertyPlaceholder')} value={field} onChange={event => { setField(event.target.value); setOffset(0); }} /><InputGroupAddon><SearchIcon /></InputGroupAddon></InputGroup>
        </Field>
      </FieldGroup>
    </FieldSet>
    {journal.isPending ? <Loading /> : journal.isError ? <ErrorNotice error={journal.error} retry={() => { void journal.refetch(); }} /> : !journal.data.entries.length ? <Empty><EmptyHeader><EmptyTitle>{t('journalNoMatches')}</EmptyTitle></EmptyHeader></Empty> : <>
      <ol className="flex min-w-0 flex-col gap-4" aria-label={t('journalEntries')}>
        {journal.data.entries.map(entry => <li key={entry.id} className="min-w-0"><JournalEntryCard entry={entry} memberName={entry.field_key.startsWith('member:') ? users.data?.find(user => user.id === entry.field_key.slice(7))?.name : undefined} /></li>)}
      </ol>
      <TablePagination countLabel={t('journalCount', { count: journal.data.total })} total={journal.data.total} page={Math.floor(offset / pageSize) + 1} pageSize={pageSize} disabled={journal.isFetching} onPage={page => setOffset((page - 1) * pageSize)} onPageSize={size => { setPageSize(size); setOffset(0); }} />
    </>}
  </FieldGroup>;
}
