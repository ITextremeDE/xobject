import { DialogActions } from './dialog-actions';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SunIcon, MoonIcon, MonitorIcon, PaintbrushIcon, GlobeIcon, Settings2Icon, DatabaseIcon, UsersIcon } from 'lucide-react';
import type { AuthUser, Language, Workspace } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sidebar, SidebarProvider, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useAppearance, type Theme } from './preferences';
import { ObjectSettings } from './object-settings';
import { WorkspaceMembers } from './workspace-members';
import { ErrorNotice } from './feedback';

export function SettingsPage({ user, workspace, onDirtyChange, onBusyChange, onClose }: {
  user: AuthUser; workspace?: Workspace; onClose: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<'appearance' | 'language' | 'workspaceGeneral' | 'workspaceLanguage' | 'workspaceObjects' | 'workspaceMembers'>('appearance');
  const sections = [{ id: 'appearance' as const, label: t('theme'), icon: PaintbrushIcon }, { id: 'language' as const, label: t('languageRegion'), icon: GlobeIcon }];
  const workspaceSections = [{ id: 'workspaceGeneral' as const, label: t('general'), icon: Settings2Icon }, { id: 'workspaceLanguage' as const, label: t('languageRegion'), icon: GlobeIcon }, { id: 'workspaceObjects' as const, label: t('objects'), icon: DatabaseIcon }, { id: 'workspaceMembers' as const, label: t('members'), icon: UsersIcon }];
  const workspaceSection = section.startsWith('workspace');
  const canManage = Boolean(user.isAdmin || workspace?.role === 'designer');
  const title = [...sections, ...workspaceSections].find(item => item.id === section)!.label;
  const client = useQueryClient();
  const { theme, setTheme } = useAppearance();
  const [baselineLanguage, setBaselineLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [language, setLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null);
  const [baselineName, setBaselineName] = useState(workspace?.name ?? '');
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? '');
  const [baselineWorkspaceLanguage, setBaselineWorkspaceLanguage] = useState<Language>(workspace?.default_language ?? 'en');
  const [workspaceLanguage, setWorkspaceLanguage] = useState<Language>(workspace?.default_language ?? 'en');
  // Direct /settings links can render before the workspace query resolves.
  useEffect(() => { setBaselineName(workspace?.name ?? ''); setWorkspaceName(workspace?.name ?? ''); setBaselineWorkspaceLanguage(workspace?.default_language ?? 'en'); setWorkspaceLanguage(workspace?.default_language ?? 'en'); }, [workspace?.id]);
  const [memberDirty, setMemberDirty] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [objectDirty, setObjectDirty] = useState(false);
  const [objectBusy, setObjectBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const selectedTheme = themeDraft ?? theme;
  const dirty = language !== baselineLanguage || selectedTheme !== theme || workspaceName !== baselineName || workspaceLanguage !== baselineWorkspaceLanguage || objectDirty || memberDirty;
  const sectionDirty = section === 'appearance' ? selectedTheme !== theme : section === 'language' ? language !== baselineLanguage : section === 'workspaceGeneral' ? workspaceName !== baselineName : section === 'workspaceLanguage' ? workspaceLanguage !== baselineWorkspaceLanguage : false;
  const valid = !workspaceSection || canManage && Boolean(workspace && (section !== 'workspaceGeneral' || workspaceName.trim()));
  function selectSection(next: typeof section) { setSection(next); setSaved(false); mutation.reset(); }
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const mutation = useMutation({ mutationFn: async () => {
    if (section === 'language') await api('set_user_language', { language: language === 'inherit' ? null : language });
    if (section === 'workspaceGeneral' && workspace) await api('set_workspace_name', { workspaceId: workspace.id, name: workspaceName });
    if (section === 'workspaceLanguage' && workspace) await api('set_workspace_language', { workspaceId: workspace.id, language: workspaceLanguage });
  }, onMutate: () => { setSaved(false); }, onSuccess: async () => {
    if (section === 'appearance') { if (themeDraft) setTheme(themeDraft); setThemeDraft(null); }
    if (section === 'language') { setBaselineLanguage(language); await client.invalidateQueries({ queryKey: ['session'] }); }
    if (section === 'workspaceGeneral') { setBaselineName(workspaceName.trim()); setWorkspaceName(workspaceName.trim()); }
    if (section === 'workspaceLanguage') setBaselineWorkspaceLanguage(workspaceLanguage);
    if (workspaceSection) {
      await client.invalidateQueries({ queryKey: ['workspaces'] });
      await client.invalidateQueries({ queryKey: ['types', workspace?.id] });
      await client.invalidateQueries({ queryKey: ['definition'] });
      await client.invalidateQueries({ queryKey: ['records'] });
    }
    setSaved(true);
  } });
  useEffect(() => { onBusyChange(mutation.isPending || objectBusy || memberBusy); }, [mutation.isPending, objectBusy, memberBusy, onBusyChange]);
  function reset() {
    if (section === 'appearance') setThemeDraft(null);
    if (section === 'language') setLanguage(baselineLanguage);
    if (section === 'workspaceGeneral') setWorkspaceName(baselineName);
    if (section === 'workspaceLanguage') setWorkspaceLanguage(baselineWorkspaceLanguage);
    setSaved(false); mutation.reset();
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending && !objectBusy && !memberBusy) onClose(); }}>
    <DialogContent closeButtonDisabled={mutation.isPending || objectBusy || memberBusy} className="h-[640px] max-h-[calc(100svh-4rem)] overflow-hidden p-0 md:max-w-[880px] lg:max-w-[960px]" finalFocus={() => document.querySelector<HTMLElement>('[data-user-menu="header"]') ?? true}>
      <DialogTitle className="sr-only">{t('settings')}</DialogTitle>
      <DialogDescription className="sr-only">{t('settingsDescription')}</DialogDescription>
      <SidebarProvider className="h-full min-h-0 items-stretch">
        <Sidebar collapsible="none" className="hidden h-full shrink-0 md:flex">
          <SidebarContent>
            <SidebarGroup><SidebarGroupLabel>{t('personal')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">
              {sections.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={section === item.id} aria-current={section === item.id ? 'page' : undefined} disabled={mutation.isPending || objectBusy || memberBusy} onClick={() => selectSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent></SidebarGroup>
            <SidebarGroup><SidebarGroupLabel>{t('workspace')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">{workspaceSections.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton disabled={!workspace || mutation.isPending || objectBusy || memberBusy} isActive={section === item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => selectSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 px-4 pr-12"><Breadcrumb><BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">{t('settings')}</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">{workspaceSection ? workspace?.name ?? t('workspace') : t('personal')}</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbPage>{title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList></Breadcrumb></header>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4 pt-0"><FieldGroup>
              <Field className="md:hidden"><FieldLabel htmlFor="settings-section">{t('settings')}</FieldLabel><NativeSelect id="settings-section" className="w-full" value={section} disabled={mutation.isPending || objectBusy || memberBusy} onChange={event => selectSection(event.target.value as typeof section)}><optgroup label={t('personal')}>{sections.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.label}</NativeSelectOption>)}</optgroup><optgroup label={t('workspace')} disabled={!workspace}>{workspaceSections.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.label}</NativeSelectOption>)}</optgroup></NativeSelect></Field>
              {workspaceSection && !canManage ? <FieldDescription>{t('workspaceReadOnly')}</FieldDescription> : null}
              {section !== 'workspaceObjects' && section !== 'workspaceMembers' ? <>
              <form id="settings-form" className="min-w-0" aria-label={t(workspaceSection ? 'workspacePreferences' : 'personalPreferences')} data-shortcut-submit onSubmit={event => { event.preventDefault(); if ((!workspaceSection || canManage) && sectionDirty && valid && !mutation.isPending) mutation.mutate(); }}>
                <FieldGroup>
              {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
              {saved && !sectionDirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
              {section === 'workspaceGeneral' ? <>
                <Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="workspace-name">{t('workspaceName')}</FieldLabel><Input id="workspace-name" readOnly={!canManage} value={workspaceName} required maxLength={200} disabled={mutation.isPending} onChange={event => { setWorkspaceName(event.target.value); setSaved(false); }} /></Field>
                <Field><FieldLabel htmlFor="workspace-code">{t('code')}</FieldLabel><Input id="workspace-code" value={workspace?.code ?? ''} readOnly aria-describedby="workspace-code-help" /><FieldDescription id="workspace-code-help">{t('workspaceCodeFixed')}</FieldDescription></Field>
              </> : section === 'workspaceLanguage' ? <Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="workspace-language">{t('defaultLanguage')}</FieldLabel><NativeSelect id="workspace-language" className="w-full" value={workspaceLanguage} disabled={mutation.isPending || !canManage} aria-describedby="workspace-language-help" onChange={event => { setWorkspaceLanguage(event.target.value as Language); setSaved(false); }}><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect><FieldDescription id="workspace-language-help">{t('workspaceLanguageHelp')}</FieldDescription></Field> : section === 'language' ? <Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="language">{t('language')}</FieldLabel>
                <NativeSelect id="language" className="w-full" aria-describedby="language-help" value={language} disabled={mutation.isPending} onChange={event => { setLanguage(event.target.value as Language | 'inherit'); setSaved(false); }}>
                  <NativeSelectOption value="inherit">{t('inherited')}</NativeSelectOption><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption>
                </NativeSelect><FieldDescription id="language-help">{t('languagePreferenceHelp')}</FieldDescription>
              </Field> : <Field data-disabled={mutation.isPending || undefined}><FieldLabel id="appearance-label">{t('themeSetting')}</FieldLabel>
                <ToggleGroup variant="outline" value={[selectedTheme]} onValueChange={values => { const value = values[0]; if (value === 'light' || value === 'dark' || value === 'system') { setThemeDraft(value); setSaved(false); } }} disabled={mutation.isPending} aria-labelledby="appearance-label" aria-describedby="appearance-help" className="w-full">
                  <ToggleGroupItem value="light" className="flex-1"><SunIcon />{t('light')}</ToggleGroupItem>
                  <ToggleGroupItem value="dark" className="flex-1"><MoonIcon />{t('dark')}</ToggleGroupItem>
                  <ToggleGroupItem value="system" className="flex-1"><MonitorIcon />{t('system')}</ToggleGroupItem>
                </ToggleGroup><FieldDescription id="appearance-help">{t('appearancePreferenceHelp')}</FieldDescription>
              </Field>}
                </FieldGroup>
              </form></> : null}
              <div hidden={section !== 'workspaceObjects'}>{workspace ? <ObjectSettings readOnly={!canManage} key={workspace.id} workspace={workspace} user={user} onDirtyChange={setObjectDirty} onBusyChange={setObjectBusy} /> : null}</div>
            <div hidden={section !== 'workspaceMembers'}>{workspace ? <WorkspaceMembers key={workspace.id} workspaceId={workspace.id} isAdmin={Boolean(user.isAdmin)} onDirtyChange={setMemberDirty} onBusyChange={setMemberBusy} /> : null}</div>
            </FieldGroup></div>
            <DialogActions onClose={onClose} disabled={mutation.isPending || objectBusy || memberBusy}>{section !== 'workspaceObjects' && section !== 'workspaceMembers' && (!workspaceSection || canManage) ? <><Button type="button" variant="outline" disabled={!sectionDirty || mutation.isPending} onClick={reset}>{t('resetPreferences')}</Button><Button type="submit" form="settings-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!sectionDirty || !valid || mutation.isPending}>{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
          </div>
        </div>
      </SidebarProvider>
    </DialogContent>
  </Dialog>;
}
