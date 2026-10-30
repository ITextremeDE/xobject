import { resourceLinks } from '@/lib/resource-links';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchIcon, DatabaseIcon, FileTextIcon, LayoutDashboardIcon, SettingsIcon, KeyboardIcon } from 'lucide-react';
import type { ObjectSummary } from '@xobject/contracts';
import { keyboardCommands, workspaceSearchShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { ErrorNotice } from './feedback';
type Destination = 'dashboard' | 'settings' | 'keyboard';
export function HeaderSearch({ workspaceId, workspaceName, language, disabled, canSearchRecords, objectTypes, onNavigate, onOpenResult }: { workspaceId?: string; workspaceName?: string; language: string; disabled: boolean; canSearchRecords: boolean; objectTypes: ObjectSummary[]; onNavigate: (target: Destination) => void; onOpenResult: (objectTypeId: string, recordId?: string) => void }) {
  const { t } = useTranslation();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const iconOnly = state === 'collapsed' && !isMobile;
  const [open, setOpen] = useState(false), [input, setInput] = useState(''), [query, setQuery] = useState('');
  useEffect(() => { const toggle = () => { if (!disabled) setOpen(value => !value); }; window.addEventListener(keyboardCommands.workspaceSearch.event, toggle); return () => window.removeEventListener(keyboardCommands.workspaceSearch.event, toggle); }, [disabled]);
  useEffect(() => { if (!open) { setInput(''); setQuery(''); } }, [open]);
  useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 200); return () => clearTimeout(timer); }, [input]);
  const ready = input.trim().length >= 2 && input.trim() === query;
  const result = useQuery({ queryKey: ['workspace-search', workspaceId, language, query], queryFn: () => api('search_workspace', { workspaceId: workspaceId!, query }), enabled: open && canSearchRecords && Boolean(workspaceId) && query.length >= 2 && ready });
  const matches = (label: string) => label.toLocaleLowerCase(language).includes(input.trim().toLocaleLowerCase(language));
  const navigation = [{ id: 'dashboard' as const, label: t('dashboard'), icon: LayoutDashboardIcon }, { id: 'settings' as const, label: t('settings'), icon: SettingsIcon }, { id: 'keyboard' as const, label: t('keyboardHelp'), icon: KeyboardIcon }].filter(item => matches(item.label));
  const objects = objectTypes.filter(type => (!type.state || type.state === 'active') && matches(type.label));
  const resources = resourceLinks.map(item => ({ label: t(item.label), url: item.href, icon: item.icon })).filter(item => matches(item.label));
  const remoteReady = canSearchRecords && workspaceId && input.trim().length >= 2;
  const noLocal = !navigation.length && !objects.length && !resources.length;
  function select(typeId: string, recordId?: string) { setOpen(false); setOpenMobile(false); onOpenResult(typeId, recordId); }
  return <Dialog open={open} onOpenChange={setOpen}><SidebarGroup className="p-0"><SidebarGroupContent><DialogTrigger render={iconOnly ? <SidebarMenuButton data-workspace-search-trigger tooltip={t('searchAndNavigate')} aria-keyshortcuts={keyboardCommands.workspaceSearch.aria} disabled={disabled} aria-label={t('searchAndNavigate')} /> : <Button data-workspace-search-trigger aria-keyshortcuts={keyboardCommands.workspaceSearch.aria} variant="outline" size="sm" className="w-full justify-start text-muted-foreground" disabled={disabled} aria-label={t('searchAndNavigate')} />}><SearchIcon data-icon="inline-start" />{!iconOnly ? <><span className="truncate">{t('searchAction')}</span><Kbd className="ml-auto shrink-0">{workspaceSearchShortcutLabel}</Kbd></> : null}</DialogTrigger></SidebarGroupContent></SidebarGroup><DialogContent data-workspace-search-dialog className="top-16 max-h-[min(34rem,calc(100svh-5rem))] translate-y-0 overflow-hidden p-0 sm:top-24"><DialogHeader className="sr-only"><DialogTitle>{t('searchAndNavigate')}</DialogTitle><DialogDescription>{t('searchNavigationHelp', { workspace: workspaceName ?? 'xObject' })}</DialogDescription></DialogHeader><Command label={t('searchAndNavigate')} shouldFilter={false} className="max-h-[inherit] [&_[data-slot=command-input-wrapper]]:pr-10"><CommandInput autoFocus aria-label={t('searchAndNavigate')} placeholder={t('searchNavigationPlaceholder')} value={input} maxLength={200} onValueChange={setInput} /><CommandList label={t('searchResults')} className="max-h-80 overscroll-contain">
    {navigation.length ? <CommandGroup heading={t('navigation')}>{navigation.map(item => <CommandItem key={item.id} value={`nav:${item.id}`} onSelect={() => { setOpen(false); setOpenMobile(false); onNavigate(item.id); }}><item.icon /><span>{item.label}</span></CommandItem>)}</CommandGroup> : null}
    {objects.length ? <><CommandSeparator /><CommandGroup heading={t('objects')}>{objects.map(type => <CommandItem key={type.id} value={`type:${type.id}`} onSelect={() => select(type.id)}><DatabaseIcon /><span>{type.label}</span></CommandItem>)}</CommandGroup></> : null}
    {remoteReady ? !ready || result.isPending || result.isFetching ? <p className="p-3 text-sm text-muted-foreground" role="status">{t('loading')}</p> : result.isError ? <div className="p-2"><ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /></div> : result.data?.records.length ? <><CommandSeparator /><CommandGroup heading={t('records')}>{result.data.records.map(record => <CommandItem key={record.id} value={`record:${record.id}`} onSelect={() => select(record.objectTypeId, record.id)}><FileTextIcon /><span className="flex min-w-0 flex-col"><span className="truncate">{record.keyword || t('untitledRecord')}</span><span className="text-xs text-muted-foreground">{record.objectLabel}</span></span></CommandItem>)}</CommandGroup>{result.data.hasMoreRecords ? <p className="p-3 text-sm text-muted-foreground">{t('searchRefine')}</p> : null}</> : null : null}
    {resources.length ? <><CommandSeparator /><CommandGroup heading={t('resources')}>{resources.map(item => <CommandItem key={item.url} value={item.url} onSelect={() => { setOpen(false); setOpenMobile(false); window.open(item.url, '_blank', 'noopener,noreferrer'); }}><item.icon /><span>{item.label}</span></CommandItem>)}</CommandGroup></> : null}
    {noLocal && (!remoteReady || ready && !result.isPending && !result.isFetching && !result.isError && !result.data?.records.length) ? <CommandEmpty>{t('noSearchResults')}</CommandEmpty> : null}
  </CommandList></Command></DialogContent></Dialog>;
}
