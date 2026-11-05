import {FieldInputRulesSettings} from './field-input-rules-settings';
import {emptyFieldInputRules,type FieldInputRules} from '@xobject/contracts';
import {SettingsSection} from './settings-section';
import { RequiredFieldSetting } from './required-field-setting';
import { SettingsHelp } from './settings-help';
import { Spinner } from '@/components/ui/spinner';
import { DialogActions } from './dialog-actions';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v7 } from 'uuid';
import {PlusIcon,ChevronDownIcon} from 'lucide-react';
import {ChoiceValueEditor} from './choice-value-editor';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import { moveClassificationOption } from '@xobject/contracts';
import type { ClassificationConfig, ClassificationRules, ObjectDefinition, FieldDefinition, Labels } from '@xobject/contracts';
import { DefinitionLifecycle } from './definition-lifecycle';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend, FieldSeparator } from '@/components/ui/field';
import { ClassificationSelect } from './classification-values';
import { TranslatedLabelInput, cleanLabels, hasLabel } from './translated-label-input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Kbd } from '@/components/ui/kbd';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';

type Kind = 'type' | 'status' | 'category';
function clean(config: ClassificationConfig): ClassificationRules {
  const { version: _version, ...rules } = config;
  return { ...rules, options: rules.options.map(({ label: _label, canDelete: _canDelete, ...option }) => option) };
}
const errorKeys: Record<string, string> = {
  'Invalid project or task values':'workRulesConflict',
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
export function ClassificationDialog({ onDeleted, readOnly = false, definition, field, onClose, onDirtyChange, onBusyChange, finalFocus, create, onCreated }: { create?: 'type_status' | 'category'; onCreated?: () => void; onDeleted?: () => void; readOnly?: boolean; definition: ObjectDefinition; field: FieldDefinition; onClose: () => void; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void; finalFocus?: () => HTMLElement | true }) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const category = field.technicalName === 'category';
  const [version, setVersion] = useState(definition.classification.version);
  const ruleFields=definition.fields.filter(f=>category?f.kind==='category':['type','status'].includes(f.kind));
  const initialRules=()=>Object.fromEntries(ruleFields.map(f=>[f.id,{version:f.version,inputRules:f.inputRules??emptyFieldInputRules()}]));
  const [ruleBaseline,setRuleBaseline]=useState(initialRules);
  const [fieldRules,setFieldRules]=useState<Record<string,{version:number;inputRules:FieldInputRules}>>(ruleBaseline);
  const [baseline, setBaseline] = useState(() => clean(definition.classification));
  const [draft, setDraft] = useState(baseline);
  const [additions, setAdditions] = useState<Record<string, Labels>>({});
  const [usedIds, setUsedIds] = useState(() => new Set(definition.classification.options.filter(option => option.canDelete === false).map(option => option.id)));
  const [lifeBusy, setLifeBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [typeScope,setTypeScope]=useState('');
  const selectedType=draft.options.find(option=>option.kind==='type'&&option.id===typeScope);
  const selectedTypeId=selectedType?.id??null;
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => { if (focusId) { const handle = document.querySelector<HTMLElement>(`[data-choice-handle="${focusId}"]`); const target = handle && !handle.matches(':disabled') ? handle : document.getElementById(`choice-toggle-${focusId}`) ?? document.getElementById(focusId); target?.focus(); setFocusId(null); } }, [draft, focusId]);
  const pendingNew = Object.values(additions).some(labels => Object.values(labels).some(Boolean));
  const validLabels = draft.options.every(option => hasLabel(option.labels));
  const dirty = JSON.stringify(fieldRules)!==JSON.stringify(ruleBaseline)||JSON.stringify(draft) !== JSON.stringify(baseline) || pendingNew;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const mutation = useMutation({ mutationFn: () => {
    const configuration = { version, config: { ...draft, options: draft.options.map(option => ({ ...option, labels: cleanLabels(option.labels) })) } };
    return create ? api('add_standard_field', { objectTypeId: definition.id, field: create, configuration }) : api('configure_classification', { objectTypeId: definition.id, ...configuration,fieldInputRules:Object.entries(fieldRules).map(([fieldId,value])=>({fieldId,...value,inputRules:{...value.inputRules,description:cleanLabels(value.inputRules.description),helpText:cleanLabels(value.inputRules.helpText)}})) });
  },
    onSuccess: async result => {
      const nextRules=Object.fromEntries(result.fields.filter(f=>category?f.kind==='category':['type','status'].includes(f.kind)).map(f=>[f.id,{version:f.version,inputRules:f.inputRules??emptyFieldInputRules()}]));setRuleBaseline(nextRules);setFieldRules(nextRules);
      const next = clean(result.classification); setUsedIds(new Set(result.classification.options.filter(option => option.canDelete === false).map(option => option.id))); setDraft(next); setBaseline(next); setVersion(result.classification.version); setSaved(true); setAnnouncement(''); onDirtyChange(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['definition', definition.id] }),
        client.invalidateQueries({ queryKey: ['records', definition.id] }),
        client.invalidateQueries({ queryKey: ['record', definition.id], refetchType: 'all' }),
      ]);
      if (create) onCreated?.();
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
    return <RequiredFieldSetting id={`required-${kind}`} value={draft[kind].required} disabled={controlsDisabled} label={category ? t('requiredField') : `${t('requiredField')} · ${t(`classification${kind[0].toUpperCase()}${kind.slice(1)}`)}`} onChange={required => setDraft(old => ({ ...old, [kind]: { ...old[kind], required } }))} />;
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
    return <ChoiceValueEditor key={option.id} id={option.id} labels={option.labels} active={option.active} readOnly={readOnly} disabled={mutation.isPending||lifeBusy} onLabels={labels=>patchOption(option.id,{labels})} onActive={active=>patchOption(option.id,{active})}
      onUp={index>0?()=>move(option.id,siblings[index-1].id):undefined} onDown={index<siblings.length-1?()=>move(option.id,siblings[index+1].id):undefined} onMoveTo={option.kind!=='type'?target=>move(option.id,target):undefined}
      onDelete={option.kind!=='category'?()=>removeOption(option.id):undefined} deleteBlocked={option.kind!=='category'&&blocked?t(usedIds.has(option.id)?'choiceInUse':'typeHasStatuses'):undefined}>
      {option.kind==='status'?<Field><FieldLabel htmlFor={`choice-type-${option.id}`}>{t('statusScope')}</FieldLabel><ClassificationSelect id={`choice-type-${option.id}`} value={option.typeId??''} disabled={controlsDisabled} options={[{value:'',label:t('withoutType')},...draft.options.filter(item=>item.kind==='type').map(item=>({value:item.id,label:name(item)}))]} onValueChange={value=>patchOption(option.id,{typeId:value||null})}/></Field>:null}
      {option.kind==='status'&&definition.workProfile?.kind==='task'?<Field><FieldLabel htmlFor={`status-meaning-${option.id}`}>{t('taskStatusMeaning')}</FieldLabel><ClassificationSelect id={`status-meaning-${option.id}`} value={option.meaning??''} disabled={controlsDisabled} options={['','open','in_progress','done','canceled'].map(value=>({value,label:t(value?'taskState_'+value:'noSelection')}))} onValueChange={value=>patchOption(option.id,{meaning:value?value as 'open'|'in_progress'|'done'|'canceled':undefined})}/><FieldDescription>{t('taskStatusMeaningHelp')}</FieldDescription></Field>:null}
    </ChoiceValueEditor>;
  }

  function addOption(kind: Kind, typeId: string | null = null) {
    if (readOnly) return null;
    const key = `${kind}-${typeId ?? 'none'}`;
    const labels = additions[key] ?? {};
    const title=t(kind==='type'?'newType':kind==='status'?'newStatus':'newCategory');
    return <Collapsible className="min-w-0"><CollapsibleTrigger render={<Button type="button" variant="outline" className="group/new-choice w-fit"/>}><PlusIcon data-icon="inline-start"/>{title}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/new-choice:rotate-180"/></CollapsibleTrigger><CollapsibleContent className="pt-3"><FieldSet className="gap-3"><FieldLegend variant="label" className="sr-only">{title}</FieldLegend><TranslatedLabelInput readOnly={readOnly} showHelp={false} id={`new-choice-${key}`} value={labels} requireOne={false} disabled={controlsDisabled} onChange={labels=>setAdditions(old=>({...old,[key]:labels}))}/><Button type="button" variant="outline" disabled={controlsDisabled||!hasLabel(labels)||draft.options.length>=300} onClick={()=>{
      const id=v7();setDraft(old=>({...old,options:[...old.options,{id,kind,labels:cleanLabels(labels),active:true,typeId}]}));if(kind==='type')setTypeScope(id);setAdditions(old=>({...old,[key]:{}}));setSaved(false);
    }}><PlusIcon data-icon="inline-start"/>{t(kind==='type'?'addType':kind==='status'?'addStatus':'addCategory')}</Button></FieldSet></CollapsibleContent></Collapsible>;
  }

  function defaultStatus(typeId: string | null) {
    const parentActive = typeId === null || draft.options.some(option => option.id === typeId && option.kind === 'type' && option.active);
    return <Field data-disabled={!parentActive}><FieldLabel htmlFor={`initial-status-${typeId ?? 'none'}`}>{t('defaultStatus')}</FieldLabel><ClassificationSelect id={`initial-status-${typeId ?? 'none'}`} value={statusDefault(typeId)} disabled={controlsDisabled || !parentActive} options={[{value:'',label:t('noDefault')},...active('status').filter(option=>option.typeId===typeId).map(option=>({value:option.id,label:name(option)}))]} onValueChange={statusId=>setDraft(old=>({...old,status:{...old.status,defaults:[...old.status.defaults.filter(initial=>initial.typeId!==typeId),...(statusId?[{typeId,statusId}]:[])]}}))}/>{!parentActive ? <FieldDescription>{t('inactiveTypeDefault')}</FieldDescription> : null}</Field>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending && !lifeBusy) onClose(); }}>
    <DialogContent className={cn("bg-background text-foreground flex max-h-[85svh] flex-col overflow-hidden p-0", category ? "sm:max-w-xl" : "sm:max-w-4xl")} closeButtonDisabled={mutation.isPending || lifeBusy} finalFocus={finalFocus ?? (() => document.querySelector<HTMLElement>(`[data-field-editor="${field.id}"]`) ?? true)}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{create ? t('createStandardField', { name: t(category ? 'classificationCategory' : 'typesAndStatuses') }) : t(category ? 'classificationCategory' : 'typesAndStatuses')}</DialogTitle><DialogDescription>{definition.label} · {t('classificationDescription')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="classification-form" data-shortcut-submit onSubmit={event => { event.preventDefault(); if (!readOnly && (dirty || create) && validLabels && !pendingNew && !mutation.isPending && !lifeBusy) mutation.mutate(); }}><FieldGroup>
        {mutation.isError ? <Alert variant="destructive"><AlertTitle>{t('errorTitle')}</AlertTitle><AlertDescription>{t(mutation.error instanceof ApiError && mutation.error.status === 409 ? 'classificationConflict' : errorKeys[mutation.error.message] ?? 'classificationInvalid')}</AlertDescription></Alert> : null}
        {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
        {readOnly ? <FieldDescription>{t('classificationReadOnlyHelp')}</FieldDescription> : null}<SettingsHelp title={t('configurationDetails')}>{!readOnly ? t('classificationExistingHelp') : null} {t('choiceEditorHelp')} {t('translationHelp')}</SettingsHelp>
        {category ? <>
          <SettingsSection>{required('category')}
          <Field data-disabled={controlsDisabled || undefined}><FieldLabel htmlFor="category-mode">{t('selectionMode')}</FieldLabel><ClassificationSelect id="category-mode" value={draft.category.multiple?'multiple':'single'} disabled={controlsDisabled} options={[{value:'single',label:t('singleChoice')},{value:'multiple',label:t('multipleChoice')}]} onValueChange={value=>setDraft(old=>({...old,category:{...old.category,multiple:value==='multiple',defaultIds:value==='single'&&old.category.defaultIds.length>1?[]:old.category.defaultIds}}))}/></Field>
          </SettingsSection><SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('choiceValues')}</FieldLegend><FieldGroup>{draft.options.filter(option => option.kind === 'category').map(optionEditor)}</FieldGroup></FieldSet>
          {addOption('category')}</SettingsSection>
          <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('defaultValue')}</FieldLegend>{draft.category.multiple ? active('category').map(option => <Field data-disabled={controlsDisabled || undefined} orientation="horizontal" key={option.id}><Checkbox id={`default-category-${option.id}`} checked={draft.category.defaultIds.includes(option.id)} disabled={controlsDisabled} onCheckedChange={checked => setDraft(old => ({ ...old, category: { ...old.category, defaultIds: (checked ? [...old.category.defaultIds, option.id] : old.category.defaultIds.filter(id => id !== option.id)).sort() } }))} /><FieldLabel htmlFor={`default-category-${option.id}`}>{name(option)}</FieldLabel></Field>) : <Field data-disabled={controlsDisabled || undefined}><FieldLabel htmlFor="default-category">{t('classificationCategory')}</FieldLabel><ClassificationSelect id="default-category" value={draft.category.defaultIds[0]??''} disabled={controlsDisabled} options={[{value:'',label:t('noDefault')},...active('category').map(option=>({value:option.id,label:name(option)}))]} onValueChange={value=>setDraft(old=>({...old,category:{...old.category,defaultIds:value?[value]:[]}}))}/></Field>}</FieldSet></SettingsSection>
        </> : <>
          <FieldGroup className="grid items-start gap-6 sm:grid-cols-2">
            <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('classificationType')}</FieldLegend>{required('type')}
              <Field><FieldLabel htmlFor="status-type-scope">{t('statusTypeSelection')}</FieldLabel><ClassificationSelect id="status-type-scope" disabled={mutation.isPending||lifeBusy||pendingNew} value={selectedTypeId??''} options={[{value:'',label:t('withoutType')},...draft.options.filter(option=>option.kind==='type').map(option=>({value:option.id,label:name(option)}))]} onValueChange={setTypeScope}/></Field>
              {selectedType?optionEditor(selectedType):<FieldDescription>{t('withoutTypeHelp')}</FieldDescription>}
              <FieldSeparator/>{addOption('type')}<FieldSeparator/><Field data-disabled={controlsDisabled || undefined}><FieldLabel htmlFor="default-type">{t('defaultType')}</FieldLabel><ClassificationSelect id="default-type" value={draft.type.defaultId??''} disabled={controlsDisabled} options={[{value:'',label:t('noDefault')},...active('type').map(option=>({value:option.id,label:name(option)}))]} onValueChange={value=>setDraft(old=>({...old,type:{...old.type,defaultId:value||null}}))}/></Field>
            </FieldSet></SettingsSection>
            <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('associatedStatuses')}</FieldLegend>{required('status')}<FieldDescription>{t('statusesForType',{name:selectedType?name(selectedType):t('withoutType')})}</FieldDescription>
              <FieldGroup className="gap-3">{draft.options.filter(option=>option.kind==='status'&&option.typeId===selectedTypeId).map((option,index)=><div key={option.id}>{index?<FieldSeparator className="mb-3"/>:null}{optionEditor(option)}</div>)}</FieldGroup>
              {!draft.options.some(option=>option.kind==='status'&&option.typeId===selectedTypeId)?<FieldDescription>{t('noStatusesInScope')}</FieldDescription>:null}
              {addOption('status',selectedTypeId)}<FieldSeparator/>{defaultStatus(selectedTypeId)}
            </FieldSet></SettingsSection>
          </FieldGroup>
        </>}
        {pendingNew ? <FieldDescription>{t('pendingChoiceHelp')}</FieldDescription> : null}
        {!readOnly && !create ? <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('definitionState')}</FieldLegend><DefinitionLifecycle label={category ? field.label : t('typesAndStatuses')} kind="field" id={field.id} objectTypeId={definition.id} state={field.state} isProtected={field.isProtected} canDelete={field.canDelete} disabled={dirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} onDeleted={onDeleted} /></FieldSet></SettingsSection> : null}
      </FieldGroup>{!create?<FieldGroup className="pt-6">{ruleFields.map(f=><FieldInputRulesSettings key={f.id} classification field={f} workspaceId={definition.workspaceId} readOnly={readOnly} disabled={mutation.isPending||lifeBusy} value={fieldRules[f.id]?.inputRules??emptyFieldInputRules()} onChange={inputRules=>{setFieldRules(old=>({...old,[f.id]:{...old[f.id],inputRules}}));setSaved(false);}}/>)}</FieldGroup>:null}</form></div>
      <DialogActions onClose={onClose} closeLabel={t(create ? 'cancel' : 'close')} disabled={mutation.isPending || lifeBusy}>{!readOnly ? <>{!create ? <Button variant="outline" disabled={!dirty || mutation.isPending || lifeBusy} onClick={() => { setFieldRules(ruleBaseline);setDraft(baseline); setAdditions({}); setSaved(false); setAnnouncement(''); mutation.reset(); }}>{t('resetPreferences')}</Button> : null}<Button type="submit" form="classification-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={(!dirty && !create) || !validLabels || mutation.isPending || lifeBusy || pendingNew}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{mutation.isPending ? t('saving') : t(create ? 'create' : 'save')}<Kbd>{saveShortcutLabel}</Kbd></Button></> : null}</DialogActions>
    </DialogContent>
  </Dialog>;
}
