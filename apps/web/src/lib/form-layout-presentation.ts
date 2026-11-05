import {formEntryKey,type FormEntry,type FormLayout,type JournalEntry} from '@xobject/contracts';
import type {TFunction} from 'i18next';
/** Layout structure/settings are historical; metadata names are current, read-only context. */
export function formSnapshotGroups(layout:FormLayout,context:JournalEntry['form_layout_context'],language:string,t:TFunction){
  const label=(labels:Record<string,string>)=>labels[language]??labels.en??labels.de??Object.values(labels)[0]??t('formGroup');
  const entry=(item:FormEntry)=>({key:formEntryKey(item),label:'fieldId' in item?context?.fields[item.fieldId]??t('formUnknownField'):'primary' in item?t('primaryChainTitle'):context?.relationships[item.relationshipTypeId]?.[item.side]??t('formUnknownRelationship'),settings:[t(item.width==='half'?'formHalf':'formFull'),...(!('fieldId' in item)?[t(item.visible===false?'formHidden':'formShown')]:[]),...('relationshipTypeId' in item&&item.width==='full'?[t(item.expanded==='open'?'formExpansionOpen':item.expanded==='closed'?'formExpansionClosed':'formExpansionAuto')]:[])]});
  return [...layout.groups.map(group=>({id:group.id,width:group.width,label:label(group.labels),entries:group.fields.map(entry)})),...(layout.unassigned?.length?[{id:':unassigned',width:undefined,label:t('formUnassigned'),entries:layout.unassigned.map(entry)}]:[])];
}
