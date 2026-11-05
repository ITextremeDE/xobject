import {RelationshipFieldSettings} from './relationship-field-settings';
import {SettingsSection} from './settings-section';
import { RequiredFieldSetting } from './required-field-setting';
import { relationshipCardinality, withRelationshipCardinality, type RelationshipCardinality } from '@/lib/relationship-cardinality';
import {FieldApplicabilitySettings} from './applicability-settings';
import { cn } from 'cn';
import { TechnicalNameField } from './technical-name-field';
import {createPortal} from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon,ArrowLeftIcon } from 'lucide-react';
import { relationshipConfigurationSchema, customRelationshipConfigurationSchema, type RelationshipConfiguration, type RelationshipType, type ObjectSummary } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldTitle, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { TranslatedLabelInput, cleanLabels } from './translated-label-input';
import { SettingsTable, SettingsTableSearch, useSettingsTable } from './settings-table';
import { ClientTablePagination } from './client-table-pagination';
import { ErrorNotice, Loading } from './feedback';

const empty = (): RelationshipConfiguration => ({ leftApplicability:null,rightApplicability:null,labels:{},leftLabels:{},rightLabels:{},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[],active:true });
function normalizeSymmetric(value: RelationshipConfiguration): RelationshipConfiguration {
  const symmetric=!value.directed&&(value.allowAll||value.pairs.some(pair=>value.pairs.some(other=>other.leftObjectTypeId===pair.rightObjectTypeId)));
  return symmetric?{...value,rightMin:value.leftMin,rightMax:value.leftMax,rightLabels:{...value.leftLabels},rightApplicability:value.leftApplicability??null}:value;
}
function configuration(row: RelationshipType): RelationshipConfiguration { const { leftApplicability,rightApplicability,labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,pairs,active }=row; return structuredClone({leftApplicability:leftApplicability??null,rightApplicability:rightApplicability??null,labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,pairs,active}); }

