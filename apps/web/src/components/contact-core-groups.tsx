import type {ReactNode} from 'react';
import type {FormLayout} from '@xobject/contracts';
import {cn} from '@/lib/utils';
type Group=FormLayout['groups'][number];
/** A single DOM reading order, shared by overview, editor and loading frames. */
export function ContactCoreGroups({layout,renderGroup,media,extensions}:{extensions?:ReactNode;media?:ReactNode;layout:FormLayout;renderGroup:(group:Group,singleColumn:boolean)=>ReactNode}){
 const find=(id:string)=>layout.groups.find(g=>g.id===id);
 const rows=[['contact-name','contact-details'],['contact-business','contact-locale','contact-correspondence'],['contact-communication','contact-addresses']];
 const placed=new Set(rows.flat());placed.add('contact-classification');placed.add('contact-notes');
 const classification=find('contact-classification'),notes=find('contact-notes');
 return <>
  {classification?renderGroup(classification,false):null}
  {rows.map((ids,index)=>{const groups=ids.map(find).filter((g):g is Group=>Boolean(g));return groups.length?<div key={index} className={cn('grid min-w-0 items-start gap-6',groups.length===3?'xl:grid-cols-3':groups.length===2?'xl:grid-cols-2':undefined)}>{groups.map(group=><div className="flex min-w-0 flex-col gap-6" key={group.id}>{renderGroup(group,groups.length===3)}{(group.id==='contact-details'||group.id==='contact-name'&&!find('contact-details'))?media:null}</div>)}</div>:null;})}
  {layout.groups.filter(g=>!placed.has(g.id)).map(group=><div key={group.id} className="min-w-0">{renderGroup(group,false)}</div>)}
  {extensions}
  {notes?renderGroup(notes,false):null}
 </>;
}
