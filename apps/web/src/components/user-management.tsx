import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { ClientTablePagination, useClientPagination } from './client-table-pagination';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from 'lucide-react';
import type { ManagedUser } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DialogActions } from './dialog-actions';
import { ErrorNotice, Loading } from './feedback';

export function UserManagement({ ownId, onDirtyChange, onBusyChange }: { ownId: string; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  const users = useQuery({ queryKey: ['managed-users'], queryFn: () => api('list_managed_users', {}) });
  const pagination = useClientPagination(users.data ?? []);
  const [selected, setSelected] = useState<string | null>(null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const current = users.data?.find(user => user.id === selected);
  function close() { if (!busy) { if (dirty) setConfirm(true); else setSelected(null); } }
  return <FieldGroup><FieldDescription>{t('userManagementHelp')}</FieldDescription><div className="flex justify-end"><Button type="button" variant="outline" data-user-create onClick={() => setSelected('new')}><PlusIcon data-icon="inline-start" />{t('createUser')}</Button></div>{users.isPending ? <Loading /> : users.isError ? <ErrorNotice error={users.error} retry={() => { void users.refetch(); }} /> : <><Table><TableHeader><TableRow><TableHead>{t('displayName')}</TableHead><TableHead>{t('email')}</TableHead><TableHead>{t('role')}</TableHead><TableHead>{t('definitionState')}</TableHead></TableRow></TableHeader><TableBody>{pagination.rows.map(user => <TableRow key={user.id} onClick={event => {
    if (busy || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
    if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, label, [role="checkbox"], [role="combobox"], [contenteditable]')) return;
    setSelected(user.id);
  }}><TableCell><Button type="button" variant="link" data-managed-user={user.id} className="justify-start px-0 hover:no-underline" onClick={() => setSelected(user.id)}>{user.name}</Button></TableCell><TableCell>{user.email}</TableCell><TableCell>{t(user.isAdmin ? 'roleAdministrator' : 'roleUser')}</TableCell><TableCell>{t(user.active ? 'definition_active' : 'definition_inactive')}{user.mustChangePassword ? ` · ${t('initialPasswordPending')}` : ''}</TableCell></TableRow>)}</TableBody></Table><ClientTablePagination pagination={pagination} disabled={busy} /></>}
    {selected === 'new' || current ? <UserEditor key={selected} ownId={ownId} user={current} onClose={close} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={() => { setDirty(false); setBusy(false); setSelected(null); }} /> : null}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDirty(false); setSelected(null); setConfirm(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}
function UserEditor({ ownId, user, onClose, onSaved, onDirtyChange, onBusyChange }: { ownId: string; user?: ManagedUser; onClose: () => void; onSaved: () => void; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(user);
  const [name, setName] = useState(user?.name ?? ''), [email, setEmail] = useState(user?.email ?? ''), [password, setPassword] = useState(''), [active, setActive] = useState(user?.active ?? true), [isAdmin, setAdmin] = useState(user?.isAdmin ?? false);
  const dirty = baseline ? name !== baseline.name || active !== baseline.active || isAdmin !== baseline.isAdmin : Boolean(name || email || password);
  const valid = Boolean(name.trim() && (user || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 12 && password.length <= 128));
  const save = useMutation({ mutationFn: () => baseline ? api('configure_user', { userId: baseline.id, version: baseline.version, name, active, isAdmin }) : api('create_user', { name, email, initialPassword: password }), onSuccess: async () => { setPassword(''); await Promise.all(['managed-users', 'users', 'workspace-members', 'field-principals', 'session', 'system-journal'].map(key => client.invalidateQueries({ queryKey: [key] }))); onDirtyChange(false); onBusyChange(false); onSaved(); }, onError: async error => { if (error instanceof ApiError && error.status === 409) await client.invalidateQueries({ queryKey: ['managed-users'] }); } });
  useEffect(() => { if (user && !dirty) { setBaseline(user); setName(user.name); setEmail(user.email); setActive(user.active); setAdmin(user.isAdmin); } }, [user?.version]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]); useEffect(() => onBusyChange(save.isPending), [save.isPending, onBusyChange]);
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent closeButtonDisabled={save.isPending} finalFocus={() => document.querySelector<HTMLElement>(user ? `[data-managed-user="${user.id}"]` : '[data-user-create]') ?? true}><DialogHeader className="pr-8"><DialogTitle>{t(user ? 'editUser' : 'createUser')}</DialogTitle><DialogDescription>{t('userManagementHelp')}</DialogDescription></DialogHeader><form id="managed-user-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (dirty && valid && !save.isPending) save.mutate(); }}><FieldGroup>{save.isError ? <ErrorNotice error={save.error} /> : null}<Field><FieldLabel htmlFor="managed-name">{t('displayName')}</FieldLabel><Input id="managed-name" autoFocus value={name} maxLength={200} required disabled={save.isPending} onChange={event => setName(event.target.value)} /></Field><Field><FieldLabel htmlFor="managed-email">{t('email')}</FieldLabel><Input id="managed-email" type="email" value={email} required readOnly={Boolean(user)} disabled={save.isPending} onChange={event => setEmail(event.target.value)} />{user ? <FieldDescription>{t('profileEmailHelp')}</FieldDescription> : null}</Field>{user ? <><Field orientation="horizontal"><Checkbox id="managed-active" checked={active} disabled={save.isPending || user.id === ownId} onCheckedChange={checked => setActive(Boolean(checked))} /><FieldLabel htmlFor="managed-active">{t('userActive')}</FieldLabel></Field><Field orientation="horizontal"><Checkbox id="managed-admin" checked={isAdmin} disabled={save.isPending || user.id === ownId} onCheckedChange={checked => setAdmin(Boolean(checked))} /><FieldLabel htmlFor="managed-admin">{t('roleAdministrator')}</FieldLabel></Field><FieldDescription>{t('managedAccountHelp')}</FieldDescription></> : <Field><FieldLabel htmlFor="managed-password">{t('initialPassword')}</FieldLabel><Input id="managed-password" type="password" autoComplete="new-password" value={password} minLength={12} maxLength={128} required disabled={save.isPending} onChange={event => setPassword(event.target.value)} /><FieldDescription>{t('initialPasswordHelp')}</FieldDescription></Field>}</FieldGroup></form><DialogActions flush={false} onClose={onClose} disabled={save.isPending} closeLabel={t('cancel')}><Button type="button" variant="outline" disabled={!dirty || save.isPending} onClick={() => { setBaseline(user); setName(user?.name ?? ''); setEmail(user?.email ?? ''); setPassword(''); setActive(user?.active ?? true); setAdmin(user?.isAdmin ?? false); save.reset(); }}>{t('resetPreferences')}</Button><Button type="submit" form="managed-user-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !valid || save.isPending}>{save.isPending ? <Spinner data-icon="inline-start" /> : null}{t(user ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></DialogActions></DialogContent></Dialog>;
}
