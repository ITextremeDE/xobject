import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { XIcon, ArrowRightIcon } from 'lucide-react';
import type { AuthUser, DataRecord, ObjectDefinition } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
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
  const title = props.recordId === 'new' ? t('newRecord') : record.data?.keyword || t('details');
  return <Sheet open modal={props.mobile} onOpenChange={open => { if (!open) props.onClose(); }}>
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[26rem]" showCloseButton={false}
      onInteractOutside={event => { if (!props.mobile) event.preventDefault(); }}>
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
  const initial = () => ({ keyword: record?.keyword ?? '', ...Object.fromEntries(definition.fields.filter(f => f.technicalName !== 'keyword').map(f => [f.technicalName, String(record?.[f.technicalName] ?? '')])) });
  const [baseline, setBaseline] = useState<Record<string, string>>(initial);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [version, setVersion] = useState(record?.version);
  const [saved, setSaved] = useState(false);
  const dirty = Object.keys(values).some(key => values[key] !== (baseline[key] ?? ''));
  const mutation = useMutation({ mutationFn: async () => {
    const data = Object.fromEntries(definition.fields.filter(f => f.technicalName !== 'keyword').map(f => [f.technicalName, values[f.technicalName] || null]));
    if (record && version) return api('update_record', { objectTypeId: definition.id, recordId: record.id, version, keyword: values.keyword.trim(), values: data });
    return api('create_record', { objectTypeId: definition.id, keyword: values.keyword.trim(), values: data });
  }, onMutate: () => { onBusyChange(true); setSaved(false); }, onSuccess: result => {
    setVersion(result.version); setBaseline({ ...values }); onDirtyChange(false); setSaved(true);
    queryClient.setQueryData(['record', definition.id, result.id], result);
    void queryClient.invalidateQueries({ queryKey: ['records', definition.id] });
    void queryClient.invalidateQueries({ queryKey: ['journal', definition.id, result.id] });
    onSaved(result);
  }, onSettled: () => onBusyChange(false) });
  function update(key: string, value: string) {
    const next = { ...values, [key]: value }; setValues(next); setSaved(false);
    onDirtyChange(Object.keys(next).some(k => next[k] !== (baseline[k] ?? '')));
  }
  return <form className="flex min-h-full flex-col" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
    <div className="flex flex-1 flex-col gap-6 p-6">
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      {mutation.error instanceof ApiError && mutation.error.status === 409 ? <Button variant="outline" type="button" onClick={() => { window.location.reload(); }}>{t('reload')}</Button> : null}
      {saved ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
      <FieldGroup>
        <Field><FieldLabel htmlFor="record-keyword">{t('keyword')}</FieldLabel><Input id="record-keyword" value={values.keyword} maxLength={200} required disabled={mutation.isPending} onChange={event => update('keyword', event.target.value)} /></Field>
        {definition.fields.filter(f => f.technicalName !== 'keyword').map(field => <Field key={field.id}><FieldLabel htmlFor={`field-${field.id}`}>{field.label}</FieldLabel><Input id={`field-${field.id}`} value={values[field.technicalName] ?? ''} maxLength={10000} disabled={mutation.isPending} onChange={event => update(field.technicalName, event.target.value)} /></Field>)}
      </FieldGroup>
    </div>
    <div className="sticky bottom-0 border-t bg-background p-6"><Button type="submit" className="w-full" disabled={mutation.isPending || !values.keyword.trim() || Boolean(record && !dirty)}>{mutation.isPending ? t('saving') : t('save')}</Button></div>
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
      <div className="text-sm font-medium">{definition.fields.find(f => f.id === entry.field_id)?.label ?? entry.field_key}</div>
      <div className="flex min-w-0 items-start gap-3 text-sm"><span className="min-w-0 flex-1 break-words" aria-label={t('before')}>{format(entry.old_value)}</span><ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 break-words" aria-label={t('after')}>{format(entry.new_value)}</span></div>
      <div className="text-xs text-muted-foreground"><time dateTime={entry.created_at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}</time>{' · '}{entry.actor_id === user.id ? user.name : entry.actor_id}</div>
    </li>)}
  </ol>;
}
