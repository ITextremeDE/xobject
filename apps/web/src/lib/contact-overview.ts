import type {FieldDefinition,FormLayout,RelationshipField} from '@xobject/contracts';

/** A read overview omits empty optional sections; the editor retains the complete configured form. */
export function contactOverviewLayout(layout:FormLayout,fields:FieldDefinition[],values:Record<string,unknown>,relationships:RelationshipField[]):FormLayout{
  const present=(value:unknown)=>value!==null&&value!==undefined&&(typeof value!=='string'||value.trim()!=='')&&(!Array.isArray(value)||value.length>0);
  return {...layout,groups:layout.groups.flatMap(group=>{
    const entries=group.fields.filter(entry=>{
      if('fieldId'in entry){const field=fields.find(field=>field.id===entry.fieldId);return Boolean(field&&Object.hasOwn(values,field.technicalName)&&(field.technicalName==='access_principals'||present(values[field.technicalName])));}
      const relation='primary'in entry?relationships.find(field=>field.definition.kind==='primary'&&field.side==='right')
        :relationships.find(field=>field.definition.id===entry.relationshipTypeId&&field.side===entry.side);
      return Boolean(relation?.targets.length);
    });
    return entries.length?[{...group,fields:entries}]:[];
  })};
}
