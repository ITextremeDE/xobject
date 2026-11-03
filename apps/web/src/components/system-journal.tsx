import {useIsMobile} from '@/hooks/use-mobile';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {ChevronDownIcon} from 'lucide-react';
import {RecordJournalTable} from './record-journal-table';
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

export function SystemJournal() {
  const { t } = useTranslation();
  const mobile=useIsMobile();
  const [filtersExpanded,setFiltersExpanded]=useState<boolean|null>(null);
  const [field, setField] = useState(''), [kind, setKind] = useState(''), [workspaceId, setWorkspaceId] = useState(''), [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const deferredField = useDeferredValue(field);
  const knownProperties = ['form_layout.default', 'time_zone', 'name', 'email', 'labels', 'technical_name', 'kind', 'required', 'state', 'active', 'language', 'is_admin', 'must_change_password', 'member:', 'regional.locale', 'regional.dateFormat', 'regional.hourCycle', 'regional.numberFormat', 'regional.weekStart'];
  const fieldKey = knownProperties.find(key => journalPropertyLabel(key, t).toLocaleLowerCase() === deferredField.trim().toLocaleLowerCase()) ?? deferredField;
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('list_users', {}) });
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api('list_workspaces', {}) });
  const journal = useQuery({ queryKey: ['system-journal', fieldKey, kind, workspaceId, offset, pageSize], queryFn: () => api('list_system_journal', { fieldKey, entityKind: kind, ...(workspaceId ? { workspaceId } : {}), offset, limit: pageSize }) });
  const workspaceItems = [{ value: 'all', label: t('journalAllScopes') }, ...(workspaces.data ?? []).map(item => ({ value: item.id, label: item.name }))];
  const kindItems = [{ value: 'all', label: t('journalAllEntities') }, ...journalEntityKinds.map(value => ({ value, label: journalEntityLabel(value, t) }))];
  const filtered = Boolean(field || kind || workspaceId);

  return <FieldGroup>
    <FieldDescription>{t('systemJournalHelp')}</FieldDescription>
    <Collapsible open={filtersExpanded??!mobile} onOpenChange={setFiltersExpanded}><FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-0 flex w-full flex-wrap items-center justify-between gap-2"><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="group/journal-filters px-0"/>}>{t('journalFilters')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/journal-filters:rotate-180"/></CollapsibleTrigger>
        {filtered ? <Button type="button" variant="ghost" size="sm" onClick={() => { setField(''); setKind(''); setWorkspaceId(''); setOffset(0); }}>{t('journalResetFilters')}</Button> : null}</FieldLegend>
      <CollapsibleContent><FieldGroup className="grid gap-3 sm:grid-cols-2">
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
      </FieldGroup></CollapsibleContent>
    </FieldSet></Collapsible>
    <RecordJournalTable entries={journal.data?.entries??[]} filters={null} contextColumns preferenceKey="system-journal" emptyLabel={t('journalNoMatches')} total={journal.data?.total??0} page={Math.floor(offset/pageSize)+1} pageSize={pageSize} busy={journal.isFetching} loading={journal.isPending} error={journal.error} onRetry={()=>{void journal.refetch();}} onPage={page=>setOffset((page-1)*pageSize)} onPageSize={size=>{setPageSize(size);setOffset(0);}} memberName={entry=>entry.field_key.startsWith('member:')?users.data?.find(user=>user.id===entry.field_key.slice(7))?.name:undefined}/>

  </FieldGroup>;
}
