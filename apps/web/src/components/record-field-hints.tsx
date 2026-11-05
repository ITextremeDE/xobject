import type {FieldDefinition} from '@xobject/contracts';
import {FieldDescription} from '@/components/ui/field';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {SettingsHelp} from './settings-help';
export function FieldFormatHelp({id,children}:{id:string;children:ReactNode}){const {t}=useTranslation();return <><span id={id} hidden>{children}</span><SettingsHelp title={t('inputFormatHelp')}>{children}</SettingsHelp></>;}
export function fieldDescriptionIds(field:FieldDefinition,extra?:string){return [field.description?`field-description-${field.id}`:null,field.helpText?`field-help-${field.id}`:null,extra].filter(Boolean).join(' ')||undefined;}
export function FieldExplanation({field,help=false}:{field:FieldDefinition;help?:boolean}){const text=help?field.helpText:field.description;return text?<FieldDescription id={`field-${help?'help':'description'}-${field.id}`}>{text}</FieldDescription>:null;}
