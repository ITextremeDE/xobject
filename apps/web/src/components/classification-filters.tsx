import {useTranslation} from 'react-i18next';
import {choiceAncestors,type ClassificationConfig,type ClassificationFilters} from '@xobject/contracts';
import {ListFilterIcon,ChevronDownIcon} from 'lucide-react';
import {Button} from './ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuLabel,DropdownMenuCheckboxItem} from './ui/dropdown-menu';
import {classificationKinds,normalizeClassificationFilters} from '@/lib/classification-filters';

export function ClassificationFiltersBar({config,available,value,onChange,disabled=false}:{config:ClassificationConfig;available:readonly string[];value:ClassificationFilters;onChange:(value:ClassificationFilters)=>void;disabled?:boolean}){
 const {t,i18n}=useTranslation();
 const label=(labels:Record<string,string|undefined>)=>labels[i18n.language]??labels.en??Object.values(labels).find(Boolean)??'';
 function toggle(kind:typeof classificationKinds[number],id:string|null,checked:boolean){
  const values=value[kind]??[];
  onChange(normalizeClassificationFilters({...value,[kind]:checked?[...values,id]:values.filter(item=>item!==id)},config,available));
 }
 return <div role="group" aria-label={t('classificationFilters')} className="flex flex-wrap items-center gap-2">
  {classificationKinds.filter(kind=>available.includes(kind)).map(kind=>{
   const name=t(kind==='type'?'classificationType':kind==='status'?'classificationStatus':'classificationCategory'),selected=value[kind]??[];
   const options=config.options.filter(option=>option.kind===kind&&(kind!=='status'||!value.type?.length||value.type.includes(option.typeId)));
   return <DropdownMenu key={kind}><DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" aria-label={t('filterByClassification',{name})} disabled={disabled}/>}><ListFilterIcon data-icon="inline-start"/>{name}{selected.length?` (${selected.length})`:''}<ChevronDownIcon data-icon="inline-end"/></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto"><DropdownMenuGroup><DropdownMenuLabel>{t('filterByClassification',{name})}</DropdownMenuLabel>
     <DropdownMenuCheckboxItem checked={selected.includes(null)} disabled={!selected.includes(null)&&selected.length>=100} closeOnClick={false} onCheckedChange={checked=>toggle(kind,null,checked===true)}>{t('filterWithoutValue')}</DropdownMenuCheckboxItem>
     {options.map(option=>{const path=kind==='category'&&config.category.tree?[...choiceAncestors(options,option.id)].reverse().map(id=>label(options.find(item=>item.id===id)!.labels)):[];
      return <DropdownMenuCheckboxItem key={option.id} checked={selected.includes(option.id)} disabled={!selected.includes(option.id)&&selected.length>=100} closeOnClick={false} onCheckedChange={checked=>toggle(kind,option.id,checked===true)}>{[...path,label(option.labels)].join(' / ')}{kind==='status'&&value.type?.length!==1?` · ${option.typeId?label(config.options.find(item=>item.id===option.typeId)!.labels):t('filterWithoutType')}`:''}{!option.active?` (${t('inactiveChoice')})`:''}</DropdownMenuCheckboxItem>;
     })}
    </DropdownMenuGroup></DropdownMenuContent>
   </DropdownMenu>;
  })}
  {classificationKinds.some(kind=>value[kind]?.length)?<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>onChange({})}>{t('clearClassificationFilters')}</Button>:null}
 </div>;
}
