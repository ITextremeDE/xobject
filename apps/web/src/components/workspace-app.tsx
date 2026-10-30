import { resourceLinks } from '@/lib/resource-links';
import { RegionalProvider } from '@/lib/regional-context';
import { effectiveRegionalSettings } from '@xobject/contracts';
import { TimeZoneProvider } from '@/lib/time-zone-context';
import { effectiveTimeZone } from '@xobject/contracts';
import { WorkspaceLanguageProvider } from '@/lib/workspace-languages';
import { effectiveWorkspaceLanguage, languageCodes } from '@xobject/contracts';
import { WorkspaceMenuAppearanceProvider } from '@/lib/menu-appearance';
import { useWorkspaceAppearance } from '@/lib/workspace-appearance';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useLocation, matchPath, useNavigate } from 'react-router';
import { DatabaseIcon, PlusIcon, ChevronsUpDownIcon, GalleryVerticalEndIcon, LayoutDashboardIcon, BellIcon } from 'lucide-react';
import { type AuthUser } from '@xobject/contracts';
import { api, signOut } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
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
import { RecordList } from './record-list';
const Dashboard = lazy(() => import('./dashboard').then(module => ({ default: module.Dashboard })));
const SettingsPage = lazy(() => import('./settings-page').then(module => ({ default: module.SettingsPage })));



const narrow = matchMedia('(max-width: 1023px)');
const subscribeNarrow = (listener: () => void) => { narrow.addEventListener('change', listener); return () => narrow.removeEventListener('change', listener); };

