import {useEffect, useState} from 'react';
import {v7} from 'uuid';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {principalKey, type Principal, type ForeignSettings, type AccessLevel, type FieldPrincipal} from '@xobject/contracts';
import {api} from '@/lib/api';
import {AccessSaveButton, AccessDialog, AccessSelect, AccessChoice} from './access-controls';
import {Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend} from '@/components/ui/field';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';
import {Trash2Icon, RotateCcwIcon} from 'lucide-react';
import {ErrorNotice, Loading} from './feedback';
import {SettingsSection} from './settings-section';
import {SettingsHelp} from './settings-help';
import {SettingsTable, SettingsTableSearch, useSettingsTable} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {TableHeader, TableHead, TableBody, TableRow, TableCell} from '@/components/ui/table';

type Props = {workspaceId:string;principal:Principal;ownOnly?:boolean;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void};
export function ForeignAccess(props:Props) {
  const {workspaceId,principal,ownOnly=false}=props, {t}=useTranslation();
  const q=useQuery({queryKey:['foreign-access',workspaceId],queryFn:()=>api('get_foreign_access',{workspaceId})});
  const members=useQuery({queryKey:['workspace-members',workspaceId],queryFn:()=>api('list_workspace_members',{workspaceId})});
  const groups=useQuery({queryKey:['workspace-groups',workspaceId],queryFn:()=>api('list_groups',{workspaceId})});
  const types=useQuery({queryKey:['foreign-types',workspaceId],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true,includeDeleted:true})});
  const error=q.error??members.error??groups.error??types.error;
  const people:FieldPrincipal[]=[...(members.data??[]).map(p=>({id:p.id,name:p.name,kind:'user' as const,active:p.active})),...(groups.data??[]).map(p=>({...p,kind:'group' as const}))];
  if(error||!q.data||!members.data||!groups.data||!types.data)return <AccessDialog title={t('foreignAccess')} description={t(ownOnly?'ownForeignHelp':'foreignAccessHelp')} dirty={false} busy={false} onClose={props.onClose}>{error?<ErrorNotice error={error}/>:<Loading variant="form"/>}</AccessDialog>;
  return <ForeignEditor {...props} ownOnly={ownOnly} initial={q.data} people={people} types={types.data.filter(type=>type.state!=='deleted'||q.data!.rules.some(rule=>Object.hasOwn(rule.objects,type.id)))} key={principalKey(principal)}/>;
}
function ForeignEditor({initial,principal,people,types,ownOnly,onClose,onDirtyChange,onBusyChange}:Props&{initial:ForeignSettings;people:FieldPrincipal[];types:Awaited<ReturnType<typeof api<'list_object_types'>>>}) {
  const {t,i18n}=useTranslation(),client=useQueryClient();
  const [baseline,setBaseline]=useState(initial),[draft,setDraft]=useState(initial);
  const [direction,setDirection]=useState(ownOnly?'in':'out'),[object,setObject]=useState('default');
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  useEffect(()=>{if(!dirty){setBaseline(initial);setDraft(initial);}},[initial]);
  useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);
  const name=(p:Principal)=>people.find(v=>principalKey(v)===principalKey(p))?.name??p.id;
  const other=(rule:ForeignSettings['rules'][number])=>direction==='out'?rule.owner:rule.requester;
  const personLabel=(p:FieldPrincipal)=>`${p.name} · ${t(p.kind==='user'?'reference_user':'reference_group')}`;
  const rows=draft.rules.filter(rule=>principalKey(direction==='out'?rule.requester:rule.owner)===principalKey(principal)).sort((a,b)=>name(other(a)).localeCompare(name(other(b)),i18n.language));
  const principalActive=people.some(p=>principalKey(p)===principalKey(principal)&&p.active);
  const scopeDeleted=types.some(type=>type.id===object&&type.state==='deleted');
  const candidates=people.filter(p=>p.active&&!rows.some(rule=>principalKey(other(rule))===principalKey(p)));
  const {search,onSearch,pagination}=useSettingsTable(rows,rule=>name(other(rule)));
  const save=useMutation({mutationFn:()=>api('configure_foreign_access',draft),onSuccess:async()=>{await client.invalidateQueries();onDirtyChange(false);onClose();}});
  const scopeLabel=object==='default'?t('foreignDefault'):types.find(type=>type.id===object)?.label??object;
  function resetOverride(id:string){setDraft(old=>({...old,rules:old.rules.map(rule=>{if(rule.id!==id)return rule;const objects={...rule.objects};delete objects[object];return {...rule,objects};})}));}
  function update(id:string,level?:AccessLevel,confidential?:boolean){setDraft(old=>({...old,rules:old.rules.map(rule=>rule.id!==id?rule:object==='default'?{...rule,level:level??rule.level,confidential:confidential??rule.confidential}:{...rule,objects:{...rule.objects,[object]:{level:level??rule.objects[object]?.level??rule.level,confidential:confidential??rule.objects[object]?.confidential??rule.confidential}}})}));}
  const settings=draft.users.find(user=>user.userId===principal.id)??{userId:principal.id,inherit:true,manageOwn:false};
  function configureUser(patch:Partial<typeof settings>){setDraft(old=>({...old,users:[...old.users.filter(u=>u.userId!==principal.id),{...settings,...patch}]}));}
  return <AccessDialog title={t('foreignAccessFor',{name:name(principal)})} description={t(ownOnly?'ownForeignHelp':'foreignAccessHelp')} dirty={dirty} busy={save.isPending} onBusyChange={onBusyChange} onClose={onClose} actions={<><Button type="button" variant="outline" disabled={!dirty||save.isPending} onClick={()=>{setBaseline(initial);setDraft(initial);save.reset();}}>{t('resetPreferences')}</Button><AccessSaveButton form="foreign-form" disabled={!dirty} busy={save.isPending}/></>}>
    <form id="foreign-form" data-shortcut-submit onSubmit={event=>{event.preventDefault();if(dirty&&!save.isPending)save.mutate();}}><FieldGroup>
      {save.isError?<ErrorNotice error={save.error}/>:null}
      <SettingsSection><FieldSet><FieldLegend>{t('foreignView')}</FieldLegend><FieldGroup>
        {!ownOnly?<Field><FieldLabel>{t('foreignDirection')}</FieldLabel><ToggleGroup variant="outline" value={[direction]} disabled={save.isPending} onValueChange={values=>{if(values[0]){setDirection(String(values[0]));onSearch('');}}} aria-label={t('foreignDirection')} className="flex-wrap"><ToggleGroupItem value="out">{t('foreignToOthers')}</ToggleGroupItem><ToggleGroupItem value="in">{t('foreignFromOthers')}</ToggleGroupItem></ToggleGroup></Field>:null}
        <FieldDescription>{t(direction==='out'?'foreignOutgoingHelp':'foreignIncomingHelp',{name:name(principal)})}</FieldDescription>
        <Field><FieldLabel htmlFor="foreign-scope">{t('foreignScope')}</FieldLabel><AccessChoice id="foreign-scope" label={t('foreignScope')} value={object} disabled={save.isPending} onChange={setObject} items={[{value:'default',label:t('foreignDefault')},...types.map(type=>({value:type.id,label:type.state==='deleted'?`${type.label} · ${t('definition_deleted')}`:type.label}))]}/><FieldDescription>{t('foreignScopeHelp')}</FieldDescription></Field><SettingsHelp title={t('permissionRulesTitle')}>{t('permissionLevelsHelp')}</SettingsHelp>
      </FieldGroup></FieldSet></SettingsSection>
      <SettingsSection><FieldSet><FieldLegend>{t('foreignRules')}</FieldLegend><FieldDescription>{scopeLabel}</FieldDescription>{!principalActive?<FieldDescription>{t('inactiveForeignHelp')}</FieldDescription>:null}{scopeDeleted?<FieldDescription>{t('deletedForeignScopeHelp')}</FieldDescription>:null}<FieldGroup>
        <SettingsTableSearch value={search} onChange={onSearch} disabled={save.isPending}/>
        <SettingsTable aria-label={t('foreignRules')}><TableHeader className="max-sm:sr-only"><TableRow><TableHead>{t(direction==='out'?'foreignOwner':'foreignRequester')}</TableHead><TableHead>{t('permission')}</TableHead><TableHead>{t('confidentialAccess')}</TableHead><TableHead className="w-12"><span className="sr-only">{t('actions')}</span></TableHead></TableRow></TableHeader><TableBody>
          {!pagination.total?<TableRow><TableCell colSpan={4}>{t(search.trim()?'settingsNoMatches':'foreignRulesEmpty')}</TableCell></TableRow>:null}
          {pagination.rows.map(rule=>{const target=other(rule),person=people.find(p=>principalKey(p)===principalKey(target)),config=object==='default'?rule:rule.objects[object],inactive=!person?.active||!principalActive;return <TableRow key={rule.id} className="max-sm:flex max-sm:flex-col"><TableCell>{name(target)}<FieldDescription>{t(target.kind==='user'?'reference_user':'reference_group')}{inactive?` · ${t('definition_inactive')}`:''}</FieldDescription></TableCell><TableCell><AccessSelect inherit={object!=='default'} label={t('foreignRightFor',{name:name(target)})} value={config?.level??'inherit'} disabled={save.isPending||inactive||scopeDeleted} onChange={value=>value==='inherit'?resetOverride(rule.id):update(rule.id,value as AccessLevel)}/>{!config?<FieldDescription>{t('foreignInheritedLevel',{level:t(`permission_${rule.level}`)})}</FieldDescription>:null}</TableCell><TableCell><Field orientation="horizontal"><Checkbox id={`confidential-${rule.id}`} aria-label={t('confidentialFor',{name:name(target)})} checked={config?.confidential??rule.confidential} disabled={save.isPending||inactive||scopeDeleted} onCheckedChange={value=>update(rule.id,undefined,value===true)}/><FieldLabel className="sm:sr-only" htmlFor={`confidential-${rule.id}`}>{t('confidentialAccess')}</FieldLabel></Field></TableCell><TableCell><Button type="button" variant="ghost" size="icon-sm" disabled={save.isPending||(object!=='default'&&(!config||inactive))} aria-label={t(object==='default'?'removeForeignFor':'resetForeignFor',{name:name(target)})} onClick={()=>object==='default'?setDraft(old=>({...old,rules:old.rules.filter(r=>r.id!==rule.id)})):resetOverride(rule.id)}>{object==='default'?<Trash2Icon/>:<RotateCcwIcon/>}</Button></TableCell></TableRow>;})}
        </TableBody></SettingsTable><ClientTablePagination pagination={pagination} disabled={save.isPending} countLabel={t('foreignRuleCount',{count:pagination.total})}/>
        <Field><FieldLabel htmlFor="foreign-add">{t(direction==='out'?'foreignOwner':'foreignRequester')}</FieldLabel><AccessChoice id="foreign-add" value="" label={t('addForeignRule')} disabled={save.isPending||!candidates.length||!principalActive||scopeDeleted} items={[{value:'',label:t('addForeignRule')},...candidates.map(person=>({value:principalKey(person),label:personLabel(person)}))]} onChange={key=>{const person=candidates.find(p=>principalKey(p)===key);if(person)setDraft(old=>({...old,rules:[...old.rules,{id:v7(),requester:direction==='out'?principal:{kind:person.kind,id:person.id},owner:direction==='out'?{kind:person.kind,id:person.id}:principal,level:object==='default'?'read':'none',confidential:false,objects:object==='default'?{}:{[object]:{level:'read',confidential:false}}}]}));}}/></Field>
        <FieldDescription>{t('foreignNoParticipants')}</FieldDescription>
      </FieldGroup></FieldSet></SettingsSection>
      {principal.kind==='user'?<SettingsSection><FieldSet><FieldLegend>{t('foreignUserSettings')}</FieldLegend><FieldGroup><Field orientation="horizontal"><Checkbox id="foreign-inherit" checked={settings.inherit} disabled={save.isPending||ownOnly} onCheckedChange={value=>configureUser({inherit:value===true})}/><FieldLabel htmlFor="foreign-inherit">{t('inheritForeign')}</FieldLabel></Field>{!ownOnly?<Field orientation="horizontal"><Checkbox id="foreign-delegate" checked={settings.manageOwn} disabled={save.isPending} onCheckedChange={value=>configureUser({manageOwn:value===true})}/><FieldLabel htmlFor="foreign-delegate">{t('delegateOwnForeign')}</FieldLabel></Field>:null}<FieldDescription>{t('foreignInheritanceHelp')}</FieldDescription></FieldGroup></FieldSet></SettingsSection>:null}
    </FieldGroup></form>
  </AccessDialog>;
}
