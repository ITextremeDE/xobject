import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signIn,ApiError} from '../src/lib/api';
test('browser authentication preserves HTTP throttling instead of disguising a plain-text error as a network failure',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 try{
  globalThis.window={location:{pathname:'/',search:''}} as Window & typeof globalThis;
  globalThis.fetch=async()=>new Response('Too many requests',{status:429});
  await assert.rejects(signIn('fixture@example.test','fixture-only'),error=>error instanceof ApiError&&error.status===429);
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});

test('browser errors retain machine codes independently of diagnostic wording',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 try{
  globalThis.window={location:{pathname:'/',search:''}} as Window & typeof globalThis;
  globalThis.fetch=async()=>Response.json({error:'Diagnostic wording may change',code:'version_conflict'},{status:409});
  await assert.rejects(signIn('fixture@example.test','fixture-only'),error=>error instanceof ApiError&&error.code==='version_conflict'&&error.message==='Diagnostic wording may change');
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});
