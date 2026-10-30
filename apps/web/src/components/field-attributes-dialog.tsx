import { DialogActions } from './dialog-actions';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customFieldKinds, defaultFieldConfig, hasReservedStandardFieldLabel, isReservedStandardFieldName, type CustomFieldKind, type FieldConfig, type FieldDefinition, type ObjectDefinition, type Labels } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { TranslatedLabelInput, cleanLabels, hasLabel, sameLabels } from './translated-label-input';
import { FieldTypeSettings, fieldKindKey } from './field-type-settings';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DefinitionLifecycle } from './definition-lifecycle';
import { ErrorNotice, Loading } from './feedback';
const ClassificationDialog = lazy(() => import('./classification-dialog').then(module => ({ default: module.ClassificationDialog })));

type Props = { onDeleted?: () => void; readOnly?: boolean; field?: FieldDefinition; definition?: ObjectDefinition; objectTypeId?: string; onClose: () => void; onCreated?: (id: string) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; finalFocus?: () => HTMLElement | true };
export function FieldAttributesDialog(props: Props & { field: FieldDefinition; definition: ObjectDefinition }) { return props.field.state !== 'deleted' && ['type', 'status', 'category'].includes(props.field.technicalName) ? <Suspense fallback={<Loading />}><ClassificationDialog {...props} /></Suspense> : <FieldEditorDialog {...props} />; }
export function FieldEditorDialog({ onDeleted, readOnly = false, field, definition, objectTypeId, onClose, onCreated, onDirtyChange, onBusyChange, finalFocus }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const owner = useQuery({ queryKey: ['field-editor-owner', objectTypeId], queryFn: () => api('get_object_type', { objectTypeId: objectTypeId! }), enabled: Boolean(objectTypeId && !definition) });
  const context = definition ?? owner.data;
  const fixed = Boolean(field && ['keyword', 'type', 'status', 'category'].includes(field.technicalName));
  const [baseline, setBaseline] = useState(() => ({ labels: field?.labels ?? {} as Labels, required: field?.required ?? false, kind: field?.kind ?? 'text', config: field?.config ?? {}, technicalName: field?.technicalName ?? '' }));
  const [labels, setLabels] = useState(baseline.labels);
  const [required, setRequired] = useState(baseline.required);
  const [kind, setKind] = useState(baseline.kind);
  const [config, setConfig] = useState<FieldConfig>(baseline.config);
  const [technicalName, setTechnicalName] = useState(baseline.technicalName);
  const [nameTouched, setNameTouched] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [pendingChoice, setPendingChoice] = useState(false);
  const [lifeBusy, setLifeBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = required !== baseline.required || kind !== baseline.kind || JSON.stringify(config) !== JSON.stringify(baseline.config) || technicalName !== baseline.technicalName || !sameLabels(labels, baseline.labels) || pendingChoice;
  const reservedName = !fixed && (hasReservedStandardFieldLabel(labels) || (!field && isReservedStandardFieldName(technicalName)));
  const valid = !reservedName && (fixed || hasLabel(labels)) && Boolean(technicalName) && !pendingChoice && (config.options ?? []).every(option => hasLabel(option.labels));
  const mutation = useMutation({ mutationFn: async () => {
    const cleanedConfig = { ...config, ...(config.options ? { options: config.options.map(option => ({ ...option, labels: cleanLabels(option.labels) })) } : {}) };
    if (!field) return api('create_field', { objectTypeId: context!.id, technicalName, labels: cleanLabels(labels), required, kind: kind as CustomFieldKind, config: cleanedConfig });
    return api('configure_field', { fieldId: field.id, required, ...(!fixed ? { labels: cleanLabels(labels), kind: kind as CustomFieldKind, config: cleanedConfig } : {}) });
  }, onSuccess: async result => {
    await client.invalidateQueries({ queryKey: ['definition', context!.id] });
    await client.invalidateQueries({ queryKey: ['records', context!.id] });
    await client.invalidateQueries({ queryKey: ['record', context!.id], refetchType: 'all' });
    if (!field) { onDirtyChange(false); onBusyChange(false); onCreated?.((result as { id: string }).id); return; }
    const updated = (result as ObjectDefinition).fields.find(item => item.id === field.id)!;
    const next = { labels: updated.labels, required: updated.required, kind: updated.kind, config: updated.config, technicalName: updated.technicalName };
    setBaseline(next); setLabels(next.labels); setRequired(next.required); setKind(next.kind); setConfig(next.config); setEditorRevision(value => value + 1); setSaved(true);
  } });
  const pending = mutation.isPending || lifeBusy;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(pending); }, [pending, onBusyChange]);
  function reset() { setLabels(baseline.labels); setRequired(baseline.required); setKind(baseline.kind); setConfig(baseline.config); setTechnicalName(baseline.technicalName); setPendingChoice(false); setEditorRevision(value => value + 1); setSaved(false); mutation.reset(); }
  const kinds = customFieldKinds.map(value => ({ value, label: t(fieldKindKey(value)) }));
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent closeButtonDisabled={pending} className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-lg" finalFocus={finalFocus ?? (() => field ? document.querySelector<HTMLElement>(`[data-field-editor="${field.id}"]`) ?? true : true)}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t(field ? 'fieldAttributes' : 'newField')}</DialogTitle><DialogDescription>{context?.label}{field ? ` · ${field.label}` : ''}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="field-attributes-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (!readOnly && dirty && valid && context && !pending) mutation.mutate(); }}><FieldGroup>
        {mutation.isError ? ['Existing records have empty required fields', 'Unsafe field conversion'].includes(mutation.error.message) ? <Alert variant="destructive"><AlertDescription>{t(mutation.error.message === 'Unsafe field conversion' ? 'unsafeFieldConversion' : 'requiredExisting')}</AlertDescription></Alert> : <ErrorNotice error={mutation.error} /> : null}
        {reservedName ? <Alert variant="destructive"><AlertDescription>{t('reservedStandardName')}</AlertDescription></Alert> : null}
        {owner.isError ? <ErrorNotice error={owner.error} /> : null}
        {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
        <TranslatedLabelInput id="field-label" autoFocus={!field} value={labels} readOnly={fixed || readOnly} readOnlyHelp={!fixed ? t('readOnlyLabelHelp') : undefined} disabled={pending} onChange={next => {
          if (!field && !nameTouched && next.en !== labels.en) setTechnicalName((next.en ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, ''));
          setLabels(next); setSaved(false);
        }} />
        <Field><FieldLabel htmlFor="field-technical-name">{t('technicalName')}</FieldLabel><Input id="field-technical-name" value={technicalName} readOnly={Boolean(field)} required maxLength={63} pattern="[a-z][a-z0-9_]*" disabled={pending} onChange={event => { setTechnicalName(event.target.value); setNameTouched(true); }} /><FieldDescription>{t('technicalHelp')}</FieldDescription></Field>
        <Field><FieldLabel htmlFor="field-kind">{t('fieldType')}</FieldLabel>{fixed ? <Input id="field-kind" value={t(fieldKindKey(kind))} readOnly /> : <Select items={kinds} value={kind} disabled={pending || readOnly} onValueChange={value => {
          if (!value) return;
          const next = value as CustomFieldKind;
          setConfig(['single_choice', 'multiple_choice'].includes(next) && ['single_choice', 'multiple_choice'].includes(kind) ? config : defaultFieldConfig(next)); setKind(next); setPendingChoice(false); setSaved(false);
        }}><SelectTrigger id="field-kind" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{kinds.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>}</Field>
        {!fixed ? <FieldTypeSettings readOnly={readOnly} key={`${kind}:${editorRevision}`} kind={kind as CustomFieldKind} config={config} onChange={next => { setConfig(next); setSaved(false); }} disabled={pending || readOnly} onPendingChange={setPendingChoice} /> : null}
        <Field orientation="horizontal"><Checkbox id="field-required" checked={required} disabled={pending || readOnly} onCheckedChange={checked => { setRequired(checked === true); setSaved(false); }} /><FieldLabel htmlFor="field-required">{t('requiredField')}</FieldLabel></Field>
        {field && !fixed && !readOnly ? <FieldDescription>{t('conversionHelp')}</FieldDescription> : null}
      </FieldGroup></form>
      {field && context && !readOnly ? <div className="pt-6"><DefinitionLifecycle label={field.label} kind="field" id={field.id} objectTypeId={context.id} state={field.state} isProtected={field.isProtected} canDelete={field.canDelete} disabled={dirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} onDeleted={onDeleted} /></div> : null}
      </div><DialogActions onClose={onClose} closeLabel={t(field ? 'close' : 'cancel')} disabled={pending}>{!readOnly ? <>{field ? <Button type="button" variant="outline" disabled={!dirty || pending} onClick={reset}>{t('resetPreferences')}</Button> : null}<Button type="submit" form="field-attributes-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !valid || !context || pending}>{mutation.isPending ? t('saving') : t(field ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
    </DialogContent>
  </Dialog>;
}
