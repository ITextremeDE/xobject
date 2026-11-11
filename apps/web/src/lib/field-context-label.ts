import type {FieldDefinition,ObjectDefinition} from '@xobject/contracts';
import type {TFunction} from 'i18next';
/** Disambiguate Contact fields in cross-kind administration without renaming their form labels. */
export function fieldContextLabel(field:Pick<FieldDefinition,'id'|'label'>,definition:Pick<ObjectDefinition,'contactProfile'>,t:TFunction):string {
 const p=definition.contactProfile;if(!p?.fields.organization_commercial_register)return field.label;
 const scope=field.id===p.fields.organization_commercial_register?t('contactKind_person'):field.id===p.fields.commercial_register?`${t('contactKind_organization')} / ${t('contactKind_individual')}`:null;
 return scope?`${field.label} · ${scope}`:field.label;
}
