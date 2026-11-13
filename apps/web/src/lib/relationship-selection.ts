import {localizedFieldDraft,reformatNumericDrafts} from './numeric-input';
import type { RelatedRecord, RelationshipType } from '@xobject/contracts';
export const relatedIdentity=(record:Pick<RelatedRecord,'objectTypeId'|'recordId'>)=>`${record.objectTypeId}:${record.recordId}`;
export function sameRelatedSelection(left:RelatedRecord[],right:RelatedRecord[]) {
  const identities=new Set(left.map(relatedIdentity));
  return left.length===right.length&&identities.size===left.length&&new Set(right.map(relatedIdentity)).size===right.length&&right.every(record=>identities.has(relatedIdentity(record)));
}
export function toggleRelatedSelection(current:RelatedRecord[],target:RelatedRecord,single:boolean) {
  if(single)return [target];
  return current.some(record=>relatedIdentity(record)===relatedIdentity(target))?current.filter(record=>relatedIdentity(record)!==relatedIdentity(target)):[...current,target];
}
export function eligibleTargetObject(type:RelationshipType,source:string,side:'left'|'right',target:string) {
  if(type.allowAll)return true;
  return type.pairs.some(pair=>side==='left'?pair.leftObjectTypeId===source&&pair.rightObjectTypeId===target:pair.rightObjectTypeId===source&&pair.leftObjectTypeId===target)
    ||!type.directed&&type.pairs.some(pair=>side==='left'?pair.rightObjectTypeId===source&&pair.leftObjectTypeId===target:pair.leftObjectTypeId===source&&pair.rightObjectTypeId===target);
}
/** Decide from allowed target objects, including empty lists, rather than current row contents. */
export function relationshipShowsObjectColumn(fields:import('@xobject/contracts').RelationshipField[],source:string,mode:import('@xobject/contracts').RelationshipObjectColumn='auto'):boolean{
 if(mode==='show')return true;if(mode==='hide')return false;
 const ids=new Set<string>();
 for(const field of fields){
  if(field.definition.allowAll)return true;
  for(const id of new Set(field.definition.pairs.flatMap(pair=>[pair.leftObjectTypeId,pair.rightObjectTypeId])))if(eligibleTargetObject(field.definition,source,field.side,id))ids.add(id);
  for(const target of field.targets)ids.add(target.objectTypeId);
 }
 return ids.size>1;
}
/** A picker returns candidate metadata; reselecting an existing edge retains its saved/draft attributes. */
export function retainRelationshipAttributes(next:import('@xobject/contracts').RelationshipField[],current:import('@xobject/contracts').RelationshipField[],baseline:import('@xobject/contracts').RelationshipField[]){
 return next.map(field=>({...field,targets:field.targets.map(target=>{
  if(target.edgeId)return target;
  const candidates=[...current,...baseline].filter(f=>f.definition.id===field.definition.id&&f.side===field.side).flatMap(f=>f.targets);
  const retained=candidates.find(r=>relatedIdentity(r)===relatedIdentity(target)&&r.edgeId);
  return retained?{...target,edgeId:retained.edgeId,edgeVersion:retained.edgeVersion,attributeValues:retained.attributeValues,attributeAccess:retained.attributeAccess}:target;
 })}));
}
export function localizedRelationshipFields(fields:import('@xobject/contracts').RelationshipField[],regional:import('@xobject/contracts').RegionalSettings):import('@xobject/contracts').RelationshipField[]{
 return fields.map(relation=>({...relation,targets:relation.targets.map(target=>({...target,attributeValues:target.attributeValues?Object.fromEntries(Object.entries(target.attributeValues).map(([id,value])=>{const field=relation.definition.fields?.find(f=>f.id===id);return [id,field?localizedFieldDraft(field,value,regional):value];})):undefined}))}));
}
export function reformatRelationshipFields(fields:import('@xobject/contracts').RelationshipField[],from:import('@xobject/contracts').RegionalSettings,to:import('@xobject/contracts').RegionalSettings):import('@xobject/contracts').RelationshipField[]|null{
 let invalid=false;
 const result=fields.map(relation=>({...relation,targets:relation.targets.map(target=>{
  if(!target.attributeValues)return target;
  const definitions=(relation.definition.fields??[]).map(f=>({...f,technicalName:f.id}));
  const next=reformatNumericDrafts(definitions,target.attributeValues,from,to);if(!next){invalid=true;return target;}return {...target,attributeValues:next};
 })}));return invalid?null:result;
}

/** Sparse to-many draft: loaded pages are projections, never a replacement baseline. */
export type RelationshipDraftField=import('@xobject/contracts').RelationshipField&{removedTargets?:import('@xobject/contracts').RecordReference[]};
export const removedRelationshipTargets=(field:import('@xobject/contracts').RelationshipField)=>(field as RelationshipDraftField).removedTargets??[];
export function removeRelationshipTarget(field:import('@xobject/contracts').RelationshipField,target:import('@xobject/contracts').RelatedRecord):RelationshipDraftField{
 return {...field,targets:field.targets.filter(t=>relatedIdentity(t)!==relatedIdentity(target)),...(field.paged&&target.edgeId?{removedTargets:[...removedRelationshipTargets(field).filter(t=>relatedIdentity(t)!==relatedIdentity(target)),{objectTypeId:target.objectTypeId,recordId:target.recordId}]}:{})};
}
