import {OAuthApplications} from './oauth-applications';
import {notifySuccess} from '@/lib/notifications';
import {ApiCredentialSettings} from './api-credentials';
import {SettingsHelp} from './settings-help';
import {SettingsSection} from './settings-section';
import {AccountSecurityLoading} from './loading';
import { SettingsTable } from './settings-table';
import { ClientTablePagination, useClientPagination } from './client-table-pagination';
import { useRegional } from '@/lib/regional-context';
import { formatRegionalDate } from '@/lib/regional';
import { useTimeZone } from '@/lib/time-zone-context';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOutIcon, RefreshCwIcon } from 'lucide-react';
import type { AccountSession, AuthUser } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ErrorNotice } from './feedback';

export function sessionDevice(session: Pick<AccountSession, 'userAgent'>, fallback: string): string {
  const agent = session.userAgent ?? '';
  const browser = /Edg\//.test(agent) ? 'Edge' : /(?:Chrome|CriOS)\//.test(agent) ? 'Chrome' : /(?:Firefox|FxiOS)\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : '';
  const system = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS / iPadOS' : /Windows/.test(agent) ? 'Windows' : /Macintosh|Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  return [browser, system].filter(Boolean).join(' · ') || fallback;
}

export function AccountSecuritySettings({ user, active, initialOnly = false, onDirtyChange, onBusyChange }: { initialOnly?: boolean; user: AuthUser; active: boolean; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const timeZone = useTimeZone();
  const regional = useRegional();
  const client = useQueryClient();
  const security = useQuery({ queryKey: ['account-security', user.id], queryFn: () => api('get_account_security', {}), enabled: active });
  const pagination = useClientPagination(security.data?.sessions ?? []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [confirmSession, setConfirmSession] = useState<string | null>(null);
  const [credentialDirty,setCredentialDirty]=useState(false),[credentialBusy,setCredentialBusy]=useState(false);
  const dirty = Boolean(currentPassword || newPassword || confirmation) || !revokeOthers;
  const valid = currentPassword.length > 0 && currentPassword.length <= 128 && newPassword.length >= 12 && newPassword.length <= 128 && newPassword === confirmation && currentPassword !== newPassword;
  const password = useMutation({ mutationFn: () => api('change_password', { currentPassword, newPassword, revokeOtherSessions: revokeOthers }), onSuccess: async () => {
    setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setRevokeOthers(true); notifySuccess(t('passwordChanged'));
    await client.invalidateQueries({ queryKey: ['account-security', user.id] });
    await client.invalidateQueries({queryKey:['api-credentials']});
    await client.invalidateQueries({queryKey:['oauth-authorizations']});
    await client.invalidateQueries({ queryKey: ['session'] });
  } });
  const revoke = useMutation({ mutationFn: (id: string) => id === 'others' ? api('revoke_other_sessions', {}) : api('revoke_session', { sessionId: id }), onSuccess: async () => {
    setConfirmSession(null); notifySuccess(t('sessionsRevoked'));
    await client.invalidateQueries({ queryKey: ['account-security', user.id] });
  } });
  const [oauthBusy,setOAuthBusy]=useState(false);
  const busy = password.isPending || revoke.isPending || credentialBusy || oauthBusy;
  useEffect(() => { onDirtyChange(dirty||credentialDirty); }, [dirty,credentialDirty,onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  function reset() { setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setRevokeOthers(true);  password.reset(); }
  const passwordErrors: Record<string, string> = { 'Current password is incorrect': 'currentPasswordWrong', 'New password must be different': 'passwordMustDiffer', 'Local password is not available': 'noLocalPassword', 'Password attempts exceeded': 'passwordRateLimit' };
  const currentPasswordInvalid = password.isError && password.error.message === 'Current password is incorrect';
  const newPasswordInvalid = Boolean(newPassword && (newPassword.length < 12 || newPassword === currentPassword));
  const confirmationInvalid = Boolean(confirmation && confirmation !== newPassword);
  const formatDate = (value: string) => formatRegionalDate(value, regional, timeZone, true);
  return <FieldGroup>
    {initialOnly ? <FieldDescription>{t('signedInAccount', { email: user.email })}</FieldDescription> : null}
    {security.isPending ? <AccountSecurityLoading initialOnly={initialOnly}/> : security.isError ? <ErrorNotice error={security.error} retry={() => { void security.refetch(); }} /> : <>
      {!initialOnly ? <SettingsSection><Field><FieldLabel htmlFor="account-email">{t('email')}</FieldLabel><Input id="account-email" type="email" value={user.email} readOnly autoComplete="email" aria-describedby="account-email-help"/><FieldDescription id="account-email-help">{t('profileEmailReadOnly')}</FieldDescription><SettingsHelp title={t('emailChangeDetails')}>{t('profileEmailHelp')}</SettingsHelp></Field></SettingsSection> : null}
      <SettingsSection><form id="account-password-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (valid && !busy && security.data.hasPassword) password.mutate(); }}><FieldSet className="min-w-0" disabled={busy}><FieldLegend>{t('changePassword')}</FieldLegend>
        {password.isError ? password.error instanceof ApiError && passwordErrors[password.error.message] ? ['Current password is incorrect', 'New password must be different'].includes(password.error.message) ? null : <Alert variant="destructive"><AlertDescription>{t(passwordErrors[password.error.message])}</AlertDescription></Alert> : <ErrorNotice error={password.error} /> : null}
        {security.data.hasPassword ? <FieldGroup>
          <Field data-disabled={busy || undefined} data-invalid={currentPasswordInvalid}><FieldLabel htmlFor="current-password">{t('currentPassword')}</FieldLabel><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} aria-invalid={currentPasswordInvalid} aria-describedby={currentPasswordInvalid ? 'current-password-error' : undefined} required maxLength={128} disabled={busy} onChange={event => { setCurrentPassword(event.target.value); password.reset();  }} />{currentPasswordInvalid ? <FieldError id="current-password-error">{t('currentPasswordWrong')}</FieldError> : null}</Field>
          <Field data-disabled={busy || undefined} data-invalid={newPasswordInvalid}><FieldLabel htmlFor="new-password">{t('newPassword')}</FieldLabel><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} required minLength={12} maxLength={128} disabled={busy} aria-invalid={newPasswordInvalid} aria-describedby={newPasswordInvalid ? 'password-length new-password-error' : 'password-length'} onChange={event => { setNewPassword(event.target.value);  }} /><FieldDescription id="password-length">{t('passwordLengthHelp')}</FieldDescription>{newPasswordInvalid ? <FieldError id="new-password-error">{t(newPassword === currentPassword ? 'passwordMustDiffer' : 'passwordLengthError')}</FieldError> : null}</Field>
          <Field data-disabled={busy || undefined} data-invalid={confirmationInvalid}><FieldLabel htmlFor="confirm-password">{t('confirmPassword')}</FieldLabel><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} required maxLength={128} disabled={busy} aria-invalid={confirmationInvalid} aria-describedby={confirmationInvalid ? 'password-mismatch' : undefined} onChange={event => { setConfirmation(event.target.value);  }} />{confirmationInvalid ? <FieldError id="password-mismatch">{t('passwordMismatch')}</FieldError> : null}</Field>
          <Field data-disabled={(busy || initialOnly) || undefined} orientation="horizontal"><Checkbox id="password-revoke-others" checked={initialOnly || revokeOthers} disabled={busy || initialOnly} onCheckedChange={checked => setRevokeOthers(checked === true)} /><FieldLabel htmlFor="password-revoke-others">{t('revokeOnPasswordChange')}</FieldLabel></Field>
          <Field orientation="horizontal" className="flex-col items-stretch sm:flex-row sm:flex-wrap sm:justify-end"><Button type="button" variant="outline" disabled={!dirty || busy} onClick={reset}>{t('resetPreferences')}</Button><Button type="submit" disabled={!valid || busy} aria-keyshortcuts={keyboardCommands.save.aria}>{password.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{password.isPending ? t('saving') : t('changePassword')}<Kbd>{saveShortcutLabel}</Kbd></Button></Field>
        </FieldGroup> : <FieldDescription>{t('noLocalPassword')}</FieldDescription>}
      </FieldSet></form></SettingsSection>
      {!initialOnly ? <>
      <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('activeSessions')}</FieldLegend><FieldDescription>{t('sessionListHelp')}</FieldDescription>
        <Field orientation="horizontal" className="flex-col items-stretch sm:flex-row sm:flex-wrap sm:justify-end"><Button type="button" variant="outline" disabled={busy || security.isFetching} onClick={() => { void security.refetch(); }}><RefreshCwIcon data-icon="inline-start" />{t('refreshSessions')}</Button><Button type="button" variant="outline" disabled={busy || !security.data.sessions.some(session => !session.current)} onClick={() => { revoke.reset(); setConfirmSession('others'); }}><LogOutIcon data-icon="inline-start" />{t('revokeOtherSessions')}</Button></Field>
        <SettingsTable aria-label={t('activeSessions')}><TableHeader><TableRow><TableHead className="w-full sm:w-[45%]">{t('sessionDevice')}</TableHead><TableHead className="hidden sm:table-cell sm:w-[30%]">{t('sessionUpdated')}</TableHead><TableHead className="hidden sm:table-cell sm:w-[25%]"><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader><TableBody>{pagination.rows.map(session => <TableRow key={session.id}><TableCell className="whitespace-normal"><div>{sessionDevice(session, t('unknownDevice'))}</div><FieldDescription>{session.current ? t('currentSession') : session.ipAddress ?? t('unknownDevice')}</FieldDescription><FieldDescription>{t('sessionExpires', { time: formatDate(session.expiresAt) })}</FieldDescription><div className="mt-2 sm:hidden"><FieldDescription>{t('sessionUpdated')}: <time dateTime={session.updatedAt}>{formatDate(session.updatedAt)}</time></FieldDescription>{!session.current ? <Button type="button" variant="outline" className="mt-2" disabled={busy} aria-label={t('revokeNamedSession', { name: sessionDevice(session, t('unknownDevice')) })} onClick={() => { revoke.reset(); setConfirmSession(session.id); }}><LogOutIcon data-icon="inline-start" />{t('signOut')}</Button> : null}</div></TableCell><TableCell className="hidden whitespace-normal sm:table-cell"><time dateTime={session.updatedAt}>{formatDate(session.updatedAt)}</time></TableCell><TableCell className="hidden sm:table-cell">{!session.current ? <Button type="button" variant="outline" disabled={busy} aria-label={t('revokeNamedSession', { name: sessionDevice(session, t('unknownDevice')) })} onClick={() => { revoke.reset(); setConfirmSession(session.id); }}><LogOutIcon data-icon="inline-start" />{t('signOut')}</Button> : null}</TableCell></TableRow>)}</TableBody></SettingsTable><ClientTablePagination pagination={pagination} countLabel={t('sessionCount', { count: pagination.total })} disabled={busy} />
      </FieldSet></SettingsSection></> : null}
    </>}
    {!initialOnly&&security.isSuccess?<ApiCredentialSettings ownerName={user.name} active={active} disabled={password.isPending||revoke.isPending||dirty} onDirtyChange={setCredentialDirty} onBusyChange={setCredentialBusy}/>:null}
    {!initialOnly&&security.isSuccess?<OAuthApplications active={active} disabled={busy||dirty} onBusyChange={setOAuthBusy}/>:null}
    <AlertDialog open={confirmSession !== null} onOpenChange={open => { if (!open && !revoke.isPending) setConfirmSession(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(confirmSession === 'others' ? 'revokeOtherSessions' : 'revokeSession')}</AlertDialogTitle><AlertDialogDescription>{t('revokeSessionHelp')}</AlertDialogDescription></AlertDialogHeader>{revoke.isError ? <ErrorNotice error={revoke.error} /> : null}<AlertDialogFooter><AlertDialogCancel disabled={revoke.isPending}>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={revoke.isPending} onClick={() => { if (confirmSession) revoke.mutate(confirmSession); }}>{revoke.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{t('signOut')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}
