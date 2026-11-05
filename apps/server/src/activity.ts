import {sql} from 'kysely';
import type {Executor} from './database.js';
/** Supplied activity identities; extend this classification when adding an activity profile. */
export const activityObjectKeys=['project','case','task'];
export async function isActivityObject(tx:Executor,id:string):Promise<boolean>{
 return (await sql`SELECT 1 FROM sys_module_object_bindings WHERE object_type_id=${id}::uuid AND object_key=ANY(${activityObjectKeys}::text[])`.execute(tx)).rows.length>0;
}
