import type { SystemJournalEntry } from '@xobject/contracts';
import type { TFunction } from 'i18next';

export const journalEntityKinds = ['object_permissions','user', 'workspace', 'workspace_member', 'group', 'object_type', 'field', 'classification_field', 'classification_option', 'relationship_type', 'relationship', 'record', 'account_security', 'session'] as const;
const entityLabels = Object.fromEntries(journalEntityKinds.map(kind => [kind, `journalKind_${kind}`]));
const properties: Record<string, string> = {applicability:'fieldApplicability',link:'link',rulesState:'relationRules', leftLabels: 'relationLeft', rightLabels: 'relationRight', directed: 'relationDirection', leftMin: 'relationMinimum', rightMin: 'relationMinimum', leftMax: 'relationMaximum', rightMax: 'relationMaximum', allowAll: 'relationAllowAll', pairs: 'relationObjectPairs', time_zone: 'timeZone', name: 'objectName', email: 'email', labels: 'objectName', technical_name: 'technicalName', kind: 'fieldType', config: 'journalConfiguration', required: 'requiredField', state: 'definitionState', active: 'definition_active', language: 'language', available_languages: 'availableInterfaceLanguages', default_language: 'defaultLanguage', label_languages: 'availableLabelLanguages', is_admin: 'roleAdministrator', must_change_password: 'initialPasswordPending', password_changed: 'journalPasswordChanged', revoked: 'journalSessionRevoked', definition: 'journalDefinition', created: 'createdAt', deleted: 'journalDeleted', option_order: 'journalOptionOrder', defaultId: 'defaultValue', defaults: 'defaultValue', defaultIds: 'defaultValue', multiple: 'selectionMode', typeId: 'classificationType', statusId: 'classificationStatus', physical_column_order: 'journalColumnOrder', scale: 'decimalScale', currency: 'currency', formatted: 'markdownFormatting', referenceTarget: 'referenceTarget', options: 'journalOptions' };
const regionLabels: Record<string, string> = { locale: 'regionalFormat', dateFormat: 'dateFormat', hourCycle: 'clockFormat', numberFormat: 'numberFormat', weekStart: 'weekStart' };

export function journalEntityLabel(kind: string, t: TFunction): string { return t(entityLabels[kind] ?? 'journalOtherEntity'); }
export function journalPropertyLabel(key: string, t: TFunction, technicalFallback = false): string {
  if(key==='sensitive')return t('userSensitive');
  if(key.startsWith('access_principals.'))return `${t('accessPrincipalsLabel')} · ${t(key.endsWith('.state')?'definitionState':'journalDefinition')}`;
  if(key.startsWith('permission.'))return t(key.includes('.field.')?'fieldPermissionExceptions':'objectPermission');
  if (/^(left|right)(Min|Max)$/.test(key)) return `${t(key.startsWith('left') ? 'relationLeft' : 'relationRight')} · ${t(key.endsWith('Min') ? 'relationMinimum' : 'relationMaximum')}`;
  if(key.startsWith('form_layout.'))return `${t('formLayoutTitle')} · ${key.slice(12)==='default'?t('formDefault'):key.slice(12)}`;
  if(key.startsWith('primary_chain.'))return `${t('primaryChainTitle')} · ${t(`primaryRole_${key.slice(14)}`)}`;
  if(key==='leftApplicability'||key==='rightApplicability')return `${t(key.startsWith('left')?'relationLeft':'relationRight')} · ${t('relationshipCondition')}`;
  if(key==='module.projects')return `${t('workspaceModules')} · ${t('projectsModule')}`;
  if (key.startsWith('member:')) return t('groupMembers');
  if (key.startsWith('appearance.')) return t(`design_${key.slice(11)}`, { defaultValue: t('theme') });
  if (key.startsWith('regional.')) return t(regionLabels[key.slice(9)] ?? 'displayFormats');
  return properties[key] ? t(properties[key]) : technicalFallback ? key : t('journalOtherProperty');
}
export function journalEntryTitle(entry: Pick<SystemJournalEntry, 'field_key' | 'entity_kind' | 'old_value' | 'new_value' | 'field_label'>, t: TFunction, language='en'): string {
  if (entry.entity_kind==='relationship') {const snapshot=(entry.new_value??entry.old_value) as {labels?:Record<string,string>}|null;return snapshot?.labels?.[language]??snapshot?.labels?.en??snapshot?.labels?.de??t('link');}
  if (entry.field_key.startsWith('member:')) {
    if (entry.entity_kind === 'group') return t(entry.new_value === true ? 'journalGroupMemberAdded' : 'journalGroupMemberRemoved');
    return t(entry.new_value === null ? 'journalWorkspaceMemberRemoved' : entry.old_value === null ? 'journalWorkspaceMemberAdded' : 'journalMemberRoleChanged');
  }
  if(entry.entity_kind==='object_permissions'&&entry.field_label)return `${t('fieldPermissionExceptions')} · ${entry.field_label}`;
  if (entry.entity_kind === 'record') return entry.field_label ?? journalPropertyLabel(entry.field_key, t, true);
  return journalPropertyLabel(entry.field_key, t, true);
}
