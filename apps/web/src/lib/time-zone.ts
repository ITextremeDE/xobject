import { Temporal } from '@js-temporal/polyfill';

export function localTimestamp(value: string, timeZone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDateTime().toString();
}
/** An overlap needs an explicit occurrence; a gap must never silently shift the input. */
export function timestampCandidates(value: string, timeZone: string): string[] {
  try {
    const plain = Temporal.PlainDateTime.from(value);
    const results = ['earlier', 'later'].map(disambiguation => plain.toZonedDateTime(timeZone, { disambiguation: disambiguation as 'earlier' | 'later' }))
      .filter(result => result.toPlainDateTime().equals(plain)).map(result => result.toInstant().toString({ fractionalSecondDigits: 3 }));
    return [...new Set(results)];
  } catch { return []; }
}
export const isInstant = (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
