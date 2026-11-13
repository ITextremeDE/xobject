import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import type {FieldDefinition,TagFilters} from '@xobject/contracts';
import {api} from '@/lib/api';
import {ChoicePicker} from './choice-picker';
import {ErrorNotice} from './feedback';

export function TagFiltersBar({objectTypeId,fields,value,onChange,disabled}:{objectTypeId:string;fields:FieldDefinition[];value:TagFilters;onChange:(value:TagFilters)=>void;disabled:boolean}){
 const {t}=useTranslation();
 if(!fields.length)return null;
 return <div role="group" aria-label={t('tags')} className="flex flex-wrap gap-2">{fields.map(field=><TagFilter key={field.id} objectTypeId={objectTypeId} field={field} value={value} onChange={onChange} disabled={disabled}/>)}</div>;
}
function TagFilter({objectTypeId,field,value,onChange,disabled}:{objectTypeId:string;field:FieldDefinition;value:TagFilters;onChange:(value:TagFilters)=>void;disabled:boolean}){
 const {t}=useTranslation(),[query,setQuery]=useState(''),selected=value.find(f=>f.fieldId===field.id)?.values??[],result=useQuery({queryKey:['field-tags',objectTypeId,field.id,query],queryFn:()=>api('list_field_tags',{objectTypeId,fieldId:field.id,query})});
 const values=[...new Set([...selected.filter((v):v is string=>v!==null),...(result.data?.values??[])])];
 return <><ChoicePicker filter id={`filter-${field.id}`} label={field.label} options={[{id:'null',label:t('filterWithoutValue'),active:true},...values.map(v=>({id:JSON.stringify(v),label:v,active:true}))]} value={selected.map(v=>JSON.stringify(v))} disabled={disabled} onSearchChange={setQuery} hasMore={result.data?.hasMore} onChange={ids=>{const next=value.filter(f=>f.fieldId!==field.id);if(ids.length)next.push({fieldId:field.id,values:ids.map(id=>JSON.parse(id) as string|null)});onChange(next);}}/>{result.isError?<ErrorNotice error={result.error} retry={()=>{void result.refetch();}}/>:null}</>;
}
