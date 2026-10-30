import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { XIcon, ArrowRightIcon } from 'lucide-react';
import { isCustomFieldKind, type FieldValue, type AuthUser, type DataRecord, type ObjectDefinition } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ClassificationFields, initialChoices, displayClassification, type ClassificationValues } from './classification-values';
import { CustomFieldControl, emptyCustomValue } from './custom-field-control';
import { ErrorNotice, Loading } from './feedback';

type Props = {
  definition: ObjectDefinition; recordId: string; user: AuthUser; mobile: boolean;
  onClose: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
  onSaved: (record: DataRecord) => void;
};
export function RecordPanel(props: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('details');
  const record = useQuery({ queryKey: ['record', props.definition.id, props.recordId],
    queryFn: () => api('get_record', { objectTypeId: props.definition.id, recordId: props.recordId }), enabled: props.recordId !== 'new' });
  const title = props.recordId === 'new' ? t('newRecord') : (props.definition.fields.some(field => field.technicalName === 'keyword' && (!field.state || field.state === 'active')) ? record.data?.keyword : '') || record.data?.id || t('details');
  return <Sheet open modal={props.mobile} disablePointerDismissal={!props.mobile} onOpenChange={open => { if (!open) props.onClose(); }}>
    <SheetContent data-nonmodal-panel={!props.mobile} showOverlay={props.mobile} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[26rem]" showCloseButton={false}>
      <SheetHeader className="gap-2 p-6 pr-12"><SheetTitle>{title}</SheetTitle><SheetDescription>{t(props.recordId === 'new' ? 'newRecordDescription' : 'recordDetails')}</SheetDescription></SheetHeader>
      <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" onClick={props.onClose} aria-label={t('close')}><XIcon /></Button>
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="px-6"><TabsList variant="line"><TabsTrigger value="details">{t('details')}</TabsTrigger><TabsTrigger value="journal" disabled={props.recordId === 'new'}>{t('journal')}</TabsTrigger></TabsList></div>
        <Separator />
        <TabsContent value="details" className="min-h-0 overflow-y-auto">
          {props.recordId !== 'new' && record.isPending ? <Loading /> : record.isError ? <div className="p-6"><ErrorNotice error={record.error} retry={() => { void record.refetch(); }} /></div> : <RecordForm key={props.recordId} {...props} record={record.data} />}
        </TabsContent>
        <TabsContent value="journal" className="min-h-0 overflow-y-auto"><Journal definition={props.definition} recordId={props.recordId} user={props.user} /></TabsContent>
      </Tabs>
    </SheetContent>
  </Sheet>;
}

