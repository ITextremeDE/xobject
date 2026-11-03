import { cn } from 'cn';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, Columns3Icon, ChevronDownIcon, EllipsisVerticalIcon, PanelRightOpenIcon, DatabaseIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { TablePagination } from './table-pagination';
export type RecordColumn<Row> = { key: string; label: string; cell: (row: Row) => ReactNode; required?: boolean; sortable?: boolean };
// One responsive toolbar composition for mixed-object and object-specific lists.
export function RecordTableToolbar({ search, children, alignEnd = false }: { search: ReactNode; children: ReactNode; alignEnd?: boolean }) {
  return <div className="@container/table-toolbar" data-record-table-toolbar>
    <div className={cn("flex flex-col gap-3 @2xl/table-toolbar:flex-row @2xl/table-toolbar:justify-between", alignEnd ? "@2xl/table-toolbar:items-end" : "@2xl/table-toolbar:items-center")}>
      {search}
      <div className="flex flex-wrap items-center gap-2 @2xl/table-toolbar:ml-auto">{children}</div>
    </div>
  </div>;
}
export function ColumnMenu<Row>({ columns, hidden, onToggle, disabled }: { columns: RecordColumn<Row>[]; hidden: Set<string>; onToggle: (key: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}><Columns3Icon data-icon="inline-start" />{t('customizeColumns')}<ChevronDownIcon data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{columns.map(column => <DropdownMenuCheckboxItem key={column.key} checked={!hidden.has(column.key)} disabled={column.required} closeOnClick={false} onCheckedChange={() => onToggle(column.key)}>{column.label}</DropdownMenuCheckboxItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>;
}
export function RecordDataTable<Row extends { id: string }>({ rows, columns, hidden, total, page, pageSize, sort, disabled = false, selectedRecord, onSort, onPage, onPageSize, onOpen, onObject, labels, rowName, ariaLabel, getCopyId }: { rows: Row[]; columns: RecordColumn<Row>[]; hidden: Set<string>; total: number; page: number; pageSize: number; sort: { by: string; direction: 'asc' | 'desc' }; disabled?: boolean; selectedRecord?: string | null; onSort: (key: string) => void; onPage: (page: number) => void; onPageSize: (size: number) => void; onOpen: (row: Row) => void; onObject?: (row: Row) => void; labels?: {open?:string;actions?:string;copyId?:string;empty?:string;selectRow?:(name:string)=>string}; rowName?: (row:Row)=>string; ariaLabel?:string; getCopyId?:(row:Row)=>string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const location = useLocation();
  const restoredFocus = useRef<string | null>(null);
  const rowIds = rows.map(row => row.id).join(',');
  useEffect(() => { setSelected(new Set()); setCopied(null); }, [rowIds, page, pageSize]);
  useEffect(() => {
    const id = location.state?.focusRecordId;
    if (selectedRecord || typeof id !== 'string' || restoredFocus.current === location.key) return;
    const row = document.querySelector<HTMLElement>(`[data-record-row="${CSS.escape(id)}"]`);
    const target = id === 'new' ? document.querySelector<HTMLElement>('[data-record-create]') : row?.querySelector<HTMLElement>('a, button');
    if (target) { target.focus({ preventScroll: true }); restoredFocus.current = location.key; }
  }, [location.key, location.state, selectedRecord, rowIds]);
  const visible = columns.filter(column => !hidden.has(column.key));
  const all = Boolean(rows.length && rows.every(row => selected.has(row.id)));
  return <><div className="min-w-0 overflow-hidden rounded-lg border"><Table aria-label={ariaLabel}><TableHeader><TableRow><TableHead className="w-10"><Checkbox aria-label={t('selectPage')} checked={all} indeterminate={!all && selected.size > 0} disabled={disabled || !rows.length} onCheckedChange={checked => setSelected(checked ? new Set(rows.map(row => row.id)) : new Set())} /></TableHead>{visible.map(column => <TableHead key={column.key} aria-sort={sort.by === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{column.sortable===false?column.label:<Button type="button" variant="ghost" className="-ml-2" disabled={disabled} onClick={() => onSort(column.key)}>{column.label}{sort.by === column.key ? sort.direction === 'asc' ? <ArrowUpIcon data-icon="inline-end" /> : <ArrowDownIcon data-icon="inline-end" /> : <ArrowUpDownIcon data-icon="inline-end" />}</Button>}</TableHead>)}<TableHead className="w-10"><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id} data-record-row={row.id} data-state={selected.has(row.id) || selectedRecord === row.id ? 'selected' : undefined} onClick={event => {
    if (disabled || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
    if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select, label, [role="checkbox"], [role="menuitem"], [role="combobox"], [role="button"], [role="link"], [role="switch"], [contenteditable], [data-row-action]')) return;
    onOpen(row);
  }}><TableCell><Checkbox aria-label={labels?.selectRow?.(rowName?.(row)??row.id) ?? t('selectRecord', { name: rowName?.(row) ?? ('keyword' in row && row.keyword ? String(row.keyword) : row.id) })} checked={selected.has(row.id)} disabled={disabled} onCheckedChange={checked => setSelected(old => { const next = new Set(old); if (checked) next.add(row.id); else next.delete(row.id); return next; })} /></TableCell>{visible.map(column => { const content = column.cell(row); return <TableCell key={column.key} className="max-w-80 truncate" title={typeof content === 'string' || typeof content === 'number' ? String(content) : undefined}>{content}</TableCell>; })}<TableCell><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={labels?.actions??t('recordActions')} />}><EllipsisVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuGroup><DropdownMenuItem onClick={() => onOpen(row)}><PanelRightOpenIcon />{labels?.open??t('openRecord')}</DropdownMenuItem>{onObject ? <DropdownMenuItem onClick={() => onObject(row)}><DatabaseIcon />{t('openObject')}</DropdownMenuItem> : null}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(getCopyId?.(row)??row.id).then(() => setCopied(row.id), () => setCopied('error')); }}><CopyIcon />{labels?.copyId??t('copyRecordId')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>{!rows.length ? <Empty><EmptyHeader><EmptyTitle>{labels?.empty??t('noRecords')}</EmptyTitle></EmptyHeader></Empty> : null}</div>{copied ? <p className="text-sm text-muted-foreground" role="status">{t(copied === 'error' ? 'copyFailed' : 'idCopied')}</p> : null}<TablePagination total={total} selected={selected.size} page={page} pageSize={pageSize} disabled={disabled} onPage={onPage} onPageSize={onPageSize} /></>;
}
