import {MultiValueSelect} from './multi-value-select';
import {StructuredFieldControl} from './structured-field-control';
import {FieldExplanation,FieldFormatHelp,fieldDescriptionIds} from './record-field-hints';
import {TemporalFieldSkeleton} from './loading';
import {lazy,Suspense} from 'react';
import {useRegional} from '@/lib/regional-context';
import {numericDraftError,numericSeparators,formatNumericDraft} from '@/lib/numeric-input';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {MarkdownContent} from './markdown-content';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import type { FieldDefinition, FieldValue, MoneyValue, ReferenceValue } from '@xobject/contracts';
import { api } from '@/lib/api';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {TimestampTextarea} from './timestamp-textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { ErrorNotice, Loading } from './feedback';

const RegionalTemporalField=lazy(()=>import('./regional-temporal-field').then(module=>({default:module.RegionalTemporalField})));

export function emptyCustomValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length) || (typeof value === 'object' && !Array.isArray(value) && 'amount' in value && !String(value.amount ?? '').trim());
}
const optionName = (labels: Record<string, string>, language: string) => labels[language] ?? labels.en ?? labels.de ?? Object.values(labels)[0] ?? '—';
export {displayFieldValue} from '@/lib/field-display';
export function CustomFieldControl({ field, value, workspaceId, objectTypeId, disabled, onChange,error,legendVariant,labelHidden=false }: { labelHidden?:boolean;legendVariant?:'legend'|'label';error?:string;field: FieldDefinition; value: FieldValue; workspaceId: string; objectTypeId?:string; disabled: boolean; onChange: (value: FieldValue) => void }) {
  const { t, i18n } = useTranslation();
  const regional=useRegional();
  const numericError=numericDraftError(field,value,regional);
  const id = `field-${field.id}`;
  const describedBy=fieldDescriptionIds(field,[numericError?`${id}-number-error`:null,error?`${id}-validation-error`:null,['phone','decimal','money'].includes(field.kind)?`${id}-format-help`:null].filter(Boolean).join(' '));
  const string = typeof value === 'string' ? value : '';
  const changeInput=(next:string)=>onChange(next||null);
  if(field.kind==='structured')return <StructuredFieldControl legendVariant={legendVariant} field={field} value={value} disabled={disabled} onChange={onChange} error={error}/>;
  if(field.kind==='date'||field.kind==='datetime')return <Suspense fallback={<TemporalFieldSkeleton label={`${field.label}${field.required?' *':''}`} datetime={field.kind==='datetime'}/>}><RegionalTemporalField field={field} value={value} disabled={disabled} onChange={onChange}/></Suspense>;
  if (field.kind === 'reference') return <ReferenceControl field={field} value={value} workspaceId={workspaceId} objectTypeId={objectTypeId} error={error} disabled={disabled} onChange={onChange} />;
  if (field.kind === 'multiple_choice') {
    const ids = Array.isArray(value) ? value as string[] : [];
    return <Field data-disabled={disabled||undefined} data-invalid={Boolean(error)}><FieldLabel htmlFor={id}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><MultiValueSelect id={id} label={field.label} disabled={disabled} invalid={Boolean(error)} describedBy={describedBy} value={ids} items={(field.config.options??[]).filter(option=>option.active||ids.includes(option.id)).map(option=>({value:option.id,label:`${optionName(option.labels,i18n.language)}${!option.active?` (${t('inactiveChoice')})`:''}`,disabled:!option.active&&!ids.includes(option.id)}))} onChange={next=>onChange([...next].sort())}/>{error?<FieldError id={`${id}-validation-error`}>{error}</FieldError>:null}<FieldExplanation field={field} help/></Field>;
  }
  return <Field data-disabled={disabled || undefined} data-invalid={Boolean(numericError||error)}><FieldLabel className={labelHidden?'sr-only':legendVariant==='legend'?'text-base':undefined} htmlFor={id}>{field.label}{field.required ? ' *' : ''}</FieldLabel><FieldExplanation field={field}/>
    {field.kind === 'multiline' ? <><TimestampTextarea aria-describedby={describedBy} id={id} value={string} required={field.required} maxLength={10000} disabled={disabled} onChange={next => onChange(next || null)} />{field.config.formatted && string ? <Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/field-preview" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-3 py-2"/>}>{t('preview')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/field-preview:rotate-180"/></CollapsibleTrigger><CollapsibleContent><Separator/><div className="flex flex-col gap-3 p-3 whitespace-pre-wrap wrap-anywhere"><MarkdownContent>{string}</MarkdownContent></div></CollapsibleContent></Collapsible> : null}</>
      : field.kind === 'boolean' || field.kind === 'single_choice' ? <Select items={field.kind === 'boolean' ? [{ value: 'none', label: t('noSelection') }, { value: 'true', label: t('yes') }, { value: 'false', label: t('no') }] : [{ value: 'none', label: t('noSelection') }, ...(field.config.options ?? []).filter(option => option.active || option.id === value).map(option => ({ value: option.id, label: `${optionName(option.labels, i18n.language)}${!option.active ? ` (${t('inactiveChoice')})` : ''}` }))]} value={value === null ? 'none' : String(value)} required={field.required} disabled={disabled} onValueChange={next => onChange(next === 'none' || next === null ? null : field.kind === 'boolean' ? next === 'true' : next)}><SelectTrigger aria-describedby={describedBy} id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{field.kind === 'boolean' ? <><SelectItem value="none">{t('noSelection')}</SelectItem><SelectItem value="true">{t('yes')}</SelectItem><SelectItem value="false">{t('no')}</SelectItem></> : <><SelectItem value="none">{t('noSelection')}</SelectItem>{field.config.options?.filter(option => option.active || option.id === value).map(option => <SelectItem key={option.id} value={option.id} disabled={!option.active}>{optionName(option.labels, i18n.language)}{!option.active ? ` (${t('inactiveChoice')})` : ''}</SelectItem>)}</>}</SelectGroup></SelectContent></Select>
      : field.kind === 'money' ? <div className="flex gap-2"><Input id={id} inputMode="decimal" maxLength={100} aria-invalid={Boolean(numericError||error)} aria-describedby={describedBy} value={(value as MoneyValue | null)?.amount ?? ''} required={field.required} disabled={disabled} onBlur={()=>onChange(formatNumericDraft(field,value,regional))} aria-label={field.label} onChange={event => onChange({ amount: event.target.value, currency: (value as MoneyValue | null)?.currency ?? field.config.currency ?? 'EUR' })} /><Input className="w-24" value={(value as MoneyValue | null)?.currency ?? field.config.currency ?? 'EUR'} maxLength={3} minLength={3} pattern="[A-Z]{3}" aria-invalid={numericError==='invalidCurrencyInput'} aria-describedby={describedBy} disabled={disabled} aria-label={t('currency')} onBlur={()=>onChange(formatNumericDraft(field,value,regional))} onChange={event => onChange({ amount: (value as MoneyValue | null)?.amount ?? '', currency: event.target.value.toUpperCase() })} /></div>
      : <Input id={id} aria-invalid={Boolean(numericError||error)} aria-describedby={describedBy} type={field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : field.kind === 'url' ? 'url' : 'text'} inputMode={field.kind === 'integer' ? 'numeric' : field.kind === 'decimal' ? 'decimal' : undefined} value={string} required={field.required} maxLength={10000} disabled={disabled} onChange={event => changeInput(event.target.value)} onBlur={field.kind==='integer'||field.kind==='decimal'?()=>onChange(formatNumericDraft(field,value,regional)):undefined} /> }
    {error?<FieldError id={`${id}-validation-error`}>{error}</FieldError>:null}{numericError?<FieldError id={`${id}-number-error`}>{t(numericError,{scale:field.config.scale??2,decimal:numericSeparators(regional).decimal})}</FieldError>:null}
    <FieldExplanation field={field} help/>{field.kind === 'phone' ? <FieldFormatHelp id={`${id}-format-help`}>{t('phoneHelp')}</FieldFormatHelp> : field.kind === 'decimal' || field.kind === 'money' ? <FieldFormatHelp id={`${id}-format-help`}>{t('regionalDecimalHelp', { scale: field.config.scale ?? 2,decimal:numericSeparators(regional).decimal })}</FieldFormatHelp> : null}
  </Field>;
}
function ReferenceControl({ field, value, workspaceId, objectTypeId, disabled, onChange,error,legendVariant }: { legendVariant?:'legend'|'label';error?:string;field: FieldDefinition; value: FieldValue; workspaceId: string; objectTypeId?:string; disabled: boolean; onChange: (value: FieldValue) => void }) {
  const { t } = useTranslation();
  const principals = useQuery({ queryKey: ['field-principals', workspaceId], queryFn: () => api('list_field_principals', { workspaceId }) });
  const errorId=error?`field-${field.id}-validation-error`:undefined;
  const refs = (Array.isArray(value) ? value : value ? [value] : []) as ReferenceValue[];
  const candidates=[...(principals.data??[]),...refs.filter(ref=>!principals.data?.some(item=>item.kind===ref.kind&&item.id===ref.id)).map(ref=>({...ref,name:ref.id,active:false}))];
  const allowed = candidates.filter(item => (field.config.referenceTarget === 'both' || field.config.referenceTarget === item.kind) && (item.active !== false || refs.some(ref => ref.kind === item.kind && ref.id === item.id)));
  const label = (item: { kind: string; name: string; active?: boolean }) => `${item.name} (${t(`reference_${item.kind}`)})${item.active === false ? ` (${t('inactive')})` : ''}`;
  if (principals.isPending) return <Loading variant="field" label={field.label}/>;
  if (principals.isError) return <ErrorNotice error={principals.error} retry={() => { void principals.refetch(); }} />;
  if (field.config.multiple) return <Field data-disabled={disabled||undefined} data-invalid={Boolean(error)}><FieldLabel htmlFor={`reference-${field.id}`}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><MultiValueSelect id={`reference-${field.id}`} label={field.label} disabled={disabled} invalid={Boolean(error)} describedBy={fieldDescriptionIds(field,errorId)} value={refs.map(ref=>`${ref.kind}:${ref.id}`)} emptyLabel={t('noReferenceTargets')} items={allowed.map(item=>({value:`${item.kind}:${item.id}`,label:label(item),disabled:item.active===false&&!refs.some(ref=>ref.kind===item.kind&&ref.id===item.id)}))} onChange={next=>onChange(next.map(key=>{const item=allowed.find(item=>`${item.kind}:${item.id}`===key)!;return {kind:item.kind,id:item.id};}))}/><FieldExplanation field={field} help/>{error?<FieldError id={errorId}>{error}</FieldError>:null}</Field>;
  const items = [{ value: 'none', label: t('noSelection') }, ...allowed.map(item => ({ value: `${item.kind}:${item.id}`, label: label(item) }))];
  return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={`reference-${field.id}`}>{field.label}{field.required ? ' *' : ''}</FieldLabel><FieldExplanation field={field}/><Select items={items} value={refs[0] ? `${refs[0].kind}:${refs[0].id}` : 'none'} required={field.required} disabled={disabled} onValueChange={next => { const item = allowed.find(item => `${item.kind}:${item.id}` === next); onChange(item ? { kind: item.kind, id: item.id } : null); }}><SelectTrigger aria-invalid={Boolean(error)} aria-describedby={fieldDescriptionIds(field,errorId)} id={`reference-${field.id}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={allowed.find(principal => `${principal.kind}:${principal.id}` === item.value)?.active === false}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldExplanation field={field} help/>{error?<FieldError id={errorId}>{error}</FieldError>:null}</Field>;
}
