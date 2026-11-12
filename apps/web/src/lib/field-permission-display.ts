import {contactInheritanceSources} from '@xobject/contracts';
import type {FieldDefinition,ObjectDefinition} from '@xobject/contracts';
export function systemManagedField(field:Pick<FieldDefinition,'isDerived'|'technicalName'>&{id?:string},profile?:ObjectDefinition['contactProfile']){const ownException=Boolean(field.id&&profile&&Object.keys(contactInheritanceSources).map(key=>profile.fields[key]).includes(field.id));return field.technicalName==='record_number'||field.isDerived===true&&!ownException;}
/** Permission ceilings do not turn generated values into editable controls. */
export function displayedFieldLevel(level:string,field:Pick<FieldDefinition,'isDerived'|'technicalName'>&{id?:string},profile?:ObjectDefinition['contactProfile']){return systemManagedField(field,profile)&&level!=='none'?'read':level;}
