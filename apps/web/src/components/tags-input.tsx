import {useState,useRef,useId} from 'react';
import {useTransientDraft} from '@/lib/transient-draft';
import {useTranslation} from 'react-i18next';
import {useQuery} from '@tanstack/react-query';
import {maxTagLength,maxTags,normalizeTags} from '@xobject/contracts';
import {api} from '@/lib/api';
import {Combobox,ComboboxChips,ComboboxChip,ComboboxValue,ComboboxChipsInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from './ui/combobox';
import {FieldDescription,FieldError} from './ui/field';
import {TruncatedText} from './truncated-text';

export function TagsInput({id,label,value,onChange,disabled=false,invalid=false,required=false,describedBy,objectTypeId,fieldId}:{id:string;label:string;value:string[];onChange:(values:string[])=>void;disabled?:boolean;invalid?:boolean;required?:boolean;describedBy?:string;objectTypeId?:string;fieldId?:string}){
 const {t}=useTranslation(),[query,setQuery]=useState(''),[error,setError]=useState(''),[highlighted,setHighlighted]=useState<string|undefined>(),anchor=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const draftId=useId();useTransientDraft(draftId,!disabled&&(Boolean(query.trim())||Boolean(error)));
 const suggestions=useQuery({queryKey:['field-tags',objectTypeId,fieldId,query],enabled:Boolean(objectTypeId&&fieldId),queryFn:()=>api('list_field_tags',{objectTypeId:objectTypeId!,fieldId:fieldId!,query})});
 const selected=new Set(value.map(v=>v.toLowerCase())),candidate=query.trim().normalize('NFC'),available=(suggestions.data?.values??[]).filter(v=>!selected.has(v.toLowerCase()));
 const items=[...available,...(candidate&&!selected.has(candidate.toLowerCase())&&!available.some(v=>v.toLowerCase()===candidate.toLowerCase())?[candidate]:[])];
 function accept(next:string[]){try{onChange(normalizeTags(next));setQuery('');setError('');input.current?.setCustomValidity('');}catch{const message=t('tagsInvalid');setError(message);input.current?.setCustomValidity(message);}}
 function commit(text:string){if(!text.trim())return;accept([...value,...text.split(/[,\r\n]+/u).map(v=>v.trim()).filter(Boolean)]);}
 return <><Combobox multiple value={value} items={items} disabled={disabled} inputValue={query} onInputValueChange={next=>{setQuery(next);setError('');input.current?.setCustomValidity('');}} onItemHighlighted={setHighlighted} onValueChange={accept}>
  <ComboboxChips ref={anchor} className="w-full min-w-0" aria-disabled={disabled||undefined}>
   <ComboboxValue>{(values:string[])=>values.map(tag=><ComboboxChip key={tag} removeLabel={t('removeTag',{tag})} className="max-w-full"><TruncatedText>{tag}</TruncatedText></ComboboxChip>)}</ComboboxValue>
   <ComboboxChipsInput ref={input} id={id} aria-label={label} aria-required={required} aria-invalid={invalid||Boolean(error)} aria-describedby={[describedBy,`${id}-tags-help`,error?`${id}-tags-error`:null].filter(Boolean).join(' ')} placeholder={value.length?'':t('tagsPlaceholder')} maxLength={maxTagLength} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if((event.key===','||event.key==='Enter')&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();event.stopPropagation();event.preventBaseUIHandler();commit(event.key==='Enter'&&highlighted?highlighted:query);}}} onPaste={event=>{const text=event.clipboardData.getData('text');if(/[,\r\n]/u.test(text)){event.preventDefault();commit(text);}}} onBlur={event=>{if(!event.relatedTarget||!(event.relatedTarget as HTMLElement).closest('[data-slot="combobox-content"]'))commit(query);}}/>
  </ComboboxChips>
  <ComboboxContent anchor={anchor}><ComboboxEmpty>{t('noMatches')}</ComboboxEmpty><ComboboxList>{(tag:string)=><ComboboxItem key={tag} value={tag}><TruncatedText>{tag===candidate&&!available.includes(tag)?t('createTag',{tag}):tag}</TruncatedText></ComboboxItem>}</ComboboxList></ComboboxContent>
 </Combobox><FieldDescription id={`${id}-tags-help`}>{t('tagsHelp',{max:maxTags})}</FieldDescription>{suggestions.isError?<FieldDescription role="status">{t('tagsSuggestionsUnavailable')}</FieldDescription>:null}{error?<FieldError id={`${id}-tags-error`}>{error}</FieldError>:null}</>;
}
