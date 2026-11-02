import { ChevronDownIcon } from 'lucide-react';
import { journalEntityLabel, journalEntryTitle, journalPropertyLabel } from '@/lib/journal-presentation';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SystemJournalEntry } from '@xobject/contracts';
import { useRegional } from '@/lib/regional-context';
import { useTimeZone } from '@/lib/time-zone-context';
import { formatRegionalDate } from '@/lib/regional';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export function JournalEntryCard({ entry, memberName, renderValue }: { entry: SystemJournalEntry; memberName?: string; renderValue?: (value: unknown) => ReactNode }) {
  const { t, i18n } = useTranslation();
  const regional = useRegional(), timeZone = useTimeZone();
  function value(item: unknown, key = entry.field_key, depth = 0): ReactNode {
    if (item === null || item === undefined) return <span className="text-muted-foreground">{t('journalNotSet')}</span>;
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
      : <dl className="flex flex-col gap-3">{entries.map(([name, child]) => <div key={name}><dt className="text-xs text-muted-foreground">{(key === 'labels' || key === 'leftLabels' || key === 'rightLabels') ? name === 'root' ? t('journalOriginalLabel') : new Intl.DisplayNames([i18n.language], { type: 'language' }).of(name) ?? name : journalPropertyLabel(name, t, true)}</dt><dd>{value(child, name, depth + 1)}</dd></div>)}</dl>;
    if ((key === 'labels' || key === 'leftLabels' || key === 'rightLabels') || depth > 0) return content;
    return <Collapsible className="rounded-lg border"><CollapsibleTrigger className="group/value" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between px-3 py-2" />}>{t('journalShowDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/value:rotate-180" /></CollapsibleTrigger><CollapsibleContent><div className="border-t p-3">{content}</div></CollapsibleContent></Collapsible>;
  }
  const details = [
    [t('journalPropertyKey'), entry.field_key], [t('journalEntityKind'), entry.entity_kind],
    [t('entityId'), entry.entity_id], ...(entry.field_id ? [[t('journalFieldId'), entry.field_id]] : []), [t('journalActorId'), entry.actor_id],
    [t('journalWorkspaceId'), entry.workspace_id ?? t('instance')], [t('changeId'), entry.change_id],
    [t('journalEntryId'), entry.id], [t('journalTimestampUtc'), entry.created_at],
  ];

  return <article aria-labelledby={`journal-title-${entry.id}`}>
    <Card size="sm">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{journalEntityLabel(entry.entity_kind, t)}</Badge>
          <time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{formatRegionalDate(entry.created_at, regional, timeZone, true)}</time>
        </div>
        <CardTitle><h3 id={`journal-title-${entry.id}`}>{journalEntryTitle(entry, t)}</h3></CardTitle>
        <CardDescription>
          <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {[
              [t('journalTarget'), entry.entity_name ?? entry.entity_id],
              [t('journalChangedBy'), entry.actor_name ?? t('journalUnknownUser')],
              [t('journalScope'), entry.workspace_name ?? t('instance')],
              ...(entry.object_type_name ? [[t('objectType'), entry.object_type_name]] : []),
              ...(entry.field_key.startsWith('member:') ? [[t('journalAffectedUser'), memberName ?? t('journalUnknownUser')]] : []),
            ].map(([label, text]) => <div key={label} className="min-w-0"><dt className="text-xs">{label}</dt><dd className="wrap-anywhere text-foreground">{text}</dd></div>)}
          </dl>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid min-w-0 grid-cols-1 divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {[[t('before'), entry.old_value], [t('after'), entry.new_value]].map(([label, item], index) => <div key={index} className="min-w-0 p-3"><dt className="mb-2 text-xs font-medium text-muted-foreground">{String(label)}</dt><dd className="max-h-48 overflow-auto whitespace-pre-wrap wrap-anywhere">{renderValue ? renderValue(item) : value(item)}</dd></div>)}
        </dl>
      </CardContent>
      <CardFooter className="block p-0">
        <Collapsible>
          <CollapsibleTrigger className="group/journal-details" render={<Button type="button" variant="ghost" size="sm" className="h-auto w-full justify-between rounded-none px-3 py-2.5" />}>
            {t('journalTechnicalDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/journal-details:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="grid min-w-0 gap-3 border-t p-3 sm:grid-cols-2">
              {details.map(([label, text]) => <div key={label} className="min-w-0"><dt className="mb-1 text-xs text-muted-foreground">{label}</dt><dd className="select-text font-mono text-xs wrap-anywhere">{text}</dd></div>)}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
    </Card>
  </article>;
}
