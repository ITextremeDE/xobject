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
