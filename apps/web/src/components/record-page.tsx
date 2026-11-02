import { useRegional } from '@/lib/regional-context';
import { formatRegionalDate } from '@/lib/regional';
import { isInstant } from '@/lib/time-zone';
import { useTimeZone } from '@/lib/time-zone-context';
import { Spinner } from '@/components/ui/spinner';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, RotateCcwIcon, SaveIcon, ChevronDownIcon } from 'lucide-react';
import { isCustomFieldKind, type FieldValue, type AuthUser, type DataRecord, type ObjectDefinition } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { displayFieldValue } from './custom-field-control';
import { JournalEntryCard } from './journal-entry-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ClassificationFields, initialChoices, displayClassification, type ClassificationValues } from './classification-values';
import { CustomFieldControl, emptyCustomValue } from './custom-field-control';
import { ErrorNotice, Loading } from './feedback';

type Props = {
  definition: ObjectDefinition; recordId: string; user: AuthUser; workspaceName: string;
  onClose: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
  onSaved: (record: DataRecord) => void;
};
export function RecordPage(props: Props) {
  const { t } = useTranslation();
  const record = useQuery({ queryKey: ['record', props.definition.id, props.recordId],
    queryFn: () => api('get_record', { objectTypeId: props.definition.id, recordId: props.recordId }), enabled: props.recordId !== 'new' });
  if (props.recordId !== 'new' && record.isPending) return <Loading />;
  if (record.isError) return <FieldGroup><Button type="button" variant="outline" className="w-fit" onClick={props.onClose}><ArrowLeftIcon data-icon="inline-start" />{t('backToOverview')}</Button><ErrorNotice error={record.error} retry={() => { void record.refetch(); }} /></FieldGroup>;
  return <RecordForm key={props.recordId} {...props} record={record.data} />;
}

