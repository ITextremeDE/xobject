import {ChoiceTreeParent} from './choice-tree-parent';
import {setChoiceActive,choiceAncestors} from '@xobject/contracts';
import {structuredOptionGroups,type StructuredOptionGroup,structuredSchemaKeys,structuredSchemaLabels} from '@xobject/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v7 } from 'uuid';
import {PlusIcon,ChevronDownIcon} from 'lucide-react';
import {ChoiceValueEditor} from './choice-value-editor';
import {SettingsHelp} from './settings-help';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {Separator} from '@/components/ui/separator';
import type { CustomFieldKind, FieldConfig, Labels } from '@xobject/contracts';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TranslatedLabelInput, cleanLabels, hasLabel } from './translated-label-input';

export const fieldKindKey = (kind: string) => `fieldKind_${kind}`;
export function FieldTypeSettings({ readOnly = false, structureReadOnly=false, kind, config, onChange, disabled, onPendingChange }: {
  readOnly?: boolean; structureReadOnly?:boolean; kind: CustomFieldKind; config: FieldConfig; onChange: (config: FieldConfig) => void; disabled: boolean; onPendingChange: (value: boolean) => void;
}) {
  const { t,i18n } = useTranslation();
  const [newLabels, setNewLabels] = useState<Labels>({});
  useEffect(() => { onPendingChange(Object.values(newLabels).some(Boolean)); }, [newLabels, onPendingChange]);
  const options = config.options ?? [];
  const phone=kind==='structured'&&config.schema==='phone_entries';
  const optionGroups=kind==='structured'?structuredOptionGroups(config.schema):[];
  const [newGroup,setNewGroup]=useState<StructuredOptionGroup>('usage');
  const selectedGroup=optionGroups.includes(newGroup)?newGroup:'usage';
  const groupTitle=(group:StructuredOptionGroup)=>t(group==='usage'?'contactPhoneUsage':group==='phone_type'?'contactPhoneType':'contactMessengerType');
  function move(id:string,target:string){
    const from=options.findIndex(option=>option.id===id),to=options.findIndex(option=>option.id===target);
    if(kind==='tree_choice'&&(options[from]?.parentId??null)!==(options[to]?.parentId??null))return;
    if(from<0||to<0||from===to||optionGroups.length>0&&options[from].group!==options[to].group)return;
    const next=[...options];next.splice(to,0,next.splice(from,1)[0]);onChange({...config,options:next});
    requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-choice-handle="${id}"]`)?.focus());
  }
  const structureDisabled=disabled||readOnly||structureReadOnly;
  return <FieldGroup className={kind==='money'?'grid items-start gap-4 sm:grid-cols-2':undefined}>
    {kind==='structured'?<Field><FieldLabel htmlFor="structured-schema">{t('structuredSchema')}</FieldLabel><Select items={structuredSchemaKeys.map(value=>({value,label:structuredSchemaLabels[value][i18n.language==='de'?'de':'en']}))} value={config.schema??'name_components'} disabled={structureDisabled} onValueChange={schema=>{if(schema)onChange({...config,schema,options:[]});}}><SelectTrigger id="structured-schema" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{structuredSchemaKeys.map(key=><SelectItem key={key} value={key}>{structuredSchemaLabels[key][i18n.language==='de'?'de':'en']}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>:null}
    {kind === 'decimal' || kind === 'money' ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="field-scale">{t('decimalScale')}</FieldLabel><Input id="field-scale" type="number" min={0} max={12} value={config.scale ?? 2} disabled={structureDisabled} onChange={event => onChange({ ...config, scale: Number(event.target.value) })} /></Field> : null}
    {kind === 'money' ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="field-currency">{t('defaultCurrency')}</FieldLabel><Input id="field-currency" value={config.currency ?? 'EUR'} minLength={3} maxLength={3} pattern="[A-Z]{3}" required disabled={structureDisabled} onChange={event => onChange({ ...config, currency: event.target.value.toUpperCase() })} /><FieldDescription>{t('currencyHelp')}</FieldDescription></Field> : null}
    {kind === 'multiline' ? <Field data-disabled={disabled || undefined} orientation="horizontal"><Checkbox id="field-formatted" checked={config.formatted ?? false} disabled={structureDisabled} onCheckedChange={checked => onChange({ ...config, formatted: checked === true })} /><FieldLabel htmlFor="field-formatted">{t('markdownFormatting')}</FieldLabel></Field> : null}
    {kind === 'reference' ? <>
      <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="field-reference-target">{t('referenceTarget')}</FieldLabel><Select items={['user', 'group', 'both'].map(value => ({ value, label: t(`reference_${value}`) }))} value={config.referenceTarget ?? 'both'} disabled={structureDisabled} onValueChange={value => { if (value) onChange({ ...config, referenceTarget: value as FieldConfig['referenceTarget'] }); }}><SelectTrigger id="field-reference-target" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{['user', 'group', 'both'].map(value => <SelectItem key={value} value={value}>{t(`reference_${value}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field data-disabled={disabled || undefined} orientation="horizontal"><Checkbox id="field-reference-multiple" checked={config.multiple ?? false} disabled={structureDisabled} onCheckedChange={checked => onChange({ ...config, multiple: checked === true })} /><FieldLabel htmlFor="field-reference-multiple">{t('multipleChoice')}</FieldLabel></Field>
    </> : null}
    {config.fixedOptions?<FieldSet><FieldLegend>{t('choiceValues')}</FieldLegend><FieldGroup>{options.map(option=><TranslatedLabelInput key={option.id} id={`fixed-choice-${option.id}`} value={option.labels} onChange={labels=>onChange({...config,options:options.map(item=>item.id===option.id?{...item,labels}:item)})} disabled={disabled} readOnly={readOnly} showHelp={false}/>)}</FieldGroup></FieldSet>:null}
    {(!config.fixedOptions&&(kind === 'single_choice' || kind === 'multiple_choice' ||kind==='tree_choice'|| kind==='structured'&&config.schema?.endsWith('_entries'))) ? <FieldSet><FieldLegend>{t(kind==='structured'?'contactContexts':'choiceValues')}</FieldLegend><FieldGroup>
      {kind==='tree_choice'?<FieldDescription>{t('choiceHierarchyHelp')}</FieldDescription>:null}{kind==='structured'?<FieldDescription>{t(phone?'contactPhoneGroupsHelp':optionGroups.length?'contactMessengerGroupsHelp':'contactContextsHelp')}</FieldDescription>:null}<SettingsHelp title={t('configurationDetails')}>{t('choiceEditorHelp')} {t('translationHelp')}</SettingsHelp>
      {(optionGroups.length?optionGroups:[undefined]).map(group=>{
       const grouped=optionGroups.length?options.filter(option=>option.group===group):options;
       const entries=grouped.map((option)=>{
        const siblings=grouped.filter(item=>kind!=='tree_choice'||(item.parentId??null)===(option.parentId??null)),index=siblings.findIndex(item=>item.id===option.id);
        const path=kind==='tree_choice'?choiceAncestors(options,option.id).reverse().map(id=>options.find(item=>item.id===id)!.labels[i18n.language as 'de'|'en']??options.find(item=>item.id===id)!.labels.en).join(' / '):'';
        return <div key={option.id}>{grouped.indexOf(option)?<Separator className="mb-3"/>:null}{path?<FieldDescription>{path}</FieldDescription>:null}<ChoiceValueEditor id={option.id} labels={option.labels} active={option.active} readOnly={readOnly} disabled={disabled&&!readOnly} onLabels={labels=>onChange({...config,options:options.map(item=>item.id===option.id?{...item,labels}:item)})} onActive={active=>onChange({...config,options:setChoiceActive(options,option.id,active,kind==='tree_choice')})} onUp={index>0?()=>move(option.id,siblings[index-1].id):undefined} onDown={index<siblings.length-1?()=>move(option.id,siblings[index+1].id):undefined} onMoveTo={target=>move(option.id,target)}>{kind==='tree_choice'?<ChoiceTreeParent id={option.id} options={options.map(item=>({...item,label:item.labels[i18n.language as 'de'|'en']??item.labels.en??item.labels.de??item.id}))} disabled={structureDisabled} onChange={parentId=>onChange({...config,options:options.map(item=>item.id===option.id?{...item,parentId}:item)})}/>:null}</ChoiceValueEditor></div>;
       });
       return group?<FieldSet key={group}><FieldLegend variant="label">{groupTitle(group)}</FieldLegend><FieldGroup>{entries.length?entries:<FieldDescription>{t('structuredEmpty')}</FieldDescription>}</FieldGroup></FieldSet>:<FieldGroup key="all">{entries}</FieldGroup>;
      })}
      {!readOnly?<Collapsible><CollapsibleTrigger render={<Button type="button" variant="outline" className="group/new-choice w-fit"/>}><PlusIcon data-icon="inline-start"/>{t('newChoice')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/new-choice:rotate-180"/></CollapsibleTrigger><CollapsibleContent className="pt-3"><FieldSet><FieldLegend variant="label" className="sr-only">{t('newChoice')}</FieldLegend>{optionGroups.length?<Field><FieldLabel htmlFor="collection-option-group">{t('contactOptionGroup')}</FieldLabel><Select items={optionGroups.map(value=>({value,label:groupTitle(value)}))} value={selectedGroup} disabled={disabled} onValueChange={group=>{if(group)setNewGroup(group as StructuredOptionGroup);}}><SelectTrigger id="collection-option-group" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{optionGroups.map(group=><SelectItem key={group} value={group}>{groupTitle(group)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>:null}<TranslatedLabelInput id="field-new-option" value={newLabels} onChange={setNewLabels} disabled={disabled} showHelp={false} requireOne={false}/><Button type="button" variant="outline" disabled={disabled||!hasLabel(newLabels)||options.length>=300} onClick={()=>{onChange({...config,options:[...options,{id:v7(),labels:cleanLabels(newLabels),active:true,...(optionGroups.length?{group:selectedGroup}:{})}]});setNewLabels({});}}><PlusIcon data-icon="inline-start"/>{t('addChoice')}</Button>{Object.values(newLabels).some(Boolean)?<FieldDescription>{t('pendingChoiceHelp')}</FieldDescription>:null}</FieldSet></CollapsibleContent></Collapsible>:null}
    </FieldGroup></FieldSet> : null}
  </FieldGroup>;
}
