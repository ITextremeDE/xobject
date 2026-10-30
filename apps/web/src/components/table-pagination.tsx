import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
export const pageSizes = [10, 20, 25, 30, 50, 100] as const;
export function TablePagination({ total, page, pageSize, selected, disabled = false, onPage, onPageSize }: { total: number; page: number; pageSize: number; selected?: number; disabled?: boolean; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const pages = Math.max(1, Math.min(Math.ceil(total / pageSize), Math.floor(100000 / pageSize) + 1));
  return <footer className="flex flex-wrap items-center justify-between gap-4 px-1"><div className="text-sm text-muted-foreground">{selected === undefined ? t('count', { count: total }) : t('selectedRows', { selected, total })}</div><div className="flex flex-wrap items-center gap-4 lg:gap-8"><div className="flex items-center gap-2"><Label htmlFor={id}>{t('rowsPerPage')}</Label><Select items={pageSizes.map(size => ({ value: String(size), label: String(size) }))} value={String(pageSize)} disabled={disabled} onValueChange={value => { if (value) onPageSize(Number(value)); }}><SelectTrigger id={id} size="sm" className="w-20"><SelectValue /></SelectTrigger><SelectContent side="top"><SelectGroup>{pageSizes.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectGroup></SelectContent></Select></div><span className="text-sm font-medium">{t('pageOf', { page, pages })}</span><div className="flex items-center gap-2"><Button variant="outline" size="icon-sm" disabled={disabled || page <= 1} aria-label={t('firstPage')} onClick={() => onPage(1)}><ChevronsLeftIcon /></Button><Button variant="outline" size="icon-sm" disabled={disabled || page <= 1} aria-label={t('previous')} onClick={() => onPage(Math.max(1, page - 1))}><ChevronLeftIcon /></Button><Button variant="outline" size="icon-sm" disabled={disabled || page >= pages} aria-label={t('next')} onClick={() => onPage(Math.min(pages, page + 1))}><ChevronRightIcon /></Button><Button variant="outline" size="icon-sm" disabled={disabled || page >= pages} aria-label={t('lastPage')} onClick={() => onPage(pages)}><ChevronsRightIcon /></Button></div></div></footer>;
}
