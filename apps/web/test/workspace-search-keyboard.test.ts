import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installKeyboardShortcuts,keyboardCommands} from '../src/lib/keyboard.js';
test('workspace search shortcut reaches the mounted search controller without a visible sidebar trigger',()=>{
 const globals=globalThis as any,saved={document:globals.document,window:globals.window,Element:globals.Element};
 const document=Object.assign(new EventTarget(),{querySelector:()=>null,querySelectorAll:()=>[]}),window=new EventTarget();
 Object.assign(globals,{document,window,Element:class{}});
 const cleanup=installKeyboardShortcuts();let calls=0;
 const listener=(event:Event)=>{calls++;event.preventDefault();};window.addEventListener(keyboardCommands.workspaceSearch.event,listener);
 const press=()=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'k',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,repeat:false,isComposing:false});document.dispatchEvent(event);return event;};
 try{assert.equal(press().defaultPrevented,true);assert.equal(calls,1);window.removeEventListener(keyboardCommands.workspaceSearch.event,listener);assert.equal(press().defaultPrevented,false,'sign-in screens without a controller keep native browser shortcuts');}finally{cleanup();Object.assign(globals,saved);}
});
