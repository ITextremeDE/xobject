import { useDeferredValue, useEffect, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DatabaseIcon, PlusIcon, SearchIcon, LogOutIcon, UserIcon, ChevronDownIcon } from 'lucide-react';
import type { AuthUser, DataRecord, Language, ObjectDefinition, Workspace } from '@xobject/contracts';
import { api, signOut } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarInset, SidebarTrigger, SidebarSeparator, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DefinitionDialog } from './definition-dialog';
import { RecordPanel } from './record-panel';
import { ErrorNotice, Loading } from './feedback';
import { ThemeSelect } from './preferences';

const narrow = matchMedia('(max-width: 1023px)');
const subscribeNarrow = (listener: () => void) => { narrow.addEventListener('change', listener); return () => narrow.removeEventListener('change', listener); };

export function WorkspaceApp({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  return <SidebarProvider><WorkspaceScreen user={user} onSignOut={onSignOut} /></SidebarProvider>;
}

function WorkspaceScreen({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const detailModal = useSyncExternalStore(subscribeNarrow, () => narrow.matches);
  const [editorRevision, setEditorRevision] = useState(0);
  const [workspaceId, setWorkspaceId] = useState('');
  const [typeId, setTypeId] = useState('');
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
  const selectedType = types.data?.find(type => type.id === typeId) ?? types.data?.[0];
  const definition = useQuery({ queryKey: ['definition', selectedType?.id, user.id, language], queryFn: () => api('get_object_type', { objectTypeId: selectedType!.id }), enabled: Boolean(selectedType) });
  const logout = useMutation({ mutationFn: signOut, onSuccess: onSignOut });
  const preference = useMutation({ mutationFn: (value: Language | null) => api('set_user_language', { language: value }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['session'] }); } });

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
  function closeRecord() { navigate(() => { setRecordId(null); setDirty(false); }); }
  function selectWorkspace(id: string) {
    navigate(() => { setWorkspaceId(id); setTypeId(''); setRecordId(null); setDirty(false); setOpenMobile(false); });
  }
  function selectType(id: string) {
    navigate(() => { setTypeId(id); setRecordId(null); setDirty(false); setOpenMobile(false); });
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
    <Sidebar collapsible="offcanvas" mobileTitle={t('menu')} mobileDescription={t('selectObject')}>
      <SidebarHeader className="gap-6 p-5">
        <a href="/" onClick={event => { event.preventDefault(); navigate(() => { setRecordId(null); setDirty(false); }); }} className="text-2xl font-semibold tracking-tight">xObject</a>
        <div className="flex gap-2">
          <Field><FieldLabel htmlFor="workspace" className="sr-only">{t('workspace')}</FieldLabel><NativeSelect id="workspace" className="w-full" value={workspace?.id ?? ''} onChange={event => selectWorkspace(event.target.value)} disabled={!workspaces.data?.length || busy}>
            {!workspaces.data?.length ? <NativeSelectOption value="">{t('selectWorkspace')}</NativeSelectOption> : null}
            {workspaces.data?.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
          </NativeSelect></Field>
          <Button variant="outline" size="icon" aria-label={t('newWorkspace')} disabled={busy} onClick={() => navigate(() => setDialog('workspace'))}><PlusIcon /></Button>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel>{t('objects')}</SidebarGroupLabel><SidebarGroupContent>
          {types.isPending && workspace ? <Loading /> : types.isError ? <ErrorNotice error={types.error} retry={() => { void types.refetch(); }} /> : <SidebarMenu>{types.data?.map(type => <SidebarMenuItem key={type.id}>
            <SidebarMenuButton isActive={selectedType?.id === type.id} onClick={() => selectType(type.id)} title={type.label} disabled={busy}><DatabaseIcon /><span>{type.label}</span></SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>}
          <Button variant="outline" className="mt-4 w-full" disabled={!workspace || busy} onClick={() => navigate(() => setDialog('object'))}><PlusIcon data-icon="inline-start" />{t('newObject')}</Button>
        </SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-3 p-4">
        {logout.isError ? <ErrorNotice error={logout.error} /> : null}
        {preference.isError ? <ErrorNotice error={preference.error} /> : null}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="w-full justify-start" title={user.name}><UserIcon data-icon="inline-start" /><span className="min-w-0 flex-1 truncate text-left">{user.name}</span><ChevronDownIcon data-icon="inline-end" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-56"><DropdownMenuGroup><DropdownMenuItem disabled={busy || logout.isPending} onSelect={() => navigate(() => logout.mutate())}><LogOutIcon />{t('signOut')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
        <Field><FieldLabel htmlFor="language" className="sr-only">{t('language')}</FieldLabel><NativeSelect id="language" className="w-full" value={user.language ?? 'inherit'} disabled={preference.isPending || busy} onChange={event => { const value = event.target.value; navigate(() => preference.mutate(value === 'inherit' ? null : value as Language)); }}><NativeSelectOption value="inherit">{t('inherited')}</NativeSelectOption><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field>
        <ThemeSelect />
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className={cn('min-w-0', recordId && !detailModal && 'pr-[26rem]')}>
      <header className="flex min-h-16 items-center gap-3 px-4 md:px-8"><SidebarTrigger aria-label={t('menu')} /><div className="min-w-0 truncate text-sm text-muted-foreground">{workspace?.name}{selectedType ? <> / <span className="text-foreground">{selectedType.label}</span></> : null}</div></header>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-8 md:px-8">
        {workspaces.isPending ? <Loading /> : workspaces.isError ? <ErrorNotice error={workspaces.error} retry={() => { void workspaces.refetch(); }} />
          : !workspace ? <Welcome title={t('noWorkspace')} description={t('noWorkspaceDescription')} action={t('newWorkspace')} onAction={() => setDialog('workspace')} />
          : types.isError ? <ErrorNotice error={types.error} /> : !types.isPending && !selectedType ? <Welcome title={t('noObjects')} description={t('noObjectsDescription')} action={t('newObject')} onAction={() => setDialog('object')} />
          : definition.isPending ? <Loading /> : definition.isError ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} />
          : panelDefinition ? <RecordList key={panelDefinition.id} definition={panelDefinition} selectedRecord={recordId}
            onOpen={id => navigate(() => { setRecordId(id); setDirty(false); setOpenMobile(false); })}
            onField={() => navigate(() => setDialog('field'))} disabled={busy} /> : null}
      </main>
    </SidebarInset>
    {recordId && panelDefinition ? <RecordPanel key={`${panelDefinition.id}:${recordId}:${editorRevision}`} definition={panelDefinition} recordId={recordId} user={user} mobile={detailModal}
      onClose={closeRecord} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={record => { setRecordId(record.id); setDirty(false); }} /> : null}
    {dialog ? <DefinitionDialog kind={dialog} workspaceId={workspace?.id} objectTypeId={selectedType?.id} onClose={() => setDialog(null)} onCreated={id => { void created(id); }} /> : null}
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
  const query = useDeferredValue(search);
  const result = useQuery({ queryKey: ['records', definition.id, query, offset], queryFn: () => api('list_records', { objectTypeId: definition.id, query, limit: 25, offset }) });
  const fields = definition.fields.filter(f => f.technicalName !== 'keyword');
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4 py-2"><h1 className="text-3xl font-semibold tracking-tight">{definition.label}</h1><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onField} disabled={disabled}>{t('newField')}</Button><Button onClick={() => onOpen('new')} disabled={disabled}>{t('newRecord')}</Button></div></div>
    <Field><FieldLabel htmlFor="record-search" className="sr-only">{t('search')}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon /></InputGroupAddon><InputGroupInput id="record-search" placeholder={t('search')} value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></InputGroup></Field>
    {result.isPending ? <Loading /> : result.isError ? <ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /> : <>
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
        <Table><TableHeader><TableRow><TableHead>{t('keyword')}</TableHead>{fields.map(field => <TableHead key={field.id}>{field.label}</TableHead>)}<TableHead>{t('updated')}</TableHead></TableRow></TableHeader>
          <TableBody>{result.data.records.map(record => <TableRow key={record.id} data-state={record.id === selectedRecord ? 'selected' : undefined}>
            <TableCell><Button variant="link" className="max-w-80 justify-start truncate px-0" onClick={() => onOpen(record.id)} disabled={disabled}>{record.keyword}</Button></TableCell>
            {fields.map(field => <TableCell key={field.id} className="max-w-64 truncate" title={String(record[field.technicalName] ?? '')}>{String(record[field.technicalName] ?? '—')}</TableCell>)}
            <TableCell className="text-muted-foreground">{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(record.updated_at))}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {!result.data.records.length ? <Empty><EmptyHeader><EmptyTitle>{t(search ? 'noMatches' : 'noRecords')}</EmptyTitle><EmptyDescription>{t(search ? 'noMatchesDescription' : 'noRecordsDescription')}</EmptyDescription></EmptyHeader>{!search ? <EmptyContent><Button onClick={() => onOpen('new')}>{t('newRecord')}</Button></EmptyContent> : null}</Empty> : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>{t('count', { count: result.data.total })}</span>{result.data.total > 25 || offset > 0 ? <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>{t('previous')}</Button><span>{t('page', { page: offset / 25 + 1 })}</span><Button variant="outline" size="sm" disabled={offset + 25 >= result.data.total} onClick={() => setOffset(offset + 25)}>{t('next')}</Button></div> : null}</footer>
    </>}
  </>;
}
