import type {RegionalSettings} from '@xobject/contracts';
import {formatRegionalDate} from './regional';

export function timestampLine(now:Date,name:string,regional:RegionalSettings,timeZone:string):string{
 const date=formatRegionalDate(now.toISOString(),regional,timeZone);
 const time=new Intl.DateTimeFormat(regional.locale,{timeZone,timeStyle:'short',...(regional.hourCycle==='locale'?{}:{hourCycle:regional.hourCycle})}).format(now);
 return `----- ${date} ${time} (${name.replace(/\s+/g,' ').trim()}) -----`;
}

/** Insert a complete line, followed by exactly one new newline, replacing any selection. */
export function insertTextTimestamp(value:string,start:number,end:number,line:string,maxLength=10000):{value:string;caret:number}|null{
 const from=Math.max(0,Math.min(start,value.length)),to=Math.max(from,Math.min(end,value.length));
 const before=value.slice(0,from),prefix=before&&!before.endsWith('\n')?'\n':'';
 const inserted=prefix+line+'\n',suffix=value.slice(to),after=suffix.startsWith('\r\n')?suffix.slice(2):suffix.startsWith('\n')?suffix.slice(1):suffix,next=before+inserted+after;
 return next.length>maxLength?null:{value:next,caret:before.length+inserted.length};
}
