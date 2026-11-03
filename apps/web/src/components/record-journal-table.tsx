import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SystemJournalEntry, JournalEntry } from '@xobject/contracts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { journalEntryTitle } from '@/lib/journal-presentation';
import { journalValueSummary } from '@/lib/journal-value-summary';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ColumnMenu, RecordDataTable, RecordTableToolbar, type RecordColumn } from './record-data-table';
import { JournalEntryCard } from './journal-entry-card';
import { DialogActions } from './dialog-actions';
import { ErrorNotice, Loading } from './feedback';

type Entry = SystemJournalEntry & JournalEntry;
type Props = {
  entries: Entry[]; filters: ReactNode; total: number; page: number; pageSize: number;
  busy: boolean; loading: boolean; error?: unknown;
  renderValue: (entry: Entry, value: unknown, side: 'before' | 'after') => string | undefined;
  onPage: (page: number) => void; onPageSize: (size: number) => void; onRetry: () => void;
};
export function RecordJournalTable({ entries, filters, total, page, pageSize, busy, loading, error, renderValue, onPage, onPageSize, onRetry }: Props) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone(), mobile = useIsMobile();
  const [columnChoices, setColumnChoices] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Entry | null>(null);
  const title = (entry: Entry) => journalEntryTitle(entry, t, i18n.language);
  const summary = (entry: Entry, side: 'before' | 'after') => {
    const value = side === 'before' ? entry.old_value : entry.new_value;
    return renderValue(entry, value, side) ?? journalValueSummary(value, i18n.language, t('journalNotSet'), t('yes'), t('no'));
  };
  const columns: RecordColumn<Entry>[] = [
    { key: 'created_at', label: t('changedAt'), sortable: false, cell: entry => formatRegionalDate(entry.created_at, regional, timeZone, true) },
    { key: 'actor', label: t('journalChangedBy'), sortable: false, cell: entry => entry.actor_name ?? t('journalUnknownUser') },
    { key: 'field', label: t('journalFieldOrRelationship'), sortable: false, required: true, cell: entry => <Button type="button" variant="link" data-journal-entry={entry.id} className="h-auto max-w-full justify-start p-0" onClick={() => setSelected(entry)}>{title(entry)}</Button> },
    { key: 'before', label: t('before'), sortable: false, cell: entry => summary(entry, 'before') },
    { key: 'after', label: t('after'), sortable: false, cell: entry => summary(entry, 'after') },
  ];
  const hidden = new Set(columns.filter(column => columnChoices[column.key] ?? (mobile && ['actor', 'before'].includes(column.key))).map(column => column.key));
  return <FieldGroup aria-busy={busy}>
    <RecordTableToolbar search={filters} alignEnd><ColumnMenu columns={columns} hidden={hidden} onToggle={key => setColumnChoices(old => ({ ...old, [key]: !hidden.has(key) }))} /></RecordTableToolbar>
    {loading ? <Loading /> : error ? <ErrorNotice error={error} retry={onRetry} /> : <RecordDataTable rows={entries} columns={columns} hidden={hidden} total={total} page={page} pageSize={pageSize} sort={{ by: 'created_at', direction: 'desc' }} disabled={busy} selectedRecord={selected?.id} onSort={() => {}} onPage={onPage} onPageSize={onPageSize} onOpen={setSelected} rowName={entry=>`${title(entry)} · ${formatRegionalDate(entry.created_at,regional,timeZone,true)}`} ariaLabel={t('journal')} labels={{ open: t('journalShowDetails'), actions: t('journalEntryActions'), copyId: t('journalCopyEntryId'), empty: t('noJournal'), selectRow: name=>t('journalSelectEntry',{name}) }} />}
    {selected ? <Dialog open onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl" finalFocus={() => document.querySelector<HTMLElement>(`[data-journal-entry="${selected.id}"]`) ?? true}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('journalEntryDetails')}</DialogTitle><DialogDescription>{title(selected)}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><JournalEntryCard compact entry={selected} renderValue={selected.field_id ? (value, side) => renderValue(selected, value, side) ?? journalValueSummary(value, i18n.language, t('journalNotSet'), t('yes'), t('no')) : undefined} /></div>
      <DialogActions onClose={() => setSelected(null)} />
    </DialogContent></Dialog> : null}
  </FieldGroup>;
}
