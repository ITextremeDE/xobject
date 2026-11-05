import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {temporalSchema,temporalInstant,timestampCandidates,type FieldDefinition,type FieldValue,type TemporalValue} from '@xobject/contracts';
import {useTimeZone,TimeZoneProvider} from '@/lib/time-zone-context';
import {localTimestamp,isInstant} from '@/lib/time-zone';
import {RegionalTemporalField} from './regional-temporal-field';
import {TimeZoneField} from './time-zone-field';
import {FieldGroup,Field,FieldLabel,FieldDescription} from './ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from './ui/select';
import {Button} from './ui/button';

export function DomainTemporalControl({field,value,disabled,onChange,error}:{field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void;error?:string}){
 const {t}=useTranslation(),effectiveZone=useTimeZone(),parsed=temporalSchema.safeParse(value);
 const [draftKind,setDraftKind]=useState<TemporalValue['kind']>(()=>parsed.success?parsed.data.kind:'date'),[draftZone,setDraftZone]=useState(effectiveZone);
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as {kind?:TemporalValue['kind'];local?:string;timeZone?:string}:null;
 useEffect(()=>{if(raw?.kind)setDraftKind(raw.kind);if(raw?.timeZone)setDraftZone(raw.timeZone);},[raw?.kind,raw?.timeZone]);
 const validationError=error??(value!==null&&!parsed.success?t('structuredInvalid'):undefined);
 const kind=raw?.kind??draftKind,zone=kind==='instant'?'UTC':raw?.timeZone??draftZone,base=`temporal-${field.id}`;
 let scalar:FieldValue=null;
 if(parsed.success)scalar=parsed.data.kind==='date'?parsed.data.date:temporalInstant(parsed.data);
 else if(value!==null)scalar=typeof value==='string'?value:raw?.local??'';
 function change(next:FieldValue){
  if(next===null||next===''){onChange(null);return;}
  if(kind==='date'){onChange({kind:'date',date:String(next)});return;}
  if(isInstant(String(next))){
   if(kind==='instant')onChange({kind:'instant',instant:String(next)});
   else {const local=localTimestamp(String(next),zone),candidates=timestampCandidates(local,zone);onChange({kind:'zoned',local,timeZone:zone,occurrence:candidates.length===2?(candidates[1]===next?'later':'earlier'):null});}
  }else onChange(kind==='instant'?String(next):{kind:'zoned',local:String(next),timeZone:zone,occurrence:null});
 }
 const options=<FieldGroup className="gap-3">
    <Field><FieldLabel htmlFor={base}>{t('temporalFormat')}</FieldLabel><Select items={(['date','zoned','instant'] as const).map(k=>({value:k,label:t(`temporal_${k}`)}))} value={kind} disabled={disabled||value!==null} onValueChange={next=>{if(next)setDraftKind(next as TemporalValue['kind']);}}><SelectTrigger id={base} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{(['date','zoned','instant'] as const).map(k=><SelectItem key={k} value={k}>{t(`temporal_${k}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {kind==='zoned'?<TimeZoneField showHelp={false} id={`${base}-zone`} value={zone} disabled={disabled||value!==null} onChange={next=>{if(next)setDraftZone(next);}}/>:null}
    <FieldDescription>{t('temporalFormatHelp')}</FieldDescription>
    {value!==null?<Button type="button" variant="outline" className="w-fit" disabled={disabled} onClick={()=>{setDraftKind(kind);setDraftZone(zone);onChange(null);}}>{t('structuredClear')}</Button>:null}
   </FieldGroup>;
 return <TimeZoneProvider value={zone}><RegionalTemporalField field={{...field,kind:kind==='date'?'date':'datetime'}} value={scalar} disabled={disabled} error={validationError} onChange={change} options={options} summary={kind==='zoned'?zone:kind==='instant'?'UTC':undefined}/></TimeZoneProvider>;
}
