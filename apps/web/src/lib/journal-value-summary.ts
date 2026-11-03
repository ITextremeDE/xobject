import {formLayoutSchema,formLayoutEntries} from '@xobject/contracts';
/** Text-only table preview; never replace raw journal values or technical identities. */
export function journalValueSummary(value: unknown, language: string, notSet: string, yes: string, no: string, countLabel: (kind: 'properties' | 'items' | 'groups' | 'elements', count: number) => string = (kind,count)=>`${count} ${kind}`): string {
  if (value === null || value === undefined) return notSet;
  const layout=formLayoutSchema.safeParse(value);
  if(layout.success)return `${countLabel('groups',layout.data.groups.length)} · ${countLabel('elements',formLayoutEntries(layout.data).length)}`;
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'object' && !Array.isArray(value) && 'relationshipTypeId' in value && 'left' in value && 'right' in value) {
    const edge = value as { labels?: Record<string, string>; left?: { keyword?: string }; right?: { keyword?: string }; directed?: boolean };
    const label = edge.labels?.[language] ?? edge.labels?.en ?? edge.labels?.de ?? '';
    return `${label}: ${edge.left?.keyword ?? '—'} ${edge.directed ? '→' : '↔'} ${edge.right?.keyword ?? '—'}`;
  }
  if(Array.isArray(value))return value.length?value.slice(0,3).map(item=>journalValueSummary(item,language,notSet,yes,no,countLabel)).join(', ')+(value.length>3?` · ${countLabel('items',value.length)}`:''):countLabel('items',0);
  if(typeof value==='object'){const labels=value as Record<string,unknown>;const translated=labels[language]??labels.en??labels.de;if(typeof translated==='string')return translated;return countLabel('properties',Object.keys(labels).length);}
  return String(value);
}
