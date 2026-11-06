import {WorkspaceLogo} from './workspace-logo';
import {SettingsSection} from './settings-section';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WorkspaceDesignPreview } from './workspace-design-preview';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcwIcon, UploadIcon } from 'lucide-react';
import { workspaceLogoIcons, workspaceBaseColors, workspaceThemes, workspaceChartColors, workspaceRadii, workspaceMenuColors, workspaceMenuAccents, type WorkspaceAppearance,type WorkspaceLogoIcon } from '@xobject/contracts';
import { loadWorkspaceFont, workspaceAppearanceTokens, workspaceFontOptions } from '@/lib/workspace-appearance';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WorkspaceAppearanceFields({ value, disabled, onChange }: { value: WorkspaceAppearance; disabled: boolean; onChange: (value: WorkspaceAppearance) => void }) {
  const { t } = useTranslation();
  const [previewMode, setPreviewMode] = useState('light');
  const [fontFailed, setFontFailed] = useState(false);
  useEffect(() => { let active = true; setFontFailed(false); void Promise.all([loadWorkspaceFont(value.font), ...(value.fontHeading === 'inherit' ? [] : [loadWorkspaceFont(value.fontHeading)])]).catch(() => { if (active) setFontFailed(true); }); return () => { active = false; }; }, [value.font, value.fontHeading]);
  const colorValid = (color: string | null) => color === null || /^#[0-9a-fA-F]{6}$/.test(color);
  const preview = { ...value, primaryColorDark:colorValid(value.primaryColorDark)?value.primaryColorDark:null, primaryColor: colorValid(value.primaryColor) ? value.primaryColor : null, secondaryColor: colorValid(value.secondaryColor) ? value.secondaryColor : null, secondaryColorDark: colorValid(value.secondaryColorDark) ? value.secondaryColorDark : null };
  const tokens = workspaceAppearanceTokens(preview, previewMode === 'dark');
  const lightPrimary=workspaceAppearanceTokens(preview,false)['--primary'],darkPrimary=workspaceAppearanceTokens(preview,true)['--primary'];
  const swatches = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    return Object.fromEntries(['primaryColor', 'primaryColorDark','secondaryColor','secondaryColorDark'].map(key => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = key==='primaryColor'?lightPrimary:key==='primaryColorDark'?darkPrimary:workspaceAppearanceTokens(preview,key==='secondaryColorDark')['--secondary']; context.fillRect(0, 0, 1, 1);
      const rgb = context.getImageData(0, 0, 1, 1).data;
      return [key, '#' + [...rgb].slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join('')];
    }));
  }, [lightPrimary,darkPrimary, value.secondaryColor, value.secondaryColorDark, value.theme, value.baseColor]);
  function select<K extends 'baseColor' | 'theme' | 'chartColor' | 'font' | 'fontHeading' | 'radius' | 'menuColor' | 'menuAccent' | 'logoIcon'>(key: K, options: { value: WorkspaceAppearance[K]; label: string }[]) {
    const id = `workspace-${key}`;
    return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{t(`design_${key}`)}</FieldLabel><Select items={options} value={value[key]} disabled={disabled} onValueChange={next => { if (next) onChange({ ...value, [key]: next }); }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(item => <SelectItem key={item.value} value={item.value}>{key==='logoIcon'?<WorkspaceLogo icon={item.value as WorkspaceLogoIcon} className="size-4"/>:null}{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
  }
  function color(key: 'primaryColor' | 'primaryColorDark' | 'secondaryColor' | 'secondaryColorDark') {
    const id = `workspace-${key}`;
    const valid = colorValid(value[key]);
    return <Field data-disabled={disabled || undefined} data-invalid={!valid}><FieldLabel htmlFor={id}>{t(`design_${key}`)}</FieldLabel><div className="flex items-center gap-2">
      <Input type="color" className="w-12 shrink-0" value={valid && value[key] ? value[key]! : swatches[key]} disabled={disabled} aria-label={t('designChooseColor', { name: t(`design_${key}`) })} onChange={event => onChange({ ...value, [key]: event.target.value })} />
      <Input id={id} value={value[key] ?? ''} placeholder={t('designAutomatic')} maxLength={7} pattern="#[0-9a-fA-F]{6}" disabled={disabled} aria-invalid={!valid} aria-describedby={valid ? 'workspace-colors-help' : `${id}-error`} onChange={event => onChange({ ...value, [key]: event.target.value || null })} />
      <Button type="button" variant="outline" size="icon" disabled={disabled || value[key] === null} aria-label={t('designResetColor', { name: t(`design_${key}`) })} onClick={() => onChange({ ...value, [key]: null })}><RotateCcwIcon /></Button>
    </div>{!valid ? <FieldError id={`${id}-error`}>{t('designColorInvalid')}</FieldError> : null}</Field>;
  }
  return <FieldGroup className="@container/design">
    <FieldDescription>{t('workspaceAppearanceHelp')}</FieldDescription>
    {fontFailed ? <Alert variant="destructive"><AlertDescription>{t('workspaceFontFailed')}</AlertDescription></Alert> : null}
    <div className="grid min-w-0 items-start gap-6 @[600px]/design:grid-cols-2">
    <SettingsSection><Tabs defaultValue="colors" className="min-w-0">
      <TabsList aria-label={t('designOptions')} className="w-full"><TabsTrigger value="colors">{t('designColors')}</TabsTrigger><TabsTrigger value="fonts">{t('designFonts')}</TabsTrigger><TabsTrigger value="identity">{t('workspaceLogo')}</TabsTrigger><TabsTrigger value="menu">{t('designMenu')}</TabsTrigger></TabsList>
      <TabsContent value="colors"><FieldSet><FieldLegend className="sr-only">{t('designColors')}</FieldLegend><FieldGroup className="gap-4 pt-2">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">{select('baseColor', workspaceBaseColors.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}
        {select('theme', workspaceThemes.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}</FieldGroup>
        <FieldGroup className="gap-4">{color('primaryColor')}{color('primaryColorDark')}</FieldGroup><FieldGroup className="gap-4">{color('secondaryColor')}{color('secondaryColorDark')}</FieldGroup>
        <FieldDescription id="workspace-colors-help">{t('workspaceColorsHelp')} {t('colorPreviewHelp')}</FieldDescription>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">{select('chartColor', workspaceChartColors.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}
        {select('radius', workspaceRadii.map(item => ({ value: item, label: t(`designRadius_${item}`) })))}</FieldGroup>
      </FieldGroup></FieldSet></TabsContent>
      <TabsContent value="fonts"><FieldSet><FieldLegend className="sr-only">{t('designFonts')}</FieldLegend><FieldGroup className="gap-4 pt-2">
        {select('font', workspaceFontOptions.map(item => ({ value: item.value, label: item.label })))}
        {select('fontHeading', [{ value: 'inherit', label: t('designHeadingInherit') }, ...workspaceFontOptions.map(item => ({ value: item.value, label: item.label }))])}
        <FieldDescription>{t('workspaceFontsHelp')}</FieldDescription>
      </FieldGroup></FieldSet></TabsContent>
      <TabsContent value="identity"><FieldGroup className="gap-4 pt-2">
        {select('logoIcon',workspaceLogoIcons.map(icon=>({value:icon,label:t(`workspaceIcon_${icon}`)})))}
        <div className="flex flex-wrap items-center gap-4"><div className="flex size-14 items-center justify-center rounded-lg border bg-muted text-foreground" role="img" aria-label={t(`workspaceIcon_${value.logoIcon}`)}><WorkspaceLogo icon={value.logoIcon} className="size-7"/></div><Button type="button" variant="outline" disabled aria-describedby="workspace-logo-help"><UploadIcon data-icon="inline-start"/>{t('workspaceLogoUpload')}</Button></div>
        <FieldDescription id="workspace-logo-help">{t('workspaceLogoHelp')}</FieldDescription>
      </FieldGroup></TabsContent>
      <TabsContent value="menu"><FieldSet><FieldLegend className="sr-only">{t('designMenu')}</FieldLegend><FieldGroup className="gap-4 pt-2">
        {select('menuColor', workspaceMenuColors.map(item => ({ value: item, label: t(`designMenu_${item}`) })))}
        {select('menuAccent', workspaceMenuAccents.map(item => ({ value: item, label: t(`designMenuAccent_${item}`) })))}
      </FieldGroup></FieldSet></TabsContent>
    </Tabs></SettingsSection>
    <SettingsSection className="@[600px]/design:sticky @[600px]/design:top-0"><FieldSet className="min-w-0"><FieldLegend>{t('preview')}</FieldLegend>
    <Tabs value={previewMode} onValueChange={setPreviewMode}><TabsList aria-label={t('preview')} className="w-full"><TabsTrigger value="light">{t('light')}</TabsTrigger><TabsTrigger value="dark">{t('dark')}</TabsTrigger></TabsList>
      {[false, true].map(dark => <TabsContent value={dark ? 'dark' : 'light'} key={String(dark)} data-theme-preview={dark ? 'dark' : 'light'} className={dark ? 'dark' : undefined}>
        <WorkspaceDesignPreview appearance={preview} dark={dark} />
      </TabsContent>)}
    </Tabs></FieldSet></SettingsSection></div>
  </FieldGroup>;
}
