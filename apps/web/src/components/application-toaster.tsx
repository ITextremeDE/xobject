import {useLayoutEffect,useState,type ReactNode} from 'react';
import {Toaster} from './ui/toast';

/** Keep standard toast stacks above visible record/dialog actions, including wrapped mobile footers. */
export function ApplicationToaster({children}:{children:ReactNode}){
 const [bottom,setBottom]=useState(16);
 useLayoutEffect(()=>{
  let frame=0;const observed=new Set<HTMLElement>();
  const update=()=>{
   frame=0;
   const footers=[...document.querySelectorAll<HTMLElement>('[data-record-form-actions], [data-slot="dialog-footer"]')];
   for(const previous of observed)if(!footers.includes(previous)){resize.unobserve(previous);observed.delete(previous);}
   let reserve=16;
   for(const footer of footers){
    if(!observed.has(footer)){resize.observe(footer);observed.add(footer);}
    if(footer.closest('[aria-hidden="true"], [inert]'))continue;
    const rect=footer.getBoundingClientRect();
    if(rect.height&&rect.top>=0&&rect.bottom<=window.innerHeight+1)reserve=Math.max(reserve,window.innerHeight-rect.top+12);
   }
   setBottom(reserve);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(schedule),mutation=new MutationObserver(schedule);
  mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-hidden','inert','hidden','data-open']});
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);schedule();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);};
 },[]);
 return <Toaster timeout={3500} limit={3} viewportProps={{style:{bottom}}}>{children}</Toaster>;
}
