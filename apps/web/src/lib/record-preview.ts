import {fieldApplies,resolveFormLayout,type ObjectDefinition,type DataRecord} from '@xobject/contracts';

export function recordPreviewLayout(definition:ObjectDefinition,record:DataRecord,unassignedLabel:string){
 const readable=definition.fields.filter(field=>field.fieldPermissions?.read!==false&&record.fieldAccess?.[field.id]?.read!==false&&Object.hasOwn(record,field.technicalName)&&field.state!=='deleted');
 const active=readable.filter(field=>{
  if(field.state&&field.state!=='active')return false;
  if(!field.applicability)return true;
  const controller=definition.fields.find(item=>item.id===field.applicability!.fieldId);
  return controller&&Object.hasOwn(record,controller.technicalName)?fieldApplies(field,definition.fields,record):Boolean(record.applicableFieldIds?.includes(field.id));
 });
 const resolved=resolveFormLayout(definition.formLayouts?.default,active);
 return {fields:readable,layout:{groups:[...resolved.groups,...(resolved.unassigned?.length?[{id:':unassigned',labels:{en:unassignedLabel,de:unassignedLabel},fields:resolved.unassigned}]:[])]},inactive:readable.filter(field=>field.state==='inactive')};
}
