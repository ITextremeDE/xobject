import {journalFieldValue} from '@/lib/journal-field-value';
import {useColumnPreferences} from '@/lib/column-preferences';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SystemJournalEntry, JournalEntry } from '@xobject/contracts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { journalEntryTitle,journalLifecycleValue,journalTaskStateValue,journalSecurityValue } from '@/lib/journal-presentation';
import { journalValueSummary } from '@/lib/journal-value-summary';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ColumnMenu, RecordDataTable, RecordTableToolbar, type RecordColumn } from './record-data-table';
import { JournalEntryDetails } from './journal-entry-details';
import { DialogActions } from './dialog-actions';
import { ErrorNotice } from './feedback';

type Entry = SystemJournalEntry & JournalEntry;
type Props = {
  entries: Entry[]; filters: ReactNode; total: number; page: number; pageSize: number;
  busy: boolean; loading: boolean; error?: unknown;
  contextColumns?:boolean; preferenceKey?:string; emptyLabel?:string; memberName?:(entry:Entry)=>string|undefined;
  renderValue?: (entry: Entry, value: unknown, side: 'before' | 'after') => string | undefined;
  onPage: (page: number) => void; onPageSize: (size: number) => void; onRetry: () => void;
};
export function RecordJournalTable({ entries, filters, total, page, pageSize, busy, loading, error, renderValue, onPage, onPageSize, onRetry, contextColumns=false, preferenceKey='record-journal', emptyLabel, memberName }: Props) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone(), mobile = useIsMobile();
  const [selected, setSelected] = useState<Entry | null>(null);
  const title = (entry: Entry) => journalEntryTitle(entry, t, i18n.language);
  const summary = (entry: Entry, side: 'before' | 'after') => {
    const value = side === 'before' ? entry.old_value : entry.new_value;
    return journalTaskStateValue(entry,value,t) ?? journalSecurityValue(entry,value,t) ?? journalLifecycleValue(entry,value,t) ?? renderValue?.(entry, value, side) ?? journalFieldValue(entry,value,side,i18n.language,t,timeZone,regional) ?? journalValueSummary(value, i18n.language, t('journalNotSet'), t('yes'), t('no'),(kind,count)=>t(`journalSummary_${kind}`,{count}));
  };
  const columns: RecordColumn<Entry>[] = [
    { key: 'created_at', label: mobile?t('journalWhenWho'):t('changedAt'), className:mobile?'w-28':undefined, required: true, sortable: false, cell: entry => <div className="flex flex-col gap-1 whitespace-normal"><time dateTime={entry.created_at}>{formatRegionalDate(entry.created_at, regional, timeZone, true)}</time>{mobile?<span className="text-muted-foreground">{entry.actor_name??t('journalUnknownUser')}</span>:null}</div> },
    ...(!mobile?[{ key: 'actor', label: t('journalChangedBy'), sortable: false, cell: (entry:Entry) => entry.actor_name ?? t('journalUnknownUser') }]:[]),
    { key: 'field', label: t(mobile?'journalChangeColumn':'journalFieldOrRelationship'), sortable: false, required: true, cell: entry => <div className="flex min-w-0 flex-col gap-1"><Button type="button" variant="link" data-journal-entry={entry.id} className="h-auto max-w-full justify-start p-0" title={title(entry)} onClick={() => setSelected(entry)}><span className="truncate">{title(entry)}</span></Button>{mobile&&contextColumns?<span className="truncate text-muted-foreground" title={entry.entity_name??entry.entity_id}>{entry.entity_name??entry.entity_id}</span>:null}</div> },
    ...(contextColumns&&!mobile?[{key:'entity',label:t('journalTarget'),sortable:false,cell:(entry:Entry)=>entry.entity_name??entry.entity_id},{key:'scope',label:t('journalScope'),sortable:false,cell:(entry:Entry)=>entry.workspace_name??t('instance')}]:[]),
    { key: 'before', label: t('before'), sortable: false, cell: entry => summary(entry, 'before') },
    { key: 'after', label: t('after'), sortable: false, cell: entry => summary(entry, 'after') },
  ];
  const {hidden,toggle}=useColumnPreferences(preferenceKey,columns,contextColumns?['before','after','scope']:mobile?['before']:[]);
  return <FieldGroup aria-busy={busy}>
    <RecordTableToolbar search={filters} alignEnd><ColumnMenu columns={columns} hidden={hidden} onToggle={toggle} /></RecordTableToolbar>
    {error ? <ErrorNotice error={error} retry={onRetry} /> : <RecordDataTable loading={loading} compact={contextColumns} rows={entries} columns={columns} hidden={hidden} total={total} page={page} pageSize={pageSize} sort={{ by: 'created_at', direction: 'desc' }} disabled={busy} selectedRecord={selected?.id} onSort={() => {}} onPage={onPage} onPageSize={onPageSize} onOpen={setSelected} rowName={entry=>`${title(entry)}${contextColumns?` · ${entry.entity_name??entry.entity_id}`:''} · ${formatRegionalDate(entry.created_at,regional,timeZone,true)}`} ariaLabel={t('journal')} labels={{ open: t('journalShowDetails'), actions: t('journalEntryActions'), copyId: t('journalCopyEntryId'), empty: emptyLabel??t('noJournal'), selectRow: name=>t('journalSelectEntry',{name}) }} />}
    {selected ? <Dialog open onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl" finalFocus={() => document.querySelector<HTMLElement>(`[data-journal-entry="${selected.id}"]`) ?? true}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{title(selected)}</DialogTitle><DialogDescription>{t('journalEntryDetailsHelp')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><JournalEntryDetails compact={!contextColumns} memberName={memberName?.(selected)} entry={selected} renderValue={selected.field_id && !selected.field_key.startsWith('access.') ? (value, side) => renderValue?.(selected, value, side) ?? journalFieldValue(selected,value,side,i18n.language,t,timeZone,regional) ?? journalValueSummary(value, i18n.language, t('journalNotSet'), t('yes'), t('no'),(kind,count)=>t(`journalSummary_${kind}`,{count})) : undefined} /></div>
      <DialogActions onClose={() => setSelected(null)} />
    </DialogContent></Dialog> : null}
  </FieldGroup>;
}
