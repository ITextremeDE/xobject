import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {ForeignAccess} from './foreign-access';
import {AccessChoice} from './access-controls';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {contentLevels,resolveContentRule,membershipRights,type ContentGrant,type ContentLevel,type FieldLevel,type ObjectDefinition,type ContentPermissions,type WorkspaceGroup,type ManagedUser} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from '@/components/ui/field';
import {Checkbox} from '@/components/ui/checkbox';
import {TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {SettingsTable,SettingsTableSearch,useSettingsTable} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {SettingsSection} from './settings-section';
import {SettingsHelp} from './settings-help';
import {ErrorNotice,Loading} from './feedback';
import {Spinner} from '@/components/ui/spinner';
import {Kbd} from '@/components/ui/kbd';
import {saveShortcutLabel,keyboardCommands} from '@/lib/keyboard';

type PrincipalProps={workspaceId:string;kind:'user'|'group';principals:{id:string;name:string}[];selected:string;onSelect:(id:string)=>void;actionTarget?:HTMLElement|null;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void};
export function PrincipalPermissions({workspaceId,kind,principals,selected,onSelect,actionTarget,onDirtyChange,onBusyChange}:PrincipalProps){
 const [foreignOpen,setForeignOpen]=useState(false);
 const {t,i18n}=useTranslation(),[object,setObject]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
 const types=useQuery({queryKey:['permission-types',workspaceId],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true})});
 const groups=useQuery({queryKey:['workspace-groups',workspaceId],queryFn:()=>api('list_groups',{workspaceId})});
 const users=useQuery({queryKey:['managed-users'],queryFn:()=>api('list_managed_users',{}),enabled:kind==='user'});
 const sorted=[...(types.data??[])].sort((a,b)=>a.label.localeCompare(b.label,i18n.language));
 const id=sorted.some(o=>o.id===object)?object:sorted[0]?.id,person=principals.some(p=>p.id===selected)?selected:principals[0]?.id;
 useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);useEffect(()=>onBusyChange(busy),[busy,onBusyChange]);
 const selectionLabel=t(kind==='user'?'chooseUser':'chooseGroup');
 return <SettingsSection><FieldSet className="min-w-0" id={`permissions-${kind}`}><FieldLegend>{t('contentPermissions')}</FieldLegend><FieldGroup><FieldDescription>{t('permissionSelectionHelp')}</FieldDescription>
 <FieldGroup className="grid items-start gap-4 sm:grid-cols-2"><Field data-disabled={dirty||busy||!principals.length||undefined}><FieldLabel htmlFor={`permission-principal-${kind}`}>{selectionLabel}</FieldLabel><AccessChoice id={`permission-principal-${kind}`} label={selectionLabel} value={person??''} items={principals.map(p=>({value:p.id,label:p.name}))} disabled={dirty||busy||!principals.length} onChange={onSelect}/></Field><Field data-disabled={dirty||busy||!id||undefined}><FieldLabel htmlFor={`permission-object-${kind}`}>{t('selectObjectType')}</FieldLabel><AccessChoice id={`permission-object-${kind}`} label={t('selectObjectType')} value={id??''} items={sorted.map(o=>({value:o.id,label:o.label}))} disabled={dirty||busy||!id} onChange={setObject}/></Field></FieldGroup>
 {dirty?<FieldDescription>{t('permissionSaveBeforeSwitch')}</FieldDescription>:null}
 {types.isError||groups.isError||users.isError?<ErrorNotice error={types.error??groups.error??users.error}/>:types.isPending||groups.isPending||(kind==='user'&&users.isPending)?<Loading variant="form"/>:!id||!person?<FieldDescription>{t('permissionSelectionEmpty')}</FieldDescription>:<PrincipalObjectPermissions key={`${person}:${id}`} objectTypeId={id} kind={kind} principalId={person} groups={groups.data??[]} users={users.data??[]} actionTarget={actionTarget} onDirtyChange={setDirty} onBusyChange={setBusy}/>}
 <Button type="button" variant="outline" disabled={dirty||busy||!person} onClick={()=>setForeignOpen(true)}>{t('foreignAccess')}</Button>
 {foreignOpen&&person?<ForeignAccess workspaceId={workspaceId} principal={{kind,id:person}} onBusyChange={setBusy} onClose={()=>{setForeignOpen(false);setDirty(false);}} onDirtyChange={setDirty}/>:null}
 </FieldGroup></FieldSet></SettingsSection>;
}
type EditorProps={objectTypeId:string;kind:'user'|'group';principalId:string;groups:WorkspaceGroup[];users:ManagedUser[];actionTarget?:HTMLElement|null;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void};
function PrincipalObjectPermissions(props:EditorProps){
 const {objectTypeId}=props;
 const settings=useQuery({queryKey:['content-permissions',objectTypeId],queryFn:()=>api('get_content_permissions',{objectTypeId})}),definition=useQuery({queryKey:['permission-definition',objectTypeId],queryFn:()=>api('get_object_type',{objectTypeId})});
 if(settings.isError||definition.isError)return <ErrorNotice error={settings.error??definition.error}/>;
 if(!settings.data||!definition.data)return <Loading variant="form"/>;
 return <GrantEditor {...props} initial={settings.data} definition={definition.data}/>;
}
function GrantEditor({objectTypeId,kind,principalId,groups,users,actionTarget,initial,definition,onDirtyChange,onBusyChange}:EditorProps&{initial:ContentPermissions;definition:ObjectDefinition}){
 const {t,i18n}=useTranslation(),client=useQueryClient(),empty:ContentGrant={kind,id:principalId,level:null,fields:{}};
 const [baseline,setBaseline]=useState(initial),[draft,setDraft]=useState(()=>initial.grants.find(g=>g.kind===kind&&g.id===principalId)??empty),[savedMessage,setSavedMessage]=useState(false);
 const {search,onSearch,pagination}=useSettingsTable([...definition.fields,...(definition.historicalFields??[]),...(definition.relationshipFields??[]).map(f=>({...f,label:`${t('relationshipAttributes')} · ${f.label}`}))].filter(f=>f.technicalName!=='access_principals').sort((a,b)=>a.label.localeCompare(b.label,i18n.language)),field=>`${field.label} ${field.technicalName}`);
 const saved=baseline.grants.find(g=>g.kind===kind&&g.id===principalId)??empty,dirty=JSON.stringify(draft)!==JSON.stringify(saved);
 const grants=[...baseline.grants.filter(g=>g.kind!==kind||g.id!==principalId),...(draft.level!==null||draft.create!=null||Object.keys(draft.fields).length?[draft]:[])];
 function adopt(result:ContentPermissions){setBaseline(result);setDraft(result.grants.find(g=>g.kind===kind&&g.id===principalId)??empty);}
 const mutation=useMutation({mutationFn:()=>api('configure_content_permissions',{objectTypeId,version:baseline.version,sensitive:baseline.sensitive,grants}),onSuccess:async result=>{adopt(result);setSavedMessage(true);await client.invalidateQueries();}});
 const reset=useMutation({mutationFn:()=>api('get_content_permissions',{objectTypeId}),onSuccess:result=>{adopt(result);setSavedMessage(false);mutation.reset();}});
 const busy=mutation.isPending||reset.isPending;
 useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);useEffect(()=>onBusyChange(busy),[busy,onBusyChange]);
 useEffect(()=>{if(!dirty)adopt(initial);},[initial]);
 function change(next:ContentGrant){setDraft(next);setSavedMessage(false);}
 const levelItems=[{value:'inherit',label:t(kind==='user'?'permissionInherit':'permissionNoGrant')},...contentLevels.map(value=>({value,label:t(`permission_${value}`)}))];
 const fieldItems=[{value:'inherit',label:t('permissionInherit')},...(['none','read','edit'] as const).map(value=>({value,label:t(`permission_${value}`)}))];
 const subject=users.find(u=>u.id===principalId),group=groups.find(g=>g.id===principalId);
 const active=kind==='user'?subject?.active===true:group?.active===true;
 const memberships=kind==='user'?[...membershipRights(principalId,groups.filter(g=>g.active).flatMap(g=>(g.members).filter(m=>m.kind==='user'||groups.some(child=>child.id===m.id&&child.active)).map(m=>({...m,groupId:g.id})))).keys()]:[principalId];
 function effective(fieldId?:string){
  if(!active)return t('permissionEffective',{level:t('permission_none'),source:t(kind==='user'?'permissionInactiveUser':'permissionInactiveGroup')});
  const rule=resolveContentRule(grants,kind==='user'?principalId:'',memberships,fieldId);
  const names=rule.sources.map(source=>source.kind==='user'?t('permissionDirect'):t('permissionFromGroup',{name:groups.find(g=>g.id===source.id)?.name??source.id}));
  return t('permissionEffective',{level:t(`permission_${rule.level}`),source:names.length?[...new Set(names)].join(', '):t('permissionNoRule')});
 }
 const formId=`grant-${kind}-${objectTypeId}`;
 const actions=<><Button type="button" variant="outline" disabled={busy||(!dirty&&!mutation.isError&&!reset.isError)} onClick={()=>reset.mutate()}>{t('resetPreferences')}</Button><Button type="submit" form={formId} disabled={!dirty||busy} aria-keyshortcuts={keyboardCommands.save.aria}>{mutation.isPending?<Spinner aria-hidden="true" data-icon="inline-start"/>:null}{t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></>;
 return <form id={formId} data-shortcut-submit onSubmit={event=>{event.preventDefault();if(dirty&&!busy)mutation.mutate();}}><FieldGroup>
 {mutation.isError||reset.isError?<ErrorNotice error={mutation.error??reset.error}/>:null}
 {savedMessage&&!dirty?<FieldDescription role="status">{t('saved')}</FieldDescription>:null}
 <Field data-disabled={busy||undefined}><FieldLabel htmlFor={`permission-level-${kind}-${objectTypeId}`}>{t('objectPermission')}</FieldLabel><AccessChoice id={`permission-level-${kind}-${objectTypeId}`} label={t('objectPermission')} value={draft.level??'inherit'} items={levelItems} disabled={busy} onChange={value=>change({...draft,level:value==='inherit'?null:value as ContentLevel})}/><FieldDescription>{effective()}</FieldDescription></Field>
 <Field><FieldLabel>{t('objectCreatePermission')}</FieldLabel><AccessChoice label={t('objectCreatePermission')} value={draft.create===undefined||draft.create===null?'inherit':String(draft.create)} disabled={busy} items={[{value:'inherit',label:t(kind==='user'?'permissionInherit':'permissionNoGrant')},{value:'true',label:t('createAllowed')},{value:'false',label:t('createDenied')}]} onChange={value=>change({...draft,create:value==='inherit'?null:value==='true'})}/><FieldDescription>{t('effectiveCreate',{value:t((kind==='user'?(draft.create??grants.some(grant=>grant.kind==='group'&&memberships.includes(grant.id)&&grant.create===true)):draft.create===true)&&active?'createAllowed':'createDenied')})}</FieldDescription></Field>
 <SettingsHelp title={t('permissionRulesTitle')}>{t(kind==='user'?'userPermissionsHelp':'groupPermissionsHelp')} {t('permissionLevelsHelp')} {t('fieldPermissionHelp')} {t('permissionPreviewHelp')}</SettingsHelp>
 <FieldSet className="min-w-0"><FieldLegend variant="label">{t('fieldPermissionExceptions')}</FieldLegend><FieldDescription>{t('permissionFieldsSummary')}</FieldDescription><SettingsTableSearch value={search} onChange={onSearch} disabled={busy}/><SettingsTable aria-label={t('fieldPermissionExceptions')}><TableHeader className="max-sm:sr-only"><TableRow><TableHead className="w-[40%] sm:w-1/2">{t('fieldName')}</TableHead><TableHead>{t('permission')}</TableHead></TableRow></TableHeader><TableBody>
 {!pagination.total?<TableRow><TableCell colSpan={2}>{t(search.trim()?'settingsNoMatches':'noFieldsYet')}</TableCell></TableRow>:null}
 {pagination.rows.map(field=><TableRow key={field.id} className="max-sm:flex max-sm:flex-col"><TableCell className="max-sm:pb-1"><span>{field.label}</span>{field.state&&field.state!=='active'?<FieldDescription>{t(`definition_${field.state}`)}</FieldDescription>:null}</TableCell><TableCell className="max-sm:pt-1"><AccessChoice id={`permission-field-${kind}-${field.id}`} label={`${t('permission')}: ${field.label}`} value={draft.fields[field.id]??'inherit'} items={fieldItems} disabled={busy} onChange={value=>{const fields={...draft.fields};if(value==='inherit')delete fields[field.id];else fields[field.id]=value as FieldLevel;change({...draft,fields});}}/><FieldDescription className="mt-2">{effective(field.id)}</FieldDescription></TableCell></TableRow>)}
 </TableBody></SettingsTable><ClientTablePagination pagination={pagination} disabled={busy} countLabel={t('fieldCount',{count:pagination.total})}/></FieldSet>
 {actionTarget?createPortal(actions,actionTarget):null}
 </FieldGroup></form>;
}
/** Controlled by the common object-settings form, including its footer actions. */
export function ObjectSensitivity({definition,isAdmin,value,disabled,onChange}:{definition:ObjectDefinition;isAdmin:boolean;value:boolean;disabled:boolean;onChange:(value:boolean)=>void}){
 const {t}=useTranslation(),[confirm,setConfirm]=useState(false);if(definition.state==='deleted')return null;
 return <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('contentAccess')}</FieldLegend><Field data-disabled={!isAdmin||disabled||undefined} orientation="horizontal"><Checkbox id={`sensitive-${definition.id}`} checked={value} disabled={!isAdmin||disabled} onCheckedChange={next=>{if(value&&next!==true)setConfirm(true);else onChange(next===true);}}/><FieldLabel htmlFor={`sensitive-${definition.id}`}>{t('userSensitive')}</FieldLabel></Field><FieldDescription>{t('sensitivitySummary')}</FieldDescription><SettingsHelp title={t('permissionRulesTitle')}>{t('sensitivityHelp')} {t('permissionAdministrationHelp')}</SettingsHelp></FieldSet><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('disableSensitivity')}</AlertDialogTitle><AlertDialogDescription>{t('disableSensitivityHelp')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>{onChange(false);setConfirm(false);}}>{t('disableSensitivityConfirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></SettingsSection>;
}
