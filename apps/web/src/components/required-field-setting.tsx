import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function RequiredFieldSetting({ id, value, disabled = false, label, onChange }: {
  id: string; value: boolean; disabled?: boolean; label?: string; onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return <Field data-disabled={disabled || undefined}>
    <FieldLabel id={`${id}-label`}>{label ?? t('requiredField')}</FieldLabel>
    <ToggleGroup variant="outline" value={[value ? 'yes' : 'no']} disabled={disabled} aria-labelledby={`${id}-label`} className="w-full" onValueChange={values => {
      const next = values[0];
      if (next === 'yes' || next === 'no') onChange(next === 'yes');
    }}>
      <ToggleGroupItem value="yes" className="flex-1">{t('yes')}</ToggleGroupItem>
      <ToggleGroupItem value="no" className="flex-1">{t('no')}</ToggleGroupItem>
    </ToggleGroup>
  </Field>;
}
