import { z } from 'zod';

/** Named IANA zones and UTC only; fixed numeric offsets are not workspace policies. */
export const timeZoneSchema = z.string().max(100).refine(value => {
  if (value !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Unknown named time zone');
export function installedTimeZones(): string[] {
  return [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])].sort();
}
export const effectiveTimeZone = (personal: string | null | undefined, workspace: string | null | undefined) => personal ?? workspace ?? 'UTC';
