import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { relationshipConfigurationSchema, type RelationshipConfiguration, type RelationshipType, type ObjectSummary } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { DialogActions } from './dialog-actions';
import { TranslatedLabelInput, cleanLabels } from './translated-label-input';
import { SettingsTable, SettingsTableSearch, useSettingsTable } from './settings-table';
import { ClientTablePagination } from './client-table-pagination';
import { ErrorNotice, Loading } from './feedback';

const cardinality = (min: number, max: number | null) => `${min}..${max ?? 'n'}`;
const empty = (): RelationshipConfiguration => ({ labels:{},leftLabels:{},rightLabels:{},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:true,pairs:[],active:true });
function normalizeSymmetric(value: RelationshipConfiguration): RelationshipConfiguration {
  const symmetric=!value.directed&&(value.allowAll||value.pairs.some(pair=>value.pairs.some(other=>other.leftObjectTypeId===pair.rightObjectTypeId)));
  return symmetric?{...value,rightMin:value.leftMin,rightMax:value.leftMax,rightLabels:{...value.leftLabels}}:value;
}
function configuration(row: RelationshipType): RelationshipConfiguration { const { labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,pairs,active }=row; return structuredClone({labels,leftLabels,rightLabels,directed,leftMin,leftMax,rightMin,rightMax,allowAll,pairs,active}); }

export function WorkspaceRelationships({ workspaceId, canManage, onDirtyChange, onBusyChange }: {workspaceId:string;canManage:boolean;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const {t,i18n}=useTranslation();
  const [selected,setSelected]=useState<string|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  const rows=useQuery({queryKey:['relationship-types',workspaceId],queryFn:()=>api('list_relationship_types',{workspaceId})});
  const objects=useQuery({queryKey:['types',workspaceId,'relationship-settings'],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true})});
  const label=(row:RelationshipType)=>row.labels[i18n.language as 'de'|'en']??row.labels.de??row.labels.en??row.technicalName;
  const sorted=[...(rows.data??[])].sort((a,b)=>new Intl.Collator(i18n.language).compare(label(a),label(b)));
  const table=useSettingsTable(sorted,row=>`${label(row)} ${row.technicalName}`);
  useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);useEffect(()=>onBusyChange(busy),[busy,onBusyChange]);
  function close(){if(!busy){if(dirty)setConfirm(true);else setSelected(null);}}
  return <FieldGroup><FieldDescription>{t('relationshipSettingsHelp')}</FieldDescription><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SettingsTableSearch value={table.search} onChange={table.onSearch} disabled={busy}/>{canManage?<Button type="button" variant="outline" data-relation-create disabled={busy} onClick={()=>setSelected('new')}><PlusIcon data-icon="inline-start"/>{t('createRelationshipType')}</Button>:null}</div>
    {rows.isPending||objects.isPending?<Loading/>:rows.isError||objects.isError?<ErrorNotice error={rows.error??objects.error}/>:<><SettingsTable aria-label={t('relationshipTypes')}><TableHeader><TableRow><TableHead className="w-1/2">{t('objectName')}</TableHead><TableHead>{t('relationDirection')}</TableHead><TableHead className="hidden sm:table-cell">{t('relationCardinalities')}</TableHead></TableRow></TableHeader><TableBody>{!table.pagination.total?<TableRow><TableCell colSpan={3}>{t('settingsNoMatches')}</TableCell></TableRow>:null}{table.pagination.rows.map(row=><TableRow key={row.id} onClick={event=>{if(!busy&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.target instanceof Element&&!event.target.closest('button,a,input')&&!window.getSelection()?.toString())setSelected(row.id);}}><TableCell><Button type="button" variant="link" data-relation-editor={row.id} disabled={busy} className="h-auto max-w-full justify-start px-0 text-left whitespace-normal hover:no-underline" onClick={()=>setSelected(row.id)}>{label(row)}</Button><div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{t(row.kind==='custom'?'relationCustom':'relationSystem')}</Badge><Badge variant="secondary">{t('relationDraftRules')}</Badge>{!row.active?<Badge variant="secondary">{t('definition_inactive')}</Badge>:null}</div></TableCell><TableCell>{t(row.directed?'relationDirected':'relationUndirected')}</TableCell><TableCell className="hidden sm:table-cell">{cardinality(row.leftMin,row.leftMax)} / {cardinality(row.rightMin,row.rightMax)}</TableCell></TableRow>)}</TableBody></SettingsTable><ClientTablePagination pagination={table.pagination} countLabel={t('relationshipTypeCount',{count:table.pagination.total})}/></>}
    {selected&&(selected==='new'||rows.data?.some(row=>row.id===selected))&&objects.data?<RelationshipEditor key={selected} row={rows.data?.find(row=>row.id===selected)} objects={objects.data} workspaceId={workspaceId} readOnly={!canManage} onClose={close} onDirtyChange={setDirty} onBusyChange={setBusy} onSaved={()=>{setDirty(false);setBusy(false);setSelected(null);}}/>:null}
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{setDirty(false);setSelected(null);setConfirm(false);}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

