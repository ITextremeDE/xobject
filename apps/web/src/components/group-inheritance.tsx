import {useTranslation} from 'react-i18next';
import {principalKey,type WorkspaceGroup,type WorkspaceMember,type GradedMember,type AccessLevel} from '@xobject/contracts';
import type {Dispatch,SetStateAction} from 'react';
import {AccessSelect} from './access-controls';
import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Checkbox} from '@/components/ui/checkbox';
import {SettingsTable,SettingsTableSearch,useSettingsTable} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {SettingsHelp} from './settings-help';
export function GroupMembershipFields({group,groups,users,readOnly,disabled,value:draft,onChange}:{group:WorkspaceGroup;groups:WorkspaceGroup[];users:WorkspaceMember[];readOnly:boolean;disabled:boolean;value:GradedMember[];onChange:Dispatch<SetStateAction<GradedMember[]>>}){
 const {t,i18n}=useTranslation();
 function createsCycle(id:string){const seen=new Set<string>(),queue=[id];for(let i=0;i<queue.length;i++){const id=queue[i];if(id===group.id)return true;if(seen.has(id))continue;seen.add(id);for(const member of groups.find(g=>g.id===id)?.members??[])if(member.kind==='group')queue.push(member.id);}return false;}
 const candidates=[...users.map(user=>({kind:'user' as const,id:user.id,name:user.name,active:user.active})),...groups.filter(g=>g.id!==group.id&&!createsCycle(g.id)).map(g=>({kind:'group' as const,id:g.id,name:g.name,active:g.active}))].filter(person=>readOnly?draft.some(member=>principalKey(member)===principalKey(person)):person.active||draft.some(member=>principalKey(member)===principalKey(person))).sort((a,b)=>a.name.localeCompare(b.name,i18n.language));
 const {search,onSearch,pagination}=useSettingsTable(candidates,person=>`${person.name} ${t(person.kind==='user'?'reference_user':'reference_group')}`);
 return <FieldGroup><FieldDescription>{t('groupNoCoworkerAccess')}</FieldDescription><SettingsHelp title={t('membershipRulesTitle')}>{t('membershipRulesHelp')}</SettingsHelp>
   <SettingsTableSearch value={search} onChange={onSearch} disabled={disabled}/><SettingsTable aria-label={t('gradedMemberships')}><TableHeader><TableRow><TableHead>{t('accessPrincipalName')}</TableHead><TableHead>{t('membershipRight')}</TableHead></TableRow></TableHeader><TableBody>
    {!pagination.total?<TableRow><TableCell colSpan={2}>{t(search.trim()?'settingsNoMatches':'groupMembersEmpty')}</TableCell></TableRow>:null}
    {pagination.rows.map(person=>{const entry=draft.find(member=>principalKey(member)===principalKey(person));return <TableRow key={principalKey(person)}><TableCell><Field orientation="horizontal"><Checkbox id={`group-member-${person.id}`} aria-label={t('membershipFor',{name:person.name})} checked={Boolean(entry)} disabled={readOnly||disabled} onCheckedChange={checked=>onChange(old=>checked?[...old,{kind:person.kind,id:person.id,level:'full'}]:old.filter(member=>principalKey(member)!==principalKey(person)))}/><FieldLabel htmlFor={`group-member-${person.id}`}>{person.name}</FieldLabel></Field><FieldDescription>{t(person.kind==='group'?'reference_group':'reference_user')}{!person.active?` · ${t('definition_inactive')}`:''}</FieldDescription></TableCell><TableCell>{entry?<AccessSelect label={t('membershipFor',{name:person.name})} ownership value={entry.level} disabled={readOnly||!person.active||disabled} onChange={level=>onChange(old=>old.map(member=>principalKey(member)===principalKey(person)?{...member,level:level as AccessLevel}:member))}/>:<FieldDescription>{t('notAMember')}</FieldDescription>}</TableCell></TableRow>;})}
   </TableBody></SettingsTable><ClientTablePagination pagination={pagination} disabled={disabled} countLabel={t('selectedMembershipCount',{count:draft.length})}/>
 </FieldGroup>;
}
