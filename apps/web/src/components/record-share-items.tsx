import {useTranslation} from 'react-i18next';
import {LinkIcon,Share2Icon} from 'lucide-react';
import {recordURL} from '@/lib/browser-presence';
import {copyToClipboard,notifyError} from '@/lib/notifications';
import {DropdownMenuItem} from './ui/dropdown-menu';
export function RecordShareItems({workspaceCode,technicalName,recordId}:{workspaceCode:string;technicalName:string;recordId:string}){
 const {t}=useTranslation();const url=recordURL(window.location.origin,workspaceCode,technicalName,recordId);
 return <><DropdownMenuItem onClick={()=>{void copyToClipboard(url,t('recordLinkCopied'),t('copyFailed'));}}><LinkIcon/>{t('copyRecordLink')}</DropdownMenuItem>{navigator.share?<DropdownMenuItem onClick={()=>{void navigator.share({title:'xObject',url}).catch(error=>{if(error?.name!=='AbortError')notifyError(t('shareFailed'));});}}><Share2Icon/>{t('shareRecordLink')}</DropdownMenuItem>:null}</>;
}
