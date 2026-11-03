import {SettingsSection} from './settings-section';
import {useLabelLanguages} from '@/lib/workspace-languages';
import {createPortal} from 'react-dom';
import {SettingsHelp} from './settings-help';
import {appendFormGroup} from '@/lib/form-layout-editing';
import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {ArrowUpIcon,ArrowDownIcon,PlusIcon,Trash2Icon} from 'lucide-react';
import {resolveFormLayout,formLayoutElements,formEntryKey,formLayoutEntries,effectiveFormEntry,type FormEntry,type FormLayout,type ObjectDefinition} from '@xobject/contracts';
import {api} from '@/lib/api';
import {keyboardCommands,saveShortcutLabel} from '@/lib/keyboard';
import {Kbd} from '@/components/ui/kbd';
import {Spinner} from '@/components/ui/spinner';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from '@/components/ui/field';
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select';
import {TranslatedLabelInput,hasLabel,cleanLabels} from './translated-label-input';
import {ErrorNotice} from './feedback';

type Props={definition:ObjectDefinition;readOnly:boolean;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void;actionTarget?:HTMLElement|null};
export function FormLayoutEditor({definition,readOnly,onDirtyChange,onBusyChange,actionTarget}:Props){
  const {t,i18n}=useTranslation(),client=useQueryClient();
  const labelLanguages=useLabelLanguages(),newGroupLanguage=labelLanguages.find(code=>code===i18n.language)??labelLanguages[0];
  const [version,setVersion]=useState(definition.version);
  const fields=definition.fields.filter(field=>field.state!=='deleted');
  const relationships=definition.formRelationships??[],elements=formLayoutElements(fields,relationships);
  const [baseline,setBaseline]=useState<FormLayout>(()=>resolveFormLayout(definition.formLayouts?.default,fields,true,relationships,true)),[draft,setDraft]=useState<FormLayout>(baseline);
  const dirty=!readOnly&&JSON.stringify(draft)!==JSON.stringify(baseline);
  const valid=draft.groups.every(group=>hasLabel(group.labels));
  const localLabel=(labels:Record<string,string>)=>labels[i18n.language]??labels.en??labels.de??Object.values(labels)[0]??'';
  const mutation=useMutation({mutationFn:()=>api('configure_form_layout',{objectTypeId:definition.id,version,context:'default',layout:{...draft,groups:draft.groups.map(group=>({...group,labels:cleanLabels(group.labels)}))}}),onSuccess:async result=>{
    const next=resolveFormLayout(result.formLayouts?.default,fields,true,relationships,true);setVersion(result.version);setDraft(next);setBaseline(next);
    await client.invalidateQueries({queryKey:['definition',definition.id]});
  },onError:async()=>{await client.invalidateQueries({queryKey:['definition',definition.id]});}});
  useEffect(()=>{if(!dirty&&!mutation.isPending){const next=resolveFormLayout(definition.formLayouts?.default,fields,true,relationships,true);setVersion(definition.version);setDraft(next);setBaseline(next);}},[definition,dirty,mutation.isPending]);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(mutation.isPending);},[mutation.isPending,onBusyChange]);
  const reset=()=>{if(definition.version!==version){setVersion(definition.version);const next=resolveFormLayout(definition.formLayouts?.default,fields,true,relationships,true);setDraft(next);setBaseline(next);}else setDraft(baseline);};
  const updateGroup=(index:number,patch:Partial<FormLayout['groups'][number]>)=>setDraft(old=>index===old.groups.length?{...old,unassigned:patch.fields??old.unassigned}:{...old,groups:old.groups.map((group,i)=>i===index?{...group,...patch}:group)});
  function moveGroup(index:number,offset:number){setDraft(old=>{const groups=[...old.groups];[groups[index],groups[index+offset]]=[groups[index+offset],groups[index]];return {...old,groups};});}
  function moveField(id:string,groupId:string){setDraft(old=>{
    if(groupId===':unassigned'?(old.unassigned??[]).some(entry=>formEntryKey(entry)===id):old.groups.find(group=>group.id===groupId)?.fields.some(entry=>formEntryKey(entry)===id))return old;
    const entry=formLayoutEntries(old).find(entry=>formEntryKey(entry)===id)!;
    return {...old,groups:old.groups.map(group=>({...group,fields:group.id===groupId?[...group.fields,entry]:group.fields.filter(field=>formEntryKey(field)!==id)})),unassigned:groupId===':unassigned'?[...(old.unassigned??[]),entry]:(old.unassigned??[]).filter(field=>formEntryKey(field)!==id)};
  });}
  function shiftField(groupIndex:number,index:number,offset:number){const entries=[...(groupIndex===draft.groups.length?draft.unassigned??[]:draft.groups[groupIndex].fields)];[entries[index],entries[index+offset]]=[entries[index+offset],entries[index]];updateGroup(groupIndex,{fields:entries});}
  const shownGroups=[...draft.groups.map(group=>({...group,unassigned:false})),...(draft.unassigned?.length?[{id:':unassigned',labels:{de:t('formUnassigned'),en:t('formUnassigned')},fields:draft.unassigned,unassigned:true}]:[])];

  const formId=`form-layout-${definition.id}`;
  const actions=!readOnly?<><Button type="button" variant="outline" disabled={mutation.isPending||!dirty} onClick={reset}>{t('resetPreferences')}</Button><Button type="submit" form={formId} aria-keyshortcuts={keyboardCommands.save.aria} disabled={mutation.isPending||!dirty||!valid}>{mutation.isPending?<Spinner data-icon="inline-start" aria-hidden/>:null}{t(mutation.isPending?'saving':'save')}<Kbd>{saveShortcutLabel}</Kbd></Button></>:null;
  return <><form id={formId} className="flex min-w-0 flex-col gap-5" data-shortcut-submit aria-label={t('formDesigner')} onSubmit={event=>{event.preventDefault();if(!readOnly&&dirty&&valid&&!mutation.isPending)mutation.mutate();}}>
    <FieldDescription>{t('formDesignerHelp')}</FieldDescription>
    <SettingsHelp title={t('configurationDetails')}>{t('formDesignerControlsHelp')} {t('translationHelp')}</SettingsHelp>
    {mutation.isError?<ErrorNotice error={mutation.error}/>:null}
    {shownGroups.map((group,groupIndex)=><SettingsSection key={group.id}><FieldSet className="min-w-0">
      <FieldLegend className="mb-0 flex w-full flex-wrap items-center justify-between gap-2"><span>{localLabel(group.labels)||t('formGroup')}</span>{!group.unassigned&&!readOnly?<span className="flex gap-1">
        <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||groupIndex===0} aria-label={t('formMoveGroupUp')} title={t('formMoveGroupUp')} onClick={()=>moveGroup(groupIndex,-1)}><ArrowUpIcon/></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||groupIndex===draft.groups.length-1} aria-label={t('formMoveGroupDown')} title={t('formMoveGroupDown')} onClick={()=>moveGroup(groupIndex,1)}><ArrowDownIcon/></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending} aria-label={t('formRemoveGroup')} title={t('formRemoveGroup')} onClick={()=>setDraft(old=>({...old,groups:old.groups.filter(item=>item.id!==group.id),unassigned:[...(old.unassigned??[]),...group.fields]}))}><Trash2Icon/></Button>
      </span>:null}</FieldLegend>
      {group.unassigned?<FieldDescription>{t('formUnassignedHelp')}</FieldDescription>:<TranslatedLabelInput showHelp={false} id={`form-group-${group.id}`} value={group.labels} readOnly={readOnly} disabled={mutation.isPending} onChange={labels=>updateGroup(groupIndex,{labels})}/>}
      {!group.fields.length?<FieldDescription>{t('formGroupEmpty')}</FieldDescription>:null}
      <FieldGroup className="gap-6">{group.fields.map((entry,index)=>{
        const element=elements.find(element=>element.key===formEntryKey(entry));if(!element)return null;
        const relation=element.relationship;
        const label=element.field?.label??(relation?.definition.kind==='primary'?t('primaryChainTitle'):localLabel(relation!.side==='left'?relation!.definition.leftLabels:relation!.definition.rightLabels));
        const fieldState=element.field?.state??(relation?.definition.active?'active':'inactive');
        const id=`form-${definition.id}-${element.key}`;
        const patch=(next:Partial<FormEntry>)=>updateGroup(groupIndex,{fields:group.fields.map(item=>formEntryKey(item)===element.key?effectiveFormEntry({...item,...next} as FormEntry,element):item)});
        return <FieldSet key={element.key} className="min-w-0 gap-3">
          <FieldLegend variant="label" className="mb-0 flex w-full flex-wrap items-center justify-between gap-2"><span className="flex min-w-0 flex-wrap items-center gap-2">{label}{element.required?' *':''}{relation?<Badge variant="secondary">{t(relation.definition.kind==='primary'?'formPrimaryElement':'formRelationshipElement')}</Badge>:null}{fieldState==='inactive'?<Badge variant="outline">{t('definition_inactive')}</Badge>:null}</span>{!readOnly?<span className="flex gap-1">
            <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||index===0} aria-label={t('formMoveUp',{name:label})} title={t('formMoveUp',{name:label})} onClick={()=>shiftField(groupIndex,index,-1)}><ArrowUpIcon/></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={mutation.isPending||index===group.fields.length-1} aria-label={t('formMoveDown',{name:label})} title={t('formMoveDown',{name:label})} onClick={()=>shiftField(groupIndex,index,1)}><ArrowDownIcon/></Button>
          </span>:null}</FieldLegend>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`${id}-group`}>{t('formGroup')}</FieldLabel><NativeSelect id={`${id}-group`} className="w-full" aria-label={t('formGroupFor',{name:label})} disabled={readOnly||mutation.isPending} value={group.id} onChange={event=>moveField(element.key,event.target.value)}>{draft.groups.map(item=><NativeSelectOption key={item.id} value={item.id}>{localLabel(item.labels)||t('formGroup')}</NativeSelectOption>)}<NativeSelectOption value=":unassigned">{t('formUnassigned')}</NativeSelectOption></NativeSelect></Field>
            <Field><FieldLabel htmlFor={element.single?`${id}-width`:undefined}>{t('formWidth')}</FieldLabel>{element.single?<NativeSelect id={`${id}-width`} className="w-full" aria-label={t('formWidthFor',{name:label})} disabled={readOnly||mutation.isPending} value={entry.width} onChange={event=>patch({width:event.target.value as 'half'|'full'})}><NativeSelectOption value="half">{t('formHalf')}</NativeSelectOption><NativeSelectOption value="full">{t('formFull')}</NativeSelectOption></NativeSelect>:<FieldDescription>{t('formFull')} · {t('formFullRequired')}</FieldDescription>}</Field>
            {!('fieldId' in entry)?<Field><FieldLabel htmlFor={element.required?undefined:`${id}-visibility`}>{t('formVisibility')}</FieldLabel>{element.required?<FieldDescription>{t('formRequiredVisible')}</FieldDescription>:<NativeSelect id={`${id}-visibility`} className="w-full" aria-label={t('formVisibilityFor',{name:label})} disabled={readOnly||mutation.isPending} value={entry.visible===false?'hidden':'shown'} onChange={event=>patch({visible:event.target.value==='shown'})}><NativeSelectOption value="shown">{t('formShown')}</NativeSelectOption><NativeSelectOption value="hidden">{t('formHidden')}</NativeSelectOption></NativeSelect>}</Field>:null}
            {'relationshipTypeId' in entry&&!element.single?<Field><FieldLabel htmlFor={`${id}-expansion`}>{t('formExpansion')}</FieldLabel><NativeSelect id={`${id}-expansion`} className="w-full" aria-label={t('formExpansionFor',{name:label})} disabled={readOnly||mutation.isPending||entry.visible===false} value={entry.expanded??'auto'} onChange={event=>patch({expanded:event.target.value as 'auto'|'open'|'closed'})}><NativeSelectOption value="auto">{t('formExpansionAuto')}</NativeSelectOption><NativeSelectOption value="open">{t('formExpansionOpen')}</NativeSelectOption><NativeSelectOption value="closed">{t('formExpansionClosed')}</NativeSelectOption></NativeSelect></Field>:null}
          </FieldGroup>

        </FieldSet>;
      })}</FieldGroup>
    </FieldSet></SettingsSection>)}
    {!readOnly?<Button type="button" variant="outline" disabled={mutation.isPending||draft.groups.length>=50} onClick={()=>setDraft(old=>appendFormGroup(old,{id:crypto.randomUUID(),labels:{[newGroupLanguage]:t('formNewGroup',{lng:newGroupLanguage})},fields:[]}))}><PlusIcon data-icon="inline-start"/>{t('formAddGroup')}</Button>:null}
  </form>{actionTarget?createPortal(actions,actionTarget):null}</>;
}
