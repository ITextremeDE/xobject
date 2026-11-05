import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import i18next from 'i18next';
import {I18nextProvider} from 'react-i18next';
import {DomainTemporalControl} from '../src/components/domain-temporal-control';

test('domain temporal errors describe the named date/time inputs while advanced controls stay collapsed',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{date:'Date',time:'Time',dateFor:'Date for {{name}}',timeFor:'Time for {{name}}',temporal_zoned:'Local time & time zone',temporalOptionsFor:'Date & time options for {{name}}'}}}});
 const html=renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(DomainTemporalControl,{
  field:{id:'due',label:'Due',required:false,config:{}} as any,
  value:{kind:'zoned',local:'2026-11-05T10:15:00',timeZone:'Europe/Berlin',occurrence:null},
  disabled:false,onChange:()=>{},error:'Due must be later than start.',
 })));
 assert.equal((html.match(/aria-invalid="true"/g)??[]).length,2);
 assert.equal((html.match(/aria-describedby="[^"]*field-due-error/g)??[]).length,2);
 assert.match(html,/id="field-due-error"/);
 assert.match(html,/aria-label="Date for Due"/);assert.match(html,/aria-label="Time for Due"/);
 assert.match(html,/Europe\/Berlin/);assert.match(html,/aria-label="Date &amp; time options for Due"/);
 assert.doesNotMatch(html,/role="combobox"/,'representation and zone selectors stay out of the initial form');
 assert.equal((html.match(/Due must be later than start\./g)??[]).length,1);
});
