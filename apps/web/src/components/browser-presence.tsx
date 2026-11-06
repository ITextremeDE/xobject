import {useEffect,useState,useSyncExternalStore} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useLocation} from 'react-router';
import {useTranslation} from 'react-i18next';
import {pageTitle} from '@/lib/browser-presence';
import type {DataRecord,ObjectDefinition,Workspace} from '@xobject/contracts';
import {Alert,AlertDescription} from './ui/alert';
import {Button} from './ui/button';
import {DropdownMenuItem} from './ui/dropdown-menu';
import {DownloadIcon} from 'lucide-react';
declare const __XOBJECT_BUILD__:string;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let installEvent:InstallEvent|null=null;const listeners=new Set<()=>void>();
const changed=()=>{for(const listener of listeners)listener();};
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event as InstallEvent;changed();});
window.addEventListener('appinstalled',()=>{installEvent=null;changed();});
export function InstallAppItem(){
 const {t}=useTranslation();const available=useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>Boolean(installEvent));
 if(!available||window.matchMedia('(display-mode: standalone)').matches)return null;
 return <DropdownMenuItem onClick={()=>{const event=installEvent;installEvent=null;changed();void event?.prompt().catch(()=>{});}}><DownloadIcon/>{t('installApp')}</DropdownMenuItem>;
}
export function BrowserPresence({dirty=false,busy=false}:{dirty?:boolean;busy?:boolean}){
 const {t,i18n}=useTranslation(),location=useLocation(),client=useQueryClient(),[update,setUpdate]=useState(false);
 const info=useQuery({queryKey:['client-info'],queryFn:async()=>{const response=await fetch('/api/client-info',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('Client information unavailable');return response.json() as Promise<{name:string;titleMode:'context'|'neutral';buildId:string}>;},staleTime:Infinity});
 const title=useSyncExternalStore(listener=>client.getQueryCache().subscribe(listener),()=>{
  const match=location.pathname.match(/^\/w\/([^/]+)(?:\/objects\/([^/]+)(?:\/([^/]+))?)?/);
  const workspaces=client.getQueryCache().findAll({queryKey:['workspaces']}).flatMap(query=>(query.state.data??[]) as Workspace[]),workspace=workspaces.find(item=>item.code===match?.[1]);
  const definition=client.getQueryCache().findAll({queryKey:['definition']}).map(query=>query.state.data as ObjectDefinition|undefined).find(item=>item?.workspaceId===workspace?.id&&item?.technicalName===match?.[2]);
  const record=definition&&match?.[3]&&match[3]!=='new'?client.getQueryData<DataRecord>(['record',definition.id,match[3]]):undefined;
  const label=location.pathname==='/settings'?t('settings'):match?.[3]==='new'?t('createRecord'):record?.keyword??definition?.label??(match?t('dashboard'):undefined);
  return pageTitle(info.data?.name??'xObject',info.data?.titleMode??'neutral',[label,workspace?.name]);
 });
 useEffect(()=>{document.title=title;},[title]);
 useEffect(()=>{
  const check=(event:Event)=>{const build=(event as CustomEvent<{buildId?:string}>).detail?.buildId;if(build&&build!==__XOBJECT_BUILD__)setUpdate(true);};
  const failure=(event:Event)=>{event.preventDefault();setUpdate(true);};
  const focus=()=>{void info.refetch();};
  window.addEventListener('xobject:build',check);window.addEventListener('vite:preloadError',failure);window.addEventListener('focus',focus);
  return()=>{window.removeEventListener('xobject:build',check);window.removeEventListener('vite:preloadError',failure);window.removeEventListener('focus',focus);};
 },[info.refetch]);
 useEffect(()=>{if(info.data&&info.data.buildId!==__XOBJECT_BUILD__)setUpdate(true);},[info.data]);
 useEffect(()=>{
  const sync=()=>{const background=getComputedStyle(document.body).backgroundColor;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',background);document.documentElement.lang=i18n.resolvedLanguage??'en';};
  const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});sync();return()=>observer.disconnect();
 },[i18n.resolvedLanguage]);
 return update?<Alert role="status"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t(dirty?'appUpdateDraft':'appUpdateAvailable')}</span><Button size="sm" variant="outline" disabled={dirty||busy} onClick={()=>window.location.reload()}>{t('reloadApp')}</Button></AlertDescription></Alert>:null;
}
