import { SunIcon, MoonIcon, MonitorIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { useAppearance } from './preferences';

export function ThemeDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppearance();
  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label={t('theme')} title={t('theme')} />}><Icon /></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => { if (value === 'light' || value === 'dark' || value === 'system') setTheme(value); }}>
      <DropdownMenuRadioItem closeOnClick value="light"><SunIcon />{t('light')}</DropdownMenuRadioItem>
      <DropdownMenuRadioItem closeOnClick value="dark"><MoonIcon />{t('dark')}</DropdownMenuRadioItem>
      <DropdownMenuRadioItem closeOnClick value="system"><MonitorIcon />{t('system')}</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup></DropdownMenuContent>
  </DropdownMenu>;
}
