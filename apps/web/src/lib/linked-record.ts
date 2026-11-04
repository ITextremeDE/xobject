import {z} from 'zod';
import {uuidSchema,linkedRecordSourceSchema,oppositeRelationshipSide,type RelationshipField,type RecordLinkOption} from '@xobject/contracts';
export const linkedCreationSchema=z.object({targetObjectTypeId:uuidSchema,linkFrom:linkedRecordSourceSchema,source:z.object({objectTypeId:uuidSchema,recordId:uuidSchema,keyword:z.string().max(200),objectTechnicalName:z.string().regex(/^[a-z][a-z0-9_]*$/),objectLabels:z.record(z.string(),z.string()),state:z.enum(['active','inactive'])}),labels:z.record(z.string(),z.string())});
export type LinkedCreation=z.infer<typeof linkedCreationSchema>;
export function seedLinkedFields(fields:RelationshipField[],context?:LinkedCreation){
 if(!context)return fields;
 return fields.map(field=>field.definition.id===context.linkFrom.relationshipTypeId&&field.side===oppositeRelationshipSide(field.definition,context.linkFrom.side)?{...field,targets:[context.source]}:field);
}
export function linkMenuGroups(options:RecordLinkOption[],fields:RelationshipField[],language:string,excludedRelationshipIds:readonly string[]=[]){
 const label=(labels:Record<string,string>)=>labels[language]??labels.en??labels.de??Object.values(labels)[0]??'';
 return options.map(option=>({...option,label:label(option.objectType.labels),choices:option.relationships.flatMap(choice=>{const field=fields.find(f=>f.definition.id===choice.relationshipTypeId&&f.side===choice.side);return field&&!excludedRelationshipIds.includes(field.definition.id)?[{...choice,field,label:label(field.definition.kind==='general'?field.definition.labels:field.side==='left'?field.definition.leftLabels:field.definition.rightLabels)}]:[];}).sort((a,b)=>(a.field.definition.kind==='general'?0:1)-(b.field.definition.kind==='general'?0:1)||a.label.localeCompare(b.label,language))})).filter(group=>group.choices.length).sort((a,b)=>a.label.localeCompare(b.label,language));
}
