import {parseStructuredValue,type RegionalSettings} from '@xobject/contracts';
import {dateInputPattern,formatDateInput,parseDateInput} from './temporal-input';
export type Birthday={month:number;day:number;year:number|null};
export function birthdayValue(value:unknown):Birthday|null{
 try{return value===null?null:parseStructuredValue('partial_date',value) as Birthday;}catch{return null;}
}
export function birthdayPattern(regional:RegionalSettings,withYear=true):string{
 const full=dateInputPattern(regional);
 return withYear?full:full.replace(/^YYYY[^A-Z]+/,'').replace(/[^A-Z]+YYYY$/,'');
}
export function birthdayInputText(value:Birthday,regional:RegionalSettings):string{
 if(value.year!==null)return formatDateInput(`${String(value.year).padStart(4,'0')}-${String(value.month).padStart(2,'0')}-${String(value.day).padStart(2,'0')}`,regional);
 return birthdayPattern(regional,false).replace('MM',String(value.month).padStart(2,'0')).replace('DD',String(value.day).padStart(2,'0'));
}
export function parseBirthdayInput(text:string,regional:RegionalSettings):Birthday|null{
 const full=parseDateInput(text,regional);
 if(full){const [year,month,day]=full.split('-').map(Number);return {year,month,day};}
 const pattern=birthdayPattern(regional,false),tokens=pattern.match(/MM|DD/g)!;
 const regex=pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace('MM','(\\d{1,2})').replace('DD','(\\d{1,2})');
 const match=new RegExp(`^${regex}$`).exec(pattern.includes('.')?text.trim().replace(/\.$/,''):text.trim());if(!match)return null;
 const values=Object.fromEntries(tokens.map((token,index)=>[token,Number(match[index+1])]));
 return birthdayValue({year:null,month:values.MM,day:values.DD});
}
