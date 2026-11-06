import {z} from 'zod';
import {uuidSchema} from './identity.js';
import type {RelationshipType} from './relationship-types.js';
import type {PrimaryRequirements,PrimaryChain} from './primary-chain.js';
import {languageSchema} from './languages.js';
const width=z.enum(['half','full']);
export const formEntrySchema=z.union([
  z.object({fieldId:uuidSchema,width}).strict(),
  z.object({relationshipTypeId:uuidSchema,side:z.enum(['left','right']),width,visible:z.boolean().optional(),expanded:z.enum(['auto','open','closed']).optional()}).strict(),
  z.object({primary:z.literal(true),width:z.literal('full'),visible:z.boolean().optional()}).strict(),
]);
export type FormEntry=z.infer<typeof formEntrySchema>;
export const formEntryKey=(entry:FormEntry)=>'fieldId' in entry?entry.fieldId:'primary' in entry?'primary_chain':`relationship:${entry.relationshipTypeId}:${entry.side}`;
export const formLayoutSchema=z.object({groups:z.array(z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
  labels:z.partialRecord(languageSchema,z.string().trim().min(1).max(200)).refine(value=>Object.keys(value).length>0,'Group needs a label'),
  width:width.optional(),
  fields:z.array(formEntrySchema).max(1000),
}).strict()).max(50),unassigned:z.array(formEntrySchema).max(1000).optional()}).strict().superRefine((layout,ctx)=>{
  const groups=layout.groups.map(group=>group.id),fields=[...layout.groups.flatMap(group=>group.fields),...(layout.unassigned??[])].map(formEntryKey);
  if(new Set(groups).size!==groups.length||new Set(fields).size!==fields.length)ctx.addIssue({code:'custom',message:'Duplicate group or form element'});
});
export type FormLayout=z.infer<typeof formLayoutSchema>;
export type FormLayouts={default?:FormLayout};
export const formLayoutEntries=(layout:FormLayout)=>[...layout.groups.flatMap(group=>group.fields),...(layout.unassigned??[])];
type LayoutField={id:string;technicalName:string;kind:string;config?:{schema?:string};label?:string;required?:boolean;state?:string};
export interface FormRelationship {required?:boolean;definition:RelationshipType;side:'left'|'right'}
export interface FormElement {key:string;entry:FormEntry;field?:LayoutField;relationship?:FormRelationship;single:boolean;required:boolean}
export function relationshipSidesForObject(type:RelationshipType,objectId:string,chain?:PrimaryChain|null):('left'|'right')[]{
  const symmetric=!type.directed&&(type.allowAll||type.pairs.some(pair=>type.pairs.some(other=>other.leftObjectTypeId===pair.rightObjectTypeId)));
  const eligible=(side:'left'|'right')=>type.allowAll||type.pairs.some(pair=>(side==='left'?pair.leftObjectTypeId:pair.rightObjectTypeId)===objectId);
  return (['left','right'] as const).filter(side=>!(side==='right'&&symmetric)&&!(type.kind==='primary'&&chain&&((side==='left'&&!Object.values(chain).includes(objectId))||(side==='right'&&chain.contact===objectId)))&&(eligible(side)||(symmetric&&eligible('right'))));
}
export function formRelationshipFields(types:RelationshipType[],objectId:string,chain?:PrimaryChain|null,requirements?:PrimaryRequirements):FormRelationship[]{
  return types.filter(type=>type.kind!=='general'&&type.rulesState==='active'&&(type.kind!=='primary'||type.active)).flatMap(definition=>relationshipSidesForObject(definition,objectId,chain).filter(side=>definition.kind!=='primary'||side==='right').map(side=>({definition,side,...(definition.kind==='primary'?{required:Boolean(requirements?.associationRequired||requirements?.requiredLevels.length)}:{})})));
}
export function defaultFormWidth(field:LayoutField):'half'|'full' {return ['keyword','category','access_principals'].includes(field.technicalName)||(['multiline','multiple_choice','tree_choice'].includes(field.kind)||field.kind==='structured'&&field.config?.schema!=='name_components')?'full':'half';}
export function formLayoutElements(fields:LayoutField[],relationships:FormRelationship[]=[]):FormElement[]{
  return [...fields.map(field=>({key:field.id,entry:{fieldId:field.id,width:defaultFormWidth(field)} as FormEntry,field,single:true,required:Boolean(field.required)})),...relationships.map(relationship=>{
    const {definition,side}=relationship,single=(side==='left'?definition.leftMax:definition.rightMax)===1,required=relationship.required||definition.active&&(side==='left'?definition.leftMin:definition.rightMin)>0;
    const entry:FormEntry=definition.kind==='primary'?{primary:true,width:'full',visible:true}:{relationshipTypeId:definition.id,side,width:single?'half':'full',visible:true,expanded:'auto'};
    return {key:formEntryKey(entry),entry,relationship,single:definition.kind!=='primary'&&single,required};
  })];
}
export function effectiveFormEntry(entry:FormEntry,element:FormElement):FormEntry {
  return {...entry,width:element.single?entry.width:'full',...(!('fieldId' in entry)&&element.required?{visible:true}:{})} as FormEntry;
}
/** Group IDs and labels have no semantic role. Missing elements stay explicitly unassigned. */
export function resolveFormLayout(layout:FormLayout|undefined,fields:LayoutField[],complete=true,relationships:FormRelationship[]=[],retainUnavailable=false):FormLayout {
  const elements=formLayoutElements(fields,relationships),byKey=new Map(elements.map(element=>[element.key,element]));
  const normalize=(entries:FormEntry[])=>entries.filter(entry=>retainUnavailable||byKey.has(formEntryKey(entry))).map(entry=>byKey.has(formEntryKey(entry))?effectiveFormEntry(entry,byKey.get(formEntryKey(entry))!):{...entry});
  const starterGroups=[
    {id:'general',labels:{de:'Allgemein',en:'General'},fields:[] as FormEntry[]},
    {id:'primary_association',labels:{de:'Hauptzuordnung',en:'Primary association'},fields:[] as FormEntry[]},
    {id:'classification',labels:{de:'Einordnung',en:'Classification'},fields:[] as FormEntry[]},
    {id:'relationships',labels:{de:'Verknüpfungen',en:'Relationships'},fields:[] as FormEntry[]},
    {id:'notes',labels:{de:'Notizen',en:'Notes'},fields:[] as FormEntry[]},
  ];
  const groups=layout?layout.groups.map(group=>({...group,fields:normalize(group.fields)})):starterGroups;
  const unassigned=normalize(layout?.unassigned??[]);
  if(complete){
    const rank=['keyword','type','status','category'];
    const ordered=layout?elements:[...elements].sort((a,b)=>{const ai=rank.indexOf(a.field?.technicalName??''),bi=rank.indexOf(b.field?.technicalName??'');return (ai<0?4:ai)-(bi<0?4:bi);});
    const included=new Set([...groups.flatMap(group=>group.fields),...unassigned].map(formEntryKey));
    for(const element of ordered)if(!included.has(element.key)){
      if(layout)unassigned.push(element.entry);
      else {
        const target=element.relationship?.definition.kind==='primary'?'primary_association':!element.field?(element.single?'general':'relationships'):['type','status','category'].includes(element.field.technicalName)?'classification':element.field.technicalName==='notes'&&element.field.kind==='multiline'?'notes':'general';
        groups.find(group=>group.id===target)!.fields.push(element.entry);
      }
    }
  }
  return {groups:layout?groups:groups.filter((group,index)=>index===0||group.fields.length),...(unassigned.length||layout?.unassigned?{unassigned}:{})};
}
