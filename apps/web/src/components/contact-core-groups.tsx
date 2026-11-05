import type {ReactNode} from 'react';
import type {FormLayout} from '@xobject/contracts';

type Group=FormLayout['groups'][number];
/** Record forms and loading frames share the fixed Contact section order. */
export function ContactCoreGroups({layout,renderGroup,media}:{media?:ReactNode;layout:FormLayout;renderGroup:(group:Group,singleColumn:boolean)=>ReactNode}){
 const name=layout.groups.find(group=>group.id==='contact-name'),business=layout.groups.find(group=>group.id==='contact-business');
 const details=layout.groups.find(group=>group.id==='contact-details'),locale=layout.groups.find(group=>group.id==='contact-locale');
 const communication=layout.groups.find(group=>group.id==='contact-communication'),addresses=layout.groups.find(group=>group.id==='contact-addresses');
 const rest=layout.groups.filter(group=>![name,business,details,locale,communication,addresses].includes(group));
 return <>
  {name||media||business?<div className="grid min-w-0 items-start gap-6 xl:grid-cols-3">{name?<div className={media||business?'min-w-0 xl:col-span-2':'min-w-0 xl:col-span-3'}>{renderGroup(name,false)}</div>:null}{media||business?<div className={name?'flex min-w-0 flex-col gap-6':'flex min-w-0 flex-col gap-6 xl:col-span-3'}>{media}{business?renderGroup(business,true):null}</div>:null}</div>:null}
  {details||locale?<div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">{[details,locale].filter((group):group is Group=>Boolean(group)).map(group=><div key={group.id} className={details&&locale?'min-w-0':'min-w-0 xl:col-span-2'}>{renderGroup(group,true)}</div>)}</div>:null}
  {communication||addresses?<div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">{[communication,addresses].filter((group):group is Group=>Boolean(group)).map(group=><div key={group.id} className={communication&&addresses?'min-w-0':'min-w-0 xl:col-span-2'}>{renderGroup(group,true)}</div>)}</div>:null}
  {rest.map(group=><div key={group.id} className="min-w-0">{renderGroup(group,false)}</div>)}
 </>;
}
