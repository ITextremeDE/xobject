import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {formEntryKey,type FormLayout,type FormEntry} from '@xobject/contracts';
import {SettingsSection} from './settings-section';
import {FieldSet,FieldLegend,FieldGroup} from '@/components/ui/field';

/** Shared group surfaces, translated headings and widths for record forms and read-only previews. */
export function RecordFormGroups({layout,renderEntry,renderRelationshipList,singleColumn=false}:{layout:FormLayout;singleColumn?:boolean;renderRelationshipList?:(group:FormLayout['groups'][number])=>ReactNode;renderEntry:(entry:FormEntry,singleGroupLabel?:string)=>ReactNode}){
 const {i18n}=useTranslation();
 return <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">{layout.groups.filter(group=>group.fields.length).map(group=><SettingsSection key={group.id} className={group.width==='half'&&!singleColumn?undefined:'md:col-span-2'}><FieldSet className="min-w-0"><FieldLegend>{group.labels[i18n.language as 'en'|'de']??group.labels.en??group.labels.de??Object.values(group.labels)[0]}</FieldLegend>{group.relationshipList&&renderRelationshipList?renderRelationshipList(group):<FieldGroup className={singleColumn?'grid min-w-0 items-start gap-6':'grid min-w-0 items-start gap-6 md:grid-cols-2'}>{group.fields.map(entry=><div key={formEntryKey(entry)} className={!singleColumn&&entry.width==='full'?'min-w-0 md:col-span-2':'min-w-0'}>{renderEntry(entry,group.fields.length===1?(group.labels[i18n.language as 'en'|'de']??group.labels.en??group.labels.de??Object.values(group.labels)[0]):undefined)}</div>)}</FieldGroup>}</FieldSet></SettingsSection>)}</div>;
}
