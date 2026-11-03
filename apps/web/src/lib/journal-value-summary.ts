/** Text-only table preview; never replace raw journal values or technical identities. */
export function journalValueSummary(value: unknown, language: string, notSet: string, yes: string, no: string): string {
  if (value === null || value === undefined) return notSet;
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'object' && !Array.isArray(value) && 'relationshipTypeId' in value && 'left' in value && 'right' in value) {
    const edge = value as { labels?: Record<string, string>; left?: { keyword?: string }; right?: { keyword?: string }; directed?: boolean };
    const label = edge.labels?.[language] ?? edge.labels?.en ?? edge.labels?.de ?? '';
    return `${label}: ${edge.left?.keyword ?? '—'} ${edge.directed ? '→' : '↔'} ${edge.right?.keyword ?? '—'}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