export function WorkspaceRelationships({ workspaceId, canManage, actionTarget, onDirtyChange, onBusyChange }: {workspaceId:string;canManage:boolean;actionTarget?:HTMLElement|null;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const {t,i18n}=useTranslation();
  const [selected,setSelected]=useState<string|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  const returnFocus=useRef<string|null>(null),focusAnchor=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(selected||!returnFocus.current)return;
    const target=returnFocus.current;
    const frame=requestAnimationFrame(()=>document.querySelector<HTMLElement>(target==='new'?'[data-relation-create]':`[data-relation-editor="${target}"]`)?.focus());
    return ()=>cancelAnimationFrame(frame);
  },[selected]);
  const rows=useQuery({queryKey:['relationship-types',workspaceId],queryFn:()=>api('list_relationship_types',{workspaceId})});
  const objects=useQuery({queryKey:['types',workspaceId,'relationship-settings'],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true})});
  const label=(row:RelationshipType)=>row.labels[i18n.language as 'de'|'en']??row.labels.de??row.labels.en??row.technicalName;
  const sorted=[...(rows.data??[])].filter(row=>row.kind!=='primary').sort((a,b)=>new Intl.Collator(i18n.language).compare(label(a),label(b)));
  const pairLabel=(row:RelationshipType)=>row.allowAll?t('relationSystemAllObjects'):row.pairs.map(pair=>`${objects.data?.find(o=>o.id===pair.leftObjectTypeId)?.label??t('definition_inactive')} ${row.directed?'→':'↔'} ${objects.data?.find(o=>o.id===pair.rightObjectTypeId)?.label??t('definition_inactive')}`).join(', ');
  const table=useSettingsTable(sorted,row=>`${label(row)} ${row.technicalName} ${pairLabel(row)}`);
  useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);useEffect(()=>onBusyChange(busy),[busy,onBusyChange]);
  // Keep focus inside the dialog while replacing the editor, then restore the originating row.
  function finish(){focusAnchor.current?.focus();returnFocus.current=selected;setDirty(false);setBusy(false);setSelected(null);}
  function close(){if(!busy){if(dirty)setConfirm(true);else finish();}}

  return <FieldGroup ref={focusAnchor} tabIndex={-1}>{selected?(selected&&(selected==='new'||rows.data?.some(row=>row.id===selected))&&objects.data?<RelationshipEditor key={selected} row={rows.data?.find(row=>row.id===selected)} actionTarget={actionTarget} objects={objects.data} workspaceId={workspaceId} readOnly={!canManage} onClose={close} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={finish}/>:null): <><FieldDescription>{t('relationshipSettingsHelp')}</FieldDescription><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SettingsTableSearch value={table.search} onChange={table.onSearch} disabled={busy}/>{canManage?<Button type="button" variant="outline" data-relation-create disabled={busy} onClick={()=>setSelected('new')}><PlusIcon data-icon="inline-start"/>{t('createRelationshipType')}</Button>:null}</div>
    {rows.isPending||objects.isPending?<Loading variant="table" headings={[t('objectName'),t('relationDirection'),t('relationshipLimits')]} columnClasses={['w-1/2','','hidden sm:table-cell']}/>:rows.isError||objects.isError?<ErrorNotice error={rows.error??objects.error}/>:<><SettingsTable aria-label={t('relationshipTypes')}><TableHeader><TableRow><TableHead className="w-1/2">{t('objectName')}</TableHead><TableHead>{t('relationDirection')}</TableHead><TableHead className="hidden sm:table-cell">{t('relationshipLimits')}</TableHead></TableRow></TableHeader><TableBody>{!table.pagination.total?<TableRow><TableCell colSpan={3}>{t('settingsNoMatches')}</TableCell></TableRow>:null}{table.pagination.rows.map(row=><TableRow key={row.id} onClick={event=>{if(!busy&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.target instanceof Element&&!event.target.closest('button,a,input')&&!window.getSelection()?.toString())setSelected(row.id);}}><TableCell><Button type="button" variant="link" data-relation-editor={row.id} disabled={busy} className="h-auto max-w-full justify-start px-0 text-left whitespace-normal" onClick={()=>setSelected(row.id)}>{label(row)}</Button><p className="mt-1 text-sm text-muted-foreground">{pairLabel(row)}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{row.moduleKey?t('moduleRelationshipBadge',{module:t(`moduleName_${row.moduleKey}`)}):t(row.kind==='primary'?'projectsModule':row.kind==='custom'?'relationCustom':'relationSystem')}</Badge><Badge variant="secondary">{t(row.rulesState==='active'?'relationActiveRules':'relationDraftRules')}</Badge>{!row.active?<Badge variant="secondary">{t('definition_inactive')}</Badge>:null}</div></TableCell><TableCell>{t(row.directed?'relationDirected':'relationUndirected')}</TableCell><TableCell className="hidden sm:table-cell">{relationshipCardinality(row)}</TableCell></TableRow>)}</TableBody></SettingsTable><ClientTablePagination pagination={table.pagination} countLabel={t('relationshipTypeCount',{count:table.pagination.total})}/></>}
    </>}<AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent finalFocus={()=>document.querySelector<HTMLElement>(returnFocus.current==='new'?'[data-relation-create]':`[data-relation-editor="${returnFocus.current}"]`)??true}><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{finish();setConfirm(false);}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

