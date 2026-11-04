import {isCalendarDate} from '@/lib/temporal-input';
import {SettingsSection} from './settings-section';
import {RecordPageLoading} from './loading';
import {resolveFormLayout,formEntryKey,formLayoutEntries,type FormEntry,type FieldDefinition} from '@xobject/contracts';
import {localizedFieldDraft,normalizedFieldDraft,numericDraftError,sameFieldDraft,reformatNumericDrafts} from '@/lib/numeric-input';
import { RecordTree } from './record-tree';
import {RecordLinkActions} from './record-link-actions';
import {seedLinkedFields,type LinkedCreation} from '@/lib/linked-record';
import { RecordRelationshipFields, RecordDossier } from './record-relationships';
import { RegionalProvider, useRegional } from '@/lib/regional-context';
import { formatRegionalDate } from '@/lib/regional';
import { isInstant } from '@/lib/time-zone';
import { TimeZoneProvider, useTimeZone } from '@/lib/time-zone-context';
import { Spinner } from '@/components/ui/spinner';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, RotateCcwIcon, SaveIcon, ChevronDownIcon } from 'lucide-react';
import { fieldApplies, isCustomFieldKind, type FieldValue, type AuthUser, type DataRecord, type ObjectDefinition, type RecordRelationships, type JournalEntry } from '@xobject/contracts';
import { RecordJournalTable } from './record-journal-table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { displayFieldValue } from './custom-field-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClassificationFields, initialChoices, displayClassification, type ClassificationValues } from './classification-values';
import { CustomFieldControl, emptyCustomValue } from './custom-field-control';
import { ErrorNotice } from './feedback';

type Props = {
  returnToSource?:boolean;linkedCreation?:LinkedCreation;definition: ObjectDefinition; recordId: string; user: AuthUser; workspaceName: string; workspaceCode: string;
  onClose: () => void;onAccessLost?:()=>void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
  onSaved: (record: DataRecord) => void;
};
export function RecordPage(props: Props) {
  const { t } = useTranslation();
  const record = useQuery({ queryKey: ['record', props.definition.id, props.recordId],
    queryFn: () => api('get_record', { objectTypeId: props.definition.id, recordId: props.recordId }), enabled: props.recordId !== 'new' });
  const relationships=useQuery({queryKey:['record-relationships',props.definition.id,props.recordId],queryFn:()=>api('get_record_relationships',{objectTypeId:props.definition.id,recordId:props.recordId==='new'?undefined:props.recordId})});
  if (relationships.isPending) return <RecordPageLoading definition={props.definition} isNew={props.recordId==='new'}/>;
  if (relationships.isError) return <ErrorNotice error={relationships.error} retry={()=>{void relationships.refetch();}}/>;
  if (props.recordId !== 'new' && record.isPending) return <RecordPageLoading definition={props.definition} treeAvailable={Boolean(relationships.data.primaryChain)}/>;
  if (record.isError) return <FieldGroup><Button type="button" variant="outline" className="w-fit" onClick={props.onClose}><ArrowLeftIcon data-icon="inline-start" />{t(props.returnToSource?'backToSource':'backToOverview')}</Button><ErrorNotice error={record.error} retry={() => { void record.refetch(); }} /></FieldGroup>;
  return <RecordForm key={props.recordId} {...props} record={record.data} relationships={relationships.data} />;
}

