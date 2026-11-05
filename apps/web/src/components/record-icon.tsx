import {Building2Icon,ContactRoundIcon,UserRoundIcon,UsersRoundIcon,FolderKanbanIcon,ListTreeIcon,ListTodoIcon,DatabaseIcon,type LucideIcon} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {RecordIconKey} from '@xobject/contracts';
import {Tooltip,TooltipTrigger,TooltipContent} from './ui/tooltip';
export const recordIcons:Record<RecordIconKey,LucideIcon>={object:DatabaseIcon,contact:ContactRoundIcon,organization:Building2Icon,person:ContactRoundIcon,individual:UserRoundIcon,distribution_list:UsersRoundIcon,project:FolderKanbanIcon,case:ListTreeIcon,task:ListTodoIcon};
export function RecordIcon({iconKey='object',objectLabel}:{iconKey?:RecordIconKey;objectLabel?:string}){
 const {t}=useTranslation(),Icon=recordIcons[iconKey]??DatabaseIcon;
 const label=['organization','person','individual'].includes(iconKey)?t(`contactKind_${iconKey}`):objectLabel||t(`recordIcon_${iconKey}`);
 return <Tooltip><TooltipTrigger render={<span/>} className="inline-flex shrink-0 items-center text-muted-foreground" aria-label={label} data-record-icon={iconKey}><Icon className="size-4" aria-hidden="true"/></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
