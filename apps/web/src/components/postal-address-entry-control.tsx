import {useEffect,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {ChevronDownIcon} from 'lucide-react';
import {postalAddressLimits,postalAddressLineLimit,postalAddressLines,type PostalAddress,type FieldDefinition,type StructuredEntry} from '@xobject/contracts';
import {addressDraftProblems,type AddressInput,type AddressProblem} from '@/lib/structured-entry-validation';
import {fieldDescriptionIds} from './record-field-hints';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldError} from './ui/field';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Button} from './ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './ui/collapsible';
import {CountryControl} from './country-control';

type Entry=Extract<StructuredEntry,{address:PostalAddress}>;
export function PostalAddressEntryControl({field,entry,disabled,header,onChange}:{field:FieldDefinition;entry:Entry;disabled:boolean;header:ReactNode;onChange:(value:PostalAddress)=>void}){
 const {t}=useTranslation(),base=`field-${field.id}-${entry.id}`,address=entry.address,problems=addressDraftProblems(address);
 const [moreOpen,setMoreOpen]=useState(false),[previewOpen,setPreviewOpen]=useState(false);
 const moreInvalid=Boolean(problems.fields.poBox||problems.fields.extended||problems.fields.additionalStreetLines);
 useEffect(()=>{if(moreInvalid)setMoreOpen(true);},[moreInvalid]);
 const rootError=problems.empty?t('addressEmpty'):problems.general?t('addressInvalidComponent'):null;
 const message=(problem:AddressProblem)=>t(problem.kind==='tooLong'?'addressMaxCharacters':problem.kind==='tooManyLines'?'addressMaxLines':problem.kind==='emptyLine'?'addressBlankLine':'addressInvalidComponent',{count:problem.limit});
 const description=(key:AddressInput)=>[fieldDescriptionIds(field),rootError?`${base}-entry-error`:null,problems.fields[key]?`${base}-${key}-error`:null].filter(Boolean).join(' ')||undefined;
 function control(key:Exclude<AddressInput,'additionalStreetLines'>){
  const problem=problems.fields[key],value=key==='streetLines'?address.streetLines[0]??'':address[key];
  return <Field data-disabled={disabled||undefined} data-invalid={Boolean(problem)}><FieldLabel htmlFor={`${base}-${key}`}>{t(key==='streetLines'?'contactStreet':`structured_${key}`)}</FieldLabel>{key==='country'?<CountryControl id={`${base}-${key}`} value={value} disabled={disabled} invalid={Boolean(problem)} describedBy={description(key)} onChange={country=>onChange({...address,country})}/>:<Input id={`${base}-${key}`} value={value} maxLength={postalAddressLimits[key]} disabled={disabled} aria-invalid={Boolean(problem)} aria-describedby={description(key)} onChange={event=>{const value=event.target.value;onChange({...address,[key]:key==='streetLines'?(value||address.streetLines.length>1?[value,...address.streetLines.slice(1)]:[]):value});}}/>}{problem?<FieldError id={`${base}-${key}-error`}>{message(problem)}</FieldError>:null}</Field>;
 }
 const extraProblem=problems.fields.additionalStreetLines,preview=postalAddressLines(address,t('structured_poBox')).join('\n');
 return <div className="flex min-w-0 flex-col gap-4">
  {header}
  {rootError?<FieldError id={`${base}-entry-error`}>{rootError}</FieldError>:null}
  <FieldGroup className="grid gap-4 sm:grid-cols-3">{(['streetLines','houseNumber','postalCode','locality','region','country'] as const).map(key=><div key={key} className={key==='streetLines'||key==='locality'?'min-w-0 sm:col-span-2':key==='country'||key==='region'?'min-w-0 sm:col-span-3':'min-w-0'}>{control(key)}</div>)}</FieldGroup>
  <div className="grid min-w-0 grid-cols-[minmax(0,max-content)_minmax(0,max-content)_1fr] items-start gap-x-4 gap-y-0">
  <Collapsible className="contents" open={moreOpen} onOpenChange={setMoreOpen}><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="group/address-more col-start-1 row-start-1 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left"/>} aria-describedby={moreInvalid&&!moreOpen?`${base}-more-error`:undefined}>{t('contactMoreAddress')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/address-more:rotate-180"/></CollapsibleTrigger>{moreInvalid&&!moreOpen?<FieldError className="col-span-full row-start-2" id={`${base}-more-error`}>{t('addressMoreErrors')}</FieldError>:null}<CollapsibleContent className="col-span-full row-start-2 pt-3"><FieldGroup className="grid gap-4 sm:grid-cols-2">{control('poBox')}{control('extended')}<Field className="sm:col-span-2" data-disabled={disabled||undefined} data-invalid={Boolean(extraProblem)}><FieldLabel htmlFor={`${base}-street-extra`}>{t('contactAdditionalLines')}</FieldLabel><Textarea id={`${base}-street-extra`} value={address.streetLines.slice(1).join('\n')} maxLength={(postalAddressLineLimit-1)*(postalAddressLimits.streetLines+1)-1} disabled={disabled} aria-invalid={Boolean(extraProblem)} aria-describedby={[description('additionalStreetLines'),`${base}-extra-help`].filter(Boolean).join(' ')} onChange={event=>onChange({...address,streetLines:event.target.value?[address.streetLines[0]??'',...event.target.value.split('\n')]:address.streetLines[0]?[address.streetLines[0]]:[]})}/><FieldDescription id={`${base}-extra-help`}>{t('addressAdditionalHelp',{count:postalAddressLineLimit-1,characters:postalAddressLimits.streetLines})}</FieldDescription>{extraProblem?<FieldError id={`${base}-additionalStreetLines-error`}>{message(extraProblem)}</FieldError>:null}</Field></FieldGroup></CollapsibleContent></Collapsible>
  <Collapsible className="contents" open={previewOpen} onOpenChange={setPreviewOpen}><CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="group/address-preview col-start-2 row-start-1 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left"/>}>{t('addressPreview')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/address-preview:rotate-180"/></CollapsibleTrigger><CollapsibleContent className="col-span-full row-start-3 pt-3"><FieldDescription className="whitespace-pre-line wrap-anywhere">{preview||t('addressPreviewEmpty')}</FieldDescription></CollapsibleContent></Collapsible>
  </div>
 </div>;
}
