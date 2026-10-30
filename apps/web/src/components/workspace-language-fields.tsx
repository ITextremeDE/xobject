import { useTranslation } from 'react-i18next';
import { languageCatalog, type WorkspaceLanguages, type Language } from '@xobject/contracts';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription, FieldError } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';

export function WorkspaceLanguageFields({ value, disabled, onChange }: { value: WorkspaceLanguages; disabled: boolean; onChange: (value: WorkspaceLanguages) => void }) {
  const { t } = useTranslation();
  function choices(key: 'availableLanguages' | 'labelLanguages') {
    return <FieldSet><FieldLegend>{t(key === 'availableLanguages' ? 'availableInterfaceLanguages' : 'availableLabelLanguages')}</FieldLegend><FieldDescription>{t(key === 'availableLanguages' ? 'availableInterfaceLanguagesHelp' : 'availableLabelLanguagesHelp')}</FieldDescription><FieldGroup className="gap-3">{languageCatalog.map(item => <Field key={item.code} data-disabled={disabled || undefined} orientation="horizontal"><Checkbox id={`${key}-${item.code}`} checked={value[key].includes(item.code)} disabled={disabled} onCheckedChange={checked => onChange({ ...value, [key]: (checked ? [...value[key], item.code] : value[key].filter(code => code !== item.code)).sort() })} /><FieldLabel htmlFor={`${key}-${item.code}`}>{item.nativeName}</FieldLabel></Field>)}</FieldGroup>{!value[key].length ? <FieldError>{t('atLeastOneLanguage')}</FieldError> : null}</FieldSet>;
  }
  const items = languageCatalog.filter(item => value.availableLanguages.includes(item.code)).map(item => ({ value: item.code, label: item.nativeName }));
  const validDefault = value.availableLanguages.includes(value.defaultLanguage);
  return <FieldGroup>{choices('availableLanguages')}<Field data-disabled={disabled || undefined} data-invalid={!validDefault}><FieldLabel htmlFor="workspace-default-language">{t('defaultLanguage')}</FieldLabel><Select items={items} value={validDefault ? value.defaultLanguage : null} disabled={disabled || !items.length} onValueChange={language => { if (language) onChange({ ...value, defaultLanguage: language as Language }); }}><SelectTrigger id="workspace-default-language" className="w-full" aria-invalid={!validDefault} aria-describedby={!validDefault ? 'default-language-error' : undefined}><SelectValue placeholder={t('chooseDefaultLanguage')} /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{!validDefault ? <FieldError id="default-language-error">{t('defaultLanguageUnavailable')}</FieldError> : null}</Field>{choices('labelLanguages')}</FieldGroup>;
}
