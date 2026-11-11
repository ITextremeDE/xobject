import type {FieldDefinition,ObjectDefinition} from '@xobject/contracts';
export function systemManagedField(field:Pick<FieldDefinition,'isDerived'|'technicalName'>&{id?:string},profile?:ObjectDefinition['contactProfile']){const ownException=Boolean(field.id&&profile&&[profile.fields.organization_name,profile.fields.organization_commercial_register].includes(field.id));return field.technicalName==='record_number'||field.isDerived===true&&!ownException;}
/** Permission ceilings do not turn generated values into editable controls. */
export function displayedFieldLevel(level:string,field:Pick<FieldDefinition,'isDerived'|'technicalName'>&{id?:string},profile?:ObjectDefinition['contactProfile']){return systemManagedField(field,profile)&&level!=='none'?'read':level;}