function RelationshipEditor({row,actionTarget,objects,workspaceId,readOnly,onClose,onDirtyChange,onBusyChange,onSaved}:{row?:RelationshipType;actionTarget?:HTMLElement|null;objects:ObjectSummary[];workspaceId:string;readOnly:boolean;onClose:()=>void;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void;onSaved:()=>void}) {
  useEffect(()=>{document.querySelector<HTMLElement>('[data-relationship-editor-title]')?.focus();},[]);
  const [attributeDirty,setAttributeDirty]=useState(false),[attributeBusy,setAttributeBusy]=useState(false);
  const structureLocked=readOnly||Boolean(row?.isProtected);
  const {t,i18n}=useTranslation(),client=useQueryClient();
  const sortedObjects=[...objects].sort((a,b)=>new Intl.Collator(i18n.language).compare(a.label,b.label)||a.id.localeCompare(b.id));
  const [baseline,setBaseline]=useState(row),[draft,setDraft]=useState<RelationshipConfiguration>(()=>row?configuration(row):empty()),[technicalName,setName]=useState(row?.technicalName??'');
  const [nameTouched,setNameTouched]=useState(false);
  const [left,setLeft]=useState(row?.pairs[0]?.leftObjectTypeId??''),[right,setRight]=useState(row?.pairs[0]?.rightObjectTypeId??'');
  const custom=!row||row.kind==='custom';
  const leftDefinition=useQuery({queryKey:['definition',left,'relationship-condition'],queryFn:()=>api('get_object_type',{objectTypeId:left}),enabled:custom&&Boolean(left)});
  const rightDefinition=useQuery({queryKey:['definition',right,'relationship-condition'],queryFn:()=>api('get_object_type',{objectTypeId:right}),enabled:custom&&Boolean(right)});
  function pair(side:'left'|'right',value:string){const a=side==='left'?value:left,b=side==='right'?value:right;setLeft(a);setRight(b);setDraft({...draft,allowAll:false,pairs:a&&b?[{leftObjectTypeId:a,rightObjectTypeId:b}]:[]});}
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline?configuration(baseline):empty())||technicalName!==(baseline?.technicalName??'')||(custom&&(left!==(baseline?.pairs[0]?.leftObjectTypeId??'')||right!==(baseline?.pairs[0]?.rightObjectTypeId??'')));
  // Retain both side drafts; mirror the shared side only for validation and saving.
  const effectiveDraft=normalizeSymmetric(draft);
  const normalized={...effectiveDraft,labels:cleanLabels(effectiveDraft.labels),leftLabels:cleanLabels(effectiveDraft.leftLabels),rightLabels:cleanLabels(effectiveDraft.rightLabels)};
  const conditionKnown=(side:'left'|'right')=>{const rule=normalized[side==='left'?'leftApplicability':'rightApplicability'];if(!rule)return true;const controller=(side==='left'?leftDefinition:rightDefinition).data?.fields.find(field=>field.id===rule.fieldId&&field.kind==='single_choice'&&!field.applicability&&field.state==='active');return Boolean(controller&&rule.optionIds.every(id=>controller.config.options?.some(option=>option.id===id)));};
  const valid=(custom?customRelationshipConfigurationSchema:relationshipConfigurationSchema).safeParse(normalized).success&&(!custom||(conditionKnown('left')&&conditionKnown('right')))&&/^[a-z][a-z0-9_]{0,62}$/.test(technicalName);
  const save=useMutation({mutationFn:()=>baseline?api('configure_relationship_type',{workspaceId,relationshipTypeId:baseline.id,version:baseline.version,configuration:normalized}):api('create_relationship_type',{workspaceId,technicalName,configuration:normalized}),onError:async error=>{if(error instanceof ApiError&&error.status===409)await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});},onSuccess:async()=>{await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});await client.invalidateQueries({queryKey:['system-journal']});await client.invalidateQueries({queryKey:['record-relationships']});await client.invalidateQueries({queryKey:['relationship-tree']});await client.invalidateQueries({queryKey:['relationship-candidates']});await client.invalidateQueries({queryKey:['definition']});onDirtyChange(false);onSaved();}});
  const activate=useMutation({mutationFn:()=>api('activate_relationship_type',{workspaceId,relationshipTypeId:row!.id,version:row!.version}),onError:async error=>{if(error instanceof ApiError&&error.status===409)await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});},onSuccess:async()=>{await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});await client.invalidateQueries({queryKey:['record-relationships']});await client.invalidateQueries({queryKey:['relationship-tree']});await client.invalidateQueries({queryKey:['relationship-candidates']});onSaved();}});
  useEffect(()=>{if(row&&!dirty&&!attributeDirty&&!save.isPending){setBaseline(row);setDraft(configuration(row));}},[row,dirty,attributeDirty,save.isPending]);
  const disabled=readOnly||save.isPending||activate.isPending;
  useEffect(()=>onDirtyChange(dirty||attributeDirty),[dirty,attributeDirty,onDirtyChange]);useEffect(()=>onBusyChange(save.isPending||activate.isPending||attributeBusy),[save.isPending,activate.isPending,attributeBusy,onBusyChange]);
  const symmetric=!draft.directed&&(draft.allowAll||draft.pairs.some(pair=>draft.pairs.some(other=>other.leftObjectTypeId===pair.rightObjectTypeId)));
  const pairReady=!custom||Boolean(left&&right);
  const fixedCardinality=structureLocked||Boolean(row&&row.kind!=='custom');
  const cardinalityOptions: RelationshipCardinality[]=symmetric?['1:1','n:m']:['1:1','1:n','n:1','n:m'];
  const sourceName=objects.find(object=>object.id===left)?.label??t('relationLeft');
  const targetName=objects.find(object=>object.id===right)?.label??t('relationRight');
  function side(which:'left'|'right') {
    const name=which==='left'?'leftLabels':'rightLabels',min=which==='left'?'leftMin':'rightMin';
    const source=objects.find(object=>object.id===(which==='left'?left:right)),target=objects.find(object=>object.id===(which==='left'?right:left));
    const content=<FieldGroup key={symmetric?'shared':which}>
      <TranslatedLabelInput id={`relation-${which}-labels`} value={draft[name]} onChange={labels=>setDraft({...draft,[name]:labels})} disabled={save.isPending||activate.isPending||attributeBusy} readOnly={readOnly} showHelp={false}/>
      {!symmetric?<FieldDescription>{custom&&source&&target?(source.id===target.id?t('relationSelfSideNameHelp'):t('relationSideContext',{source:source.label,target:target.label})):t('relationSideLabelHelp')}</FieldDescription>:null}
      {fixedCardinality?<Field><FieldTitle>{t(symmetric?'relationRequiredShared':'relationRequiredFor',{object:source?.label??t(which==='left'?'relationLeft':'relationRight')})}</FieldTitle><FieldDescription>{t(draft[min]===1?'yes':'no')}</FieldDescription></Field>:<RequiredFieldSetting id={`relation-${which}-required`} label={t(symmetric?'relationRequiredShared':'relationRequiredFor',{object:source?.id===target?.id?`${source?.label} · ${t(which==='left'?'relationLeft':'relationRight')}`:source?.label})} value={draft[min]===1} disabled={disabled} onChange={value=>setDraft({...draft,[min]:value?1:0})}/>}
      <FieldDescription>{t(symmetric?'relationRequiredSharedHelp':'relationRequiredSideHelp',{source:source?.label??t(which==='left'?'relationLeft':'relationRight'),target:(draft[name][i18n.language as 'de'|'en']??draft[name].de??draft[name].en)||target?.label||t('records')})}</FieldDescription>
      {custom&&(which==='left'?leftDefinition:rightDefinition).isPending?<Loading variant="field" label={t('relationshipCondition')}/>:null}
      {custom&&(which==='left'?leftDefinition:rightDefinition).isError?<ErrorNotice error={(which==='left'?leftDefinition:rightDefinition).error} retry={()=>{void (which==='left'?leftDefinition:rightDefinition).refetch();}}/>:null}
      {custom?(which==='left'?leftDefinition:rightDefinition).data?<FieldApplicabilitySettings idPrefix={`relation-${which}`} fields={(which==='left'?leftDefinition:rightDefinition).data!.fields} value={draft[which==='left'?'leftApplicability':'rightApplicability']??null} disabled={disabled||structureLocked} title={t('relationshipCondition')} description={t('relationshipConditionHelp',{object:source?.label})} onChange={rule=>setDraft({...draft,[which==='left'?'leftApplicability':'rightApplicability']:rule})}/>:null:null}
    </FieldGroup>;
    // Shared controls already belong to the outer fieldset. Separate sides have stable,
    // visible legends; changing a legend between normal flow and sr-only breaks Chromium layout.
    return symmetric?content:<FieldSet key={which} className="min-w-0">
      <FieldLegend variant="label" className="flex flex-wrap items-center gap-2"><span>{t(which==='left'?'relationLeft':'relationRight')}</span>{custom&&source?<Badge variant="outline">{source.label}</Badge>:null}</FieldLegend>
      {content}
    </FieldSet>;
  }
  function objectSelect(id:string,value:string,onChange:(value:string)=>void){const selected=objects.find(object=>object.id===value);return <Field>{structureLocked||row?.pairLocked?<><FieldTitle>{t(id.endsWith('left')?'relationLeftObject':'relationRightObject')}</FieldTitle><FieldDescription>{selected?.label??t('selectObjectType')}{selected?.state==='inactive'?` (${t('definition_inactive')})`:''}</FieldDescription></>:<><FieldLabel htmlFor={id}>{t(id.endsWith('left')?'relationLeftObject':'relationRightObject')}</FieldLabel><Select items={sortedObjects.map(type=>({value:type.id,label:type.label}))} value={value||null} disabled={disabled||Boolean(row?.pairLocked)} onValueChange={next=>onChange(next??'')}><SelectTrigger id={id} className="w-full"><SelectValue placeholder={t('selectObjectType')}/></SelectTrigger><SelectContent><SelectGroup>{sortedObjects.map(type=><SelectItem key={type.id} value={type.id} disabled={type.state==='inactive'&&type.id!==value}>{type.label}{type.state==='inactive'?` (${t('definition_inactive')})`:''}</SelectItem>)}</SelectGroup></SelectContent></Select></>}</Field>;}
  const actions=<>{!readOnly?<>{row?.rulesState==='draft'?<Button type="button" variant="outline" disabled={dirty||disabled} onClick={()=>activate.mutate()}>{t(activate.isPending?'saving':'activateRelationshipRules')}</Button>:null}{row?<Button type="button" variant="outline" disabled={!dirty||disabled} onClick={()=>{setBaseline(row);setDraft(configuration(row));setName(row.technicalName);setNameTouched(false);setLeft(row.pairs[0]?.leftObjectTypeId??'');setRight(row.pairs[0]?.rightObjectTypeId??'');save.reset();}}>{t('resetPreferences')}</Button>:null}<Button type="submit" form="relationship-form" disabled={!dirty||!valid||disabled||attributeBusy} aria-keyshortcuts={keyboardCommands.save.aria}>{save.isPending?<Spinner data-icon="inline-start"/>:null}{t(row?'save':'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></>:null}</>;
  return <FieldGroup><div className="flex flex-col gap-3"><Button type="button" variant="ghost" className="w-fit -ml-2" disabled={save.isPending||activate.isPending||attributeBusy} onClick={onClose}><ArrowLeftIcon data-icon="inline-start"/>{t('backToRelationshipTypes')}</Button><h3 tabIndex={-1} data-relationship-editor-title className="font-medium">{row?`${t('editRelationshipType')} · ${(row.labels[i18n.language as 'de'|'en']??row.labels.en??row.labels.de)}`:t('createRelationshipType')}</h3><FieldDescription>{row?.moduleKey?t('moduleRelationshipHelp',{module:t(`moduleName_${row.moduleKey}`)}):t(row&&row.kind!=='custom'?'relationSystemProtected':!row?'relationCreateHelp':row.rulesState==='draft'?'relationDraftHelp':'relationEditingHelp')}</FieldDescription></div>
    <form id="relationship-form" data-shortcut-submit onSubmit={event=>{event.preventDefault();if(!disabled&&dirty&&valid)save.mutate();}}><FieldGroup>
      {save.isError?<ErrorNotice error={save.error}/>:null}{activate.isError?<ErrorNotice error={activate.error}/>:null}
      {row?.kind==='primary'?<FieldDescription>{t('relationPrimaryHelp')}</FieldDescription>:null}
      <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t(custom?'relationObjectPair':'relationScope')}</FieldLegend><FieldGroup>
        {custom?<><FieldDescription>{t('relationSinglePairHelp')}{row?.pairLocked?` ${t('relationPairLocked')}`:''}</FieldDescription><FieldGroup className="grid gap-4 sm:grid-cols-2">{objectSelect('relation-pair-left',left,value=>pair('left',value))}{objectSelect('relation-pair-right',right,value=>pair('right',value))}</FieldGroup></>:<FieldDescription>{t('relationSystemAllObjects')}</FieldDescription>}
        <Field>{structureLocked||Boolean(row&&row.kind!=='custom')||row?.pairLocked?<><FieldTitle>{t('relationDirection')}</FieldTitle><FieldDescription>{t(draft.directed?'relationDirected':'relationUndirected')}</FieldDescription></>:<><FieldLabel id="relation-direction">{t('relationDirection')}</FieldLabel><ToggleGroup variant="outline" aria-labelledby="relation-direction" aria-describedby="relation-direction-help" value={[draft.directed?'directed':'undirected']} disabled={disabled} onValueChange={values=>{if(values[0])setDraft({...draft,directed:values[0]==='directed'});}}><ToggleGroupItem value="directed">{t('relationDirected')}</ToggleGroupItem><ToggleGroupItem value="undirected">{t('relationUndirected')}</ToggleGroupItem></ToggleGroup><FieldDescription id="relation-direction-help">{t(draft.directed?'relationDirectedHelp':'relationUndirectedHelp')}</FieldDescription></>}</Field>
      </FieldGroup></FieldSet></SettingsSection>

      <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('fieldIdentity')}</FieldLegend><FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
        <TranslatedLabelInput id="relation-labels" value={draft.labels} onChange={labels=>{setDraft({...draft,labels});if(!row&&!nameTouched)setName((labels.en??labels.de??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^[^a-z]+|_+$/g,'').slice(0,63));}} disabled={save.isPending||activate.isPending||attributeBusy} readOnly={readOnly} readOnlyHelp={t('readOnlyLabelHelp')} compactHelp/>
        <TechnicalNameField id="relation-technical" value={technicalName} readOnly={Boolean(row)||readOnly} disabled={save.isPending||activate.isPending||attributeBusy} onChange={value=>{setName(value);setNameTouched(true);}}/>
      </FieldGroup></FieldSet></SettingsSection>
      {pairReady?<>
      <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('relationCardinality')}</FieldLegend><FieldDescription>{t(custom?'relationGlobalCardinalityHelp':'relationSystemCardinalityHelp',{source:sourceName,target:targetName,direction:draft.directed?'→':'↔'})}</FieldDescription><FieldGroup>
        {fixedCardinality?<Field><FieldTitle>{relationshipCardinality(effectiveDraft)}</FieldTitle></Field>:<Field><FieldLabel className="sr-only" htmlFor="relation-cardinality">{t('relationCardinality')}</FieldLabel><Select items={cardinalityOptions.map(value=>({value,label:value}))} value={relationshipCardinality(effectiveDraft)} disabled={disabled} onValueChange={value=>{if(value)setDraft(withRelationshipCardinality(draft,value as RelationshipCardinality));}}><SelectTrigger id="relation-cardinality" className="w-full sm:w-48"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{cardinalityOptions.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
        <FieldDescription>{t(`relationGlobal_${relationshipCardinality(effectiveDraft).replace(':','_')}`,{source:sourceName,target:targetName})}</FieldDescription>
      </FieldGroup></FieldSet></SettingsSection>
      <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t(symmetric?'relationSharedSettings':'relationSideSettings')}</FieldLegend><FieldDescription>{t(symmetric?'relationSharedSettingsHelp':readOnly?'relationSideReadOnlyHelp':row?.isProtected||row&&row.kind!=='custom'?'relationSideNamesOnlyHelp':'relationSideSettingsHelp')}</FieldDescription><FieldGroup className={cn('grid gap-6',!symmetric&&'sm:grid-cols-2')}>{side('left')}{!symmetric?side('right'):null}</FieldGroup></FieldSet></SettingsSection></>:<FieldDescription role="status">{t('relationChoosePairFirst')}</FieldDescription>}
      {row?.kind==='custom'?<SettingsSection><FieldGroup>{structureLocked?<Field><FieldTitle>{t('relationAvailability')}</FieldTitle><FieldDescription>{t(draft.active?'relationAvailable':'definition_inactive')}</FieldDescription></Field>:<Field orientation="horizontal"><Checkbox id="relation-active" aria-describedby="relation-availability-help" checked={draft.active} disabled={disabled} onCheckedChange={value=>setDraft({...draft,active:Boolean(value)})}/><FieldLabel htmlFor="relation-active">{t('relationAvailable')}</FieldLabel></Field>}<FieldDescription id="relation-availability-help">{t(row.rulesState==='draft'?'relationAvailabilityDraftHelp':'relationAvailabilityHelp')}</FieldDescription></FieldGroup></SettingsSection>:null}
      {row?.kind==='custom'?<RelationshipFieldSettings row={row} workspaceId={workspaceId} readOnly={readOnly} disabled={dirty||save.isPending||activate.isPending} onDirtyChange={setAttributeDirty} onBusyChange={setAttributeBusy}/>:null}
      {pairReady&&!valid&&dirty?<FieldDescription>{t('relationInvalidHelp')}</FieldDescription>:null}
    </FieldGroup></form>
    {actionTarget?createPortal(actions,actionTarget):<div className="flex flex-wrap justify-end gap-2">{actions}</div>}
  </FieldGroup>;
}
