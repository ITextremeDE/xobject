import {SettingsHelp} from './settings-help';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {supportsUniqueField,type FieldInputRules,type FieldDefinition} from '@xobject/contracts';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend,FieldError} from '@/components/ui/field';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {SettingsSection} from './settings-section';
import {TranslatedLabelInput} from './translated-label-input';
import {CustomFieldControl} from './custom-field-control';
export function FieldInputRulesSettings({field,workspaceId,value,onChange,disabled=false,readOnly=false,classification=false,valueReadOnly=false,validation,error}:{field:FieldDefinition;workspaceId:string;value:FieldInputRules;onChange:(rules:FieldInputRules)=>void;disabled?:boolean;readOnly?:boolean;classification?:boolean;valueReadOnly?:boolean;validation?:ReactNode;error?:string}){
 const {t}=useTranslation();
 const unique=supportsUniqueField(field.kind,field.config),locked=disabled||readOnly;
 return <>{!classification?<SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('inputRules')}</FieldLegend><FieldGroup>{validation}{valueReadOnly?<FieldDescription>{t('derivedFieldRulesHelp')}</FieldDescription>:<><CustomFieldControl field={{...field,id:`default-${field.id}`,label:t('defaultValue'),required:false,description:undefined,helpText:undefined}} workspaceId={workspaceId} value={value.defaultValue} disabled={locked} onChange={defaultValue=>onChange({...value,defaultValue:defaultValue===''?null:defaultValue})}/><SettingsHelp title={t('defaultRulesTitle')}>{t('fieldDefaultHelp')}</SettingsHelp>{value.defaultValue!==null&&!readOnly?<Button type="button" variant="outline" className="self-start" disabled={disabled} onClick={()=>onChange({...value,defaultValue:null})}>{t('clearFieldDefault')}</Button>:null}<Field orientation="horizontal" data-disabled={locked||!unique||undefined}><Checkbox id={`unique-${field.id}`} aria-invalid={Boolean(error)} aria-describedby={error?`unique-error-${field.id}`:undefined} checked={value.unique} disabled={locked||!unique} onCheckedChange={checked=>onChange({...value,unique:checked===true})}/><FieldLabel htmlFor={`unique-${field.id}`}>{t('uniqueField')}</FieldLabel></Field>{error?<FieldError id={`unique-error-${field.id}`}>{error}</FieldError>:null}<SettingsHelp title={t('uniquenessRulesTitle')}>{t(unique?'uniqueFieldHelp':'uniqueUnsupported')}</SettingsHelp></>}</FieldGroup></FieldSet></SettingsSection>:null}<SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('fieldExplanations')}{classification?` · ${field.label}`:''}</FieldLegend><FieldGroup>  <TranslatedLabelInput label={t('fieldPurposeDescription')} multiline maxLength={2000} requireOne={false} showHelp={false} id={`description-${field.id}`} value={value.description} readOnly={readOnly} disabled={disabled} onChange={description=>onChange({...value,description})}/>
  <TranslatedLabelInput label={t('fieldHelpText')} multiline maxLength={2000} requireOne={false} showHelp={false} id={`help-${field.id}`} value={value.helpText} readOnly={readOnly} disabled={disabled} onChange={helpText=>onChange({...value,helpText})}/>
  <SettingsHelp title={t('fieldHintsTitle')}>{t('fieldHintsHelp')}</SettingsHelp>
</FieldGroup></FieldSet></SettingsSection></>;
}
