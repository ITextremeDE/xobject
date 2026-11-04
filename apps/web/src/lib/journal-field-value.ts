import {isCustomFieldKind,parseStructuredValue,type JournalEntry,type RegionalSettings} from '@xobject/contracts';
import type {TFunction} from 'i18next';
import {displayFieldValue} from './field-display';
/** Format immutable historical values using their historical kind/config, in every journal surface. */
export function journalFieldValue(entry:JournalEntry,value:unknown,side:'before'|'after',language:string,t:TFunction,timeZone:string,regional:RegionalSettings):string|undefined{
 const context=entry.value_context?.[side];
 if(!context||!isCustomFieldKind(context.kind))return undefined;
 if(value===null||value===undefined)return t('journalNotSet');
 if(context.kind==='structured'){try{parseStructuredValue(context.config.schema!,value);}catch{return undefined;}}
 return displayFieldValue({kind:context.kind,config:context.config},value,language,t,[],timeZone,regional);
}
