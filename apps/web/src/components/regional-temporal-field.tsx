import {FieldExplanation,FieldFormatHelp,fieldDescriptionIds} from './record-field-hints';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {CalendarIcon} from 'lucide-react';
import {de,deAT,enUS,enGB,enCA,enAU} from 'react-day-picker/locale';
import type {FieldDefinition,FieldValue} from '@xobject/contracts';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {regionalWeekStart} from '@/lib/regional';
import {isInstant,localTimestamp,timestampCandidates} from '@/lib/time-zone';
import {dateInputPattern,formatDateInput,parseDateInput,isCalendarDate,formatTimeInput,timeInputPattern,parseTimeInput,temporalInputParts,temporalInputValue} from '@/lib/temporal-input';
import {Field,FieldGroup,FieldLabel,FieldError} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from '@/components/ui/input-group';
import {Calendar} from '@/components/ui/calendar';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';

const calendarLocales={'de-DE':de,'de-AT':deAT,'de-CH':de,'en-US':enUS,'en-GB':enGB,'en-CA':enCA,'en-AU':enAU};
export function RegionalTemporalField({field,value,disabled,onChange}:{field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void}){
  const {t}=useTranslation(),regional=useRegional(),zone=useTimeZone(),datetime=field.kind==='datetime';
  const id=`field-${field.id}`,current=typeof value==='string'?value:'';
  const parts=(input:string)=>datetime?temporalInputParts(input,regional,zone):{date:formatDateInput(input,regional),time:''};
  const [draft,setDraft]=useState(()=>parts(current)),[open,setOpen]=useState(false);
  const emitted=useRef(current),format=JSON.stringify(regional)+zone,previousFormat=useRef(format);
  useEffect(()=>{
    if(current!==emitted.current||format!==previousFormat.current)setDraft(parts(current));
    emitted.current=current;previousFormat.current=format;
  },[current,format]);
  const day=parseDateInput(draft.date,regional),clock=datetime?parseTimeInput(draft.time,regional):null;
  const local=day&&clock?`${day}T${clock}`:null;
  const candidates=local?timestampCandidates(local,zone):[];
  const present=Boolean(draft.date.trim()||draft.time.trim());
  const invalid=present&&(!day||(datetime&&(!clock||!isInstant(current))));
  const error=!day?'invalidDateInput':!clock?'invalidTimeInput':candidates.length>1?'ambiguousTime':'nonexistentTime';
  const errorId=`${id}-error`,helpId=`${id}-help`;
  function change(next:typeof draft){
    setDraft(next);
    const result=datetime?temporalInputValue(next.date,next.time,regional,zone,current):next.date.trim()?parseDateInput(next.date,regional)??next.date:null;
    emitted.current=result??'';onChange(result);
  }
  function blur(){
    if(day&&(!datetime||clock))setDraft({date:formatDateInput(day,regional),time:datetime?formatTimeInput(`${day}T${clock}`,regional):''});
  }
  const selected=day?new Date(`${day}T12:00:00`):undefined;
  const today=new Date(`${localTimestamp(new Date().toISOString(),zone).slice(0,10)}T12:00:00`);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  const dateControl=<Popover open={open} onOpenChange={next=>{if(!next||!disabled)setOpen(next);}}><InputGroup>
    <InputGroupInput id={id} aria-label={datetime?t('dateFor',{name:field.label}):undefined} value={draft.date} placeholder={dateInputPattern(regional)} autoComplete="off" maxLength={32} disabled={disabled} required={field.required} aria-invalid={invalid} aria-describedby={`${fieldDescriptionIds(field)??''} ${helpId}${invalid?' '+errorId:''}`} onChange={event=>change({...draft,date:event.target.value})} onBlur={blur}/>
    <InputGroupAddon align="inline-end" className="shrink-0 has-[>button]:mr-0"><PopoverTrigger render={<InputGroupButton size="icon-xs" disabled={disabled} aria-label={t('chooseDateFor',{name:field.label})} title={t('chooseDate')}/>}><CalendarIcon/></PopoverTrigger></InputGroupAddon>
  </InputGroup><PopoverContent aria-label={t('chooseDateFor',{name:field.label})} className="w-auto max-h-(--available-height) overflow-y-auto p-0" align="start"><Calendar disabled={disabled} mode="single" locale={calendarLocales[regional.locale]} weekStartsOn={regionalWeekStart(regional)===1?1:0} today={today} selected={selected} defaultMonth={selected??today} autoFocus labels={{labelNext:()=>t('calendarNextMonth'),labelPrevious:()=>t('calendarPreviousMonth')}} onSelect={date=>{
    if(!date||disabled)return;
    const iso=`${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if(isCalendarDate(iso))change({...draft,date:formatDateInput(iso,regional)});
    setOpen(false);
  }}/></PopoverContent></Popover>;
  return <Field className="@container/temporal min-w-0" data-disabled={disabled||undefined} data-invalid={invalid} aria-labelledby={datetime?`${id}-label`:undefined}>
    {datetime?<><FieldLabel id={`${id}-label`}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><FieldGroup className="grid min-w-0 gap-3 @sm/temporal:grid-cols-2"><Field data-invalid={invalid}><FieldLabel htmlFor={id}>{t('date')}</FieldLabel>{dateControl}</Field><Field data-invalid={invalid}><FieldLabel htmlFor={`${id}-time`}>{t('time')}</FieldLabel><Input id={`${id}-time`} aria-label={t('timeFor',{name:field.label})} value={draft.time} placeholder={timeInputPattern(regional)} maxLength={32} disabled={disabled} required={field.required} autoComplete="off" aria-invalid={invalid} aria-describedby={`${fieldDescriptionIds(field)??''} ${helpId}${invalid?' '+errorId:''}`} onChange={event=>change({...draft,time:event.target.value})} onBlur={blur}/></Field></FieldGroup></>:<><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/>{dateControl}</>}
    <FieldExplanation field={field} help/><FieldFormatHelp id={helpId}>{datetime?t('regionalDateTimeInputHelp',{date:dateInputPattern(regional),time:timeInputPattern(regional),timezone:zone}):t('regionalDateInputHelp',{format:dateInputPattern(regional)})}</FieldFormatHelp>
    {invalid?<FieldError id={errorId}>{t(error,{format:dateInputPattern(regional),time:timeInputPattern(regional)})}</FieldError>:null}
    {datetime&&candidates.length>1?<Select items={candidates.map(instant=>({value:instant,label:`${formatTimeInput(localTimestamp(instant,zone),regional)} ${new Intl.DateTimeFormat(regional.locale,{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName')?.value??''}`}))} value={isInstant(current)?current:null} disabled={disabled} onValueChange={instant=>{if(instant){emitted.current=instant;onChange(instant);}}}><SelectTrigger aria-label={t('timeOccurrence')} className="w-full"><SelectValue placeholder={t('timeOccurrence')}/></SelectTrigger><SelectContent><SelectGroup>{candidates.map(instant=><SelectItem key={instant} value={instant}>{formatTimeInput(localTimestamp(instant,zone),regional)} {new Intl.DateTimeFormat(regional.locale,{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName')?.value}</SelectItem>)}</SelectGroup></SelectContent></Select>:null}
  </Field>;
}
