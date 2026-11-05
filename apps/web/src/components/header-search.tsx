import {RecordIcon} from './record-icon';
import { resourceLinks } from '@/lib/resource-links';
import { useEffect, useRef,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchIcon, LayoutDashboardIcon, SettingsIcon, KeyboardIcon, Trash2Icon } from 'lucide-react';
import type { ObjectSummary } from '@xobject/contracts';
import { keyboardCommands, workspaceSearchShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { api } from '@/lib/api';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { SidebarGroup, SidebarGroupContent, SidebarMenuButton,SidebarInput, useSidebar } from '@/components/ui/sidebar';
import { ErrorNotice } from './feedback';
type Destination = 'dashboard' | 'settings' | 'keyboard' | 'recycle-bin';
export function HeaderSearch({ workspaceId, workspaceName, language, disabled, canSearchRecords, objectTypes, onNavigate, onOpenResult }: { workspaceId?: string; workspaceName?: string; language: string; disabled: boolean; canSearchRecords: boolean; objectTypes: ObjectSummary[]; onNavigate: (target: Destination) => void; onOpenResult: (objectTypeId: string, recordId?: string) => void }) {
  const { t } = useTranslation();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const iconOnly = state === 'collapsed' && !isMobile;
  const origin=useRef<HTMLElement|null>(null);
  function openSearch(){origin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setOpen(true);}
  const [open, setOpen] = useState(false), [input, setInput] = useState(''), [query, setQuery] = useState('');
  useEffect(() => { const toggle = () => { if (!disabled) setOpen(value => {if(!value)origin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;return !value;}); }; window.addEventListener(keyboardCommands.workspaceSearch.event, toggle); return () => window.removeEventListener(keyboardCommands.workspaceSearch.event, toggle); }, [disabled]);
  useEffect(() => { if (!open) { setInput(''); setQuery(''); } }, [open]);
  useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 200); return () => clearTimeout(timer); }, [input]);
  const ready = input.trim().length >= 2 && input.trim() === query;
  const result = useQuery({ queryKey: ['workspace-search', workspaceId, language, query], queryFn: () => api('search_workspace', { workspaceId: workspaceId!, query }), enabled: open && canSearchRecords && Boolean(workspaceId) && query.length >= 2 && ready });
  const matches = (label: string) => label.toLocaleLowerCase(language).includes(input.trim().toLocaleLowerCase(language));
  const navigation = [{ id: 'dashboard' as const, label: t('dashboard'), icon: LayoutDashboardIcon }, ...(workspaceId ? [{ id: 'recycle-bin' as const, label: t('recycleBin'), icon: Trash2Icon }] : []), { id: 'settings' as const, label: t('settings'), icon: SettingsIcon }, { id: 'keyboard' as const, label: t('keyboardHelp'), icon: KeyboardIcon }].filter(item => matches(item.label));
  const objects = objectTypes.filter(type => (!type.state || type.state === 'active') && matches(type.label));
  const resources = resourceLinks.map(item => ({ label: t(item.label), url: item.href, icon: item.icon })).filter(item => matches(item.label));
  const remoteReady = canSearchRecords && workspaceId && input.trim().length >= 2;
  const noLocal = !navigation.length && !objects.length && !resources.length;
  function select(typeId: string, recordId?: string) { setOpen(false); setOpenMobile(false); onOpenResult(typeId, recordId); }
  return <Dialog open={open} onOpenChange={next=>{if(next)openSearch();else setOpen(false);}}><SidebarGroup className="py-0"><SidebarGroupContent className="relative">{iconOnly?<DialogTrigger render={<SidebarMenuButton data-workspace-search-trigger tooltip={t('searchAndNavigate')} aria-keyshortcuts={keyboardCommands.workspaceSearch.aria} disabled={disabled} aria-label={t('searchAndNavigate')}/>}><SearchIcon/></DialogTrigger>:<><SidebarInput data-workspace-search-trigger aria-label={t('searchAndNavigate')} aria-keyshortcuts={keyboardCommands.workspaceSearch.aria} aria-haspopup="dialog" aria-expanded={open} placeholder={t('searchAction')} className="pl-8 pr-14" value={input} disabled={disabled} onClick={()=>{if(!disabled)openSearch();}} onChange={event=>{setInput(event.target.value);openSearch();}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();openSearch();}}}/><SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none"/><Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 select-none">{workspaceSearchShortcutLabel}</Kbd></>}</SidebarGroupContent></SidebarGroup><DialogContent finalFocus={()=>origin.current?.getClientRects().length?origin.current:document.querySelector<HTMLElement>('[data-workspace-search-trigger]')??true} data-workspace-search-dialog className="top-16 flex max-h-[min(34rem,calc(100svh-5rem))] translate-y-0 flex-col overflow-hidden p-0 sm:top-24 sm:max-h-[min(34rem,calc(100svh-7rem))]"><DialogHeader className="sr-only"><DialogTitle>{t('searchAndNavigate')}</DialogTitle><DialogDescription>{t('searchNavigationHelp', { workspace: workspaceName ?? 'xObject' })}</DialogDescription></DialogHeader><Command label={t('searchAndNavigate')} shouldFilter={false} className="min-h-0 max-h-[inherit] [&_[data-slot=command-input-wrapper]]:pr-10"><CommandInput autoFocus aria-label={t('searchAndNavigate')} placeholder={t('searchNavigationPlaceholder')} value={input} maxLength={200} onValueChange={setInput} /><CommandList label={t('searchResults')} className="min-h-0 max-h-80 overscroll-contain">
    {navigation.length ? <CommandGroup heading={t('navigation')}>{navigation.map(item => <CommandItem key={item.id} value={`nav:${item.id}`} onSelect={() => { setOpen(false); setOpenMobile(false); onNavigate(item.id); }}><item.icon /><span>{item.label}</span></CommandItem>)}</CommandGroup> : null}
    {objects.length ? <><CommandSeparator /><CommandGroup heading={t('objects')}>{objects.map(type => <CommandItem key={type.id} value={`type:${type.id}`} onSelect={() => select(type.id)}><RecordIcon iconKey={type.iconKey} objectLabel={type.label}/><span>{type.label}</span></CommandItem>)}</CommandGroup></> : null}
    {remoteReady ? !ready || result.isPending || result.isFetching ? <p className="p-3 text-sm text-muted-foreground" role="status">{t('loading')}</p> : result.isError ? <div className="p-2"><ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /></div> : result.data?.records.length ? <><CommandSeparator /><CommandGroup heading={t('records')}>{result.data.records.map(record => <CommandItem key={record.id} value={`record:${record.id}`} onSelect={() => select(record.objectTypeId, record.id)}><RecordIcon iconKey={record.iconKey} objectLabel={record.objectLabel}/><span className="flex min-w-0 flex-col"><span className="truncate">{record.keyword || t('untitledRecord')}</span><span className="text-xs text-muted-foreground">{[record.businessNumber,record.objectLabel].filter(Boolean).join(' · ')}</span></span></CommandItem>)}</CommandGroup>{result.data.hasMoreRecords ? <p className="p-3 text-sm text-muted-foreground">{t('searchRefine')}</p> : null}</> : null : null}
    {resources.length ? <><CommandSeparator /><CommandGroup heading={t('resources')}>{resources.map(item => <CommandItem key={item.url} value={item.url} onSelect={() => { setOpen(false); setOpenMobile(false); window.open(item.url, '_blank', 'noopener,noreferrer'); }}><item.icon /><span>{item.label}</span></CommandItem>)}</CommandGroup></> : null}
    {noLocal && (!remoteReady || ready && !result.isPending && !result.isFetching && !result.isError && !result.data?.records.length) ? <CommandEmpty>{t('noSearchResults')}</CommandEmpty> : null}
  </CommandList></Command></DialogContent></Dialog>;
}
