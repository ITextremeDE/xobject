import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {principalKey,type RecordSecurity,type Outputs} from '@xobject/contracts';
import {toggleRecordOwner,widensPublicAccess} from '@/lib/record-access';
import {Field,FieldLabel,FieldDescription,FieldError} from '@/components/ui/field';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from '@/components/ui/input-group';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem} from '@/components/ui/command';
import {Checkbox} from '@/components/ui/checkbox';
import {ChevronsUpDownIcon,SlidersHorizontalIcon,UserIcon,UsersIcon} from 'lucide-react';

type Snapshot=Outputs['get_record_security'];
export function RecordAccessField({activity=false,snapshot,value,confirmed,disabled,onChange,onConfirm,onDetails}:{activity?:boolean;snapshot:Snapshot;value:RecordSecurity;confirmed:boolean;disabled:boolean;onChange:(policy:RecordSecurity)=>void;onConfirm:(confirmed:boolean)=>void;onDetails:()=>void}){
 const {t}=useTranslation(),[open,setOpen]=useState(false);
 const readonly=disabled||!snapshot.canManage,publicAccess=value.publicLevel!==null;
 const names=value.owners.map(owner=>snapshot.principals.find(person=>principalKey(person)===principalKey(owner))?.name??owner.id);
 const summary=[...names,...(publicAccess?[t('workspacePublic')]:[])].join(', ');
 const missing=!value.owners.length&&!publicAccess,conflict=publicAccess&&value.privacy!=='normal';
 const candidates=snapshot.principals.filter(person=>person.assignable||value.owners.some(owner=>principalKey(owner)===principalKey(person)));
 return <Field data-invalid={missing||conflict||undefined}><FieldLabel htmlFor="record-access-principals">{t('accessPrincipalsLabel')}</FieldLabel>
  <InputGroup><InputGroupInput id="record-access-principals" value={summary} placeholder={t('chooseAccessPrincipal')} readOnly aria-haspopup={!readonly?'dialog':undefined} aria-describedby="record-access-summary" aria-invalid={missing||conflict} onClick={()=>{if(!readonly)setOpen(true);}} onKeyDown={event=>{if(!readonly&&['ArrowDown','Enter',' '].includes(event.key)){event.preventDefault();setOpen(true);}}}/><InputGroupAddon align="inline-end">
   <Popover open={open} onOpenChange={setOpen}><PopoverTrigger disabled={readonly} render={<InputGroupButton size="icon-xs" aria-label={t('quickAccessSelection')}/>}><ChevronsUpDownIcon/></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0"><Command><CommandInput placeholder={t('searchAccessPrincipals')} aria-label={t('searchAccessPrincipals')}/><CommandList><CommandEmpty>{t('settingsNoMatches')}</CommandEmpty><CommandGroup heading={t('publicLevel')}><CommandItem value={t('workspacePublic')} data-checked={publicAccess} disabled={value.privacy!=='normal'&&!publicAccess} onSelect={()=>onChange({...value,publicLevel:publicAccess?null:'full'})}>{t('workspacePublic')}</CommandItem></CommandGroup><CommandGroup heading={t('accessPrincipalName')}>
    {candidates.map(person=>{const selected=value.owners.some(owner=>principalKey(owner)===principalKey(person));return <CommandItem key={principalKey(person)} value={`${person.name} ${person.kind} ${person.id}`} data-checked={selected} disabled={!person.assignable&&!selected} aria-label={`${person.name} · ${t(person.kind==='user'?'reference_user':'reference_group')}${selected?` · ${t('accessSelected')}`:''}`} onSelect={()=>onChange(toggleRecordOwner(value,{kind:person.kind,id:person.id}))}>{person.kind==='user'?<UserIcon/>:<UsersIcon/>}<span>{person.name}<span className="block text-xs text-muted-foreground">{t(person.kind==='user'?'reference_user':'reference_group')}{!person.assignable?` · ${t('retainedPrincipal')}`:''}</span></span></CommandItem>;})}
   </CommandGroup></CommandList></Command></PopoverContent></Popover>
   <InputGroupButton size="icon-xs" aria-label={t('accessDetails')} disabled={disabled} onClick={onDetails}><SlidersHorizontalIcon/></InputGroupButton>
  </InputGroupAddon></InputGroup>
  <FieldDescription id="record-access-summary">{t(activity?snapshot.canManage?'activityAccessHelp':'activityAccessReadOnlyHelp':snapshot.canManage?'quickAccessHelp':'quickAccessReadOnlyHelp')} {t('accessPolicySummary',{privacy:t(`privacy_${value.privacy}`),level:t(`permission_${value.foreignMax}`)})}</FieldDescription>
  {missing?<FieldError>{t('emptyOwnersHelp')}</FieldError>:conflict?<FieldError>{t('publicPrivacyConflict')}</FieldError>:null}
  {widensPublicAccess(snapshot.policy,value)?<Field orientation="horizontal"><Checkbox id="record-confirm-public" checked={confirmed} disabled={readonly} onCheckedChange={checked=>onConfirm(checked===true)}/><FieldLabel htmlFor="record-confirm-public">{t('confirmPublicAccess')}</FieldLabel></Field>:null}
 </Field>;
}
