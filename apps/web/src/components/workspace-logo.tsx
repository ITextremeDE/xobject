import {GalleryVerticalEndIcon,Building2Icon,BriefcaseBusinessIcon,BlocksIcon,FolderKanbanIcon,UsersIcon,NetworkIcon,GlobeIcon,RocketIcon,Code2Icon,LandmarkIcon,WrenchIcon} from 'lucide-react';
import type {WorkspaceLogoIcon} from '@xobject/contracts';
const icons={layers:GalleryVerticalEndIcon,building:Building2Icon,briefcase:BriefcaseBusinessIcon,blocks:BlocksIcon,folder:FolderKanbanIcon,users:UsersIcon,network:NetworkIcon,globe:GlobeIcon,rocket:RocketIcon,code:Code2Icon,landmark:LandmarkIcon,wrench:WrenchIcon};
export function WorkspaceLogo({icon,className}:{icon:WorkspaceLogoIcon;className?:string}){const Icon=icons[icon];return <Icon aria-hidden="true" className={className}/>;}
