import {SettingsSection} from './settings-section';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {PrincipalPermissions} from './content-permissions';
import { SettingsHelp } from './settings-help';
import { SettingsTable, SettingsTableSearch, useSettingsTable } from './settings-table';
import { ClientTablePagination } from './client-table-pagination';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, Trash2Icon, ShieldCheckIcon } from 'lucide-react';
import type { WorkspaceMember } from '@xobject/contracts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { ErrorNotice, Loading } from './feedback';

type Role = 'user' | 'designer';
export function WorkspaceMembers({ workspaceId, isAdmin, onDirtyChange, onBusyChange,actionTarget }: { actionTarget?:HTMLElement|null; workspaceId: string; isAdmin: boolean; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [rightsDirty,setRightsDirty]=useState(false),[rightsBusy,setRightsBusy]=useState(false);
  const [permissionPrincipal,setPermissionPrincipal]=useState(''),[removal,setRemoval]=useState<WorkspaceMember|null>(null);
  function openPermissions(id:string){setPermissionPrincipal(id);requestAnimationFrame(()=>document.getElementById('permission-principal-user')?.focus());}
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('user');
  const members = useQuery({ queryKey: ['workspace-members', workspaceId], queryFn: () => api('list_workspace_members', { workspaceId }) });
  const { search, onSearch, pagination } = useSettingsTable(members.data ?? [], member => `${member.name} ${member.email} ${t(member.role === 'administrator' ? 'roleAdministrator' : member.role === 'designer' ? 'roleDesigner' : 'roleUser')}`);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('list_users', {}), enabled: isAdmin });
  const roles = [{ value: 'user' as const, label: t('roleUser') }, { value: 'designer' as const, label: t('roleDesigner') }];
  const mutation = useMutation({ mutationFn: (change: { userId: string; role: Role | null; expectedRole: Role | null }) => api('set_workspace_member', { workspaceId, ...change }), onSuccess: async (_result, change) => {
    if(change.role===null)setRemoval(null);
    if (change.expectedRole === null) { setUserId(''); setRole('user'); }
    await Promise.all([client.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }), client.invalidateQueries({ queryKey: ['workspaces'] }), client.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] }), client.invalidateQueries({ queryKey: ['field-principals', workspaceId] }),client.invalidateQueries({queryKey:['content-permissions']}),client.invalidateQueries({queryKey:['managed-users']})]);
  } });
  useEffect(() => { onDirtyChange(rightsDirty||Boolean(userId) || role !== 'user'); }, [rightsDirty,userId, role, onDirtyChange]);
  useEffect(() => { onBusyChange(rightsBusy||mutation.isPending); }, [rightsBusy,mutation.isPending, onBusyChange]);
  const available = (users.data ?? []).filter(user => !user.isAdmin && !members.data?.some(member => member.id === user.id)).map(user => ({ value: user.id, label: `${user.name} (${user.email})` }));
  function changeRole(member: WorkspaceMember, value: Role | null) { if (isAdmin && member.role !== 'administrator') mutation.mutate({ userId: member.id, role: value, expectedRole: member.role }); }
  return <FieldGroup><SettingsSection><FieldSet><FieldLegend>{t('members')}</FieldLegend>
    <FieldDescription>{t('membershipSummary')}</FieldDescription>{isAdmin ? <FieldDescription>{t('membershipImmediateHelp')}</FieldDescription> : null}<SettingsHelp title={t('membershipDetails')}>{t('membershipHelp')}</SettingsHelp><SettingsTableSearch value={search} onChange={onSearch} />
    {mutation.isError ? <ErrorNotice error={mutation.error} retry={() => { mutation.reset(); void members.refetch(); }} /> : null}
    {members.isPending ? <Loading variant="table" headings={[t('memberName'),t('role'),<span className="sr-only">{t('removeMember')}</span>]}/> : members.isError ? <ErrorNotice error={members.error} /> : <><SettingsTable aria-label={t('members')}><TableHeader><TableRow><TableHead>{t('memberName')}</TableHead><TableHead className="w-[40%]">{t('role')}</TableHead>{isAdmin ? <TableHead className="w-20"><span className="sr-only">{t('actions')}</span></TableHead> : null}</TableRow></TableHeader><TableBody>{!pagination.total ? <TableRow><TableCell colSpan={isAdmin ? 3 : 2}>{t('settingsNoMatches')}</TableCell></TableRow> : null}{pagination.rows.map(member => <TableRow key={member.id}><TableCell><div className="truncate" title={member.name}>{member.name}</div><div className="truncate text-muted-foreground" title={member.email}>{member.email}</div></TableCell><TableCell>{member.role === 'administrator' ? t('roleAdministrator') : !isAdmin ? t(member.role === 'designer' ? 'roleDesigner' : 'roleUser') : <Select items={roles} value={member.role} disabled={mutation.isPending||rightsDirty||rightsBusy} onValueChange={value => { if (value && value !== member.role) changeRole(member, value as Role); }}><SelectTrigger className="w-full" aria-label={t('memberRole', { name: member.name })}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>}</TableCell>{isAdmin ? <TableCell>{member.role !== 'administrator' ? <div className="flex flex-wrap justify-end gap-1"><Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||rightsDirty||rightsBusy} aria-label={t('permissionsFor',{name:member.name})} onClick={()=>openPermissions(member.id)}><ShieldCheckIcon/></Button><Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||rightsDirty||rightsBusy} aria-label={t('removeNamedMember', { name: member.name })} onClick={() => {mutation.reset();setRemoval(member);}}><Trash2Icon /></Button></div> : null}</TableCell> : null}</TableRow>)}</TableBody></SettingsTable><ClientTablePagination pagination={pagination} countLabel={t('memberCount', { count: pagination.total })} disabled={mutation.isPending||rightsDirty||rightsBusy} /></>}
    {isAdmin ? users.isError ? <ErrorNotice error={users.error} /> : users.isPending ? <Loading variant="field"/> : !available.length ? <FieldDescription>{t('noAvailableUsers')}</FieldDescription> : <form data-shortcut-submit onSubmit={event => { event.preventDefault(); if (userId && !mutation.isPending) mutation.mutate({ userId, role, expectedRole: null }); }}><FieldGroup>
      <Field data-disabled={(mutation.isPending || !available.length) || undefined}><FieldLabel htmlFor="member-user">{t('addMember')}</FieldLabel><Select items={available} value={userId || null} disabled={mutation.isPending || !available.length} onValueChange={value => setUserId(value ?? '')}><SelectTrigger id="member-user" className="w-full"><SelectValue placeholder={t('chooseUser')} /></SelectTrigger><SelectContent><SelectGroup>{available.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{!available.length ? <FieldDescription>{t('noAvailableUsers')}</FieldDescription> : null}</Field>
      <Field data-disabled={(mutation.isPending || !available.length) || undefined}><FieldLabel htmlFor="member-role">{t('role')}</FieldLabel><Select items={roles} value={role} disabled={mutation.isPending || !available.length} onValueChange={value => { if (value) setRole(value as Role); }}><SelectTrigger id="member-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field orientation="horizontal"><Button type="submit" disabled={!userId || mutation.isPending}><PlusIcon data-icon="inline-start" />{t('addMember')}</Button><Button type="button" variant="outline" disabled={mutation.isPending || (!userId && role === 'user')} onClick={() => { setUserId(''); setRole('user'); mutation.reset(); }}>{t('resetPreferences')}</Button></Field>
    </FieldGroup></form> : null}
    </FieldSet></SettingsSection>
    {isAdmin?<PrincipalPermissions selected={permissionPrincipal} onSelect={setPermissionPrincipal} actionTarget={actionTarget} workspaceId={workspaceId} kind="user" principals={(members.data??[]).filter(member=>member.role!=='administrator')} onDirtyChange={setRightsDirty} onBusyChange={setRightsBusy}/>:null}
    <AlertDialog open={Boolean(removal)} onOpenChange={open=>{if(!open&&!mutation.isPending)setRemoval(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('removeMemberConfirm',{name:removal?.name})}</AlertDialogTitle><AlertDialogDescription>{t('removeMemberConsequences')}</AlertDialogDescription></AlertDialogHeader>{mutation.isError?<ErrorNotice error={mutation.error}/>:null}<AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={mutation.isPending} onClick={event=>{event.preventDefault();if(removal)changeRole(removal,null);}}>{t('removeMember')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}
