import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {Button} from '@/components/ui/button';
import {ChevronDownIcon} from 'lucide-react';
import {PrimaryChainSettings} from './primary-chain-settings';
import { useEffect,useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { ErrorNotice, Loading } from './feedback';
export function WorkspaceModules({workspaceId,readOnly,disabled,onBusyChange,onDirtyChange}:{workspaceId:string;readOnly:boolean;disabled:boolean;onBusyChange:(busy:boolean)=>void;onDirtyChange:(dirty:boolean)=>void}) {
  const [chainBusy,setChainBusy]=useState(false);
  const {t}=useTranslation(),client=useQueryClient();
  const modules=useQuery({queryKey:['workspace-modules',workspaceId],queryFn:()=>api('list_workspace_modules',{workspaceId})});
  const mutation=useMutation({mutationFn:({enabled,version}:{enabled:boolean;version:number})=>api('configure_workspace_module',{workspaceId,key:'projects',enabled,version}),onSettled:async()=>{for(const key of ['workspace-modules','relationship-types','record-relationships','relationship-candidates','relationship-tree','system-journal'])await client.invalidateQueries({queryKey:[key]});}});
  useEffect(()=>onBusyChange(mutation.isPending||chainBusy),[mutation.isPending,chainBusy,onBusyChange]);
  if(modules.isPending)return <Loading/>;
  if(modules.isError)return <ErrorNotice error={modules.error}/>;
  const projects=modules.data[0];
  return <FieldSet><FieldLegend>{t('workspaceModules')}</FieldLegend><FieldGroup><Field orientation="horizontal"><Checkbox id="projects-module" checked={projects.enabled} disabled={readOnly||disabled||mutation.isPending} onCheckedChange={value=>mutation.mutate({enabled:Boolean(value),version:projects.version})}/><FieldLabel htmlFor="projects-module">{t('projectsModule')}</FieldLabel></Field><FieldDescription>{t('projectsModuleHelp')}</FieldDescription>{!readOnly?<FieldDescription>{t('moduleChangesImmediate')}</FieldDescription>:null}{mutation.isError?<ErrorNotice error={mutation.error}/>:null}{projects.enabled?<PrimaryChainSettings workspaceId={workspaceId} module={projects} readOnly={readOnly} disabled={disabled||mutation.isPending} onBusyChange={setChainBusy} onDirtyChange={onDirtyChange}/>:<Collapsible><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="w-fit px-0"/>}>{t('primaryChainPrepare')}<ChevronDownIcon data-icon="inline-end"/></CollapsibleTrigger><CollapsibleContent className="pt-3"><FieldGroup><FieldDescription>{t('primaryChainDisabledHelp')}</FieldDescription><PrimaryChainSettings workspaceId={workspaceId} module={projects} readOnly={readOnly} disabled={disabled||mutation.isPending} onBusyChange={setChainBusy} onDirtyChange={onDirtyChange}/></FieldGroup></CollapsibleContent></Collapsible>}</FieldGroup></FieldSet>;
}
