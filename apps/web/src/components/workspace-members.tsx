import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { WorkspaceMember } from '@xobject/contracts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { ErrorNotice, Loading } from './feedback';

type Role = 'user' | 'designer';
export function WorkspaceMembers({ workspaceId, isAdmin, onDirtyChange, onBusyChange }: { workspaceId: string; isAdmin: boolean; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('user');
  const members = useQuery({ queryKey: ['workspace-members', workspaceId], queryFn: () => api('list_workspace_members', { workspaceId }) });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('list_users', {}), enabled: isAdmin });
  const roles = [{ value: 'user' as const, label: t('roleUser') }, { value: 'designer' as const, label: t('roleDesigner') }];
  const mutation = useMutation({ mutationFn: (change: { userId: string; role: Role | null; expectedRole: Role | null }) => api('set_workspace_member', { workspaceId, ...change }), onSuccess: async (_result, change) => {
    if (change.expectedRole === null) { setUserId(''); setRole('user'); }
    await Promise.all([client.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }), client.invalidateQueries({ queryKey: ['workspaces'] }), client.invalidateQueries({ queryKey: ['field-principals', workspaceId] })]);
  } });
  useEffect(() => { onDirtyChange(Boolean(userId) || role !== 'user'); }, [userId, role, onDirtyChange]);
  useEffect(() => { onBusyChange(mutation.isPending); }, [mutation.isPending, onBusyChange]);
  const available = (users.data ?? []).filter(user => !user.isAdmin && !members.data?.some(member => member.id === user.id)).map(user => ({ value: user.id, label: `${user.name} (${user.email})` }));
  function changeRole(member: WorkspaceMember, value: Role | null) { if (isAdmin && member.role !== 'administrator') mutation.mutate({ userId: member.id, role: value, expectedRole: member.role }); }
  return <FieldGroup>
    <FieldDescription>{t('membershipHelp')}</FieldDescription>
    {mutation.isError ? <ErrorNotice error={mutation.error} retry={() => { mutation.reset(); void members.refetch(); }} /> : null}
    {members.isPending ? <Loading /> : members.isError ? <ErrorNotice error={members.error} /> : <Table aria-label={t('members')}><TableHeader><TableRow><TableHead>{t('memberName')}</TableHead><TableHead>{t('role')}</TableHead>{isAdmin ? <TableHead><span className="sr-only">{t('removeMember')}</span></TableHead> : null}</TableRow></TableHeader><TableBody>{members.data.map(member => <TableRow key={member.id}><TableCell><div>{member.name}</div><div className="text-muted-foreground">{member.email}</div></TableCell><TableCell>{member.role === 'administrator' ? t('roleAdministrator') : !isAdmin ? t(member.role === 'designer' ? 'roleDesigner' : 'roleUser') : <Select items={roles} value={member.role} disabled={mutation.isPending} onValueChange={value => { if (value && value !== member.role) changeRole(member, value as Role); }}><SelectTrigger aria-label={t('memberRole', { name: member.name })}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>}</TableCell>{isAdmin ? <TableCell>{member.role !== 'administrator' ? <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending} aria-label={t('removeNamedMember', { name: member.name })} onClick={() => changeRole(member, null)}><Trash2Icon /></Button> : null}</TableCell> : null}</TableRow>)}</TableBody></Table>}
    {isAdmin ? users.isError ? <ErrorNotice error={users.error} /> : users.isPending ? <Loading /> : <form data-shortcut-submit onSubmit={event => { event.preventDefault(); if (userId && !mutation.isPending) mutation.mutate({ userId, role, expectedRole: null }); }}><FieldGroup>
      <Field><FieldLabel htmlFor="member-user">{t('addMember')}</FieldLabel><Select items={available} value={userId || null} disabled={mutation.isPending || !available.length} onValueChange={value => setUserId(value ?? '')}><SelectTrigger id="member-user" className="w-full"><SelectValue placeholder={t('chooseUser')} /></SelectTrigger><SelectContent><SelectGroup>{available.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{!available.length ? <FieldDescription>{t('noAvailableUsers')}</FieldDescription> : null}</Field>
      <Field><FieldLabel htmlFor="member-role">{t('role')}</FieldLabel><Select items={roles} value={role} disabled={mutation.isPending || !available.length} onValueChange={value => { if (value) setRole(value as Role); }}><SelectTrigger id="member-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field orientation="horizontal"><Button type="submit" disabled={!userId || mutation.isPending}><PlusIcon data-icon="inline-start" />{t('addMember')}</Button><Button type="button" variant="outline" disabled={mutation.isPending || (!userId && role === 'user')} onClick={() => { setUserId(''); setRole('user'); mutation.reset(); }}>{t('resetPreferences')}</Button></Field>
    </FieldGroup></form> : null}
  </FieldGroup>;
}
