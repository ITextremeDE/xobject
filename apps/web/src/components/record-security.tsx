import {fieldContextLabel} from '@/lib/field-context-label';
import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {accessLevels, accessRank, membershipRights, principalKey, type RecordSecurity, type Principal, type AccessLevel, type ObjectDefinition, type FieldLevel} from '@xobject/contracts';
import {api} from '@/lib/api';
import {AccessDialog, AccessSelect, AccessChoice} from './access-controls';
import {Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend} from '@/components/ui/field';
import {Checkbox} from '@/components/ui/checkbox';
import {Kbd} from '@/components/ui/kbd';
import {keyboardCommands,saveShortcutLabel} from '@/lib/keyboard';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Alert, AlertTitle, AlertDescription} from '@/components/ui/alert';
import {Trash2Icon, UsersIcon, ShieldCheckIcon} from 'lucide-react';
import {ErrorNotice, Loading} from './feedback';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {sameRecordSecurity} from '@/lib/record-access';
import {SettingsSection} from './settings-section';
import {SettingsHelp} from './settings-help';
import {SettingsTable, SettingsTableSearch, useSettingsTable} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {TableHeader, TableHead, TableBody, TableRow, TableCell} from '@/components/ui/table';

type Snapshot=Awaited<ReturnType<typeof api<'get_record_security'>>>;
type Props={definition:ObjectDefinition;snapshot:Snapshot;value:RecordSecurity;confirmed:boolean;onClose:()=>void;onApply:(policy:RecordSecurity,confirmed:boolean)=>void;onDirtyChange:(dirty:boolean)=>void};
export function RecordSecurityDialog(props:Props) {
 const {definition,onClose}=props,{t}=useTranslation();
 const groups=useQuery({queryKey:['workspace-groups',definition.workspaceId],queryFn:()=>api('list_groups',{workspaceId:definition.workspaceId})});
 if(groups.isError||!groups.data)return <AccessDialog title={t('accessDetails')} description={t('accessDetailsHelp')} dirty={false} busy={false} onClose={onClose}>{groups.isError?<ErrorNotice error={groups.error}/>:<Loading variant="form"/>}</AccessDialog>;
 return <RecordSecurityEditor {...props} groups={groups.data}/>;
}
function RecordSecurityEditor({definition,snapshot,value,confirmed:initialConfirmed,groups,onClose,onApply,onDirtyChange}:Props&{groups:Awaited<ReturnType<typeof api<'list_groups'>>>}) {
  const {t,i18n}=useTranslation();
  const [baseline]=useState(snapshot),[draft,setDraft]=useState<RecordSecurity>(value),[confirmed,setConfirmed]=useState(initialConfirmed),[fieldPrincipal,setFieldPrincipal]=useState('');
  const dirty=!sameRecordSecurity(draft,value)||confirmed!==initialConfirmed,readOnly=!baseline.canManage,publicAccess=draft.publicLevel!==null;
  useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);
  const people=baseline.principals;
  const name=(p:Principal)=>people.find(person=>principalKey(person)===principalKey(p))?.name??p.id;
  const label=(p:Principal)=>`${name(p)} · ${t(p.kind==='user'?'reference_user':'reference_group')}`;
  const assignable=people.filter(person=>person.assignable&&person.active);
  const fields=[...definition.fields,...(definition.historicalFields??[]),...(definition.relationshipFields??[]).map(f=>({...f,label:`${t('relationshipAttributes')} · ${f.label}`}))].map(field=>({...field,label:fieldContextLabel(field,definition,t)})).filter(field=>field.technicalName!=='access_principals').sort((a,b)=>a.label.localeCompare(b.label,i18n.language));
  const {search,onSearch,pagination}=useSettingsTable(fields,field=>field.label);
  const owners=useSettingsTable(draft.owners,owner=>label(owner));
  const publicWidening=publicAccess&&(!baseline.policy.publicLevel||accessRank(draft.publicLevel!)>accessRank(baseline.policy.publicLevel));
  const valid=Boolean((draft.owners.length||publicAccess)&&(!publicAccess||draft.privacy==='normal')&&(!publicWidening||confirmed));
  const selected=people.find(person=>principalKey(person)===fieldPrincipal),exceptions=draft.fields.find(person=>principalKey(person)===fieldPrincipal)?.fields??{};
  const membership=groups.filter(group=>group.active).flatMap(group=>group.members.filter(member=>member.kind==='group'?groups.some(child=>child.id===member.id&&child.active):people.some(person=>person.kind==='user'&&person.id===member.id&&person.active)).map(member=>({...member,groupId:group.id})));
  function change(next:RecordSecurity){setDraft(next);setConfirmed(false);}
  function reset(){setDraft(value);setConfirmed(initialConfirmed);}
  function expand(owner:RecordSecurity['owners'][number]){
    const expanded=assignable.filter(person=>person.kind==='user'&&membershipRights(person.id,membership).has(owner.id)).map(person=>({kind:person.kind,id:person.id,level:accessLevels[Math.min(accessRank(owner.level),membershipRights(person.id,membership).get(owner.id)!)]}));
    change({...draft,owners:[...draft.owners.filter(person=>principalKey(person)!==principalKey(owner)),...expanded.filter(person=>!draft.owners.some(current=>principalKey(current)===principalKey(person)))]});
  }
  return <AccessDialog title={t('accessDetails')} description={t('accessDetailsHelp')} dirty={dirty} busy={false} onClose={onClose} actions={!readOnly?<><Button type="button" variant="outline" disabled={!dirty} onClick={reset}>{t('resetPreferences')}</Button><Button form="record-access-form" type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty||!valid}>{t('applyToRecord')}<Kbd>{saveShortcutLabel}</Kbd></Button></>:undefined}>
    <form id="record-access-form" data-shortcut-submit onSubmit={event=>{event.preventDefault();event.stopPropagation();if(dirty&&valid&&!readOnly)onApply(draft,confirmed);}}><FieldGroup>
      <Alert><ShieldCheckIcon/><AlertTitle>{t('yourCurrentAccess')} <Badge variant="secondary">{t(`permission_${baseline.effective.level}`)}</Badge></AlertTitle><AlertDescription><p>{t(`accessSource_${baseline.effective.source}`)}</p>{baseline.effective.path.length?<p>{baseline.effective.path.filter(key=>key.startsWith('user:')||key.startsWith('group:')).map(key=>name({kind:key.startsWith('user:')?'user':'group',id:key.slice(key.indexOf(':')+1)})).join(' → ')}</p>:null}<SettingsHelp title={t('permissionRulesTitle')}>{t(baseline.effective.source==='administrator'?'currentAdminAccessHelp':'currentAccessHelp')}</SettingsHelp></AlertDescription></Alert>
      <Tabs defaultValue="owners" className="gap-4"><TabsList variant="line" className="h-auto max-w-full flex-wrap"><TabsTrigger value="owners">{t('accessPrincipalsLabel')}</TabsTrigger><TabsTrigger value="foreign">{t('foreignAccess')}</TabsTrigger><TabsTrigger value="fields">{t('accessFieldTab')}</TabsTrigger></TabsList><TabsContent value="owners"><SettingsSection><FieldSet><FieldLegend>{t('accessPrincipalsLabel')}</FieldLegend><FieldDescription>{t('activityOwnersHelp')}</FieldDescription><FieldGroup>
        <SettingsTableSearch value={owners.search} onChange={owners.onSearch}/>
        <SettingsTable aria-label={t('accessPrincipalsLabel')}><TableHeader className="max-sm:sr-only"><TableRow><TableHead>{t('accessPrincipalName')}</TableHead><TableHead>{t('ownershipLevel')}</TableHead><TableHead className="w-12"><span className="sr-only">{t('actions')}</span></TableHead></TableRow></TableHeader><TableBody>
          {!owners.pagination.total?<TableRow><TableCell colSpan={3}>{t(owners.search.trim()?'settingsNoMatches':'noNamedOwners')}</TableCell></TableRow>:null}
          {owners.pagination.rows.map(owner=>{const person=people.find(person=>principalKey(person)===principalKey(owner)),retained=!person?.assignable;return <TableRow key={principalKey(owner)} className="max-sm:flex max-sm:flex-col"><TableCell>{name(owner)}<FieldDescription>{t(owner.kind==='user'?'reference_user':'reference_group')}{retained?` · ${t('retainedPrincipal')}`:''}</FieldDescription>{owner.kind==='group'&&!readOnly&&!retained?<Button type="button" variant="outline" size="sm" className="mt-2" disabled={!assignable.some(person=>person.kind==='user'&&membershipRights(person.id,membership).has(owner.id))} onClick={()=>expand(owner)}><UsersIcon data-icon="inline-start"/>{t('expandGroup')}</Button>:null}</TableCell><TableCell><AccessSelect label={t('ownershipFor',{name:name(owner)})} ownership disabled={readOnly||retained} value={owner.level} onChange={level=>change({...draft,owners:draft.owners.map(person=>principalKey(person)===principalKey(owner)?{...person,level:level as AccessLevel}:person)})}/></TableCell><TableCell>{!readOnly?<Button type="button" variant="ghost" size="icon-sm" aria-label={t('removeOwner',{name:name(owner)})} onClick={()=>change({...draft,owners:draft.owners.filter(person=>principalKey(person)!==principalKey(owner))})}><Trash2Icon/></Button>:null}</TableCell></TableRow>;})}
        </TableBody></SettingsTable><ClientTablePagination pagination={owners.pagination} countLabel={t('accessPrincipalCount',{count:draft.owners.length})}/>
        {!readOnly?<Field><FieldLabel htmlFor="access-add-owner">{t('addOwner')}</FieldLabel><AccessChoice id="access-add-owner" value="" label={t('addOwner')} items={[{value:'',label:t('addOwner')},...assignable.filter(person=>!draft.owners.some(owner=>principalKey(owner)===principalKey(person))).map(person=>({value:principalKey(person),label:label(person)}))]} onChange={key=>{const person=assignable.find(person=>principalKey(person)===key);if(person)change({...draft,owners:[...draft.owners,{kind:person.kind,id:person.id,level:'full'}]});}}/></Field>:null}
        {draft.owners.some(owner=>owner.kind==='group')?<SettingsHelp title={t('expandGroupHelpTitle')}>{t('expandGroupHelp')}</SettingsHelp>:null}
        <Field orientation="horizontal"><Checkbox id="access-public" disabled={readOnly} checked={publicAccess} onCheckedChange={checked=>change({...draft,publicLevel:checked?'full':null})}/><FieldLabel htmlFor="access-public">{t('workspacePublic')}</FieldLabel></Field>
        {publicAccess?<Field><FieldLabel htmlFor="access-public-level">{t('publicLevel')}</FieldLabel><AccessSelect id="access-public-level" label={t('publicLevel')} ownership disabled={readOnly} value={draft.publicLevel!} onChange={level=>change({...draft,publicLevel:level as AccessLevel})}/><FieldDescription>{t('publicAccessWarning')}</FieldDescription></Field>:null}
        {!draft.owners.length&&!publicAccess?<Alert variant="destructive"><AlertTitle>{t('missingAccessMode')}</AlertTitle><AlertDescription>{t('emptyOwnersHelp')}</AlertDescription></Alert>:null}
      </FieldGroup></FieldSet></SettingsSection>
      </TabsContent><TabsContent value="foreign"><SettingsSection><FieldSet><FieldLegend>{t('foreignLimit')}</FieldLegend><FieldDescription>{t('privacyHelp')}</FieldDescription><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="record-privacy">{t('recordPrivacy')}</FieldLabel><AccessChoice id="record-privacy" label={t('recordPrivacy')} disabled={readOnly} value={draft.privacy} items={['normal','personal','confidential'].map(value=>({value,label:t(`privacy_${value}`)}))} onChange={privacy=>change({...draft,privacy:privacy as RecordSecurity['privacy']})}/></Field><Field><FieldLabel htmlFor="record-foreign-max">{t('foreignLimit')}</FieldLabel><AccessSelect id="record-foreign-max" disabled={readOnly||draft.privacy==='personal'} label={t('foreignLimit')} value={draft.foreignMax} onChange={level=>change({...draft,foreignMax:level as AccessLevel})}/><FieldDescription>{t('foreignMaxHelp')}</FieldDescription></Field></FieldGroup>{publicAccess&&draft.privacy!=='normal'?<Alert variant="destructive"><AlertTitle>{t('publicPrivacyConflict')}</AlertTitle></Alert>:null}</FieldSet></SettingsSection>
      </TabsContent><TabsContent value="fields"><SettingsSection><FieldSet><FieldLegend>{t('recordFieldExceptions')}</FieldLegend><FieldDescription>{t('recordFieldExceptionsHelp')}</FieldDescription><FieldGroup>
        <Field><FieldLabel htmlFor="record-field-principal">{t('chooseAccessPrincipal')}</FieldLabel><AccessChoice id="record-field-principal" label={t('chooseAccessPrincipal')} value={fieldPrincipal} onChange={value=>{setFieldPrincipal(value);onSearch('');}} items={[{value:'',label:t('chooseAccessPrincipal')},...people.filter(person=>person.assignable||draft.fields.some(rule=>principalKey(rule)===principalKey(person))).map(person=>({value:principalKey(person),label:label(person)}))]}/></Field>
        {selected?<><SettingsTableSearch value={search} onChange={onSearch}/><SettingsTable aria-label={t('recordFieldExceptions')}><TableHeader className="max-sm:sr-only"><TableRow><TableHead>{t('fieldName')}</TableHead><TableHead>{t('permission')}</TableHead></TableRow></TableHeader><TableBody>
          {!pagination.total?<TableRow><TableCell colSpan={2}>{t(search.trim()?'settingsNoMatches':'noFieldsYet')}</TableCell></TableRow>:null}
          {pagination.rows.map(field=>{const before=baseline.policy.fields.find(person=>principalKey(person)===fieldPrincipal)?.fields[field.id],cap=baseline.fieldAccess[field.id];const items=[...new Set(['inherit','none',...(cap.read?['read']:[]),...(cap.edit?['edit']:[]),...(before?[before]:[])])].map(value=>({value,label:t(value==='inherit'?'permissionInherit':`permission_${value}`)}));return <TableRow key={field.id} className="max-sm:flex max-sm:flex-col"><TableCell>{field.label}{field.state!=='active'?<FieldDescription>{t(`definition_${field.state}`)}</FieldDescription>:null}</TableCell><TableCell><AccessChoice disabled={readOnly||!selected.assignable} label={t('permissionForField',{name:field.label})} value={exceptions[field.id]??'inherit'} items={items} onChange={value=>{const fields={...exceptions};if(value==='inherit')delete fields[field.id];else fields[field.id]=value as FieldLevel;change({...draft,fields:[...draft.fields.filter(person=>principalKey(person)!==fieldPrincipal),...(Object.keys(fields).length?[{kind:selected.kind,id:selected.id,fields}]:[])]});}}/></TableCell></TableRow>;})}
        </TableBody></SettingsTable><ClientTablePagination pagination={pagination} countLabel={t('fieldCount',{count:pagination.total})}/>{!readOnly&&Object.keys(exceptions).length?<Button type="button" variant="outline" className="self-start" onClick={()=>change({...draft,fields:draft.fields.filter(person=>principalKey(person)!==fieldPrincipal)})}>{t('clearFieldExceptions')}</Button>:null}</>:<FieldDescription>{t('selectPrincipalForFields')}</FieldDescription>}
      </FieldGroup></FieldSet></SettingsSection>
      </TabsContent></Tabs>
      {!readOnly&&publicWidening?<Field orientation="horizontal"><Checkbox id="access-confirm" checked={confirmed} onCheckedChange={value=>setConfirmed(value===true)}/><FieldLabel htmlFor="access-confirm">{t('confirmPublicAccess')}</FieldLabel></Field>:null}
      {!readOnly&&dirty?<FieldDescription>{t('accessDraftEffect')}</FieldDescription>:null}
    </FieldGroup></form>
  </AccessDialog>;
}
