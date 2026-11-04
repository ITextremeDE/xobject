import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {principalKey,type WorkspaceGroup,type WorkspaceMember,type GradedMember,type AccessLevel} from '@xobject/contracts';
import {api} from '@/lib/api';
import {AccessSaveButton, AccessDialog,AccessSelect} from './access-controls';
import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {SettingsTable,SettingsTableSearch,useSettingsTable} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {ErrorNotice} from './feedback';
import {SettingsHelp} from './settings-help';

type Props={group:WorkspaceGroup;groups:WorkspaceGroup[];users:WorkspaceMember[];readOnly:boolean;onClose:()=>void;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void};
export function GroupInheritance({group,groups,users,readOnly,onClose,onDirtyChange,onBusyChange}:Props){
 const {t,i18n}=useTranslation(),client=useQueryClient();
 const [baseline,setBaseline]=useState(group),[draft,setDraft]=useState<GradedMember[]>(group.members);
 const dirty=JSON.stringify(draft)!==JSON.stringify(baseline.members);
 useEffect(()=>{if(!dirty){setBaseline(group);setDraft(group.members);}},[group]);
 useEffect(()=>onDirtyChange?.(dirty),[dirty,onDirtyChange]);
 function createsCycle(id:string){const seen=new Set<string>(),queue=[id];for(let i=0;i<queue.length;i++){const id=queue[i];if(id===group.id)return true;if(seen.has(id))continue;seen.add(id);for(const member of groups.find(g=>g.id===id)?.members??[])if(member.kind==='group')queue.push(member.id);}return false;}
 const candidates=[...users.map(user=>({kind:'user' as const,id:user.id,name:user.name,active:user.active})),...groups.filter(g=>g.id!==group.id&&!createsCycle(g.id)).map(g=>({kind:'group' as const,id:g.id,name:g.name,active:g.active}))].filter(person=>readOnly?draft.some(member=>principalKey(member)===principalKey(person)):person.active||draft.some(member=>principalKey(member)===principalKey(person))).sort((a,b)=>a.name.localeCompare(b.name,i18n.language));
 const {search,onSearch,pagination}=useSettingsTable(candidates,person=>`${person.name} ${t(person.kind==='user'?'reference_user':'reference_group')}`);
 const save=useMutation({mutationFn:()=>api('configure_group_inheritance',{workspaceId:baseline.workspaceId,groupId:baseline.id,version:baseline.version,members:draft}),onSuccess:async()=>{await client.invalidateQueries();onDirtyChange?.(false);onClose();}});
 return <AccessDialog title={t('membershipRightsFor',{name:group.name})} description={t('gradedMembershipsHelp',{name:group.name})} dirty={dirty} busy={save.isPending} onBusyChange={onBusyChange} onClose={onClose} actions={!readOnly?<><Button type="button" variant="outline" disabled={!dirty||save.isPending} onClick={()=>{setBaseline(group);setDraft(group.members);save.reset();}}>{t('resetPreferences')}</Button><AccessSaveButton form="group-rights" disabled={!dirty} busy={save.isPending}/></>:undefined}>
  <form id="group-rights" data-shortcut-submit onSubmit={event=>{event.preventDefault();if(dirty&&!readOnly&&!save.isPending)save.mutate();}}><FieldGroup>
   {save.isError?<ErrorNotice error={save.error}/>:null}<FieldDescription>{t('groupNoCoworkerAccess')}</FieldDescription><SettingsHelp title={t('membershipRulesTitle')}>{t('membershipRulesHelp')}</SettingsHelp>
   <SettingsTableSearch value={search} onChange={onSearch} disabled={save.isPending}/><SettingsTable aria-label={t('gradedMemberships')}><TableHeader><TableRow><TableHead>{t('accessPrincipalName')}</TableHead><TableHead>{t('membershipRight')}</TableHead></TableRow></TableHeader><TableBody>
    {!pagination.total?<TableRow><TableCell colSpan={2}>{t(search.trim()?'settingsNoMatches':'groupMembersEmpty')}</TableCell></TableRow>:null}
    {pagination.rows.map(person=>{const entry=draft.find(member=>principalKey(member)===principalKey(person));return <TableRow key={principalKey(person)}><TableCell><Field orientation="horizontal"><Checkbox id={`group-member-${person.id}`} aria-label={t('membershipFor',{name:person.name})} checked={Boolean(entry)} disabled={readOnly||save.isPending} onCheckedChange={checked=>setDraft(old=>checked?[...old,{kind:person.kind,id:person.id,level:'full'}]:old.filter(member=>principalKey(member)!==principalKey(person)))}/><FieldLabel htmlFor={`group-member-${person.id}`}>{person.name}</FieldLabel></Field><FieldDescription>{t(person.kind==='group'?'reference_group':'reference_user')}{!person.active?` · ${t('definition_inactive')}`:''}</FieldDescription></TableCell><TableCell>{entry?<AccessSelect label={t('membershipFor',{name:person.name})} ownership value={entry.level} disabled={readOnly||!person.active||save.isPending} onChange={level=>setDraft(old=>old.map(member=>principalKey(member)===principalKey(person)?{...member,level:level as AccessLevel}:member))}/>:<FieldDescription>{t('notAMember')}</FieldDescription>}</TableCell></TableRow>;})}
   </TableBody></SettingsTable><ClientTablePagination pagination={pagination} disabled={save.isPending} countLabel={t('selectedMembershipCount',{count:draft.length})}/>
  </FieldGroup></form>
 </AccessDialog>;
}
