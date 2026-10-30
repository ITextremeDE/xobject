import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchIcon, DatabaseIcon, FileTextIcon } from 'lucide-react';
import { keyboardCommands, workspaceSearchShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useSidebar } from '@/components/ui/sidebar';
import { ErrorNotice } from './feedback';

export function HeaderSearch({ workspaceId, workspaceName, language, disabled, compact = false, onOpenResult }: {
  workspaceId?: string; workspaceName?: string; language: string; disabled: boolean; compact?: boolean; onOpenResult: (objectTypeId: string, recordId?: string) => void;
}) {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const iconOnly = isMobile || compact;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const toggle = () => { if (!disabled && workspaceId) setOpen(value => !value); };
    window.addEventListener(keyboardCommands.workspaceSearch.event, toggle);
    return () => window.removeEventListener(keyboardCommands.workspaceSearch.event, toggle);
  }, [disabled, workspaceId]);
  useEffect(() => { if (!open) { setInput(''); setQuery(''); } }, [open]);
  useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 200); return () => clearTimeout(timer); }, [input]);
  const ready = input.trim().length >= 2 && input.trim() === query;
  const result = useQuery({ queryKey: ['workspace-search', workspaceId, language, query], queryFn: () => api('search_workspace', { workspaceId: workspaceId!, query }), enabled: open && Boolean(workspaceId) && query.length >= 2 && ready });
  function select(typeId: string, recordId?: string) { setOpen(false); onOpenResult(typeId, recordId); }
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setInput(''); setQuery(''); } }}>
    <DialogTrigger render={<Button data-workspace-search-trigger aria-keyshortcuts={keyboardCommands.workspaceSearch.aria} variant="outline" size={iconOnly ? 'icon-lg' : 'lg'} className={iconOnly ? undefined : 'w-48 justify-start text-muted-foreground lg:w-64'} disabled={disabled || !workspaceId} aria-label={t('workspaceSearch')} title={`${t('workspaceSearch')} (${workspaceSearchShortcutLabel})`} />}><SearchIcon data-icon="inline-start" />{!iconOnly ? <><span className="truncate">{t('searchAction')}</span><Kbd className="ml-auto shrink-0">{workspaceSearchShortcutLabel}</Kbd></> : null}</DialogTrigger>
    <DialogContent data-workspace-search-dialog className="top-16 max-h-[min(34rem,calc(100svh-5rem))] translate-y-0 overflow-hidden p-0 sm:top-24">
      <DialogHeader className="sr-only"><DialogTitle>{t('workspaceSearch')}</DialogTitle><DialogDescription>{t('searchScope', { workspace: workspaceName })}</DialogDescription></DialogHeader>
      <Command label={t('workspaceSearch')} shouldFilter={false} className="max-h-[inherit] [&_[data-slot=command-input-wrapper]]:pr-10">
        <CommandInput autoFocus aria-label={t('workspaceSearch')} placeholder={t('workspaceSearchPlaceholder')} value={input} maxLength={200} onValueChange={setInput} />
        <CommandList label={t('searchResults')} className="max-h-[calc(min(34rem,100svh-5rem)-3rem)] overscroll-contain">
          {input.trim().length < 2 ? <p className="p-4 text-sm text-muted-foreground" role="status">{t('searchMinimum')}</p>
            : !ready || result.isPending || result.isFetching ? <p className="p-4 text-sm text-muted-foreground" role="status">{t('loading')}</p>
            : result.isError ? <div className="p-2"><ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /></div>
            : <>
              {!result.data.objectTypes.length && !result.data.records.length ? <CommandEmpty>{t('noSearchResults')}</CommandEmpty> : null}
              {result.data.objectTypes.length ? <CommandGroup heading={t('objects')}>{result.data.objectTypes.map(type => <CommandItem key={type.id} value={`type:${type.id}`} onSelect={() => select(type.id)}><DatabaseIcon /><span>{type.label}</span></CommandItem>)}</CommandGroup> : null}
              {result.data.records.length ? <CommandGroup heading={t('records')}>{result.data.records.map(record => <CommandItem key={record.id} value={`record:${record.id}`} onSelect={() => select(record.objectTypeId, record.id)}><FileTextIcon /><span className="flex min-w-0 flex-col"><span className="truncate">{record.keyword || t('untitledRecord')}</span><span className="text-xs text-muted-foreground">{record.objectLabel}</span></span></CommandItem>)}</CommandGroup> : null}
              {result.data.hasMoreObjects || result.data.hasMoreRecords ? <p className="p-4 text-sm text-muted-foreground" role="status">{t('searchRefine')}</p> : null}
            </>}
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}