export function WorkspaceApp({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const access = useQuery({ queryKey: ['access-context', user.id], queryFn: () => api('get_access_context', {}) });
  if (access.isPending) return <Loading />;
  if (access.isError) return <ErrorNotice error={access.error} retry={() => { void access.refetch(); }} />;
  return <SidebarProvider><WorkspaceScreen user={{ ...user, isAdmin: access.data.isAdmin }} onSignOut={onSignOut} /></SidebarProvider>;
}

function WorkspaceScreen({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { setOpenMobile, isMobile } = useSidebar();
  const detailModal = useSyncExternalStore(subscribeNarrow, () => narrow.matches);
  const [editorRevision, setEditorRevision] = useState(0);
  const location = useLocation();
  const routeNavigate = useNavigate();
  const settingsOpen = location.pathname === '/settings';
  const settingsBackground = settingsOpen && typeof location.state?.backgroundPath === 'string' && /^\/w\/[^/?]+(?:\/objects\/[^/?]+(?:\/[^/?]+)?)?(?:\?.*)?$/.test(location.state.backgroundPath) ? location.state.backgroundPath : null;
  const contentPath = settingsOpen ? (settingsBackground?.split('?')[0] ?? (location.state?.workspaceCode ? `/w/${location.state.workspaceCode}` : '/')) : location.pathname;
  const objectRoute = matchPath('/w/:code/objects/:name/:recordId?', contentPath);
  const dashboardRoute = matchPath('/w/:code', contentPath);
  const workspaceCode = objectRoute?.params.code ?? dashboardRoute?.params.code ?? (location.pathname === '/settings' && typeof location.state?.workspaceCode === 'string' ? location.state.workspaceCode : undefined);
  const view = objectRoute ? 'records' : 'dashboard';
  const recordId = objectRoute?.params.recordId ?? null;
  const validRecordId = !recordId || recordId === 'new' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId);
  const validRoute = validRecordId && Boolean(objectRoute || dashboardRoute || location.pathname === '/' || location.pathname === '/settings');
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpOrigin = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<'workspace' | 'object' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const workspaces = useQuery({ queryKey: ['workspaces', user.id], queryFn: () => api('list_workspaces', {}) });
  const workspace = workspaceCode ? workspaces.data?.find(w => w.code === workspaceCode) : workspaces.data?.[0];
  useWorkspaceAppearance(workspace?.appearance);
  const canManage = Boolean(user.isAdmin || workspace?.role === 'designer');
  const language = effectiveWorkspaceLanguage(user.language, workspace?.available_languages ?? languageCodes, workspace?.default_language ?? 'en');
  useEffect(() => { void i18n.changeLanguage(language); }, [i18n, language]);
  const types = useQuery({ queryKey: ['types', workspace?.id, user.id, language], queryFn: () => api('list_object_types', { workspaceId: workspace!.id, includeInactive: true }), enabled: Boolean(workspace) });
  const selectedType = view === 'records' ? types.data?.find(type => type.technicalName === objectRoute?.params.name) : undefined;
  const dashboardPath = workspace ? `/w/${workspace.code}` : '/';
  const objectPath = selectedType ? `${dashboardPath}/objects/${selectedType.technicalName}` : dashboardPath;
  const definition = useQuery({ queryKey: ['definition', selectedType?.id, user.id, language], queryFn: () => api('get_object_type', { objectTypeId: selectedType!.id }), enabled: Boolean(selectedType) });
  const logout = useMutation({ mutationFn: signOut, onSuccess: onSignOut });
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (busy || dirty) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { if (busy && blocker.state === 'blocked') blocker.reset(); }, [busy, blocker]);
  useEffect(() => { if (location.pathname === '/' && workspace) void routeNavigate(dashboardPath, { replace: true }); }, [location.pathname, workspace, dashboardPath, routeNavigate]);
  useEffect(() => { setOpenMobile(false); setDialog(null); }, [location.pathname, setOpenMobile]);
  useEffect(() => {
    if (savedRecordId && !busy && !dirty) {
      if (recordId === 'new') void routeNavigate(`${objectPath}/${savedRecordId}${location.search}`, { replace: true });
      setSavedRecordId(null);
    }
  }, [savedRecordId, busy, dirty, recordId, objectPath, location.search, routeNavigate]);


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
  function navigateSidebar(path: string) {
    if (busy) return;
    if (location.pathname !== path) { void routeNavigate(path); return; }
    navigate(() => {
      setOpenMobile(false);
      // Re-read this view's data without replacing the document, URL or history entry.
      void queryClient.invalidateQueries({ predicate: ({ queryKey }) =>
        (queryKey[0] === 'workspaces' && queryKey[1] === user.id) ||
        (queryKey[0] === 'types' && queryKey[1] === workspace?.id) ||
        (['dashboard', 'workspace-records'].includes(String(queryKey[0])) && queryKey[1] === workspace?.id) ||
        (selectedType && ['definition', 'records'].includes(String(queryKey[0])) && queryKey[1] === selectedType.id) === true,
      });
    });
  }
  function showPage(page: 'dashboard' | 'settings') {
    if (!busy) void routeNavigate(page === 'settings' ? '/settings' : dashboardPath, { state: page === 'settings' ? { workspaceCode: workspace?.code, backgroundPath: `${location.pathname}${location.search}` } : null });
  }
  function closeRecord() { if (!busy) void routeNavigate(`${objectPath}${location.search}`); }
  function selectWorkspace(id: string) {
    const selected = workspaces.data?.find(item => item.id === id);
    if (selected && !busy) void routeNavigate(`/w/${selected.code}`);
  }
  function selectType(id: string) {
    const selected = types.data?.find(item => item.id === id);
    if (selected && !busy) void routeNavigate(`${dashboardPath}/objects/${selected.technicalName}`);
  }
  async function created(id: string) {
    const kind = dialog;
    setDialog(null);
    if (kind === 'workspace') {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      const items = await queryClient.fetchQuery({ queryKey: ['workspaces', user.id], queryFn: () => api('list_workspaces', {}) });
      const selected = items.find(item => item.id === id);
      if (selected) void routeNavigate(`/w/${selected.code}`);
    }
    if (kind === 'object') {
      await queryClient.invalidateQueries({ queryKey: ['types'] });
      const items = await queryClient.fetchQuery({ queryKey: ['types', workspace?.id, user.id, language], queryFn: () => api('list_object_types', { workspaceId: workspace!.id }) });
      const selected = items.find(item => item.id === id);
      if (selected) void routeNavigate(`${dashboardPath}/objects/${selected.technicalName}`);
    }
  }
  const panelDefinition = definition.data?.id === selectedType?.id ? definition.data : undefined;
  return <RegionalProvider value={effectiveRegionalSettings(workspace?.regional, user.regionalPreferences)}><TimeZoneProvider value={effectiveTimeZone(user.timeZone, workspace?.time_zone)}><WorkspaceLanguageProvider languages={workspace?.label_languages}><WorkspaceMenuAppearanceProvider appearance={workspace?.appearance}>
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
            {user.isAdmin ? <><DropdownMenuSeparator />
            <DropdownMenuGroup><DropdownMenuItem className="gap-2 p-2" disabled={busy} onClick={() => navigate(() => { setOpenMobile(false); setDialog('workspace'); })}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent"><PlusIcon /></div>
              <div className="font-medium text-muted-foreground">{t('newWorkspace')}</div>
            </DropdownMenuItem></DropdownMenuGroup></> : null}
          </DropdownMenuContent></DropdownMenu>
        </SidebarMenuItem></SidebarMenu>
          <HeaderSearch key={workspace?.id} workspaceId={workspace?.id} workspaceName={workspace?.name} language={language} disabled={busy} canSearchRecords={Boolean(user.isAdmin)} objectTypes={types.data ?? []} onNavigate={(target) => { if (target === 'settings') showPage('settings'); else if (target === 'keyboard') showKeyboardHelp(null); else if (target === 'dashboard') navigateSidebar(dashboardPath); }} onOpenResult={(id, recordId) => { const selected = types.data?.find(type => type.id === id); if (selected && !busy) void routeNavigate(`${dashboardPath}/objects/${selected.technicalName}${recordId ? `/${recordId}` : ''}`); }} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem>
          <SidebarMenuButton isActive={view === 'dashboard'} tooltip={t('dashboard')} disabled={busy} onClick={() => navigateSidebar(dashboardPath)}><LayoutDashboardIcon /><span>{t('dashboard')}</span></SidebarMenuButton>
        </SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel>{t('objects')}</SidebarGroupLabel><SidebarGroupContent>
          {types.isPending && workspace ? <Loading /> : types.isError ? <ErrorNotice error={types.error} retry={() => { void types.refetch(); }} /> : <SidebarMenu>{types.data?.filter(type => !type.state || type.state === 'active').map(type => <SidebarMenuItem key={type.id}>
            <SidebarMenuButton isActive={selectedType?.id === type.id} onClick={() => navigateSidebar(`${dashboardPath}/objects/${type.technicalName}`)} tooltip={type.label} disabled={busy}><DatabaseIcon /><span>{type.label}</span></SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>}
          {canManage ? <SidebarMenu className="mt-2"><SidebarMenuItem><SidebarMenuButton data-definition-trigger="object" tooltip={t('newObject')} disabled={!workspace || busy} onClick={() => navigate(() => { setOpenMobile(false); setDialog('object'); })}><PlusIcon /><span>{t('newObject')}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu> : null}
        </SidebarGroupContent></SidebarGroup>
        <SidebarGroup className="mt-auto"><SidebarGroupLabel>{t('resources')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{resourceLinks.map(item => <SidebarMenuItem key={item.label}><SidebarMenuButton tooltip={t('resourceNewTab', { name: t(item.label) })} aria-label={t('resourceNewTab', { name: t(item.label) })} render={<a href={item.href} target="_blank" rel="noopener noreferrer" />} onClick={() => setOpenMobile(false)}><item.icon /><span>{t(item.label)}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter>

        <SidebarMenu><SidebarMenuItem><UserMenu placement="sidebar" user={user} busy={busy} signingOut={logout.isPending} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} /></SidebarMenuItem></SidebarMenu></SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className={cn('min-w-0', user.isAdmin && recordId && !detailModal && 'pr-[26rem]')}>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" aria-label={t('menu')} />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb className="min-w-0" aria-label={t('menu')}><BreadcrumbList className="flex-nowrap">
            {workspace ? <><BreadcrumbItem className="min-w-0"><BreadcrumbLink className="max-w-40 truncate" render={<Link to={dashboardPath} />} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}>{workspace.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /></> : null}
            <BreadcrumbItem className="hidden min-w-0 sm:inline-flex"><BreadcrumbPage className="truncate">{view === 'dashboard' ? t('dashboard') : selectedType?.label ?? workspace?.name ?? 'xObject'}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList></Breadcrumb>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-x-2 pr-4 sm:gap-x-3">

          <Button variant="outline" size="icon-lg" disabled aria-label={t('notificationsSoon')} title={t('notificationsSoon')}><BellIcon /></Button>
          <ThemeDropdown />
          <UserMenu placement="header" user={user} busy={busy} signingOut={logout.isPending} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
        {logout.isError ? <ErrorNotice error={logout.error} /> : null}
        {!validRoute || (!workspaces.isPending && !workspaces.isError && workspaceCode && !workspace) ? <RouteNotFound onBack={() => { if (workspaces.data?.[0]) void routeNavigate(`/w/${workspaces.data[0].code}`); else void routeNavigate('/'); }} />
          : workspaces.isPending ? <Loading /> : workspaces.isError ? <ErrorNotice error={workspaces.error} retry={() => { void workspaces.refetch(); }} />
          : !workspace ? user.isAdmin ? <Welcome title={t('noWorkspace')} description={t('noWorkspaceDescription')} action={t('newWorkspace')} onAction={() => setDialog('workspace')} /> : <Empty><EmptyHeader><EmptyTitle>{t('noWorkspace')}</EmptyTitle><EmptyDescription>{t('noWorkspaceAssigned')}</EmptyDescription></EmptyHeader></Empty>
          : types.isError ? <ErrorNotice error={types.error} /> : types.isPending ? <Loading />
          : view === 'dashboard' ? <Suspense fallback={<Loading />}><Dashboard canReadContent={Boolean(user.isAdmin)} canManage={canManage} workspace={workspace} types={types.data.filter(type => !type.state || type.state === 'active')} onOpen={(id, recordId) => { const type = types.data?.find(type => type.id === id); if (type) navigate(() => { void routeNavigate(`${dashboardPath}/objects/${type.technicalName}${recordId ? `/${recordId}` : ''}`); }); }} onCreate={() => setDialog('object')} /></Suspense>
          : !selectedType ? <RouteNotFound onBack={() => showPage('dashboard')} />
          : definition.isPending ? <Loading /> : definition.isError ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} />
          : !user.isAdmin ? <Empty><EmptyHeader><EmptyTitle>{selectedType.label}</EmptyTitle><EmptyDescription>{t('contentAccessPending')}</EmptyDescription></EmptyHeader></Empty>
          : panelDefinition ? <RecordList key={panelDefinition.id} definition={panelDefinition} selectedRecord={recordId}
            basePath={objectPath}
            disabled={busy} /> : null}
      </main>
    </SidebarInset>
    {user.isAdmin && !settingsOpen && validRoute && recordId && panelDefinition && (recordId !== 'new' || !panelDefinition.state || panelDefinition.state === 'active') ? <RecordPanel key={`${panelDefinition.id}:${recordId}:${editorRevision}`} definition={panelDefinition} recordId={recordId} user={user} mobile={detailModal}
      onClose={closeRecord} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={record => { setSavedRecordId(record.id); setDirty(false); }} /> : null}
    {settingsOpen ? <Suspense fallback={<Loading />}><SettingsPage key={editorRevision} user={user} workspace={workspace} onDirtyChange={setDirty} onBusyChange={setBusy} onClose={() => { if (busy) return; if (settingsBackground) void routeNavigate(-1); else void routeNavigate(dashboardPath, { replace: true }); }} /></Suspense> : null}
    {dialog ? <DefinitionDialog kind={dialog} workspaceId={workspace?.id} objectTypeId={selectedType?.id} onClose={() => navigate(() => { setDialog(null); setDirty(false); })} onDirtyChange={setDirty} onBusyChange={setBusy} onCreated={id => { setDirty(false); setBusy(false); void created(id); }} /> : null}
    <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} finalFocus={() => helpOrigin.current?.isConnected ? helpOrigin.current : document.querySelector<HTMLElement>('[data-user-menu="header"]') ?? true} />
    <AlertDialog open={Boolean(pendingNavigation) || (blocker.state === 'blocked' && !busy)} onOpenChange={open => { if (!open) { setPendingNavigation(null); if (blocker.state === 'blocked') blocker.reset(); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); setEditorRevision(value => value + 1); if (blocker.state === 'blocked') blocker.proceed(); else action?.(); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </WorkspaceMenuAppearanceProvider></WorkspaceLanguageProvider></TimeZoneProvider></RegionalProvider>;
}

function RouteNotFound({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return <Welcome title={t('routeNotFound')} description={t('routeNotFoundDescription')} action={t('dashboard')} onAction={onBack} icon={LayoutDashboardIcon} />;
}

function Welcome({ title, description, action, onAction, icon: Icon = PlusIcon }: { title: string; description: string; action: string; onAction: () => void; icon?: typeof PlusIcon }) {
  return <Empty className="flex-1"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onAction}><Icon data-icon="inline-start" />{action}</Button></EmptyContent></Empty>;
}
