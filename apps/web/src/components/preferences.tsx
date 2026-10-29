import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export type Theme = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
export function AppearanceProvider({ children }: { children: ReactNode }) {
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
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function ThemeSelect({ showLabel = false }: { showLabel?: boolean }) {
  const { t } = useTranslation();
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeSelect needs AppearanceProvider');
  const { theme, setTheme } = context;
  return <Field><FieldLabel className={showLabel ? undefined : 'sr-only'} htmlFor="theme">{t('theme')}</FieldLabel>
    <NativeSelect id="theme" className="w-full" value={theme} onChange={event => setTheme(event.target.value as Theme)}>
      <NativeSelectOption value="light">{t('light')}</NativeSelectOption>
      <NativeSelectOption value="dark">{t('dark')}</NativeSelectOption>
      <NativeSelectOption value="system">{t('system')}</NativeSelectOption>
    </NativeSelect>
  </Field>;
}

export function useAppearance() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('Appearance controls need AppearanceProvider');
  return context;
}
