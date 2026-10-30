import { useRegional } from '@/lib/regional-context';
import { formatRegionalDate } from '@/lib/regional';
import { useTimeZone } from '@/lib/time-zone-context';
import { DialogActions } from './dialog-actions';
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trash2Icon, PauseIcon, RotateCcwIcon, HistoryIcon, ChevronDownIcon } from 'lucide-react';
import type { DefinitionState, AuthUser } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { ErrorNotice, Loading } from './feedback';

export function DefinitionLifecycle({ label, kind, id, objectTypeId, state = 'active', isProtected, canDelete, disabled = false, onBusyChange, onDeleted }: {
  label: string; kind: 'object_type' | 'field'; id: string; objectTypeId: string; state?: DefinitionState; isProtected?: boolean; canDelete?: boolean; disabled?: boolean; onBusyChange: (busy: boolean) => void; onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation({ mutationFn: (next: DefinitionState) => api('set_definition_state', { kind, id, expectedState: state === 'inactive' ? 'inactive' : 'active', state: next, confirm: next === 'deleted' }), onMutate: () => onBusyChange(true), onSuccess: async result => {
    setConfirm(false);
    await Promise.all([client.invalidateQueries({ queryKey: ['definition', objectTypeId] }), client.invalidateQueries({ queryKey: ['types'] }), client.invalidateQueries({ queryKey: ['records', objectTypeId] }), client.invalidateQueries({ queryKey: ['record', objectTypeId], refetchType: 'all' }), client.invalidateQueries({ queryKey: ['definition-journal', objectTypeId] })]);
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
  const { t, i18n } = useTranslation();
  const timeZone = useTimeZone();
  const regional = useRegional();
  const [open, setOpen] = useState(false);
  const journal = useQuery({ queryKey: ['definition-journal', objectTypeId], queryFn: () => api('get_definition_journal', { objectTypeId }), enabled: open });
  const attributeKeys: Record<string, string> = { state: 'definitionState', label: 'objectName', physical_column_order: 'journalColumnOrder', labels: 'objectName', technical_name: 'technicalName', kind: 'fieldType', required: 'requiredField', config: 'journalConfiguration', definition: 'journalDefinition', option_order: 'journalOptionOrder', active: 'definition_active', deleted: 'definition_deleted', defaultId: 'defaultValue', defaultIds: 'defaultValue', defaults: 'defaultValue', multiple: 'journalMultiple', typeId: 'classificationType', statusId: 'classificationStatus', options: 'journalOptions', scale: 'decimalScale', currency: 'currency', formatted: 'markdownFormatting', referenceTarget: 'referenceTarget' };
  const attribute = (key: string) => t(attributeKeys[key] ?? key);
  function valueView(value: unknown, key: string, depth = 0): ReactNode {
    if (value === null || value === undefined) return <span className="text-muted-foreground">{t('journalNotSet')}</span>;
    if (typeof value === 'boolean') return t(value ? 'yes' : 'no');
    if (typeof value === 'string') {
      if (key === 'state' && ['active', 'inactive', 'deleted'].includes(value)) return t(`definition_${value}`);
      if (key === 'referenceTarget' && ['user', 'group', 'both'].includes(value)) return t(`reference_${value}`);
      if (key === 'kind' && i18n.exists(`fieldKind_${value}`)) return t(`fieldKind_${value}`);
      return value || <span className="text-muted-foreground">{t('journalEmpty')}</span>;
    }
    if (typeof value !== 'object') return String(value);
    const entries = Object.entries(value);
    if (!entries.length) return <span className="text-muted-foreground">{t('journalEmpty')}</span>;
    const content = Array.isArray(value)
      ? <ol className="flex flex-col gap-2">{value.map((item, index) => <li key={index}>{valueView(item, key, depth + 1)}</li>)}</ol>
      : <dl className="flex flex-col gap-2">{entries.map(([name, item]) => <div key={name}><dt className="text-xs text-muted-foreground">{key === 'labels' ? name === 'root' ? t('journalOriginalLabel') : new Intl.DisplayNames([i18n.language], { type: 'language' }).of(name) ?? name : attribute(name)}</dt><dd>{depth < 6 ? valueView(item, name, depth + 1) : JSON.stringify(item)}</dd></div>)}</dl>;
    return key === 'labels' || depth > 0 ? content : <Collapsible><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}><ChevronDownIcon data-icon="inline-start" />{t('journalShowDetails')}</CollapsibleTrigger><CollapsibleContent><div className="pt-3">{content}</div></CollapsibleContent></Collapsible>;
  }
  const dateFormat = (value: string) => formatRegionalDate(value, regional, timeZone, true);
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)}><HistoryIcon data-icon="inline-start" />{t('definitionJournal')}</Button><Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('definitionJournal')}</DialogTitle><DialogDescription>{t('definitionJournalHelp')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4">{journal.isPending ? <Loading /> : journal.isError ? <ErrorNotice error={journal.error} /> : !journal.data.length ? <Empty><EmptyHeader><EmptyTitle>{t('journalNoEntries')}</EmptyTitle></EmptyHeader></Empty> : <ol>{[...journal.data].reverse().map((entry, index) => <li key={entry.id}>
        {index > 0 ? <Separator /> : null}
        <article className="flex min-w-0 flex-col gap-3 py-4" aria-label={`${entry.field_id ? fieldLabels[entry.field_id] ?? entry.field_id : objectLabel} · ${attribute(entry.field_key)}`}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0"><h3 className="wrap-anywhere font-medium">{entry.field_id ? fieldLabels[entry.field_id] ?? entry.field_id : objectLabel}</h3><p className="text-sm text-muted-foreground">{attribute(entry.field_key)}</p></div>
            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="wrap-anywhere">{entry.actor_id === user.id ? user.name : entry.actor_id}</span><span aria-hidden="true">·</span><time dateTime={entry.created_at}>{dateFormat(entry.created_at)}</time></div>
          </div>
          <Table className="table-fixed" aria-label={attribute(entry.field_key)}><TableHeader><TableRow><TableHead>{t('before')}</TableHead><TableHead>{t('after')}</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell className="align-top whitespace-normal wrap-anywhere">{valueView(entry.old_value, entry.field_key)}</TableCell><TableCell className="align-top whitespace-normal wrap-anywhere">{valueView(entry.new_value, entry.field_key)}</TableCell></TableRow></TableBody></Table>
        </article>
      </li>)}</ol>}</div>
      <DialogActions onClose={() => setOpen(false)} />
    </DialogContent>
  </Dialog></>;
}
