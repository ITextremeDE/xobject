import { useTranslation } from 'react-i18next';
import { regionalLocales, effectiveRegionalSettings, type RegionalSettings, type PersonalRegionalSettings } from '@xobject/contracts';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate, formatRegionalNumber, regionalWeekStart } from '@/lib/regional';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';

type Props = { value: RegionalSettings | PersonalRegionalSettings; inherited?: RegionalSettings; disabled: boolean; onChange: (value: RegionalSettings | PersonalRegionalSettings) => void };
export function RegionalFields({ value, inherited, disabled, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const timeZone = useTimeZone();
  const effective = inherited ? effectiveRegionalSettings(inherited, value as PersonalRegionalSettings) : value as RegionalSettings;
  const fields = [
    { key: 'locale', label: 'regionalFormat', items: regionalLocales.map(locale => ({ value: locale, label: `${new Intl.DisplayNames([i18n.language], { type: 'language' }).of(locale) ?? locale} (${locale})` })) },
    { key: 'dateFormat', label: 'dateFormat', items: ['locale', 'iso', 'dmy', 'mdy'].map(item => ({ value: item, label: t(`dateFormat_${item}`) })) },
    { key: 'hourCycle', label: 'clockFormat', items: ['locale', 'h12', 'h23'].map(item => ({ value: item, label: t(`clockFormat_${item}`) })) },
    { key: 'numberFormat', label: 'numberFormat', items: ['locale', 'dot', 'comma'].map(item => ({ value: item, label: t(`numberFormat_${item}`) })) },
    { key: 'weekStart', label: 'weekStart', items: ['locale', 'monday', 'sunday'].map(item => ({ value: item, label: t(`weekStart_${item}`) })) },
  ] as const;
  const preview = formatRegionalDate('2026-07-15T13:45:00Z', effective, timeZone, true);
  return <FieldGroup>{fields.map(field => {
    const id = `${inherited ? 'personal' : 'workspace'}-region-${field.key}`;
    const items = [...(inherited ? [{ value: 'inherit', label: t('inheritWorkspace') }] : []), ...field.items];
    return <Field key={field.key} data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{t(field.label)}</FieldLabel><Select items={items} value={value[field.key] ?? 'inherit'} disabled={disabled} onValueChange={next => { if (next) onChange({ ...value, [field.key]: next === 'inherit' ? null : next }); }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
  })}<Field><FieldLabel>{t('preview')}</FieldLabel><FieldDescription>{preview} · {formatRegionalNumber('1234567.89', effective, 2)} · {t('weekStartsOn', { day: t(regionalWeekStart(effective) === 1 ? 'weekStart_monday' : 'weekStart_sunday') })}</FieldDescription><FieldDescription>{t('regionalInputHelp')}</FieldDescription></Field></FieldGroup>;
}
