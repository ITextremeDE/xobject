import { useDeferredValue, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpIcon, ArrowDownIcon, ArrowUpDownIcon, DatabaseIcon, Columns3Icon, PlusIcon, SearchIcon, ChevronsUpDownIcon, GalleryVerticalEndIcon, LayoutDashboardIcon, BellIcon } from 'lucide-react';
import type { AuthUser, ObjectDefinition } from '@xobject/contracts';
import { api, signOut } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarInset, SidebarTrigger, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DefinitionDialog } from './definition-dialog';
import { RecordPanel } from './record-panel';
import { ErrorNotice, Loading } from './feedback';
import { UserMenu } from './user-menu';
import { HeaderSearch } from './header-search';
import { KeyboardHelp } from './keyboard-help';
import { ThemeDropdown } from './theme-dropdown';
import { Kbd } from '@/components/ui/kbd';
import { keyboardCommands } from '@/lib/keyboard';
import { Dashboard } from './dashboard';
import { SettingsPage } from './settings-page';

const narrow = matchMedia('(max-width: 1023px)');
const subscribeNarrow = (listener: () => void) => { narrow.addEventListener('change', listener); return () => narrow.removeEventListener('change', listener); };

export function WorkspaceApp({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  return <SidebarProvider><WorkspaceScreen user={user} onSignOut={onSignOut} /></SidebarProvider>;
}

function WorkspaceScreen({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { setOpenMobile, isMobile } = useSidebar();
  const detailModal = useSyncExternalStore(subscribeNarrow, () => narrow.matches);
  const [editorRevision, setEditorRevision] = useState(0);
  const [workspaceId, setWorkspaceId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const helpOrigin = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<'dashboard' | 'records' | 'settings'>('dashboard');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'workspace' | 'object' | 'field' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const workspaces = useQuery({ queryKey: ['workspaces', user.id], queryFn: () => api('list_workspaces', {}) });
  const workspace = workspaces.data?.find(w => w.id === workspaceId) ?? workspaces.data?.[0];
  const language = user.language ?? workspace?.default_language ?? 'en';
  useEffect(() => { void i18n.changeLanguage(language); }, [i18n, language]);
  const types = useQuery({ queryKey: ['types', workspace?.id, user.id, language], queryFn: () => api('list_object_types', { workspaceId: workspace!.id }), enabled: Boolean(workspace) });
  const selectedType = view === 'records' ? types.data?.find(type => type.id === typeId) ?? types.data?.[0] : undefined;
  const definition = useQuery({ queryKey: ['definition', selectedType?.id, user.id, language], queryFn: () => api('get_object_type', { objectTypeId: selectedType!.id }), enabled: Boolean(selectedType) });
  const logout = useMutation({ mutationFn: signOut, onSuccess: onSignOut });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function navigate(action: () => void) {
    if (busy) return;
    if (dirty) setPendingNavigation(() => action);
    else action();
  }
  function showKeyboardHelp(origin: HTMLButtonElement | null) {
    helpOrigin.current = origin; setOpenMobile(false); setHelpOpen(true);
  }
  function showPage(page: 'dashboard' | 'settings') {
    navigate(() => { setView(page); setRecordId(null); setDirty(false); setOpenMobile(false); });
  }
  function closeRecord() { navigate(() => { setRecordId(null); setDirty(false); }); }
  function selectWorkspace(id: string) {
    navigate(() => { setWorkspaceId(id); setView('dashboard'); setTypeId(''); setRecordId(null); setDirty(false); setOpenMobile(false); });
  }
  function selectType(id: string) {
    navigate(() => { setTypeId(id); setView('records'); setRecordId(null); setDirty(false); setOpenMobile(false); });
  }
  async function created(id: string) {
    const kind = dialog;
    setDialog(null);
    if (kind === 'workspace') { await queryClient.invalidateQueries({ queryKey: ['workspaces'] }); selectWorkspace(id); }
    if (kind === 'object') { await queryClient.invalidateQueries({ queryKey: ['types'] }); selectType(id); }
    if (kind === 'field') await queryClient.invalidateQueries({ queryKey: ['definition', selectedType?.id] });
  }
  const panelDefinition = definition.data?.id === selectedType?.id ? definition.data : undefined;
  return <>
    <Sidebar collapsible="icon" variant="inset" mobileTitle={t('menu')} mobileDescription={t('selectObject')}>
      <SidebarHeader>
        <SidebarMenu><SidebarMenuItem>
          <DropdownMenu><DropdownMenuTrigger render={<SidebarMenuButton data-definition-trigger="workspace" size="lg" className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" disabled={busy || workspaces.isPending} aria-label={t('workspace')} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><GalleryVerticalEndIcon /></div>
              <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{workspace?.name ?? 'xObject'}</span><span className="truncate text-xs">xObject</span></div>
              <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger><DropdownMenuContent className="w-fit" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('workspace')}</DropdownMenuLabel>
              {workspaces.data?.map(item => <DropdownMenuItem key={item.id} className="gap-2 p-2" onClick={() => selectWorkspace(item.id)} disabled={busy}>
                <div className="flex size-6 items-center justify-center rounded-md border"><GalleryVerticalEndIcon /></div>
                {item.name}
              </DropdownMenuItem>)}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup><DropdownMenuItem className="gap-2 p-2" disabled={busy} onClick={() => navigate(() => { setOpenMobile(false); setDialog('workspace'); })}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent"><PlusIcon /></div>
              <div className="font-medium text-muted-foreground">{t('newWorkspace')}</div>
            </DropdownMenuItem></DropdownMenuGroup>
          </DropdownMenuContent></DropdownMenu>
        </SidebarMenuItem></SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem>
          <SidebarMenuButton isActive={view === 'dashboard'} tooltip={t('dashboard')} disabled={busy} onClick={() => showPage('dashboard')}><LayoutDashboardIcon /><span>{t('dashboard')}</span></SidebarMenuButton>
        </SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel>{t('objects')}</SidebarGroupLabel><SidebarGroupContent>
          {types.isPending && workspace ? <Loading /> : types.isError ? <ErrorNotice error={types.error} retry={() => { void types.refetch(); }} /> : <SidebarMenu>{types.data?.map(type => <SidebarMenuItem key={type.id}>
            <SidebarMenuButton isActive={selectedType?.id === type.id} onClick={() => selectType(type.id)} tooltip={type.label} disabled={busy}><DatabaseIcon /><span>{type.label}</span></SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>}
          <SidebarMenu className="mt-2"><SidebarMenuItem><SidebarMenuButton data-definition-trigger="object" tooltip={t('newObject')} disabled={!workspace || busy} onClick={() => navigate(() => { setOpenMobile(false); setDialog('object'); })}><PlusIcon /><span>{t('newObject')}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter><SidebarMenu><SidebarMenuItem><UserMenu placement="sidebar" user={user} busy={busy} signingOut={logout.isPending} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} /></SidebarMenuItem></SidebarMenu></SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className={cn('min-w-0', recordId && !detailModal && 'pr-[26rem]')}>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" aria-label={t('menu')} />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb className="min-w-0" aria-label={t('menu')}><BreadcrumbList className="flex-nowrap">
            {workspace ? <><BreadcrumbItem className="min-w-0"><BreadcrumbLink className="max-w-40 truncate" href="/" aria-disabled={busy || undefined} onClick={event => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); showPage('dashboard');
            }}>{workspace.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /></> : null}
            <BreadcrumbItem className="hidden min-w-0 sm:inline-flex"><BreadcrumbPage className="truncate">{view === 'settings' ? t('settings') : view === 'dashboard' ? t('dashboard') : selectedType?.label ?? workspace?.name ?? 'xObject'}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList></Breadcrumb>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-x-2 pr-4 sm:gap-x-3">
          <HeaderSearch compact={Boolean(recordId)} key={workspace?.id} workspaceId={workspace?.id} workspaceName={workspace?.name} language={language} disabled={busy} onOpenResult={(id, recordId) => navigate(() => { setTypeId(id); setView('records'); setRecordId(recordId ?? null); setDirty(false); setOpenMobile(false); })} />
          <Button variant="outline" size="icon-lg" disabled aria-label={t('notificationsSoon')} title={t('notificationsSoon')}><BellIcon /></Button>
          <ThemeDropdown />
          <UserMenu placement="header" user={user} busy={busy} signingOut={logout.isPending} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
        {logout.isError ? <ErrorNotice error={logout.error} /> : null}
        {view === 'settings' ? <SettingsPage key={editorRevision} user={user} onDirtyChange={setDirty} onBusyChange={setBusy} />
          : workspaces.isPending ? <Loading /> : workspaces.isError ? <ErrorNotice error={workspaces.error} retry={() => { void workspaces.refetch(); }} />
          : !workspace ? <Welcome title={t('noWorkspace')} description={t('noWorkspaceDescription')} action={t('newWorkspace')} onAction={() => setDialog('workspace')} />
          : types.isError ? <ErrorNotice error={types.error} /> : types.isPending ? <Loading />
          : view === 'dashboard' ? <Dashboard workspace={workspace} types={types.data} onOpen={selectType} onCreate={() => setDialog('object')} />
          : !selectedType ? <Welcome title={t('noObjects')} description={t('noObjectsDescription')} action={t('newObject')} onAction={() => setDialog('object')} />
          : definition.isPending ? <Loading /> : definition.isError ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} />
          : panelDefinition ? <RecordList key={panelDefinition.id} definition={panelDefinition} selectedRecord={recordId}
            onOpen={id => navigate(() => { setRecordId(id); setDirty(false); setOpenMobile(false); })}
            onField={() => navigate(() => setDialog('field'))} disabled={busy} /> : null}
      </main>
    </SidebarInset>
    {recordId && panelDefinition ? <RecordPanel key={`${panelDefinition.id}:${recordId}:${editorRevision}`} definition={panelDefinition} recordId={recordId} user={user} mobile={detailModal}
      onClose={closeRecord} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={record => { setRecordId(record.id); setDirty(false); }} /> : null}
    {dialog ? <DefinitionDialog kind={dialog} workspaceId={workspace?.id} objectTypeId={selectedType?.id} onClose={() => setDialog(null)} onCreated={id => { void created(id); }} /> : null}
    <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} finalFocus={() => helpOrigin.current?.isConnected ? helpOrigin.current : document.querySelector<HTMLElement>('[data-user-menu="header"]') ?? true} />
    <AlertDialog open={Boolean(pendingNavigation)} onOpenChange={open => { if (!open) setPendingNavigation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); setEditorRevision(value => value + 1); action?.(); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function Welcome({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <Empty className="flex-1"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onAction}><PlusIcon data-icon="inline-start" />{action}</Button></EmptyContent></Empty>;
}

function RecordList({ definition, selectedRecord, onOpen, onField, disabled }: { definition: ObjectDefinition; selectedRecord: string | null; onOpen: (id: string) => void; onField: () => void; disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ by: string; direction: 'asc' | 'desc' }>({ by: 'updated_at', direction: 'desc' });
  const query = useDeferredValue(search);
  const result = useQuery({ queryKey: ['records', definition.id, query, offset, sort], placeholderData: keepPreviousData, queryFn: () => api('list_records', { objectTypeId: definition.id, query, limit: 25, offset, sortBy: sort.by, sortDirection: sort.direction }) });
  const fields = definition.fields.filter(f => f.technicalName !== 'keyword');
  const columns = [{ name: 'keyword', label: t('keyword') }, ...fields.map(field => ({ name: field.technicalName, label: field.label })), { name: 'updated_at', label: t('updated') }];

  return <>
    <div className="flex flex-wrap items-center justify-between gap-4 py-2"><h1 className="text-2xl font-semibold tracking-tight">{definition.label}</h1><div className="flex flex-wrap gap-2"><Button data-definition-trigger="field" variant="outline" onClick={onField} disabled={disabled}><Columns3Icon data-icon="inline-start" />{t('newField')}</Button><Button onClick={() => onOpen('new')} disabled={disabled}><PlusIcon data-icon="inline-start" />{t('newRecord')}</Button></div></div>
    <Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="record-search" className="sr-only">{t('search')}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput aria-keyshortcuts={keyboardCommands.search.aria} id="record-search" placeholder={t('search')} value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setOffset(0); }} /><InputGroupAddon align="inline-end"><Kbd>{keyboardCommands.search.key}</Kbd></InputGroupAddon></InputGroup></Field>
    {result.isPending ? <Loading /> : result.isError ? <ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /> : <>
      <div className="min-w-0 overflow-hidden rounded-lg border">
        <Table><TableHeader><TableRow>{columns.map(column => {
          const active = sort.by === column.name;
          const Icon = active ? (sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon) : ArrowUpDownIcon;
          return <TableHead key={column.name} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><Button variant="ghost" className="-ml-2" disabled={disabled} aria-label={t('sortColumn', { column: column.label, direction: t(active && sort.direction === 'asc' ? 'sortDescending' : 'sortAscending') })} onClick={() => { setSort({ by: column.name, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' }); setOffset(0); }}>{column.label}<Icon data-icon="inline-end" /></Button></TableHead>;
        })}</TableRow></TableHeader>
          <TableBody>{result.data.records.map(record => <TableRow key={record.id} data-state={record.id === selectedRecord ? 'selected' : undefined}>
            <TableCell><Button variant="link" className="max-w-80 justify-start truncate px-0 hover:no-underline" onClick={() => onOpen(record.id)} disabled={disabled}>{record.keyword}</Button></TableCell>
            {fields.map(field => <TableCell key={field.id} className="max-w-64 truncate" title={String(record[field.technicalName] ?? '')}>{String(record[field.technicalName] ?? '—')}</TableCell>)}
            <TableCell className="text-muted-foreground">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(record.updated_at))}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {!result.data.records.length ? <Empty><EmptyHeader><EmptyTitle>{t(search ? 'noMatches' : 'noRecords')}</EmptyTitle><EmptyDescription>{t(search ? 'noMatchesDescription' : 'noRecordsDescription')}</EmptyDescription></EmptyHeader>{!search ? <EmptyContent><Button onClick={() => onOpen('new')}><PlusIcon data-icon="inline-start" />{t('newRecord')}</Button></EmptyContent> : null}</Empty> : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{t('count', { count: result.data.total })}</span>{result.data.total > 25 || offset > 0 ? <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>{t('previous')}</Button><span>{t('page', { page: offset / 25 + 1 })}</span><Button variant="outline" size="sm" disabled={offset + 25 >= result.data.total} onClick={() => setOffset(offset + 25)}>{t('next')}</Button></div> : null}</footer>
    </>}
  </>;
}
