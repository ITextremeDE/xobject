import {ContactConversionDialog} from './contact-conversion-dialog';
import {ContactInheritanceControl} from './contact-inheritance-field';
import type {ContactInheritanceField,ContactInheritanceWrite} from '@xobject/contracts';
import {useTransientDraftPending} from '@/lib/transient-draft';
import {DraftConflicts} from './draft-conflicts';
import {displayFieldValue} from '@/lib/field-display';
import {RecordShareItems} from './record-share-items';
import {notifySuccess} from '@/lib/notifications';
import {CopyRecordIdItem} from './record-row-actions';
import {isReadableRecord} from '@xobject/contracts';
import {RecordPageHeader,RecordPageFooter,RecordSectionTabs,recordPageClassName} from './record-page-frame';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './ui/dropdown-menu';
import {localizedRelationshipFields,reformatRelationshipFields,retainRelationshipAttributes} from '@/lib/relationship-selection';
import {ContactMediaPreparation} from './contact-media-preparation';
import {ContactCoreGroups} from './contact-core-groups';
import {contactKindLabel} from '@/lib/contact-kind';
import {contactLetterSalutation,contactKindOrder,contactCoreFieldIds,contactCoreEntry,contactCoreLayout,contactExtensionLayout} from '@xobject/contracts';
import {useSearchParams} from 'react-router';
import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';
import {workIssues,taskCompletionProposal,applyFieldDefaults,parseStructuredValue,contactIssues,contactRequiredFields} from '@xobject/contracts';
import {RecordFormGroups} from './record-form-groups';
import {RecordLifecycleAction} from './record-lifecycle-action';
import {useNavigate} from 'react-router';
import {RecordAccessField} from './record-access-field';
import {sameRecordSecurity,validRecordSecurityDraft} from '@/lib/record-access';
import {RecordSecurityDialog} from './record-security';
import {isCalendarDate} from '@/lib/temporal-input';
import {SettingsSection} from './settings-section';
import {RecordPageLoading} from './loading';
import {resolveFormLayout,formLayoutEntries,type FormEntry,type FieldDefinition} from '@xobject/contracts';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeftIcon, ArrowLeftIcon, RotateCcwIcon, SaveIcon, ChevronDownIcon, CopyIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { fieldApplies, isCustomFieldKind, type FieldValue, type AuthUser, type DataRecord, type ObjectDefinition, type RecordRelationships } from '@xobject/contracts';
import {Journal} from './record-journal';
import { api, ApiError,blocksCachedView } from '@/lib/api';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend,FieldError, FieldDescription } from '@/components/ui/field';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from './ui/input-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClassificationFields, initialChoices, type ClassificationValues } from './classification-values';
import { CustomFieldControl, emptyCustomValue } from './custom-field-control';
import { ErrorNotice } from './feedback';

type DuplicateDraft=import('@xobject/contracts').Outputs['get_record_duplicate'];
type SecuritySnapshot=import('@xobject/contracts').Outputs['get_record_security'];
type Props = {
  duplicateDraft?:DuplicateDraft;returnToSource?:boolean;linkedCreation?:LinkedCreation;definition: ObjectDefinition; recordId: string; user: AuthUser; workspaceName: string; workspaceCode: string;
  onClose: () => void;onAccessLost?:()=>void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
  onSaved: (record: DataRecord) => void;
};
export function RecordPage(props: Props) {
  const { t,i18n } = useTranslation();
  const [params,setParams]=useSearchParams();
  const duplicateSource=props.recordId==='new'?params.get('duplicateFrom'):null;
  const draft=useQuery({queryKey:['record-duplicate',props.definition.id,duplicateSource],queryFn:()=>api('get_record_duplicate',{objectTypeId:props.definition.id,recordId:duplicateSource!}),enabled:Boolean(duplicateSource),staleTime:Infinity,retry:false});
  const draftKindField=props.definition.fields.find(field=>field.id===props.definition.contactProfile?.fields.contact_kind);
  const contactKind=duplicateSource&&draftKindField?String(draft.data?.values[draftKindField.technicalName]??''):params.get('contactKind');
  const record = useQuery({ queryKey: ['record', props.definition.id, props.recordId],
    queryFn: () => api('get_record', { objectTypeId: props.definition.id, recordId: props.recordId }), enabled: props.recordId !== 'new' });
  const security=useQuery({queryKey:['record-security',props.definition.id,props.recordId],queryFn:()=>api('get_record_security',{objectTypeId:props.definition.id,recordId:props.recordId}),enabled:props.definition.sensitive===true&&props.recordId!=='new'});
  const newOwners=useQuery({queryKey:['access-principals',props.definition.id],queryFn:()=>api('list_access_principals',{objectTypeId:props.definition.id}),enabled:props.definition.sensitive===true&&props.recordId==='new'&&props.definition.permissions?.full===true});
  const relationships=useQuery({queryKey:['record-relationships',props.definition.id,props.recordId],queryFn:()=>api('get_record_relationships',{objectTypeId:props.definition.id,recordId:props.recordId==='new'?undefined:props.recordId})});
  const kindField=props.definition.fields.find(field=>field.id===props.definition.contactProfile?.fields.contact_kind);
  const loadingApplicable=record.data?.applicableFieldIds;
  const loadingValues=record.data??draft.data?.values??(kindField&&contactKind?{[kindField.technicalName]:contactKind}:undefined);
  if(duplicateSource&&blocksCachedView(draft))return <ErrorNotice error={draft.error} retry={()=>{void draft.refetch();}}/>;
  if(duplicateSource&&draft.isPending)return <RecordPageLoading definition={props.definition} isNew/>;
  if (relationships.isPending) return <RecordPageLoading values={loadingValues as Record<string,FieldValue>|undefined} applicableFieldIds={loadingApplicable} definition={props.definition} isNew={props.recordId==='new'}/>;
  if (blocksCachedView(relationships)) return <ErrorNotice error={relationships.error} retry={()=>{void relationships.refetch();}}/>;
  if (props.recordId !== 'new' && record.isPending) return <RecordPageLoading values={loadingValues as Record<string,FieldValue>|undefined} applicableFieldIds={loadingApplicable} definition={props.definition} treeAvailable={Boolean(relationships.data!.primaryChain)}/>;
  if (blocksCachedView(record)) return <FieldGroup><Button type="button" variant="outline" className="w-fit" onClick={props.onClose}><ArrowLeftIcon data-icon="inline-start" />{t(props.returnToSource?'backToSource':'backToOverview')}</Button><ErrorNotice error={record.error} retry={() => { void record.refetch(); }} /></FieldGroup>;
  const sensitive=props.definition.sensitive===true,isNew=props.recordId==='new';
  if(sensitive&&(!isNew?security.isPending:props.definition.permissions?.full&&newOwners.isPending))return <RecordPageLoading values={loadingValues as Record<string,FieldValue>|undefined} applicableFieldIds={loadingApplicable} definition={props.definition} isNew={isNew} treeAvailable={Boolean(relationships.data!.primaryChain)}/>;
  if(sensitive&&(blocksCachedView(security)||blocksCachedView(newOwners)))return <ErrorNotice error={security.error??newOwners.error}/>;
  const newPolicy:import('@xobject/contracts').RecordSecurity={owners:[{kind:'user',id:props.user.id,level:'full'}],publicLevel:null,privacy:'normal',foreignMax:'full',fields:[]};
  const accessSnapshot:SecuritySnapshot|undefined=sensitive?(isNew?{policy:newPolicy,version:1,canManage:props.definition.permissions?.full===true,effective:{level:props.definition.permissions?.full?'full':props.definition.permissions?.delete?'delete':props.definition.permissions?.edit?'edit':props.definition.permissions?.schedule?'schedule':props.definition.permissions?.duplicate?'duplicate':props.definition.permissions?.read?'read':'none',source:props.user.isAdmin?'administrator':'ownership',path:[`user:${props.user.id}`]},principals:[...(newOwners.data??[]).filter(person=>person.id!==props.user.id).map(person=>({...person,active:true,assignable:true})),{kind:'user',id:props.user.id,name:props.user.name,active:true,assignable:true}],fieldAccess:Object.fromEntries(props.definition.fields.map(field=>[field.id,{read:field.fieldPermissions?.create===true,edit:field.fieldPermissions?.create===true}]))}:security.data):undefined;
  const seededLink=props.linkedCreation?seedLinkedFields(relationships.data!.fields,props.linkedCreation).find(field=>field.definition.id===props.linkedCreation!.linkFrom.relationshipTypeId&&field.targets.some(target=>target.recordId===props.linkedCreation!.source.recordId)):undefined;
  const kindRule=seededLink?(seededLink.side==='left'?seededLink.definition.leftApplicability:seededLink.definition.rightApplicability):undefined;
  const availableKinds=contactKindOrder.filter(key=>!kindRule||kindRule.fieldId!==props.definition.contactProfile?.fields.contact_kind||kindRule.optionIds.includes(props.definition.contactProfile!.kinds[key]));
  if(isNew&&props.definition.contactProfile&&!availableKinds.some(key=>props.definition.contactProfile!.kinds[key]===contactKind))return <SettingsSection><h1 className="text-2xl font-semibold">{t('contactChooseKind')}</h1><FieldDescription>{t('contactChooseKindHelp')}</FieldDescription><div className="flex flex-wrap gap-3">{availableKinds.map(kind=><Button key={kind} type="button" variant="outline" onClick={()=>{const next=new URLSearchParams(params);next.set('contactKind',props.definition.contactProfile!.kinds[kind]);setParams(next,{replace:true});}}>{contactKindLabel(props.definition,kind,i18n.language,t(`contactKind_${kind}`))}</Button>)}</div><Button type="button" variant="ghost" className="self-start" onClick={props.onClose}>{t('cancel')}</Button></SettingsSection>;
  const refreshFailed=[record,relationships,security].some(query=>query.isError)&&navigator.onLine;
  return <>{refreshFailed?<Alert role="status"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t('liveRefreshFailed')}</span><Button type="button" size="sm" variant="outline" onClick={()=>{void record.refetch();void relationships.refetch();if(props.definition.sensitive)void security.refetch();}}>{t('retry')}</Button></AlertDescription></Alert>:null}<RecordForm duplicateDraft={draft.data} accessSnapshot={accessSnapshot} key={`${props.recordId}:${isNew?contactKind??'':''}:${duplicateSource??''}`} {...props} definition={{...props.definition,fields:props.definition.fields.map(f=>({...f,fieldPermissions:props.recordId==='new'?{create:f.fieldPermissions?.create,read:f.isDerived?props.definition.permissions?.create===true:f.fieldPermissions?.create===true,edit:!f.isDerived&&f.fieldPermissions?.create===true}:{read:record.data?.fieldAccess?.[f.id]?.read??false,edit:record.data?.fieldAccess?.[f.id]?.edit??false,create:f.fieldPermissions?.create}}))}} record={record.data} relationships={relationships.data!} /></>;
}