function RelationshipEditor({row,objects,workspaceId,readOnly,onClose,onDirtyChange,onBusyChange,onSaved}:{row?:RelationshipType;objects:ObjectSummary[];workspaceId:string;readOnly:boolean;onClose:()=>void;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void;onSaved:()=>void}) {
  const {t}=useTranslation(),client=useQueryClient();
  const [baseline,setBaseline]=useState(row),[draft,writeDraft]=useState<RelationshipConfiguration>(()=>row?configuration(row):empty()),[technicalName,setName]=useState(row?.technicalName??'');
  const setDraft=(value:RelationshipConfiguration)=>writeDraft(normalizeSymmetric(value));
  const [left,setLeft]=useState(''),[right,setRight]=useState('');
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline?configuration(baseline):empty())||technicalName!==(baseline?.technicalName??'')||Boolean(left||right);
  const normalized={...draft,labels:cleanLabels(draft.labels),leftLabels:cleanLabels(draft.leftLabels),rightLabels:cleanLabels(draft.rightLabels)};
  const valid=relationshipConfigurationSchema.safeParse(normalized).success&&/^[a-z][a-z0-9_]{0,62}$/.test(technicalName)&&!left&&!right;
  const save=useMutation({mutationFn:()=>baseline?api('configure_relationship_type',{workspaceId,relationshipTypeId:baseline.id,version:baseline.version,configuration:normalized}):api('create_relationship_type',{workspaceId,technicalName,configuration:normalized}),onError:async error=>{if(error instanceof ApiError&&error.status===409)await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});},onSuccess:async()=>{await client.invalidateQueries({queryKey:['relationship-types',workspaceId]});await client.invalidateQueries({queryKey:['system-journal']});onDirtyChange(false);onSaved();}});
  const disabled=readOnly||save.isPending;
  useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);useEffect(()=>onBusyChange(save.isPending),[save.isPending,onBusyChange]);
  const symmetric=!draft.directed&&(draft.allowAll||draft.pairs.some(pair=>draft.pairs.some(other=>other.leftObjectTypeId===pair.rightObjectTypeId)));
  const options=['0..1','1..1','0..n','1..n'].map(value=>({value,label:t(`relationCard_${value.replace('..','_')}`)}));
  function side(which:'left'|'right') {
    const name=which==='left'?'leftLabels':'rightLabels',min=which==='left'?'leftMin':'rightMin',max=which==='left'?'leftMax':'rightMax';
    const locked=disabled||row?.kind==='general'||(row?.kind==='primary'&&which==='left')||(symmetric&&which==='right');
    const items=row?.kind==='primary'&&which==='right'?options.filter(option=>option.value.endsWith('1')):options;
    return <FieldSet><FieldLegend>{t(which==='left'?'relationLeft':'relationRight')}</FieldLegend><FieldGroup><TranslatedLabelInput id={`relation-${which}-labels`} value={draft[name]} onChange={labels=>setDraft({...draft,[name]:labels})} disabled={disabled||(symmetric&&which==='right')} readOnly={readOnly} showHelp={false}/><FieldDescription>{t('relationSideLabelHelp')}</FieldDescription><Field><FieldLabel htmlFor={`relation-${which}-count`}>{t('relationCardinality')}</FieldLabel><Select items={items} value={cardinality(draft[min],draft[max])} disabled={locked} onValueChange={value=>{if(!value)return;const [a,b]=value.split('..');const next={...draft,[min]:Number(a),[max]:b==='n'?null:1};if(symmetric)Object.assign(next,{rightMin:next.leftMin,rightMax:next.leftMax});setDraft(next);}}><SelectTrigger id={`relation-${which}-count`} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup></FieldSet>;
  }
  function objectSelect(id:string,value:string,onChange:(value:string)=>void){return <Field><FieldLabel htmlFor={id}>{t(id.endsWith('left')?'relationLeftObject':'relationRightObject')}</FieldLabel><Select items={objects.map(type=>({value:type.id,label:type.label}))} value={value||null} disabled={disabled} onValueChange={next=>onChange(next??'')}><SelectTrigger id={id} className="w-full"><SelectValue placeholder={t('selectObjectType')}/></SelectTrigger><SelectContent><SelectGroup>{objects.map(type=><SelectItem key={type.id} value={type.id} disabled={type.state==='inactive'&&type.id!==value}>{type.label}{type.state==='inactive'?` (${t('definition_inactive')})`:''}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;}
  return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose();}}><DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl" closeButtonDisabled={save.isPending} finalFocus={()=>document.querySelector<HTMLElement>(row?`[data-relation-editor="${row.id}"]`:'[data-relation-create]')??true}>
    <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t(row?'editRelationshipType':'createRelationshipType')}</DialogTitle><DialogDescription>{t('relationshipDefinitionOnly')}</DialogDescription></DialogHeader>
    <form id="relationship-form" data-shortcut-submit className="min-h-0 overflow-y-auto px-4 pb-4" onSubmit={event=>{event.preventDefault();if(!disabled&&dirty&&valid)save.mutate();}}><FieldGroup>
      {save.isError?<ErrorNotice error={save.error}/>:null}
      {row?.kind!=='custom'&&row?<FieldDescription>{t(row.kind==='primary'?'relationPrimaryHelp':'relationGeneralHelp')}</FieldDescription>:null}
      <TranslatedLabelInput id="relation-labels" value={draft.labels} onChange={labels=>setDraft({...draft,labels})} disabled={disabled} readOnly={readOnly} compactHelp/>
      <Field><FieldLabel htmlFor="relation-technical">{t('technicalName')}</FieldLabel><Input id="relation-technical" value={technicalName} readOnly={Boolean(row)||readOnly} disabled={save.isPending} maxLength={63} pattern="[a-z][a-z0-9_]*" required onChange={event=>setName(event.target.value)}/>{row?<FieldDescription>{t('technicalNameFixed')}</FieldDescription>:null}</Field>
      <Field><FieldLabel id="relation-direction">{t('relationDirection')}</FieldLabel><ToggleGroup variant="outline" aria-labelledby="relation-direction" value={[draft.directed?'directed':'undirected']} disabled={disabled||Boolean(row&&row.kind!=='custom')} onValueChange={values=>{if(!values[0])return;const directed=values[0]==='directed';setDraft({...draft,directed,...(!directed?{rightMin:draft.leftMin,rightMax:draft.leftMax}:{})});}}><ToggleGroupItem value="directed">{t('relationDirected')}</ToggleGroupItem><ToggleGroupItem value="undirected">{t('relationUndirected')}</ToggleGroupItem></ToggleGroup></Field>
      <Separator/><FieldGroup className="grid gap-6 sm:grid-cols-2">{side('left')}{side('right')}</FieldGroup>
      {symmetric?<FieldDescription>{t('relationSymmetricHelp')}</FieldDescription>:null}
      <Separator/><FieldSet><FieldLegend>{t('relationObjectPairs')}</FieldLegend><FieldGroup><Field orientation="horizontal"><Checkbox id="relation-all" checked={draft.allowAll} disabled={disabled||Boolean(row&&row.kind!=='custom')} onCheckedChange={value=>{setDraft({...draft,allowAll:Boolean(value),pairs:[],...(!draft.directed&&value?{rightMin:draft.leftMin,rightMax:draft.leftMax}:{})});setLeft('');setRight('');}}/><FieldLabel htmlFor="relation-all">{t('relationAllowAll')}</FieldLabel></Field>
      {!draft.allowAll?<>{!draft.pairs.length?<FieldDescription>{t('relationNoPairs')}</FieldDescription>:draft.pairs.map((pair,index)=><FieldGroup key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">{objectSelect(`pair-${index}-left`,pair.leftObjectTypeId,value=>setDraft({...draft,pairs:draft.pairs.map((old,i)=>i===index?{...old,leftObjectTypeId:value}:old)}))}{objectSelect(`pair-${index}-right`,pair.rightObjectTypeId,value=>setDraft({...draft,pairs:draft.pairs.map((old,i)=>i===index?{...old,rightObjectTypeId:value}:old)}))}{!readOnly?<Button type="button" variant="outline" size="icon" disabled={disabled} aria-label={t('removeObjectPair',{index:index+1})} onClick={()=>setDraft({...draft,pairs:draft.pairs.filter((_,i)=>i!==index)})}><Trash2Icon/></Button>:null}</FieldGroup>)}
      {!readOnly?<><Separator/><FieldGroup className="grid gap-3 sm:grid-cols-2">{objectSelect('new-pair-left',left,setLeft)}{objectSelect('new-pair-right',right,setRight)}</FieldGroup><Button type="button" variant="outline" className="w-fit" disabled={disabled||!left||!right||draft.pairs.length>=200} onClick={()=>{setDraft({...draft,pairs:[...draft.pairs,{leftObjectTypeId:left,rightObjectTypeId:right}]});setLeft('');setRight('');}}><PlusIcon data-icon="inline-start"/>{t('addObjectPair')}</Button></>:null}</>:null}</FieldGroup></FieldSet>
      {(!row||row.kind==='custom')?<Field orientation="horizontal"><Checkbox id="relation-active" checked={draft.active} disabled={disabled} onCheckedChange={value=>setDraft({...draft,active:Boolean(value)})}/><FieldLabel htmlFor="relation-active">{t('relationActive')}</FieldLabel></Field>:null}
      {!valid&&dirty?<FieldDescription>{t('relationInvalidHelp')}</FieldDescription>:null}
    </FieldGroup></form>
    <DialogActions onClose={onClose} closeLabel={t(row?'close':'cancel')} disabled={save.isPending}>{!readOnly?<>{row?<Button type="button" variant="outline" disabled={!dirty||save.isPending} onClick={()=>{setBaseline(row);setDraft(configuration(row));setName(row.technicalName);setLeft('');setRight('');save.reset();}}>{t('resetPreferences')}</Button>:null}<Button type="submit" form="relationship-form" disabled={!dirty||!valid||save.isPending} aria-keyshortcuts={keyboardCommands.save.aria}>{save.isPending?<Spinner data-icon="inline-start"/>:null}{t(row?'save':'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></>:null}</DialogActions>
  </DialogContent></Dialog>;
}
