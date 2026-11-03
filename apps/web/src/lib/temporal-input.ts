import {Temporal} from '@js-temporal/polyfill';
import type {RegionalSettings} from '@xobject/contracts';
import {isInstant,localTimestamp,timestampCandidates} from './time-zone';

export function isCalendarDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-'))return false;
  try{return Temporal.PlainDate.from(value).toString()===value;}catch{return false;}
}
export function dateInputPattern(regional:RegionalSettings):string {
  if(regional.dateFormat==='iso')return 'YYYY-MM-DD';
  if(regional.dateFormat==='dmy')return 'DD.MM.YYYY';
  if(regional.dateFormat==='mdy')return 'MM/DD/YYYY';
  return new Intl.DateTimeFormat(regional.locale,{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).formatToParts(new Date('2026-07-15T00:00:00Z')).map(part=>part.type==='year'?'YYYY':part.type==='month'?'MM':part.type==='day'?'DD':part.value).join('');
}
export function formatDateInput(iso:string,regional:RegionalSettings):string {
  if(!isCalendarDate(iso))return iso;
  const [year,month,day]=iso.split('-');
  return dateInputPattern(regional).replace('YYYY',year).replace('MM',month).replace('DD',day);
}
export function parseDateInput(raw:string,regional:RegionalSettings):string|null {
  const text=raw.trim();
  if(isCalendarDate(text))return text; // ISO is an unambiguous paste format in every region.
  const pattern=dateInputPattern(regional),tokens=pattern.match(/YYYY|MM|DD/g)!;
  const escaped=pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace('YYYY','(\\d{4})').replace('MM','(\\d{1,2})').replace('DD','(\\d{1,2})');
  const match=new RegExp(`^${escaped}$`).exec(text);if(!match)return null;
  const parts=Object.fromEntries(tokens.map((token,index)=>[token,match[index+1]]));
  const iso=`${parts.YYYY}-${parts.MM.padStart(2,'0')}-${parts.DD.padStart(2,'0')}`;
  return isCalendarDate(iso)?iso:null;
}
export function regionalHourCycle(regional:RegionalSettings):'h12'|'h23' {
  if(regional.hourCycle!=='locale')return regional.hourCycle;
  return new Intl.DateTimeFormat(regional.locale,{hour:'numeric'}).resolvedOptions().hour12?'h12':'h23';
}
export function timeInputPattern(regional:RegionalSettings):string {return regionalHourCycle(regional)==='h12'?'hh:mm AM/PM':'HH:mm';}
export function formatTimeInput(local:string,regional:RegionalSettings):string {
  try{
    const time=Temporal.PlainDateTime.from(local),h12=regionalHourCycle(regional)==='h12';
    const hour=h12?(time.hour%12||12):time.hour;
    const seconds=time.second||time.millisecond?`:${String(time.second).padStart(2,'0')}${time.millisecond?'.'+String(time.millisecond).padStart(3,'0'):''}`:'';
    const period=new Intl.DateTimeFormat(regional.locale,{hour:'numeric',hourCycle:'h12',timeZone:'UTC'}).formatToParts(new Date(`2000-01-01T${String(time.hour).padStart(2,'0')}:00:00Z`)).find(part=>part.type==='dayPeriod')?.value??(time.hour<12?'AM':'PM');
    return `${String(hour).padStart(2,'0')}:${String(time.minute).padStart(2,'0')}${seconds}${h12?' '+period:''}`;
  }catch{return '';}
}
export function parseTimeInput(raw:string,regional:RegionalSettings):string|null {
  const normalized=raw.trim().replace(/[\u00a0\u202f]/g,' ');
  const match=/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*([ap]\.?m\.?)?$/i.exec(normalized);
  if(!match)return null;
  let hour=Number(match[1]);const minute=Number(match[2]),second=Number(match[3]??0),period=match[5]?.replace(/\./g,'').toLowerCase();
  if(regionalHourCycle(regional)==='h12'){
    if(!period||hour<1||hour>12)return null;
    hour=hour%12+(period==='pm'?12:0);
  }else if(period||hour>23)return null;
  if(minute>59||second>59)return null;
  return `${String(hour).padStart(2,'0')}:${match[2]}:${String(second).padStart(2,'0')}.${(match[4]??'').padEnd(3,'0')}`;
}
export function temporalInputParts(value:string,regional:RegionalSettings,timeZone:string):{date:string;time:string} {
  if(!value)return {date:'',time:''};
  if(value.startsWith('!temporal:')){
    try{const parts=JSON.parse(value.slice(10));if(Array.isArray(parts)&&parts.length===2&&parts.every(part=>typeof part==='string'))return {date:parts[0],time:parts[1]};}catch{/* Keep an unknown invalid draft visible. */}
  }
  const local=isInstant(value)?localTimestamp(value,timeZone):value;
  try {const plain=Temporal.PlainDateTime.from(local);return {date:formatDateInput(plain.toPlainDate().toString(),regional),time:formatTimeInput(local,regional)};}catch{return {date:value,time:''};}
}
export function temporalInputValue(date:string,time:string,regional:RegionalSettings,timeZone:string,previous?:string):string|null {
  if(!date.trim()&&!time.trim())return null;
  const day=parseDateInput(date,regional),clock=parseTimeInput(time,regional);
  if(!day||!clock)return `!temporal:${JSON.stringify([date,time])}`;
  const local=`${day}T${clock}`,candidates=timestampCandidates(local,timeZone);
  if(previous&&isInstant(previous)&&Temporal.PlainDateTime.from(localTimestamp(previous,timeZone)).equals(Temporal.PlainDateTime.from(local)))return previous;
  return candidates.length===1?candidates[0]:local;
}
