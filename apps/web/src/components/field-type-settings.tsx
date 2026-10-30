import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v7 } from 'uuid';
import { PlusIcon } from 'lucide-react';
import type { CustomFieldKind, FieldConfig, Labels } from '@xobject/contracts';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TranslatedLabelInput, cleanLabels, hasLabel } from './translated-label-input';

export const fieldKindKey = (kind: string) => `fieldKind_${kind}`;
export function FieldTypeSettings({ readOnly = false, kind, config, onChange, disabled, onPendingChange }: {
  readOnly?: boolean; kind: CustomFieldKind; config: FieldConfig; onChange: (config: FieldConfig) => void; disabled: boolean; onPendingChange: (value: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [newLabels, setNewLabels] = useState<Labels>({});
  useEffect(() => { onPendingChange(Object.values(newLabels).some(Boolean)); }, [newLabels, onPendingChange]);
  const options = config.options ?? [];
  return <FieldGroup>
    {kind === 'decimal' || kind === 'money' ? <Field><FieldLabel htmlFor="field-scale">{t('decimalScale')}</FieldLabel><Input id="field-scale" type="number" min={0} max={12} value={config.scale ?? 2} disabled={disabled} onChange={event => onChange({ ...config, scale: Number(event.target.value) })} /></Field> : null}
    {kind === 'money' ? <Field><FieldLabel htmlFor="field-currency">{t('defaultCurrency')}</FieldLabel><Input id="field-currency" value={config.currency ?? 'EUR'} minLength={3} maxLength={3} pattern="[A-Z]{3}" required disabled={disabled} onChange={event => onChange({ ...config, currency: event.target.value.toUpperCase() })} /><FieldDescription>{t('currencyHelp')}</FieldDescription></Field> : null}
    {kind === 'multiline' ? <Field orientation="horizontal"><Checkbox id="field-formatted" checked={config.formatted ?? false} disabled={disabled} onCheckedChange={checked => onChange({ ...config, formatted: checked === true })} /><FieldLabel htmlFor="field-formatted">{t('markdownFormatting')}</FieldLabel></Field> : null}
    {kind === 'reference' ? <>
      <Field><FieldLabel htmlFor="field-reference-target">{t('referenceTarget')}</FieldLabel><Select items={['user', 'group', 'both'].map(value => ({ value, label: t(`reference_${value}`) }))} value={config.referenceTarget ?? 'both'} disabled={disabled} onValueChange={value => { if (value) onChange({ ...config, referenceTarget: value as FieldConfig['referenceTarget'] }); }}><SelectTrigger id="field-reference-target" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{['user', 'group', 'both'].map(value => <SelectItem key={value} value={value}>{t(`reference_${value}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field orientation="horizontal"><Checkbox id="field-reference-multiple" checked={config.multiple ?? false} disabled={disabled} onCheckedChange={checked => onChange({ ...config, multiple: checked === true })} /><FieldLabel htmlFor="field-reference-multiple">{t('multipleChoice')}</FieldLabel></Field>
    </> : null}
    {kind === 'single_choice' || kind === 'multiple_choice' ? <FieldSet><FieldLegend>{t('choiceValues')}</FieldLegend><FieldGroup>
      {options.map((option, index) => <FieldSet key={option.id}><FieldLegend variant="label">{option.labels[i18n.language as 'de' | 'en'] ?? option.labels.en ?? option.labels.de ?? t('unnamedOption')}</FieldLegend><TranslatedLabelInput id={`field-option-${option.id}`} value={option.labels} readOnly={readOnly} readOnlyHelp={t('readOnlyLabelHelp')} disabled={disabled && !readOnly} onChange={labels => onChange({ ...config, options: options.map(item => item.id === option.id ? { ...item, labels } : item) })} /><Field orientation="horizontal"><Checkbox id={`field-option-active-${option.id}`} checked={option.active} disabled={disabled} onCheckedChange={checked => onChange({ ...config, options: options.map(item => item.id === option.id ? { ...item, active: checked === true } : item) })} /><FieldLabel htmlFor={`field-option-active-${option.id}`}>{t('activeChoice')} ({index + 1})</FieldLabel></Field></FieldSet>)}
      {!readOnly ? <FieldSet><FieldLegend variant="label">{t('newChoice')}</FieldLegend><TranslatedLabelInput id="field-new-option" value={newLabels} onChange={setNewLabels} disabled={disabled} requireOne={false} /><Button type="button" variant="outline" disabled={disabled || !hasLabel(newLabels) || options.length >= 300} onClick={() => { onChange({ ...config, options: [...options, { id: v7(), labels: cleanLabels(newLabels), active: true }] }); setNewLabels({}); }}><PlusIcon data-icon="inline-start" />{t('addChoice')}</Button>{Object.values(newLabels).some(Boolean) ? <FieldDescription>{t('pendingChoiceHelp')}</FieldDescription> : null}</FieldSet> : null}
    </FieldGroup></FieldSet> : null}
  </FieldGroup>;
}
