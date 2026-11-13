import {RecordJournalTable} from './record-journal-table';
import {useSettingsTable,SettingsTableSearch} from './settings-table';
import {journalEntryTitle} from '@/lib/journal-presentation';
import type {SystemJournalEntry} from '@xobject/contracts';
import { DialogActions } from './dialog-actions';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trash2Icon, PauseIcon, RotateCcwIcon, HistoryIcon } from 'lucide-react';
import type { DefinitionState, AuthUser } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

export function DefinitionLifecycle({ label, kind, id, objectTypeId, state = 'active', isProtected, canDelete, disabled = false, onBusyChange, onDeleted }: {
  label: string; kind: 'object_type' | 'field'; id: string; objectTypeId: string; state?: DefinitionState; isProtected?: boolean; canDelete?: boolean; disabled?: boolean; onBusyChange: (busy: boolean) => void; onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation({ mutationFn: (next: DefinitionState) => api('set_definition_state', { kind, id, expectedState: state === 'inactive' ? 'inactive' : 'active', state: next, confirm: next === 'deleted' }), onMutate: () => onBusyChange(true), onSuccess: async result => {
    setConfirm(false);
    await Promise.all([client.invalidateQueries({queryKey:['relationship-types']}),client.invalidateQueries({queryKey:['record-relationships']}),client.invalidateQueries({queryKey:['relationship-page']}),client.invalidateQueries({ queryKey: ['definition', objectTypeId] }), client.invalidateQueries({ queryKey: ['types'] }), client.invalidateQueries({ queryKey: ['records', objectTypeId] }), client.invalidateQueries({ queryKey: ['record', objectTypeId], refetchType: 'all' }), client.invalidateQueries({ queryKey: ['definition-journal', objectTypeId] })]);
    if (result.state === 'deleted') onDeleted?.();
  }, onSettled: () => onBusyChange(false) });
  const blocked = disabled || mutation.isPending || isProtected || state === 'deleted';
  const errors: Record<string, string> = { 'Definition was used; deactivate instead': 'definitionUsed', 'Definition has database dependencies': 'definitionDependencies', 'Module definition is protected': 'definitionProtected', 'Object type is inactive': 'definitionParentInactive', 'Definition state conflict': 'definitionConflict', 'Required classification value missing': 'definitionRestoreInvalid', 'Required field is empty': 'definitionRestoreInvalid' };
  const errorKey = errors[mutation.error?.message ?? ''] ?? (mutation.error instanceof ApiError && mutation.error.status === 409 ? 'definitionConflict' : 'definitionRestoreInvalid');
  return <FieldGroup>
    <FieldDescription>{t('definitionState')}: {t(`definition_${state}`)}</FieldDescription>
    {mutation.isError ? <Alert variant="destructive"><AlertDescription>{t(errorKey)}</AlertDescription></Alert> : null}
    {state !== 'deleted' ? <Field orientation="horizontal" className="flex-wrap"><Button type="button" variant="outline" disabled={blocked} onClick={() => mutation.mutate(state === 'active' ? 'inactive' : 'active')}>{mutation.isPending && mutation.variables !== 'deleted' ? <Spinner aria-hidden="true" data-icon="inline-start" /> : state === 'active' ? <PauseIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}{t(state === 'active' ? 'deactivateDefinition' : 'reactivateDefinition')}</Button><Button type="button" variant="outline" disabled={blocked || !canDelete} onClick={() => setConfirm(true)}><Trash2Icon data-icon="inline-start" />{t('deleteDefinition')}</Button></Field> : null}
    {isProtected ? <FieldDescription>{t('definitionProtected')}</FieldDescription> : state !== 'deleted' && !canDelete ? <FieldDescription>{t('definitionUsed')}</FieldDescription> : null}
    <AlertDialog open={confirm} onOpenChange={open => { if (!mutation.isPending) setConfirm(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('deleteDefinitionTitle', { name: label })}</AlertDialogTitle><AlertDialogDescription>{t('deleteDefinitionHelp')}</AlertDialogDescription></AlertDialogHeader>{mutation.isError ? <Alert variant="destructive"><AlertDescription>{t(errorKey)}</AlertDescription></Alert> : null}<AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={mutation.isPending} onClick={event => { event.preventDefault(); mutation.mutate('deleted'); }}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{t('deleteDefinition')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

export function DefinitionJournal({ objectTypeId, objectLabel, fieldLabels, user }: { objectTypeId: string; objectLabel: string; fieldLabels: Record<string, string>; user: AuthUser }) {
  const { t,i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const journal = useQuery({ queryKey: ['definition-journal', objectTypeId], queryFn: () => api('get_definition_journal', { objectTypeId }), enabled: open });
  const entries:SystemJournalEntry[]=[...(journal.data??[])].reverse().map(entry=>({...entry,entity_kind:entry.entity_kind??(entry.field_id?'field':'object_type'),entity_id:entry.entity_id??entry.field_id??objectTypeId,workspace_id:entry.workspace_id??null,workspace_name:entry.workspace_name??null,actor_name:entry.actor_name??(entry.actor_id===user.id?user.name:t('journalUnknownUser')),entity_name:entry.entity_name??(entry.field_id?fieldLabels[entry.field_id]??entry.field_id:objectLabel)}));
  const table=useSettingsTable(entries,entry=>[journalEntryTitle(entry,t,i18n.language),entry.field_key,entry.entity_name,entry.actor_name].join(' '));
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)}><HistoryIcon data-icon="inline-start" />{t('definitionJournal')}</Button><Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('definitionJournal')}</DialogTitle><DialogDescription>{t('definitionJournalHelp')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><RecordJournalTable contextColumns preferenceKey="definition-journal" entries={table.pagination.rows} filters={<SettingsTableSearch value={table.search} onChange={table.onSearch}/>} total={table.pagination.total} page={table.pagination.page} pageSize={table.pagination.pageSize} onPage={table.pagination.onPage} onPageSize={table.pagination.onPageSize} busy={journal.isFetching} loading={journal.isPending} error={journal.error} onRetry={()=>{void journal.refetch();}} emptyLabel={t('journalNoEntries')}/></div>
      <DialogActions onClose={() => setOpen(false)} />
    </DialogContent>
  </Dialog></>;
}
