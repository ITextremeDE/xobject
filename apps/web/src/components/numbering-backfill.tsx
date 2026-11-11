import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {HashIcon,RefreshCwIcon} from 'lucide-react';
import {api} from '@/lib/api';
import {notifySuccess} from '@/lib/notifications';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {DialogActions} from './dialog-actions';
import {FieldDescription,FieldGroup} from './ui/field';
import {Spinner} from './ui/spinner';
import {ErrorNotice,Loading} from './feedback';
import type {ObjectDefinition} from '@xobject/contracts';

/** A frozen, explicit preview: background refreshes never change the batch being confirmed. */
export function NumberingBackfill({definition,disabled,onBusyChange}:{definition:ObjectDefinition;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const {t}=useTranslation(),client=useQueryClient(),[open,setOpen]=useState(false);
 const preview=useMutation({mutationFn:async()=>{const current=await api('get_object_type',{objectTypeId:definition.id});if(current.version!==definition.version)await client.invalidateQueries({queryKey:['definition',definition.id]});return api('get_numbering_backfill_preview',{objectTypeId:definition.id,version:current.version});}});
 const run=useMutation({mutationFn:()=>api('backfill_record_numbers',{objectTypeId:definition.id,version:preview.data!.version,previewToken:preview.data!.previewToken,confirm:true}),onSuccess:async result=>{
  setOpen(false);notifySuccess(t('numberingBackfillDone',{count:result.assigned}));
  await Promise.all(['records','workspace-records','record','record-duplicate','record-relationships','relationship-candidates','search','dashboard','journal','system-journal','recycled-records'].map(key=>client.invalidateQueries({queryKey:[key]})));
 }});
 useEffect(()=>{onBusyChange(run.isPending);return ()=>onBusyChange(false);},[run.isPending,onBusyChange]);
 function refresh(){run.reset();preview.reset();preview.mutate();}
 const plan=preview.data;
 return <><FieldGroup className="gap-2"><div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>{setOpen(true);refresh();}}><HashIcon data-icon="inline-start"/>{t('numberingBackfill')}</Button></div><FieldDescription>{t(disabled?'numberingBackfillSaveFirst':'numberingBackfillHelp')}</FieldDescription></FieldGroup>
 <Dialog open={open} onOpenChange={value=>{if(!run.isPending)setOpen(value);}}><DialogContent closeButtonDisabled={run.isPending} className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-xl"><DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('numberingBackfillTitle',{object:definition.label})}</DialogTitle><DialogDescription>{t('numberingBackfillScope')}</DialogDescription></DialogHeader>
 <div className="min-h-0 overflow-y-auto px-4 pb-4"><FieldGroup>{preview.isPending?<Loading/>:preview.isError?<ErrorNotice error={preview.error} retry={refresh}/>:plan?<>
  <dl className="grid gap-4 sm:grid-cols-3">{[[t('numberingBackfillMissing'),plan.eligibleCount],[t('numberingBackfillPreserved'),plan.preservedCount],[t('numberingBackfillRecycled'),plan.recycledCount]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
  {plan.eligibleCount?<><dl className="grid min-w-0 gap-4 sm:grid-cols-2">{[[t('numberingBackfillFirst'),plan.firstNumber],[t('numberingBackfillLast'),plan.lastNumber]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="wrap-anywhere font-medium">{value}</dd></div>)}</dl><FieldDescription>{t('numberingBackfillOrder')}</FieldDescription></>:<FieldDescription>{t('numberingBackfillEmpty')}</FieldDescription>}
 </>:null}{run.isError?<ErrorNotice error={run.error} retry={refresh}/>:null}</FieldGroup></div>
 <DialogActions onClose={()=>setOpen(false)} disabled={run.isPending} closeLabel={t('cancel')}><Button type="button" variant="outline" disabled={preview.isPending||run.isPending} onClick={refresh}><RefreshCwIcon data-icon="inline-start"/>{t('numberingBackfillRefresh')}</Button><Button type="button" disabled={!plan?.eligibleCount||preview.isPending||preview.isError||run.isPending||run.isError} onClick={()=>run.mutate()}>{run.isPending?<Spinner aria-hidden="true" data-icon="inline-start"/>:null}{t(run.isPending?'saving':'numberingBackfillConfirm',{count:plan?.eligibleCount??0})}</Button></DialogActions>
 </DialogContent></Dialog></>;
}
