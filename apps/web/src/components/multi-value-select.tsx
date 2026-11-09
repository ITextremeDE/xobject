import {useTranslation} from 'react-i18next';
import {ChevronDownIcon} from 'lucide-react';
import {Button} from './ui/button';
import {FieldDescription} from './ui/field';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuCheckboxItem} from './ui/dropdown-menu';

/** Shared compact multiple selection; Base UI supplies focus, typeahead and Escape handling. */
export function MultiValueSelect({id,label,items,value,disabled,invalid,describedBy,emptyLabel,onChange}:{id:string;label:string;items:{value:string;label:string;disabled?:boolean}[];value:string[];disabled?:boolean;invalid?:boolean;describedBy?:string;emptyLabel?:string;onChange:(value:string[])=>void}){
 const {t}=useTranslation();
 const selected=value.map(id=>items.find(item=>item.value===id)?.label??id).join(', ');
 const display=selected||t('noSelection');
 return <DropdownMenu><DropdownMenuTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal" aria-label={`${label}: ${display}`} aria-describedby={describedBy} aria-invalid={invalid}/> }><span className="truncate" title={selected||undefined}>{display}</span><ChevronDownIcon data-icon="inline-end"/></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 w-(--anchor-width) max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuGroup>{items.map(item=><DropdownMenuCheckboxItem key={item.value} disabled={item.disabled} checked={value.includes(item.value)} closeOnClick={false} onCheckedChange={checked=>onChange(checked?[...value,item.value]:value.filter(id=>id!==item.value))}>{item.label}</DropdownMenuCheckboxItem>)}</DropdownMenuGroup>{!items.length?<FieldDescription className="p-2">{emptyLabel??t('noEntries')}</FieldDescription>:null}</DropdownMenuContent></DropdownMenu>;
}
