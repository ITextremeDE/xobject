import type {FieldDefinition,FormLayout,RelationshipField} from '@xobject/contracts';

/** Readable values only; fixed core groups may retain compact empty states while extensions omit empty groups. */
export function contactOverviewLayout(layout:FormLayout,fields:FieldDefinition[],values:Record<string,unknown>,relationships:RelationshipField[],retainGroups=false):FormLayout{
  const present=(value:unknown)=>value!==null&&value!==undefined&&(typeof value!=='string'||value.trim()!=='')&&(!Array.isArray(value)||value.length>0);
  return {...layout,groups:layout.groups.flatMap(group=>{
    const entries=group.fields.filter(entry=>{
      if('fieldId'in entry){const field=fields.find(field=>field.id===entry.fieldId);return Boolean(field&&Object.hasOwn(values,field.technicalName)&&(field.technicalName==='access_principals'||(present(values[field.technicalName])||Array.isArray(values.contactInheritance)&&values.contactInheritance.some((s:{fieldId:string;mode:string})=>s.fieldId===field.id&&s.mode==='own'))));}
      const relation='primary'in entry?relationships.find(field=>field.definition.kind==='primary'&&field.side==='right')
        :relationships.find(field=>field.definition.id===entry.relationshipTypeId&&field.side===entry.side);
      return Boolean(relation&&(entry.visible!==false||relation.targets.length));
    });
    return entries.length||retainGroups?[{...group,fields:entries}]:[];
  })};
}

/** Contacts keep authored field groups before combined lists and other relationships. */
export function contactExtensionDisplayLayout(layout:FormLayout):FormLayout{
 const rank=(group:FormLayout['groups'][number])=>group.fields.some(entry=>'fieldId'in entry)?0:group.relationshipList?1:2;
 return {...layout,groups:layout.groups.toSorted((a,b)=>rank(a)-rank(b))};
}
