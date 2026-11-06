// Current-model, isolated fixture: permission/query capacity, not migration or provider acceptance.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {Client as PgClient} from 'pg';
import {sql} from 'kysely';
import {defaultRecordSecurity} from '@xobject/contracts';
import {initializeDatabase,connect} from '../apps/server/src/database.js';
import {createAuth} from '../apps/server/src/auth.js';
import {Application} from '../apps/server/src/domain.js';
import {buildServer} from '../apps/server/src/server.js';
const exec=promisify(execFile),container=`xobject-performance-${randomUUID()}`,secret=randomBytes(48).toString('base64url'),baseURL='http://127.0.0.1:4100';
let runtime:ReturnType<typeof buildServer>|undefined,fixture:ReturnType<typeof connect>|undefined;
try{
 await exec('docker',['run','--detach','--rm','--name',container,'-e','POSTGRES_PASSWORD=acceptance_only','-e','POSTGRES_DB=xobject_performance','-p','127.0.0.1::5432','postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5']);
 const address=(await exec('docker',['port',container,'5432/tcp'])).stdout.trim(),databaseURL=`postgres://postgres:acceptance_only@${address}/xobject_performance`;
 for(let i=0;i<80;i++){const probe=new PgClient({connectionString:databaseURL});try{await probe.connect();await probe.query('SELECT 1');break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}finally{await probe.end().catch(()=>{});}}
 await initializeDatabase(databaseURL,secret,baseURL);fixture=connect(databaseURL);
 const provisioning=createAuth(fixture.pool,secret,baseURL,true),password=randomBytes(24).toString('base64url');
 const admin=await provisioning.api.signUpEmail({body:{email:'john@example.test',name:'John Doe',password}}),user=await provisioning.api.signUpEmail({body:{email:'jane@example.test',name:'Jane Doe',password}});
 await fixture.pool.query('UPDATE sys_users SET is_admin=true WHERE id=$1',[admin.user.id]);
 const application=new Application(fixture.db),act=async(name:any,args:any):Promise<any>=>application.execute(name,args,admin.user.id);
 const ws=await act('create_workspace',{name:'ITextreme',code:'itx'});await act('set_workspace_member',{workspaceId:ws.id,userId:user.user.id,role:'user',expectedRole:null});
 for(const module of await act('list_workspace_modules',{workspaceId:ws.id})){if(module.available)await act('configure_workspace_module',{workspaceId:ws.id,key:module.key,enabled:true,version:module.version});}
 let parent:any;
 for(let i=0;i<20;i++)parent=await act('create_group',{workspaceId:ws.id,name:`Group ${i+1}`,members:[parent?{kind:'group',id:parent.id,level:'full'}:{kind:'user',id:user.user.id,level:'edit'}]});
 const external=await act('create_group',{workspaceId:ws.id,name:'Partner owners',members:[]});
 const foreign=await act('get_foreign_access',{workspaceId:ws.id});await act('configure_foreign_access',{...foreign,users:[{userId:user.user.id,inherit:true,manageOwn:false}],rules:[{id:randomUUID(),requester:{kind:'group',id:parent.id},owner:{kind:'group',id:external.id},level:'read',confidential:false,objects:{}}]});
 const objects:any[]=[],ids:string[][]=[];
 for(let index=0;index<5;index++){
  const object=await act('create_object_type',{workspaceId:ws.id,technicalName:`bench_items_${index}`,labels:{en:`Benchmark items ${index}`,de:`Testobjekte ${index}`},standardFields:['keyword','type_status','category']});
  const description=await act('create_field',{objectTypeId:object.id,technicalName:'description',labels:{en:'Description',de:'Beschreibung'},kind:'multiline'});
  const permissions=await act('get_content_permissions',{objectTypeId:object.id});await act('configure_content_permissions',{...permissions,sensitive:true,grants:[{kind:'user',id:user.user.id,level:'full',create:true,fields:{}}]});
  const rows=await fixture.db.transaction().execute(async tx=>{
   const result=(await sql<{id:string}>`INSERT INTO ${sql.table(object.tableName)}(id,created_by,updated_by,keyword,description) SELECT uuidv7(),${admin.user.id},${admin.user.id},'Bench item '||n,repeat('Representative description. ',20) FROM generate_series(1,2000) n RETURNING id`.execute(tx)).rows;
   await sql`INSERT INTO sys_record_identities(workspace_id,object_type_id,record_id) SELECT ${ws.id}::uuid,${object.id}::uuid,unnest(${result.map(row=>row.id)}::uuid[])`.execute(tx);
   const policies=result.map((row,i)=>{const bucket=i%5,policy=defaultRecordSecurity(bucket===4?[]:[{kind:bucket===1||bucket===2?'group':'user',id:bucket===0?user.user.id:bucket===1?parent.id:bucket===2?external.id:admin.user.id,level:'full'}]);if(bucket===3)policy.privacy='personal';if(bucket===1)policy.fields=[{kind:'user',id:user.user.id,fields:{[description.id]:'none'}}];return {id:row.id,policy};});
   await sql`INSERT INTO sys_record_security(workspace_id,object_type_id,record_id,policy) SELECT ${ws.id}::uuid,${object.id}::uuid,r.id,r.policy FROM jsonb_to_recordset(${JSON.stringify(policies)}::jsonb) AS r(id uuid,policy jsonb)`.execute(tx);
   return result;
  });objects.push(object);ids.push(rows.map(row=>row.id));
 }
 const supplied=await act('list_object_types',{workspaceId:ws.id});
 for(const object of supplied.filter((item:any)=>!objects.some(custom=>custom.id===item.id))){const permissions=await act('get_content_permissions',{objectTypeId:object.id});await act('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.user.id,level:'full',create:true,fields:{}}]});}
 const contacts=supplied.find((object:any)=>object.technicalName==='contacts'),contact=await act('get_object_type',{objectTypeId:contacts.id}),contactRights=await act('get_content_permissions',{objectTypeId:contacts.id});
 for(let i=0;i<250;i++)await act('create_record',{objectTypeId:contacts.id,values:{contact_kind:contact.contactProfile.kinds.organization,company_name:`Bench Organization ${i}`},...(contactRights.sensitive?{security:{policy:defaultRecordSecurity(),confirmPublic:true}}:{})});
 const general=(await act('list_relationship_types',{workspaceId:ws.id})).find((item:any)=>item.kind==='general');
 for(let index=1;index<=3;index++)await sql`INSERT INTO sys_relationships(id,workspace_id,relationship_type_id,left_object_type_id,left_record_id,right_object_type_id,right_record_id,created_by,updated_by) SELECT uuidv7(),${ws.id}::uuid,${general.id}::uuid,${objects[0].id}::uuid,a.id,${objects[index].id}::uuid,b.id,${admin.user.id},${admin.user.id} FROM unnest(${ids[0].slice(0,1000)}::uuid[]) WITH ORDINALITY a(id,n) JOIN unnest(${ids[index].slice(0,1000)}::uuid[]) WITH ORDINALITY b(id,n) USING(n)`.execute(fixture.db);
 await sql`ANALYZE`.execute(fixture.db);
 runtime=buildServer({databaseURL,authSecret:secret,baseURL});
 const session=await runtime.app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{host:'127.0.0.1:4100',origin:baseURL},payload:{email:'jane@example.test',password}});assert.equal(session.statusCode,200);
 const cookie=session.cookies.map(value=>`${value.name}=${value.value}`).join('; ');
 async function api(name:string,input:unknown){const response=await runtime!.app.inject({method:'POST',url:`/api/v1/${name}`,headers:{host:'127.0.0.1:4100',cookie,'x-xobject-request':'1','content-type':'application/json'},payload:JSON.stringify(input)});assert.equal(response.statusCode,200,`${name}: ${response.statusCode}`);return response.json();}
 assert.equal((await api('list_records',{objectTypeId:objects[0].id})).total,1600);
 assert.equal((await api('list_workspace_records',{workspaceId:ws.id})).total,8250);
 assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/get_record',headers:{host:'127.0.0.1:4100',cookie,'x-xobject-request':'1'},payload:{objectTypeId:objects[0].id,recordId:ids[0][3]}})).statusCode,403);
 const scenarios=[['object list',()=>api('list_records',{objectTypeId:objects[0].id,query:'Bench',limit:25}),750],['workspace list',()=>api('list_workspace_records',{workspaceId:ws.id,limit:25}),750],['global search',()=>api('search_workspace',{workspaceId:ws.id,query:'Bench',limit:20}),750],['dashboard',()=>api('get_workspace_dashboard',{workspaceId:ws.id}),1500],['record',()=>api('get_record',{objectTypeId:objects[0].id,recordId:ids[0][0]}),750],['relationships',()=>api('get_record_relationships',{objectTypeId:objects[0].id,recordId:ids[0][0]}),1000]] as const;
 const results=[];
 for(const [name,action,target] of scenarios){for(let i=0;i<3;i++)await action();const times:number[]=[];await Promise.all(Array.from({length:8},async()=>{for(let i=0;i<6;i++){const start=performance.now();await action();times.push(performance.now()-start);}}));times.sort((a,b)=>a-b);results.push({name,samples:times.length,concurrency:8,p50Ms:+times[Math.floor(times.length*.5)].toFixed(1),p95Ms:+times[Math.floor(times.length*.95)].toFixed(1),targetP95Ms:target});}
 let record=await api('get_record',{objectTypeId:objects[0].id,recordId:ids[0][0]});const writes=[];
 for(let i=0;i<24;i++){const start=performance.now();record=await api('update_record',{objectTypeId:objects[0].id,recordId:record.id,version:record.version,values:{description:`Measured update ${i}`}});writes.push(performance.now()-start);}writes.sort((a,b)=>a-b);results.push({name:'versioned write + journal',samples:24,concurrency:1,p50Ms:+writes[12].toFixed(1),p95Ms:+writes[22].toFixed(1),targetP95Ms:1000});
 const report={status:results.every(item=>item.p95Ms<=item.targetP95Ms)?'passed':'target missed',node:process.version,platform:`${process.platform}/${process.arch}`,database:'PostgreSQL 18 in Docker',transport:'Fastify HTTP injection, cookie/session and current application checks; no TLS/network latency',profile:{records:10250,objectTypes:supplied.length,customSensitiveObjects:5,nestedGroups:20,foreignOwnerGroups:1,relationships:3000,customVisibility:'80% permitted / 20% denied; mixed direct, group, foreign and public paths; field exceptions'},results};
 await mkdir('.local',{recursive:true,mode:0o700});await writeFile('.local/permission-performance.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));assert.equal(report.status,'passed');
}finally{await runtime?.app.close();if(fixture){await fixture.db.destroy();if(!fixture.pool.ended)await fixture.pool.end();}await exec('docker',['rm','--force',container]).catch(()=>{});}
