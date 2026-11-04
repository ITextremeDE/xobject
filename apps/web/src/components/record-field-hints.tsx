import type {FieldDefinition} from '@xobject/contracts';
import {FieldDescription} from '@/components/ui/field';
export function fieldDescriptionIds(field:FieldDefinition,extra?:string){return [field.description?`field-description-${field.id}`:null,field.helpText?`field-help-${field.id}`:null,extra].filter(Boolean).join(' ')||undefined;}
export function FieldExplanation({field,help=false}:{field:FieldDefinition;help?:boolean}){const text=help?field.helpText:field.description;return text?<FieldDescription id={`field-${help?'help':'description'}-${field.id}`}>{text}</FieldDescription>:null;}
