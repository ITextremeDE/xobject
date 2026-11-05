import countries from 'i18n-iso-countries';
const {registerLocale,getNames,getName,getAlpha2Code}=countries;
import en from 'i18n-iso-countries/langs/en.json';
import de from 'i18n-iso-countries/langs/de.json';
registerLocale(en);registerLocale(de);
export type CountryOption={value:string;label:string;search:string};
/** Country remains vCard address text. Changing UI language never rewrites it. */
export function countryOptions(language:string,current:string):CountryOption[]{
 const locale=language.startsWith('de')?'de':'en';
 const options=Object.entries(getNames('en')).map(([code,value])=>({value,label:getName(code,locale)??value,search:[code,...(getName(code,'en',{select:'all'})??[]),...(getName(code,'de',{select:'all'})??[])].join(' ')}));
 if(current&&!options.some(option=>option.value===current)){
  const code=getAlpha2Code(current,'en')??getAlpha2Code(current,'de');
  options.push({value:current,label:code?getName(code,locale)??current:current,search:current});
 }
 return options.sort((a,b)=>a.label.localeCompare(b.label,locale));
}
export function countryMatches(item:CountryOption,query:string):boolean{
 const normalize=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
 return normalize(`${item.label} ${item.search}`).includes(normalize(query.trim()));
}
