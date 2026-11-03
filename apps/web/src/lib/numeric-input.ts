import {formatRegionalNumber} from './regional';
import type {FieldDefinition,FieldValue,MoneyValue,RegionalSettings} from '@xobject/contracts';
const currencies=new Set(Intl.supportedValuesOf('currency'));
export function numericSeparators(regional:RegionalSettings) {
  const locale=regional.numberFormat==='comma'?'de-DE':regional.numberFormat==='dot'?'en-US':regional.locale;
  const parts=new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {decimal:parts.find(p=>p.type==='decimal')?.value??'.',group:parts.find(p=>p.type==='group')?.value??','};
}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function parseNumericDraft(raw:string,regional:RegionalSettings):string|null {
  const {decimal,group}=numericSeparators(regional);
  let text=raw.trim();
  if (/^[\u0020\u00a0\u202f]$/.test(group)) text=text.replace(/[\u0020\u00a0\u202f]/g,group);
  if (/^['’]$/.test(group)) text=text.replace(/['’]/g,group);
  if(!new RegExp(`^-?(?:\\d+|\\d{1,3}(?:${escape(group)}\\d{3})+)(?:${escape(decimal)}\\d+)?$`).test(text))return null;
  return text.split(group).join('').replace(decimal,'.');
}
type NumericField = Pick<FieldDefinition,'kind'> & Partial<Pick<FieldDefinition,'config'>>;
export function localizedFieldDraft(field:NumericField,value:FieldValue,regional:RegionalSettings):FieldValue {
  if(value===null)return value;
  if(field.kind==='money'){const m=value as MoneyValue;return {...m,amount:formatRegionalNumber(m.amount,regional,field.config?.scale??2)};}
  if(field.kind==='decimal'||field.kind==='integer')return formatRegionalNumber(String(value),regional,field.kind==='integer'?0:field.config?.scale??2);
  return value;
}
export function numericDraftError(field:Pick<FieldDefinition,'kind'|'config'>,value:FieldValue,regional:RegionalSettings):string|null {
  if(!['integer','decimal','money'].includes(field.kind)||value===null)return null;
  const raw=field.kind==='money'?(value as MoneyValue).amount:String(value);
  if(!raw.trim())return null;
  const parsed=parseNumericDraft(raw,regional);if(parsed===null)return 'invalidNumericInput';
  if(field.kind==='integer'){
    if(!/^-?\d+$/.test(parsed))return 'invalidIntegerInput';
    if(BigInt(parsed)<-9223372036854775808n||BigInt(parsed)>9223372036854775807n)return 'numericOutOfRange';
  }else{
    const [whole,fraction='']=parsed.replace(/^-/,'').split('.'),scale=field.config.scale??2;
    if(whole.replace(/^0+(?=\d)/,'').length>38-scale||fraction.replace(/0+$/,'').length>scale)return 'numericPrecisionError';
    if(field.kind==='money'&&!currencies.has((value as MoneyValue).currency))return 'invalidCurrencyInput';
  }
  return null;
}
export function normalizedFieldDraft(field:Pick<FieldDefinition,'kind'|'config'>,value:FieldValue,regional:RegionalSettings):FieldValue {
  if(!['integer','decimal','money'].includes(field.kind)||value===null)return value;
  const raw=field.kind==='money'?(value as MoneyValue).amount:String(value);
  if(!raw.trim())return null;
  if(numericDraftError(field,value,regional))throw new Error('Invalid numeric draft');
  const number=parseNumericDraft(raw,regional)!;
  return field.kind==='money'?{...(value as MoneyValue),amount:number}:number;
}

/** Invalid and incomplete drafts remain editable; formatting never rounds an invalid value. */
export function formatNumericDraft(field:Pick<FieldDefinition,'kind'|'config'>,value:FieldValue,regional:RegionalSettings):FieldValue {
  if(numericDraftError(field,value,regional))return value;
  return localizedFieldDraft(field,normalizedFieldDraft(field,value,regional),regional);
}
const exactNumberIdentity=(value:string)=>{
  const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
  const integer=whole.replace(/^0+(?=\d)/,''),tail=fraction.replace(/0+$/,'');
  return `${negative&&(integer!=='0'||tail)?'-':''}${integer}${tail?'.'+tail:''}`;
};
export function sameFieldDraft(field:Pick<FieldDefinition,'kind'|'config'>|undefined,left:FieldValue,right:FieldValue,regional:RegionalSettings):boolean {
  if(!field||!['integer','decimal','money'].includes(field.kind)||numericDraftError(field,left,regional)||numericDraftError(field,right,regional))return JSON.stringify(left)===JSON.stringify(right);
  const a=normalizedFieldDraft(field,left,regional),b=normalizedFieldDraft(field,right,regional);
  if(a===null||b===null)return a===b;
  if(field.kind==='money'){const x=a as MoneyValue,y=b as MoneyValue;return x.currency===y.currency&&exactNumberIdentity(x.amount)===exactNumberIdentity(y.amount);}
  return exactNumberIdentity(String(a))===exactNumberIdentity(String(b));
}
/** Return null rather than ever interpreting an old-format draft in the new locale. */
export function reformatNumericDrafts(fields:Pick<FieldDefinition,'technicalName'|'kind'|'config'>[],values:Record<string,FieldValue>,from:RegionalSettings,to:RegionalSettings):Record<string,FieldValue>|null {
  const next={...values};
  for(const field of fields){
    if(!['integer','decimal','money'].includes(field.kind))continue;
    const value=values[field.technicalName]??null;
    if(numericDraftError(field,value,from))return null;
    next[field.technicalName]=localizedFieldDraft(field,normalizedFieldDraft(field,value,from),to);
  }
  return next;
}
