import {TransientDraftProvider,useTransientDraftPending} from '@/lib/transient-draft';
import {BrowserPresence} from './browser-presence';
import {useLiveUpdates} from '@/lib/use-live-updates';
import {Alert,AlertDescription} from './ui/alert';
import {defaultNavigationLayout} from '@xobject/contracts';
import {WorkspaceNavigation} from './workspace-navigation';
import {NavigationDialog} from './navigation-dialog';
import {linkedCreationSchema} from '@/lib/linked-record';
import {RecycleBinLoading,WorkspaceLoading,DashboardLoading,RecordPageLoading,RecordListLoading,SettingsLoading} from './loading';
import {TablePreferencesProvider} from '@/lib/column-preferences';
import { recordReturnPath } from '@/lib/record-navigation';
import { resourceLinks } from '@/lib/resource-links';
import { RegionalProvider } from '@/lib/regional-context';
import { effectiveRegionalSettings } from '@xobject/contracts';
import { TimeZoneProvider } from '@/lib/time-zone-context';
import { effectiveTimeZone } from '@xobject/contracts';
import { WorkspaceLanguageProvider } from '@/lib/workspace-languages';
import { effectiveWorkspaceLanguage, languageCodes } from '@xobject/contracts';
import { WorkspaceMenuAppearanceProvider } from '@/lib/menu-appearance';
import { useWorkspaceAppearance } from '@/lib/workspace-appearance';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useLocation, matchPath, useNavigate } from 'react-router';
import {WorkspaceLogo} from './workspace-logo';
import { Trash2Icon, PlusIcon, ChevronsUpDownIcon, LayoutDashboardIcon, BellIcon } from 'lucide-react';
import { type AuthUser } from '@xobject/contracts';
import { api, signOut,blocksCachedView } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarInset, SidebarTrigger, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DefinitionDialog } from './definition-dialog';
const RecordPage=lazy(()=>import('./record-page').then(module=>({default:module.RecordPage})));
import { ErrorNotice, Loading } from './feedback';
import { UserMenu } from './user-menu';
import { HeaderSearch,WorkspaceSearchTrigger } from './header-search';
import { KeyboardHelp } from './keyboard-help';
import { ThemeDropdown } from './theme-dropdown';
import { RecordList } from './record-list';
const RecycleBin=lazy(()=>import('./recycle-bin').then(module=>({default:module.RecycleBin})));
const Dashboard = lazy(() => import('./dashboard').then(module => ({ default: module.Dashboard })));
const SettingsPage = lazy(() => import('./settings-page').then(module => ({ default: module.SettingsPage })));



