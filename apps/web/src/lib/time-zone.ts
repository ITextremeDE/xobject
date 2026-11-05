import { Temporal } from '@js-temporal/polyfill';

export function localTimestamp(value: string, timeZone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDateTime().toString();
}
export {timestampCandidates} from '@xobject/contracts';
export function isInstant(value: string): boolean {
  if(!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value))return false;
  try{Temporal.Instant.from(value);return true;}catch{return false;}
}
