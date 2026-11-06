import {AppError} from './errors.js';
import {sql} from 'kysely';
import type {Database} from './database.js';
import {contentAccess,withContentAccess} from './content-permissions.js';
import {Client} from 'pg';
import {PassThrough} from 'node:stream';
import {changeChannel,type ChangeNotice,type ChangedRecord} from './change-notifications.js';
import type {Application} from './domain.js';
/** One LISTEN connection per process; bounded subscribers and payload-free browser events. */
export function liveUpdates(databaseURL:string,application:Application,buildId:string,db:Database){
 let listener:Client|undefined,connecting:Promise<void>|undefined,closed=false;
 const reservations=new Map<symbol,string>();
 const subscribers=new Set<{userId:string;close:()=>void;notify:(change:ChangeNotice)=>void}>();
 async function listen(){
  if(listener)return;if(connecting)return connecting;
  connecting=(async()=>{const client=new Client({connectionString:databaseURL,connectionTimeoutMillis:5000});
   const failed=()=>{if(listener===client)listener=undefined;for(const sub of [...subscribers])sub.close();void client.end().catch(()=>{});};
   client.on('error',failed);client.on('end',()=>{if(listener===client)failed();});
   try{await client.connect();await client.query(`LISTEN ${changeChannel}`);if(closed){await client.end();return;}listener=client;
    client.on('notification',event=>{try{const notice=JSON.parse(event.payload??'') as ChangeNotice;for(const sub of subscribers)sub.notify(notice);}catch{/* Unknown transport input carries no user data. */}});
   }catch(error){await client.end().catch(()=>{});throw error;}
  })().finally(()=>{connecting=undefined;});return connecting;
 }
 return {
  async subscribe(userId:string,workspaceId:string,watched:ChangedRecord[],validate:()=>Promise<unknown>,signal?:AbortSignal){
   if(closed)throw Object.assign(new Error('Live updates unavailable'),{statusCode:503});
   if(subscribers.size+reservations.size>=64||[...subscribers].filter(sub=>sub.userId===userId).length+[...reservations.values()].filter(id=>id===userId).length>=4)throw Object.assign(new Error('Live connection limit'),{statusCode:429});
   const reservation=Symbol();reservations.set(reservation,userId);
   const allowed=()=>application.execute('list_workspaces',{},userId).then(workspaces=>(workspaces as {id:string}[]).some(w=>w.id===workspaceId));
   const visible=async(refs:ChangedRecord[])=>db.transaction().execute(tx=>withContentAccess(tx,userId,async()=>{
    const found=new Set<string>(),groups=new Map<string,string[]>();
    for(const ref of refs)groups.set(ref.objectTypeId,[...(groups.get(ref.objectTypeId)??[]),ref.recordId]);
    for(const [type,ids] of groups){
     const model=(await sql<{name:string}>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${type}::uuid AND o.workspace_id=${workspaceId}::uuid AND o.state<>'deleted'`.execute(tx)).rows[0];if(!model)continue;
     const policy=await contentAccess().policy(type);if(!policy.capabilities.read)continue;
     const rows=(await sql<{id:string}>`SELECT id FROM ${sql.table(model.name)} WHERE id=ANY(${ids}::uuid[]) AND ${policy.predicate()}`.execute(tx)).rows;
     for(const row of rows)found.add(`${type}:${row.id}`);
    }return found;
   }));
   let initial:Set<string>;
   try{await validate();if(!await allowed())throw Object.assign(new Error('Unavailable workspace'),{statusCode:403});await listen();initial=await visible(watched);if(signal?.aborted||closed)throw Object.assign(new Error('Connection closed'),{statusCode:503});}
   catch(error){reservations.delete(reservation);throw error;}
   reservations.delete(reservation);
   const stream=new PassThrough(),previous=initial,watchKeys=new Set(watched.map(ref=>`${ref.objectTypeId}:${ref.recordId}`));let stopped=false,running=false,pending:ChangeNotice[]=[];
   const key=(ref:ChangedRecord)=>`${ref.objectTypeId}:${ref.recordId}`;
   // A retained visible reference permits an invalidation after access loss, never data disclosure.
   const send=(event:string,data:unknown)=>{if(stopped)return;if(stream.writableLength>16384){stop();return;}stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
   const stop=()=>{if(stopped)return;stopped=true;clearInterval(heartbeat);signal?.removeEventListener('abort',stop);subscribers.delete(subscriber);stream.end();};
   const subscriber={userId,close:stop,notify:(notice:ChangeNotice)=>{
    if(notice.workspaceId!==workspaceId&&notice.workspaceId!==null)return;
    if(pending.length>=100){stop();return;}pending.push(notice);void drain();
   }};
   async function drain(){if(running||stopped)return;running=true;try{
    while(pending.length&&!stopped){let batch=pending;pending=[];await validate();
     if(batch.some(n=>n.workspaceId===null&&n.userId!==userId)){const access=await application.execute('get_access_context',{},userId) as {isAdmin:boolean};if(!access.isAdmin)batch=batch.filter(n=>n.workspaceId!==null||n.userId===userId);}if(!batch.length)continue;if(!await allowed()){send('refresh',{});stop();return;}
     let refresh=batch.some(n=>n.metadata);
     const refs=[...new Map(batch.flatMap(n=>n.records).map(ref=>[key(ref),ref])).values()],current=await visible(refs);
     for(const ref of refs){const readable=current.has(key(ref));if(readable||previous.has(key(ref)))refresh=true;if(readable&&watchKeys.has(key(ref)))previous.add(key(ref));else previous.delete(key(ref));}
     if(refresh)send('refresh',{});
    }
   }catch(error){if(error instanceof AppError&&error.status===401)send('session',{});stop();}finally{running=false;}}
   const heartbeat=setInterval(()=>{void validate().then(()=>send('heartbeat',{})).catch(error=>{if(error instanceof AppError&&error.status===401)send('session',{});stop();});},15000);
   signal?.addEventListener('abort',stop,{once:true});
   stream.once('close',stop);subscribers.add(subscriber);send('ready',{buildId});return stream;
  },
  async close(){closed=true;for(const sub of [...subscribers])sub.close();await connecting?.catch(()=>{});await listener?.end();listener=undefined;}
 };
}
