import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Labels } from '@xobject/contracts';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';

// The application currently supports these two languages; the editor adds no input per language.
const languages = ['de', 'en'] as const;
export const hasLabel = (labels: Labels) => Object.values(labels).some(value => value.trim());
export const cleanLabels = (labels: Labels): Labels => Object.fromEntries(Object.entries(labels).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
export const sameLabels = (a: Labels, b: Labels) => JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y))) === JSON.stringify(Object.entries(b).sort(([x], [y]) => x.localeCompare(y)));

export function TranslatedLabelInput({ id, value, onChange, disabled = false, readOnly = false, requireOne = true, autoFocus = false, showHelp = true, readOnlyHelp }: {
  id: string; value: Labels; onChange: (value: Labels) => void; disabled?: boolean; readOnly?: boolean; requireOne?: boolean; autoFocus?: boolean; showHelp?: boolean; readOnlyHelp?: string;
}) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState<string>(() => languages.find(code => code === i18n.language.split('-')[0]) ?? 'en');
  const displayNames = new Intl.DisplayNames([i18n.language], { type: 'language' });
  const items = languages.map(code => ({ value: code, label: displayNames.of(code) ?? code }));
  return <Field>
    <FieldLabel htmlFor={id}>{t('objectName')}</FieldLabel>
    <div className="flex min-w-0 flex-wrap gap-2">
      <Select items={items} value={language} disabled={disabled} onValueChange={next => { if (next) setLanguage(next); }}>
        <SelectTrigger className="w-40 shrink-0" aria-label={t('translationLanguage')}><SelectValue /></SelectTrigger>
        <SelectContent className="min-w-56"><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}><span>{item.label}</span><span className="text-muted-foreground">· {t(value[item.value]?.trim() ? 'translationPresent' : 'translationMissing')}</span></SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <Input id={id} autoFocus={autoFocus} className="min-w-32 flex-1" lang={language} value={value[language] ?? ''} maxLength={200} disabled={disabled} readOnly={readOnly} required={requireOne && !readOnly && !hasLabel(value)} placeholder={t('translationPlaceholder')} aria-describedby={showHelp ? `${id}-help` : undefined} onChange={event => {
        const next = { ...value };
        if (event.target.value) next[language] = event.target.value; else delete next[language];
        onChange(next);
      }} />
    </div>
    {showHelp ? <FieldDescription id={`${id}-help`}>{readOnly && readOnlyHelp ? readOnlyHelp : t(readOnly ? 'sharedFieldLabelsFixed' : 'translationHelp')}</FieldDescription> : null}
  </Field>;
}
