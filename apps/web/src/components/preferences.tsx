import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

type Theme = 'light' | 'dark' | 'system';
export function ThemeSelect() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem('xobject:theme:v1'); return saved === 'light' || saved === 'dark' ? saved : 'system'; }
    catch { return 'system'; }
  });
  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && system.matches));
    apply(); system.addEventListener('change', apply);
    try { localStorage.setItem('xobject:theme:v1', theme); } catch { /* A blocked preference store must not block the app. */ }
    return () => system.removeEventListener('change', apply);
  }, [theme]);
  return <Field><FieldLabel className="sr-only" htmlFor="theme">{t('theme')}</FieldLabel>
    <NativeSelect id="theme" className="w-full" value={theme} onChange={event => setTheme(event.target.value as Theme)}>
      <NativeSelectOption value="light">{t('light')}</NativeSelectOption>
      <NativeSelectOption value="dark">{t('dark')}</NativeSelectOption>
      <NativeSelectOption value="system">{t('system')}</NativeSelectOption>
    </NativeSelect>
  </Field>;
}
