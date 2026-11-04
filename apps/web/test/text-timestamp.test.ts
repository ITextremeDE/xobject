import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegionalSettings} from '@xobject/contracts';
import {timestampLine,insertTextTimestamp} from '../src/lib/text-timestamp';
const regional={...defaultRegionalSettings,locale:'de-DE' as const,dateFormat:'dmy' as const,hourCycle:'h23' as const};
const line='----- 04.11.2026 14:35 (John Doe) -----';
test('timestamp uses the configured date/time formats, named zone and current display name',()=>{
 const now=new Date('2026-11-04T13:35:00Z');
 assert.equal(timestampLine(now,'John Doe',regional,'Europe/Berlin'),line);
 assert.match(timestampLine(now,'Jane\nDoe',{...regional,locale:'en-US',dateFormat:'mdy',hourCycle:'h12'},'America/New_York'),/^----- 11\/04\/2026 8:35\sAM \(Jane Doe\) -----$/);
 assert.equal(timestampLine(new Date('2026-11-04T23:35:00Z'),'John Doe',regional,'Europe/Berlin'),'----- 05.11.2026 00:35 (John Doe) -----');
});
test('inserting a complete timestamp line positions the caret at the very next line',()=>{
 assert.deepEqual(insertTextTimestamp('',0,0,line),{value:line+'\n',caret:line.length+1});
 const text='BeforeAfter',result=insertTextTimestamp(text,6,6,line)!;
 assert.equal(result.value,'Before\n'+line+'\nAfter');assert.equal(result.value.slice(result.caret),'After');
 assert.equal(insertTextTimestamp('Before\nAfter',6,6,line)!.value,'Before\n'+line+'\nAfter');
 assert.equal(insertTextTimestamp('Before\nAfter',7,7,line)!.value,'Before\n'+line+'\nAfter');
 assert.equal(insertTextTimestamp('Old text',0,8,line)!.value,line+'\n');
});
test('a timestamp never truncates text or exceeds the field limit',()=>{
 assert.equal(insertTextTimestamp('x'.repeat(10000),10000,10000,line),null);
 assert.equal(insertTextTimestamp('x'.repeat(10000),0,10000,line)!.value,line+'\n');
 assert.equal(insertTextTimestamp('',0,0,line,line.length),null);
});
