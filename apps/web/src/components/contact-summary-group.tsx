import {TagsValue} from './tags-value';
import {useTranslation} from 'react-i18next';
import {Link} from 'react-router';
import type {ClassificationConfig,ContactInheritanceField,FieldDefinition,FormLayout,RelatedRecord,FieldPrincipal} from '@xobject/contracts';
import {cn} from '@/lib/utils';
import {webURL} from '@/lib/web-url';
import {displayFieldValue} from '@/lib/field-display';
import {displayClassification} from './classification-values';
import {useRegional} from '@/lib/regional-context';
import {useTimeZone} from '@/lib/time-zone-context';
import {MarkdownContent} from './markdown-content';
import {SettingsSection} from './settings-section';
import {FieldSet,FieldLegend} from './ui/field';
import {Badge} from './ui/badge';

type ValueProps={hideLabel?:boolean;field:FieldDefinition;value:unknown;classification?:ClassificationConfig;inheritance?:ContactInheritanceField;workspaceCode:string;principals?:FieldPrincipal[]};
/** One permission-filtered value presentation for the Contact core and authored extensions. */
export function RecordReadField({hideLabel=false,field,value,classification,inheritance,workspaceCode,principals=[]}:ValueProps){
 const {t,i18n}=useTranslation(),regional=useRegional(),zone=useTimeZone();
 const text=classification&&['type','status','category'].includes(field.kind)?displayClassification(classification,field.kind,value):displayFieldValue(field,value,i18n.language,t,principals,zone,regional);
 const structured=field.kind==='structured'&&['phone_entries','email_entries','url_entries'].includes(field.config.schema??'')&&Array.isArray(value);
 const href=(v:string)=>field.kind==='url'||field.config.schema==='url_entries'?webURL(v):field.kind==='email'||field.config.schema==='email_entries'?`mailto:${encodeURIComponent(v)}`:field.kind==='phone'||field.config.schema==='phone_entries'?`tel:${v}`:null;
 const link=(v:string,label:string)=>{const url=href(v);return url?<a href={url} {...(webURL(url)?{target:'_blank',rel:'noopener noreferrer'}:{})}>{label}</a>:label;};
 return <dl className="flex min-w-0 flex-col gap-1"><dt className={hideLabel?'sr-only':'text-sm text-muted-foreground'}>{field.label}</dt><dd className="whitespace-pre-line wrap-anywhere">{field.kind==='tags'&&Array.isArray(value)?<TagsValue value={value}/>:field.kind==='multiline'&&field.config.formatted?<MarkdownContent>{text}</MarkdownContent>:structured?<ul className="flex flex-col gap-2">{(value as {id:string;value:string}[]).map(entry=><li key={entry.id}>{link(entry.value,displayFieldValue(field,[entry],i18n.language,t,principals,zone,regional))}</li>)}</ul>:typeof value==='string'?link(value,text):text}</dd>{inheritance?<dd className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge variant="outline">{t(inheritance.mode==='own'?'contactOwn':'contactInherit')}</Badge>{inheritance.mode==='inherit'?(inheritance.source?<Link to={`/w/${workspaceCode}/objects/contacts/${inheritance.source.recordId}`}>{t('contactInheritedFrom',{name:inheritance.source.keyword})}</Link>:t('contactInheritedUnavailable')):null}</dd>:null}</dl>;
}

type Props={singleColumn?:boolean;group:FormLayout['groups'][number];fields:FieldDefinition[];values:Record<string,unknown>;classification?:ClassificationConfig;inheritance?:ContactInheritanceField[];organization?:RelatedRecord;workspaceCode:string;principals?:FieldPrincipal[]};
export function ContactSummaryGroup({singleColumn=false,group,fields,values,classification,inheritance=[],organization,workspaceCode,principals=[]}:Props){
 const {t,i18n}=useTranslation();
 const label=group.labels[i18n.language as 'en'|'de']??group.labels.en??group.labels.de??Object.values(group.labels)[0];
 const shown=group.fields.flatMap(entry=>{if(!('fieldId'in entry))return [];const field=fields.find(f=>f.id===entry.fieldId);return field&&Object.hasOwn(values,field.technicalName)?[field]:[];});
 const hasOrganization=group.fields.some(entry=>'relationshipTypeId'in entry)&&Boolean(organization);
 return <SettingsSection><FieldSet><FieldLegend>{label}</FieldLegend>{shown.length||hasOrganization?<div className={cn('grid min-w-0 gap-4',!singleColumn&&'sm:grid-cols-2')}>{shown.map(field=><div key={field.id} className={cn('min-w-0',!singleColumn&&(group.fields.some(entry=>'fieldId'in entry&&entry.fieldId===field.id&&entry.width==='full')||field.kind==='multiline'||field.kind==='structured'&&field.config.schema!=='name_components'&&Array.isArray(values[field.technicalName]))&&'sm:col-span-2')}><RecordReadField hideLabel={shown.length===1&&(field.label===label||field.config.schema==='address_entries')} field={field} value={values[field.technicalName]} classification={classification} inheritance={inheritance.find(s=>s.fieldId===field.id)} workspaceCode={workspaceCode} principals={principals}/></div>)}{hasOrganization&&organization?<dl><dt className="text-sm text-muted-foreground">{t('contactOrganization')}</dt><dd><Link to={`/w/${workspaceCode}/objects/${organization.objectTechnicalName}/${organization.recordId}`}>{organization.keyword}</Link></dd></dl>:null}</div>:<p className="text-sm text-muted-foreground">{t('contactNoDetails')}</p>}</FieldSet></SettingsSection>;
}
