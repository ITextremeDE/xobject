import {PostalAddressEntryControl} from './postal-address-entry-control';
import {ContactTimeZoneControl} from './contact-time-zone-control';
import {structuredEntryInvalid} from '@/lib/structured-entry-validation';
import {SettingsHelp} from './settings-help';
import {Separator} from './ui/separator';
import {PartialDateControl} from './partial-date-control';
import {nameInputText,nameInputValue,type NamePart} from '@/lib/name-input';
import {useTranslation} from 'react-i18next';
import {v7} from 'uuid';
import {PlusIcon,Trash2Icon,ArrowUpIcon,ArrowDownIcon} from 'lucide-react';
import {structuredOptionGroups,parseStructuredValue,type FieldDefinition,type FieldValue,type StructuredEntry} from '@xobject/contracts';
import {Field,FieldGroup,FieldSet,FieldLegend,FieldLabel,FieldDescription,FieldError} from './ui/field';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from './ui/select';
import {Badge} from './ui/badge';
import {NativeSelect,NativeSelectOption} from './ui/native-select';
import {FieldExplanation,fieldDescriptionIds} from './record-field-hints';

export function StructuredFieldControl({field,value,disabled,onChange,error,legendVariant='label'}:{legendVariant?:'legend'|'label';field:FieldDefinition;value:FieldValue;disabled:boolean;onChange:(value:FieldValue)=>void;error?:string}){
 const {t,i18n}=useTranslation(),schema=field.config.schema!,base=`field-${field.id}`,optionGroups=structuredOptionGroups(schema);
 const grouped=optionGroups.length>0;
 let invalid=false;try{if(value!==null)parseStructuredValue(schema,value);}catch{invalid=true;}
 const entries=(Array.isArray(value)?value:[]) as StructuredEntry[];
 const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.en??labels.de??Object.values(labels)[0];
 const describedBy=fieldDescriptionIds(field,invalid||error?`${base}-error`:undefined);
 const feedback=<>{error?<FieldError id={`${base}-error`}>{error}</FieldError>:invalid?<FieldError id={`${base}-error`}>{t(schema==='language_entries'?'contactLanguageInvalid':schema==='messenger_entries'?'contactMessengerInvalid':schema==='address_entries'?'addressInvalidEntries':'structuredInvalid')}</FieldError>:null}<FieldExplanation field={field} help/></>;
 function change(next:StructuredEntry[]){onChange(next.map((entry,index)=>'preference'in entry?{...entry,preference:index+1}:entry) as FieldValue);}
 function update(id:string,next:Record<string,unknown>){change(entries.map(entry=>entry.id===id?{...entry,...next}:entry) as StructuredEntry[]);}
 function focus(id:string){requestAnimationFrame(()=>(document.getElementById(id)??document.getElementById(`${id}-component`))?.focus());}
 function remove(id:string){change(entries.filter(e=>e.id!==id));focus(`${base}-add`);}
 function move(index:number,delta:number){const next=[...entries];next.splice(index+delta,0,next.splice(index,1)[0]);change(next);focus(`${base}-${entries[index].id}${schema==='address_entries'?'-streetLines':''}`);}
 function add(){const id=v7(),metadata={id,contexts:[],preference:entries.length+1};change([...entries,schema==='address_entries'?{...metadata,address:{poBox:'',extended:'',streetLines:[],houseNumber:'',postalCode:'',locality:'',region:'',country:'',formatted:''}}:{...metadata,value:''}] as StructuredEntry[]);focus(`${base}-${id}${schema==='address_entries'?'-streetLines':''}`);}
 const addButton=<Button id={`${base}-add`} type="button" variant="outline" size="icon-sm" disabled={disabled||entries.length>=100} aria-label={t('contactAddValue',{field:field.label})} title={t('contactAddValue',{field:field.label})} onClick={add}><PlusIcon/></Button>;

 function orderButtons(index:number){return entries.length>1?<div className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" disabled={disabled||index===0} aria-label={t('structuredMoveUp',{number:index+1})} onClick={()=>move(index,-1)}><ArrowUpIcon/></Button><Button type="button" size="icon-sm" variant="ghost" disabled={disabled||index===entries.length-1} aria-label={t('structuredMoveDown',{number:index+1})} onClick={()=>move(index,1)}><ArrowDownIcon/></Button></div>:null;}
 function contexts(entry:StructuredEntry,index:number){
  if(!('contexts'in entry)||!field.config.options?.length)return null;
  const id=`${base}-${entry.id}-context`;
  return <Field className="min-w-0"><FieldLabel htmlFor={id}>{t('contactPhoneUsage')}</FieldLabel><NativeSelect id={id} className="w-full" aria-label={`${t('contactPhoneUsage')} · ${field.label} · ${t('structuredEntry',{number:index+1})}`} disabled={disabled} value={entry.contexts[0]??''} onChange={event=>update(entry.id,{contexts:event.target.value?[event.target.value]:[]})}><NativeSelectOption value="">{t('contactNoContext')}</NativeSelectOption>{field.config.options.filter(option=>option.active||entry.contexts.includes(option.id)).map(option=><NativeSelectOption key={option.id} value={option.id}>{label(option.labels)}</NativeSelectOption>)}</NativeSelect></Field>;
 }
 function collectionGroups(entry:StructuredEntry,index:number){
  if(!('contexts'in entry))return null;
  return <FieldGroup className="col-span-2 grid grid-cols-2 gap-2 @lg/contact-entry:contents">{optionGroups.map(group=>{
   const title=t(group==='usage'?'contactPhoneUsage':group==='phone_type'?'contactPhoneType':'contactMessengerType'),options=(field.config.options??[]).filter(option=>option.group===group),selected=entry.contexts.filter(id=>options.some(option=>option.id===id));
   return <Field key={group}><FieldLabel htmlFor={`${base}-${entry.id}-${group}`}>{title}</FieldLabel><Select items={[{value:'none',label:t('contactNoContext')},...options.map(option=>({value:option.id,label:label(option.labels)}))]} value={selected[0]??'none'} disabled={disabled} onValueChange={next=>update(entry.id,{contexts:[...entry.contexts.filter(id=>!options.some(option=>option.id===id)),...(next&&next!=='none'?[next]:[])]})}><SelectTrigger id={`${base}-${entry.id}-${group}`} className="w-full min-w-0" aria-label={`${title} · ${t('structuredEntry',{number:index+1})}`}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">{t('contactNoContext')}</SelectItem>{options.filter(option=>option.active||selected.includes(option.id)).map(option=><SelectItem key={option.id} value={option.id} disabled={!option.active&&!selected.includes(option.id)}>{label(option.labels)}</SelectItem>)}</SelectGroup></SelectContent></Select>{selected.length>1?<div className="flex flex-wrap gap-1">{selected.slice(1).map(id=><Badge key={id} variant="secondary">{label(options.find(option=>option.id===id)!.labels)}</Badge>)}</div>:null}</Field>;
  })}</FieldGroup>;
 }
 function actions(entry:StructuredEntry,index:number){return <div className="flex shrink-0 items-center gap-1">{orderButtons(index)}<Button type="button" size="icon-sm" variant="ghost" disabled={disabled} aria-label={t('structuredRemove',{number:index+1})} title={t('structuredRemove',{number:index+1})} onClick={()=>remove(entry.id)}><Trash2Icon/></Button></div>;}
 if(schema==='name_components'){
  const parts=entries as NamePart[];
  return <Field id={base} data-invalid={invalid||Boolean(error)} data-disabled={disabled||undefined}><FieldLabel htmlFor={`${base}-name`}>{field.label}{field.required?' *':''}</FieldLabel><FieldExplanation field={field}/><Input id={`${base}-name`} value={nameInputText(parts)} required={field.required} maxLength={200} disabled={disabled} aria-invalid={invalid||Boolean(error)} aria-describedby={describedBy} onChange={event=>onChange(nameInputValue(parts,event.target.value,v7))}/>{feedback}</Field>;
 }
 if(schema==='time_zone')return <ContactTimeZoneControl field={field} value={value} disabled={disabled} onChange={onChange} error={error}/>;
 if(schema==='partial_date')return <PartialDateControl field={field} value={value} disabled={disabled} onChange={onChange} error={error}/>;
 return <FieldSet id={base} className="gap-3" data-invalid={invalid||Boolean(error)}>
  <FieldLegend variant={legendVariant} className="flex w-full items-center justify-between gap-3"><span>{field.label}{field.required?' *':''}</span>{addButton}</FieldLegend>
  <FieldExplanation field={field}/>
  {entries.length>1?<SettingsHelp title={t('contactOrderPreferenceShort')}>{t('contactOrderPreference')}</SettingsHelp>:null}
  <FieldGroup className="gap-3">
   {entries.map((entry,index)=>'address'in entry?
    <div key={entry.id} className="flex min-w-0 flex-col gap-4">{index>0?<Separator/>:null}<PostalAddressEntryControl field={field} entry={entry} disabled={disabled} onChange={address=>update(entry.id,{address})} header={<>
     <FieldGroup className="grid grid-cols-[minmax(0,10rem)_auto] items-end justify-between gap-3">{contexts(entry,index)??<FieldDescription>{t('contactAddressEntry',{number:index+1})}</FieldDescription>}{actions(entry,index)}</FieldGroup>
     {entry.contexts.length>1?<div className="flex flex-wrap gap-1">{entry.contexts.slice(1).map(id=><Badge key={id} variant="secondary">{label(field.config.options?.find(option=>option.id===id)?.labels??{en:id})}</Badge>)}</div>:null}
    </>}/></div>:
    <div key={entry.id} className="@container/contact-entry flex min-w-0 flex-col gap-2">
     {grouped?<FieldGroup className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 @lg/contact-entry:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,2.5fr)_auto]">
      {collectionGroups(entry,index)}
      <Field><FieldLabel htmlFor={`${base}-${entry.id}`}>{t(schema==='phone_entries'?'contactPhoneNumber':'contactMessengerURI')}</FieldLabel><Input id={`${base}-${entry.id}`} aria-label={`${field.label} · ${t('structuredEntry',{number:index+1})}`} value={'value'in entry?entry.value:''} disabled={disabled} required maxLength={schema==='phone_entries'?100:2000} type={schema==='phone_entries'?'tel':'text'} placeholder={schema==='messenger_entries'?'xmpp:person@example.test':undefined} aria-invalid={structuredEntryInvalid(schema,entry)} aria-describedby={describedBy} onChange={event=>update(entry.id,{value:event.target.value})}/></Field>
      {actions(entry,index)}
     </FieldGroup>:<FieldGroup className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 @lg/contact-entry:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)_auto]">
      {field.config.options?.length?<div className="col-span-2 min-w-0 @lg/contact-entry:col-span-1">{contexts(entry,index)}</div>:null}
      <Field className={!field.config.options?.length?'@lg/contact-entry:col-span-2':undefined}><FieldLabel htmlFor={`${base}-${entry.id}`}>{t(schema==='email_entries'?'contactEmailAddress':schema==='language_entries'?'contactLanguageTag':'contactWebsite')}</FieldLabel><Input id={`${base}-${entry.id}`} aria-label={`${field.label} · ${t('structuredEntry',{number:index+1})}`} value={'value'in entry?entry.value:''} disabled={disabled} required maxLength={2000} placeholder={schema==='language_entries'?'en-GB':undefined} type={schema==='email_entries'?'email':schema==='url_entries'?'url':'text'} aria-invalid={structuredEntryInvalid(schema,entry)} aria-describedby={describedBy} onChange={event=>update(entry.id,{value:event.target.value})}/></Field>
      {actions(entry,index)}
     </FieldGroup>}
     {schema==='language_entries'&&'value'in entry&&!structuredEntryInvalid(schema,entry)?<FieldDescription>{new Intl.DisplayNames([i18n.language],{type:'language'}).of(Intl.getCanonicalLocales(entry.value)[0]!)??entry.value}</FieldDescription>:null}
     {!grouped&&'contexts'in entry&&entry.contexts.length>1?<div className="flex flex-wrap gap-1">{entry.contexts.slice(1).map(id=><Badge key={id} variant="secondary">{label(field.config.options?.find(option=>option.id===id)?.labels??{en:id})}</Badge>)}</div>:null}
    </div>)}
   {!entries.length?<FieldDescription>{disabled?'—':t('structuredEmpty')}</FieldDescription>:null}
   {feedback}
  </FieldGroup>
 </FieldSet>;
}
