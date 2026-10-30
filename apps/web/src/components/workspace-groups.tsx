import { ClientTablePagination, useClientPagination } from './client-table-pagination';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, PauseIcon, RotateCcwIcon } from 'lucide-react';
import type { WorkspaceGroup, WorkspaceMember } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Kbd } from '@/components/ui/kbd';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DialogActions } from './dialog-actions';
import { ErrorNotice, Loading } from './feedback';

export function WorkspaceGroups({ workspaceId, isAdmin, canManage, onDirtyChange, onBusyChange }: { workspaceId: string; isAdmin: boolean; canManage: boolean; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const groups = useQuery({ queryKey: ['workspace-groups', workspaceId], queryFn: () => api('list_groups', { workspaceId }) });
  const pagination = useClientPagination([...(groups.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, i18n.language)));
  const members = useQuery({ queryKey: ['workspace-members', workspaceId], queryFn: () => api('list_workspace_members', { workspaceId }) });
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  function close() { if (busy) return; if (dirty) setConfirmClose(true); else setSelected(null); }
  const group = groups.data?.find(item => item.id === selected);
  return <FieldGroup><FieldDescription>{t('groupsHelp')}</FieldDescription>
    {canManage ? <div className="flex justify-end"><Button type="button" variant="outline" data-group-create onClick={() => setSelected('new')}><PlusIcon data-icon="inline-start" />{t('createGroup')}</Button></div> : null}
    {groups.isPending || members.isPending ? <Loading /> : groups.isError ? <ErrorNotice error={groups.error} /> : members.isError ? <ErrorNotice error={members.error} /> : !groups.data.length ? <Empty><EmptyHeader><EmptyTitle>{t('noGroups')}</EmptyTitle></EmptyHeader></Empty> : <><Table aria-label={t('userGroups')}><TableHeader><TableRow><TableHead>{t('objectName')}</TableHead><TableHead>{t('groupMembers')}</TableHead><TableHead>{t('definitionState')}</TableHead></TableRow></TableHeader><TableBody>{pagination.rows.map(item => <TableRow key={item.id} onClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString() || (event.target instanceof Element && event.target.closest('button, a, input'))) return;
      setSelected(item.id);
    }}><TableCell><Button type="button" variant="link" data-group-editor={item.id} className="justify-start px-0 hover:no-underline" onClick={() => setSelected(item.id)}>{item.name}</Button></TableCell><TableCell>{item.memberIds.length}</TableCell><TableCell>{t(item.active ? 'definition_active' : 'definition_inactive')}</TableCell></TableRow>)}</TableBody></Table><ClientTablePagination pagination={pagination} disabled={busy} /></>}
    {selected && (selected === 'new' || group) && members.data ? <GroupEditor key={selected} workspaceId={workspaceId} group={group} members={members.data} isAdmin={isAdmin} canManage={canManage} onClose={close} onCreated={() => { setDirty(false); setSelected(null); }} onDirtyChange={setDirty} onBusyChange={setBusy} /> : null}
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDirty(false); setSelected(null); setConfirmClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

function GroupEditor({ workspaceId, group, members, isAdmin, canManage, onClose, onCreated, onDirtyChange, onBusyChange }: { workspaceId: string; group?: WorkspaceGroup; members: WorkspaceMember[]; isAdmin: boolean; canManage: boolean; onClose: () => void; onCreated: () => void; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(group ?? { id: '', workspaceId, name: '', active: true, version: 1, memberIds: [] });
  const [name, setName] = useState(baseline.name);
  const [memberIds, setMemberIds] = useState(baseline.memberIds);
  const dirty = name !== baseline.name || JSON.stringify([...memberIds].sort()) !== JSON.stringify([...baseline.memberIds].sort());
  function adopt(value: WorkspaceGroup) { setBaseline(value); setName(value.name); setMemberIds(value.memberIds); }
  useEffect(() => { if (group && !dirty) adopt(group); }, [group?.version]);
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] }), client.invalidateQueries({ queryKey: ['field-principals', workspaceId] }), client.invalidateQueries({ queryKey: ['records'] })]); }
  const save = useMutation({ mutationFn: async () => {
    const membership = isAdmin && baseline.active ? { memberIds } : {};
    if (group) return api('configure_group', { workspaceId, groupId: group.id, version: baseline.version, name, ...membership });
    await api('create_group', { workspaceId, name, ...membership }); return null;
  }, onSuccess: async result => { await refresh(); if (result) adopt(result); onBusyChange(false); onDirtyChange(false); onCreated(); }, onError: async () => { await client.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] }); } });
  const state = useMutation({ mutationFn: () => api('set_group_active', { workspaceId, groupId: baseline.id, version: baseline.version, active: !baseline.active }), onSuccess: async result => { adopt(result); await refresh(); } });
  const busy = save.isPending || state.isPending;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-xl" closeButtonDisabled={busy} finalFocus={() => document.querySelector<HTMLElement>(group ? `[data-group-editor="${group.id}"]` : '[data-group-create]') ?? true}>
    <DialogHeader className="px-4 pt-4 pr-12"><DialogTitle>{t(group ? 'editGroup' : 'createGroup')}</DialogTitle><DialogDescription>{t('groupEditorHelp')}</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="group-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (canManage && dirty && name.trim() && !busy) save.mutate(); }}><FieldGroup>
      {save.isError ? <ErrorNotice error={save.error} /> : state.isError ? <ErrorNotice error={state.error} /> : null}
      <Field data-disabled={busy || undefined}><FieldLabel htmlFor="group-name">{t('objectName')}</FieldLabel><Input id="group-name" autoFocus value={name} required maxLength={200} readOnly={!canManage} disabled={busy} onChange={event => setName(event.target.value)} /></Field>
      <FieldSet><FieldLegend>{t('groupMembers')}</FieldLegend><FieldDescription>{t(isAdmin ? 'groupMembersHelp' : 'groupMembersAdminOnly')}</FieldDescription><FieldGroup className="gap-3">{members.map(member => <Field key={member.id} data-disabled={(!isAdmin || !baseline.active || busy) || undefined} orientation="horizontal"><Checkbox id={`group-user-${member.id}`} checked={memberIds.includes(member.id)} disabled={!isAdmin || !baseline.active || busy} onCheckedChange={checked => setMemberIds(old => checked ? [...old, member.id].sort() : old.filter(id => id !== member.id))} /><FieldLabel htmlFor={`group-user-${member.id}`}>{member.name}</FieldLabel></Field>)}</FieldGroup></FieldSet>
    </FieldGroup></form>
      {group ? <div className="flex flex-col gap-3 pt-6"><FieldDescription>{t(baseline.active ? 'groupActiveHelp' : 'groupInactiveHelp')}</FieldDescription>{isAdmin ? <Button type="button" variant="outline" className="self-start" disabled={dirty || busy} onClick={() => state.mutate()}>{state.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : baseline.active ? <PauseIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}{t(baseline.active ? 'deactivateDefinition' : 'reactivateDefinition')}</Button> : null}</div> : null}
    </div>
    <DialogActions onClose={onClose} disabled={busy} closeLabel={t(group ? 'close' : 'cancel')}>{canManage ? <><Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => { adopt(group ?? baseline); save.reset(); }}>{t('resetPreferences')}</Button><Button type="submit" form="group-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !name.trim() || busy}>{save.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}{t(group ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
  </DialogContent></Dialog>;
}
