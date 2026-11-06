import {sql} from 'kysely';
import type {Executor} from './database.js';
export const changeChannel='xobject_changes';
export type ChangedRecord={objectTypeId:string;recordId:string};
export type ChangeNotice={workspaceId:string|null;userId:string|null;records:ChangedRecord[];metadata:boolean};
/** Use the journals written by this exact transaction, including relationship endpoints.
 * NOTIFY is transactional: rollbacks and read-only/no-op requests produce no event. */
export async function withChangeNotifications<T>(tx:Executor,run:()=>Promise<T>):Promise<T>{
 const result=await run();
 const assigned=(await sql<{id:string|null}>`SELECT pg_current_xact_id_if_assigned()::xid::text AS id`.execute(tx)).rows[0]?.id;
 if(!assigned)return result;
 const rows=(await sql<{workspace_id:string|null;entity_kind:string;entity_id:string;object_type_id:string|null;actor_id:string;endpoints:ChangedRecord[]|null}>`
 SELECT j.workspace_id,j.entity_kind,j.entity_id,j.object_type_id,j.actor_id,
 (SELECT jsonb_agg(jsonb_build_object('objectTypeId',e.object_type_id,'recordId',e.record_id)) FROM sys_relationship_journal_endpoints e WHERE e.journal_id=j.id) AS endpoints
 FROM sys_journal j WHERE j.created_at>=transaction_timestamp() AND j.xmin::text=${assigned}`.execute(tx)).rows;
 const groups=new Map<string,ChangeNotice>();
 for(const row of rows){
  const userId=row.workspace_id?null:['user','account_security'].includes(row.entity_kind)?row.entity_id:row.actor_id;
  const key=row.workspace_id??`user:${userId}`;
  let group=groups.get(key);if(!group){group={workspaceId:row.workspace_id,userId,records:[],metadata:false};groups.set(key,group);}
  if(row.entity_kind==='record'&&row.object_type_id)group.records.push({objectTypeId:row.object_type_id,recordId:row.entity_id});
  else if(row.entity_kind==='relationship')group.records.push(...row.endpoints??[]);
  else group.metadata=true;
 }
 for(const group of groups.values()){
  const records=[...new Map(group.records.map(ref=>[`${ref.objectTypeId}:${ref.recordId}`,ref])).values()];
  for(let i=0;i<Math.max(records.length,1);i+=40)await sql`SELECT pg_notify(${changeChannel},${JSON.stringify({...group,records:records.slice(i,i+40)})})`.execute(tx);
 }
 return result;
}
