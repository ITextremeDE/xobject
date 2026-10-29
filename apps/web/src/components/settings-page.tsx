import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SunIcon, MoonIcon, MonitorIcon } from 'lucide-react';
import type { AuthUser, Language } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSeparator } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppearance, type Theme } from './preferences';
import { ErrorNotice } from './feedback';

export function SettingsPage({ user, onDirtyChange, onBusyChange }: {
  user: AuthUser; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { theme, setTheme } = useAppearance();
  const [baselineLanguage, setBaselineLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [language, setLanguage] = useState<Language | 'inherit'>(user.language ?? 'inherit');
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const selectedTheme = themeDraft ?? theme;
  const dirty = language !== baselineLanguage || selectedTheme !== theme;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const mutation = useMutation({ mutationFn: async () => {
    if (language !== baselineLanguage) await api('set_user_language', { language: language === 'inherit' ? null : language });
  }, onMutate: () => { onBusyChange(true); setSaved(false); }, onSuccess: () => {
    if (themeDraft) setTheme(themeDraft);
    setBaselineLanguage(language); setThemeDraft(null); setSaved(true); onDirtyChange(false);
    void client.invalidateQueries({ queryKey: ['session'] });
  }, onSettled: () => onBusyChange(false) });
  function reset() { setLanguage(baselineLanguage); setThemeDraft(null); setSaved(false); mutation.reset(); onDirtyChange(false); }
  return <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <div className="flex w-full max-w-md flex-col gap-2 py-2"><h1 className="text-2xl font-semibold tracking-tight">{t('settings')}</h1><FieldDescription>{t('settingsDescription')}</FieldDescription></div>
    <form id="settings-form" className="w-full max-w-md py-2" aria-label={t('personalPreferences')} data-shortcut-submit onSubmit={event => { event.preventDefault(); if (dirty && !mutation.isPending) mutation.mutate(); }}>
          <FieldGroup>
            {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
            {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
            <Field data-disabled={mutation.isPending || undefined}><FieldLabel htmlFor="language">{t('language')}</FieldLabel>
              <NativeSelect id="language" className="w-full" aria-describedby="language-help" value={language} disabled={mutation.isPending} onChange={event => { setLanguage(event.target.value as Language | 'inherit'); setSaved(false); }}>
                <NativeSelectOption value="inherit">{t('inherited')}</NativeSelectOption><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption>
              </NativeSelect><FieldDescription id="language-help">{t('languagePreferenceHelp')}</FieldDescription>
            </Field>
            <FieldSeparator />
            <Field data-disabled={mutation.isPending || undefined}><FieldLabel id="appearance-label">{t('theme')}</FieldLabel>
              <ToggleGroup variant="outline" value={[selectedTheme]} onValueChange={values => { const value = values[0]; if (value === 'light' || value === 'dark' || value === 'system') { setThemeDraft(value); setSaved(false); } }} disabled={mutation.isPending} aria-labelledby="appearance-label" aria-describedby="appearance-help" className="w-full">
                <ToggleGroupItem value="light" className="flex-1"><SunIcon />{t('light')}</ToggleGroupItem>
                <ToggleGroupItem value="dark" className="flex-1"><MoonIcon />{t('dark')}</ToggleGroupItem>
                <ToggleGroupItem value="system" className="flex-1"><MonitorIcon />{t('system')}</ToggleGroupItem>
              </ToggleGroup><FieldDescription id="appearance-help">{t('appearancePreferenceHelp')}</FieldDescription>
            </Field>
            <Field orientation="horizontal" className="flex-wrap"><Button form="settings-form" type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || mutation.isPending}>{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button><Button type="button" variant="outline" disabled={!dirty || mutation.isPending} onClick={reset}>{t('resetPreferences')}</Button></Field>
          </FieldGroup>
    </form>
  </div>;
}