function RecordForm({ definition, record, recordId, user, workspaceName, onClose, onDirtyChange, onBusyChange, onSaved }: Props & { record?: DataRecord }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const userName = (id: string) => id === user.id ? user.name : principals.data?.find(principal => principal.kind === 'user' && principal.id === id)?.name ?? id;
  const [tab, setTab] = useState('details');
  const regional = useRegional(), timeZone = useTimeZone();
  const readOnly = Boolean(definition.state && definition.state !== 'active');
  const activeFields = definition.fields.filter(field => !field.state || field.state === 'active');
  const inactiveFields = definition.fields.filter(field => field.state === 'inactive');
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');
  const initial = () => ({ ...(hasKeyword ? { keyword: record?.keyword ?? '' } : {}), ...Object.fromEntries(activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(f => [f.technicalName, (record?.[f.technicalName] as FieldValue) ?? null])) });
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(initial);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [choices, setChoices] = useState<ClassificationValues>(() => record ? { type: record.type, status: record.status, category: record.category } : initialChoices(definition.classification));
  const [choiceBaseline, setChoiceBaseline] = useState(choices);
  const timestampInvalid = activeFields.some(field => field.kind === 'datetime' && typeof values[field.technicalName] === 'string' && Boolean(values[field.technicalName]) && !isInstant(String(values[field.technicalName])));
  const choicesDirty = JSON.stringify(choices) !== JSON.stringify(choiceBaseline);
  const [version, setVersion] = useState(record?.version);
  const [saved, setSaved] = useState(false);
  const dirty = choicesDirty || Object.keys(values).some(key => JSON.stringify(values[key]) !== JSON.stringify(baseline[key]));
  const mutation = useMutation({ mutationFn: async () => {
    const data = Object.fromEntries(activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(f => [f.technicalName, f.kind === 'money' && emptyCustomValue(values[f.technicalName]) ? null : values[f.technicalName] ?? null]));
    const classification = Object.fromEntries(Object.entries(choices).filter(([key]) => activeFields.some(field => field.technicalName === key)));
    const keyword = hasKeyword ? { keyword: String(values.keyword ?? '').trim() } : {};
    if (record && version) return api('update_record', { objectTypeId: definition.id, recordId: record.id, version, ...keyword, values: data, classification });
    return api('create_record', { objectTypeId: definition.id, ...keyword, values: data, classification });
  }, onMutate: () => { onBusyChange(true); setSaved(false); }, onSuccess: result => {
    setVersion(result.version); setBaseline({ ...values }); setChoiceBaseline(choices); onDirtyChange(false); setSaved(true);
    queryClient.setQueryData(['record', definition.id, result.id], result);
    void queryClient.invalidateQueries({ queryKey: ['records', definition.id] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-records'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['journal', definition.id, result.id] });
    onSaved(result);
  }, onSettled: () => onBusyChange(false) });
  function update(key: string, value: FieldValue) {
    const next = { ...values, [key]: value }; setValues(next); setSaved(false);
    onDirtyChange(choicesDirty || Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(baseline[k])));
  }
  useEffect(() => { document.querySelector<HTMLElement>('[data-record-page-title]')?.focus(); }, [recordId]);
  const title = record ? record.keyword || record.id : t('newRecord');
  const invalid = timestampInvalid || activeFields.some(field => isCustomFieldKind(field.kind) && field.required && emptyCustomValue(values[field.technicalName]))
    || (activeFields.some(field => field.kind === 'type') && definition.classification.type.required && !choices.type)
    || (activeFields.some(field => field.kind === 'status') && definition.classification.status.required && !choices.status)
    || (activeFields.some(field => field.kind === 'category') && definition.classification.category.required && !choices.category.length);
  function reset() { setValues({ ...baseline }); setChoices(choiceBaseline); setSaved(false); mutation.reset(); onDirtyChange(false); }
  return <form id="record-form" data-shortcut-submit className="flex min-w-0 flex-col gap-6 pb-6" onSubmit={event => { event.preventDefault(); if (tab === 'details' && !readOnly && !invalid && (!record || dirty) && !mutation.isPending) mutation.mutate(); }}>
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-2 md:flex-1"><Button type="button" variant="ghost" className="w-fit -ml-2" disabled={mutation.isPending} onClick={onClose}><ArrowLeftIcon data-icon="inline-start" />{t('backToOverview')}</Button><h1 data-record-page-title tabIndex={-1} className="wrap-anywhere text-2xl font-semibold outline-none">{title}</h1><p className="text-sm text-muted-foreground">{definition.label} · {t(record ? 'recordDetails' : 'newRecordDescription')}</p></div>
      {!readOnly && tab === 'details' ? <div className="flex flex-wrap items-center gap-2">{record ? <Button type="button" variant="outline" disabled={!dirty || mutation.isPending} onClick={reset}><RotateCcwIcon data-icon="inline-start" />{t('resetPreferences')}</Button> : null}<Button type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={mutation.isPending || invalid || Boolean(record && !dirty)}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{mutation.isPending ? t('saving') : t(record ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></div> : null}
    </div>
    <Tabs value={tab} onValueChange={setTab} className="gap-4"><TabsList variant="line" aria-label={t('recordSections')}><TabsTrigger value="details">{t('details')}</TabsTrigger><TabsTrigger value="journal" disabled={!record}>{t('journal')}</TabsTrigger></TabsList><Separator />
    <TabsContent value="details" keepMounted className="flex flex-col gap-6 data-[hidden]:hidden">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      {mutation.error instanceof ApiError && mutation.error.status === 409 ? <Button variant="outline" type="button" onClick={() => { window.location.reload(); }}>{t('reload')}</Button> : null}
      {saved ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
      {readOnly ? <FieldDescription>{t('inactiveObjectHelp')}</FieldDescription> : null}
      <FieldSet><FieldLegend>{t('recordGeneral')}</FieldLegend><FieldGroup className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {hasKeyword ? <Field className="md:col-span-2 xl:col-span-3" data-disabled={(mutation.isPending || readOnly) || undefined}><FieldLabel htmlFor="record-keyword">{t('keyword')}{activeFields.find(field => field.technicalName === 'keyword')?.required ? ' *' : ''}</FieldLabel><Input id="record-keyword" value={String(values.keyword ?? '')} maxLength={200} required={definition.fields.find(field => field.technicalName === 'keyword')?.required} disabled={mutation.isPending || readOnly} onChange={event => update('keyword', event.target.value)} /></Field> : null}
        <ClassificationFields fields={activeFields} config={definition.classification} value={choices} disabled={mutation.isPending || readOnly} onChange={next => { setChoices(next); setSaved(false); onDirtyChange(JSON.stringify(next) !== JSON.stringify(choiceBaseline) || Object.keys(values).some(key => JSON.stringify(values[key]) !== JSON.stringify(baseline[key]))); }} />
      </FieldGroup></FieldSet>
      {activeFields.some(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword') ? <><Separator /><FieldSet><FieldLegend>{t('recordBusinessFields')}</FieldLegend><FieldGroup className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(field => <div key={field.id} className={field.kind === 'multiline' || field.kind === 'multiple_choice' ? 'min-w-0 md:col-span-2 xl:col-span-3' : 'min-w-0'}><CustomFieldControl field={field} value={values[field.technicalName] ?? null} workspaceId={definition.workspaceId} disabled={mutation.isPending || readOnly} onChange={value => update(field.technicalName, value)} /></div>)}
      </FieldGroup></FieldSet></> : null}
      {record && inactiveFields.length ? <FieldSet><FieldLegend>{t('inactiveFields')}</FieldLegend><FieldGroup>
        {inactiveFields.filter(field => isCustomFieldKind(field.kind)).map(field => <CustomFieldControl key={field.id} field={field} value={record[field.technicalName] as FieldValue ?? null} workspaceId={definition.workspaceId} disabled onChange={() => {}} />)}
        <ClassificationFields fields={inactiveFields} config={definition.classification} value={{ type: record.type, status: record.status, category: record.category }} disabled onChange={() => {}} />
      </FieldGroup></FieldSet> : null}
      {record ? <><Separator /><Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/record-tech" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-4 py-3" />}>{t('journalTechnicalDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/record-tech:rotate-180" /></CollapsibleTrigger><CollapsibleContent><div className="border-t p-4"><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[[t('entityId'), record.id], [t('technicalName'), definition.technicalName], [t('recordVersion'), String(record.version)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="wrap-anywhere">{value}</dd></div>)}</dl></div></CollapsibleContent></Collapsible></> : null}
    </TabsContent><TabsContent value="journal" className="flex flex-col gap-6">{record ? <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('recordHistorySummary')}>{[[t('createdAt'), formatRegionalDate(record.created_at, regional, timeZone, true)], [t('createdBy'), userName(record.created_by)], [t('updated'), formatRegionalDate(record.updated_at, regional, timeZone, true)], [t('changedBy'), userName(record.updated_by)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="wrap-anywhere">{value}</dd></div>)}</dl>
      <Separator />
      <Journal definition={definition} recordId={record.id} user={user} record={record} workspaceName={workspaceName} />
    </> : null}</TabsContent></Tabs>
  </form>;

}

function Journal({ definition, recordId, user, record, workspaceName }: { definition: ObjectDefinition; recordId: string; user: AuthUser; workspaceName: string; record: DataRecord }) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const result = useQuery({ queryKey: ['journal', definition.id, recordId], queryFn: () => api('get_journal', { objectTypeId: definition.id, recordId }) });
  if (result.isPending) return <Loading />;
  if (result.isError) return <ErrorNotice error={result.error} retry={() => { void result.refetch(); }} />;
  if (!result.data.length) return <Empty><EmptyHeader><EmptyTitle>{t('noJournal')}</EmptyTitle></EmptyHeader></Empty>;
  return <ol className="flex min-w-0 flex-col gap-4" aria-label={t('journal')}>{[...result.data].reverse().map(entry => { const field = [...definition.fields, ...(definition.historicalFields ?? [])].find(field => field.id === entry.field_id); return <li key={entry.id}><JournalEntryCard renderValue={field ? value => ['type', 'status', 'category'].includes(field.kind) ? displayClassification(definition.classification, field.kind, value) : displayFieldValue(field, value, i18n.language, t, principals.data ?? [], timeZone, regional) : undefined} entry={{ ...entry, entity_kind: 'record', entity_id: recordId, workspace_id: definition.workspaceId, workspace_name: workspaceName, object_type_name: definition.label, actor_name: entry.actor_id === user.id ? user.name : entry.actor_id, entity_name: record.keyword || record.id, field_label: [...definition.fields, ...(definition.historicalFields ?? [])].find(field => field.id === entry.field_id)?.label ?? entry.field_key }} /></li>; })}</ol>;
}
