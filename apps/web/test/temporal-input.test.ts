import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegionalSettings,regionalLocales} from '@xobject/contracts';
import {dateInputPattern,formatDateInput,parseDateInput,isCalendarDate,formatTimeInput,parseTimeInput,temporalInputParts,temporalInputValue} from '../src/lib/temporal-input.js';
import {isInstant} from '../src/lib/time-zone.js';
const de={...defaultRegionalSettings,locale:'de-DE' as const};
const us={...defaultRegionalSettings,locale:'en-US' as const};
test('calendar-date input round trips every supported region and override without browser time-zone conversion',()=>{
 for(const locale of regionalLocales)for(const dateFormat of ['locale','iso','dmy','mdy'] as const){
  const settings={...de,locale,dateFormat};
  for(const date of ['0001-01-01','2024-02-29','2026-07-15','9999-12-31']){
   assert.equal(parseDateInput(formatDateInput(date,settings),settings),date,`${locale}/${dateFormat}/${date}`);
   assert.equal(parseDateInput(date,settings),date,'ISO paste remains unambiguous');
  }
 }
 assert.equal(dateInputPattern(de),'DD.MM.YYYY');assert.equal(dateInputPattern(us),'MM/DD/YYYY');
 assert.equal(parseDateInput('1.2.2026',de),'2026-02-01');
 for(const raw of ['29.02.2026','31.04.2026','00.01.2026','15.13.2026','1.2.26','2026-02-30','15/07/2026'])assert.equal(parseDateInput(raw,de),null,raw);
 for(const raw of ['0000-01-01','2026-02-30','2026-13-01','2026-01-00','2026-01-01T00:00:00Z'])assert.equal(isCalendarDate(raw),false);
});
test('clock input observes independent 12/24-hour overrides and retains seconds and milliseconds',()=>{
 for(const locale of regionalLocales)for(const hourCycle of ['locale','h12','h23'] as const){
  const settings={...de,locale,hourCycle};
  for(const time of ['00:00:00.000','12:00:00.000','23:59:59.123','01:02:03.007']){
   assert.equal(parseTimeInput(formatTimeInput(`2026-07-15T${time}`,settings),settings),time,`${locale}/${hourCycle}/${time}`);
  }
 }
 assert.equal(parseTimeInput('12:00 AM',us),'00:00:00.000');assert.equal(parseTimeInput('12:00 pm',us),'12:00:00.000');
 assert.equal(parseTimeInput('1:30 p.m.',us),'13:30:00.000');
 for(const raw of ['24:00','12:60','12:00:60','12:30 PM','-1:00'])assert.equal(parseTimeInput(raw,de),null,raw);
 for(const raw of ['00:30 AM','13:30 PM','12:30'])assert.equal(parseTimeInput(raw,us),null,raw);
});
test('regional date/time edits preserve instants, resolve named zones and require an explicit DST occurrence',()=>{
 const instant='2026-07-15T13:45:56.123Z';
 for(const zone of ['Europe/Berlin','Asia/Tokyo','America/New_York'])for(const settings of [de,us]){
  const parts=temporalInputParts(instant,settings,zone);
  assert.equal(temporalInputValue(parts.date,parts.time,settings,zone),instant);
 }
 assert.equal(temporalInputValue('29.03.2026','02:30',de,'Europe/Berlin'),'2026-03-29T02:30:00.000');
 assert.equal(temporalInputValue('25.10.2026','02:30',de,'Europe/Berlin'),'2026-10-25T02:30:00.000');
 for(const occurrence of ['2026-10-25T00:30:00.000Z','2026-10-25T01:30:00.000Z'])assert.equal(temporalInputValue('25.10.2026','02:30',de,'Europe/Berlin',occurrence),occurrence);
 assert.equal(temporalInputValue('','',de,'Europe/Berlin'),null);
 assert.equal(isInstant('invalidZ'),false);assert.equal(isInstant('2026-02-30T10:00:00Z'),false);
 assert.equal(isInstant('2026-07-15T13:45:56.123Z'),true);
});

test('incomplete temporal text can never masquerade as a valid instant and survives a control remount',()=>{
 const draft=temporalInputValue('2026-07-15T13:45:00Z','',de,'Europe/Berlin')!;
 assert.equal(isInstant(draft),false);
 assert.deepEqual(temporalInputParts(draft,de,'Europe/Berlin'),{date:'2026-07-15T13:45:00Z',time:''});
 const incomplete=temporalInputValue('15.07.2026','1:',de,'Europe/Berlin')!;
 assert.equal(isInstant(incomplete),false);
 assert.deepEqual(temporalInputParts(incomplete,de,'Europe/Berlin'),{date:'15.07.2026',time:'1:'});
});
