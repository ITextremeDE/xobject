import type {ReactNode} from 'react';
import type {FormLayout} from '@xobject/contracts';
import {cn} from '@/lib/utils';
type Group=FormLayout['groups'][number];
/** A single DOM reading order, shared by overview, editor and loading frames. */
export function ContactCoreGroups({layout,renderGroup,media,extensions}:{extensions?:ReactNode;media?:ReactNode;layout:FormLayout;renderGroup:(group:Group,singleColumn:boolean)=>ReactNode}){
 const find=(id:string)=>layout.groups.find(g=>g.id===id);
 const rows=[['contact-details','contact-correspondence','contact-locale'],['contact-communication','contact-addresses'],['contact-organization','contact-organization-addresses']];
 const placed=new Set([...rows.flat(),'contact-name','contact-business','contact-classification','contact-notes']);
 const classification=find('contact-classification'),notes=find('contact-notes');
 const name=find('contact-name'),business=find('contact-business');
 return <>
  {name||media||business?<div data-contact-row="identity" className={cn('grid min-w-0 items-start gap-6',name&&(media||business)&&'xl:grid-cols-2')}>
   {name?<div data-contact-section={name.id} className="min-w-0">{renderGroup(name,false)}</div>:null}
   {media||business?<div className="flex min-w-0 flex-col gap-6">{media}{business?<div data-contact-section={business.id}>{renderGroup(business,false)}</div>:null}</div>:null}
  </div>:null}
  {rows.map((ids,index)=>{const groups=ids.map(find).filter((g):g is Group=>Boolean(g));return groups.length?<div key={index} data-contact-row={index} className={cn('grid min-w-0 items-start gap-6',groups.length===3?'xl:grid-cols-3':groups.length===2?'xl:grid-cols-2':undefined)}>{groups.map(group=><div data-contact-section={group.id} className="min-w-0" key={group.id}>{renderGroup(group,groups.length===3||group.id==='contact-organization')}</div>)}</div>:null;})}
  {classification?<div data-contact-section={classification.id}>{renderGroup(classification,false)}</div>:null}
  {layout.groups.filter(g=>!placed.has(g.id)).map(group=><div key={group.id} className="min-w-0">{renderGroup(group,false)}</div>)}
  {extensions}
  {notes?<div data-contact-section={notes.id}>{renderGroup(notes,false)}</div>:null}
 </>;
}
