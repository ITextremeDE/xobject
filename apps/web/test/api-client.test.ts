import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient,XObjectApiError} from '@xobject/contracts/client';
const token='xo1_00000000-0000-4000-8000-000000000001.'+'A'.repeat(43);
test('typed API client uses bearer-only versioned JSON without redirects or automatic retries',async()=>{
 let calls=0;const client=createApiClient({baseUrl:'https://xobject.example/',token,fetch:async(url,init)=>{calls++;assert.equal(String(url),'https://xobject.example/api/v1/list_workspaces');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),`Bearer ${token}`);assert.equal(new Headers(init?.headers).get('X-XObject-API-Version'),'1');return new Response('[]',{headers:{'X-XObject-API-Version':'1.0.0'}});}});
 assert.deepEqual(await client.call('list_workspaces',{}),[]);assert.equal(calls,1);
 assert.throws(()=>createApiClient({baseUrl:'http://xobject.example/',token}),/HTTPS/);assert.throws(()=>createApiClient({baseUrl:'https://user:password@xobject.example/',token}),/origin/);
});
test('typed API client preserves machine errors and rejects incompatible success responses',async()=>{
 const client=createApiClient({baseUrl:'http://127.0.0.1:4100/',token,fetch:async()=>new Response(JSON.stringify({error:'Denied',code:'forbidden'}),{status:403})});
 await assert.rejects(()=>client.call('list_workspaces',{}),(e:any)=>e instanceof XObjectApiError&&e.code==='forbidden'&&e.status===403);
 const incompatible=createApiClient({baseUrl:'https://xobject.example/',token,fetch:async()=>new Response('[]',{headers:{'X-XObject-API-Version':'2.0.0'}})});await assert.rejects(()=>incompatible.call('list_workspaces',{}),(e:any)=>e.code==='incompatible_version');
});
