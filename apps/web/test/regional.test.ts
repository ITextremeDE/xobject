import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRegionalSettings, inheritRegionalSettings, effectiveRegionalSettings } from '@xobject/contracts';
import { formatRegionalDate, formatRegionalNumber, regionalWeekStart } from '../src/lib/regional.js';
test('regional overrides inherit independently and preserve exact numeric strings', () => {
  const workspace = { ...defaultRegionalSettings, locale: 'de-DE' as const };
  const personal = { ...inheritRegionalSettings, hourCycle: 'h12' as const };
  const effective = effectiveRegionalSettings(workspace, personal);
  assert.equal(effective.locale, 'de-DE'); assert.equal(effective.hourCycle, 'h12');
  assert.equal(formatRegionalNumber('9007199254740993.12', effective, 2), '9.007.199.254.740.993,12');
  assert.equal(formatRegionalNumber('9007199254740993.12', { ...effective, numberFormat: 'dot' }, 2), '9,007,199,254,740,993.12');
  assert.equal(regionalWeekStart(effective), 1); assert.equal(regionalWeekStart({ ...effective, weekStart: 'sunday' }), 7);
});
test('regional date and time presentation remains independent of date-only meaning and browser zone', () => {
  const settings = { ...defaultRegionalSettings, dateFormat: 'iso' as const, hourCycle: 'h23' as const };
  assert.equal(formatRegionalDate('2026-07-15T23:45:00Z', settings, 'Asia/Tokyo', true), '2026-07-16, 08:45');
  assert.equal(formatRegionalDate('2026-07-15', settings, 'Asia/Tokyo', false, true), '2026-07-15');
  assert.equal(formatRegionalDate('2026-07-15', { ...settings, dateFormat: 'dmy' }, 'America/New_York', false, true), '15.07.2026');
});

test('inherited preferences show concrete examples from workspace formats', async () => {
  const { regionalSettingPreview } = await import('../src/lib/regional.js');
  const workspace = { ...defaultRegionalSettings, locale: 'de-DE' as const, dateFormat: 'iso' as const, numberFormat: 'dot' as const, hourCycle: 'h23' as const, weekStart: 'sunday' as const };
  assert.equal(regionalSettingPreview('locale', workspace), 'de-DE');
  assert.equal(regionalSettingPreview('dateFormat', workspace), '2026-07-15');
  assert.equal(regionalSettingPreview('hourCycle', workspace), '13:45');
  assert.equal(regionalSettingPreview('hourCycle', workspace, 'Europe/Berlin'), '15:45');
  assert.equal(regionalSettingPreview('numberFormat', workspace), '1,234.56');
  assert.equal(regionalSettingPreview('weekStart', workspace), 'Sonntag');
});

test('currency placement and separators follow independent preferences without rounding exact values',async()=>{
 const {formatRegionalMoney}=await import('../src/lib/regional.js');
 const de={...defaultRegionalSettings,locale:'de-DE' as const},us={...defaultRegionalSettings,locale:'en-US' as const};
 assert.equal(formatRegionalMoney('1234.56','EUR',de),'1.234,56\u00a0EUR');
 assert.equal(formatRegionalMoney('1234.56','EUR',us),'EUR\u00a01,234.56');
 assert.equal(formatRegionalMoney('-1234.56','USD',{...de,numberFormat:'dot'}),'-1,234.56\u00a0USD');
 assert.equal(formatRegionalMoney('9007199254740993.12','EUR',de),'9.007.199.254.740.993,12\u00a0EUR');
});
