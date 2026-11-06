import type {FieldDefinition} from '@xobject/contracts';
export function systemManagedField(field:Pick<FieldDefinition,'isDerived'|'technicalName'>){return field.isDerived===true||field.technicalName==='record_number';}
/** Permission ceilings do not turn generated values into editable controls. */
export function displayedFieldLevel(level:string,field:Pick<FieldDefinition,'isDerived'|'technicalName'>){return systemManagedField(field)&&level!=='none'?'read':level;}
