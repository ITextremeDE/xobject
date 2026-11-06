import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webURL} from '../src/lib/web-url.ts';
test('only complete HTTP(S) URLs are actionable, without changing stored field values',()=>{
 assert.equal(webURL('https://example.test/path?x=1#part'),'https://example.test/path?x=1#part');
 assert.equal(webURL('http://example.test'),'http://example.test/');
 for(const value of [null,undefined,'','example.test','/relative','//example.test',' https://example.test','https://example.test ','javascript:alert(1)','data:text/html,test','file:///tmp/test','mailto:person@example.test','https://'])assert.equal(webURL(value),null,String(value));
});
