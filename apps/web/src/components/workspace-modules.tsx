import {SettingsSection} from './settings-section';
import {useEffect} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {SettingsHelp} from './settings-help';
import {api} from '@/lib/api';
import {Checkbox} from '@/components/ui/checkbox';
import {Badge} from '@/components/ui/badge';
import {Field,FieldDescription,FieldGroup,FieldLabel,FieldLegend,FieldSet} from '@/components/ui/field';
import {ErrorNotice,Loading} from './feedback';

export function WorkspaceModules({workspaceId,readOnly,disabled,onBusyChange}:{workspaceId:string;readOnly:boolean;disabled:boolean;onBusyChange:(busy:boolean)=>void}) {
  const {t,i18n}=useTranslation(),client=useQueryClient();
  const modules=useQuery({queryKey:['workspace-modules',workspaceId],queryFn:()=>api('list_workspace_modules',{workspaceId})});
  const mutation=useMutation({mutationFn:({key,enabled,version}:{key:'contacts'|'projects'|'documents';enabled:boolean;version:number})=>api('configure_workspace_module',{workspaceId,key,enabled,version}),onSettled:async()=>{
    for(const key of ['workspace-modules','types','objects','definition','workspace-records','workspace-dashboard','relationship-types','record-relationships','primary-chain-context','relationship-candidates','relationship-tree','system-journal'])await client.invalidateQueries({queryKey:[key]});
  }});
  useEffect(()=>onBusyChange(mutation.isPending),[mutation.isPending,onBusyChange]);
  const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.en??labels.de??'';
  if(modules.isPending)return <Loading variant="module"/>;
  if(modules.isError)return <ErrorNotice error={modules.error}/>;
  return <FieldGroup className="gap-4"><FieldDescription>{t('workspaceModulesHelp')}</FieldDescription>{!readOnly?<FieldDescription>{t('moduleChangesImmediate')}</FieldDescription>:null}{mutation.isError?<ErrorNotice error={mutation.error}/>:null}
    {modules.data.map(module=><SettingsSection key={module.key}><FieldSet><FieldLegend className="flex flex-wrap items-center gap-2">{label(module.labels)}<Badge variant="secondary">{t(!module.available?'modulePlanned':module.enabled?'moduleEnabled':'moduleDisabled')}</Badge></FieldLegend><FieldGroup className="gap-3">
      <FieldDescription>{label(module.description)}</FieldDescription>
      <FieldDescription>{t('moduleObjects',{objects:module.objects.map(object=>label(object.labels)).join(', ')})}</FieldDescription>
      {module.available?<Field orientation="horizontal" data-disabled={readOnly||disabled||mutation.isPending||undefined}><Checkbox id={`module-${module.key}`} checked={module.enabled} disabled={readOnly||disabled||mutation.isPending} onCheckedChange={value=>mutation.mutate({key:module.key,enabled:Boolean(value),version:module.version})}/><FieldLabel htmlFor={`module-${module.key}`}>{t('moduleEnabledForWorkspace')}</FieldLabel></Field>:<FieldDescription>{t('moduleNotAvailableHelp')}</FieldDescription>}
      {module.key==='projects'?<><SettingsHelp title={t('moduleActivationDetails')}>{t('projectsModuleFoundationHelp')}</SettingsHelp><Field><FieldLabel>{t('primaryChainTitle')}</FieldLabel><FieldDescription>{t(module.enabled?'primaryChainFixedHelp':'primaryChainAbsentHelp')}</FieldDescription></Field></>:null}
    </FieldGroup></FieldSet></SettingsSection>)}
  </FieldGroup>;
}
