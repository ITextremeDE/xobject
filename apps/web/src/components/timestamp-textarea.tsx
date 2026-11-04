import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {ClockIcon} from 'lucide-react';
import {getSession} from '@/lib/api';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {timestampLine,insertTextTimestamp} from '@/lib/text-timestamp';
import {InputGroup,InputGroupTextarea,InputGroupAddon,InputGroupButton} from './ui/input-group';
import {FieldError} from './ui/field';

type Props=Omit<ComponentProps<typeof InputGroupTextarea>,'value'|'onChange'>&{value:string;onChange:(value:string)=>void};
export function TimestampTextarea({value,onChange,disabled,readOnly,maxLength=10000,id,...props}:Props){
 const {t}=useTranslation(),regional=useRegional(),timeZone=useTimeZone();
 // Observe the already authenticated session; no extra request per field.
 const session=useQuery({queryKey:['session'],queryFn:getSession,enabled:false});
 const textarea=useRef<HTMLTextAreaElement>(null),[tooLong,setTooLong]=useState(false);
 useEffect(()=>{setTooLong(false);},[value,maxLength,disabled,readOnly]);
 function insert(){
  const control=textarea.current,name=session.data?.user.name;if(!control||!name)return;
  const next=insertTextTimestamp(value,control.selectionStart,control.selectionEnd,timestampLine(new Date(),name,regional,timeZone),maxLength);
  if(!next){setTooLong(true);return;}
  setTooLong(false);onChange(next.value);
  requestAnimationFrame(()=>{if(textarea.current===control){control.focus();control.setSelectionRange(next.caret,next.caret);}});
 }
 const errorId=`${id}-timestamp-error`;
 return <><InputGroup><InputGroupTextarea {...props} ref={textarea} id={id} value={value} maxLength={maxLength} disabled={disabled} readOnly={readOnly} aria-invalid={tooLong||props['aria-invalid']} aria-describedby={[props['aria-describedby'],tooLong?errorId:null].filter(Boolean).join(' ')||undefined} onChange={event=>{setTooLong(false);onChange(event.target.value);}}/><InputGroupAddon align="block-end" className="justify-end"><InputGroupButton type="button" size="sm" disabled={disabled||readOnly||!session.data?.user.name} onClick={insert}><ClockIcon data-icon="inline-start"/>{t('insertTimestamp')}</InputGroupButton></InputGroupAddon></InputGroup>{tooLong?<FieldError id={errorId}>{t('timestampTooLong')}</FieldError>:null}</>;
}
