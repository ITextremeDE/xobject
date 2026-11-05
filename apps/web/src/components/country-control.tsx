import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {countryOptions,countryMatches} from '@/lib/countries';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxEmpty,ComboboxGroup,ComboboxList,ComboboxItem} from './ui/combobox';
export function CountryControl({id,value,disabled,invalid,describedBy,onChange}:{id:string;value:string;disabled:boolean;invalid:boolean;describedBy?:string;onChange:(value:string)=>void}){
 const {t,i18n}=useTranslation(),items=useMemo(()=>countryOptions(i18n.resolvedLanguage??'en',value),[i18n.resolvedLanguage,value]);
 return <Combobox items={items} value={items.find(item=>item.value===value)??null} itemToStringLabel={item=>item.label} isItemEqualToValue={(a,b)=>a.value===b.value} filter={countryMatches} disabled={disabled} onValueChange={item=>onChange(item?.value??'')}>
  <ComboboxInput id={id} placeholder={t('countrySearch')} showClear clearLabel={t('countryClear')} triggerLabel={t('countryChoose')} aria-invalid={invalid} aria-describedby={describedBy} disabled={disabled}/>
  <ComboboxContent><ComboboxEmpty>{t('countryNotFound')}</ComboboxEmpty><ComboboxGroup><ComboboxList>{item=><ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList></ComboboxGroup></ComboboxContent>
 </Combobox>;
}
