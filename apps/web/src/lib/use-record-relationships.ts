import {useDraftPair} from './use-draft-pair';
import {useEffect} from 'react';
import type {RecordRelationships,RegionalSettings} from '@xobject/contracts';
import {seedLinkedFields,type LinkedCreation} from './linked-record';
import {removedRelationshipTargets,localizedRelationshipFields} from './relationship-selection';
import {normalizedFieldDraft} from '@/lib/numeric-input';

/** Own the edge/attribute draft and baseline together; remote refresh never replaces pending edits. */
export function useRecordRelationships(relationships:RecordRelationships,linkedCreation:LinkedCreation|undefined,regional:RegionalSettings,existing:boolean){
  const {value:relationFields,baseline:relationBaseline,setValue:setRelationFields,setBaseline:setRelationBaseline}=useDraftPair(()=>localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));
  const relationDirty=JSON.stringify(relationFields)!==JSON.stringify(relationBaseline);
  useEffect(()=>{if(!relationDirty){setRelationFields(localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));setRelationBaseline(localizedRelationshipFields(seedLinkedFields(relationships.fields,linkedCreation),regional));}},[relationships,relationDirty]);
  const relationshipWrites=()=>relationFields.filter(field=>(!existing||JSON.stringify(field)!==JSON.stringify(relationBaseline.find(item=>item.definition.id===field.definition.id&&item.side===field.side)))).map(field=>({relationshipTypeId:field.definition.id,version:field.definition.version,side:field.side,...(field.paged?{mode:'patch' as const,remove:removedRelationshipTargets(field)}:{}),targets:field.targets.filter(target=>!field.paged||!target.edgeId).map(({objectTypeId,recordId})=>({objectTypeId,recordId}))}));
  const relationshipAttributes=()=>relationFields.flatMap(field=>field.targets.flatMap(target=>{
    const before=relationBaseline.find(f=>f.definition.id===field.definition.id&&f.side===field.side)?.targets.find(t=>t.objectTypeId===target.objectTypeId&&t.recordId===target.recordId);
    const values=Object.fromEntries(Object.entries(target.attributeValues??{}).filter(([id,value])=>target.attributeAccess?.[id]?.edit!==false&&JSON.stringify(value)!==JSON.stringify(before?.attributeValues?.[id]??null)));
    return Object.keys(values).length?[{relationshipTypeId:field.definition.id,definitionVersion:field.definition.version,target:{objectTypeId:target.objectTypeId,recordId:target.recordId},edgeId:target.edgeId,version:target.edgeVersion,values:Object.fromEntries(Object.entries(values).map(([id,value])=>[id,normalizedFieldDraft(field.definition.fields!.find(f=>f.id===id)!,value,regional)]))}]:[];
  }));
  return {relationFields,setRelationFields,relationBaseline,setRelationBaseline,relationDirty,relationshipWrites,relationshipAttributes};
}
