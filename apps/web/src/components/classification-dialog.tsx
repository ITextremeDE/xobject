import { DialogActions } from './dialog-actions';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v7 } from 'uuid';
import { PlusIcon, GripVerticalIcon, ArrowUpIcon, ArrowDownIcon, Trash2Icon } from 'lucide-react';
import { moveClassificationOption } from '@xobject/contracts';
import type { ClassificationConfig, ClassificationRules, ObjectDefinition, FieldDefinition, Labels } from '@xobject/contracts';
import { DefinitionLifecycle } from './definition-lifecycle';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend, FieldTitle, FieldSeparator } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TranslatedLabelInput, cleanLabels, hasLabel } from './translated-label-input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Kbd } from '@/components/ui/kbd';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';

type Kind = 'type' | 'status' | 'category';
function clean(config: ClassificationConfig): ClassificationRules {
  const { version: _version, ...rules } = config;
  return { ...rules, options: rules.options.map(({ label: _label, canDelete: _canDelete, ...option }) => option) };
}
const errorKeys: Record<string, string> = {
  'Classification option is in use': 'choiceInUse',
  'Unknown Status Type': 'typeHasStatuses',
  'Required classification value missing': 'classificationExistingRequired',
  'Status does not belong to the selected Type': 'classificationStatusMismatch',
  'Invalid Category cardinality': 'classificationCategoryCardinality',
  'Options must be retained with their kind; deactivate instead of deleting': 'classificationRetainOptions',
  'Required Type needs active options': 'classificationOptionsRequired',
  'Required Category needs active options': 'classificationOptionsRequired',
  'Required Status needs options for each available Type, including no Type': 'classificationScopesRequired',
  'Invalid default Type': 'classificationDefaultsInvalid', 'Invalid default Category': 'classificationDefaultsInvalid',
  'Invalid initial Status': 'classificationDefaultsInvalid', 'Initial Status requires an active Type': 'classificationDefaultsInvalid',
};
export function ClassificationDialog({ onDeleted, readOnly = false, definition, field, onClose, onDirtyChange, onBusyChange, finalFocus }: { onDeleted?: () => void; readOnly?: boolean; definition: ObjectDefinition; field: FieldDefinition; onClose: () => void; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void; finalFocus?: () => HTMLElement | true }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const category = field.technicalName === 'category';
  const [version, setVersion] = useState(definition.classification.version);
  const [baseline, setBaseline] = useState(() => clean(definition.classification));
  const [draft, setDraft] = useState(baseline);
  const [additions, setAdditions] = useState<Record<string, Labels>>({});
  const [usedIds, setUsedIds] = useState(() => new Set(definition.classification.options.filter(option => option.canDelete === false).map(option => option.id)));
  const [lifeBusy, setLifeBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => { if (focusId) { const handle = document.querySelector<HTMLElement>(`[data-choice-handle="${focusId}"]`); const target = handle && !handle.matches(':disabled') ? handle : document.getElementById(`choice-label-${focusId}`) ?? document.getElementById(focusId); target?.focus(); setFocusId(null); } }, [draft, focusId]);
  const pendingNew = Object.values(additions).some(labels => Object.values(labels).some(Boolean));
  const validLabels = draft.options.every(option => hasLabel(option.labels));
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || pendingNew;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const mutation = useMutation({ mutationFn: () => api('configure_classification', { objectTypeId: definition.id, version, config: { ...draft, options: draft.options.map(option => ({ ...option, labels: cleanLabels(option.labels) })) } }),
    onSuccess: async result => {
      const next = clean(result.classification); setUsedIds(new Set(result.classification.options.filter(option => option.canDelete === false).map(option => option.id))); setDraft(next); setBaseline(next); setVersion(result.classification.version); setSaved(true); setAnnouncement(''); onDirtyChange(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['definition', definition.id] }),
        client.invalidateQueries({ queryKey: ['records', definition.id] }),
        client.invalidateQueries({ queryKey: ['record', definition.id], refetchType: 'all' }),
      ]);
    } });
  useEffect(() => { onBusyChange(mutation.isPending || lifeBusy); }, [mutation.isPending, lifeBusy, onBusyChange]);
  const name = (option: ClassificationRules['options'][number]) => option.labels[i18n.language as 'de' | 'en'] ?? option.labels.en ?? option.labels.de ?? t('unnamedOption');
  const active = (kind: Kind) => draft.options.filter(option => option.kind === kind && option.active);
  function patchOption(id: string, patch: Partial<ClassificationRules['options'][number]>) {
    setSaved(false);
    setDraft(old => {
      const options = old.options.map(option => option.id === id ? { ...option, ...patch } : option);
      const enabled = (id: string) => options.some(option => option.id === id && option.active);
      return { ...old, options, type: { ...old.type, defaultId: old.type.defaultId && enabled(old.type.defaultId) ? old.type.defaultId : null },
        category: { ...old.category, defaultIds: old.category.defaultIds.filter(enabled) },
        status: { ...old.status, defaults: old.status.defaults.filter(initial => enabled(initial.statusId) && (!initial.typeId || enabled(initial.typeId)) && options.find(option => option.id === initial.statusId)?.typeId === initial.typeId) } };
    });
  }
  const controlsDisabled = readOnly || mutation.isPending || lifeBusy;
  const statusDefault = (typeId: string | null) => draft.status.defaults.find(initial => initial.typeId === typeId)?.statusId ?? '';
  function required(kind: Kind) {
    return <Field orientation="horizontal"><Checkbox id={`required-${kind}`} checked={draft[kind].required} disabled={controlsDisabled} onCheckedChange={checked => setDraft(old => ({ ...old, [kind]: { ...old[kind], required: checked === true } }))} /><FieldLabel htmlFor={`required-${kind}`}>{t('requiredField')} · {t(`classification${kind[0].toUpperCase()}${kind.slice(1)}`)}</FieldLabel></Field>;
  }
  function move(id: string, targetId: string) {
    const next = moveClassificationOption(draft.options, id, targetId);
    if (next === draft.options) return;
    setDraft(old => ({ ...old, options: moveClassificationOption(old.options, id, targetId) }));
    setSaved(false); setFocusId(id);
    const option = next.find(option => option.id === id)!;
    const siblings = next.filter(item => item.kind === option.kind && item.typeId === option.typeId);
    setAnnouncement(t('choiceMoved', { name: name(option), position: siblings.findIndex(item => item.id === id) + 1, count: siblings.length }));
  }
  function removeOption(id: string) {
    const option = draft.options.find(option => option.id === id)!;
    const next = draft.options.find(item => item.id !== id && item.kind === option.kind && item.typeId === option.typeId);
    setFocusId(next?.id ?? `new-choice-${option.kind}-${option.typeId ?? 'none'}`);
    setDraft(old => ({ ...old, options: old.options.filter(option => option.id !== id), type: { ...old.type, defaultId: old.type.defaultId === id ? null : old.type.defaultId }, status: { ...old.status, defaults: old.status.defaults.filter(initial => initial.typeId !== id && initial.statusId !== id) } }));
    setAdditions(old => { const next = { ...old }; delete next[`status-${id}`]; return next; });
    setSaved(false); setAnnouncement('');
  }
  function optionEditor(option: ClassificationRules['options'][number]) {
    const siblings = draft.options.filter(item => item.kind === option.kind && item.typeId === option.typeId);
    const blocked = usedIds.has(option.id) || (option.kind === 'type' && draft.options.some(item => item.kind === 'status' && item.typeId === option.id));
    const index = siblings.findIndex(item => item.id === option.id);
    return <FieldSet key={option.id} className="min-w-0 gap-3" data-choice-drop={option.id}><FieldLegend variant="label" className="sr-only">{name(option)}</FieldLegend>
      <div className="flex items-center justify-between gap-2"><FieldTitle aria-hidden="true" className="min-w-0 flex-1 wrap-anywhere">{name(option)}</FieldTitle>{!readOnly ? <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon-sm" data-choice-handle={option.id} className="touch-none" disabled={controlsDisabled || siblings.length < 2} aria-label={t('dragChoice', { name: name(option) })} title={t('dragChoice', { name: name(option) })}
          onPointerDown={event => { if (event.button !== 0 || mutation.isPending) return; drag.current = { id: option.id, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={event => { if (event.key === 'Escape' && drag.current) { drag.current = null; event.preventDefault(); event.stopPropagation(); } }}
          onPointerUp={event => { const source = drag.current; drag.current = null; if (!source || mutation.isPending || Math.hypot(event.clientX - source.x, event.clientY - source.y) < 6) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-choice-drop]')?.getAttribute('data-choice-drop'); if (target) move(source.id, target); }}><GripVerticalIcon /></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={controlsDisabled || index === 0} aria-label={t('moveChoiceUp', { name: name(option) })} title={t('moveChoiceUp', { name: name(option) })} onClick={() => move(option.id, siblings[index - 1]!.id)}><ArrowUpIcon /></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={controlsDisabled || index === siblings.length - 1} aria-label={t('moveChoiceDown', { name: name(option) })} title={t('moveChoiceDown', { name: name(option) })} onClick={() => move(option.id, siblings[index + 1]!.id)}><ArrowDownIcon /></Button>{option.kind !== 'category' ? <Button type="button" variant="ghost" size="icon-sm" disabled={controlsDisabled || blocked} title={blocked ? t(usedIds.has(option.id) ? 'choiceInUse' : 'typeHasStatuses') : t('deleteChoice', { name: name(option) })} aria-label={t('deleteChoice', { name: name(option) })} onClick={() => removeOption(option.id)}><Trash2Icon /></Button> : null}</div> : null}</div><TranslatedLabelInput readOnly={readOnly} showHelp={false} id={`choice-label-${option.id}`} value={option.labels} disabled={mutation.isPending || lifeBusy} onChange={labels => patchOption(option.id, { labels })} />
      {option.kind === 'status' ? <Field><FieldLabel htmlFor={`choice-type-${option.id}`}>{t('statusScope')}</FieldLabel><NativeSelect id={`choice-type-${option.id}`} value={option.typeId ?? ''} disabled={controlsDisabled} onChange={event => patchOption(option.id, { typeId: event.target.value || null })}><NativeSelectOption value="">{t('withoutType')}</NativeSelectOption>{draft.options.filter(item => item.kind === 'type').map(item => <NativeSelectOption key={item.id} value={item.id}>{name(item)}</NativeSelectOption>)}</NativeSelect></Field> : null}
      <Field orientation="horizontal"><Checkbox id={`choice-active-${option.id}`} checked={option.active} disabled={controlsDisabled} onCheckedChange={checked => patchOption(option.id, { active: checked === true })} /><FieldLabel htmlFor={`choice-active-${option.id}`}>{t('activeChoice')}</FieldLabel></Field>
    </FieldSet>;
  }
  function addOption(kind: Kind, typeId: string | null = null) {
    if (readOnly) return null;
    const key = `${kind}-${typeId ?? 'none'}`;
    const labels = additions[key] ?? {};
    return <FieldSet className="gap-3"><FieldLegend variant="label">{t('newChoice')} · {t(`classification${kind[0].toUpperCase()}${kind.slice(1)}`)}</FieldLegend><TranslatedLabelInput readOnly={readOnly} showHelp={false} id={`new-choice-${key}`} value={labels} requireOne={false} disabled={controlsDisabled} onChange={labels => setAdditions(old => ({ ...old, [key]: labels }))} /><Button type="button" variant="outline" disabled={controlsDisabled || !hasLabel(labels) || draft.options.length >= 300} onClick={() => {
      setDraft(old => ({ ...old, options: [...old.options, { id: v7(), kind, labels: cleanLabels(labels), active: true, typeId }] })); setAdditions(old => ({ ...old, [key]: {} })); setSaved(false);
    }}><PlusIcon data-icon="inline-start" />{t('addChoice')}</Button></FieldSet>;
  }
  function defaultStatus(typeId: string | null) {
    const parentActive = typeId === null || draft.options.some(option => option.id === typeId && option.kind === 'type' && option.active);
    return <Field data-disabled={!parentActive}><FieldLabel htmlFor={`initial-status-${typeId ?? 'none'}`}>{t('initialStatus')}</FieldLabel><NativeSelect id={`initial-status-${typeId ?? 'none'}`} value={statusDefault(typeId)} disabled={controlsDisabled || !parentActive} onChange={event => { const statusId = event.target.value; setDraft(old => ({ ...old, status: { ...old.status, defaults: [...old.status.defaults.filter(initial => initial.typeId !== typeId), ...(statusId ? [{ typeId, statusId }] : [])] } })); }}><NativeSelectOption value="">{t('noDefault')}</NativeSelectOption>{active('status').filter(option => option.typeId === typeId).map(option => <NativeSelectOption key={option.id} value={option.id}>{name(option)}</NativeSelectOption>)}</NativeSelect>{!parentActive ? <FieldDescription>{t('inactiveTypeDefault')}</FieldDescription> : null}</Field>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending && !lifeBusy) onClose(); }}>
    <DialogContent className={cn("flex max-h-[85svh] flex-col overflow-hidden p-0", category ? "sm:max-w-lg" : "sm:max-w-4xl")} closeButtonDisabled={mutation.isPending || lifeBusy} finalFocus={finalFocus ?? (() => document.querySelector<HTMLElement>(`[data-field-editor="${field.id}"]`) ?? true)}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t(category ? 'classificationCategory' : 'typesAndStatuses')}</DialogTitle><DialogDescription>{definition.label} · {t('classificationDescription')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="classification-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (!readOnly && dirty && validLabels && !pendingNew && !mutation.isPending && !lifeBusy) mutation.mutate(); }}><FieldGroup>
        {mutation.isError ? <Alert variant="destructive"><AlertTitle>{t('errorTitle')}</AlertTitle><AlertDescription>{t(mutation.error instanceof ApiError && mutation.error.status === 409 ? 'classificationConflict' : errorKeys[mutation.error.message] ?? 'classificationInvalid')}</AlertDescription></Alert> : null}
        {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
        <FieldDescription>{readOnly ? t('classificationReadOnlyHelp') : t('classificationExistingHelp')} {t('translationHelp')}</FieldDescription>
        {category ? <>
          {required('category')}
          <Field><FieldLabel htmlFor="category-mode">{t('selectionMode')}</FieldLabel><NativeSelect id="category-mode" value={draft.category.multiple ? 'multiple' : 'single'} disabled={controlsDisabled} onChange={event => setDraft(old => ({ ...old, category: { ...old.category, multiple: event.target.value === 'multiple', defaultIds: event.target.value === 'single' && old.category.defaultIds.length > 1 ? [] : old.category.defaultIds } }))}><NativeSelectOption value="single">{t('singleChoice')}</NativeSelectOption><NativeSelectOption value="multiple">{t('multipleChoice')}</NativeSelectOption></NativeSelect></Field>
          <FieldSeparator /><FieldSet><FieldLegend>{t('choiceValues')}</FieldLegend><FieldGroup>{draft.options.filter(option => option.kind === 'category').map(optionEditor)}</FieldGroup></FieldSet>
          {addOption('category')}
          <FieldSet><FieldLegend variant="label">{t('defaultValue')}</FieldLegend>{draft.category.multiple ? active('category').map(option => <Field orientation="horizontal" key={option.id}><Checkbox id={`default-category-${option.id}`} checked={draft.category.defaultIds.includes(option.id)} disabled={controlsDisabled} onCheckedChange={checked => setDraft(old => ({ ...old, category: { ...old.category, defaultIds: (checked ? [...old.category.defaultIds, option.id] : old.category.defaultIds.filter(id => id !== option.id)).sort() } }))} /><FieldLabel htmlFor={`default-category-${option.id}`}>{name(option)}</FieldLabel></Field>) : <Field><FieldLabel htmlFor="default-category">{t('classificationCategory')}</FieldLabel><NativeSelect id="default-category" value={draft.category.defaultIds[0] ?? ''} disabled={controlsDisabled} onChange={event => setDraft(old => ({ ...old, category: { ...old.category, defaultIds: event.target.value ? [event.target.value] : [] } }))}><NativeSelectOption value="">{t('noDefault')}</NativeSelectOption>{active('category').map(option => <NativeSelectOption key={option.id} value={option.id}>{name(option)}</NativeSelectOption>)}</NativeSelect></Field>}</FieldSet>
        </> : <>
          <FieldGroup className="sm:grid sm:grid-cols-2">{required('type')}{required('status')}</FieldGroup>
          <Field><FieldLabel htmlFor="default-type">{t('defaultValue')} · {t('classificationType')}</FieldLabel><NativeSelect id="default-type" value={draft.type.defaultId ?? ''} disabled={controlsDisabled} onChange={event => setDraft(old => ({ ...old, type: { ...old.type, defaultId: event.target.value || null } }))}><NativeSelectOption value="">{t('noDefault')}</NativeSelectOption>{active('type').map(option => <NativeSelectOption key={option.id} value={option.id}>{name(option)}</NativeSelectOption>)}</NativeSelect></Field>
          <Table className="table-fixed" aria-label={t('typesAndStatuses')}><TableHeader className="hidden sm:table-header-group"><TableRow><TableHead>{t('classificationType')}</TableHead><TableHead>{t('associatedStatuses')}</TableHead></TableRow></TableHeader><TableBody>
            {[null, ...draft.options.filter(option => option.kind === 'type')].map(type => <TableRow key={type?.id ?? 'none'} className="block hover:bg-transparent sm:table-row"><TableCell className="block w-full min-w-0 align-top whitespace-normal sm:table-cell sm:w-1/2 sm:min-w-64"><FieldGroup className="py-4">{type ? optionEditor(type) : <FieldDescription>{t('withoutType')}</FieldDescription>}</FieldGroup></TableCell><TableCell className="block w-full min-w-0 align-top whitespace-normal sm:table-cell sm:w-1/2 sm:min-w-64"><FieldGroup className="py-4">{draft.options.filter(option => option.kind === 'status' && option.typeId === (type?.id ?? null)).map((option, index) => <div key={option.id}>{index > 0 ? <FieldSeparator className="mb-6" /> : null}{optionEditor(option)}</div>)}{addOption('status', type?.id ?? null)}<FieldSeparator />{defaultStatus(type?.id ?? null)}</FieldGroup></TableCell></TableRow>)}
          </TableBody></Table>
          <FieldSeparator />{addOption('type')}
        </>}
        {pendingNew ? <FieldDescription>{t('pendingChoiceHelp')}</FieldDescription> : null}
        {!readOnly ? <><FieldSeparator /><DefinitionLifecycle label={category ? field.label : t('typesAndStatuses')} kind="field" id={field.id} objectTypeId={definition.id} state={field.state} isProtected={field.isProtected} canDelete={field.canDelete} disabled={dirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} onDeleted={onDeleted} /></> : null}
      </FieldGroup></form></div>
      <DialogActions onClose={onClose} disabled={mutation.isPending || lifeBusy}>{!readOnly ? <><Button variant="outline" disabled={!dirty || mutation.isPending || lifeBusy} onClick={() => { setDraft(baseline); setAdditions({}); setSaved(false); setAnnouncement(''); mutation.reset(); }}>{t('resetPreferences')}</Button><Button type="submit" form="classification-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !validLabels || mutation.isPending || lifeBusy || pendingNew}>{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
    </DialogContent>
  </Dialog>;
}
