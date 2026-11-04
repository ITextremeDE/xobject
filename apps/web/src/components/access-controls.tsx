import {useEffect,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {accessLevels} from '@xobject/contracts';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {DialogActions} from './dialog-actions';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {Kbd} from '@/components/ui/kbd';
import {keyboardCommands,saveShortcutLabel} from '@/lib/keyboard';
export function AccessSaveButton({form,disabled,busy}:{form:string;disabled:boolean;busy:boolean}){
 const {t}=useTranslation();return <Button form={form} type="submit" disabled={disabled||busy} aria-keyshortcuts={keyboardCommands.save.aria}>{busy?<Spinner aria-hidden="true" data-icon="inline-start"/>:null}{t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button>;
}
export function AccessSelect({value,onChange,disabled,label,id,ownership=false,inherit=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean;label:string;id?:string;ownership?:boolean;inherit?:boolean}){
 const {t}=useTranslation();const items=[...(inherit?[{value:'inherit',label:t('permissionInherit')}]:[]),...accessLevels.filter((_,i)=>!ownership||i>=2).map(value=>({value,label:t(`permission_${value}`)}))];
 return <Select items={items} value={value} disabled={disabled} onValueChange={v=>{if(v)onChange(v);}}><SelectTrigger id={id} className="w-full" aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
export function AccessChoice({value,onChange,items,label,id,disabled}:{value:string;onChange:(v:string)=>void;items:{value:string;label:string}[];label:string;id?:string;disabled?:boolean}){
 return <Select items={items} value={value} disabled={disabled} onValueChange={v=>{if(v!==null)onChange(v);}}><SelectTrigger id={id} className="w-full" aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
export function AccessDialog({title,description,dirty,busy,onClose,actions,children,onBusyChange}:{title:string;description:string;dirty:boolean;busy:boolean;onClose:()=>void;actions?:ReactNode;children:ReactNode;onBusyChange?:(busy:boolean)=>void}){
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const {t}=useTranslation(),[discard,setDiscard]=useState(false);const close=()=>{if(!busy){if(dirty)setDiscard(true);else onClose();}};
 return <><Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="bg-background text-foreground flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl" closeButtonDisabled={busy}><DialogHeader className="px-4 pt-4 pr-12"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div><DialogActions onClose={close} disabled={busy}>{actions}</DialogActions></DialogContent></Dialog>
 <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onClose}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
