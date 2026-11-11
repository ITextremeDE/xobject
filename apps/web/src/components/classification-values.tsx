import {choiceDisplayOrder} from '@xobject/contracts';
import {ChoicePicker} from './choice-picker';
import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';
import { useTranslation } from 'react-i18next';
import type { ClassificationConfig, ClassificationOption, FieldDefinition } from '@xobject/contracts';
import { Field, FieldLabel, FieldSet, FieldLegend, FieldGroup, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// Keep record values and classification configuration on the same Select composition.
export function ClassificationSelect({ id, value, options, disabled, required, describedBy, onValueChange }: {
  id: string; value: string; options: { value: string; label: string; disabled?: boolean }[];
  describedBy?:string;disabled?: boolean; required?: boolean; onValueChange: (value: string) => void;
}) {
  const items = options.map(option => ({ ...option, value: option.value || 'none' }));
  return <Select items={items} value={value || 'none'} disabled={disabled} required={required} onValueChange={next => { if (next !== null) onValueChange(next === 'none' ? '' : next); }}><SelectTrigger aria-describedby={describedBy} id={id} className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

export type ClassificationValues = { type: string | null; status: string | null; category: string[] };
export const choiceLabel = (option: ClassificationOption) => option.label ?? option.labels.en ?? option.labels.de ?? option.id;
export function displayClassification(config: ClassificationConfig, kind: string, value: unknown) {
  if (value === null || value === undefined || (Array.isArray(value) && !value.length)) return '—';
  const selected = Array.isArray(value) ? value : [value];
  const ids = [...choiceDisplayOrder(config.options.filter(option=>option.kind===kind),kind==='category'&&Boolean(config.category.tree)).filter(option=>selected.includes(option.id)).map(option => option.id), ...selected.filter(id => !config.options.some(option => option.id === id && option.kind === kind))];
  return ids.map(id => config.options.find(option => option.id === id && option.kind === kind)).map((option, index) => option ? choiceLabel(option) : String(ids[index])).join(', ');
}
export function initialChoices(config: ClassificationConfig): ClassificationValues {
  return { type: config.type.defaultId, status: config.status.defaults.find(item => item.typeId === config.type.defaultId)?.statusId ?? null, category: [...config.category.defaultIds].sort() };
}
export function ClassificationFields({ idPrefix="",allowedStatusIds,config, fields, value, onChange, disabled }: {idPrefix?:string; allowedStatusIds?:string[];fields: FieldDefinition[]; config: ClassificationConfig; value: ClassificationValues; onChange: (value: ClassificationValues) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const controlId=(kind:string)=>`${idPrefix}record-${kind}`;
  const meta=(kind:string)=>{const field=fields.find(field=>field.technicalName===kind)!;return idPrefix?{...field,id:idPrefix+field.id}:field;};
  const available = (kind: 'type' | 'status' | 'category') => config.options.filter(option => option.kind === kind && (option.active || (kind === 'category' ? value.category.includes(option.id) : value[kind] === option.id)) && (kind !== 'status' || (allowedStatusIds?allowedStatusIds.includes(option.id):option.typeId === value.type)));
  const optionName = (option: ClassificationOption) => `${choiceLabel(option)}${option.active ? '' : ` (${t('inactive')})`}`;
  const changeType = (type: string | null) => {
    const valid = config.options.some(option => option.id === value.status && option.kind === 'status' && option.typeId === type);
    onChange({ ...value, type, status: valid ? value.status : config.status.defaults.find(item => item.typeId === type)?.statusId ?? null });
  };
  return <>
    {fields.some(field => field.technicalName === 'type') ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={controlId('type')}>{t('classificationType')}{config.type.required ? ' *' : ''}</FieldLabel><FieldExplanation field={meta('type')}/><ClassificationSelect describedBy={fieldDescriptionIds(meta('type'))} id={controlId('type')} value={value.type ?? ''} required={config.type.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('type').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>changeType(next||null)}/><FieldExplanation field={meta('type')} help/></Field> : null}
    {fields.some(field => field.technicalName === 'status') ? <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={controlId('status')}>{t('classificationStatus')}{config.status.required ? ' *' : ''}</FieldLabel><FieldExplanation field={meta('status')}/><ClassificationSelect describedBy={fieldDescriptionIds(meta('status'))} id={controlId('status')} value={value.status ?? ''} required={config.status.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('status').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>onChange({...value,status:next||null})}/><FieldExplanation field={meta('status')} help/><FieldDescription>{allowedStatusIds?t('statusForRecord'):value.type ? t('statusForType') : t('statusWithoutType')}</FieldDescription></Field> : null}
    {fields.some(field => field.technicalName === 'category') ? config.category.multiple ? <Field data-disabled={disabled||undefined}><FieldLabel htmlFor={controlId('category')}>{t('classificationCategory')}{config.category.required?' *':''}</FieldLabel><FieldExplanation field={meta('category')}/><ChoicePicker id={controlId('category')} label={t('classificationCategory')} value={value.category} options={config.options.filter(option=>option.kind==='category').map(option=>({...option,label:choiceLabel(option)}))} tree={Boolean(config.category.tree)} disabled={disabled} required={config.category.required} describedBy={fieldDescriptionIds(meta('category'))} onChange={category=>onChange({...value,category})}/><FieldExplanation field={meta('category')} help/></Field>
      : <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={controlId('category')}>{t('classificationCategory')}{config.category.required ? ' *' : ''}</FieldLabel><FieldExplanation field={meta('category')}/><ClassificationSelect describedBy={fieldDescriptionIds(meta('category'))} id={controlId('category')} value={value.category[0] ?? ''} required={config.category.required} disabled={disabled} options={[{value:'',label:t('noSelection')},...available('category').map(option=>({value:option.id,label:optionName(option),disabled:!option.active}))]} onValueChange={next=>onChange({...value,category:next?[next]:[]})}/><FieldExplanation field={meta('category')} help/></Field> : null}
  </>;
}
