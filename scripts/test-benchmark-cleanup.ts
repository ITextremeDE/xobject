import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cleanupV1Benchmark} from './measure-v1-cleanup.js';

test('benchmark cleanup attempts each ordered resource and reports all shutdown failures',async()=>{
 const steps:string[]=[];
 const fail=async(step:string)=>{steps.push(step);throw new Error(`Fixture failure: ${step}`);};
 await assert.rejects(cleanupV1Benchmark({
  clients:[{close:()=>fail('client 1')},{close:()=>fail('client 2')}],
  runtime:{app:{close:()=>fail('application')}},
  fixture:{db:{destroy:()=>fail('database')},pool:{ended:false,end:()=>fail('pool')}},
  removeOwnContainer:()=>fail('owned container')
 }),error=>{
  assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,6);
  assert.deepEqual(error.errors.map(entry=>entry.cause.message),steps.map(step=>`Fixture failure: ${step}`));
  return true;
 });
 assert.deepEqual(steps,['client 1','client 2','application','database','pool','owned container']);
});

test('benchmark cleanup removes its container after application failure and skips an already ended pool',async()=>{
 const steps:string[]=[],pool={ended:false,end:async()=>{steps.push('unexpected pool close');}};
 await assert.rejects(cleanupV1Benchmark({
  clients:[],runtime:{app:{close:async()=>{steps.push('application');throw new Error('Fixture application failure');}}},
  fixture:{db:{destroy:async()=>{steps.push('database');pool.ended=true;}},pool},
  removeOwnContainer:async()=>{steps.push('owned container');}
 }),AggregateError);
 assert.deepEqual(steps,['application','database','owned container']);
});

test('benchmark cleanup also reports container removal failure without initialized runtime resources',async()=>{
 await assert.rejects(cleanupV1Benchmark({clients:[],removeOwnContainer:async()=>{throw new Error('Fixture removal failure');}}),error=>{
  assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,1);
  assert.equal(error.errors[0].message,'V1 benchmark cleanup failed: owned container');return true;
 });
 await cleanupV1Benchmark({clients:[],removeOwnContainer:async()=>{}});
});

test('an unhandled benchmark cleanup failure exits unsuccessfully with a visible cause',()=>{
 const helper=new URL('./measure-v1-cleanup.ts',import.meta.url).href;
 const processResult=spawnSync(process.execPath,['--import','tsx','--input-type','module','--eval',`
  const {cleanupV1Benchmark}=await import(${JSON.stringify(helper)});
  await cleanupV1Benchmark({clients:[],removeOwnContainer:async()=>{throw new Error('Fixture container removal rejected');}});
 `],{encoding:'utf8'});
 assert.equal(processResult.status,1);
 assert.match(processResult.stderr,/V1 benchmark cleanup did not complete successfully/);
 assert.match(processResult.stderr,/Fixture container removal rejected/);
});
