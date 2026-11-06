import { ChevronDownIcon } from 'lucide-react';
import { journalCredentialValue,journalPrimaryRequirementsValue,journalTaskStateValue,journalSecurityValue,journalLifecycleValue,journalEntityLabel, journalEntryTitle, journalPropertyLabel } from '@/lib/journal-presentation';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {formLayoutSchema,type SystemJournalEntry} from '@xobject/contracts';
import {JournalFormLayoutValue} from './journal-form-layout-value';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {FieldGroup,FieldDescription} from '@/components/ui/field';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export function JournalEntryDetails({ entry, memberName, renderValue, compact = false }: { entry: SystemJournalEntry; memberName?: string; compact?: boolean; renderValue?: (value: unknown, side: 'before' | 'after') => ReactNode }) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone();
  function value(item: unknown, key = entry.field_key, depth = 0): ReactNode {
    if(entry.entity_kind==='oauth_credential'&&entry.field_key==='created'&&item&&typeof item==='object'&&!Array.isArray(item)){
      const token=item as {name?:string;userId?:string;scopes?:string[];expiresAt?:string};
      const fields=[[t('oauthApplication'),token.name],[t('tokenOwner'),entry.credential_context?.userName??token.userId],[t('tokenAccess'),t(token.scopes?.includes('xobject:write')?'oauthWrite':'oauthRead')],[t('tokenExpires'),token.expiresAt?formatRegionalDate(token.expiresAt,regional,timeZone,true):undefined]];
      return <dl className="flex flex-col gap-3">{fields.map(([label,text])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{text??t('journalNotSet')}</dd></div>)}</dl>;
    }
    if(entry.entity_kind==='api_credential'&&entry.field_key==='created'&&item&&typeof item==='object'&&!Array.isArray(item)){
      const token=item as {name?:string;userId?:string;channels?:string[];readOnly?:boolean;expiresAt?:string};
      const fields=[[t('objectName'),token.name],[t('tokenOwner'),entry.credential_context?.userName??token.userId],[t('tokenChannels'),token.channels?.map(channel=>channel==='api'?'REST API':'MCP').join(', ')],[t('tokenAccess'),t(token.readOnly?'tokenReadOnly':'tokenUserRights')],[t('tokenExpires'),token.expiresAt?formatRegionalDate(token.expiresAt,regional,timeZone,true):undefined]];
      return <dl className="flex flex-col gap-3">{fields.map(([label,text])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{text??t('journalNotSet')}</dd></div>)}</dl>;
    }
    const credential=journalCredentialValue(entry,item,t);if(credential!==undefined)return credential;
    const primary=journalPrimaryRequirementsValue(entry,item,t);if(primary!==undefined)return primary;
    const taskState=journalTaskStateValue(entry,item,t);if(taskState!==undefined)return taskState;
    const security=journalSecurityValue(entry,item,t);if(security!==undefined)return security;
    const lifecycle=journalLifecycleValue(entry,item,t);if(lifecycle!==undefined)return lifecycle;
    if(entry.field_key.startsWith('form_layout.')&&formLayoutSchema.safeParse(item).success)return <JournalFormLayoutValue value={item} context={entry.form_layout_context}/>;
    if (item === null || item === undefined) return <span className="text-muted-foreground">{t('journalNotSet')}</span>;
    if (typeof item==='object' && !Array.isArray(item) && 'relationshipTypeId' in item && 'left' in item && 'right' in item) {
      const link=item as unknown as {labels:Record<string,string>;left:{keyword:string;objectLabels:Record<string,string>};right:{keyword:string;objectLabels:Record<string,string>};directed:boolean};
      const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.de??labels.en??Object.values(labels)[0];
      return <dl className="flex flex-col gap-3"><div><dt className="text-xs text-muted-foreground">{t('relationshipType')}</dt><dd>{label(link.labels)}</dd></div>{(['left','right'] as const).map(side=><div key={side}><dt className="text-xs text-muted-foreground">{t(side==='left'?'relationLeft':'relationRight')} · {label(link[side].objectLabels)}</dt><dd>{link[side].keyword}</dd></div>)}</dl>;
    }
    if(key==='rulesState' && (item==='draft'||item==='active'))return t(item==='draft'?'ruleDraft':'ruleActive');
    if (typeof item === 'boolean') return t(item ? 'yes' : 'no');
    if (typeof item === 'string') {
      if (entry.entity_kind !== 'record' && key === 'state' && ['active', 'inactive', 'deleted'].includes(item)) return t(`definition_${item}`);
      if (entry.entity_kind !== 'record' && key === 'referenceTarget' && ['user', 'group', 'both'].includes(item)) return t(`reference_${item}`);
      if (entry.entity_kind !== 'record' && key === 'kind' && i18n.exists(`fieldKind_${item}`)) return t(`fieldKind_${item}`);
      if (entry.entity_kind === 'workspace_member' && ['user', 'designer', 'administrator'].includes(item)) return t(item === 'user' ? 'roleUser' : item === 'designer' ? 'roleDesigner' : 'roleAdministrator');
      return item || <span className="text-muted-foreground">{t('journalEmpty')}</span>;
    }
    if (typeof item !== 'object') return String(item);
    const entries = Object.entries(item);
    if (!entries.length) return <span className="text-muted-foreground">{t('journalEmpty')}</span>;
    if (depth >= 6) return JSON.stringify(item);
    const content = Array.isArray(item)
      ? <ol className="flex flex-col gap-2">{item.map((child, index) => <li key={index}>{value(child, key, depth + 1)}</li>)}</ol>
      : <dl className="flex flex-col gap-3">{entries.map(([name, child]) => <div key={name}><dt className="text-xs text-muted-foreground">{(key === 'labels' || key === 'input.description' || key === 'input.helpText' || key === 'leftLabels' || key === 'rightLabels') ? name === 'root' ? t('journalOriginalLabel') : new Intl.DisplayNames([i18n.language], { type: 'language' }).of(name) ?? name : journalPropertyLabel(name, t, true)}</dt><dd>{value(child, name, depth + 1)}</dd></div>)}</dl>;
    if ((key === 'labels' || key === 'input.description' || key === 'input.helpText' || key === 'leftLabels' || key === 'rightLabels') || depth > 0) return content;
    return <Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/value" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-3 py-2" />}>{t('journalShowDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/value:rotate-180" /></CollapsibleTrigger><CollapsibleContent><div className="border-t p-3">{content}</div></CollapsibleContent></Collapsible>;
  }
  const details = [
    [t('journalPropertyKey'), entry.field_key], [t('journalEntityKind'), entry.entity_kind],
    [t('entityId'), entry.entity_id], ...(entry.field_id ? [[t('journalFieldId'), entry.field_id]] : []), [t('journalActorId'), entry.actor_id],
    [t('journalWorkspaceId'), entry.workspace_id ?? t('instance')], [t('changeId'), entry.change_id],
    [t('journalEntryId'), entry.id], [t('journalTimestampUtc'), entry.created_at],
    [t('journalAccessChannel'),entry.access_channel??'internal'],...(entry.credential_id?[[t('journalCredential'),entry.credential_id]]:[]),...(entry.agent_name?[[t('journalAgent'),entry.agent_name]]:[]),
  ];

  return <article aria-label={journalEntryTitle(entry,t,i18n.language)}><FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{journalEntityLabel(entry.entity_kind, t)}</Badge>
          <time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{formatRegionalDate(entry.created_at, regional, timeZone, true)}</time>
        </div>
        <div className="text-sm text-muted-foreground">
          {compact ? <span>{t('journalChangedBy')}: {entry.actor_name ?? t('journalUnknownUser')}</span> : <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {[
              [t('journalTarget'), entry.entity_name ?? entry.entity_id],
              [t('journalChangedBy'), entry.actor_name ?? t('journalUnknownUser')],
              [t('journalScope'), entry.workspace_name ?? t('instance')],
              ...(entry.object_type_name && !(entry.entity_kind==='object_type'&&entry.entity_name===entry.object_type_name) ? [[t('objectType'), entry.object_type_name]] : []),
              ...(entry.field_key.startsWith('member:') ? [[t('journalAffectedUser'), memberName ?? t('journalUnknownUser')]] : []),
            ].map(([label, text]) => <div key={label} className="min-w-0"><dt className="text-xs">{label}</dt><dd className="wrap-anywhere text-foreground">{text}</dd></div>)}
          </dl>}
        </div>
      {entry.field_key.startsWith('access.')?<FieldDescription>{t('journalSecurityNamesHelp')}</FieldDescription>:null}
      {entry.field_key.startsWith('form_layout.')?<FieldDescription>{t('formSnapshotNamesHelp')}</FieldDescription>:null}
        <dl className="grid min-w-0 grid-cols-1 divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {[[t('before'), entry.old_value], [t('after'), entry.new_value]].map(([label, item], index) => <div key={index} className="min-w-0 p-3"><dt className="mb-2 text-xs font-medium text-muted-foreground">{String(label)}</dt><dd className={entry.field_key.startsWith('form_layout.')?'sm:max-h-80 overflow-auto whitespace-pre-wrap wrap-anywhere':'sm:max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere'}>{renderValue ? renderValue(item,index===0?'before':'after') : value(item)}</dd></div>)}
        </dl>
      <Collapsible className="overflow-hidden rounded-lg border">
          <CollapsibleTrigger className="group/journal-details" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between rounded-none px-3 py-2.5" />}>
            {t('journalTechnicalDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/journal-details:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="grid min-w-0 gap-3 border-t p-3 sm:grid-cols-2">
              {details.map(([label, text]) => <div key={label} className="min-w-0"><dt className="mb-1 text-xs text-muted-foreground">{label}</dt><dd className="select-text font-mono text-xs wrap-anywhere">{text}</dd></div>)}
            </dl>
            {entry.entity_kind==='api_credential'||entry.field_key.startsWith('form_layout.')||entry.field_key.startsWith('access.')?<div className="grid gap-3 border-t p-3 sm:grid-cols-2">{[[t('before'),entry.old_value],[t('after'),entry.new_value]].map(([label,value])=><div key={String(label)} className="min-w-0"><p className="text-xs text-muted-foreground">{String(label)}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere text-xs">{JSON.stringify(value,null,2)}</pre></div>)}</div>:null}
          </CollapsibleContent>
        </Collapsible>
    </FieldGroup></article>;
}
