import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {formatPhoneNumber} from '@/lib/phone-format';
import {Input} from './ui/input';
import {InputGroupInput} from './ui/input-group';

/** Group numbers at rest; keep the user's text and cursor stable while typing. */
export function PhoneInput({value='',onChange,onBlur,grouped=false,...props}:Omit<ComponentProps<typeof Input>,'value'>&{value?:string;grouped?:boolean}){
  const [draft,setDraft]=useState<string|null>(null),emitted=useRef<string|undefined>(undefined);
  useEffect(()=>{if(value!==emitted.current)setDraft(null);},[value]);
  const Control=grouped?InputGroupInput:Input;
  return <Control {...props} type="tel" value={draft??formatPhoneNumber(value)} onChange={event=>{emitted.current=event.currentTarget.value;setDraft(event.currentTarget.value);onChange?.(event);}} onBlur={event=>{setDraft(null);onBlur?.(event);}}/>;
}
