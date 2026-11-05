import {fieldApplies,type FieldValue,type ObjectDefinition} from '@xobject/contracts';

/** Do not invent a Contact kind while its values are still loading. */
export function recordLoadingModel(definition:ObjectDefinition|undefined,values?:Record<string,FieldValue>,applicableFieldIds?:string[]){
 const profile=definition?.contactProfile,kindField=definition?.fields.find(field=>field.id===profile?.fields.contact_kind);
 const knownKind=!profile||Boolean(kindField&&Object.values(profile.kinds).includes(String(values?.[kindField.technicalName])));
 const readable=definition?.fields.filter(field=>field.fieldPermissions?.read!==false&&(!field.state||field.state==='active'))??[];
 const applies=(field:Pick<ObjectDefinition['fields'][number],'applicability'> & {id?:string})=>!field.applicability||Boolean(values&&(readable.some(controller=>controller.id===field.applicability!.fieldId)?fieldApplies(field,readable,values):field.id&&applicableFieldIds?.includes(field.id)));
 return {knownKind,fields:knownKind?readable.filter(applies):[],relationships:knownKind?(definition?.formRelationships??[]).filter(relation=>applies({applicability:relation.side==='left'?relation.definition.leftApplicability:relation.definition.rightApplicability})):[]};
}
