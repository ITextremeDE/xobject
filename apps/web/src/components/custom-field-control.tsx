import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import type { TFunction } from 'i18next';
import type { FieldDefinition, FieldPrincipal, FieldValue, MoneyValue, ReferenceValue } from '@xobject/contracts';
import { api } from '@/lib/api';
import { Field, FieldLabel, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { ErrorNotice, Loading } from './feedback';

export function emptyCustomValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length) || (typeof value === 'object' && !Array.isArray(value) && 'amount' in value && !String(value.amount ?? '').trim());
}
const optionName = (labels: Record<string, string>, language: string) => labels[language] ?? labels.en ?? labels.de ?? Object.values(labels)[0] ?? '—';
export function displayFieldValue(field: FieldDefinition, value: unknown, language: string, t: TFunction, principals: FieldPrincipal[] = []): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.kind === 'boolean') return t(value === true ? 'yes' : 'no');
  if (field.kind === 'money') { const money = value as MoneyValue; return `${language.startsWith('de') ? money.amount.replace('.', ',') : money.amount} ${money.currency}`; }
  if (field.kind === 'single_choice' || field.kind === 'multiple_choice') return (Array.isArray(value) ? value : [value]).map(id => { const option = field.config.options?.find(item => item.id === id); return option ? optionName(option.labels, language) : String(id); }).join(', ') || '—';
  if (field.kind === 'reference') return (Array.isArray(value) ? value : [value]).map(reference => { const ref = reference as ReferenceValue; return principals.find(item => item.kind === ref.kind && item.id === ref.id)?.name ?? `${t(`reference_${ref.kind}`)} · ${ref.id}`; }).join(', ') || '—';
  if (field.kind === 'date') return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  if (field.kind === 'datetime') return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)));
  if (field.kind === 'decimal') return language.startsWith('de') ? String(value).replace('.', ',') : String(value);
  return String(value);
}
function localTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const pad = (number: number) => String(number).padStart(2, '0');
  const fraction = date.getMilliseconds() ? `.${String(date.getMilliseconds()).padStart(3, '0').replace(/0+$/, '')}` : '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${fraction}`;
}
export function CustomFieldControl({ field, value, workspaceId, disabled, onChange }: { field: FieldDefinition; value: FieldValue; workspaceId: string; disabled: boolean; onChange: (value: FieldValue) => void }) {
  const { t, i18n } = useTranslation();
  const id = `field-${field.id}`;
  const string = typeof value === 'string' ? value : '';
  function changeInput(next: string) {
    if (field.kind === 'datetime' && next) {
      const date = new Date(next);
      const rounded = (next.length === 16 ? `${next}:00` : next).replace(/\.(\d+)$/, (_, fraction: string) => fraction.replace(/0+$/, '') ? `.${fraction.replace(/0+$/, '')}` : '');
      onChange(Number.isFinite(date.getTime()) && localTimestamp(date.toISOString()) === rounded ? date.toISOString() : next);
    } else onChange(next || null);
  }
  if (field.kind === 'reference') return <ReferenceControl field={field} value={value} workspaceId={workspaceId} disabled={disabled} onChange={onChange} />;
  if (field.kind === 'multiple_choice') {
    const ids = Array.isArray(value) ? value as string[] : [];
    return <FieldSet><FieldLegend variant="label">{field.label}{field.required ? ' *' : ''}</FieldLegend>{field.config.options?.filter(option => option.active || ids.includes(option.id)).map(option => <Field key={option.id} orientation="horizontal"><Checkbox id={`${id}-${option.id}`} checked={ids.includes(option.id)} disabled={disabled} onCheckedChange={checked => onChange((checked ? [...ids, option.id] : ids.filter(value => value !== option.id)).sort())} /><FieldLabel htmlFor={`${id}-${option.id}`}>{optionName(option.labels, i18n.language)}{!option.active ? ` (${t('inactiveChoice')})` : ''}</FieldLabel></Field>)}</FieldSet>;
  }
  return <Field><FieldLabel htmlFor={id}>{field.label}{field.required ? ' *' : ''}</FieldLabel>
    {field.kind === 'multiline' ? <><Textarea id={id} value={string} required={field.required} maxLength={10000} disabled={disabled} onChange={event => onChange(event.target.value || null)} />{field.config.formatted && string ? <FieldSet><FieldLegend variant="label">{t('preview')}</FieldLegend><Markdown skipHtml allowedElements={['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'br', 'hr']}>{string}</Markdown></FieldSet> : null}</>
      : field.kind === 'boolean' || field.kind === 'single_choice' ? <Select items={field.kind === 'boolean' ? [{ value: 'none', label: '—' }, { value: 'true', label: t('yes') }, { value: 'false', label: t('no') }] : [{ value: 'none', label: '—' }, ...(field.config.options ?? []).filter(option => option.active || option.id === value).map(option => ({ value: option.id, label: `${optionName(option.labels, i18n.language)}${!option.active ? ` (${t('inactiveChoice')})` : ''}` }))]} value={value === null ? 'none' : String(value)} disabled={disabled} onValueChange={next => onChange(next === 'none' || next === null ? null : field.kind === 'boolean' ? next === 'true' : next)}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{field.kind === 'boolean' ? <><SelectItem value="none">—</SelectItem><SelectItem value="true">{t('yes')}</SelectItem><SelectItem value="false">{t('no')}</SelectItem></> : <><SelectItem value="none">—</SelectItem>{field.config.options?.filter(option => option.active || option.id === value).map(option => <SelectItem key={option.id} value={option.id}>{optionName(option.labels, i18n.language)}{!option.active ? ` (${t('inactiveChoice')})` : ''}</SelectItem>)}</>}</SelectGroup></SelectContent></Select>
      : field.kind === 'money' ? <div className="flex gap-2"><Input id={id} inputMode="decimal" value={(value as MoneyValue | null)?.amount ?? ''} required={field.required} disabled={disabled} aria-label={field.label} onChange={event => onChange({ amount: event.target.value, currency: (value as MoneyValue | null)?.currency ?? field.config.currency ?? 'EUR' })} /><Input className="w-24" value={(value as MoneyValue | null)?.currency ?? field.config.currency ?? 'EUR'} maxLength={3} minLength={3} pattern="[A-Z]{3}" disabled={disabled} aria-label={t('currency')} onChange={event => onChange({ amount: (value as MoneyValue | null)?.amount ?? '', currency: event.target.value.toUpperCase() })} /></div>
      : <Input id={id} type={field.kind === 'date' ? 'date' : field.kind === 'datetime' ? 'datetime-local' : field.kind === 'email' ? 'email' : field.kind === 'phone' ? 'tel' : field.kind === 'url' ? 'url' : 'text'} inputMode={field.kind === 'integer' ? 'numeric' : field.kind === 'decimal' ? 'decimal' : undefined} step={field.kind === 'datetime' ? 'any' : undefined} value={field.kind === 'datetime' && string.includes('Z') ? localTimestamp(string) : string} required={field.required} maxLength={10000} disabled={disabled} onInput={field.kind === 'date' || field.kind === 'datetime' ? event => changeInput(event.currentTarget.value) : undefined} onChange={event => changeInput(event.target.value)} /> }
    {field.kind === 'datetime' ? <FieldDescription>{t('timestampHelp', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</FieldDescription> : field.kind === 'phone' ? <FieldDescription>{t('phoneHelp')}</FieldDescription> : field.kind === 'decimal' || field.kind === 'money' ? <FieldDescription>{t('decimalHelp', { scale: field.config.scale ?? 2 })}</FieldDescription> : null}
  </Field>;
}
function ReferenceControl({ field, value, workspaceId, disabled, onChange }: { field: FieldDefinition; value: FieldValue; workspaceId: string; disabled: boolean; onChange: (value: FieldValue) => void }) {
  const { t } = useTranslation();
  const principals = useQuery({ queryKey: ['field-principals', workspaceId], queryFn: () => api('list_field_principals', { workspaceId }) });
  const allowed = (principals.data ?? []).filter(item => field.config.referenceTarget === 'both' || field.config.referenceTarget === item.kind);
  const refs = (Array.isArray(value) ? value : value ? [value] : []) as ReferenceValue[];
  const label = (item: { kind: string; name: string }) => `${item.name} (${t(`reference_${item.kind}`)})`;
  if (principals.isPending) return <Loading />;
  if (principals.isError) return <ErrorNotice error={principals.error} retry={() => { void principals.refetch(); }} />;
  if (field.config.multiple) return <FieldSet><FieldLegend variant="label">{field.label}{field.required ? ' *' : ''}</FieldLegend>{allowed.map(item => <Field key={`${item.kind}:${item.id}`} orientation="horizontal"><Checkbox id={`reference-${field.id}-${item.kind}-${item.id}`} checked={refs.some(ref => ref.id === item.id && ref.kind === item.kind)} disabled={disabled} onCheckedChange={checked => onChange(checked ? [...refs, { kind: item.kind, id: item.id }] : refs.filter(ref => ref.id !== item.id || ref.kind !== item.kind))} /><FieldLabel htmlFor={`reference-${field.id}-${item.kind}-${item.id}`}>{label(item)}</FieldLabel></Field>)}{!allowed.length ? <FieldDescription>{t('noReferenceTargets')}</FieldDescription> : null}</FieldSet>;
  const items = [{ value: 'none', label: '—' }, ...allowed.map(item => ({ value: `${item.kind}:${item.id}`, label: label(item) }))];
  return <Field><FieldLabel htmlFor={`reference-${field.id}`}>{field.label}{field.required ? ' *' : ''}</FieldLabel><Select items={items} value={refs[0] ? `${refs[0].kind}:${refs[0].id}` : 'none'} disabled={disabled} onValueChange={next => { const item = allowed.find(item => `${item.kind}:${item.id}` === next); onChange(item ? { kind: item.kind, id: item.id } : null); }}><SelectTrigger id={`reference-${field.id}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}
