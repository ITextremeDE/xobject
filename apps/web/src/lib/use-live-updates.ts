import {useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {consumeEvents} from './live-events';
export function useLiveUpdates(workspaceId:string|undefined,dirty:boolean,busy:boolean){
 const client=useQueryClient(),guard=useRef({dirty,busy}),deferred=useRef(false),[state,setState]=useState<'connecting'|'connected'|'offline'>('connecting'),[pending,setPending]=useState(false);
 const [slowConnecting,setSlowConnecting]=useState<string|null>(null);
 // Renewing the visible-record subscription is normal navigation, not an outage.
 // Only sustained connection attempts deserve a notice; offline remains immediate.
 useEffect(()=>{
  setSlowConnecting(null);
  if(!workspaceId||state!=='connecting')return;
  const timer=setTimeout(()=>setSlowConnecting(workspaceId),1500);
  return()=>clearTimeout(timer);
 },[workspaceId,state]);
 const notice=state==='offline'?'offline':state==='connecting'&&workspaceId&&slowConnecting===workspaceId?'connecting':null;
 guard.current={dirty,busy};
 const refresh=useRef<(indicated?:boolean)=>void>(()=>{});
 refresh.current=(indicated=false)=>{
  if(guard.current.dirty||guard.current.busy){deferred.current=true;if(indicated)setPending(true);
   void client.invalidateQueries({refetchType:'none'});
   // Refresh current permissions/record version without resetting definitions/settings drafts.
   if(!guard.current.busy)for(const key of ['record','record-security','record-relationships','session'])void client.invalidateQueries({queryKey:[key]});
  }else{deferred.current=false;setPending(false);void client.invalidateQueries({predicate:query=>query.queryKey[0]!=='client-info'});}
 };
 useEffect(()=>{if(!dirty&&!busy&&deferred.current)refresh.current();},[dirty,busy]);
 useEffect(()=>{
  if(!workspaceId)return;let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,attempt=0,known='',heartbeats=0;
  function watched(){const refs=new Map<string,{objectTypeId:string;recordId:string}>();
   const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
   function visit(value:unknown,type?:string,depth=0){if(depth>7||refs.size>=200||!value||typeof value!=='object')return;if(Array.isArray(value)){for(const item of value)visit(item,type,depth+1);return;}
    const item=value as Record<string,unknown>,objectTypeId=uuid(item.objectTypeId)?item.objectTypeId:type,recordId=uuid(item.recordId)?item.recordId:uuid(item.id)?item.id:undefined;
    if(objectTypeId&&recordId)refs.set(`${objectTypeId}:${recordId}`,{objectTypeId,recordId});for(const child of Object.values(item))if(child&&typeof child==='object')visit(child,Array.isArray(child)?type:undefined,depth+1);
   }
   for(const query of client.getQueryCache().getAll())if(query.getObserversCount()){const [kind,type]=query.queryKey;visit(query.state.data,['record','records'].includes(String(kind))&&uuid(type)?type:undefined);}
   return [...refs.values()].sort((a,b)=>`${a.objectTypeId}:${a.recordId}`.localeCompare(`${b.objectTypeId}:${b.recordId}`)).slice(0,200);
  }
  async function connect(){
   if(stopped)return;controller?.abort();const current=new AbortController();controller=current;const refs=watched();known=JSON.stringify(refs);setState(navigator.onLine?'connecting':'offline');
   try{const response=await fetch('/api/events',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-XObject-Request':'1'},body:JSON.stringify({workspaceId,watched:refs}),signal:current.signal});
    if(response.status===401){window.dispatchEvent(new Event('xobject:session-expired'));return;}if(!response.ok)throw new Error('Live connection failed');
    await consumeEvents(response,(event,data)=>{if(current.signal.aborted)return;if(event==='session'){window.dispatchEvent(new Event('xobject:session-expired'));current.abort();return;}if(event==='ready'){attempt=0;setState('connected');window.dispatchEvent(new CustomEvent('xobject:build',{detail:data}));refresh.current();}if(event==='refresh')refresh.current(true);if(event==='heartbeat'&&++heartbeats%4===0)refresh.current();});
   }catch{/* Network loss is recoverable and carries no record contents. */}
   if(!stopped&&controller===current&&!current.signal.aborted){setState(navigator.onLine?'connecting':'offline');timer=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);}
  }
  const resume=()=>{refresh.current();if(controller?.signal.aborted||!navigator.onLine){clearTimeout(timer);void connect();}};
  const focus=()=>{if(document.visibilityState==='visible')resume();};
  const offline=()=>setState('offline');
  // Visible references change when navigating/paging; reconnect with the bounded new watch list.
  const updateWatch=()=>{if(stopped||known===JSON.stringify(watched()))return;clearTimeout(timer);timer=setTimeout(()=>void connect(),500);};
  const unsubscribe=client.getQueryCache().subscribe(event=>{if(['observerAdded','observerRemoved','updated'].includes(event.type))updateWatch();});
  const online=()=>{clearTimeout(timer);void connect();};
  window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('focus',focus);void connect();
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();unsubscribe();window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',focus);};
 },[workspaceId,client]);
 return {state,pending,notice};
}
