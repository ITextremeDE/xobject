import { useTranslation } from 'react-i18next';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** One naming convention and associated help across all definition forms. */
export function TechnicalNameField({ id, value, onChange, disabled, readOnly = false, standard = false, workspaceCode = false }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean; readOnly?: boolean; standard?: boolean; workspaceCode?: boolean;
}) {
  const { t } = useTranslation();
  const help = standard ? 'standardTechnicalNameFixed' : readOnly ? 'technicalNameFixed' : workspaceCode ? 'codeHelp' : 'technicalHelp';
  return <Field data-disabled={disabled || undefined}>
    <FieldLabel htmlFor={id}>{t(workspaceCode ? 'code' : 'technicalName')}</FieldLabel>
    <Input id={id} value={value} required maxLength={workspaceCode ? 61 : 63} pattern={workspaceCode ? '[a-z][a-z0-9]*' : '[a-z][a-z0-9_]*'} readOnly={readOnly} disabled={disabled} autoCapitalize="none" spellCheck={false} aria-describedby={`${id}-help`} onChange={event => onChange(event.target.value)} />
    <FieldDescription id={`${id}-help`}>{t(help)}</FieldDescription>
  </Field>;
}
