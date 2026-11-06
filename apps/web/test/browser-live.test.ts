import {ApiError,blocksCachedView} from '../src/lib/api.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeDraft,sameDraftValue} from '../src/lib/draft-merge.ts';
import {recordURL,pageTitle} from '../src/lib/browser-presence.ts';
import {consumeEvents} from '../src/lib/live-events.ts';
test('draft merge combines disjoint edits, requires conflicting choices, and purges inaccessible keys',()=>{
 const plan=mergeDraft({name:'old',note:'base',hidden:'secret'},{name:'mine',note:'base',hidden:'draft-secret'},{name:'old',note:'remote'});
 assert.deepEqual(plan,{merged:{name:'mine',note:'remote'},conflicts:[]});
 assert.deepEqual(mergeDraft({name:'old'},{name:'mine'},{name:'theirs'}).conflicts,['name']);
 assert.deepEqual(mergeDraft({name:'old'},{name:'same'},{name:'same'}).conflicts,[]);
 assert.ok(sameDraftValue({a:1,b:[2]},{b:[2],a:1}));assert.ok(!sameDraftValue([1,2],[2,1]));
});
test('record URLs omit drafts, search terms and authorization parameters; neutral titles omit context',()=>{
 assert.equal(recordURL('https://example.test/path?token=secret','itx','projects','123'),'https://example.test/w/itx/objects/projects/123');
 assert.equal(pageTitle('xObject','neutral',['Private customer','ITextreme']),'xObject');
 assert.equal(pageTitle('xObject','context',['Project','ITextreme']),'Project · ITextreme · xObject');
});
test('event parser handles split UTF-8 frames, heartbeats and multiple events',async()=>{
 const bytes=new TextEncoder().encode('event: ready\ndata: {"buildId":"ö"}\n\nevent: refresh\ndata: {}\n\n');const results:unknown[]=[];
 const stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}});
 await consumeEvents(new Response(stream),(event,data)=>results.push([event,data]));assert.deepEqual(results,[['ready',{buildId:'ö'}],['refresh',{}]]);
});
test('event parser accepts CRLF split between chunks',async()=>{const stream=new ReadableStream({start(controller){for(const chunk of ['event: refresh\r','\ndata: {}\r','\n\r','\n'])controller.enqueue(new TextEncoder().encode(chunk));controller.close();}}),events:string[]=[];await consumeEvents(new Response(stream),event=>events.push(event));assert.deepEqual(events,['refresh']);});
test('event parser rejects oversized frames',async()=>{await assert.rejects(consumeEvents(new Response('x'.repeat(65537)),()=>{}),/too large/);});

test('transient cached-query failures retain editors; revoked or deleted data closes them',()=>{
 const cached={isError:true,data:{id:'current'},error:new TypeError('Network failed')};assert.equal(blocksCachedView(cached),false);
 assert.equal(blocksCachedView({...cached,data:undefined}),true);
 assert.equal(blocksCachedView({...cached,error:new ApiError(500,'Unavailable')}),false);
 for(const status of [401,403,404,410])assert.equal(blocksCachedView({...cached,error:new ApiError(status,'Unavailable')}),true);
});
