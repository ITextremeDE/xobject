import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, KeyboardIcon } from 'lucide-react';
import type { AuthUser } from '@xobject/contracts';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export function UserMenu({ user, placement, busy, signingOut, onSettings, onSignOut, onKeyboardHelp }: {
  user: AuthUser; placement: 'header' | 'sidebar'; busy: boolean; signingOut: boolean; onSettings: () => void; onSignOut: () => void; onKeyboardHelp: (trigger: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const sidebar = placement === 'sidebar';
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <DropdownMenu>
    <DropdownMenuTrigger ref={triggerRef} render={sidebar ? <SidebarMenuButton data-user-menu={placement} size="lg" aria-label={user.name} /> : <Button data-user-menu={placement} variant="outline" size="icon-lg" aria-label={user.name} title={user.name} />}>
      <Avatar className={sidebar ? undefined : "size-5"}><AvatarFallback>{user.name.split(/\s+/).map(part => Array.from(part)[0]).slice(0, 2).join('').toUpperCase()}</AvatarFallback></Avatar>
      {sidebar ? <><div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{user.name}</span><span className="truncate text-xs">{user.email}</span></div><ChevronsUpDownIcon className="ml-auto" /></> : null}
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-56" align="end" side={sidebar && !isMobile ? 'right' : 'bottom'} sideOffset={4}>
      <DropdownMenuGroup><DropdownMenuLabel className="p-0 font-normal"><div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"><Avatar><AvatarFallback>{user.name.split(/\s+/).map(part => Array.from(part)[0]).slice(0, 2).join('').toUpperCase()}</AvatarFallback></Avatar><div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{user.name}</span><span className="truncate text-xs text-muted-foreground">{user.email}</span></div></div></DropdownMenuLabel></DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem className="gap-2 py-1.5" disabled={busy} onClick={onSettings}><SettingsIcon />{t('settings')}</DropdownMenuItem><DropdownMenuItem className="gap-2 py-1.5" disabled={busy} onClick={() => onKeyboardHelp(triggerRef.current)}><KeyboardIcon />{t('keyboardHelp')}</DropdownMenuItem></DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem className="gap-2 py-1.5" disabled={busy || signingOut} onClick={onSignOut}><LogOutIcon />{t('signOut')}</DropdownMenuItem></DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
