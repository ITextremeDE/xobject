import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ChevronDownIcon} from 'lucide-react';
import type {RelatedRecord,RelationshipField,FieldDefinition,FieldValue} from '@xobject/contracts';
import {CustomFieldControl} from './custom-field-control';
import {FieldGroup,FieldDescription} from './ui/field';
import {Button} from './ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './ui/collapsible';
/** Values stay in the enclosing record draft until its single Save. */
export function RelationshipAttributes({field,targets,workspaceId,disabled,readOnly,onChange}:{field:RelationshipField;targets:RelatedRecord[];workspaceId:string;disabled:boolean;readOnly?:boolean;onChange:(targets:RelatedRecord[])=>void}){
 const {t,i18n}=useTranslation();
 const fields=(field.definition.fields??[]).filter(f=>f.state!=='deleted').sort((a,b)=>Number(['multiple_choice','multiline','structured'].includes(a.kind))-Number(['multiple_choice','multiline','structured'].includes(b.kind)));
 if(!fields.length||!targets.length)return null;
 return <div className="flex min-w-0 flex-col gap-4">{targets.map(target=>{
  const editable=field.editable!==false&&!readOnly&&field.definition.active&&target.state==='active';
  const definitions=fields.filter(f=>target.attributeAccess?.[f.id]?.read!==false).map(f=>({...f,label:f.labels[i18n.language]??f.label,fieldPermissions:target.attributeAccess?.[f.id]}));
  const controls=<FieldGroup className="grid min-w-0 gap-4 sm:grid-cols-2">{definitions.map(source=>{
   const fieldDisabled=disabled||!editable||source.state==='inactive'||source.fieldPermissions?.edit===false;
   return <div key={source.id} className={source.kind==='multiple_choice'||source.kind==='multiline'||source.kind==='structured'?'min-w-0 sm:col-span-2':'min-w-0'}><CustomFieldControl field={{...source,id:`${source.id}-${target.recordId}`}} workspaceId={workspaceId} disabled={fieldDisabled} value={target.attributeValues?.[source.id]??null} onChange={value=>onChange(targets.map(item=>item===target?{...item,attributeValues:{...item.attributeValues,[source.id]:value}}:item))}/></div>;
  })}</FieldGroup>;
  return targets.length===1?<div key={target.recordId}>{controls}</div>:<AttributeSection key={target.recordId} title={target.keyword}>{controls}</AttributeSection>;
 })}<FieldDescription>{t('relationshipAttributesHelp')}</FieldDescription></div>;
}
function AttributeSection({title,children}:{title:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="group/edge w-fit max-w-full justify-start px-0"/>}>{title}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/edge:rotate-180"/></CollapsibleTrigger><CollapsibleContent className="pt-3">{children}</CollapsibleContent></Collapsible>;
}
