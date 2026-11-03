import {useTranslation} from 'react-i18next';
import type {FieldDefinition,FieldApplicability} from '@xobject/contracts';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from '@/components/ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {Checkbox} from '@/components/ui/checkbox';
export function FieldApplicabilitySettings({fields,fieldId,value,disabled,onChange,idPrefix='field',title,description}:{fields:FieldDefinition[];idPrefix?:string;title?:string;description?:string;fieldId?:string;value:FieldApplicability;disabled:boolean;onChange:(rule:FieldApplicability)=>void}) {
  const {t,i18n}=useTranslation();
  const controllers=fields.filter(field=>field.id!==fieldId&&field.kind==='single_choice'&&(!field.state||field.state==='active')&&!field.applicability);
  const controller=controllers.find(field=>field.id===value?.fieldId);
  const items=[{value:'always',label:t('fieldAppliesAlways')},...controllers.map(field=>({value:field.id,label:field.label}))];
  return <FieldGroup><Field><FieldLabel htmlFor={`${idPrefix}-applicability`}>{title??t('fieldApplicability')}</FieldLabel><FieldDescription>{description??t('fieldApplicabilityHelp')}</FieldDescription><Select items={items} value={value?.fieldId??'always'} disabled={disabled} onValueChange={id=>{if(id)onChange(id==='always'?null:{fieldId:id,optionIds:[]});}}><SelectTrigger id={`${idPrefix}-applicability`} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  {controller&&value?<FieldSet><FieldLegend variant="label">{t('fieldApplicableOptions')}</FieldLegend><FieldDescription>{t('fieldApplicableOptionsHelp')}</FieldDescription>{controller.config.options?.map(option=><Field key={option.id} orientation="horizontal"><Checkbox id={`${idPrefix}-applies-${option.id}`} checked={value.optionIds.includes(option.id)} disabled={disabled} onCheckedChange={checked=>onChange({...value,optionIds:checked?[...value.optionIds,option.id]:value.optionIds.filter(id=>id!==option.id)})}/><FieldLabel htmlFor={`${idPrefix}-applies-${option.id}`}>{option.labels[i18n.language as 'de'|'en']??option.labels.de??option.labels.en??Object.values(option.labels)[0]}</FieldLabel></Field>)}</FieldSet>:null}</FieldGroup>;
}
