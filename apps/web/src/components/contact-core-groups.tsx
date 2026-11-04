import type {ReactNode} from 'react';
import type {FormLayout} from '@xobject/contracts';

type Group=FormLayout['groups'][number];
/** The fixed contact header shares its responsive composition with the loading view. */
export function ContactCoreGroups({layout,renderGroup}:{layout:FormLayout;renderGroup:(group:Group,singleColumn:boolean)=>ReactNode}){
 const name=layout.groups.find(group=>group.id==='contact-name'),details=layout.groups.find(group=>group.id==='contact-details');
 const communication=layout.groups.find(group=>group.id==='contact-communication'),addresses=layout.groups.find(group=>group.id==='contact-addresses');
 const rest=layout.groups.filter(group=>![name,details,communication,addresses].includes(group));
 return <>{name||details?<div className="grid min-w-0 items-start gap-6 xl:grid-cols-3">{name?<div className={details?'min-w-0 xl:col-span-2':'min-w-0 xl:col-span-3'}>{renderGroup(name,false)}</div>:null}{details?<div className={name?'min-w-0':'min-w-0 xl:col-span-3'}>{renderGroup(details,true)}</div>:null}</div>:null}{communication||addresses?<div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">{[communication,addresses].filter((group):group is Group=>Boolean(group)).map(group=><div key={group.id} className={communication&&addresses?'min-w-0':'min-w-0 xl:col-span-2'}>{renderGroup(group,true)}</div>)}</div>:null}{rest.map(group=><div key={group.id} className="min-w-0">{renderGroup(group,false)}</div>)}</>;
}
