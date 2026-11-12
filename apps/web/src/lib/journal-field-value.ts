import {isCustomFieldKind,parseStructuredValue,type JournalEntry,type RegionalSettings} from '@xobject/contracts';
import type {TFunction} from 'i18next';
import {displayFieldValue} from './field-display';
/** Format immutable historical values using their historical kind/config, in every journal surface. */
export function journalFieldValue(entry:JournalEntry,value:unknown,side:'before'|'after',language:string,t:TFunction,timeZone:string,regional:RegionalSettings):string|undefined{
 if(value&&typeof value==='object'&&'mode' in value){const item=value as {mode:string;value?:unknown};if(item.mode==='inherit'||item.mode==='own')return item.mode==='inherit'?t('contactInherit'):`${t('contactOwn')} · ${item.value===null||item.value===''?t('journalNotSet'):journalFieldValue(entry,item.value,side,language,t,timeZone,regional)??String(item.value)}`;}
 const context=entry.value_context?.[side];
 if(!context||!isCustomFieldKind(context.kind))return undefined;
 if(value===null||value===undefined)return t('journalNotSet');
 if(context.kind==='structured'){try{parseStructuredValue(context.config.schema!,value);}catch{return undefined;}}
 return displayFieldValue({kind:context.kind,config:context.config},value,language,t,[],timeZone,regional);
}
