import {fieldContextLabel} from '@/lib/field-context-label';
import {journalFieldValue} from '@/lib/journal-field-value';
import {useState} from 'react';
import {useQuery,keepPreviousData} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import type {ObjectDefinition,AuthUser,DataRecord,JournalEntry} from '@xobject/contracts';
import {api} from '@/lib/api';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {displayFieldValue} from '@/lib/field-display';
import {displayClassification} from './classification-values';
import {FieldGroup,Field,FieldLabel} from '@/components/ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {RecordJournalTable} from './record-journal-table';

export function Journal({ definition, recordId, user, record, workspaceName,includeRecycled=false,includeDeleted=false }: { definition: ObjectDefinition; recordId: string; user?: AuthUser; workspaceName: string; record: Pick<DataRecord,'id'|'keyword'>;includeRecycled?:boolean;includeDeleted?:boolean }) {
  const { t, i18n } = useTranslation();
  const regional=useRegional(),timeZone=useTimeZone();
  const principals = useQuery({ queryKey: ['field-principals', definition.workspaceId], queryFn: () => api('list_field_principals', { workspaceId: definition.workspaceId }) });
  const [fieldId,setFieldId]=useState('all'),[kind,setKind]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
  const allFields=[...definition.fields,...(definition.historicalFields??[]),...(definition.relationshipFields??[]).map(field=>({...field,label:`${t('relationshipAttributes')} · ${field.label}`}))].map(field=>({...field,label:fieldContextLabel(field,definition,t)}));
  const result = useQuery({ placeholderData:keepPreviousData, queryKey: ['journal', definition.id, recordId,includeRecycled,includeDeleted,fieldId,kind,page,pageSize], queryFn: () => api('list_record_journal', {includeRecycled,includeDeleted, objectTypeId: definition.id, recordId,fieldId:fieldId==='all'?undefined:fieldId,entityKind:kind==='all'?undefined:kind as 'record'|'relationship',offset:(page-1)*pageSize,limit:pageSize }) });
  const fields=[{value:'all',label:t('journalAllFields')},...allFields.map(field=>({value:field.id,label:field.label})).sort((a,b)=>a.label.localeCompare(b.label,i18n.language))];
  const kinds=[{value:'all',label:t('journalAllChanges')},{value:'record',label:t('journalFieldChanges')},{value:'relationship',label:t('recordRelationships')}];
  const filters=<FieldGroup className="w-full gap-4 sm:flex-row sm:items-end sm:max-w-xl"><Field><FieldLabel htmlFor="record-journal-kind">{t('recordJournalChangeFilter')}</FieldLabel><Select items={kinds} value={kind} onValueChange={value=>{if(value){setKind(value);setFieldId('all');setPage(1);}}}><SelectTrigger id="record-journal-kind" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{kinds.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  {<Field><FieldLabel htmlFor="record-journal-field">{t('field')}</FieldLabel><Select items={fields} value={fieldId} onValueChange={value=>{if(value){setFieldId(value);setPage(1);}}}><SelectTrigger id="record-journal-field" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{fields.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}</FieldGroup>;
  const entries=(result.data?.entries??[]).map(entry=>{
    const field=allFields.find(field=>field.id===entry.field_id);
    return {...entry,entity_kind:entry.entity_kind??'record',entity_id:entry.entity_id??recordId,workspace_id:definition.workspaceId,workspace_name:workspaceName,object_type_name:definition.label,actor_name:entry.actor_name??(user&&entry.actor_id===user.id?user.name:entry.actor_id),entity_name:record.keyword||record.id,field_label:field?.label??entry.field_label??null};
  });
  function renderValue(entry:JournalEntry,value:unknown,side:'before'|'after') {
    if(value&&typeof value==='object'&&'mode' in value)return journalFieldValue(entry,value,side,i18n.language,t,timeZone,regional);
    const field=allFields.find(field=>field.id===entry.field_id);
    if(!field)return undefined;
    if(value===null||value===undefined)return t('journalNotSet');
    if(['type','status','category'].includes(field.kind))return displayClassification(definition.classification,field.kind,value);
    const context=entry.value_context?.[side];
    return displayFieldValue(context?{...field,kind:context.kind as typeof field.kind,config:context.config}:field,value,i18n.language,t,principals.data??[],timeZone,regional);
  }
  return <RecordJournalTable preferenceKey={`record-journal:${definition.workspaceId}`} entries={entries} filters={filters} renderValue={renderValue} total={result.data?.total??0} page={page} pageSize={pageSize} busy={result.isFetching} loading={result.isPending} error={result.isError?result.error:undefined} onRetry={()=>{void result.refetch();}} onPage={setPage} onPageSize={size=>{setPageSize(size);setPage(1);}} />;
}
