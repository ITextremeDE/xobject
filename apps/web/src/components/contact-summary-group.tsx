import {useTranslation} from 'react-i18next';
import {Link} from 'react-router';
import type {FieldDefinition, FormLayout, RelatedRecord, FieldPrincipal} from '@xobject/contracts';
import {cn} from '@/lib/utils';
import {webURL} from '@/lib/web-url';
import {displayFieldValue} from '@/lib/field-display';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {MarkdownContent} from './markdown-content';
import {SettingsSection} from './settings-section';
import {FieldSet,FieldLegend} from './ui/field';

type Props = {
  group: FormLayout['groups'][number];
  fields: FieldDefinition[];
  values: Record<string,unknown>;
  organization?: RelatedRecord;
  workspaceCode: string;
  principals?: FieldPrincipal[];
};

/** Permission-filtered read projection; no hidden editor or second source of business values. */
export function ContactSummaryGroup({group,fields,values,organization,workspaceCode,principals=[]}:Props){
  const {t,i18n}=useTranslation(),regional=useRegional(),zone=useTimeZone();
  const label=group.labels[i18n.language as 'en'|'de']??group.labels.en??group.labels.de??Object.values(group.labels)[0];
  const hasOrganization=group.fields.some(entry=>'relationshipTypeId'in entry)&&Boolean(organization);
  const shown=group.fields.flatMap(entry=>{
    if(!('fieldId'in entry))return [];
    const field=fields.find(field=>field.id===entry.fieldId);
    if(!field||!Object.hasOwn(values,field.technicalName))return [];
    const value=displayFieldValue(field,values[field.technicalName],i18n.language,t,principals,zone,regional);
    return value==='—'?[]:[{field,value}];
  });
  const display=(field:FieldDefinition,value:string)=>{
    if(field.kind==='multiline'&&field.config.formatted)return <MarkdownContent>{value}</MarkdownContent>;
    const entries=values[field.technicalName];
    if(field.kind!=='structured'||!['phone_entries','email_entries','url_entries'].includes(field.config.schema??'')||!Array.isArray(entries))return value;
    return <ul className="flex flex-col gap-2">{(entries as {id:string;value:string}[]).map(entry=>{
      const href=field.config.schema==='phone_entries'?`tel:${entry.value}`
        :field.config.schema==='email_entries'?`mailto:${encodeURIComponent(entry.value)}`:webURL(entry.value);
      return <li key={entry.id}>{href?<a href={href} {...(field.config.schema==='url_entries'?{target:'_blank',rel:'noopener noreferrer'}:{})}>
        {displayFieldValue(field,[entry],i18n.language,t,principals,zone,regional)}
      </a>:entry.value}</li>;
    })}</ul>;
  };
  return <SettingsSection><FieldSet><FieldLegend>{label}</FieldLegend>
    {shown.length||hasOrganization?<dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {shown.map(({field,value})=><div key={field.id} className={cn('min-w-0',(field.kind==='multiline'||field.kind==='structured'&&field.config.schema!=='name_components'&&Array.isArray(values[field.technicalName]))&&'sm:col-span-2')}>
        <dt className={field.label===label&&shown.length===1?'sr-only':'text-sm text-muted-foreground'}>{field.label}</dt>
        <dd className="whitespace-pre-line wrap-anywhere">{display(field,value)}</dd>
      </div>)}
      {hasOrganization&&organization?<div className="min-w-0"><dt className="text-sm text-muted-foreground">{t('contactOrganization')}</dt><dd>
        <Link to={`/w/${workspaceCode}/objects/${organization.objectTechnicalName}/${organization.recordId}`}>{organization.keyword}</Link>
      </dd></div>:null}
    </dl>:<p className="text-sm text-muted-foreground">{t('contactNoDetails')}</p>}
  </FieldSet></SettingsSection>;
}
