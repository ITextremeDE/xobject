import { SystemJournal } from './system-journal';
import { UserManagement } from './user-management';
import { RegionalFields } from './regional-fields';
import { defaultRegionalSettings, inheritRegionalSettings, regionalSchema, type PersonalRegionalSettings } from '@xobject/contracts';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { TimeZoneField } from './time-zone-field';
import { timeZoneSchema } from '@xobject/contracts';
import { WorkspaceLanguageFields } from './workspace-language-fields';
import { WorkspaceGroups } from './workspace-groups';
import { WorkspaceAppearanceFields } from './workspace-appearance';
import { Spinner } from '@/components/ui/spinner';
import { DialogActions } from './dialog-actions';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SunIcon, MoonIcon, MonitorIcon, PaintbrushIcon, GlobeIcon, Settings2Icon, DatabaseIcon, GroupIcon, ShieldUserIcon, UserRoundCogIcon, ShieldCheckIcon, UserRoundIcon, UploadIcon } from 'lucide-react';
import { defaultWorkspaceAppearance, workspaceAppearanceSchema, languageCatalog, languageCodes, workspaceLanguageSchema, type WorkspaceLanguages, type AuthUser, type Language, type Workspace } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sidebar, SidebarProvider, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useAppearance, type Theme } from './preferences';
import { AccountSecuritySettings } from './account-security';
import { ObjectSettings } from './object-settings';
import { WorkspaceMembers } from './workspace-members';
import { ErrorNotice } from './feedback';

const workspaceLanguages = (workspace?: Workspace): WorkspaceLanguages & { timeZone: string; regional: import('@xobject/contracts').RegionalSettings } => ({ regional: workspace?.regional ?? defaultRegionalSettings, timeZone: workspace?.time_zone ?? 'UTC', availableLanguages: [...(workspace?.available_languages ?? languageCodes)], defaultLanguage: workspace?.default_language ?? 'en', labelLanguages: [...(workspace?.label_languages ?? languageCodes)] });

