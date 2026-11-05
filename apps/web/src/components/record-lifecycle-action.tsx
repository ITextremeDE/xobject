import {useState,useEffect} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {Trash2Icon,Undo2Icon} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Spinner} from '@/components/ui/spinner';
import {ErrorNotice} from './feedback';
export const invalidateRecordViews=(client:ReturnType<typeof useQueryClient>)=>client.invalidateQueries({predicate:query=>['record','records','recycled-record','recycled-records','deleted-records','deleted-journal','journal','dashboard','workspace-records','record-relationships','primary-chain-context','relationship-tree','relationship-candidates','workspace-search','record-security','record-link-options','system-journal'].includes(String(query.queryKey[0]))});
export function RecordLifecycleAction({hideTrigger=false,objectTypeId,recordId,version,name,permanent=false,restore=false,disabled=false,onDone,onBusyChange,open:controlledOpen,onOpenChange}:{hideTrigger?:boolean;open?:boolean;onOpenChange?:(open:boolean)=>void;objectTypeId:string;recordId:string;version:number;name:string;permanent?:boolean;restore?:boolean;disabled?:boolean;onDone:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const {t}=useTranslation(),client=useQueryClient(),[localOpen,setLocalOpen]=useState(false);
 const open=controlledOpen??localOpen,setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
 const mutation=useMutation({mutationFn:async()=>permanent?api('permanently_delete_record',{objectTypeId,recordId,version,confirm:true}):api(restore?'restore_record':'recycle_record',{objectTypeId,recordId,version}),onMutate:()=>onBusyChange?.(true),onSuccess:async()=>{setOpen(false);onBusyChange?.(false);onDone();await invalidateRecordViews(client);},onSettled:()=>onBusyChange?.(false)});
 useEffect(()=>{if(open)mutation.reset();},[open]);
 const Icon=restore?Undo2Icon:Trash2Icon;
 return <>{!hideTrigger?<Button type="button" variant={permanent?'destructive':'outline'} disabled={disabled||mutation.isPending} onClick={()=>{mutation.reset();setOpen(true);}}><Icon data-icon="inline-start"/>{t(permanent?'permanentlyDeleteRecord':restore?'restoreRecord':'recycleRecord')}</Button>:null}<AlertDialog open={open} onOpenChange={value=>{if(!mutation.isPending)setOpen(value);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(permanent?'permanentlyDeleteRecord':restore?'restoreRecord':'recycleRecord')}</AlertDialogTitle><AlertDialogDescription>{t(permanent?'permanentDeleteConfirm':restore?'restoreRecordConfirm':'recycleRecordConfirm',{name})}</AlertDialogDescription></AlertDialogHeader>{mutation.isError?<ErrorNotice error={mutation.error}/>:null}<AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant={restore?'default':'destructive'} disabled={mutation.isPending} onClick={event=>{event.preventDefault();mutation.mutate();}}>{mutation.isPending?<Spinner data-icon="inline-start"/>:<Icon data-icon="inline-start"/>}{t(permanent?'permanentlyDeleteRecord':restore?'restoreRecord':'recycleRecord')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
