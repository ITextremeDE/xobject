import { WorkspaceMenuAppearanceProvider } from '@/lib/menu-appearance';
import { MenuAppearancePreview } from './menu-appearance-preview';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcwIcon } from 'lucide-react';
import { workspaceBaseColors, workspaceThemes, workspaceChartColors, workspaceRadii, workspaceMenuColors, workspaceMenuAccents, type WorkspaceAppearance } from '@xobject/contracts';
import { loadWorkspaceFont, workspaceAppearanceTokens, workspaceFontOptions } from '@/lib/workspace-appearance';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WorkspaceAppearanceFields({ value, disabled, onChange }: { value: WorkspaceAppearance; disabled: boolean; onChange: (value: WorkspaceAppearance) => void }) {
  const { t } = useTranslation();
  const [fontFailed, setFontFailed] = useState(false);
  useEffect(() => { let active = true; setFontFailed(false); void Promise.all([loadWorkspaceFont(value.font), ...(value.fontHeading === 'inherit' ? [] : [loadWorkspaceFont(value.fontHeading)])]).catch(() => { if (active) setFontFailed(true); }); return () => { active = false; }; }, [value.font, value.fontHeading]);
  const colorValid = (color: string | null) => color === null || /^#[0-9a-fA-F]{6}$/.test(color);
  const preview = { ...value, primaryColor: colorValid(value.primaryColor) ? value.primaryColor : null, secondaryColor: colorValid(value.secondaryColor) ? value.secondaryColor : null };
  function select<K extends 'baseColor' | 'theme' | 'chartColor' | 'font' | 'fontHeading' | 'radius' | 'menuColor' | 'menuAccent'>(key: K, options: { value: WorkspaceAppearance[K]; label: string }[]) {
    const id = `workspace-${key}`;
    return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{t(`design_${key}`)}</FieldLabel><Select items={options} value={value[key]} disabled={disabled} onValueChange={next => { if (next) onChange({ ...value, [key]: next }); }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
  }
  function color(key: 'primaryColor' | 'secondaryColor') {
    const id = `workspace-${key}`;
    const valid = colorValid(value[key]);
    return <Field data-disabled={disabled || undefined} data-invalid={!valid}><FieldLabel htmlFor={id}>{t(`design_${key}`)}</FieldLabel><div className="flex items-center gap-2">
      <Input type="color" className="w-12 shrink-0" value={valid && value[key] ? value[key]! : '#000000'} disabled={disabled} aria-label={t('designChooseColor', { name: t(`design_${key}`) })} onChange={event => onChange({ ...value, [key]: event.target.value })} />
      <Input id={id} value={value[key] ?? ''} placeholder={t('designAutomatic')} maxLength={7} pattern="#[0-9a-fA-F]{6}" disabled={disabled} aria-invalid={!valid} aria-describedby={valid ? 'workspace-colors-help' : `${id}-error`} onChange={event => onChange({ ...value, [key]: event.target.value || null })} />
      <Button type="button" variant="outline" size="icon" disabled={disabled || value[key] === null} aria-label={t('designResetColor', { name: t(`design_${key}`) })} onClick={() => onChange({ ...value, [key]: null })}><RotateCcwIcon /></Button>
    </div>{!valid ? <FieldError id={`${id}-error`}>{t('designColorInvalid')}</FieldError> : null}</Field>;
  }
  return <FieldGroup>
    <FieldDescription>{t('workspaceAppearanceHelp')}</FieldDescription>
    {select('baseColor', workspaceBaseColors.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}
    {select('theme', workspaceThemes.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}
    {color('primaryColor')}{color('secondaryColor')}
    <FieldDescription id="workspace-colors-help">{t('workspaceColorsHelp')}</FieldDescription>
    {select('chartColor', workspaceChartColors.map(item => ({ value: item, label: t(`designPalette_${item}`) })))}
    {select('radius', workspaceRadii.map(item => ({ value: item, label: t(`designRadius_${item}`) })))}
    {select('menuColor', workspaceMenuColors.map(item => ({ value: item, label: t(`designMenu_${item}`) })))}
    {select('menuAccent', workspaceMenuAccents.map(item => ({ value: item, label: t(`designMenuAccent_${item}`) })))}
    {select('font', workspaceFontOptions.map(item => ({ value: item.value, label: item.label })))}
    {select('fontHeading', [{ value: 'inherit', label: t('designHeadingInherit') }, ...workspaceFontOptions.map(item => ({ value: item.value, label: item.label }))])}
    <FieldDescription>{t('workspaceFontsHelp')}</FieldDescription>
    {fontFailed ? <Alert variant="destructive"><AlertDescription>{t('workspaceFontFailed')}</AlertDescription></Alert> : null}
    <FieldSet><FieldLegend>{t('preview')}</FieldLegend><div className="grid gap-4 lg:grid-cols-2">
      {[false, true].map(dark => <div key={String(dark)} data-theme-preview={dark ? 'dark' : 'light'} className={dark ? 'dark' : undefined}>
        <WorkspaceMenuAppearanceProvider appearance={preview} dark={dark}><div style={workspaceAppearanceTokens(preview, dark) as CSSProperties} className="flex flex-col gap-4 rounded-lg border bg-background p-4 font-sans text-foreground" role="group" aria-label={t(dark ? 'dark' : 'light')}>
          <h3 className="font-medium">{t(dark ? 'dark' : 'light')}</h3><p>{t('designPreviewText')}</p>
          <Input readOnly value={t('designPreviewInput')} aria-label={t('designPreviewInput')} />
          <div className="flex flex-wrap gap-2"><Button type="button">{t('design_primaryColor')}</Button><Button type="button" variant="secondary">{t('design_secondaryColor')}</Button></div>
          <div className="flex flex-col gap-2"><span className="text-sm text-muted-foreground">{t('design_chartColor')}</span><div className="flex gap-2" role="img" aria-label={t('designChartPreview')}>{[1, 2, 3, 4, 5].map(index => <span key={index} className="h-8 flex-1 rounded-sm" style={{ backgroundColor: `var(--chart-${index})` }} />)}</div></div>
          <MenuAppearancePreview />
        </div></WorkspaceMenuAppearanceProvider>
      </div>)}
    </div></FieldSet>
  </FieldGroup>;
}
