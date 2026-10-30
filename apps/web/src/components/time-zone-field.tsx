import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { ErrorNotice } from './feedback';

export function TimeZoneField({ id, value, disabled, inherited, onChange }: { id: string; value: string | null; disabled: boolean; inherited?: string; onChange: (value: string | null) => void }) {
  const { t } = useTranslation();
  const zones = useQuery({ queryKey: ['time-zone-catalog'], queryFn: () => api('get_time_zone_catalog', {}), staleTime: Infinity });
  const items = [...(inherited ? [{ value: 'inherit', label: t('inheritTimeZone', { timezone: inherited }) }] : []), ...[...new Set([...(zones.data ?? []), ...(value ? [value] : [])])].sort().map(zone => ({ value: zone, label: zone }))];
  return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{t('timeZone')}</FieldLabel><Select items={items} value={value ?? 'inherit'} disabled={disabled || zones.isPending || zones.isError} onValueChange={next => { if (next) onChange(next === 'inherit' ? null : next); }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>{t('timeZoneHelp')}</FieldDescription>{zones.isError ? <ErrorNotice error={zones.error} retry={() => { void zones.refetch(); }} /> : null}</Field>;
}
