import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';
import {ChevronDownIcon,Link2Icon,PlusIcon} from 'lucide-react';
import type {FieldValue,RelatedRecord,RelationshipField} from '@xobject/contracts';
import {api} from '@/lib/api';
import {linkMenuGroups} from '@/lib/linked-record';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent} from '@/components/ui/dropdown-menu';
import {ErrorNotice} from './feedback';
import {RelationshipPicker} from './relationship-picker';

type Props={source:RelatedRecord;version:number;fields:RelationshipField[];sourceValues:Record<string,FieldValue>;workspaceCode:string;disabled:boolean;dirty:boolean;onApply:(field:RelationshipField,targets:RelatedRecord[])=>void;onPickerDirtyChange:(dirty:boolean)=>void};
export function RecordLinkActions({source,version,fields,sourceValues,workspaceCode,disabled,dirty,onApply,onPickerDirtyChange}:Props){
 const {t,i18n}=useTranslation(),navigate=useNavigate();
 const [picker,setPicker]=useState<{field:RelationshipField;objectTypeId:string;label:string;objectLabel:string}|null>(null);
 const options=useQuery({queryKey:['record-link-options',source.objectTypeId,source.recordId,sourceValues,fields.map(f=>[f.definition.id,f.definition.version])],queryFn:()=>api('list_record_link_options',{objectTypeId:source.objectTypeId,recordId:source.recordId,sourceValues})});
 const groups=linkMenuGroups(options.data??[],fields,i18n.language);
 const select=(group:typeof groups[number],choice:typeof groups[number]['choices'][number],create:boolean)=>{
  if(create){void navigate(`/w/${workspaceCode}/objects/${group.objectType.technicalName}/new`,{state:{recordOrigin:`/w/${workspaceCode}/objects/${source.objectTechnicalName}/${source.recordId}`,linkedCreation:{targetObjectTypeId:group.objectType.id,source,labels:choice.field.definition.kind==='general'?choice.field.definition.labels:choice.field.side==='left'?choice.field.definition.leftLabels:choice.field.definition.rightLabels,linkFrom:{objectTypeId:source.objectTypeId,recordId:source.recordId,recordVersion:version,relationshipTypeId:choice.relationshipTypeId,version:choice.field.definition.version,side:choice.side}}}});}
  else setPicker({field:choice.field,objectTypeId:group.objectType.id,label:choice.label,objectLabel:group.label});
 };
 const close=()=>{setPicker(null);onPickerDirtyChange(false);};
 return <>
 {([false,true] as const).map(create=><DropdownMenu key={String(create)}><DropdownMenuTrigger render={<Button id={create?'record-new-link':'record-link-with'} type="button" variant="outline" disabled={disabled||options.isPending||(!options.isError&&!groups.length)||(create&&dirty)} title={create&&dirty?t('linkedRecordSaveFirst'):undefined}/>}>{create?<PlusIcon data-icon="inline-start"/>:<Link2Icon data-icon="inline-start"/>}{t(create?'recordNewLink':'recordLinkWith')}<ChevronDownIcon data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-auto min-w-40 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>
 {options.isError?<DropdownMenuItem onClick={()=>{void options.refetch();}}>{t('retry')}</DropdownMenuItem>:groups.map(group=>group.choices.length===1&&group.choices[0].field.definition.kind==='general'?<DropdownMenuItem key={group.objectType.id} disabled={create?!group.choices[0].canCreate:group.choices[0].canLink===false} onClick={()=>select(group,group.choices[0],create)}>{group.label}</DropdownMenuItem>:<DropdownMenuSub key={group.objectType.id}><DropdownMenuSubTrigger disabled={group.choices.every(choice=>create?!choice.canCreate:choice.canLink===false)}>{group.label}</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuGroup>{group.choices.map(choice=><DropdownMenuItem key={`${choice.relationshipTypeId}:${choice.side}`} disabled={create?!choice.canCreate:choice.canLink===false} onClick={()=>select(group,choice,create)}>{choice.label}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuSubContent></DropdownMenuSub>)}
 </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>)}
 {options.isError?<ErrorNotice error={options.error}/>:null}
 {picker?<RelationshipPicker key={`${picker.objectTypeId}:${picker.field.definition.id}:${picker.field.side}`} sourceValues={sourceValues} targetObjectTypeId={picker.objectTypeId} objectTypeId={source.objectTypeId} recordId={source.recordId} field={picker.field} title={picker.label} dialogTitle={t('recordLinkPickerTitle',{object:picker.objectLabel,relationship:picker.label})} onDirtyChange={onPickerDirtyChange} onClose={close} onApply={targets=>{close();onApply(picker.field,targets);}} finalFocus={()=>document.getElementById('record-link-with')??true}/>:null}
 </>;
}
