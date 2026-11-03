import { useTranslation } from 'react-i18next';
import type { ClassificationConfig, ClassificationOption, FieldDefinition } from '@xobject/contracts';
import { Field, FieldLabel, FieldSet, FieldLegend, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// Keep record values and classification configuration on the same Select composition.
export function ClassificationSelect({ id, value, options, disabled, required, onValueChange }: {
  id: string; value: string; options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean; required?: boolean; onValueChange: (value: string) => void;
}) {
  const items = options.map(option => ({ ...option, value: option.value || 'none' }));
  return <Select items={items} value={value || 'none'} disabled={disabled} required={required} onValueChange={next => { if (next !== null) onValueChange(next === 'none' ? '' : next); }}><SelectTrigger id={id} className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

export type ClassificationValues = { type: string | null; status: string | null; category: string[] };
export const choiceLabel = (option: ClassificationOption) => option.label ?? option.labels.en ?? option.labels.de ?? option.id;
export function displayClassification(config: ClassificationConfig, kind: string, value: unknown) {
  if (value === null || value === undefined || (Array.isArray(value) && !value.length)) return '—';
  const selected = Array.isArray(value) ? value : [value];
  const ids = [...config.options.filter(option => option.kind === kind && selected.includes(option.id)).map(option => option.id), ...selected.filter(id => !config.options.some(option => option.id === id && option.kind === kind))];
  return ids.map(id => config.options.find(option => option.id === id && option.kind === kind)).map((option, index) => option ? choiceLabel(option) : String(ids[index])).join(', ');
}
export function initialChoices(config: ClassificationConfig): ClassificationValues {
  return { type: config.type.defaultId, status: config.status.defaults.find(item => item.typeId === config.type.defaultId)?.statusId ?? null, category: [...config.category.defaultIds].sort() };
}
export function ClassificationFields({ config, fields, value, onChange, disabled }: { fields: FieldDefinition[]; config: ClassificationConfig; value: ClassificationValues; onChange: (value: ClassificationValues) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const available = (kind: 'type' | 'status' | 'category') => config.options.filter(option => option.kind === kind && (option.active || (kind === 'category' ? value.category.includes(option.id) : value[kind] === option.id)) && (kind !== 'status' || option.typeId === value.type));
  const optionName = (option: ClassificationOption) => `${choiceLabel(option)}${option.active ? '' : ` (${t('inactive')})`}`;
  const changeType = (type: string | null) => {
    const valid = config.options.some(option => option.id === value.status && option.kind === 'status' && option.typeId === type);
    onChange({ ...value, type, status: valid ? value.status : config.status.defaults.find(item => item.typeId === type)?.statusId ?? null });
  };
  return <>
    {fields.some(field => field.technicalName === 'type') ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="record-type">{t('classificationType')}{config.type.required ? ' *' : ''}</FieldLabel><ClassificationSelect id="record-type" value={value.type ?? ''} required={config.type.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('type').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>changeType(next||null)}/></Field> : null}
    {fields.some(field => field.technicalName === 'status') ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="record-status">{t('classificationStatus')}{config.status.required ? ' *' : ''}</FieldLabel><ClassificationSelect id="record-status" value={value.status ?? ''} required={config.status.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('status').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>onChange({...value,status:next||null})}/><FieldDescription>{value.type ? t('statusForType') : t('statusWithoutType')}</FieldDescription></Field> : null}
    {fields.some(field => field.technicalName === 'category') ? config.category.multiple ? <FieldSet className="md:col-span-2" aria-describedby={config.category.required ? "record-category-required" : undefined}><FieldLegend variant="label">{t('classificationCategory')}{config.category.required ? ' *' : ''}</FieldLegend>{config.category.required ? <FieldDescription id="record-category-required">{t('chooseAtLeastOne')}</FieldDescription> : null}<FieldGroup className="flex-row flex-wrap gap-x-5 gap-y-3">{available('category').map(option => <Field data-disabled={disabled || undefined} orientation="horizontal" className="w-fit" key={option.id}><Checkbox id={`record-category-${option.id}`} checked={value.category.includes(option.id)} disabled={disabled || (!option.active && !value.category.includes(option.id))} onCheckedChange={checked => onChange({ ...value, category: (checked ? [...value.category, option.id] : value.category.filter(id => id !== option.id)).sort() })} /><FieldLabel htmlFor={`record-category-${option.id}`}>{optionName(option)}</FieldLabel></Field>)}{!available('category').length ? <FieldDescription>{t('noChoices')}</FieldDescription> : null}</FieldGroup></FieldSet>
      : <Field data-disabled={disabled || undefined}><FieldLabel htmlFor="record-category">{t('classificationCategory')}{config.category.required ? ' *' : ''}</FieldLabel><ClassificationSelect id="record-category" value={value.category[0] ?? ''} required={config.category.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('category').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>onChange({...value,category:next?[next]:[]})}/></Field> : null}
  </>;
}
