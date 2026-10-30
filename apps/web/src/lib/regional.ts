import { defaultRegionalSettings, type RegionalSettings } from '@xobject/contracts';
export function formatRegionalDate(value: string, regional: RegionalSettings = defaultRegionalSettings, timeZone = 'UTC', includeTime = false, dateOnly = false): string {
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  const zone = dateOnly ? 'UTC' : timeZone;
  let result: string;
  if (regional.dateFormat === 'locale') result = new Intl.DateTimeFormat(regional.locale, { dateStyle: 'medium', timeZone: zone }).format(date);
  else {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)!.value;
    result = regional.dateFormat === 'iso' ? `${part('year')}-${part('month')}-${part('day')}` : regional.dateFormat === 'dmy' ? `${part('day')}.${part('month')}.${part('year')}` : `${part('month')}/${part('day')}/${part('year')}`;
  }
  if (includeTime && !dateOnly) result += `, ${new Intl.DateTimeFormat(regional.locale, { timeZone: zone, timeStyle: 'short', ...(regional.hourCycle === 'locale' ? {} : { hourCycle: regional.hourCycle }) }).format(date)}`;
  return result;
}
export function formatRegionalNumber(value: string, regional: RegionalSettings, scale?: number): string {
  const locale = regional.numberFormat === 'dot' ? 'en-US' : regional.numberFormat === 'comma' ? 'de-DE' : regional.locale;
  // Intl accepts decimal strings without IEEE-754 conversion. The cast only bridges older TS lib declarations.
  return new Intl.NumberFormat(locale, { minimumFractionDigits: scale ?? 0, maximumFractionDigits: scale ?? 12 }).format(value as unknown as number);
}
export function regionalWeekStart(regional: RegionalSettings): 1 | 7 {
  if (regional.weekStart === 'monday') return 1;
  if (regional.weekStart === 'sunday') return 7;
  return ['en-US', 'en-CA'].includes(regional.locale) ? 7 : 1;
}
