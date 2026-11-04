import {parseStructuredValue,type StructuredEntry,type StructuredSchemaKey} from '@xobject/contracts';

/** A draft error in one collection item must not mark its valid siblings. */
export function structuredEntryInvalid(schema:StructuredSchemaKey,entry:StructuredEntry):boolean{
 try{parseStructuredValue(schema,[entry]);return false;}catch{return true;}
}
