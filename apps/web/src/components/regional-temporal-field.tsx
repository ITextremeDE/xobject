import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {CalendarIcon,MoreHorizontalIcon} from 'lucide-react';
import {de,deAT,enUS,enGB,enCA,enAU} from 'react-day-picker/locale';
import type {FieldDefinition,FieldValue} from '@xobject/contracts';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {regionalWeekStart} from '@/lib/regional';
import {isInstant,localTimestamp,timestampCandidates} from '@/lib/time-zone';
import {dateInputPattern,formatDateInput,parseDateInput,isCalendarDate,formatTimeInput,timeInputPattern,parseTimeInput,temporalInputParts,temporalInputValue} from '@/lib/temporal-input';
import {Field,FieldGroup,FieldLabel,FieldError,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from '@/components/ui/input-group';
import {Calendar} from '@/components/ui/calendar';
import {Popover,PopoverTrigger,PopoverContent,PopoverHeader,PopoverTitle} from '@/components/ui/popover';
import {Button} from '@/components/ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';

const calendarLocales={'de-DE':de,'de-AT':deAT,'de-CH':de,'en-US':enUS,'en-GB':enGB,'en-CA':enCA,'en-AU':enAU};
export function RegionalTemporalField({field,value,disabled,onChange,error,options,summary}:{field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void;error?:string;options?:ReactNode;summary?:ReactNode}){
  const {t}=useTranslation(),regional=useRegional(),zone=useTimeZone(),datetime=field.kind==='datetime';
  const id=`field-${field.id}`,current=typeof value==='string'?value:'';
  const parts=(input:string)=>datetime?temporalInputParts(input,regional,zone):{date:formatDateInput(input,regional),time:''};
  const [draft,setDraft]=useState(()=>parts(current)),[open,setOpen]=useState(false),[optionsOpen,setOptionsOpen]=useState(false);
  const emitted=useRef(current),format=JSON.stringify(regional)+zone+field.kind,previousFormat=useRef(format);
  useEffect(()=>{
    if(current!==emitted.current||format!==previousFormat.current)setDraft(parts(current));
    emitted.current=current;previousFormat.current=format;
  },[current,format]);
  const day=parseDateInput(draft.date,regional),clock=datetime?parseTimeInput(draft.time,regional):null;
  const local=day&&clock?`${day}T${clock}`:null;
  const candidates=local?timestampCandidates(local,zone):[];
  const present=Boolean(draft.date.trim()||draft.time.trim());
  const invalid=present&&(!day||(datetime&&(!clock||!isInstant(current))));
  const temporalError=!day?'invalidDateInput':!clock?'invalidTimeInput':candidates.length>1?'ambiguousTime':'nonexistentTime';
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
    <InputGroupInput id={id} aria-label={t('dateFor',{name:field.label})} value={draft.date} placeholder={dateInputPattern(regional)} autoComplete="off" maxLength={32} disabled={disabled} required={field.required} aria-invalid={invalid||Boolean(error)} aria-describedby={`${fieldDescriptionIds(field)??''} ${helpId}${invalid||error?' '+errorId:''}`} onChange={event=>change({...draft,date:event.target.value})} onBlur={blur}/>
    <InputGroupAddon align="inline-end" className="shrink-0 has-[>button]:mr-0"><PopoverTrigger render={<InputGroupButton size="icon-xs" disabled={disabled} aria-label={t('chooseDateFor',{name:field.label})} title={t('chooseDate')}/>}><CalendarIcon/></PopoverTrigger></InputGroupAddon>
  </InputGroup><PopoverContent aria-label={t('chooseDateFor',{name:field.label})} className="w-auto max-h-(--available-height) overflow-y-auto p-0" align="start"><Calendar disabled={disabled} mode="single" locale={calendarLocales[regional.locale]} weekStartsOn={regionalWeekStart(regional)===1?1:0} today={today} selected={selected} defaultMonth={selected??today} autoFocus labels={{labelNext:()=>t('calendarNextMonth'),labelPrevious:()=>t('calendarPreviousMonth')}} onSelect={date=>{
    if(!date||disabled)return;
    const iso=`${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if(isCalendarDate(iso))change({...draft,date:formatDateInput(iso,regional)});
    setOpen(false);
  }}/></PopoverContent></Popover>;
  const formatHelp=datetime?t('regionalDateTimeInputHelp',{date:dateInputPattern(regional),time:timeInputPattern(regional),timezone:zone}):t('regionalDateInputHelp',{format:dateInputPattern(regional)});
  return <Field className="@container/temporal min-w-0" data-disabled={disabled||undefined} data-invalid={invalid||Boolean(error)}>
    <FieldGroup className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @lg/temporal:grid-cols-[8rem_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-1 @lg/temporal:pt-1.5"><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel>{summary?<FieldDescription className="wrap-anywhere">{summary}</FieldDescription>:null}</div>
      <FieldGroup className="col-span-2 row-start-2 min-w-0 gap-2 @lg/temporal:col-span-1 @lg/temporal:col-start-2 @lg/temporal:row-start-1">
        <FieldGroup className="min-w-0 gap-2">
          <FieldGroup className={datetime?'grid min-w-0 gap-2 @[17rem]/temporal:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]':'min-w-0 gap-2'}>
            <Field data-invalid={invalid||Boolean(error)}><FieldLabel className="sr-only" htmlFor={id}>{t('date')}</FieldLabel>{dateControl}</Field>
            {datetime?<Field data-invalid={invalid||Boolean(error)}><FieldLabel className="sr-only" htmlFor={`${id}-time`}>{t('time')}</FieldLabel><Input id={`${id}-time`} aria-label={t('timeFor',{name:field.label})} value={draft.time} placeholder={timeInputPattern(regional)} maxLength={32} disabled={disabled} required={field.required} autoComplete="off" aria-invalid={invalid||Boolean(error)} aria-describedby={`${fieldDescriptionIds(field)??''} ${helpId}${invalid||error?' '+errorId:''}`} onChange={event=>change({...draft,time:event.target.value})} onBlur={blur}/></Field>:null}
          </FieldGroup>

        </FieldGroup>
        <FieldExplanation field={field}/><FieldExplanation field={field} help/><span id={helpId} hidden>{formatHelp}</span>
        {invalid||error?<FieldError id={errorId}>{error??t(temporalError,{format:dateInputPattern(regional),time:timeInputPattern(regional)})}</FieldError>:null}
    {datetime&&candidates.length>1?<Select items={candidates.map(instant=>({value:instant,label:`${formatTimeInput(localTimestamp(instant,zone),regional)} ${new Intl.DateTimeFormat(regional.locale,{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName')?.value??''}`}))} value={isInstant(current)?current:null} disabled={disabled} onValueChange={instant=>{if(instant){emitted.current=instant;onChange(instant);}}}><SelectTrigger aria-label={t('timeOccurrence')} className="w-full"><SelectValue placeholder={t('timeOccurrence')}/></SelectTrigger><SelectContent><SelectGroup>{candidates.map(instant=><SelectItem key={instant} value={instant}>{formatTimeInput(localTimestamp(instant,zone),regional)} {new Intl.DateTimeFormat(regional.locale,{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(instant)).find(part=>part.type==='timeZoneName')?.value}</SelectItem>)}</SelectGroup></SelectContent></Select>:null}
      </FieldGroup>
      <div className="col-start-2 row-start-1 @lg/temporal:col-start-3"><Popover open={optionsOpen} onOpenChange={setOptionsOpen}><PopoverTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t('temporalOptionsFor',{name:field.label})}/> }><MoreHorizontalIcon/></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] max-h-(--available-height) overflow-y-auto"><PopoverHeader><PopoverTitle>{t('temporalOptionsFor',{name:field.label})}</PopoverTitle></PopoverHeader><FieldGroup className="gap-4">{options}<Field><FieldLabel>{t('inputFormatHelp')}</FieldLabel><FieldDescription>{formatHelp}</FieldDescription></Field></FieldGroup></PopoverContent></Popover></div>
    </FieldGroup>
  </Field>;
}
