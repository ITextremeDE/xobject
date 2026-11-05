import {SettingsHelp} from './settings-help';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {parseStructuredValue,type FieldDefinition,type FieldValue} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Field,FieldLabel,FieldError} from './ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from './ui/select';
import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';
import {ErrorNotice} from './feedback';

export function ContactTimeZoneControl({field,value,disabled,onChange,error}:{field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void;error?:string}){
 const {t}=useTranslation(),id=`field-${field.id}`;
 const zones=useQuery({queryKey:['time-zone-catalog'],queryFn:()=>api('get_time_zone_catalog',{}),staleTime:Infinity});
 let current:string|null=null,invalid=false;
 try{if(value!==null)current=(parseStructuredValue('time_zone',value) as {timeZone:string}).timeZone;}catch{invalid=true;}
 const items=[{value:'none',label:t('noSelection')},...[...new Set([...(zones.data??[]),...(current?[current]:[])])].sort().map(zone=>({value:zone,label:zone}))];
 return <Field data-disabled={disabled||undefined} data-invalid={invalid||Boolean(error)}><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><Select items={items} value={current??'none'} disabled={disabled||zones.isPending||zones.isError} onValueChange={next=>{if(next)onChange(next==='none'?null:{timeZone:next});}}><SelectTrigger id={id} className="w-full" aria-invalid={invalid||Boolean(error)} aria-describedby={[fieldDescriptionIds(field),`${id}-zone-help`,error||invalid?`${id}-error`:null].filter(Boolean).join(' ')}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><SettingsHelp title={t('contactZoneHelpTitle')}><span id={`${id}-zone-help`}>{t('contactZoneHelp')}</span></SettingsHelp>{error||invalid?<FieldError id={`${id}-error`}>{error??t('structuredInvalid')}</FieldError>:null}{zones.isError?<ErrorNotice error={zones.error} retry={()=>{void zones.refetch();}}/>:null}<FieldExplanation field={field} help/></Field>;
}
