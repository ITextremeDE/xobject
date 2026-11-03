import {cn} from '@/lib/utils';
import {Fragment,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {Link} from 'react-router';
import {ArrowUpRightIcon,ChevronRightIcon,Link2Icon,PencilIcon,XIcon} from 'lucide-react';
import {primaryRolesForObject,primaryChainRoles,type PrimaryChain,type PrimaryChainRole,type RelationshipField,type RelatedRecord} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Badge} from '@/components/ui/badge';
import {Field,FieldGroup,FieldLabel,FieldSet,FieldLegend,FieldDescription} from '@/components/ui/field';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from '@/components/ui/input-group';
import {Skeleton} from '@/components/ui/skeleton';
import {RelationshipPicker} from './relationship-picker';
import {ErrorNotice} from './feedback';
type Props={configuration:PrimaryChain|null;field:RelationshipField;objectTypeId:string;recordId?:string;workspaceCode:string;disabled:boolean;readOnly?:boolean;onChange:(targets:RelatedRecord[])=>void;onPickerDirtyChange:(dirty:boolean)=>void};
export function PrimaryAssociationFields({configuration,field,objectTypeId,recordId,workspaceCode,disabled,readOnly,onChange,onPickerDirtyChange}:Props) {
  const {t,i18n}=useTranslation(),[picker,setPicker]=useState<PrimaryChainRole|null>(null),target=field.targets[0]??null;
  const context=useQuery({queryKey:['primary-chain-context',objectTypeId,recordId,target?.objectTypeId,target?.recordId,configuration,i18n.language],queryFn:()=>api('get_primary_chain_context',{objectTypeId,recordId,parent:target?{objectTypeId:target.objectTypeId,recordId:target.recordId}:null}),enabled:Boolean(configuration)});
  if(!configuration)return <FieldSet><FieldLegend>{t('primaryChainTitle')}</FieldLegend><FieldDescription>{t('primaryChainSetupRequired')}</FieldDescription></FieldSet>;
  const roles=primaryRolesForObject(configuration,objectTypeId),directRole=target?primaryChainRoles.find(role=>configuration[role]===target.objectTypeId):undefined;
  const id=(role:PrimaryChainRole)=>`primary-${field.definition.id}-${role}`;
  const close=()=>{onPickerDirtyChange(false);setPicker(null);};
  return <FieldSet><FieldLegend>{t('primaryChainTitle')}</FieldLegend><FieldDescription>{t('primaryChainHelp')}</FieldDescription>
    {context.isError?<ErrorNotice error={context.error} retry={()=>{void context.refetch();}}/>:null}
    {/* This grid uses page breakpoints; keep intrinsic height without another size-query container. */}
    <FieldGroup className={cn("grid min-w-0 items-start gap-3 [container-type:normal]",roles.length===3&&"md:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_1rem_minmax(0,1fr)]",roles.length===2&&"md:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)]")}>
      {roles.map((role,index)=>{
        const direct=role===directRole,record=direct?target:context.isSuccess?context.data.levels.find(level=>level.role===role)?.record??null:null;
        const inherited=Boolean(record&&!direct),editable=!readOnly&&field.definition.active&&(!directRole||primaryChainRoles.indexOf(role)>=primaryChainRoles.indexOf(directRole));
        const label=t(`primaryRole_${role}`);
        return <Fragment key={role}>{index?<ChevronRightIcon aria-hidden className="size-4 justify-self-center rotate-90 md:mt-9 md:rotate-0"/>:null}<Field className="min-w-0"><FieldLabel htmlFor={id(role)}>{label}{inherited?<Badge variant="secondary">{t('primaryChainInherited')}</Badge>:null}</FieldLabel>
          <InputGroup><InputGroupInput id={id(role)} readOnly disabled={disabled} value={record?.keyword??''} title={record?.keyword} placeholder={context.isPending&&!direct?t('loading'):t('noSelection')}/><InputGroupAddon align="inline-end" className="gap-0.5">
            {editable?<InputGroupButton id={`${id(role)}-choose`} disabled={disabled} size="icon-xs" title={t(record?'relationshipChange':'relationshipChoose')} aria-label={t('relationshipChooseFor',{name:label})} onClick={()=>setPicker(role)}>{direct?<PencilIcon/>:<Link2Icon/>}</InputGroupButton>:null}
            {record?<InputGroupButton size="icon-xs" disabled={disabled} nativeButton={false} title={t('openRecord')} aria-label={t('relationshipOpenRecord',{name:record.keyword})} render={<Link to={`/w/${workspaceCode}/objects/${record.objectTechnicalName}/${record.recordId}`}/>}><ArrowUpRightIcon/></InputGroupButton>:null}
            {direct&&!readOnly&&field.definition.active?<InputGroupButton size="icon-xs" disabled={disabled} title={t('removeRelationship',{name:record?.keyword})} aria-label={t('removeRelationship',{name:record?.keyword})} onClick={()=>{onChange([]);requestAnimationFrame(()=>document.getElementById(`${id(role)}-choose`)?.focus());}}><XIcon/></InputGroupButton>:null}
          </InputGroupAddon></InputGroup>
        </Field></Fragment>;
      })}
    </FieldGroup>
    {context.isPending?<Skeleton className="h-1 w-full"/>:null}
    {picker?<RelationshipPicker objectTypeId={objectTypeId} recordId={recordId} field={field} title={t(`primaryRole_${picker}`)} targetObjectTypeId={configuration[picker]} onDirtyChange={onPickerDirtyChange} onClose={close} onApply={targets=>{close();onChange(targets);}} finalFocus={()=>document.getElementById(`${id(picker)}-choose`)??true}/>:null}
  </FieldSet>;
}
