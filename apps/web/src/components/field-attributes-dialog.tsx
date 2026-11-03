import {FieldApplicabilitySettings} from './applicability-settings';
import { TechnicalNameField } from './technical-name-field';
import { Spinner } from '@/components/ui/spinner';
import { DialogActions } from './dialog-actions';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customFieldKinds, defaultFieldConfig, hasReservedStandardFieldLabel, isReservedStandardFieldName, type CustomFieldKind, type FieldConfig, type FieldDefinition, type ObjectDefinition, type Labels, type FieldApplicability } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend, FieldSeparator } from '@/components/ui/field';
import { TranslatedLabelInput, cleanLabels, hasLabel, sameLabels } from './translated-label-input';
import { FieldTypeSettings, fieldKindKey } from './field-type-settings';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { RequiredFieldSetting } from './required-field-setting';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Kbd } from '@/components/ui/kbd';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DefinitionLifecycle } from './definition-lifecycle';
import { ErrorNotice, Loading } from './feedback';
const ClassificationDialog = lazy(() => import('./classification-dialog').then(module => ({ default: module.ClassificationDialog })));

type Props = { standardKind?: 'keyword'; onDeleted?: () => void; readOnly?: boolean; field?: FieldDefinition; definition?: ObjectDefinition; objectTypeId?: string; onClose: () => void; onCreated?: (id: string) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; finalFocus?: () => HTMLElement | true };
export function FieldAttributesDialog(props: Props & { field: FieldDefinition; definition: ObjectDefinition }) { return props.field.state !== 'deleted' && ['type', 'status', 'category'].includes(props.field.technicalName) ? <Suspense fallback={<Loading />}><ClassificationDialog {...props} onCreated={() => props.onCreated?.(props.field.id)} /></Suspense> : <FieldEditorDialog {...props} />; }
// Standard fields use the same editors; creation stays staged until submit.
export function StandardFieldDialog({ standardKind, ...props }: Omit<Props, 'standardKind' | 'field' | 'objectTypeId'> & { standardKind: 'keyword' | 'type_status' | 'category'; definition: ObjectDefinition }) {
  const { t } = useTranslation();
  if (standardKind === 'keyword') return <FieldEditorDialog {...props} standardKind="keyword" />;
  const name = standardKind === 'type_status' ? 'type' : 'category';
  const field: FieldDefinition = { version: 1, id: `pending-${name}`,  technicalName: name, labels: {}, label: t(standardKind === 'type_status' ? 'typesAndStatuses' : 'classificationCategory'), kind: name, config: {}, required: false };
  return <Suspense fallback={<span role="status" className="sr-only">{t('loading')}</span>}><ClassificationDialog {...props} field={field} create={standardKind} onCreated={() => props.onCreated?.(standardKind)} /></Suspense>;
}
export function FieldEditorDialog({ standardKind, onDeleted, readOnly = false, field, definition, objectTypeId, onClose, onCreated, onDirtyChange, onBusyChange, finalFocus }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const owner = useQuery({ queryKey: ['field-editor-owner', objectTypeId], queryFn: () => api('get_object_type', { objectTypeId: objectTypeId! }), enabled: Boolean(objectTypeId && !definition) });
  const context = definition ?? owner.data;
  const protectedField = Boolean(field?.isProtected);
  const fixed = Boolean(standardKind || field && ['keyword', 'type', 'status', 'category'].includes(field.technicalName));
  const [baseline, setBaseline] = useState(() => ({ applicability: field?.applicability ?? null, version: field?.version ?? 1, labels: field?.labels ?? (standardKind ? { de: 'Stichwort', en: 'Keyword' } : {} as Labels), required: field?.required ?? false, kind: field?.kind ?? 'text', config: field?.config ?? {}, technicalName: field?.technicalName ?? (standardKind ? 'keyword' : '') }));
  const [applicability, setApplicability] = useState<FieldApplicability>(baseline.applicability);
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
  const dirty = JSON.stringify(applicability) !== JSON.stringify(baseline.applicability) || required !== baseline.required || kind !== baseline.kind || JSON.stringify(config) !== JSON.stringify(baseline.config) || technicalName !== baseline.technicalName || !sameLabels(labels, baseline.labels) || pendingChoice;
  const reservedName = !fixed && (hasReservedStandardFieldLabel(labels) || (!field && isReservedStandardFieldName(technicalName)));
  const valid = (!applicability || applicability.optionIds.length > 0) && !reservedName && (fixed || hasLabel(labels)) && Boolean(technicalName) && !pendingChoice && (config.options ?? []).every(option => hasLabel(option.labels));
  const mutation = useMutation({ mutationFn: async () => {
    const cleanedConfig = { ...config, ...(config.options ? { options: config.options.map(option => ({ ...option, labels: cleanLabels(option.labels) })) } : {}) };
    if (standardKind) return api('add_standard_field', { objectTypeId: context!.id, field: standardKind, required });
    if (!field) return api('create_field', { objectTypeId: context!.id, technicalName, labels: cleanLabels(labels), required, applicability, kind: kind as CustomFieldKind, config: cleanedConfig });
    return api('configure_field', { fieldId: field.id, version: baseline.version, required, ...(!fixed ? { labels: cleanLabels(labels), applicability, kind: kind as CustomFieldKind, config: cleanedConfig } : {}) });
  }, onError: async () => { await client.invalidateQueries({ queryKey: ['definition', context!.id] }); }, onSuccess: async result => {
    await client.invalidateQueries({ queryKey: ['definition', context!.id] });
    await client.invalidateQueries({ queryKey: ['records', context!.id] });
    await client.invalidateQueries({ queryKey: ['record', context!.id], refetchType: 'all' });
    if (!field) { onDirtyChange(false); onBusyChange(false); onCreated?.(standardKind ? (result as ObjectDefinition).fields.find(item => item.technicalName === standardKind)!.id : (result as { id: string }).id); return; }
    const updated = (result as ObjectDefinition).fields.find(item => item.id === field.id)!;
    const next = { applicability: updated.applicability ?? null, version: updated.version, labels: updated.labels, required: updated.required, kind: updated.kind, config: updated.config, technicalName: updated.technicalName };
    setBaseline(next); setApplicability(next.applicability); setLabels(next.labels); setRequired(next.required); setKind(next.kind); setConfig(next.config); setEditorRevision(value => value + 1); setSaved(true);
  } });
  const pending = mutation.isPending || lifeBusy;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(pending); }, [pending, onBusyChange]);
  function reset() { const current = context?.fields.find(item=>item.id===field?.id); const fresh=current ? {applicability:current.applicability ?? null,version:current.version,labels:current.labels,required:current.required,kind:current.kind,config:current.config,technicalName:current.technicalName} : baseline; setBaseline(fresh); setApplicability(fresh.applicability); setLabels(fresh.labels); setRequired(fresh.required); setKind(fresh.kind); setConfig(fresh.config); setTechnicalName(fresh.technicalName); setPendingChoice(false); setEditorRevision(value => value + 1); setSaved(false); mutation.reset(); }
  const kinds = customFieldKinds.map(value => ({ value, label: t(fieldKindKey(value)) }));
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent closeButtonDisabled={pending} className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-lg" finalFocus={finalFocus ?? (() => field ? document.querySelector<HTMLElement>(`[data-field-editor="${field.id}"]`) ?? true : true)}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{standardKind ? t('createStandardField', { name: t('keyword') }) : t(field ? 'fieldAttributes' : 'newField')}</DialogTitle><DialogDescription>{context?.label}{field ? ` · ${field.label}` : ''}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="field-attributes-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (!readOnly && (dirty || standardKind) && valid && context && !pending) mutation.mutate(); }}><FieldGroup>
        {mutation.isError ? ['Existing records have empty required fields', 'Unsafe field conversion'].includes(mutation.error.message) ? <Alert variant="destructive"><AlertDescription>{t(mutation.error.message === 'Unsafe field conversion' ? 'unsafeFieldConversion' : 'requiredExisting')}</AlertDescription></Alert> : <ErrorNotice error={mutation.error} /> : null}
        {reservedName ? <Alert variant="destructive"><AlertDescription>{t('reservedStandardName')}</AlertDescription></Alert> : null}
        {owner.isError ? <ErrorNotice error={owner.error} /> : null}
        {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
        <FieldSet><FieldLegend>{t('fieldIdentity')}</FieldLegend><TranslatedLabelInput compactHelp id="field-label" autoFocus={!field} value={labels} readOnly={fixed || protectedField || readOnly} readOnlyHelp={!fixed ? t('readOnlyLabelHelp') : undefined} disabled={pending} onChange={next => {
          if (!field && !nameTouched) setTechnicalName((next.en ?? next.de ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, ''));
          setLabels(next); setSaved(false);
        }} />
        <TechnicalNameField id="field-technical-name" value={technicalName} readOnly={Boolean(field) || Boolean(standardKind)} standard={Boolean(standardKind)} disabled={pending} onChange={value => { setTechnicalName(value); setNameTouched(true); }} /></FieldSet><FieldSeparator /><FieldSet><FieldLegend>{t('fieldTypeAndInput')}</FieldLegend>
        <Field><FieldLabel htmlFor="field-kind">{t('fieldType')}</FieldLabel>{fixed ? <Input id="field-kind" value={t(fieldKindKey(kind))} readOnly /> : <Select items={kinds} value={kind} disabled={pending || readOnly || protectedField} onValueChange={value => {
          if (!value) return;
          const next = value as CustomFieldKind;
          setConfig(['single_choice', 'multiple_choice'].includes(next) && ['single_choice', 'multiple_choice'].includes(kind) ? config : defaultFieldConfig(next)); setKind(next); setPendingChoice(false); setSaved(false);
        }}><SelectTrigger id="field-kind" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{kinds.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>}</Field>
        {!fixed ? <FieldTypeSettings readOnly={readOnly || (protectedField && !['single_choice','multiple_choice'].includes(kind))} key={`${kind}:${editorRevision}`} kind={kind as CustomFieldKind} config={config} onChange={next => { setConfig(next); setSaved(false); }} disabled={pending || readOnly || (protectedField && !['single_choice','multiple_choice'].includes(kind))} onPendingChange={setPendingChoice} /> : null}
        </FieldSet><FieldSeparator /><FieldSet><FieldLegend>{t('fieldValidation')}</FieldLegend><RequiredFieldSetting id="field-required" value={required} disabled={pending || readOnly} onChange={value => { setRequired(value); setSaved(false); }} />
        {!fixed && context ? <FieldApplicabilitySettings fields={context.fields} fieldId={field?.id} value={applicability} disabled={pending || readOnly || protectedField} onChange={setApplicability} /> : null}
        {field && !fixed && !readOnly ? <FieldDescription>{t('conversionHelp')}</FieldDescription> : null}</FieldSet>
      </FieldGroup></form>
      {field && context ? <FieldGroup className="pt-6"><FieldSeparator /><FieldSet><FieldLegend>{t('definitionState')}</FieldLegend>{readOnly ? <Badge variant="outline">{t(`definition_${field.state ?? 'active'}`)}</Badge> : <DefinitionLifecycle label={field.label} kind="field" id={field.id} objectTypeId={context.id} state={field.state} isProtected={field.isProtected} canDelete={field.canDelete} disabled={dirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} onDeleted={onDeleted} />}</FieldSet></FieldGroup> : null}
      </div><DialogActions onClose={onClose} closeLabel={t(field ? 'close' : 'cancel')} disabled={pending}>{!readOnly ? <>{field ? <Button type="button" variant="outline" disabled={!dirty || pending} onClick={reset}>{t('resetPreferences')}</Button> : null}<Button type="submit" form="field-attributes-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={(!dirty && !standardKind) || !valid || !context || pending}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{mutation.isPending ? t('saving') : t(field ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
    </DialogContent>
  </Dialog>;
}