export function SettingsPage({ user, workspace, onDirtyChange, onBusyChange, onClose }: {
  user: AuthUser; workspace?: Workspace; onClose: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<'systemJournal' | 'systemUsers' | 'profile' | 'appearance' | 'language' | 'security' | 'workspaceAppearance' | 'workspaceGeneral' | 'workspaceLanguage' | 'workspaceObjects' | 'workspaceMembers' | 'workspaceGroups'>('profile');
  const sections = [{ id: 'profile' as const, label: t('profile'), icon: UserRoundIcon }, { id: 'security' as const, label: t('accountSecurity'), icon: ShieldCheckIcon }, { id: 'appearance' as const, label: t('theme'), icon: PaintbrushIcon }, { id: 'language' as const, label: t('languageRegion'), icon: GlobeIcon }];
  const workspaceSections = [{ id: 'workspaceGeneral' as const, label: t('general'), icon: Settings2Icon }, { id: 'workspaceAppearance' as const, label: t('theme'), icon: PaintbrushIcon }, { id: 'workspaceLanguage' as const, label: t('languageRegion'), icon: GlobeIcon }, { id: 'workspaceObjects' as const, label: t('objects'), icon: DatabaseIcon }, { id: 'workspaceGroups' as const, label: t('userGroups'), icon: GroupIcon }, { id: 'workspaceMembers' as const, label: t('members'), icon: ShieldUserIcon }];
  const instanceSections = user.isAdmin ? [{ id: 'systemUsers' as const, label: t('users'), icon: UserRoundCogIcon }, { id: 'systemJournal' as const, label: t('journal'), icon: ShieldCheckIcon }] : [];
  const specialSection = ['workspaceObjects', 'workspaceMembers', 'workspaceGroups', 'security', 'systemJournal', 'systemUsers'].includes(section);
  const workspaceSection = section.startsWith('workspace');
  const canManage = Boolean(user.isAdmin || workspace?.role === 'designer');
  const title = [...sections, ...workspaceSections, ...instanceSections].find(item => item.id === section)!.label;
  const client = useQueryClient();
  const { theme, setTheme } = useAppearance();
  const [baselineProfileName, setBaselineProfileName] = useState(user.name);
  const [profileName, setProfileName] = useState(user.name);
  const [baselineLanguage, setBaselineLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [language, setLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [baselineRegional, setBaselineRegional] = useState(user.regionalPreferences ?? null);
  const [personalRegional, setPersonalRegional] = useState<PersonalRegionalSettings>(user.regionalPreferences ?? inheritRegionalSettings);
  const regionalDirty = JSON.stringify(personalRegional) !== JSON.stringify(baselineRegional ?? inheritRegionalSettings);
  const regional = useRegional();
  const timeZone = useTimeZone();
  const [baselineTimeZone, setBaselineTimeZone] = useState<string | null>(user.timeZone ?? null);
  const [personalTimeZone, setPersonalTimeZone] = useState<string | null>(user.timeZone ?? null);
  const personalLocalizationDirty = language !== baselineLanguage || personalTimeZone !== baselineTimeZone || regionalDirty;
  useEffect(() => { if (!personalLocalizationDirty) { setBaselineLanguage(user.language ?? 'inherit'); setLanguage(user.language ?? 'inherit'); setBaselineTimeZone(user.timeZone ?? null); setPersonalTimeZone(user.timeZone ?? null); setBaselineRegional(user.regionalPreferences ?? null); setPersonalRegional(user.regionalPreferences ?? inheritRegionalSettings); } }, [user.language, user.timeZone, user.regionalPreferences]);
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null);
  const [baselineName, setBaselineName] = useState(workspace?.name ?? '');
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? '');
  const [baselineWorkspaceLanguages, setBaselineWorkspaceLanguages] = useState(() => workspaceLanguages(workspace));
  const [workspaceLanguageDraft, setWorkspaceLanguageDraft] = useState(() => workspaceLanguages(workspace));
  const [languageVersion, setLanguageVersion] = useState(workspace?.language_version ?? 1);
  const workspaceLanguageDirty = JSON.stringify(baselineWorkspaceLanguages) !== JSON.stringify(workspaceLanguageDraft);
  useEffect(() => { if (!workspaceLanguageDirty) { setBaselineWorkspaceLanguages(workspaceLanguages(workspace)); setWorkspaceLanguageDraft(workspaceLanguages(workspace)); setLanguageVersion(workspace?.language_version ?? 1); } }, [workspace?.id, workspace?.language_version]);
  const personalLanguages = workspace?.available_languages ?? languageCodes;
  const [baselineDesign, setBaselineDesign] = useState(workspace?.appearance ?? defaultWorkspaceAppearance);
  const [design, setDesign] = useState(workspace?.appearance ?? defaultWorkspaceAppearance);
  const [designVersion, setDesignVersion] = useState(workspace?.appearance_version ?? 1);
  const designDirty = JSON.stringify(design) !== JSON.stringify(baselineDesign);
  useEffect(() => {
    if (!designDirty) { setBaselineDesign(workspace?.appearance ?? defaultWorkspaceAppearance); setDesign(workspace?.appearance ?? defaultWorkspaceAppearance); setDesignVersion(workspace?.appearance_version ?? 1); }
  }, [workspace?.appearance_version, workspace?.id]);
  // Direct /settings links can render before the workspace query resolves.
  useEffect(() => { setBaselineName(workspace?.name ?? ''); setWorkspaceName(workspace?.name ?? ''); setBaselineWorkspaceLanguages(workspaceLanguages(workspace)); setWorkspaceLanguageDraft(workspaceLanguages(workspace)); setLanguageVersion(workspace?.language_version ?? 1); setBaselineDesign(workspace?.appearance ?? defaultWorkspaceAppearance); setDesign(workspace?.appearance ?? defaultWorkspaceAppearance); setDesignVersion(workspace?.appearance_version ?? 1); }, [workspace?.id]);
  const [userDirty, setUserDirty] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [groupDirty, setGroupDirty] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [securityDirty, setSecurityDirty] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [memberDirty, setMemberDirty] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [objectDirty, setObjectDirty] = useState(false);
  const [objectBusy, setObjectBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const selectedTheme = themeDraft ?? theme;
  const dirty = profileName !== baselineProfileName || personalLocalizationDirty || selectedTheme !== theme || workspaceName !== baselineName || workspaceLanguageDirty || designDirty || objectDirty || memberDirty || securityDirty || groupDirty || userDirty;
  const sectionDirty = section === 'workspaceAppearance' ? designDirty : section === 'profile' ? profileName !== baselineProfileName : section === 'appearance' ? selectedTheme !== theme : section === 'language' ? personalLocalizationDirty : section === 'workspaceGeneral' ? workspaceName !== baselineName : section === 'workspaceLanguage' ? workspaceLanguageDirty : false;
  const valid = section === 'workspaceLanguage' ? Boolean(canManage && workspaceLanguageSchema.safeExtend({ timeZone: timeZoneSchema, regional: regionalSchema }).safeParse(workspaceLanguageDraft).success) : section === 'workspaceAppearance' ? Boolean(workspace && canManage && workspaceAppearanceSchema.safeParse(design).success) : section === 'profile' ? Boolean(profileName.trim() && profileName.trim().length <= 200) : !workspaceSection || canManage && Boolean(workspace && (section !== 'workspaceGeneral' || workspaceName.trim()));
  function selectSection(next: typeof section) { setSection(next); setSaved(false); mutation.reset(); }
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const mutation = useMutation({ mutationFn: async () => {
    if (section === 'profile') await api('set_user_profile', { name: profileName });
    if (section === 'language') await api('configure_user_localization', { language: language === 'inherit' ? null : language, timeZone: personalTimeZone, expectedLanguage: baselineLanguage === 'inherit' ? null : baselineLanguage, expectedTimeZone: baselineTimeZone, regional: personalRegional, expectedRegional: baselineRegional });
    if (section === 'workspaceGeneral' && workspace) await api('set_workspace_name', { workspaceId: workspace.id, name: workspaceName });
    if (section === 'workspaceAppearance' && workspace) return api('set_workspace_appearance', { workspaceId: workspace.id, version: designVersion, appearance: design });
    if (section === 'workspaceLanguage' && workspace) return api('configure_workspace_languages', { workspaceId: workspace.id, version: languageVersion, ...workspaceLanguageDraft });
  }, onError: async error => { if (error instanceof ApiError && error.status === 409 && section === 'language') await client.invalidateQueries({ queryKey: ['session'] }); if (error instanceof ApiError && error.status === 409 && ['workspaceAppearance', 'workspaceLanguage'].includes(section)) await client.invalidateQueries({ queryKey: ['workspaces'] }); }, onMutate: () => { setSaved(false); }, onSuccess: async result => {
    if (section === 'profile') { setBaselineProfileName(profileName.trim()); setProfileName(profileName.trim()); await client.invalidateQueries({ queryKey: ['session'] }); await client.invalidateQueries({ queryKey: ['workspace-members'] }); await client.invalidateQueries({ queryKey: ['field-principals'] }); await client.invalidateQueries({ queryKey: ['users'] }); }
    if (section === 'appearance') { if (themeDraft) setTheme(themeDraft); setThemeDraft(null); }
    if (section === 'language') { setBaselineRegional(personalRegional); setBaselineTimeZone(personalTimeZone); setBaselineLanguage(language); await client.invalidateQueries({ queryKey: ['session'] }); }
    if (section === 'workspaceGeneral') { setBaselineName(workspaceName.trim()); setWorkspaceName(workspaceName.trim()); }
    if (section === 'workspaceLanguage' && result && 'availableLanguages' in result) { const next = { regional: result.regional, timeZone: result.timeZone, availableLanguages: result.availableLanguages, defaultLanguage: result.defaultLanguage, labelLanguages: result.labelLanguages }; setBaselineWorkspaceLanguages(next); setWorkspaceLanguageDraft(next); setLanguageVersion(result.version); }
    if (section === 'workspaceAppearance' && result && 'appearance' in result) { setBaselineDesign(result.appearance); setDesign(result.appearance); setDesignVersion(result.version); }
    if (workspaceSection) {
      await client.invalidateQueries({ queryKey: ['workspaces'] });
      await client.invalidateQueries({ queryKey: ['types', workspace?.id] });
      await client.invalidateQueries({ queryKey: ['definition'] });
      await client.invalidateQueries({ queryKey: ['records'] });
    }
    setSaved(true);
  } });
  useEffect(() => { onBusyChange(mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy); }, [mutation.isPending, objectBusy, memberBusy, securityBusy, groupBusy, userBusy, onBusyChange]);
  function reset() {
    if (section === 'profile') setProfileName(baselineProfileName);
    if (section === 'appearance') setThemeDraft(null);
    if (section === 'language') { setLanguage(user.language ?? 'inherit'); setBaselineLanguage(user.language ?? 'inherit'); setPersonalTimeZone(user.timeZone ?? null); setBaselineTimeZone(user.timeZone ?? null); setBaselineRegional(user.regionalPreferences ?? null); setPersonalRegional(user.regionalPreferences ?? inheritRegionalSettings); }
    if (section === 'workspaceGeneral') setWorkspaceName(baselineName);
    if (section === 'workspaceLanguage') { const next = workspaceLanguages(workspace); setBaselineWorkspaceLanguages(next); setWorkspaceLanguageDraft(next); setLanguageVersion(workspace?.language_version ?? languageVersion); }
    if (section === 'workspaceAppearance') { const current = workspace?.appearance ?? baselineDesign; setDesign(current); setBaselineDesign(current); setDesignVersion(workspace?.appearance_version ?? designVersion); }
    setSaved(false); mutation.reset();
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending && !objectBusy && !memberBusy && !securityBusy && !groupBusy && !userBusy) onClose(); }}>
    <DialogContent closeButtonDisabled={mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy} className="h-[640px] max-h-[calc(100svh-4rem)] overflow-hidden p-0 md:max-w-[880px] lg:max-w-[960px]" finalFocus={() => document.querySelector<HTMLElement>('[data-user-menu="header"]') ?? true}>
      <DialogTitle className="sr-only">{t('settings')}</DialogTitle>
      <DialogDescription className="sr-only">{t('settingsDescription')}</DialogDescription>
      <SidebarProvider className="h-full min-h-0 items-stretch">
        <Sidebar collapsible="none" className="hidden h-full shrink-0 md:flex">
          <SidebarContent>
            <SidebarGroup><SidebarGroupLabel>{t('personal')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">
              {sections.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={section === item.id} aria-current={section === item.id ? 'page' : undefined} disabled={mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy} onClick={() => selectSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent></SidebarGroup>
            <SidebarGroup><SidebarGroupLabel>{t('workspace')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">{workspaceSections.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton disabled={!workspace || mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy} isActive={section === item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => selectSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
            {instanceSections.length ? <SidebarGroup><SidebarGroupLabel>{t('instance')}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-1">{instanceSections.map(item => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={section === item.id} disabled={mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy} onClick={() => selectSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
          </SidebarContent>
        </Sidebar>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 px-4 pr-12"><Breadcrumb><BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">{t('settings')}</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">{workspaceSection ? workspace?.name ?? t('workspace') : section.startsWith('system') ? t('instance') : t('personal')}</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbPage>{title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList></Breadcrumb></header>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4 pt-0"><FieldGroup>
              <Field data-disabled={(mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy) || undefined} className="md:hidden"><FieldLabel htmlFor="settings-section">{t('settings')}</FieldLabel><NativeSelect id="settings-section" className="w-full" value={section} disabled={mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy} onChange={event => selectSection(event.target.value as typeof section)}><optgroup label={t('personal')}>{sections.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.label}</NativeSelectOption>)}</optgroup><optgroup label={t('workspace')} disabled={!workspace}>{workspaceSections.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.label}</NativeSelectOption>)}</optgroup>{instanceSections.length ? <optgroup label={t('instance')}>{instanceSections.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.label}</NativeSelectOption>)}</optgroup> : null}</NativeSelect></Field>
              {workspaceSection && !canManage ? <FieldDescription>{t('workspaceReadOnly')}</FieldDescription> : null}
              {!specialSection ? <>
              <form id="settings-form" className="min-w-0" aria-label={t(workspaceSection ? 'workspacePreferences' : 'personalPreferences')} data-shortcut-submit onSubmit={event => { event.preventDefault(); if ((!workspaceSection || canManage) && sectionDirty && valid && !mutation.isPending) mutation.mutate(); }}>
                <FieldGroup>
              {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
              {section === 'workspaceAppearance' && mutation.isError && mutation.error instanceof ApiError && mutation.error.status === 409 ? <FieldDescription>{t('workspaceDesignConflict')}</FieldDescription> : null}
              {saved && !sectionDirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
              {section === 'profile' ? <>
                <Field><FieldLabel id="profile-picture-label">{t('profilePicture')}</FieldLabel><div className="flex flex-wrap items-center gap-4"><Avatar size="lg" role="img" aria-label={t('profilePictureInitials', { name: user.name })}><AvatarFallback>{user.name.trim().split(/\s+/).map(part => Array.from(part)[0]).slice(0, 2).join('').toUpperCase() || '?'}</AvatarFallback></Avatar><Button type="button" variant="outline" disabled aria-describedby="profile-picture-help"><UploadIcon data-icon="inline-start" />{t('uploadProfilePicture')}</Button></div><FieldDescription id="profile-picture-help">{t('profilePictureHelp')}</FieldDescription></Field>
                <Field data-disabled={mutation.isPending || undefined} data-invalid={!profileName.trim()}><FieldLabel htmlFor="profile-name">{t('displayName')}</FieldLabel><Input id="profile-name" aria-invalid={!profileName.trim()} aria-describedby={!profileName.trim() ? 'profile-name-help profile-name-error' : 'profile-name-help'} value={profileName} required maxLength={200} disabled={mutation.isPending} autoComplete="name" onChange={event => { setProfileName(event.target.value); setSaved(false); }} /><FieldDescription id="profile-name-help">{t('displayNameHelp')}</FieldDescription>{!profileName.trim() ? <FieldError id="profile-name-error">{t('nameRequired')}</FieldError> : null}</Field>
                <Field><FieldLabel htmlFor="profile-email">{t('email')}</FieldLabel><Input id="profile-email" type="email" value={user.email} readOnly autoComplete="email" aria-describedby="profile-email-help" /><FieldDescription id="profile-email-help">{t('profileEmailHelp')}</FieldDescription></Field>
              </> : section === 'workspaceGeneral' ? <>
                <Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="workspace-name">{t('workspaceName')}</FieldLabel><Input id="workspace-name" readOnly={!canManage} value={workspaceName} required maxLength={200} disabled={mutation.isPending} onChange={event => { setWorkspaceName(event.target.value); setSaved(false); }} /></Field>
                <Field><FieldLabel htmlFor="workspace-code">{t('code')}</FieldLabel><Input id="workspace-code" value={workspace?.code ?? ''} readOnly aria-describedby="workspace-code-help" /><FieldDescription id="workspace-code-help">{t('workspaceCodeFixed')}</FieldDescription></Field><Field><FieldLabel>{t('createdBy')}</FieldLabel><FieldDescription>{workspace?.created_by_name ?? workspace?.created_by ?? '—'}</FieldDescription></Field><Field><FieldLabel>{t('createdAt')}</FieldLabel><FieldDescription>{workspace?.created_at ? formatRegionalDate(workspace.created_at, regional, timeZone, true) : t('creationTimeUnknown')}</FieldDescription></Field>
              </> : section === 'workspaceAppearance' ? <WorkspaceAppearanceFields value={design} disabled={mutation.isPending || !canManage} onChange={next => { setDesign(next); setSaved(false); }} /> : section === 'workspaceLanguage' ? <><WorkspaceLanguageFields value={workspaceLanguageDraft} disabled={mutation.isPending || !canManage} onChange={next => { setWorkspaceLanguageDraft({ ...next, timeZone: workspaceLanguageDraft.timeZone, regional: workspaceLanguageDraft.regional }); setSaved(false); }} /><TimeZoneField key="workspace-time-zone" id="workspace-time-zone" value={workspaceLanguageDraft.timeZone} disabled={mutation.isPending || !canManage} onChange={next => { if (next) { setWorkspaceLanguageDraft({ ...workspaceLanguageDraft, timeZone: next }); setSaved(false); } }} /><RegionalFields key="workspace-region" value={workspaceLanguageDraft.regional} disabled={mutation.isPending || !canManage} onChange={next => { setWorkspaceLanguageDraft({ ...workspaceLanguageDraft, regional: next as typeof workspaceLanguageDraft.regional }); setSaved(false); }} /></> : section === 'language' ? <><Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="language">{t('language')}</FieldLabel>
                <NativeSelect id="language" className="w-full" aria-describedby="language-help" value={language} disabled={mutation.isPending} onChange={event => { setLanguage(event.target.value as Language | 'inherit'); setSaved(false); }}>
                  <NativeSelectOption value="inherit">{t('inherited')}</NativeSelectOption>{languageCatalog.filter(item => personalLanguages.includes(item.code) || language === item.code).map(item => <NativeSelectOption key={item.code} value={item.code} disabled={!personalLanguages.includes(item.code)}>{item.nativeName}{!personalLanguages.includes(item.code) ? ` (${t('languageUnavailable')})` : ''}</NativeSelectOption>)}
                </NativeSelect><FieldDescription id="language-help">{t('languagePreferenceHelp')}</FieldDescription>{language !== 'inherit' && !personalLanguages.includes(language) ? <FieldDescription>{t('personalLanguageFallback')}</FieldDescription> : null}
              </Field><TimeZoneField key="personal-time-zone" id="personal-time-zone" value={personalTimeZone} inherited={workspace?.time_zone ?? 'UTC'} disabled={mutation.isPending} onChange={next => { setPersonalTimeZone(next); setSaved(false); }} /><RegionalFields key="personal-region" value={personalRegional} inherited={workspace?.regional ?? defaultRegionalSettings} disabled={mutation.isPending} onChange={next => { setPersonalRegional(next as PersonalRegionalSettings); setSaved(false); }} /></> : <Field data-disabled={mutation.isPending || undefined}><FieldLabel id="appearance-label">{t('themeSetting')}</FieldLabel>
                <ToggleGroup variant="outline" value={[selectedTheme]} onValueChange={values => { const value = values[0]; if (value === 'light' || value === 'dark' || value === 'system') { setThemeDraft(value); setSaved(false); } }} disabled={mutation.isPending} aria-labelledby="appearance-label" aria-describedby="appearance-help" className="w-full">
                  <ToggleGroupItem value="light" className="flex-1"><SunIcon />{t('light')}</ToggleGroupItem>
                  <ToggleGroupItem value="dark" className="flex-1"><MoonIcon />{t('dark')}</ToggleGroupItem>
                  <ToggleGroupItem value="system" className="flex-1"><MonitorIcon />{t('system')}</ToggleGroupItem>
                </ToggleGroup><FieldDescription id="appearance-help">{t('appearancePreferenceHelp')}</FieldDescription>
              </Field>}
                </FieldGroup>
              </form></> : null}
              {user.isAdmin ? <><div hidden={section !== 'systemUsers'}><UserManagement ownId={user.id} onDirtyChange={setUserDirty} onBusyChange={setUserBusy} /></div>{section === 'systemJournal' ? <SystemJournal /> : null}</> : null}
              <div hidden={section !== 'security'}><AccountSecuritySettings user={user} active={section === 'security'} onDirtyChange={setSecurityDirty} onBusyChange={setSecurityBusy} /></div>
              <div hidden={section !== 'workspaceObjects'}>{workspace ? <ObjectSettings readOnly={!canManage} key={workspace.id} workspace={workspace} user={user} onDirtyChange={setObjectDirty} onBusyChange={setObjectBusy} /> : null}</div>
            <div hidden={section !== 'workspaceGroups'}>{workspace ? <WorkspaceGroups key={workspace.id} workspaceId={workspace.id} isAdmin={Boolean(user.isAdmin)} canManage={canManage} onDirtyChange={setGroupDirty} onBusyChange={setGroupBusy} /> : null}</div>
            <div hidden={section !== 'workspaceMembers'}>{workspace ? <WorkspaceMembers key={workspace.id} workspaceId={workspace.id} isAdmin={Boolean(user.isAdmin)} onDirtyChange={setMemberDirty} onBusyChange={setMemberBusy} /> : null}</div>
            </FieldGroup></div>
            <DialogActions onClose={onClose} disabled={mutation.isPending || objectBusy || memberBusy || securityBusy || groupBusy || userBusy}>{!specialSection && (!workspaceSection || canManage) ? <><Button type="button" variant="outline" disabled={!sectionDirty || mutation.isPending} onClick={reset}>{t('resetPreferences')}</Button><Button type="submit" form="settings-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!sectionDirty || !valid || mutation.isPending}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
          </div>
        </div>
      </SidebarProvider>
    </DialogContent>
  </Dialog>;
}