function RecordForm({ returnToSource,linkedCreation,definition, record, recordId, user, workspaceName, workspaceCode, relationships, onClose, onAccessLost, onDirtyChange, onBusyChange, onSaved }: Props & { record?: DataRecord; relationships:RecordRelationships }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const userName = (id: string) => id === user.id ? user.name : principals.data?.find(principal => principal.kind === 'user' && principal.id === id)?.name ?? id;
  const [relationFields,setRelationFields]=useState(()=>seedLinkedFields(relationships.fields,linkedCreation));
  const [relationBaseline,setRelationBaseline]=useState(()=>seedLinkedFields(relationships.fields,linkedCreation));
  const relationDirty=JSON.stringify(relationFields)!==JSON.stringify(relationBaseline);
  useEffect(()=>{if(!relationDirty){setRelationFields(seedLinkedFields(relationships.fields,linkedCreation));setRelationBaseline(seedLinkedFields(relationships.fields,linkedCreation));}},[relationships,relationDirty]);
  const relationshipWrites=()=>relationFields.filter(field=>field.editable!==false&&(!record||JSON.stringify(field.targets)!==JSON.stringify(relationBaseline.find(item=>item.definition.id===field.definition.id&&item.side===field.side)?.targets))).map(field=>({relationshipTypeId:field.definition.id,version:field.definition.version,side:field.side,targets:field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId}))}));
  const [tab, setTab] = useState('details');
  const treeAvailable=Boolean(relationships.primaryChain);
  useEffect(()=>{if(!treeAvailable&&tab==='tree')setTab('details');},[treeAvailable,tab]);
  const requestedRegional=useRegional(),requestedTimeZone=useTimeZone();
  const [draftFormat,setDraftFormat]=useState(()=>({regional:requestedRegional,timeZone:requestedTimeZone}));
  const {regional,timeZone}=draftFormat;
  const formatChangePending=JSON.stringify(regional)!==JSON.stringify(requestedRegional)||timeZone!==requestedTimeZone;
  const inactiveObject=Boolean(definition.state&&definition.state!=='active');
  const readOnly = Boolean((record?.permissions??definition.permissions)?.edit===false||inactiveObject);
  const activeFields = definition.fields.filter(field => field.fieldPermissions?.read!==false&&(!field.state || field.state === 'active'));
  const inactiveFields = definition.fields.filter(field => field.fieldPermissions?.read!==false&&field.state === 'inactive');
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');
  const initial = () => ({ ...(hasKeyword ? { keyword: record?.keyword ?? '' } : {}), ...Object.fromEntries(activeFields.filter(f => isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(f => [f.technicalName, localizedFieldDraft(f,(record?.[f.technicalName] as FieldValue) ?? (!record&&f.technicalName==='access_principals'?[{kind:'user',id:user.id}]:null),regional)])) });
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(initial);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [applicabilityError,setApplicabilityError]=useState('');
  const [dependencyContext,setDependencyContext]=useState(()=>({applicableFieldIds:record?.applicableFieldIds,allowedStatusIds:record?.allowedStatusIds}));
  const appliesToDraft=(field:FieldDefinition,draft:Record<string,FieldValue>)=>field.applicability&&!activeFields.some(controller=>controller.id===field.applicability!.fieldId)?Boolean(dependencyContext.applicableFieldIds?.includes(field.id)):fieldApplies(field,activeFields,draft);
  const applicableFields=activeFields.filter(field=>appliesToDraft(field,values));
  const [choices, setChoices] = useState<ClassificationValues>(() => record ? { type: record.type??null, status: record.status??null, category: record.category??[] } : initialChoices(definition.classification));
  const [choiceBaseline, setChoiceBaseline] = useState(choices);
  const [showHiddenRelationships,setShowHiddenRelationships]=useState(false);
  const formRelationships=relationFields.filter(field=>(field.definition.kind==='custom'||(field.definition.kind==='primary'&&field.side==='right'))&&fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values));
  const configuredLayout=resolveFormLayout(definition.formLayouts?.default,applicableFields,true,formRelationships);
  const hiddenRelationships=formLayoutEntries(configuredLayout).filter(entry=>!('fieldId' in entry)&&entry.visible===false).length;
  const formGroups=[...configuredLayout.groups,...(configuredLayout.unassigned?.length?[{id:':unassigned',labels:{en:t('formUnassigned'),de:t('formUnassigned')},fields:configuredLayout.unassigned}]:[])];
  const layout={groups:formGroups.map(group=>({...group,fields:group.fields.filter(entry=>'fieldId' in entry||entry.visible!==false||showHiddenRelationships)}))};
  const groupLabel=(labels:Record<string,string>)=>labels[i18n.language]??labels.en??labels.de??Object.values(labels)[0]??'';

  const timestampInvalid=activeFields.some(field=>{
    const value=values[field.technicalName];if(value===null||value===undefined||value==='')return false;
    return field.kind==='datetime'?!isInstant(String(value)):field.kind==='date'?!isCalendarDate(String(value)):false;
  });
  const valuesChanged=(next:Record<string,FieldValue>)=>Object.keys(next).some(key=>!sameFieldDraft(activeFields.find(field=>field.technicalName===key),next[key]??null,baseline[key]??null,regional));
  const choicesDirty = JSON.stringify(choices) !== JSON.stringify(choiceBaseline);
  const [version, setVersion] = useState(record?.version);
  const [saved, setSaved] = useState(false),[lostAccess,setLostAccess]=useState(false);
  const dirty = relationDirty || choicesDirty || valuesChanged(values);
  const mutation = useMutation({ mutationFn: async () => {
    const data = Object.fromEntries(applicableFields.filter(f => f.fieldPermissions?.edit!==false&&isCustomFieldKind(f.kind) && f.technicalName !== 'keyword').map(f => [f.technicalName, normalizedFieldDraft(f,values[f.technicalName]??null,regional)]));
    const classification = Object.fromEntries(Object.entries(choices).filter(([key]) => activeFields.some(field => field.technicalName === key&&field.fieldPermissions?.edit!==false)));
    const keyword = hasKeyword&&activeFields.find(field=>field.technicalName==='keyword')?.fieldPermissions?.edit!==false ? { keyword: String(values.keyword ?? '').trim() } : {};
    if (record && version) return api('update_record', { objectTypeId: definition.id, recordId: record.id, version, ...keyword, values: data, classification, relationships:relationshipWrites() });
    return api('create_record', {linkFrom:linkedCreation?.linkFrom, objectTypeId: definition.id, ...keyword, values: data, classification, relationships:relationshipWrites() });
  }, onMutate: () => { onBusyChange(true); setSaved(false); }, onSuccess: async result => {
      if(result.permissions?.read===false){setLostAccess(true);onDirtyChange(false);onBusyChange(false);onAccessLost?.();queryClient.removeQueries({queryKey:['record',definition.id,result.id]});void queryClient.invalidateQueries();return;}
    const latest=await api('get_record_relationships',{objectTypeId:definition.id,recordId:result.id}).catch(()=>null);
    if(latest){setRelationFields(latest.fields);setRelationBaseline(latest.fields);queryClient.setQueryData(['record-relationships',definition.id,result.id],latest);}else setRelationBaseline(relationFields);
    void queryClient.invalidateQueries({queryKey:['record-relationships']});
    void queryClient.invalidateQueries({queryKey:['relationship-tree']});
    void queryClient.invalidateQueries({queryKey:['primary-chain-context']});
    void queryClient.invalidateQueries({queryKey:['relationship-candidates']});
    void queryClient.invalidateQueries({queryKey:['relationship-types']});
    void queryClient.invalidateQueries({queryKey:['record-link-options']});
    void queryClient.invalidateQueries({queryKey:['record']});
    void queryClient.invalidateQueries({queryKey:['system-journal']});
    setDependencyContext({applicableFieldIds:result.applicableFieldIds,allowedStatusIds:result.allowedStatusIds});
    setVersion(result.version); setBaseline({ ...values }); setChoiceBaseline(choices); onDirtyChange(false); setSaved(true);
    queryClient.setQueryData(['record', definition.id, result.id], result);
    void queryClient.invalidateQueries({ queryKey: ['records', definition.id] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-records'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['journal', definition.id, result.id] });
    onSaved(result);
  }, onSettled: () => onBusyChange(false) });
  useEffect(()=>{if(lostAccess&&!mutation.isPending)onClose();},[lostAccess,mutation.isPending,onClose]);
  function update(key: string, value: FieldValue) {
    const next = { ...values, [key]: value };
    const blocked=activeFields.filter(field=>appliesToDraft(field,values)&&!appliesToDraft(field,next)&&!emptyCustomValue(next[field.technicalName]));
    const blockedRelations=relationFields.filter(field=>field.targets.length&&fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values)&&!fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,next));
    if(blockedRelations.length){setShowHiddenRelationships(true);setApplicabilityError(t('clearInapplicableRelationships'));return;}
    if(blocked.length){setApplicabilityError(t('clearInapplicableFields',{fields:blocked.map(field=>field.label).join(', ')}));return;}
    setApplicabilityError('');setValues(next); setSaved(false);
    onDirtyChange(relationDirty || choicesDirty || valuesChanged(next));
  }
  function renderEntry(entry:FormEntry){
    if('fieldId' in entry){const field=applicableFields.find(field=>field.id===entry.fieldId);return field?renderField(field):null;}
    return <RecordRelationshipFields entry={entry} fieldDefinitions={activeFields} values={values} primaryChain={relationships.primaryChain} objectTypeId={definition.id} recordId={record?.id} fields={relationFields} disabled={mutation.isPending} readOnly={readOnly||Boolean(linkedCreation&&!record&&(('relationshipTypeId' in entry&&entry.relationshipTypeId===linkedCreation.linkFrom.relationshipTypeId)||('primary' in entry&&relationFields.some(field=>field.definition.id===linkedCreation.linkFrom.relationshipTypeId&&field.definition.kind==='primary'))))} onPickerDirtyChange={value=>onDirtyChange(value||dirty)} workspaceCode={workspaceCode} onChange={updateRelationships}/>;
  }
  function renderField(field:FieldDefinition){
    if(field.technicalName==='keyword')return <Field data-disabled={(mutation.isPending||readOnly)||undefined}><FieldLabel htmlFor="record-keyword">{field.label}{field.required?' *':''}</FieldLabel><Input id="record-keyword" value={String(values.keyword??'')} maxLength={200} required={field.required} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={event=>update('keyword',event.target.value)}/></Field>;
    if(['type','status','category'].includes(field.technicalName))return <ClassificationFields allowedStatusIds={definition.fields.some(item=>item.technicalName==='type'&&item.fieldPermissions?.read===false)?dependencyContext.allowedStatusIds:undefined} fields={[field]} config={definition.classification} value={choices} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={next=>{setChoices(next);setSaved(false);onDirtyChange(relationDirty||JSON.stringify(next)!==JSON.stringify(choiceBaseline)||valuesChanged(values));}}/>;
    return <CustomFieldControl field={field} value={values[field.technicalName]??null} workspaceId={definition.workspaceId} objectTypeId={definition.id} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={value=>update(field.technicalName,value)}/>;
  }
  useEffect(() => { document.querySelector<HTMLElement>('[data-record-page-title]')?.focus(); }, [recordId]);
  const title = record ? record.keyword || record.id : t('newRecord');
  const missingFields = [
    ...applicableFields.filter(field => isCustomFieldKind(field.kind) && field.required && emptyCustomValue(values[field.technicalName])).map(field => field.label),
    ...(['type', 'status', 'category'] as const).filter(kind => activeFields.some(field => field.kind === kind) && definition.classification[kind].required && (kind === 'category' ? !choices.category.length : !choices[kind])).map(kind => t(kind === 'type' ? 'classificationType' : kind === 'status' ? 'classificationStatus' : 'classificationCategory')),
    ...relationFields.filter(field => fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values) && field.definition.active && field.targets.length < (field.side === 'left' ? field.definition.leftMin : field.definition.rightMin)).map(field => {
      const labels: Record<string, string | undefined> = field.side === 'left' ? field.definition.leftLabels : field.definition.rightLabels;
      return labels[i18n.language] ?? labels.en ?? labels.de ?? Object.values(labels)[0];
    }),
  ];
  const linkedField=linkedCreation?relationFields.find(field=>field.definition.id===linkedCreation.linkFrom.relationshipTypeId&&field.targets.some(target=>target.objectTypeId===linkedCreation.source.objectTypeId&&target.recordId===linkedCreation.source.recordId)):undefined;
  const linkedRule=linkedField?(linkedField.side==='left'?linkedField.definition.leftApplicability:linkedField.definition.rightApplicability):undefined;
  const linkedConditionInvalid=Boolean(linkedCreation&&!record&&linkedRule&&!fieldApplies({applicability:linkedRule},activeFields,values));
  const invalid = linkedConditionInvalid||timestampInvalid || missingFields.length > 0 || applicableFields.some(field=>Boolean(numericDraftError(field,values[field.technicalName]??null,regional)));
  useEffect(()=>{
    if(!formatChangePending||mutation.isPending||timestampInvalid)return;
    const next=reformatNumericDrafts(activeFields,values,regional,requestedRegional);
    const previous=reformatNumericDrafts(activeFields,baseline,regional,requestedRegional);
    if(!next||!previous)return;
    setValues(next);setBaseline(previous);setDraftFormat({regional:requestedRegional,timeZone:requestedTimeZone});
  },[formatChangePending,requestedRegional,requestedTimeZone,regional,activeFields,values,baseline,timestampInvalid,mutation.isPending]);
  function reset() {setApplicabilityError('');setRelationFields(relationBaseline); setValues({ ...baseline }); setChoices(choiceBaseline); setSaved(false); mutation.reset(); onDirtyChange(false); }
  const linkSourceValues=Object.fromEntries(relationFields.flatMap(field=>{const rule=field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability;const controller=activeFields.find(item=>item.id===rule?.fieldId);return controller?[[controller.technicalName,values[controller.technicalName]??null]]:[];}));
  const updateRelationships = (next: typeof relationFields) => {
    setRelationFields(next);setSaved(false);
    onDirtyChange(JSON.stringify(next)!==JSON.stringify(relationBaseline)||choicesDirty||valuesChanged(values));
  };
  if(lostAccess)return <ErrorNotice error={new Error(t('contentAccessDenied'))}/>;
  return <RegionalProvider value={regional}><TimeZoneProvider value={timeZone}><form id="record-form" data-shortcut-submit className="flex w-full min-w-0 flex-col gap-6 pb-6" onSubmit={event => { event.preventDefault(); if (tab === 'details' && !readOnly && !formatChangePending && !invalid && (!record || dirty) && !mutation.isPending) mutation.mutate(); }}>
    <header className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="ghost" className="w-fit -ml-2" disabled={mutation.isPending} onClick={onClose}><ArrowLeftIcon data-icon="inline-start" />{t(returnToSource?'backToSource':'backToOverview')}</Button>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{definition.label}</Badge>{record&&!readOnly?<RecordLinkActions source={{objectTypeId:definition.id,recordId:record.id,keyword:record.keyword,objectTechnicalName:definition.technicalName,objectLabels:definition.labels,state:'active'}} version={version!} fields={relationFields} sourceValues={linkSourceValues} workspaceCode={workspaceCode} disabled={mutation.isPending} dirty={dirty||formatChangePending} onPickerDirtyChange={value=>onDirtyChange(value||dirty)} onApply={(field,targets)=>{updateRelationships(relationFields.map(item=>item===field?{...item,targets}:item));setTab('details');}}/>:null}{readOnly?<Badge variant="outline">{t(inactiveObject?'definition_inactive':'readOnly')}</Badge>:null}</div></div>
      <h1 data-record-page-title tabIndex={-1} className="wrap-anywhere text-2xl font-semibold outline-none">{title}</h1>
      <p className="text-sm text-muted-foreground">{t(inactiveObject?'inactiveObjectHelp':readOnly?'recordReadOnlyHelp':record?'recordDetails':'newRecordDescription')}</p>
    </header>
    {linkedCreation&&!record?<Alert><AlertDescription>{t('linkedRecordContext',{relationship:groupLabel(linkedCreation.labels),source:linkedCreation.source.keyword})}{linkedConditionInvalid?<p>{t('linkedRecordConditionHelp',{field:activeFields.find(field=>field.id===linkedRule?.fieldId)?.label??t('fieldName')})}</p>:null}</AlertDescription></Alert>:null}
    {formatChangePending?<Alert><AlertDescription>{t('regionalFormatChangePending')}</AlertDescription></Alert>:null}
    {dirty?<Alert><AlertDescription role="status" className="flex flex-wrap items-center justify-between gap-2">{t('recordDraftPending')}{tab!=='details'?<Button type="button" variant="outline" size="sm" onClick={()=>setTab('details')}>{t('keepEditing')}</Button>:null}</AlertDescription></Alert>:null}
    <Tabs value={tab==='tree'&&!treeAvailable?'details':tab} onValueChange={value=>{setTab(value);if(value==='dossier')void queryClient.invalidateQueries({queryKey:['record-relationships',definition.id,recordId]});}} className="gap-4"><TabsList variant="line" aria-label={t('recordSections')} className="max-w-full"><TabsTrigger value="details">{t('details')}</TabsTrigger>{record?<>{treeAvailable?<TabsTrigger value="tree">{t('recordTree')}</TabsTrigger>:null}<TabsTrigger value="dossier">{t('recordDossier')}</TabsTrigger><TabsTrigger value="journal">{t('journal')}</TabsTrigger></>:null}</TabsList>
    <TabsContent value="details" keepMounted className="flex w-full min-w-0 flex-col gap-6 data-[hidden]:hidden">
      {applicabilityError?<Alert variant="destructive"><AlertDescription role="alert">{applicabilityError}</AlertDescription></Alert>:null}
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      {mutation.error instanceof ApiError && mutation.error.status === 409 ? <Button variant="outline" type="button" onClick={() => { if(linkedCreation)onClose();else window.location.reload(); }}>{t(linkedCreation?'backToSource':'reload')}</Button> : null}
      {linkedCreation&&mutation.error instanceof ApiError&&mutation.error.status===409?<FieldDescription>{t('linkedRecordConflict')}</FieldDescription>:null}
      {saved ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
      {!record?<FieldDescription>{t('recordCreateHelp')}</FieldDescription>:null}
      {hiddenRelationships?<Button type="button" variant="outline" className="self-start" onClick={()=>setShowHiddenRelationships(value=>!value)}>{t(showHiddenRelationships?'formHideOptionalRelationships':'formShowOptionalRelationships',{count:hiddenRelationships})}</Button>:null}
      {layout.groups.filter(group=>group.fields.length).map(group=><SettingsSection key={group.id}><FieldSet className="min-w-0"><FieldLegend>{groupLabel(group.labels)}</FieldLegend><FieldGroup className="grid min-w-0 items-start gap-6 md:grid-cols-2">{group.fields.map(entry=>{return <div key={formEntryKey(entry)} className={entry.width==='full'?'min-w-0 md:col-span-2':'min-w-0'}>{renderEntry(entry)}</div>;})}</FieldGroup></FieldSet></SettingsSection>)}
      {record && inactiveFields.length ? <Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/record-inactive" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-4 py-3"/>}>{t('inactiveFields')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/record-inactive:rotate-180"/></CollapsibleTrigger><CollapsibleContent><Separator/><FieldSet className="p-4"><FieldLegend className="sr-only">{t('inactiveFields')}</FieldLegend><FieldGroup>
        {inactiveFields.filter(field => isCustomFieldKind(field.kind)).map(field => <CustomFieldControl key={field.id} field={field} value={localizedFieldDraft(field,record[field.technicalName] as FieldValue ?? null,regional)} workspaceId={definition.workspaceId} disabled onChange={() => {}} />)}
        <ClassificationFields fields={inactiveFields} config={definition.classification} value={{ type: record.type??null, status: record.status??null, category: record.category??[] }} disabled onChange={() => {}} />
      </FieldGroup></FieldSet></CollapsibleContent></Collapsible> : null}
      {record ? <Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/record-tech" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-4 py-3" />}>{t('journalTechnicalDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/record-tech:rotate-180" /></CollapsibleTrigger><CollapsibleContent><Separator/><div className="p-4"><dl className="grid gap-4 sm:grid-cols-2">{[[t('entityId'), record.id], [t('technicalName'), definition.technicalName], [t('recordVersion'), String(version)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="wrap-anywhere">{value}</dd></div>)}</dl></div></CollapsibleContent></Collapsible> : null}
    </TabsContent><TabsContent value="tree">{record&&treeAvailable?<RecordTree objectTypeId={definition.id} recordId={record.id} workspaceCode={workspaceCode}/>:null}</TabsContent><TabsContent value="dossier">{record?<RecordDossier data={relationships} recordId={record.id} workspaceCode={workspaceCode}/>:null}</TabsContent><TabsContent value="journal" className="flex flex-col gap-6">{record ? <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('recordHistorySummary')}>{[[t('createdAt'), formatRegionalDate(record.created_at, regional, timeZone, true)], [t('createdBy'), userName(record.created_by)], [t('updated'), formatRegionalDate(record.updated_at, regional, timeZone, true)], [t('changedBy'), userName(record.updated_by)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="wrap-anywhere">{value}</dd></div>)}</dl>
      <Separator />
      <Journal definition={definition} recordId={record.id} user={user} record={record} workspaceName={workspaceName} />
    </> : null}</TabsContent></Tabs>
    {!readOnly&&tab==='details'?<footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3" aria-label={t('recordFormActions')}>
      <FieldDescription className="w-full min-w-0 wrap-anywhere sm:w-auto sm:flex-1">{missingFields.length?t('recordMissingFields',{fields:missingFields.slice(0,3).join(', '),remaining:missingFields.length>3?t('recordMoreFields',{count:missingFields.length-3}):''}):timestampInvalid?t('recordIncomplete'):dirty?t('recordUnsaved'):t(record?'recordUpToDate':'recordCreateActionHelp')}</FieldDescription>
      <div className="ml-auto flex flex-wrap items-center gap-2">{record ? <Button type="button" variant="outline" disabled={(!dirty&&!applicabilityError&&!mutation.isError) || mutation.isPending} onClick={reset}><RotateCcwIcon data-icon="inline-start" />{t('resetPreferences')}</Button> : null}<Button type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={mutation.isPending || formatChangePending || invalid || Boolean(record && !dirty)}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{mutation.isPending ? t('saving') : t(record ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></div>
    </footer>:null}
  </form></TimeZoneProvider></RegionalProvider>;

}

function Journal({ definition, recordId, user, record, workspaceName }: { definition: ObjectDefinition; recordId: string; user: AuthUser; workspaceName: string; record: DataRecord }) {
  const { t, i18n } = useTranslation();
  const regional=useRegional(),timeZone=useTimeZone();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const [fieldId,setFieldId]=useState('all'),[kind,setKind]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
  const allFields=[...definition.fields,...(definition.historicalFields??[])];
  const result = useQuery({ placeholderData:keepPreviousData, queryKey: ['journal', definition.id, recordId,fieldId,kind,page,pageSize], queryFn: () => api('list_record_journal', { objectTypeId: definition.id, recordId,fieldId:fieldId==='all'?undefined:fieldId,entityKind:kind==='all'?undefined:kind as 'record'|'relationship',offset:(page-1)*pageSize,limit:pageSize }) });
  const fields=[{value:'all',label:t('journalAllFields')},...allFields.map(field=>({value:field.id,label:field.label})).sort((a,b)=>a.label.localeCompare(b.label,i18n.language))];
  const kinds=[{value:'all',label:t('journalAllChanges')},{value:'record',label:t('journalFieldChanges')},{value:'relationship',label:t('recordRelationships')}];
  const filters=<FieldGroup className="w-full gap-4 sm:flex-row sm:items-end sm:max-w-xl"><Field><FieldLabel htmlFor="record-journal-kind">{t('recordJournalChangeFilter')}</FieldLabel><Select items={kinds} value={kind} onValueChange={value=>{if(value){setKind(value);setFieldId('all');setPage(1);}}}><SelectTrigger id="record-journal-kind" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{kinds.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  {kind!=='relationship'?<Field><FieldLabel htmlFor="record-journal-field">{t('field')}</FieldLabel><Select items={fields} value={fieldId} onValueChange={value=>{if(value){setFieldId(value);setPage(1);}}}><SelectTrigger id="record-journal-field" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{fields.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>:null}</FieldGroup>;
  const entries=(result.data?.entries??[]).map(entry=>{
    const field=allFields.find(field=>field.id===entry.field_id);
    return {...entry,entity_kind:entry.entity_kind??'record',entity_id:entry.entity_id??recordId,workspace_id:definition.workspaceId,workspace_name:workspaceName,object_type_name:definition.label,actor_name:entry.actor_name??(entry.actor_id===user.id?user.name:entry.actor_id),entity_name:record.keyword||record.id,field_label:field?.label??entry.field_key};
  });
  function renderValue(entry:JournalEntry,value:unknown,side:'before'|'after') {
    const field=allFields.find(field=>field.id===entry.field_id);
    if(!field)return undefined;
    if(value===null||value===undefined)return t('journalNotSet');
    if(['type','status','category'].includes(field.kind))return displayClassification(definition.classification,field.kind,value);
    const context=entry.value_context?.[side];
    return displayFieldValue(context?{...field,kind:context.kind as typeof field.kind,config:context.config}:field,value,i18n.language,t,principals.data??[],timeZone,regional);
  }
  return <RecordJournalTable preferenceKey={`record-journal:${definition.workspaceId}`} entries={entries} filters={filters} renderValue={renderValue} total={result.data?.total??0} page={page} pageSize={pageSize} busy={result.isFetching} loading={result.isPending} error={result.isError?result.error:undefined} onRetry={()=>{void result.refetch();}} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}} />;
}