export function WorkspaceApp({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const access = useQuery({ queryKey: ['access-context', user.id], queryFn: () => api('get_access_context', {}) });
  if (access.isPending) return <WorkspaceLoading/>;
  if (blocksCachedView(access)) return <ErrorNotice error={access.error} retry={() => { void access.refetch(); }} />;
  return <TransientDraftProvider><TablePreferencesProvider userId={user.id}><SidebarProvider className="safe-area-shell"><WorkspaceScreen user={{ ...user, isAdmin: access.data!.isAdmin }} onSignOut={onSignOut} /></SidebarProvider></TablePreferencesProvider></TransientDraftProvider>;
}

function WorkspaceScreen({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { setOpenMobile, isMobile } = useSidebar();
  const [editorRevision, setEditorRevision] = useState(0);
  const location = useLocation();
  const routeNavigate = useNavigate();
  const settingsOpen = location.pathname === '/settings';
  const settingsBackground = settingsOpen && typeof location.state?.backgroundPath === 'string' && /^\/w\/[^/?]+(?:\/objects\/[^/?]+(?:\/[^/?]+)?|\/recycle-bin)?(?:\?.*)?$/.test(location.state.backgroundPath) ? location.state.backgroundPath : null;
  const contentPath = settingsOpen ? (settingsBackground?.split('?')[0] ?? (location.state?.workspaceCode ? `/w/${location.state.workspaceCode}` : '/')) : location.pathname;
  const objectRoute = matchPath('/w/:code/objects/:name/:recordId?', contentPath);
  const recycleRoute=matchPath('/w/:code/recycle-bin',contentPath);
  const dashboardRoute = matchPath('/w/:code', contentPath);
  const workspaceCode = objectRoute?.params.code ?? recycleRoute?.params.code ?? dashboardRoute?.params.code ?? (location.pathname === '/settings' ? new URLSearchParams(location.search).get('workspace') ?? (typeof location.state?.workspaceCode==='string'?location.state.workspaceCode:undefined) : undefined);
  const view = recycleRoute?'recycle-bin':objectRoute ? 'records' : 'dashboard';
  const recordId = objectRoute?.params.recordId ?? null;
  const linkedDraft=linkedCreationSchema.safeParse(location.state?.linkedCreation);
  const validRecordId = !recordId || recordId === 'new' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId);
  const validRoute = validRecordId && Boolean(recycleRoute || objectRoute || dashboardRoute || location.pathname === '/' || location.pathname === '/settings');
  const [returnAfterAccessLoss,setReturnAfterAccessLoss]=useState(false);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [navigationOpen,setNavigationOpen]=useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpOrigin = useRef<HTMLElement | null>(null);
  const navigationOrigin=useRef<HTMLElement|null>(null);
  const [dialog, setDialog] = useState<'workspace' | 'object' | null>(null);
  const [dirty, setDirty] = useState(false);
  const transientDirty=useTransientDraftPending();
  const guardedDirty=dirty||transientDirty;
  const [busy, setBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const workspaces = useQuery({ queryKey: ['workspaces', user.id], queryFn: () => api('list_workspaces', {}) });
  const workspace = workspaceCode ? workspaces.data?.find(w => w.code === workspaceCode) : workspaces.data?.[0];
  useWorkspaceAppearance(workspace?.appearance);
  const live=useLiveUpdates(workspace?.id,guardedDirty,busy);
  const canManage = Boolean(user.isAdmin || workspace?.role === 'designer');
  const language = effectiveWorkspaceLanguage(user.language, workspace?.available_languages ?? languageCodes, workspace?.default_language ?? 'en');
  useEffect(() => { if(workspaces.isSuccess)void i18n.changeLanguage(language); }, [i18n, language,workspaces.isSuccess]);
  const types = useQuery({ queryKey: ['types', workspace?.id, user.id, language], queryFn: async () => (await api('list_object_types', { workspaceId: workspace!.id, includeInactive: true })).sort((a,b)=>new Intl.Collator(language,{sensitivity:'base'}).compare(a.label,b.label)||a.id.localeCompare(b.id)), enabled: Boolean(workspace) });
  const navigationSettings=useQuery({queryKey:['workspace-navigation',workspace?.id,user.id,language],queryFn:()=>api('get_workspace_navigation',{workspaceId:workspace!.id}),enabled:Boolean(workspace)});
  useEffect(()=>{if(types.isSuccess&&navigationSettings.data)void queryClient.invalidateQueries({queryKey:['workspace-navigation',workspace?.id]});},[types.dataUpdatedAt,workspace?.id]);
  const navigationLayout=navigationSettings.data?.personal.layout??navigationSettings.data?.workspace.layout??defaultNavigationLayout();
  const selectedType = view === 'records' ? types.data?.find(type => type.technicalName === objectRoute?.params.name) : undefined;
  const dashboardPath = workspace ? `/w/${workspace.code}` : '/';
  const objectPath = selectedType ? `${dashboardPath}/objects/${selectedType.technicalName}` : dashboardPath;
  const definition = useQuery({ queryKey: ['definition', selectedType?.id, user.id, language], queryFn: () => api('get_object_type', { objectTypeId: selectedType!.id }), enabled: Boolean(selectedType) });
  const logout = useMutation({ mutationFn: signOut, onSuccess: onSignOut });
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (busy || guardedDirty) && (currentLocation.pathname !== nextLocation.pathname || (currentLocation.search !== nextLocation.search && !(currentLocation.pathname==='/settings'&&nextLocation.pathname==='/settings'&&new URLSearchParams(currentLocation.search).get('workspace')===new URLSearchParams(nextLocation.search).get('workspace')))));
  useEffect(() => { if (busy && blocker.state === 'blocked') blocker.reset(); }, [busy, blocker]);
  useEffect(() => { if (location.pathname === '/' && workspace) void routeNavigate(dashboardPath, { replace: true }); }, [location.pathname, workspace, dashboardPath, routeNavigate]);
  useEffect(() => { setOpenMobile(false); setDialog(null);setNavigationOpen(false); }, [location.pathname, setOpenMobile]);
  useEffect(() => {
    if (savedRecordId && !busy && !dirty) {
      if (recordId === 'new') void routeNavigate(`${objectPath}/${savedRecordId}${location.search}`, { replace: true, state:{...location.state,linkedCreation:undefined} });
      setSavedRecordId(null);
    }
  }, [savedRecordId, busy, dirty, recordId, objectPath, location.search, location.state, routeNavigate]);


  useEffect(() => {
    if (!guardedDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [guardedDirty]);
  function navigate(action: () => void) {
    if (busy) return;
    if (guardedDirty) setPendingNavigation(() => action);
    else action();
  }
  function showKeyboardHelp(origin: HTMLButtonElement | null) {
    helpOrigin.current = origin; setOpenMobile(false); setHelpOpen(true);
  }
  function navigateSidebar(path: string) {
    if (busy) return;
    if (`${location.pathname}${location.search}` !== path) { void routeNavigate(path); return; }
    navigate(() => {
      setOpenMobile(false);
      // Re-read this view's data without replacing the document, URL or history entry.
      void queryClient.invalidateQueries({ predicate: ({ queryKey }) =>
        (queryKey[0] === 'workspaces' && queryKey[1] === user.id) ||
        (['types','workspace-navigation'].includes(String(queryKey[0])) && queryKey[1] === workspace?.id) ||
        (['dashboard', 'workspace-records','recycled-records'].includes(String(queryKey[0])) && queryKey[1] === workspace?.id) ||
        (selectedType && ['definition', 'records'].includes(String(queryKey[0])) && queryKey[1] === selectedType.id) === true,
      });
    });
  }
  function showPage(page: 'dashboard' | 'settings') {
    if (!busy) void routeNavigate(page === 'settings' ? `/settings${workspace?`?workspace=${encodeURIComponent(workspace.code)}`:''}` : dashboardPath, { state: page === 'settings' ? { workspaceCode: workspace?.code, backgroundPath: `${location.pathname}${location.search}` } : null });
  }
  useEffect(()=>{if(returnAfterAccessLoss&&!busy&&!dirty){setReturnAfterAccessLoss(false);void routeNavigate(recordReturnPath(location.state?.recordOrigin,dashboardPath,objectPath,location.search));}},[returnAfterAccessLoss,busy,dirty,routeNavigate,location.state,location.search,dashboardPath,objectPath]);
  function closeRecord() {
    if (!busy) void routeNavigate(recordReturnPath(location.state?.recordOrigin, dashboardPath, objectPath, location.search), { state: { focusRecordId: recordId } });
  }
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
  const closeSettings=()=>{if(busy)return;if(settingsBackground)void routeNavigate(-1);else void routeNavigate(dashboardPath,{replace:true});};
  const pageLoading=view==='recycle-bin'?<RecycleBinLoading/>:view==='dashboard'?<DashboardLoading/>:recordId?<RecordPageLoading isNew={recordId==='new'}/>:<RecordListLoading title={selectedType?.label}/>;
  const panelDefinition = definition.data?.id === selectedType?.id ? definition.data : undefined;
  return <RegionalProvider value={effectiveRegionalSettings(workspace?.regional, user.regionalPreferences)}><TimeZoneProvider value={effectiveTimeZone(user.timeZone, workspace?.time_zone)}><WorkspaceLanguageProvider languages={workspace?.label_languages}><WorkspaceMenuAppearanceProvider appearance={workspace?.appearance}>
<HeaderSearch key={workspace?.id} workspaceId={workspace?.id} workspaceName={workspace?.name} language={language} disabled={busy} canSearchRecords={true} objectTypes={(types.data??[]).filter(type=>type.permissions?.read===true)} onNavigate={(target) => { if(target==='navigation'){navigate(()=>{navigationOrigin.current=document.querySelector<HTMLElement>('[data-workspace-search-trigger]');setOpenMobile(false);setNavigationOpen(true);});} else if (target === 'settings') showPage('settings'); else if (target === 'keyboard') showKeyboardHelp(null); else if (target === 'dashboard') navigateSidebar(dashboardPath); else if (target === 'recycle-bin') navigateSidebar(`${dashboardPath}/recycle-bin`); }} onOpenResult={(id, recordId) => { const selected = types.data?.find(type => type.id === id); if (selected && !busy) void routeNavigate(`${dashboardPath}/objects/${selected.technicalName}${recordId ? `/${recordId}` : ''}`); }}>
    <Sidebar collapsible="icon" variant="inset" mobileTitle={t('menu')} mobileDescription={t('selectObject')}>
      <SidebarHeader className="safe-area-sidebar-header">
        <SidebarMenu><SidebarMenuItem>
          <DropdownMenu><DropdownMenuTrigger render={<SidebarMenuButton data-definition-trigger="workspace" size="lg" className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" disabled={busy || workspaces.isPending} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><WorkspaceLogo icon={workspace?.appearance.logoIcon??'layers'}/></div>
              <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{workspace?.name ?? 'xObject'}</span><span className="truncate text-xs">xObject</span></div>
              <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger><DropdownMenuContent className="w-fit" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('workspace')}</DropdownMenuLabel>
              {workspaces.data?.map(item => <DropdownMenuItem key={item.id} className="gap-2 p-2" onClick={() => selectWorkspace(item.id)} disabled={busy}>
                <div className="flex size-6 items-center justify-center rounded-md border"><WorkspaceLogo icon={item.appearance.logoIcon}/></div>
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
          <WorkspaceSearchTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupContent><SidebarMenu className="gap-1"><SidebarMenuItem>
          <SidebarMenuButton isActive={view === 'dashboard'} tooltip={t('dashboard')} disabled={busy} onClick={() => navigateSidebar(dashboardPath)}><LayoutDashboardIcon /><span>{t('dashboard')}</span></SidebarMenuButton>
        </SidebarMenuItem><SidebarMenuItem><SidebarMenuButton isActive={view==='recycle-bin'} tooltip={t('recycleBin')} disabled={busy||!workspace} onClick={()=>navigateSidebar(`${dashboardPath}/recycle-bin`)}><Trash2Icon/><span>{t('recycleBin')}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>
        {workspace?(navigationSettings.isPending?<Loading variant="sidebar"/>:navigationSettings.isError?<ErrorNotice error={navigationSettings.error} retry={()=>{void navigationSettings.refetch();}}/>:<WorkspaceNavigation settings={navigationSettings.data} layout={navigationLayout} workspaceCode={workspace.code} selectedObjectId={selectedType?.id} recordId={recordId} search={location.search} disabled={busy} onNavigate={navigateSidebar}/>):null}
        {canManage?<SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton data-definition-trigger="object" tooltip={t('newObject')} disabled={!workspace||busy} onClick={()=>navigate(()=>{setOpenMobile(false);setDialog('object');})}><PlusIcon/><span>{t('newObject')}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>:null}
        {workspace&&navigationSettings.isPending?<div className="mt-auto"><Loading variant="sidebar"/></div>:(!workspace||navigationSettings.isSuccess)&&navigationLayout.resources?<SidebarGroup className="mt-auto"><SidebarGroupLabel>{t('resources')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">{resourceLinks.map(item => <SidebarMenuItem key={item.label}><SidebarMenuButton size="sm" tooltip={t('resourceNewTab', { name: t(item.label) })} aria-label={t('resourceNewTab', { name: t(item.label) })} render={<a href={item.href} target="_blank" rel="noopener noreferrer" />} onClick={() => setOpenMobile(false)}><item.icon /><span>{t(item.label)}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>:null}
      </SidebarContent>
      <SidebarFooter className="safe-area-sidebar-footer">

        <SidebarMenu><SidebarMenuItem><UserMenu placement="sidebar" user={user} busy={busy} signingOut={logout.isPending} onNavigation={workspace?(origin)=>{if(!dirty&&!busy){navigationOrigin.current=origin;setOpenMobile(false);setNavigationOpen(true);}}:undefined} navigationDisabled={dirty||navigationSettings.isPending||navigationSettings.isError} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} /></SidebarMenuItem></SidebarMenu></SidebarFooter>
      <SidebarRail aria-label={t('navigation')} title={t('navigation')} />
    </Sidebar>
    {navigationOpen&&workspace&&navigationSettings.data?<NavigationDialog finalFocus={()=>navigationOrigin.current?.getClientRects().length?navigationOrigin.current:document.querySelector<HTMLElement>('[data-user-menu="header"]')??true} key={workspace.id} settings={navigationSettings.data} workspaceId={workspace.id} onClose={()=>{setNavigationOpen(false);setDirty(false);}} onDirtyChange={setDirty} onBusyChange={setBusy}/>:null}
    <SidebarInset className="min-w-0">
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" aria-label={t('menu')} />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb className="min-w-0" aria-label={t('menu')}><BreadcrumbList className="flex-nowrap">
            {workspace ? <><BreadcrumbItem className="min-w-0"><BreadcrumbLink className="max-w-40 truncate" render={<Link to={dashboardPath} />} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}>{workspace.name}</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /></> : null}
            <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">{recordId && selectedType ? <BreadcrumbLink className="max-w-48 truncate" render={<Link to={objectPath} />} onClick={event => { if (busy) event.preventDefault(); }}>{selectedType.label}</BreadcrumbLink> : <BreadcrumbPage className="truncate">{view === 'recycle-bin'?t('recycleBin'):view === 'dashboard' ? t('dashboard') : selectedType?.label ?? workspace?.name ?? 'xObject'}</BreadcrumbPage>}</BreadcrumbItem>{recordId ? <><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem className="hidden min-w-0 md:inline-flex"><BreadcrumbPage className="truncate">{t(recordId === 'new' ? 'newRecord' : 'details')}</BreadcrumbPage></BreadcrumbItem></> : null}
          </BreadcrumbList></Breadcrumb>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-x-2 pr-4 sm:gap-x-3">

          <Button variant="outline" size="icon-lg" disabled aria-label={t('notificationsSoon')} title={t('notificationsSoon')}><BellIcon /></Button>
          <ThemeDropdown />
          <UserMenu placement="header" user={user} busy={busy} signingOut={logout.isPending} onNavigation={workspace?(origin)=>{if(!dirty&&!busy){navigationOrigin.current=origin;setOpenMobile(false);setNavigationOpen(true);}}:undefined} navigationDisabled={dirty||navigationSettings.isPending||navigationSettings.isError} onKeyboardHelp={showKeyboardHelp} onSettings={() => showPage('settings')} onSignOut={() => navigate(() => logout.mutate())} />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
        <BrowserPresence dirty={guardedDirty} busy={busy}/>
        {workspace&&live.notice?<Alert role="status"><AlertDescription>{t(live.notice==='offline'?'liveOffline':'liveConnecting')}</AlertDescription></Alert>:null}
        {live.pending&&(!recordId||recordId==='new')?<Alert role="status"><AlertDescription>{t('liveDeferred')}</AlertDescription></Alert>:null}
        {logout.isError ? <ErrorNotice error={logout.error} /> : null}
        {!validRoute || (!workspaces.isPending && !workspaces.isError && workspaceCode && !workspace) ? <RouteNotFound onBack={() => { if (workspaces.data?.[0]) void routeNavigate(`/w/${workspaces.data[0].code}`); else void routeNavigate('/'); }} />
          : workspaces.isPending ? pageLoading : blocksCachedView(workspaces) ? <ErrorNotice error={workspaces.error} retry={() => { void workspaces.refetch(); }} />
          : !workspace ? user.isAdmin ? <Welcome title={t('noWorkspace')} description={t('noWorkspaceDescription')} action={t('newWorkspace')} onAction={() => setDialog('workspace')} /> : <Empty><EmptyHeader><EmptyTitle>{t('noWorkspace')}</EmptyTitle><EmptyDescription>{t('noWorkspaceAssigned')}</EmptyDescription></EmptyHeader></Empty>
          : blocksCachedView(types) ? <ErrorNotice error={types.error} /> : types.isPending ? pageLoading
          : view === 'recycle-bin'?<Suspense fallback={<RecycleBinLoading/>}><RecycleBin key={workspace.id} workspace={workspace} user={user} onBusyChange={setBusy} types={types.data!.filter(type=>type.permissions?.read===true)}/></Suspense>
          : view === 'dashboard' ? <Suspense fallback={<DashboardLoading/>}><Dashboard canReadContent={true} canManage={canManage} workspace={workspace} types={types.data!.filter(type => (type.permissions?.read===true||type.permissions?.create===true)&&(!type.state || type.state === 'active'))} onOpen={(id, recordId) => { const type = types.data?.find(type => type.id === id); if (type) navigate(() => { void routeNavigate(`${dashboardPath}/objects/${type.technicalName}${recordId ? `/${recordId}` : ''}`, { state: recordId ? { recordOrigin: `${location.pathname}${location.search}` } : null }); }); }} onCreate={() => setDialog('object')} /></Suspense>
          : !selectedType ? <RouteNotFound onBack={() => showPage('dashboard')} />
          : definition.isPending ? pageLoading : blocksCachedView(definition) ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} />
          : selectedType.permissions?.read===false&&recordId!=='new' ? <Empty><EmptyHeader><EmptyTitle>{selectedType.label}</EmptyTitle><EmptyDescription>{t('contentAccessDenied')}</EmptyDescription></EmptyHeader>{selectedType.permissions?.create?<Button type="button" onClick={()=>{void routeNavigate(`${dashboardPath}/objects/${selectedType.technicalName}/new`);}}>{t('newRecord')}</Button>:null}</Empty>
          : recordId && panelDefinition ? recordId === 'new' && (panelDefinition.permissions?.create!==true||Boolean(panelDefinition.state&&panelDefinition.state!=='active')) ? <RouteNotFound onBack={closeRecord} /> : <Suspense fallback={<RecordPageLoading definition={panelDefinition} contactKind={new URLSearchParams(location.search).get('contactKind')??undefined} isNew={recordId==='new'}/>}><RecordPage returnToSource={/\/[0-9a-f-]{36}$/i.test(recordReturnPath(location.state?.recordOrigin,dashboardPath,objectPath,location.search).split('?')[0])} linkedCreation={recordId==='new'&&linkedDraft.success&&linkedDraft.data.targetObjectTypeId===panelDefinition.id?linkedDraft.data:undefined} key={`${panelDefinition.id}:${recordId}:${editorRevision}`} definition={panelDefinition} recordId={recordId} user={user} workspaceName={workspace.name} workspaceCode={workspace.code} onClose={closeRecord} onAccessLost={()=>{setBusy(false);setDirty(false);setReturnAfterAccessLoss(true);}} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={record => { setSavedRecordId(record.id); setDirty(false); }} /></Suspense>
          : panelDefinition ? <RecordList key={panelDefinition.id} definition={panelDefinition} selectedRecord={recordId}
            basePath={objectPath}
            disabled={busy} /> : null}
      </main>
    </SidebarInset>
    {settingsOpen ? <Suspense fallback={<SettingsLoading onClose={closeSettings}/>}><SettingsPage key={editorRevision} user={user} workspace={workspace} onDirtyChange={setDirty} onBusyChange={setBusy} onClose={closeSettings} /></Suspense> : null}
    {dialog ? <DefinitionDialog kind={dialog} workspaceId={workspace?.id} objectTypeId={selectedType?.id} onClose={() => navigate(() => { setDialog(null); setDirty(false); })} onDirtyChange={setDirty} onBusyChange={setBusy} onCreated={id => { setDirty(false); setBusy(false); void created(id); }} /> : null}
    <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} finalFocus={() => helpOrigin.current?.isConnected ? helpOrigin.current : document.querySelector<HTMLElement>('[data-user-menu="header"]') ?? true} />
    <AlertDialog open={Boolean(pendingNavigation) || (blocker.state === 'blocked' && !busy)} onOpenChange={open => { if (!open) { setPendingNavigation(null); if (blocker.state === 'blocked') blocker.reset(); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); setEditorRevision(value => value + 1); if (blocker.state === 'blocked') blocker.proceed(); else action?.(); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </HeaderSearch></WorkspaceMenuAppearanceProvider></WorkspaceLanguageProvider></TimeZoneProvider></RegionalProvider>;
}

function RouteNotFound({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return <Welcome title={t('routeNotFound')} description={t('routeNotFoundDescription')} action={t('dashboard')} onAction={onBack} icon={LayoutDashboardIcon} />;
}

function Welcome({ title, description, action, onAction, icon: Icon = PlusIcon }: { title: string; description: string; action: string; onAction: () => void; icon?: typeof PlusIcon }) {
  return <Empty className="flex-1"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onAction}><Icon data-icon="inline-start" />{action}</Button></EmptyContent></Empty>;
}
