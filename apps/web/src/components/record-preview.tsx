import {useTranslation} from 'react-i18next';
import type {DataRecord,FieldPrincipal,ObjectDefinition,FieldDefinition} from '@xobject/contracts';
import {ChevronDownIcon} from 'lucide-react';
import Markdown from 'react-markdown';
import {recordPreviewLayout} from '@/lib/record-preview';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {Field,FieldLabel,FieldGroup} from '@/components/ui/field';
import {Button} from '@/components/ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {displayFieldValue} from './custom-field-control';
import {displayClassification} from './classification-values';
import {RecordFormGroups} from './record-form-groups';

export function RecordPreview({definition,record,principals}:{definition:ObjectDefinition;record:DataRecord;principals?:FieldPrincipal[]}){
 const {t,i18n}=useTranslation(),regional=useRegional(),zone=useTimeZone();
 const {fields,layout,inactive}=recordPreviewLayout(definition,record,t('formUnassigned'));
 function value(field:FieldDefinition){
  const item=record[field.technicalName];
  return <Field><FieldLabel>{field.label}</FieldLabel><div className="flex flex-col gap-2 whitespace-pre-wrap wrap-anywhere text-sm">{field.technicalName==='access_principals'&&Array.isArray(item)&&!item.length?t('workspacePublic'):field.kind==='multiline'&&field.config.formatted&&typeof item==='string'?<Markdown skipHtml allowedElements={['p','strong','em','a','ul','ol','li','blockquote','code','pre','h1','h2','h3','h4','br','hr']}>{item}</Markdown>:['type','status','category'].includes(field.kind)?displayClassification(definition.classification,field.kind,item):displayFieldValue(field,item,i18n.language,t,principals,zone,regional)}</div></Field>;
 }
 return <FieldGroup><RecordFormGroups layout={layout} renderEntry={entry=>{const field='fieldId' in entry?fields.find(field=>field.id===entry.fieldId):undefined;return field?value(field):null;}}/>{inactive.length?<Collapsible className="overflow-hidden rounded-lg border"><CollapsibleTrigger className="group/record-inactive" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-4 py-3"/>}>{t('inactiveFields')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/record-inactive:rotate-180"/></CollapsibleTrigger><CollapsibleContent><FieldGroup className="border-t p-4">{inactive.map(field=><div key={field.id}>{value(field)}</div>)}</FieldGroup></CollapsibleContent></Collapsible>:null}</FieldGroup>;
}
