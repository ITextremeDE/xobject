import {structuredSummary,defaultRegionalSettings,type RegionalSettings,type FieldDefinition,type FieldPrincipal,type MoneyValue,type ReferenceValue} from '@xobject/contracts';
import type {TFunction} from 'i18next';
import {formatRegionalDate,formatRegionalNumber,formatRegionalMoney} from './regional';
const optionName=(labels:Record<string,string>,language:string)=>labels[language]??labels.en??labels.de??Object.values(labels)[0]??'—';

export function displayFieldValue(field: Pick<FieldDefinition,'kind'|'config'>, value: unknown, language: string, t: TFunction, principals: FieldPrincipal[] = [], timeZone = 'UTC', regional: RegionalSettings = defaultRegionalSettings): string {
  if (value === null || value === undefined || value === '') return '—';
  if(field.kind==='structured'){
    if(field.config.schema==='partial_date'){
      const date=value as {year:number|null;month:number;day:number},month=String(date.month).padStart(2,'0'),day=String(date.day).padStart(2,'0');
      return date.year===null?new Intl.DateTimeFormat(regional.locale,{month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(`2000-${month}-${day}T12:00:00Z`)):formatRegionalDate(`${String(date.year).padStart(4,'0')}-${month}-${day}`,regional,timeZone,false,true);
    }
    return structuredSummary(field.config.schema!,value);
  }
  if (field.kind === 'boolean') return t(value === true ? 'yes' : 'no');
  if (field.kind === 'money') { const money = value as MoneyValue; return formatRegionalMoney(money.amount,money.currency,regional,field.config.scale??2); }
  if (field.kind === 'single_choice' || field.kind === 'multiple_choice') return (Array.isArray(value) ? value : [value]).map(id => { const option = field.config.options?.find(item => item.id === id); return option ? optionName(option.labels, language) : String(id); }).join(', ') || '—';
  if (field.kind === 'reference') return (Array.isArray(value) ? value : [value]).map(reference => { const ref = reference as ReferenceValue; return principals.find(item => item.kind === ref.kind && item.id === ref.id)?.name ?? `${t(`reference_${ref.kind}`)} · ${ref.id}`; }).join(', ') || '—';
  if (field.kind === 'date') return formatRegionalDate(String(value), regional, timeZone, false, true);
  if (field.kind === 'datetime') return formatRegionalDate(String(value), regional, timeZone, true);
  if (field.kind === 'decimal' || field.kind === 'integer') return formatRegionalNumber(String(value), regional, field.kind === 'integer' ? 0 : field.config.scale ?? 2);
  return String(value);
}
