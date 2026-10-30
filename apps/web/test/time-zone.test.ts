import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveTimeZone, timeZoneSchema } from '@xobject/contracts';
import { localTimestamp, timestampCandidates } from '../src/lib/time-zone.js';

test('personal zones override workspace defaults independently of browser location', () => {
  assert.equal(effectiveTimeZone(null, 'Europe/Berlin'), 'Europe/Berlin');
  assert.equal(effectiveTimeZone('Asia/Tokyo', 'Europe/Berlin'), 'Asia/Tokyo');
  assert.equal(effectiveTimeZone(null, undefined), 'UTC');
  for (const zone of ['UTC', 'Europe/Berlin', 'Asia/Kolkata', 'America/New_York']) assert.equal(timeZoneSchema.safeParse(zone).success, true);
  for (const zone of ['+01:00', 'UTC+1', 'Unknown/Zone', '']) assert.equal(timeZoneSchema.safeParse(zone).success, false);
});

test('zoned input round trips milliseconds and handles winter, summer and fractional offsets', () => {
  for (const [local, zone, utc] of [
    ['2026-01-15T12:34:56.123', 'Europe/Berlin', '2026-01-15T11:34:56.123Z'],
    ['2026-07-15T12:34:56.123', 'Europe/Berlin', '2026-07-15T10:34:56.123Z'],
    ['2026-07-15T12:34:56.123', 'Asia/Kolkata', '2026-07-15T07:04:56.123Z'],
  ]) { assert.deepEqual(timestampCandidates(local, zone), [utc]); assert.equal(localTimestamp(utc, zone), local); }
});

test('DST gaps reject and overlaps offer two explicit instants, preserving either existing occurrence', () => {
  assert.deepEqual(timestampCandidates('2026-03-29T02:30', 'Europe/Berlin'), []);
  const candidates = timestampCandidates('2026-10-25T02:30', 'Europe/Berlin');
  assert.deepEqual(candidates, ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
  for (const instant of candidates) assert.equal(localTimestamp(instant, 'Europe/Berlin'), '2026-10-25T02:30:00');
  assert.deepEqual(timestampCandidates('invalid', 'Europe/Berlin'), []);
});