function RecordForm({ duplicateDraft,accessSnapshot,returnToSource,linkedCreation,definition, record, recordId, user, workspaceName, workspaceCode, relationships, onClose, onAccessLost, onDirtyChange, onBusyChange, onSaved }: Props & { accessSnapshot?:SecuritySnapshot;record?: DataRecord; relationships:RecordRelationships }) {
  const { t, i18n } = useTranslation();
  const [params]=useSearchParams();
  const queryClient = useQueryClient(),navigate=useNavigate();
  const pickerDirty=useTransientDraftPending();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const userName = (id: string) => id === user.id ? user.name : principals.data?.find(principal => principal.kind === 'user' && principal.id === id)?.name ?? id;
  const requestedRegional=useRegional(),requestedTimeZone=useTimeZone();
  const [draftFormat,setDraftFormat]=useState(()=>({regional:requestedRegional,timeZone:requestedTimeZone}));
  const {regional,timeZone}=draftFormat;
  const formatChangePending=JSON.stringify(regional)!==JSON.stringify(requestedRegional)||timeZone!==requestedTimeZone;
  const [relationFields,setRelationFields]=useState(()=>localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));
  const [relationBaseline,setRelationBaseline]=useState(()=>localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));
  const relationDirty=JSON.stringify(relationFields)!==JSON.stringify(relationBaseline);
  useEffect(()=>{if(!relationDirty){setRelationFields(localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));setRelationBaseline(localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));}},[relationships,relationDirty]);
  const relationshipWrites=()=>relationFields.filter(field=>field.editable!==false&&(!record||JSON.stringify(field.targets)!==JSON.stringify(relationBaseline.find(item=>item.definition.id===field.definition.id&&item.side===field.side)?.targets))).map(field=>({relationshipTypeId:field.definition.id,version:field.definition.version,side:field.side,targets:field.targets.map(({objectTypeId,recordId})=>({objectTypeId,recordId}))}));
  const relationshipAttributes=()=>relationFields.flatMap(field=>field.targets.flatMap(target=>{
    const before=relationBaseline.find(f=>f.definition.id===field.definition.id&&f.side===field.side)?.targets.find(t=>t.objectTypeId===target.objectTypeId&&t.recordId===target.recordId);
    const values=Object.fromEntries(Object.entries(target.attributeValues??{}).filter(([id,value])=>target.attributeAccess?.[id]?.edit!==false&&JSON.stringify(value)!==JSON.stringify(before?.attributeValues?.[id]??null)));
    return Object.keys(values).length?[{relationshipTypeId:field.definition.id,definitionVersion:field.definition.version,target:{objectTypeId:target.objectTypeId,recordId:target.recordId},edgeId:target.edgeId,version:target.edgeVersion,values:Object.fromEntries(Object.entries(values).map(([id,value])=>[id,normalizedFieldDraft(field.definition.fields!.find(f=>f.id===id)!,value,regional)]))}]:[];
  }));
  const [accessOpen,setAccessOpen]=useState(false);
  const [securityBaseline,setSecurityBaseline]=useState(accessSnapshot?.policy),[securityDraft,setSecurityDraft]=useState(accessSnapshot?.policy),[securityConfirmed,setSecurityConfirmed]=useState(false),[accessDetailDirty,setAccessDetailDirty]=useState(false);
  const securityDirty=Boolean(securityBaseline&&securityDraft&&!sameRecordSecurity(securityBaseline,securityDraft));
  const securityValid=!securityBaseline||!securityDraft||validRecordSecurityDraft(securityBaseline,securityDraft,securityConfirmed);
  const [tab, setTab] = useState('details');
  const treeAvailable=Boolean(relationships.primaryChain);
  useEffect(()=>{if(!treeAvailable&&tab==='tree')setTab('details');},[treeAvailable,tab]);
  const inactiveObject=Boolean(definition.state&&definition.state!=='active');
  const readOnly = Boolean((record?record.permissions?.edit!==true:definition.permissions?.create!==true)||inactiveObject);
  const activeFields = definition.fields.filter(field => field.technicalName!=='access_principals'&&field.fieldPermissions?.read!==false&&(!field.state || field.state === 'active'));
  const inactiveFields = definition.fields.filter(field => field.technicalName!=='access_principals'&&field.fieldPermissions?.read!==false&&field.state === 'inactive');
  const hasKeyword = activeFields.some(field => field.technicalName === 'keyword');
  const kindField=activeFields.find(field=>field.id===definition.contactProfile?.fields.contact_kind);
  const selectedKind=duplicateDraft&&kindField?String(duplicateDraft.values[kindField.technicalName]??''):definition.contactProfile&&Object.values(definition.contactProfile.kinds).includes(params.get('contactKind')??'')?params.get('contactKind'):null;
  const newDefaults=record?{}:applyFieldDefaults(activeFields,{...(kindField&&selectedKind?{[kindField.technicalName]:selectedKind}:{}),...duplicateDraft?.values,...(duplicateDraft?.keyword!==undefined?{keyword:duplicateDraft.keyword}:{})});
  const kindValue=record&&kindField?record[kindField.technicalName]:selectedKind;
  const organizationTarget=relationFields.find(f=>f.definition.id===definition.contactProfile?.relationships.contact_person&&f.side==='right')?.targets[0];
  const organizationSource=useQuery({queryKey:['record',definition.id,organizationTarget?.recordId],queryFn:()=>api('get_record',{objectTypeId:definition.id,recordId:organizationTarget!.recordId}),enabled:!record&&Boolean(organizationTarget)});
  const inheritanceFields:ContactInheritanceField[]=record?.contactInheritance??(kindValue===definition.contactProfile?.kinds.person?['organization_name','organization_commercial_register'].flatMap(purpose=>{
    const field=activeFields.find(f=>f.id===definition.contactProfile?.fields[purpose]);if(!field)return [];
    const sourceField=definition.fields.find(f=>f.id===definition.contactProfile?.fields[purpose==='organization_name'?'company_name':'commercial_register']);
    const source=organizationSource.data,readable=Boolean(source&&sourceField&&Object.hasOwn(source,sourceField.technicalName));
    const own=duplicateDraft?.contactInheritance?.find(w=>w.fieldId===field.id&&w.mode==='own');
    const value=readable?String(source![sourceField!.technicalName]??'')||null:null;
    return [{fieldId:field.id,mode:own?.mode??'inherit',value:own?.mode==='own'?own.value:value,inheritedValue:value,canEdit:field.fieldPermissions?.create===true,...(readable?{source:{recordId:source!.id,version:source!.version,keyword:source!.keyword}}:{})}];
  }):[]);
  const kindKey=definition.contactProfile?contactKindOrder.find(key=>definition.contactProfile!.kinds[key]===kindValue):undefined;
  const initial = () => ({ ...(hasKeyword ? { keyword: record?record.keyword:(newDefaults.keyword??'') } : {}), ...Object.fromEntries(activeFields.filter(f => isCustomFieldKind(f.kind) && !['keyword','record_number'].includes(f.technicalName)).map(f => [f.technicalName, localizedFieldDraft(f,(record?record[f.technicalName]:newDefaults[f.technicalName]) as FieldValue ?? null,regional)])) });
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(initial);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [validatedFields,setValidatedFields]=useState<Set<string>>(()=>new Set());
  const [submitAttempted,setSubmitAttempted]=useState(false);
  const [touchedDefaults,setTouchedDefaults]=useState<Set<string>>(()=>new Set());
  const [applicabilityError,setApplicabilityError]=useState('');
  const [dependencyContext,setDependencyContext]=useState(()=>({applicableFieldIds:record?.applicableFieldIds,allowedStatusIds:record?.allowedStatusIds}));
  const appliesToDraft=(field:FieldDefinition,draft:Record<string,FieldValue>)=>field.applicability&&!activeFields.some(controller=>controller.id===field.applicability!.fieldId)?Boolean(dependencyContext.applicableFieldIds?.includes(field.id)):fieldApplies(field,activeFields,draft);
  const applicableFields=activeFields.filter(field=>appliesToDraft(field,values));
  // Missing or hidden source values must never be interpreted as empty business data.
  const contactSourcesKnown=Boolean(definition.contactProfile&&['contact_kind','company_name','last_name'].every(purpose=>activeFields.some(field=>field.id===definition.contactProfile!.fields[purpose]&&field.fieldPermissions?.read!==false)));
  const contactRequired=contactSourcesKnown?contactRequiredFields(definition.contactProfile,activeFields,values):[];
  const contactValidation=contactSourcesKnown?contactIssues(definition.contactProfile,activeFields,values).filter(issue=>activeFields.some(field=>field.id===issue.fieldId&&field.fieldPermissions?.edit!==false)):[];

  const [choices, setChoices] = useState<ClassificationValues>(() => record ? { type: record.type??null, status: record.status??null, category: record.category??[] } : {...initialChoices(definition.classification),...duplicateDraft?.classification});
  const [choiceBaseline, setChoiceBaseline] = useState(choices);
  const workSourcesKnown=Object.values(definition.workProfile?.fields??{}).every(id=>activeFields.some(f=>f.id===id&&f.fieldPermissions?.read!==false))&&activeFields.some(f=>f.kind==='status'&&f.fieldPermissions?.read!==false);
  const workValidation=workSourcesKnown?workIssues(definition.workProfile,activeFields,{...values,...choices},definition.classification):[];
  const [showHiddenRelationships,setShowHiddenRelationships]=useState(false);
  const formRelationships=relationFields.filter(field=>(field.definition.kind==='custom'||(field.definition.kind==='primary'&&field.side==='right'))&&fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values));
  const accessField=accessSnapshot?definition.fields.find(field=>field.technicalName==='access_principals'&&field.state==='active'):undefined;
  const layoutFields=[...applicableFields,...(accessField?[accessField]:[])];
  const coreIds=definition.contactProfile?contactCoreFieldIds(definition.contactProfile,definition.fields):new Set<string>();
  const extraFields=layoutFields.filter(field=>!coreIds.has(field.id)),extraRelationships=definition.contactProfile?formRelationships.filter(r=>!Object.values(definition.contactProfile!.relationships).includes(r.definition.id)):formRelationships;
  const configuredLayout=definition.contactProfile?resolveFormLayout(contactExtensionLayout(definition.contactProfile,definition.fields,definition.formLayouts?.default),extraFields,true,extraRelationships):resolveFormLayout(definition.formLayouts?.default,layoutFields,true,formRelationships);
  const coreLayout=definition.contactProfile?contactCoreLayout(definition.contactProfile,applicableFields,formRelationships):undefined;
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
  const duplicate=()=>{queryClient.removeQueries({queryKey:['record-duplicate',definition.id,record!.id]});void navigate(`/w/${workspaceCode}/objects/${definition.technicalName}/new?duplicateFrom=${record!.id}`,{state:{recordOrigin:`/w/${workspaceCode}/objects/${definition.technicalName}/${record!.id}`}});};
  const [conversionOpen,setConversionOpen]=useState(false);
  const [inheritanceDraft,setInheritanceDraft]=useState<ContactInheritanceWrite>(duplicateDraft?.contactInheritance??[]);
  const [inheritanceBaseline,setInheritanceBaseline]=useState(inheritanceFields);
  const inheritedWrites=inheritanceDraft.filter(write=>{const old=inheritanceBaseline.find(f=>f.fieldId===write.fieldId);return old?.mode!==write.mode||write.mode==='own'&&write.value!==old.value;});
  const editInheritance=(write:ContactInheritanceWrite[number])=>setInheritanceDraft(old=>[...old.filter(w=>w.fieldId!==write.fieldId),write]);
  const [lostAccess,setLostAccess]=useState(false);
  const dirty = Boolean(duplicateDraft&&!record) || relationDirty || choicesDirty || valuesChanged(values)||securityDirty||inheritedWrites.length>0;
  useEffect(()=>()=>onDirtyChange(false),[onDirtyChange]);
  useEffect(()=>onDirtyChange(dirty||accessDetailDirty),[dirty,accessDetailDirty,onDirtyChange]);
  const mutation = useMutation({ mutationFn: async () => {
    const data = Object.fromEntries(applicableFields.filter(f => f.fieldPermissions?.edit!==false&&isCustomFieldKind(f.kind) && !['keyword','record_number'].includes(f.technicalName)).map(f => [f.technicalName, normalizedFieldDraft(f,values[f.technicalName]??null,regional)]));
    const classification = Object.fromEntries(Object.entries(choices).filter(([key]) => activeFields.some(field => field.technicalName === key&&field.fieldPermissions?.edit!==false)));
    const keyword = hasKeyword&&activeFields.find(field=>field.technicalName==='keyword')?.fieldPermissions?.edit!==false ? { keyword: String(values.keyword ?? '').trim() } : {};
    const security=securityDraft&&(securityDirty||!record&&accessSnapshot?.canManage)?{security:{policy:securityDraft,confirmPublic:securityConfirmed}}:{};
    if (record && version) return api('update_record', { objectTypeId: definition.id, recordId: record.id, version,contactInheritance:inheritedWrites,...security, ...keyword, values: data, classification, relationshipAttributes:relationshipAttributes(),relationships:relationshipWrites() });
    return api('create_record', {contactInheritance:inheritanceFields.flatMap(f=>{const draft=inheritanceDraft.find(w=>w.fieldId===f.fieldId);return draft?.mode==='own'?[draft]:!draft&&f.mode==='own'?[{fieldId:f.fieldId,mode:'own' as const,value:f.value}]:[];}),duplicateFrom:duplicateDraft?{recordId:params.get('duplicateFrom')!,version:duplicateDraft.sourceVersion}:undefined,linkFrom:linkedCreation?.linkFrom, objectTypeId: definition.id,...security, ...keyword, values: data, classification, relationshipAttributes:relationshipAttributes(),relationships:relationshipWrites() });
  }, onMutate: () => { onBusyChange(true);  }, onSuccess: async result => {
      if(!isReadableRecord(result)){setLostAccess(true);onDirtyChange(false);onBusyChange(false);onAccessLost?.();queryClient.removeQueries({queryKey:['record',definition.id,result.id]});void queryClient.invalidateQueries();return;}
    const latest=await api('get_record_relationships',{objectTypeId:definition.id,recordId:result.id}).catch(()=>null);
    if(latest){setRelationFields(localizedRelationshipFields(latest.fields,regional));setRelationBaseline(localizedRelationshipFields(latest.fields,regional));queryClient.setQueryData(['record-relationships',definition.id,result.id],latest);}else setRelationBaseline(relationFields);
    void queryClient.invalidateQueries({queryKey:['record-relationships']});
    void queryClient.invalidateQueries({queryKey:['relationship-tree']});
    void queryClient.invalidateQueries({queryKey:['primary-chain-context']});
    void queryClient.invalidateQueries({queryKey:['relationship-candidates']});
    void queryClient.invalidateQueries({queryKey:['relationship-types']});
    void queryClient.invalidateQueries({queryKey:['record-link-options']});
    void queryClient.invalidateQueries({queryKey:['record']});
    void queryClient.invalidateQueries({queryKey:['system-journal']});
    setDependencyContext({applicableFieldIds:result.applicableFieldIds,allowedStatusIds:result.allowedStatusIds});
    if(securityDraft)setSecurityBaseline(securityDraft);setSecurityConfirmed(false);
    void queryClient.invalidateQueries({queryKey:['record-security',definition.id,result.id]});
    setInheritanceDraft([]);setInheritanceBaseline(result.contactInheritance??[]);
    setVersion(result.version); setBaseline({ ...values }); setChoiceBaseline(choices); onDirtyChange(false); notifySuccess(t('saved'));
    queryClient.setQueryData(['record', definition.id, result.id], result);
    void queryClient.invalidateQueries({ queryKey: ['records', definition.id] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-records'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['journal', definition.id, result.id] });
    onSaved(result);
  }, onSettled: () => onBusyChange(false) });
  useEffect(()=>{if(lostAccess&&!mutation.isPending)onClose();},[lostAccess,mutation.isPending,onClose]);
  function update(key: string, value: FieldValue) {
    if(mutation.isError)mutation.reset();
    if(definition.contactProfile&&kindField?.technicalName===key)return;
    const next = { ...values, [key]: value };
    if(!record)for(const field of activeFields)if(!touchedDefaults.has(field.technicalName)&&!appliesToDraft(field,values)&&appliesToDraft(field,next)&&field.inputRules?.defaultValue!==null&&field.inputRules?.defaultValue!==undefined)next[field.technicalName]=localizedFieldDraft(field,field.inputRules.defaultValue,regional);
    setTouchedDefaults(old=>new Set([...old,key]));
    const blocked=activeFields.filter(field=>appliesToDraft(field,values)&&!appliesToDraft(field,next)&&!emptyCustomValue(next[field.technicalName]));
    const blockedRelations=relationFields.filter(field=>field.targets.length&&fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values)&&!fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,next));
    if(blockedRelations.length){setShowHiddenRelationships(true);setApplicabilityError(t('clearInapplicableRelationships'));return;}
    if(blocked.length){setApplicabilityError(t('clearInapplicableFields',{fields:blocked.map(field=>field.label).join(', ')}));return;}
    setApplicabilityError('');setValues(next);
    onDirtyChange(securityDirty||relationDirty || choicesDirty || valuesChanged(next));
  }
  function renderEntry(entry:FormEntry,singleGroupLabel?:string){
    if('fieldId' in entry){const field=layoutFields.find(field=>field.id===entry.fieldId);return field?<div className="min-w-0" data-record-field={field.id} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setValidatedFields(old=>new Set([...old,field.id]));}}>{renderField(field,field.kind==='multiline'&&!field.required&&field.label===singleGroupLabel)}</div>:null;}
    return <RecordRelationshipFields primaryRequirements={definition.primaryRequirements} workspaceId={definition.workspaceId} singleGroupLabel={singleGroupLabel} entry={entry} fieldDefinitions={activeFields} values={values} primaryChain={relationships.primaryChain} objectTypeId={definition.id} recordId={record?.id} fields={relationFields} disabled={mutation.isPending} readOnly={readOnly||Boolean(linkedCreation&&!record&&(('relationshipTypeId' in entry&&entry.relationshipTypeId===linkedCreation.linkFrom.relationshipTypeId)||('primary' in entry&&relationFields.some(field=>field.definition.id===linkedCreation.linkFrom.relationshipTypeId&&field.definition.kind==='primary'))))} onPickerDirtyChange={value=>onDirtyChange(value||dirty)} workspaceCode={workspaceCode} onChange={updateRelationships}/>;
  }
  const [recycleOpen,setRecycleOpen]=useState(false);
  const validationFieldId=mutation.error instanceof ApiError&&mutation.error.details?.code==='unique_value'?mutation.error.details.fieldId:undefined;
  useEffect(()=>{if(validationFieldId)requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-record-field="${validationFieldId}"] input, [data-record-field="${validationFieldId}"] [role="combobox"]`)?.focus());},[mutation.error]);
  function renderField(source:FieldDefinition,labelHidden=false){
    const contactIssue=contactValidation.find(issue=>issue.fieldId===source.id&&(submitAttempted||validatedFields.has(source.id)));
    const field={...source,required:source.required||contactRequired.includes(source.id)};
    const workIssue=workValidation.find(issue=>issue.fieldId===source.id);
    const fieldError=validationFieldId===field.id?t('uniqueRecordConflict',{field:field.label}):contactIssue?t(contactIssue.code):workIssue?t(workIssue.code):undefined;
    if(field.technicalName==='record_number')return <Field><FieldLabel htmlFor="record-record-number">{field.label}</FieldLabel><Input id="record-record-number" value={String(record?.record_number??'')} readOnly placeholder={t('numberAssignedOnSave')}/></Field>;
    if(field.technicalName==='access_principals')return accessSnapshot&&securityBaseline&&securityDraft?<RecordAccessField activity={definition.activity} snapshot={{...accessSnapshot,policy:securityBaseline}} value={securityDraft} confirmed={securityConfirmed} disabled={mutation.isPending||inactiveObject} onChange={policy=>{setSecurityDraft(policy);setSecurityConfirmed(false);}} onConfirm={setSecurityConfirmed} onDetails={()=>setAccessOpen(true)}/>:null;
    if(field.id===definition.contactProfile?.fields.letter_salutation){
      const suggestion=contactLetterSalutation(definition.contactProfile,activeFields,values),override=String(values[field.technicalName]??''),id=`field-${field.id}`,disabled=mutation.isPending||readOnly||field.fieldPermissions?.edit===false;
      return <Field data-invalid={Boolean(fieldError)} data-disabled={disabled||undefined}><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><InputGroup><InputGroupInput id={id} value={override} placeholder={suggestion??t('contactSalutationUnavailable')} disabled={disabled} required={field.required} maxLength={10000} aria-invalid={Boolean(fieldError)} aria-describedby={fieldDescriptionIds(field,`${id}-salutation-help${fieldError?` ${id}-error`:''}`)} onChange={e=>update(field.technicalName,e.target.value||null)}/>{override?<InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-xs" aria-label={t('contactSalutationReset')} title={t('contactSalutationReset')} disabled={disabled} onClick={()=>{update(field.technicalName,null);requestAnimationFrame(()=>document.getElementById(id)?.focus());}}><RotateCcwIcon/></InputGroupButton></InputGroupAddon>:null}</InputGroup><FieldDescription id={`${id}-salutation-help`}>{override.trim()?t('contactSalutationOverride'):suggestion?t('contactSalutationSuggestion',{value:suggestion}):t('contactSalutationUnavailable')}</FieldDescription><FieldExplanation field={field} help/>{fieldError?<FieldError id={`${id}-error`}>{fieldError}</FieldError>:null}</Field>;
    }
    const inherited=inheritanceFields.find(item=>item.fieldId===field.id);
    if(inherited)return <div className="space-y-3"><ContactInheritanceControl field={field} state={inherited} draft={inheritanceDraft.find(w=>w.fieldId===field.id)} disabled={readOnly||mutation.isPending} onChange={editInheritance}/>{field.id===definition.contactProfile?.fields.organization_name&&inheritanceFields.every(f=>f.canEdit)?<Button type="button" variant="outline" size="sm" className="h-auto min-h-7 whitespace-normal text-left" disabled={readOnly||mutation.isPending||inheritanceFields.every(f=>(inheritanceDraft.find(w=>w.fieldId===f.fieldId)?.mode??f.mode)==='own')} onClick={()=>setInheritanceDraft(inheritanceFields.map(f=>({fieldId:f.fieldId,mode:'own',value:inheritanceDraft.find(w=>w.fieldId===f.fieldId)?.mode==='own'?(inheritanceDraft.find(w=>w.fieldId===f.fieldId) as Extract<ContactInheritanceWrite[number],{mode:'own'}>).value:inheritanceDraft.find(w=>w.fieldId===f.fieldId)?.mode==='inherit'?f.inheritedValue:f.value})))}>{t('contactOwnAll')}</Button>:null}</div>;
    if(field.isDerived)return <Field><FieldLabel htmlFor={`derived-${field.id}`}>{field.label}</FieldLabel><Input id={`derived-${field.id}`} value={String(record?.[field.technicalName]??'')} readOnly placeholder={t('derivedOnSave')}/>{field.technicalName==='keyword'?<FieldDescription>{t(dirty?'derivedUpdatesOnSave':'derivedFieldHelp')}</FieldDescription>:null}</Field>;
    if(field.technicalName==='keyword')return <Field data-disabled={(mutation.isPending||readOnly)||undefined}><FieldLabel htmlFor="record-keyword">{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><Input aria-invalid={Boolean(fieldError)} aria-describedby={fieldDescriptionIds(field,fieldError?`keyword-validation-error`:undefined)} id="record-keyword" value={String(values.keyword??'')} maxLength={200} required={field.required} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={event=>update('keyword',event.target.value)}/><FieldExplanation field={field} help/>{fieldError?<FieldError id="keyword-validation-error">{fieldError}</FieldError>:null}</Field>;
    if(['type','status','category'].includes(field.technicalName))return <ClassificationFields allowedStatusIds={definition.fields.some(item=>item.technicalName==='type'&&item.fieldPermissions?.read===false)?dependencyContext.allowedStatusIds:undefined} fields={[field]} config={definition.classification} value={choices} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={next=>{
      if(definition.workProfile?.kind==='task'){const done=(id:string|null)=>definition.classification.options.find(o=>o.id===id)?.meaning==='done';const progress=activeFields.find(f=>f.id===definition.workProfile!.fields.progress),completed=activeFields.find(f=>f.id===definition.workProfile!.fields.completed_at);const proposal=taskCompletionProposal(done(choices.status),done(next.status),progress?values[progress.technicalName]:null,new Date().toISOString());if(proposal&&progress&&completed&&progress.fieldPermissions?.edit!==false&&completed.fieldPermissions?.edit!==false){setValues(old=>({...old,[progress.technicalName]:proposal.progress,[completed.technicalName]:proposal.completed_at}));}}
      setChoices(next);onDirtyChange(securityDirty||relationDirty||JSON.stringify(next)!==JSON.stringify(choiceBaseline)||valuesChanged(values));}}/>;
    return <CustomFieldControl inline={field.id===definition.workProfile?.fields.progress} unit={field.id===definition.workProfile?.fields.progress?'%':undefined} labelHidden={labelHidden} legendVariant={[definition.contactProfile?.fields.addresses,definition.contactProfile?.fields.notes].includes(field.id)?'legend':'label'} error={fieldError} field={field} value={values[field.technicalName]??null} workspaceId={definition.workspaceId} objectTypeId={definition.id} disabled={mutation.isPending||readOnly||field.fieldPermissions?.edit===false} onChange={value=>update(field.technicalName,value)}/>;
  }
  useEffect(() => { document.querySelector<HTMLElement>('[data-record-page-title]')?.focus(); }, [recordId]);
  const title = record ? record.keyword || record.id : duplicateDraft?t('duplicateRecord'):kindKey?t('contactNewKind',{kind:contactKindLabel(definition,kindKey,i18n.language,t(`contactKind_${kindKey}`))}):t('newRecord');
  const missingFields = [
    ...relationFields.flatMap(relation=>relation.targets.flatMap(target=>(relation.definition.fields??[]).filter(field=>field.state==='active'&&field.required&&target.attributeAccess?.[field.id]?.read!==false&&emptyCustomValue(target.attributeValues?.[field.id])).map(f=>f.label))),
    ...contactValidation.filter(issue=>issue.code!=='contactKindRequired').map(issue=>activeFields.find(field=>field.id===issue.fieldId)?.label??t(issue.code)),
    ...applicableFields.filter(field => !field.isDerived&&isCustomFieldKind(field.kind) && field.required && emptyCustomValue(values[field.technicalName])).map(field => field.label),
    ...(['type', 'status', 'category'] as const).filter(kind => activeFields.some(field => field.kind === kind) && definition.classification[kind].required && (kind === 'category' ? !choices.category.length : !choices[kind])).map(kind => t(kind === 'type' ? 'classificationType' : kind === 'status' ? 'classificationStatus' : 'classificationCategory')),
    ...relationFields.filter(field => fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},activeFields,values) && field.definition.active && field.targets.length < (field.side === 'left' ? field.definition.leftMin : field.definition.rightMin)).map(field => {
      const labels: Record<string, string | undefined> = field.side === 'left' ? field.definition.leftLabels : field.definition.rightLabels;
      return labels[i18n.language] ?? labels.en ?? labels.de ?? Object.values(labels)[0];
    }),
  ];
  const linkedField=linkedCreation?relationFields.find(field=>field.definition.id===linkedCreation.linkFrom.relationshipTypeId&&field.targets.some(target=>target.objectTypeId===linkedCreation.source.objectTypeId&&target.recordId===linkedCreation.source.recordId)):undefined;
  const linkedRule=linkedField?(linkedField.side==='left'?linkedField.definition.leftApplicability:linkedField.definition.rightApplicability):undefined;
  const linkedConditionInvalid=Boolean(linkedCreation&&!record&&linkedRule&&!fieldApplies({applicability:linkedRule},activeFields,values));
  const structuredInvalid=applicableFields.some(field=>{if(field.kind!=='structured'||values[field.technicalName]===null||values[field.technicalName]===undefined)return false;try{parseStructuredValue(field.config.schema!,values[field.technicalName]);return false;}catch{return true;}});
  const attributeInvalid=relationFields.some(relation=>relation.targets.some(target=>(relation.definition.fields??[]).some(field=>{
    if(field.state!=='active'||target.attributeAccess?.[field.id]?.edit===false)return false;
    const value=target.attributeValues?.[field.id]??null;
    if(numericDraftError(field,value,regional))return true;
    if(field.kind==='structured'&&value!==null){try{parseStructuredValue(field.config.schema!,value);}catch{return true;}}
    return value!==null&&(field.kind==='date'?!isCalendarDate(String(value)):field.kind==='datetime'?!isInstant(String(value)):false);
  })));
  const invalid = workValidation.length>0||attributeInvalid||structuredInvalid||!securityValid||linkedConditionInvalid||timestampInvalid || missingFields.length > 0 || applicableFields.some(field=>Boolean(numericDraftError(field,values[field.technicalName]??null,regional)));
  useEffect(()=>{
    if(!formatChangePending||mutation.isPending||timestampInvalid||attributeInvalid)return;
    const next=reformatNumericDrafts(activeFields,values,regional,requestedRegional);
    const previous=reformatNumericDrafts(activeFields,baseline,regional,requestedRegional);
    const nextRelations=reformatRelationshipFields(relationFields,regional,requestedRegional),previousRelations=reformatRelationshipFields(relationBaseline,regional,requestedRegional);
    if(!next||!previous||!nextRelations||!previousRelations)return;
    setRelationFields(nextRelations);setRelationBaseline(previousRelations);
    setValues(next);setBaseline(previous);setDraftFormat({regional:requestedRegional,timeZone:requestedTimeZone});
  },[formatChangePending,requestedRegional,requestedTimeZone,regional,activeFields,values,baseline,timestampInvalid,attributeInvalid,relationFields,relationBaseline,mutation.isPending]);
  const [reviewOpen,setReviewOpen]=useState(false);
  const externalChange=Boolean(record&&version&&record.version>version);
  const remoteReady=!accessSnapshot||accessSnapshot.version===record?.version;
  const remoteValues=initial();
  const remoteChoices:ClassificationValues={type:record?.type??null,status:record?.status??null,category:record?.category??[]};
  const remoteRelations=localizedRelationshipFields(relationships.fields,regional);
  const snapshot=(fields:Record<string,FieldValue>,classification:ClassificationValues,links:typeof relationFields,security:typeof securityDraft,inheritance:ContactInheritanceWrite=[])=>({
    contactInheritance:inheritance,
    ...Object.fromEntries(Object.entries(fields).map(([key,value])=>[`field:${key}`,value])),
    ...Object.fromEntries(Object.entries(classification).filter(([key])=>activeFields.some(field=>field.technicalName===key)).map(([key,value])=>[`classification:${key}`,value])),
    ...Object.fromEntries(links.map(field=>[`relationship:${field.definition.id}:${field.side}`,field])),
    ...(security?{security}:{}),
  });
  function adoptRemote(merged?:Record<string,unknown>){
    if(!record||!remoteReady)return;
    const nextValues=merged?Object.fromEntries(Object.entries(merged).filter(([key])=>key.startsWith('field:')).map(([key,value])=>[key.slice(6),value as FieldValue])):remoteValues;
    const nextChoices=merged?{...remoteChoices,...Object.fromEntries(Object.entries(merged).filter(([key])=>key.startsWith('classification:')).map(([key,value])=>[key.slice(15),value]))} as ClassificationValues:remoteChoices;
    const nextRelations=merged?remoteRelations.map(remote=>{
      const local=merged[`relationship:${remote.definition.id}:${remote.side}`] as typeof remote|undefined;
      if(!local)return remote;
      return {...remote,targets:local.targets.map(target=>{const saved=remote.targets.find(item=>item.recordId===target.recordId&&item.objectTypeId===target.objectTypeId);return saved?{...saved,attributeValues:target.attributeValues}:target;})};
    }):remoteRelations;
    setValues(nextValues);setBaseline(remoteValues);setChoices(nextChoices);setChoiceBaseline(remoteChoices);
    setRelationFields(nextRelations);setRelationBaseline(remoteRelations);
    setSecurityBaseline(accessSnapshot?.policy);setSecurityDraft(merged?.security as typeof securityDraft??accessSnapshot?.policy);setSecurityConfirmed(false);setAccessDetailDirty(false);
    setInheritanceBaseline(record?.contactInheritance??[]);setInheritanceDraft(merged?.contactInheritance as ContactInheritanceWrite??[]);
    setVersion(record.version);setDependencyContext({applicableFieldIds:record.applicableFieldIds,allowedStatusIds:record.allowedStatusIds});
    setValidatedFields(new Set());setSubmitAttempted(false);setApplicabilityError('');mutation.reset();
  }
  useEffect(()=>{if(externalChange&&remoteReady&&!dirty&&!pickerDirty&&!accessDetailDirty&&!mutation.isPending)adoptRemote();},[record,accessSnapshot,externalChange,remoteReady,dirty,pickerDirty,accessDetailDirty,mutation.isPending]);
  const conflictLabel=(key:string)=>{
    if(key==='contactInheritance')return t('contactInheritance');
    if(key==='security')return t('accessPrincipals');
    if(key.startsWith('relationship:')){const field=relationFields.find(field=>key===`relationship:${field.definition.id}:${field.side}`);const labels=field?(field.side==='left'?field.definition.leftLabels:field.definition.rightLabels):undefined;return labels?.[i18n.language as 'en'|'de']??labels?.en??t('relationships');}
    const name=key.split(':')[1];return activeFields.find(field=>field.technicalName===name)?.label??t(name);
  };
  const conflictDisplay=(key:string,value:unknown)=>{
    if(value===null||value===undefined||value==='')return t('emptyValue');
    if(key==='contactInheritance')return (value as ContactInheritanceWrite).map(item=>`${definition.fields.find(f=>f.id===item.fieldId)?.label??t('field')}: ${t(item.mode==='own'?'contactOwn':'contactInherit')}${item.mode==='own'?` · ${item.value??t('emptyValue')}`:''}`).join('; ');
    if(key==='security'){
      const policy=value as NonNullable<typeof securityDraft>,name=(owner:{kind:string;id:string})=>accessSnapshot?.principals.find(principal=>principal.kind===owner.kind&&principal.id===owner.id)?.name??t(`reference_${owner.kind}`);
      return [...policy.owners.map(owner=>`${name(owner)}: ${t(`permission_${owner.level}`)}`),`${t('publicLevel')}: ${t(`permission_${policy.publicLevel??'none'}`)}`,`${t('recordPrivacy')}: ${t(`privacy_${policy.privacy}`)}`,`${t('foreignLimit')}: ${t(`permission_${policy.foreignMax}`)}`,...policy.fields.flatMap(rule=>Object.entries(rule.fields).map(([id,level])=>`${name(rule)} · ${definition.fields.find(field=>field.id===id)?.label??t('field')}: ${t(`permission_${level}`)}`))].join('\n');
    }
    if(key.startsWith('relationship:')){const relation=value as typeof relationFields[number];return relation.targets.map(target=>[target.keyword||target.recordId,...Object.entries(target.attributeValues??{}).map(([id,entry])=>{const field=relation.definition.fields?.find(field=>field.id===id);try{return field?`${field.label}: ${displayFieldValue(field,entry,i18n.language,t,principals.data??[],timeZone,regional)}`:'';}catch{return field?`${field.label}: ${t('valueChanged')}`:'';}})].filter(Boolean).join('\n')).join('\n\n')||t('emptyValue');}
    if(key.startsWith('classification:'))return (Array.isArray(value)?value:[value]).map(id=>{const option=definition.classification.options.find(option=>option.id===id);return option?.label??option?.labels[i18n.language as 'en'|'de']??option?.labels.en??t('valueChanged');}).join(', ')||t('emptyValue');
    const field=activeFields.find(field=>field.technicalName===key.split(':')[1]);
    try{return field?displayFieldValue(field,value,i18n.language,t,principals.data??[],timeZone,regional):String(value);}catch{return typeof value==='string'?value:t('valueChanged');}
  };
  function reset() {setInheritanceDraft([]);setValidatedFields(new Set());setSubmitAttempted(false);setTouchedDefaults(new Set());setSecurityDraft(securityBaseline);setSecurityConfirmed(false);setAccessDetailDirty(false);setApplicabilityError('');setRelationFields(relationBaseline); setValues({ ...baseline }); setChoices(choiceBaseline);  mutation.reset(); onDirtyChange(false); }
  const linkSourceValues=Object.fromEntries(relationFields.flatMap(field=>{const rule=field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability;const controller=activeFields.find(item=>item.id===rule?.fieldId);return controller?[[controller.technicalName,values[controller.technicalName]??null]]:[];}));
  const updateRelationships = (candidate: typeof relationFields) => {
    const next=retainRelationshipAttributes(candidate.map(field=>({...field,targets:field.targets.map(target=>{const existing=[...relationFields,...relationBaseline].filter(f=>f.definition.id===field.definition.id&&f.side===field.side).flatMap(f=>f.targets).some(t=>t.objectTypeId===target.objectTypeId&&t.recordId===target.recordId);return existing?target:localizedRelationshipFields([{...field,targets:[target]}],regional)[0].targets[0];})})),relationFields,relationBaseline);
    setRelationFields(next);
    onDirtyChange(securityDirty||JSON.stringify(next)!==JSON.stringify(relationBaseline)||choicesDirty||valuesChanged(values));
  };
  function focusInvalidField(form:HTMLFormElement){
    // Wait for submission-only validation messages and their ARIA state to render.
    requestAnimationFrame(()=>{
      const input=[...form.querySelectorAll<HTMLElement>('input[aria-invalid="true"],textarea[aria-invalid="true"],[role="combobox"][aria-invalid="true"],input:invalid,textarea:invalid,select:invalid')].find(element=>element.getClientRects().length&&!element.hasAttribute('disabled'));
      const target=input??form.querySelector<HTMLElement>('[data-record-validation-summary]');
      target?.focus();target?.scrollIntoView({block:'center',behavior:'smooth'});
    });
  }
  if(lostAccess)return <ErrorNotice error={new Error(t('contentAccessDenied'))}/>;
  return <RegionalProvider value={regional}><TimeZoneProvider value={timeZone}><form id="record-form" onInvalidCapture={event=>{setSubmitAttempted(true);focusInvalidField(event.currentTarget);}} data-shortcut-submit className={recordPageClassName} onSubmit={event => { event.preventDefault(); setSubmitAttempted(true); if(invalid){focusInvalidField(event.currentTarget);return;} if (!pickerDirty && !externalChange && tab === 'details' && !readOnly && !formatChangePending && !invalid && (!record || dirty) && !mutation.isPending) mutation.mutate(); }}>
    {externalChange?<Alert role="status"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t('externalRecordChange')} {t('externalChangeHelp')}</span><Button type="button" size="sm" variant="outline" disabled={!remoteReady||mutation.isPending} onClick={()=>setReviewOpen(true)}>{t('reviewChanges')}</Button></AlertDescription></Alert>:null}
    {conversionOpen&&record?<ContactConversionDialog onBusyChange={onBusyChange} onDirtyChange={onDirtyChange} definition={definition} record={{...record,version:version!}} onClose={()=>setConversionOpen(false)} onConverted={converted=>{queryClient.setQueryData(['record',definition.id,converted.id],converted);}}/>:null}
    {externalChange&&reviewOpen?<DraftConflicts key={record!.version} open={reviewOpen} onOpenChange={setReviewOpen} base={snapshot(baseline,choiceBaseline,relationBaseline,securityBaseline,inheritanceBaseline.map(f=>f.mode==='own'?{fieldId:f.fieldId,mode:'own',value:f.value}:{fieldId:f.fieldId,mode:'inherit',confirmReset:true}))} local={snapshot(values,choices,relationFields,securityDraft,inheritanceBaseline.map(f=>inheritanceDraft.find(w=>w.fieldId===f.fieldId)??(f.mode==='own'?{fieldId:f.fieldId,mode:'own',value:f.value}:{fieldId:f.fieldId,mode:'inherit',confirmReset:true})))} remote={snapshot(remoteValues,remoteChoices,remoteRelations,accessSnapshot?.policy,inheritanceFields.map(f=>f.mode==='own'?{fieldId:f.fieldId,mode:'own',value:f.value}:{fieldId:f.fieldId,mode:'inherit',confirmReset:true}))} label={conflictLabel} display={conflictDisplay} onApply={adoptRemote}/>:null}
    <RecordPageHeader navigation={<><Button type="button" variant="ghost" className="w-fit -ml-2" disabled={mutation.isPending} onClick={onClose}><ArrowLeftIcon data-icon="inline-start" />{t(returnToSource?'backToSource':'backToOverview')}</Button>
      {record?<DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" className="sm:hidden" data-record-contact-actions aria-label={t('recordActions')}/> }><MoreHorizontalIcon/></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>{record.permissions?.duplicate&&definition.permissions?.create?<DropdownMenuItem disabled={inactiveObject||dirty||mutation.isPending} onClick={()=>duplicate()}><CopyIcon/>{t('duplicateRecord')}</DropdownMenuItem>:null}{record.permissions?.delete?<DropdownMenuItem disabled={inactiveObject||dirty||mutation.isPending} onClick={()=>setRecycleOpen(true)}><Trash2Icon/>{t('recycleRecord')}</DropdownMenuItem>:null}</DropdownMenuGroup><DropdownMenuGroup>{definition.contactProfile&&kindKey&&record.permissions?.full?<DropdownMenuItem disabled={inactiveObject||dirty||mutation.isPending||kindField?.fieldPermissions?.edit===false} onClick={()=>setConversionOpen(true)}><ArrowRightLeftIcon/>{t('contactConvert')}</DropdownMenuItem>:null}<RecordShareItems workspaceCode={workspaceCode} technicalName={definition.technicalName} recordId={record.id}/><CopyRecordIdItem id={record.id}/></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>:null}
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{kindKey?contactKindLabel(definition,kindKey,i18n.language,t(`contactKind_${kindKey}`)):definition.label}</Badge>{record&&!readOnly?<RecordLinkActions excludedRelationshipIds={definition.contactProfile?[definition.contactProfile.relationships.contact_person]:[]} source={{iconKey:record.iconKey,objectTypeId:definition.id,recordId:record.id,keyword:record.keyword,objectTechnicalName:definition.technicalName,objectLabels:definition.labels,state:'active'}} version={version!} fields={relationFields} sourceValues={linkSourceValues} workspaceCode={workspaceCode} disabled={mutation.isPending} dirty={dirty||formatChangePending} onPickerDirtyChange={value=>onDirtyChange(value||dirty)} onApply={(field,targets)=>{updateRelationships(relationFields.map(item=>item===field?{...item,targets}:item));setTab('details');}}/>:null}{readOnly?<Badge variant="outline">{t(inactiveObject?'definition_inactive':'readOnly')}</Badge>:null}</div></>} title={<h1 data-record-page-title tabIndex={-1} className="wrap-anywhere text-2xl font-semibold outline-none">{title}</h1>} description={t(inactiveObject?'inactiveObjectHelp':readOnly?'recordReadOnlyHelp':record?'recordDetails':duplicateDraft?'duplicateDraftHelp':'newRecordDescription')} actions={record?<>
      {record.permissions?.duplicate&&definition.permissions?.create?<Button type="button" variant="outline" disabled={inactiveObject||dirty||mutation.isPending} onClick={()=>duplicate()}><CopyIcon data-icon="inline-start"/>{t('duplicateRecord')}</Button>:null}
      {record.permissions?.delete?<RecordLifecycleAction open={recycleOpen} onOpenChange={setRecycleOpen} objectTypeId={definition.id} recordId={record.id} version={version!} name={record.keyword||record.id} disabled={inactiveObject||dirty||mutation.isPending} onBusyChange={onBusyChange} onDone={()=>{onBusyChange(false);onAccessLost?.();}}/>:null}
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" disabled={mutation.isPending} data-record-contact-actions aria-label={t('recordActions')}/> }><MoreHorizontalIcon/></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuGroup>{definition.contactProfile&&kindKey&&record.permissions?.full?<DropdownMenuItem disabled={inactiveObject||dirty||mutation.isPending||kindField?.fieldPermissions?.edit===false} onClick={()=>setConversionOpen(true)}><ArrowRightLeftIcon/>{t('contactConvert')}</DropdownMenuItem>:null}<RecordShareItems workspaceCode={workspaceCode} technicalName={definition.technicalName} recordId={record.id}/><CopyRecordIdItem id={record.id}/></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
</>:undefined}/>
    {linkedCreation&&!record?<Alert><AlertDescription>{t('linkedRecordContext',{relationship:groupLabel(linkedCreation.labels),source:linkedCreation.source.keyword})}{linkedConditionInvalid?<p>{t('linkedRecordConditionHelp',{field:activeFields.find(field=>field.id===linkedRule?.fieldId)?.label??t('fieldName')})}</p>:null}</AlertDescription></Alert>:null}
    {formatChangePending?<Alert><AlertDescription>{t('regionalFormatChangePending')}</AlertDescription></Alert>:null}
    {accessOpen&&accessSnapshot&&securityBaseline&&securityDraft?<RecordSecurityDialog definition={definition} snapshot={{...accessSnapshot,policy:securityBaseline}} value={securityDraft} confirmed={securityConfirmed} onClose={()=>{setAccessOpen(false);setAccessDetailDirty(false);}} onApply={(policy,confirmed)=>{setSecurityDraft(policy);setSecurityConfirmed(confirmed);setAccessOpen(false);setAccessDetailDirty(false);}} onDirtyChange={setAccessDetailDirty}/>:null}
    <Tabs value={tab==='tree'&&!treeAvailable?'details':tab} onValueChange={value=>{setTab(value);if(value==='dossier')void queryClient.invalidateQueries({queryKey:['record-relationships',definition.id,recordId]});}} className="gap-4"><RecordSectionTabs isNew={!record} treeAvailable={treeAvailable}/>
    <TabsContent value="details" keepMounted className="flex w-full min-w-0 flex-col gap-6 data-[hidden]:hidden">
      {submitAttempted&&invalid?<Alert variant="destructive" tabIndex={-1} data-record-validation-summary><AlertDescription>{t('recordValidationFailed')}</AlertDescription></Alert>:null}
      {applicabilityError?<Alert variant="destructive"><AlertDescription role="alert">{applicabilityError}</AlertDescription></Alert>:null}
      {mutation.isError ? <ErrorNotice fieldLabel={activeFields.find(field=>field.id===validationFieldId)?.label} error={mutation.error} /> : null}
      {mutation.error instanceof ApiError && mutation.error.status === 409 && mutation.error.message.includes('version conflict') ? <Button variant="outline" type="button" onClick={() => { if(linkedCreation)onClose();else window.location.reload(); }}>{t(linkedCreation?'backToSource':'reload')}</Button> : null}
      {linkedCreation&&mutation.error instanceof ApiError&&mutation.error.status===409&&mutation.error.message.includes('version conflict')?<FieldDescription>{t('linkedRecordConflict')}</FieldDescription>:null}
      {!record?<FieldDescription>{t('recordCreateHelp')}</FieldDescription>:null}
      {hiddenRelationships?<Button type="button" variant="outline" className="self-start" onClick={()=>setShowHiddenRelationships(value=>!value)}>{t(showHiddenRelationships?'formHideOptionalRelationships':'formShowOptionalRelationships',{count:hiddenRelationships})}</Button>:null}
      {coreLayout?<ContactCoreGroups layout={coreLayout} media={<ContactMediaPreparation kind={kindKey}/>} renderGroup={(group,singleColumn)=>['contact-addresses','contact-notes'].includes(group.id)?<SettingsSection key={group.id}>{group.fields.map(entry=><div key={'fieldId'in entry?entry.fieldId:'core'}>{renderEntry(entry)}</div>)}</SettingsSection>:<RecordFormGroups key={group.id} singleColumn={singleColumn} layout={{groups:[group]}} renderEntry={renderEntry}/>}/>:null}
      <RecordFormGroups layout={layout} renderEntry={renderEntry}/>
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
    {!readOnly&&(tab==='details'||dirty)?<RecordPageFooter>
      <FieldDescription className="w-full min-w-0 wrap-anywhere sm:w-auto sm:flex-1">{missingFields.length&&submitAttempted?t('recordMissingFields',{fields:missingFields.slice(0,3).join(', '),remaining:missingFields.length>3?t('recordMoreFields',{count:missingFields.length-3}):''}):timestampInvalid?t('recordIncomplete'):dirty?t('recordUnsaved'):t(record?'recordUpToDate':'recordCreateActionHelp')}</FieldDescription>
      <div className="ml-auto flex flex-wrap items-center gap-2">{tab!=='details'?<Button type="button" variant="outline" onClick={()=>setTab('details')}>{t('keepEditing')}</Button>:null}{record ? <Button type="button" variant="outline" disabled={(!dirty&&!applicabilityError&&!mutation.isError) || mutation.isPending} onClick={reset}><RotateCcwIcon data-icon="inline-start" />{t('resetPreferences')}</Button> : null}<Button type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={pickerDirty||externalChange||tab!=='details'||mutation.isPending || formatChangePending || Boolean(record && !dirty)}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{mutation.isPending ? t('saving') : t(record ? 'save' : 'create')}<Kbd>{saveShortcutLabel}</Kbd></Button></div>
    </RecordPageFooter>:null}
  </form></TimeZoneProvider></RegionalProvider>;

}
