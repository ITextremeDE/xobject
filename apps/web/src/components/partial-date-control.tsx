import {useState,useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {CalendarIcon,XIcon,InfoIcon} from 'lucide-react';
import {de,deAT,enUS,enGB,enCA,enAU} from 'react-day-picker/locale';
import type {FieldDefinition,FieldValue} from '@xobject/contracts';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {regionalWeekStart} from '@/lib/regional';
import {localTimestamp} from '@/lib/time-zone';
import {birthdayValue,birthdayPattern,birthdayInputText,parseBirthdayInput,type Birthday} from '@/lib/birthday-input';
import {Field,FieldLabel,FieldDescription,FieldError} from './ui/field';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from './ui/input-group';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle} from './ui/popover';
import {Calendar} from './ui/calendar';
import {Button} from './ui/button';
import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';

const locales={'de-DE':de,'de-AT':deAT,'de-CH':de,'en-US':enUS,'en-GB':enGB,'en-CA':enCA,'en-AU':enAU};
function calendarDate(value:Birthday):Date{const date=new Date(0);date.setFullYear(value.year??2000,value.month-1,value.day);date.setHours(12,0,0,0);return date;}
export function PartialDateControl({field,value,disabled,onChange,error}:{field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void;error?:string}){
 const {t}=useTranslation(),regional=useRegional(),zone=useTimeZone(),id=`field-${field.id}`;
 const parsed=birthdayValue(value),unknownYear=parsed?.year===null;
 const today=new Date(`${localTimestamp(new Date().toISOString(),zone).slice(0,10)}T12:00:00`),selected=parsed?calendarDate(parsed):undefined;
 const [open,setOpen]=useState(false),[month,setMonth]=useState(()=>selected??today);
 const invalid=value!==null&&!parsed,text=typeof value==='string'?value:parsed?birthdayInputText(parsed,regional):'';
 const current=JSON.stringify(value),format=JSON.stringify(regional),emitted=useRef(current),previousFormat=useRef(format);
 const [draft,setDraft]=useState(text);
 useEffect(()=>{if(current!==emitted.current||format!==previousFormat.current)setDraft(text);emitted.current=current;previousFormat.current=format;},[current,format,text]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 function emit(next:FieldValue,typed?:string){emitted.current=JSON.stringify(next);const date=birthdayValue(next);setDraft(typed??(date?birthdayInputText(date,regional):typeof next==='string'?next:''));onChange(next);}
 const dayLabel=(date:Date)=>new Intl.DateTimeFormat(regional.locale,{month:'long',day:'numeric',...(unknownYear?{}:{weekday:'long',year:'numeric'})}).format(date);
 const patterns={withYear:birthdayPattern(regional),withoutYear:birthdayPattern(regional,false)};
 const describedBy=[fieldDescriptionIds(field),invalid||error?`${id}-error`:null].filter(Boolean).join(' ');
 return <Field data-disabled={disabled||undefined} data-invalid={invalid||Boolean(error)}><div className="flex items-center justify-between gap-2"><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel><Popover><PopoverTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={t('dateFormatHelpFor',{name:field.label})}/> }><InfoIcon/></PopoverTrigger><PopoverContent className="w-72 max-w-[calc(100vw-2rem)]"><PopoverTitle className="sr-only">{t('dateFormatHelpFor',{name:field.label})}</PopoverTitle><FieldDescription>{t('birthdayInputHelp',patterns)}</FieldDescription></PopoverContent></Popover></div><FieldExplanation field={field}/>
 <Popover open={open&&!disabled} onOpenChange={next=>{if(next&&!disabled){setMonth(selected??today);setOpen(true);}else setOpen(false);}}><InputGroup><InputGroupInput id={id} value={draft} placeholder={patterns.withYear} maxLength={32} autoComplete="off" disabled={disabled} required={field.required} aria-invalid={invalid||Boolean(error)} aria-describedby={describedBy} onChange={event=>emit(!event.target.value.trim()?null:parseBirthdayInput(event.target.value,regional)??event.target.value,event.target.value)} onBlur={()=>{if(parsed)setDraft(birthdayInputText(parsed,regional));}}/><InputGroupAddon align="inline-end">{value!==null?<InputGroupButton size="icon-xs" disabled={disabled} aria-label={t('clearDateFor',{name:field.label})} onClick={()=>emit(null)}><XIcon/></InputGroupButton>:null}<PopoverTrigger render={<InputGroupButton size="icon-xs" disabled={disabled} aria-label={t('chooseDateFor',{name:field.label})}/> }><CalendarIcon/></PopoverTrigger></InputGroupAddon></InputGroup>
 <PopoverContent align="start" className="w-auto max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-y-auto p-0" aria-label={t('chooseDateFor',{name:field.label})}><PopoverTitle className="sr-only">{field.label}</PopoverTitle><Calendar mode="single" locale={locales[regional.locale]} weekStartsOn={regionalWeekStart(regional)===1?1:0} today={today} selected={selected} month={month} onMonthChange={next=>setMonth(unknownYear?calendarDate({year:null,month:next.getMonth()+1,day:1}):next)} captionLayout={unknownYear?'label':'dropdown'} startMonth={unknownYear?undefined:calendarDate({year:Math.min(1900,parsed?.year??1900),month:1,day:1})} endMonth={unknownYear?undefined:calendarDate({year:Math.max(today.getFullYear(),parsed?.year??today.getFullYear()),month:12,day:31})} autoFocus formatters={unknownYear?{formatCaption:date=>new Intl.DateTimeFormat(regional.locale,{month:'long'}).format(date)}:undefined} labels={{labelNext:()=>t('calendarNextMonth'),labelPrevious:()=>t('calendarPreviousMonth'),labelDayButton:dayLabel,labelGridcell:dayLabel,labelGrid:date=>new Intl.DateTimeFormat(regional.locale,{month:'long',...(unknownYear?{}:{year:'numeric'})}).format(date)}} onSelect={date=>{if(!date||disabled)return;emit({month:date.getMonth()+1,day:date.getDate(),year:unknownYear?null:date.getFullYear()});setOpen(false);}}/>{parsed&&parsed.year!==null?<div className="border-t p-2"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={()=>{emit({...parsed,year:null});setOpen(false);}}>{t('birthdayWithoutYear')}</Button></div>:unknownYear?<FieldDescription className="px-3 pb-3">{t('birthdayYearUnknown')}</FieldDescription>:null}</PopoverContent></Popover>
 {invalid||error?<FieldError id={`${id}-error`}>{error??t('invalidBirthdayInput',patterns)}</FieldError>:null}<FieldExplanation field={field} help/></Field>;
}
