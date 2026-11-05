import {copyToClipboard} from '@/lib/notifications';
import {useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useNavigate,useLocation} from 'react-router';
import {useTranslation} from 'react-i18next';
import {CopyIcon,Trash2Icon,EllipsisVerticalIcon} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from './ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSeparator} from './ui/dropdown-menu';
import {RecordLifecycleAction} from './record-lifecycle-action';
import {ErrorNotice} from './feedback';
export type RecordActionTarget={objectTypeId:string;recordId:string;workspaceCode:string};
export function CopyRecordIdItem({id}:{id:string}){
 const {t}=useTranslation();
 return <DropdownMenuItem onClick={()=>{void copyToClipboard(id,t('idCopied'),t('copyFailed'));}}><CopyIcon/>{t('copyRecordId')}</DropdownMenuItem>;
}
export function RecordRowActions({target,disabled,children,copyId,onCopy,actionsLabel,copyLabel}:{target?:RecordActionTarget;disabled?:boolean;children:ReactNode;copyId:string;onCopy:()=>void;actionsLabel:string;copyLabel?:string}){
 const {t}=useTranslation(),navigate=useNavigate(),location=useLocation(),client=useQueryClient();
 const [open,setOpen]=useState(false),[recycle,setRecycle]=useState(false),[busy,setBusy]=useState(false);
 const context=useQuery({queryKey:['record-actions',target?.objectTypeId,target?.recordId],enabled:Boolean(target&&open),staleTime:0,retry:false,queryFn:async()=>{const [definition,record]=await Promise.all([api('get_object_type',{objectTypeId:target!.objectTypeId}),api('get_record',{objectTypeId:target!.objectTypeId,recordId:target!.recordId})]);return {definition,record};}});
 const data=context.data,active=data?.definition.state==='active',canDuplicate=active&&data?.record.permissions?.duplicate&&data.definition.permissions?.create,canDelete=active&&data?.record.permissions?.delete;
 return <><DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={disabled||busy} aria-label={actionsLabel}/> }><EllipsisVerticalIcon/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuGroup>{children}{target&&context.isPending?<DropdownMenuItem disabled>{t('loading')}</DropdownMenuItem>:null}{canDuplicate?<DropdownMenuItem onClick={()=>{client.removeQueries({queryKey:['record-duplicate',target!.objectTypeId,target!.recordId]});void navigate(`/w/${target!.workspaceCode}/objects/${data!.definition.technicalName}/new?duplicateFrom=${target!.recordId}`,{state:{recordOrigin:location.pathname+location.search}});}}><CopyIcon/>{t('duplicateRecord')}</DropdownMenuItem>:null}{canDelete?<DropdownMenuItem variant="destructive" onClick={()=>setRecycle(true)}><Trash2Icon/>{t('recycleRecord')}</DropdownMenuItem>:null}</DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuItem onClick={onCopy}><CopyIcon/>{copyLabel??t('copyRecordId')}</DropdownMenuItem></DropdownMenuGroup>{target&&context.isError?<div className="p-2"><ErrorNotice error={context.error} retry={()=>{void context.refetch();}}/></div>:null}</DropdownMenuContent></DropdownMenu>{target&&data?<RecordLifecycleAction hideTrigger open={recycle} onOpenChange={setRecycle} objectTypeId={target.objectTypeId} recordId={target.recordId} version={data.record.version} name={data.record.keyword||copyId} onBusyChange={setBusy} onDone={()=>setRecycle(false)}/>:null}</>;
}
