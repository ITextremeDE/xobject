import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toast} from '../src/components/ui/toast.js';
import {copyToClipboard} from '../src/lib/notifications.js';

test('clipboard feedback reports the actual result without putting copied data in notifications',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),original=toast.add,messages:unknown[]=[];
 toast.add=(options:any)=>{messages.push(options);return 'test-toast';};
 try{
  let written='';Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async(value:string)=>{written=value;}}}});
  assert.equal(await copyToClipboard('private copied contents','Copied','Failed'),true);assert.equal(written,'private copied contents');assert.equal((messages[0] as any).type,'success');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw new Error('denied');}}}});
  assert.equal(await copyToClipboard('private copied contents','Copied','Failed'),false);assert.equal((messages[1] as any).type,'error');
  assert.equal(JSON.stringify(messages).includes('private copied contents'),false);assert.equal(messages.length,2);
 }finally{toast.add=original;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else Reflect.deleteProperty(globalThis,'navigator');}
});
