import {useTranslation} from 'react-i18next';
import {primaryRolesForObject,type ObjectDefinition,type PrimaryRequirements} from '@xobject/contracts';
import {Checkbox} from '@/components/ui/checkbox';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from '@/components/ui/field';
import {SettingsSection} from './settings-section';
export function PrimaryRequirementsSettings({definition,value,onChange,disabled,readOnly}:{definition:ObjectDefinition;value:PrimaryRequirements;onChange:(value:PrimaryRequirements)=>void;disabled:boolean;readOnly:boolean}) {
 const {t}=useTranslation(),roles=definition.primaryChain?primaryRolesForObject(definition.primaryChain,definition.id):[];
 if(!roles.length)return null;
 const locked=disabled||readOnly;
 return <SettingsSection><FieldSet><FieldLegend>{t('primaryChainTitle')}</FieldLegend><FieldDescription>{t('primaryRequirementsHelp')}</FieldDescription><FieldGroup>
 <Field orientation="horizontal" data-disabled={locked||undefined}><Checkbox id="primary-association-required" disabled={locked} checked={value.associationRequired} onCheckedChange={checked=>onChange({...value,associationRequired:checked===true})}/><FieldLabel htmlFor="primary-association-required">{t('primaryAssociationRequired')}</FieldLabel></Field>
 <FieldSet><FieldLegend variant="label">{t('primaryRequiredLevels')}</FieldLegend><FieldDescription>{t('primaryRequiredLevelsHelp')}</FieldDescription><FieldGroup>{roles.map(role=><Field key={role} orientation="horizontal" data-disabled={locked||undefined}><Checkbox id={`primary-required-${role}`} checked={value.requiredLevels.includes(role)} disabled={locked} onCheckedChange={checked=>onChange({...value,requiredLevels:roles.filter(item=>item===role?checked===true:value.requiredLevels.includes(item))})}/><FieldLabel htmlFor={`primary-required-${role}`}>{t(`primaryRole_${role}`)}</FieldLabel></Field>)}</FieldGroup></FieldSet>
 <FieldDescription>{t('primaryRequirementsPreflight')}</FieldDescription></FieldGroup></FieldSet></SettingsSection>;
}
