import {keyboardCommands,saveShortcutLabel} from '@/lib/keyboard';
import {Kbd} from '@/components/ui/kbd';
import {useEffect,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {primaryChainRoles,primaryChainSchema,type PrimaryChain,type WorkspaceModule} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {DialogActions} from './dialog-actions';
import {ErrorNotice,Loading} from './feedback';
export function PrimaryChainSettings(props:{workspaceId:string;module:WorkspaceModule;readOnly:boolean;disabled:boolean;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const {t}=useTranslation(),[open,setOpen]=useState(false);
  return <FieldGroup><FieldDescription>{props.module.primaryChain?t('primaryChainConfigured'):t('primaryChainSetupRequired')}</FieldDescription><Button type="button" variant="outline" className="w-fit" disabled={props.disabled} onClick={()=>setOpen(true)}>{t(props.readOnly?'primaryChainView':'primaryChainConfigure')}</Button>{open?<PrimaryChainDialog {...props} onClose={()=>setOpen(false)}/>:null}</FieldGroup>;
}
function PrimaryChainDialog({workspaceId,module,readOnly,disabled,onClose,onDirtyChange,onBusyChange}:{workspaceId:string;module:WorkspaceModule;readOnly:boolean;disabled:boolean;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const {t}=useTranslation(),client=useQueryClient(),[levels,setLevels]=useState<PrimaryChain>(module.primaryChain??{contact:'',project:'',case:''}),[confirm,setConfirm]=useState(false);
  const objects=useQuery({queryKey:['objects',workspaceId,'primary-chain'],queryFn:()=>api('list_object_types',{workspaceId,includeInactive:true})});
  const [baseline]=useState(()=>({version:module.version,levels:module.primaryChain??{contact:'',project:'',case:''}}));
  const dirty=JSON.stringify(levels)!==JSON.stringify(baseline.levels);
  const mutation=useMutation({mutationFn:()=>api('configure_primary_chain',{workspaceId,version:baseline.version,levels}),onSuccess:async()=>{for(const key of ['workspace-modules','record-relationships','primary-chain-context','relationship-candidates','relationship-tree','system-journal'])await client.invalidateQueries({queryKey:[key]});onDirtyChange(false);onClose();}});
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(mutation.isPending);return()=>onBusyChange(false);},[mutation.isPending,onBusyChange]);
  const close=()=>{if(mutation.isPending)return;if(dirty)setConfirm(true);else onClose();};
  return <><Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl" closeButtonDisabled={mutation.isPending}><DialogHeader className="pr-8"><DialogTitle>{t('primaryChainConfigure')}</DialogTitle><DialogDescription>{t('primaryChainConfigurationHelp')}</DialogDescription></DialogHeader>
    <form className="min-w-0" id="primary-chain-settings-form" data-shortcut-submit onSubmit={event=>{event.preventDefault();event.stopPropagation();if(!readOnly&&!disabled&&dirty&&primaryChainSchema.safeParse(levels).success&&!mutation.isPending)mutation.mutate();}}>{objects.isPending?<Loading/>:objects.isError?<ErrorNotice error={objects.error}/>:<FieldGroup>{primaryChainRoles.map(role=>{const items=objects.data.filter(object=>object.state==='active'||object.id===levels[role]).map(object=>({value:object.id,label:object.label})).sort((a,b)=>a.label.localeCompare(b.label));return <Field key={role}><FieldLabel htmlFor={`chain-${role}`}>{t(`primaryRole_${role}`)}</FieldLabel><Select items={items} value={levels[role]||null} disabled={readOnly||disabled||mutation.isPending} onValueChange={value=>{if(value)setLevels(old=>({...old,[role]:value}));}}><SelectTrigger id={`chain-${role}`} className="w-full"><SelectValue placeholder={t('selectObjectType')}/></SelectTrigger><SelectContent><SelectGroup>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;})}</FieldGroup>}
    {Object.values(levels).every(Boolean)&&!primaryChainSchema.safeParse(levels).success?<FieldDescription>{t('primaryChainDistinct')}</FieldDescription>:null}{mutation.isError?<ErrorNotice error={mutation.error}/>:null}</form>
    <DialogActions onClose={close} disabled={mutation.isPending}>{!readOnly?<><Button type="button" variant="outline" disabled={!dirty||mutation.isPending} onClick={()=>{setLevels(baseline.levels);mutation.reset();}}>{t('resetPreferences')}</Button><Button form="primary-chain-settings-form" type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty||!primaryChainSchema.safeParse(levels).success||mutation.isPending||disabled}>{t(mutation.isPending?'saving':'save')}<Kbd>{saveShortcutLabel}</Kbd></Button></>:null}</DialogActions>
  </DialogContent></Dialog><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('relationshipDiscardSelection')}</AlertDialogTitle><AlertDialogDescription>{t('primaryChainDiscardHelp')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onClose}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
