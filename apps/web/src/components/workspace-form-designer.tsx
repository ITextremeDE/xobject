import {useSearchParams} from 'react-router';
import {SettingsSection} from './settings-section';
import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import type {AuthUser,Workspace} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {ErrorNotice,Loading} from './feedback';
import {FormLayoutEditor} from './form-layout-editor';

type Props={workspace:Workspace;user:AuthUser;readOnly:boolean;onDirtyChange:(value:boolean)=>void;onBusyChange:(value:boolean)=>void;actionTarget?:HTMLElement|null};
export function WorkspaceFormDesigner({workspace,user,readOnly,onDirtyChange,onBusyChange,actionTarget}:Props){
  const {t}=useTranslation(),language=user.language??workspace.default_language;
  const [params,setParams]=useSearchParams();
  const [fallbackId,setFallbackId]=useState('');
  const selected=params.get('object')??fallbackId,setSelected=(value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('object',value);return next;},{replace:true});
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<string|null>(null);
  const types=useQuery({queryKey:['types',workspace.id,user.id,language,'form-designer'],queryFn:()=>api('list_object_types',{workspaceId:workspace.id,includeInactive:true})});
  const collator=new Intl.Collator(language,{sensitivity:'base'});
  const sorted=[...(types.data??[])].sort((a,b)=>collator.compare(a.label,b.label)||a.id.localeCompare(b.id));
  const id=sorted.some(type=>type.id===selected)?selected:sorted[0]?.id;
  useEffect(()=>{if(!fallbackId&&sorted[0])setFallbackId(sorted[0].id);},[fallbackId,sorted[0]?.id]);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
  const definition=useQuery({queryKey:['definition',id,user.id,language],queryFn:()=>api('get_object_type',{objectTypeId:id!}),enabled:Boolean(id)});
  if(types.isPending)return <Loading variant="designer"/>;
  if(types.isError)return <ErrorNotice error={types.error} retry={()=>{void types.refetch();}}/>;
  if(!sorted.length)return <FieldDescription>{t('formDesignerEmpty')}</FieldDescription>;
  return <FieldGroup>
    <SettingsSection><Field><FieldLabel htmlFor="form-designer-object">{t('selectObjectType')}</FieldLabel><Select items={sorted.map(type=>({value:type.id,label:type.label+(type.state==='inactive'?` (${t('definition_inactive')})`:'')}))} value={id} disabled={busy} onValueChange={value=>{if(!value||value===id)return;if(dirty)setPending(value);else setSelected(value);}}><SelectTrigger id="form-designer-object" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{sorted.map(type=><SelectItem key={type.id} value={type.id}>{type.label}{type.state==='inactive'?` (${t('definition_inactive')})`:''}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></SettingsSection>
    {definition.isPending?<Loading variant="designer"/>:definition.isError?<ErrorNotice error={definition.error} retry={()=>{void definition.refetch();}}/>:<FormLayoutEditor actionTarget={actionTarget} key={definition.data.id} definition={definition.data} readOnly={readOnly||definition.data.state!=='active'} onDirtyChange={setDirty} onBusyChange={setBusy}/>}
    <AlertDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{setDirty(false);setSelected(pending!);setPending(null);}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}