function RecordForm({ definition, record, onDirtyChange, onBusyChange, onSaved }: Props & { record?: DataRecord }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const readOnly = Boolean(definition.state && definition.state !== 'active');
  const activeFields = definition.fields.filter(field => !field.state || field.state === 'active');
  const inactiveFields = definition.fields.filter(field => field.state === 'inactive');
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');
  const initial = () => ({ ...(hasKeyword ? { keyword: record?.keyword ?? '' } : {}), ...Object.fromEntries(activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(f => [f.technicalName, (record?.[f.technicalName] as FieldValue) ?? null])) });
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(initial);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [choices, setChoices] = useState<ClassificationValues>(() => record ? { type: record.type, status: record.status, category: record.category } : initialChoices(definition.classification));
  const [choiceBaseline, setChoiceBaseline] = useState(choices);
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
    void queryClient.invalidateQueries({ queryKey: ['journal', definition.id, result.id] });
    onSaved(result);
  }, onSettled: () => onBusyChange(false) });
  function update(key: string, value: FieldValue) {
    const next = { ...values, [key]: value }; setValues(next); setSaved(false);
    onDirtyChange(choicesDirty || Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(baseline[k])));
  }
  return <form data-shortcut-submit className="flex min-h-full flex-col" onSubmit={event => { event.preventDefault(); if (!readOnly && !mutation.isPending) mutation.mutate(); }}>
    <div className="flex flex-1 flex-col gap-6 p-6">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      {mutation.error instanceof ApiError && mutation.error.status === 409 ? <Button variant="outline" type="button" onClick={() => { window.location.reload(); }}>{t('reload')}</Button> : null}
      {saved ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
      {readOnly ? <FieldDescription>{t('inactiveObjectHelp')}</FieldDescription> : null}
      <FieldGroup>
        {hasKeyword ? <Field><FieldLabel htmlFor="record-keyword">{t('keyword')}</FieldLabel><Input id="record-keyword" value={String(values.keyword ?? '')} maxLength={200} required={definition.fields.find(field => field.technicalName === 'keyword')?.required} disabled={mutation.isPending || readOnly} onChange={event => update('keyword', event.target.value)} /></Field> : null}
        <ClassificationFields fields={activeFields} config={definition.classification} value={choices} disabled={mutation.isPending || readOnly} onChange={next => { setChoices(next); setSaved(false); onDirtyChange(JSON.stringify(next) !== JSON.stringify(choiceBaseline) || Object.keys(values).some(key => JSON.stringify(values[key]) !== JSON.stringify(baseline[key]))); }} />
        {activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(field => <CustomFieldControl key={field.id} field={field} value={values[field.technicalName] ?? null} workspaceId={definition.workspaceId} disabled={mutation.isPending || readOnly} onChange={value => update(field.technicalName, value)} />)}
      </FieldGroup>
      {record && inactiveFields.length ? <FieldSet><FieldLegend>{t('inactiveFields')}</FieldLegend><FieldGroup>
        {inactiveFields.filter(field => isCustomFieldKind(field.kind)).map(field => <CustomFieldControl key={field.id} field={field} value={record[field.technicalName] as FieldValue ?? null} workspaceId={definition.workspaceId} disabled onChange={() => {}} />)}
        <ClassificationFields fields={inactiveFields} config={definition.classification} value={{ type: record.type, status: record.status, category: record.category }} disabled onChange={() => {}} />
      </FieldGroup></FieldSet> : null}
    </div>
    {!readOnly ? <div className="sticky bottom-0 border-t bg-background p-6"><Button type="submit" aria-keyshortcuts={keyboardCommands.save.aria} className="w-full" disabled={mutation.isPending || activeFields.some(field => isCustomFieldKind(field.kind) && field.required && emptyCustomValue(values[field.technicalName])) || Boolean(record && !dirty) || (activeFields.some(field => field.kind === 'type') && definition.classification.type.required && !choices.type) || (activeFields.some(field => field.kind === 'status') && definition.classification.status.required && !choices.status) || (activeFields.some(field => field.kind === 'category') && definition.classification.category.required && !choices.category.length)}>{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></div> : null}
  </form>;
}

function Journal({ definition, recordId, user }: { definition: ObjectDefinition; recordId: string; user: AuthUser }) {
  const { t, i18n } = useTranslation();
  const result = useQuery({ queryKey: ['journal', definition.id, recordId], queryFn: () => api('get_journal', { objectTypeId: definition.id, recordId }) });
  if (result.isPending) return <Loading />;
  if (result.isError) return <div className="p-6"><ErrorNotice error={result.error} retry={() => { void result.refetch(); }} /></div>;
  if (!result.data.length) return <Empty><EmptyHeader><EmptyTitle>{t('noJournal')}</EmptyTitle></EmptyHeader></Empty>;
  const format = (value: unknown) => value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return <ol className="flex flex-col gap-0 px-6" aria-label={t('journal')}>
    {[...result.data].reverse().map(entry => <li key={entry.id} className="flex flex-col gap-2 border-b py-5">
      <div className="text-sm font-medium">{[...definition.fields, ...(definition.historicalFields ?? [])].find(f => f.id === entry.field_id)?.label ?? entry.field_key}</div>
      <div className="flex min-w-0 items-start gap-3 text-sm"><span className="min-w-0 flex-1 break-words" aria-label={t('before')}>{(['type', 'status', 'category'].includes(entry.field_key) ? displayClassification(definition.classification, entry.field_key, entry.old_value) : format(entry.old_value))}</span><ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 break-words" aria-label={t('after')}>{(['type', 'status', 'category'].includes(entry.field_key) ? displayClassification(definition.classification, entry.field_key, entry.new_value) : format(entry.new_value))}</span></div>
      <div className="text-xs text-muted-foreground"><time dateTime={entry.created_at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}</time>{' · '}{entry.actor_id === user.id ? user.name : entry.actor_id}</div>
    </li>)}
  </ol>;
}
