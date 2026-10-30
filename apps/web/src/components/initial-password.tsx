import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthUser } from '@xobject/contracts';
import { signOut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FieldGroup, FieldDescription } from '@/components/ui/field';
import { AccountSecuritySettings } from './account-security';
export function InitialPassword({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return <main className="mx-auto max-w-2xl p-8"><FieldGroup><h1 className="text-xl font-semibold">{t('initialPasswordRequired')}</h1><FieldDescription>{t('initialPasswordRequiredHelp')}</FieldDescription><AccountSecuritySettings user={user} active initialOnly onDirtyChange={() => {}} onBusyChange={setBusy} /><Button variant="outline" disabled={busy} onClick={() => { void signOut().then(onSignOut); }}>{t('signOut')}</Button></FieldGroup></main>;
}
