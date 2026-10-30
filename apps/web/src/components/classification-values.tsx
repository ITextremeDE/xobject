import { useTranslation } from 'react-i18next';
import type { ClassificationConfig, ClassificationOption, FieldDefinition } from '@xobject/contracts';
import { Field, FieldLabel, FieldSet, FieldLegend, FieldGroup, FieldDescription } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';

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
    {fields.some(field => field.technicalName === 'type') ? <Field><FieldLabel htmlFor="record-type">{t('classificationType')}{config.type.required ? ' *' : ''}</FieldLabel><NativeSelect id="record-type" className="w-full" value={value.type ?? ''} required={config.type.required} disabled={disabled} onChange={event => changeType(event.target.value || null)}><NativeSelectOption value="">{t('noSelection')}</NativeSelectOption>{available('type').map(option => <NativeSelectOption key={option.id} value={option.id} disabled={!option.active}>{optionName(option)}</NativeSelectOption>)}</NativeSelect></Field> : null}
    {fields.some(field => field.technicalName === 'status') ? <Field><FieldLabel htmlFor="record-status">{t('classificationStatus')}{config.status.required ? ' *' : ''}</FieldLabel><NativeSelect id="record-status" className="w-full" value={value.status ?? ''} required={config.status.required} disabled={disabled} onChange={event => onChange({ ...value, status: event.target.value || null })}><NativeSelectOption value="">{t('noSelection')}</NativeSelectOption>{available('status').map(option => <NativeSelectOption key={option.id} value={option.id} disabled={!option.active}>{optionName(option)}</NativeSelectOption>)}</NativeSelect><FieldDescription>{value.type ? t('statusForType') : t('statusWithoutType')}</FieldDescription></Field> : null}
    {fields.some(field => field.technicalName === 'category') ? config.category.multiple ? <FieldSet aria-describedby={config.category.required ? "record-category-required" : undefined}><FieldLegend variant="label">{t('classificationCategory')}{config.category.required ? ' *' : ''}</FieldLegend>{config.category.required ? <FieldDescription id="record-category-required">{t('chooseAtLeastOne')}</FieldDescription> : null}<FieldGroup className="gap-3">{available('category').map(option => <Field orientation="horizontal" key={option.id}><Checkbox id={`record-category-${option.id}`} checked={value.category.includes(option.id)} disabled={disabled} onCheckedChange={checked => onChange({ ...value, category: (checked ? [...value.category, option.id] : value.category.filter(id => id !== option.id)).sort() })} /><FieldLabel htmlFor={`record-category-${option.id}`}>{optionName(option)}</FieldLabel></Field>)}{!available('category').length ? <FieldDescription>{t('noChoices')}</FieldDescription> : null}</FieldGroup></FieldSet>
      : <Field><FieldLabel htmlFor="record-category">{t('classificationCategory')}{config.category.required ? ' *' : ''}</FieldLabel><NativeSelect id="record-category" className="w-full" value={value.category[0] ?? ''} required={config.category.required} disabled={disabled} onChange={event => onChange({ ...value, category: event.target.value ? [event.target.value] : [] })}><NativeSelectOption value="">{t('noSelection')}</NativeSelectOption>{available('category').map(option => <NativeSelectOption key={option.id} value={option.id} disabled={!option.active}>{optionName(option)}</NativeSelectOption>)}</NativeSelect></Field> : null}
  </>;
}
