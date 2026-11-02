import type { SystemJournalEntry } from '@xobject/contracts';
import type { TFunction } from 'i18next';

export const journalEntityKinds = ['user', 'workspace', 'workspace_member', 'group', 'object_type', 'field', 'classification_field', 'classification_option', 'record', 'account_security', 'session'] as const;
const entityLabels = Object.fromEntries(journalEntityKinds.map(kind => [kind, `journalKind_${kind}`]));
const properties: Record<string, string> = { time_zone: 'timeZone', name: 'objectName', email: 'email', labels: 'objectName', technical_name: 'technicalName', kind: 'fieldType', config: 'journalConfiguration', required: 'requiredField', state: 'definitionState', active: 'definition_active', language: 'language', available_languages: 'availableInterfaceLanguages', default_language: 'defaultLanguage', label_languages: 'availableLabelLanguages', is_admin: 'roleAdministrator', must_change_password: 'initialPasswordPending', password_changed: 'journalPasswordChanged', revoked: 'journalSessionRevoked', definition: 'journalDefinition', created: 'createdAt', deleted: 'journalDeleted', option_order: 'journalOptionOrder', defaultId: 'defaultValue', defaults: 'defaultValue', defaultIds: 'defaultValue', multiple: 'selectionMode', typeId: 'classificationType', statusId: 'classificationStatus', physical_column_order: 'journalColumnOrder', scale: 'decimalScale', currency: 'currency', formatted: 'markdownFormatting', referenceTarget: 'referenceTarget', options: 'journalOptions' };
const regionLabels: Record<string, string> = { locale: 'regionalFormat', dateFormat: 'dateFormat', hourCycle: 'clockFormat', numberFormat: 'numberFormat', weekStart: 'weekStart' };

export function journalEntityLabel(kind: string, t: TFunction): string { return t(entityLabels[kind] ?? 'journalOtherEntity'); }
export function journalPropertyLabel(key: string, t: TFunction, technicalFallback = false): string {
  if (key.startsWith('member:')) return t('groupMembers');
  if (key.startsWith('appearance.')) return t(`design_${key.slice(11)}`, { defaultValue: t('theme') });
  if (key.startsWith('regional.')) return t(regionLabels[key.slice(9)] ?? 'displayFormats');
  return properties[key] ? t(properties[key]) : technicalFallback ? key : t('journalOtherProperty');
}
export function journalEntryTitle(entry: Pick<SystemJournalEntry, 'field_key' | 'entity_kind' | 'old_value' | 'new_value' | 'field_label'>, t: TFunction): string {
  if (entry.field_key.startsWith('member:')) {
    if (entry.entity_kind === 'group') return t(entry.new_value === true ? 'journalGroupMemberAdded' : 'journalGroupMemberRemoved');
    return t(entry.new_value === null ? 'journalWorkspaceMemberRemoved' : entry.old_value === null ? 'journalWorkspaceMemberAdded' : 'journalMemberRoleChanged');
  }
  if (entry.entity_kind === 'record') return entry.field_label ?? journalPropertyLabel(entry.field_key, t, true);
  return journalPropertyLabel(entry.field_key, t, true);
}
