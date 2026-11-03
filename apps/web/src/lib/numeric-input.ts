import type {FieldDefinition,FieldValue,MoneyValue,RegionalSettings} from '@xobject/contracts';
const currencies=new Set(Intl.supportedValuesOf('currency'));
export function numericSeparators(regional:RegionalSettings) {
  const locale=regional.numberFormat==='comma'?'de-DE':regional.numberFormat==='dot'?'en-US':regional.locale;
  const parts=new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {decimal:parts.find(p=>p.type==='decimal')?.value??'.',group:parts.find(p=>p.type==='group')?.value??','};
}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function parseNumericDraft(raw:string,regional:RegionalSettings):string|null {
  const {decimal,group}=numericSeparators(regional),text=raw.trim();
  if(!new RegExp(`^-?(?:\\d+|\\d{1,3}(?:${escape(group)}\\d{3})+)(?:${escape(decimal)}\\d+)?$`).test(text))return null;
  return text.split(group).join('').replace(decimal,'.');
}
export function localizedFieldDraft(field:Pick<FieldDefinition,'kind'>,value:FieldValue,regional:RegionalSettings):FieldValue {
  if(value===null)return value;
  const local=(s:string)=>s.replace('.',numericSeparators(regional).decimal);
  if(field.kind==='money'){const m=value as MoneyValue;return {...m,amount:local(m.amount)};}
  return field.kind==='decimal'?local(String(value)):value;
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
