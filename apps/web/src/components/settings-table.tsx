import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { useClientPagination } from './client-table-pagination';
import { useState, type ComponentProps } from 'react';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Definition/account tables fit their settings pane; business-record tables
// retain their independent column and horizontal scrolling behavior.
export function SettingsTable({ className, ...props }: ComponentProps<typeof Table>) {
  return <div className="min-w-0 overflow-hidden rounded-lg border"><Table className={cn('table-fixed [&_th]:whitespace-normal [&_th]:break-normal [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]', className)} {...props} /></div>;
}

export function useSettingsTable<T>(rows: T[], searchText: (row: T) => string) {
  const [search, setSearch] = useState('');
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const pagination = useClientPagination(rows.filter(row => terms.every(term => searchText(row).toLocaleLowerCase().includes(term))));
  return { search, onSearch: (value: string) => { setSearch(value); pagination.onPage(1); }, pagination };
}

export function SettingsTableSearch({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return <InputGroup className="w-full sm:max-w-xs"><InputGroupInput type="search" aria-label={t('settingsSearch')} placeholder={t('settingsSearch')} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /><InputGroupAddon><SearchIcon /></InputGroupAddon></InputGroup>;
}
