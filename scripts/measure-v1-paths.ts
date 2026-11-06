// Isolated current-model acceptance. Never connects to the development database.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {Client as PgClient} from 'pg';
import {sql} from 'kysely';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {defaultRecordSecurity,type Operation} from '@xobject/contracts';
import {initializeDatabase,connect} from '../apps/server/src/database.js';
import {createAuth} from '../apps/server/src/auth.js';
import {Application} from '../apps/server/src/domain.js';
import {buildServer} from '../apps/server/src/server.js';
import {cleanupV1Benchmark} from './measure-v1-cleanup.js';

process.env.LOG_LEVEL ??= 'silent';

// Targets are fixed before measurement; transport comparisons and lock observations have no invented SLA.
const targets={treeBranch:1000,recordJournal:1000,accessPrincipals:750};
const bounded=(key:string,fallback:number,min:number,max:number)=>{const value=Number(process.env[key]??fallback);assert.ok(Number.isInteger(value)&&value>=min&&value<=max,`Invalid ${key}`);return value;};
const profile={records:bounded('XOBJECT_BENCH_RECORDS',10000,100,100000),journalEvents:bounded('XOBJECT_BENCH_JOURNAL',10000,100,100000),eligibleAccounts:bounded('XOBJECT_BENCH_USERS',32,2,100),primaryEdges:bounded('XOBJECT_BENCH_EDGES',1000,10,10000),projects:10};
assert.ok(profile.primaryEdges<=profile.records-profile.projects,'Edges must fit custom records');
const exec=promisify(execFile),container=`xobject-v1-paths-${randomUUID()}`,secret=randomBytes(48).toString('base64url'),baseURL='http://127.0.0.1:4100';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
type Result={name:string;samples:number;concurrency:number;p50Ms:number|null;p95Ms:number|null;targetP95Ms:number|null;preflightMs?:number;status:string};
const results:Result[]=[],lockObservations:unknown[]=[],clients:Client[]=[];
let runtime:ReturnType<typeof buildServer>|undefined,fixture:ReturnType<typeof connect>|undefined;
let benchmarkFailed=false,benchmarkFailure:unknown;
const rounded=(n:number)=>+n.toFixed(1);
async function measure(name:string,action:()=>Promise<unknown>,target:number|null,concurrency=8){
 const start=performance.now();await action();const preflight=performance.now()-start;
 console.log(JSON.stringify({preflight:name,milliseconds:rounded(preflight),targetMs:target}));
 if(target!==null&&preflight>target){results.push({name,samples:1,concurrency:1,p50Ms:null,p95Ms:null,targetP95Ms:target,preflightMs:rounded(preflight),status:'preflight target missed; expensive concurrent repetition skipped'});return;}
 await action();const times:number[]=[];
 await Promise.all(Array.from({length:concurrency},async()=>{for(let i=0;i<3;i++){const start=performance.now();await action();times.push(performance.now()-start);}}));
 times.sort((a,b)=>a-b);const p95=times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)];
 results.push({name,samples:times.length,concurrency,p50Ms:rounded(times[Math.floor(times.length*.5)]),p95Ms:rounded(p95),targetP95Ms:target,preflightMs:rounded(preflight),status:target===null?'observed':p95<=target?'passed':'target missed'});
}
try{
 await exec('docker',['run','--detach','--rm','--name',container,'-e','POSTGRES_PASSWORD=acceptance_only','-e','POSTGRES_DB=xobject_paths','-p','127.0.0.1::5432','postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5']);
 const address=(await exec('docker',['port',container,'5432/tcp'])).stdout.trim(),databaseURL=`postgres://postgres:acceptance_only@${address}/xobject_paths`;
 let ready=false;for(let i=0;i<80;i++){const probe=new PgClient({connectionString:databaseURL});try{await probe.connect();await probe.query('SELECT 1');ready=true;break;}catch{await sleep(250);}finally{await probe.end().catch(()=>{});}}assert.ok(ready,'Temporary PostgreSQL must be ready');
 await initializeDatabase(databaseURL,secret,baseURL);fixture=connect(databaseURL);
 const provisioning=createAuth(fixture.pool,secret,baseURL,true),password=randomBytes(24).toString('base64url');
 const admin=(await provisioning.api.signUpEmail({body:{email:'admin@example.test',name:'Fixture Administrator',password}})).user;
 await fixture.pool.query('UPDATE sys_users SET is_admin=true WHERE id=$1',[admin.id]);
 const application=new Application(fixture.db),act=async(name:Operation,args:unknown):Promise<any>=>application.execute(name,args,admin.id);
 const ws=await act('create_workspace',{name:'V1 path acceptance',code:'bench'}),users=[];
 for(let i=0;i<profile.eligibleAccounts-1;i++){const user=(await provisioning.api.signUpEmail({body:{email:`user-${i}@example.test`,name:`Fixture User ${i}`,password}})).user;users.push(user);await act('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});}
 const actor=users[0];
 const projectsModule=(await act('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');
 await act('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:projectsModule.version});
 const supplied=await act('list_object_types',{workspaceId:ws.id}),projects=await act('get_object_type',{objectTypeId:supplied.find((o:any)=>o.technicalName==='projects').id});
 const object=await act('create_object_type',{workspaceId:ws.id,technicalName:'bench_assets',labels:{en:'Benchmark assets'},standardFields:['keyword']});
 const notes=await act('create_field',{objectTypeId:object.id,technicalName:'notes',labels:{en:'Notes'},kind:'multiline'});
 for(const model of [object,projects]){const current=await act('get_content_permissions',{objectTypeId:model.id});await act('configure_content_permissions',{...current,sensitive:true,grants:users.map(user=>({kind:'user',id:user.id,level:'full',create:true,fields:{}}))});}
 async function records(model:any,count:number,privateSome=false){return fixture!.db.transaction().execute(async tx=>{
  const rows=(await sql<{id:string}>`INSERT INTO ${sql.table(model.tableName??`${ws.code}_${model.technicalName}`)}(id,created_by,updated_by,keyword) SELECT uuidv7(),${admin.id},${admin.id},'Fixture record '||n FROM generate_series(1,${count}) n RETURNING id`.execute(tx)).rows;
  await sql`INSERT INTO sys_record_identities(workspace_id,object_type_id,record_id) SELECT ${ws.id}::uuid,${model.id}::uuid,unnest(${rows.map(row=>row.id)}::uuid[])`.execute(tx);
  const policies=rows.map((row,index)=>{const denied=privateSome&&index%20===19,policy=defaultRecordSecurity([{kind:'user',id:denied?admin.id:actor.id,level:'full'}]);if(denied)policy.privacy='personal';return {id:row.id,policy};});
  await sql`INSERT INTO sys_record_security(workspace_id,object_type_id,record_id,policy) SELECT ${ws.id}::uuid,${model.id}::uuid,r.id,r.policy FROM jsonb_to_recordset(${JSON.stringify(policies)}::jsonb) r(id uuid,policy jsonb)`.execute(tx);
  return rows.map(row=>row.id);
 });}
 const projectIds=await records(projects,profile.projects),ids=await records(object,profile.records-profile.projects,true);
 const primary=(await act('list_relationship_types',{workspaceId:ws.id})).find((type:any)=>type.kind==='primary');
 await sql`INSERT INTO sys_relationships(id,workspace_id,relationship_type_id,left_object_type_id,left_record_id,right_object_type_id,right_record_id,created_by,updated_by) SELECT uuidv7(),${ws.id}::uuid,${primary.id}::uuid,${projects.id}::uuid,(${projectIds}::uuid[])[1+((a.n-1)%${profile.projects})::int],${object.id}::uuid,a.id,${admin.id},${admin.id} FROM unnest(${ids.slice(0,profile.primaryEdges)}::uuid[]) WITH ORDINALITY a(id,n)`.execute(fixture.db);
 await sql`INSERT INTO sys_journal(id,change_id,workspace_id,object_type_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,actor_id,created_at) SELECT uuidv7(),uuidv7(),${ws.id}::uuid,${object.id}::uuid,'record',${ids[0]}::uuid,${notes.id}::uuid,'notes',to_jsonb('Fixture value '||(n-1)),to_jsonb('Fixture value '||n),${actor.id},clock_timestamp()-(${profile.journalEvents}-n)*interval '1 second' FROM generate_series(1,${profile.journalEvents}) n`.execute(fixture.db);
 await sql`ANALYZE`.execute(fixture.db);
 runtime=buildServer({databaseURL,authSecret:secret,baseURL});
 async function login(email:string){const response=await runtime!.app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{host:'127.0.0.1:4100',origin:baseURL},payload:{email,password}});assert.equal(response.statusCode,200,'Fixture sign-in');return response.cookies.map(c=>`${c.name}=${c.value}`).join('; ');}
 const cookie=await login(actor.email),adminCookie=await login(admin.email);
 async function api(operation:Operation,input:unknown){const response=await runtime!.app.inject({method:'POST',url:`/api/v1/${operation}`,headers:{host:'127.0.0.1:4100',cookie,'x-xobject-request':'1','content-type':'application/json'},payload:JSON.stringify(input)});assert.equal(response.statusCode,200,`${operation}: ${response.statusCode}`);return response.json();}
 const ref={objectTypeId:object.id,recordId:ids[0]},projectRef={objectTypeId:projects.id,recordId:projectIds[0]};
 assert.equal((await api('list_records',{objectTypeId:object.id})).total,ids.length-Math.floor(ids.length/20));
 assert.equal((await api('list_record_journal',{...ref,limit:10})).total,profile.journalEvents);
 const access=await api('get_record_security',ref);assert.equal(access.principals.filter((p:any)=>p.assignable).length,profile.eligibleAccounts);
 await measure('tree branch / cookie HTTP',()=>api('get_relationship_tree_branch',{...projectRef,limit:25}),targets.treeBranch);
 await measure('record journal / cookie HTTP',()=>api('list_record_journal',{...ref,limit:10}),targets.recordJournal);
 await measure('Access principals / cookie HTTP',()=>api('get_record_security',ref),targets.accessPrincipals);
 // Actual provider flow in the isolated installation; no external provider/model or CIMD network lookup.
 const credential=await api('create_api_credential',{name:'Benchmark read access',currentPassword:password,channels:['api','mcp'],readOnly:true,expiresAt:new Date(Date.now()+3600000).toISOString()});
 const registered=await runtime.auth.api.createOAuthClient({headers:new Headers({cookie:adminCookie}),body:{client_name:'Isolated benchmark client',redirect_uris:['http://127.0.0.1:49152/callback'],token_endpoint_auth_method:'none',application_type:'native',grant_types:['authorization_code','refresh_token'],scope:'xobject:read offline_access'}});
 const resource=`${baseURL}/mcp`,verifier=randomBytes(32).toString('base64url');
 const query=new URLSearchParams({client_id:registered.client_id,redirect_uri:'http://127.0.0.1:49152/callback',response_type:'code',scope:'xobject:read offline_access',resource,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'benchmark'});
 const authHeaders={host:'127.0.0.1:4100',cookie,'x-xobject-request':'1',origin:baseURL};
 const authorize=await runtime.app.inject({method:'GET',url:`/api/auth/oauth2/authorize?${query}`,headers:authHeaders});assert.equal(authorize.statusCode,302,'OAuth authorization');
 const consentUrl=new URL(String(authorize.headers.location),baseURL);
 const consent=await runtime.app.inject({method:'POST',url:'/api/auth/oauth2/consent',headers:authHeaders,payload:{accept:true,oauth_query:consentUrl.search.slice(1)}});assert.equal(consent.statusCode,200,'OAuth consent');
 const code=new URL(consent.json().url).searchParams.get('code')!;
 const token=await runtime.app.inject({method:'POST',url:'/api/auth/oauth2/token',headers:{host:'127.0.0.1:4100','content-type':'application/x-www-form-urlencoded'},payload:new URLSearchParams({grant_type:'authorization_code',client_id:registered.client_id,redirect_uri:'http://127.0.0.1:49152/callback',code,code_verifier:verifier,resource}).toString()});assert.equal(token.statusCode,200,'OAuth token exchange');
 async function mcp(label:string,headers:Record<string,string>){
  const client=new Client({name:`Benchmark ${label}`,version:'1'},{versionNegotiation:{mode:'auto'}});clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers},fetch:async(url,init)=>{const req=new Request(url,init),response=await runtime!.app.inject({method:req.method as 'POST',url:new URL(req.url).pathname,headers:{...Object.fromEntries(req.headers),host:'127.0.0.1:4100'},...(req.method==='POST'?{payload:await req.text()}:{})});return new Response(response.body||null,{status:response.statusCode,headers:response.headers as HeadersInit});}}));
  return async()=>{const response=await client.callTool({name:'get_record',arguments:ref});assert.notEqual(response.isError,true,'MCP read must remain authorized');return response;};
 }
 await measure('single record / cookie HTTP',()=>api('get_record',ref),null);
 await measure('single record / cookie MCP',await mcp('cookie',{cookie,'x-xobject-request':'1'}),null);
 await measure('single record / same PAT MCP',await mcp('PAT',{authorization:`Bearer ${credential.token}`}),null);
 await measure('single record / same OAuth MCP',await mcp('OAuth',{authorization:`Bearer ${token.json().access_token}`}),null);
 for(const scope of ['workspace','model'] as const){
  const blocker=new PgClient({connectionString:databaseURL});await blocker.connect();let reads:Promise<unknown>[]=[];
  try{
   await blocker.query('BEGIN');await blocker.query(scope==='model'?"SELECT pg_advisory_xact_lock(hashtext('xobject:model'))":"SELECT pg_advisory_xact_lock(hashtextextended($1,0))",scope==='workspace'?[`xobject:workspace:${ws.id}`]:undefined);
   const start=performance.now();reads=Array.from({length:4},()=>api('get_record',ref));
   let waiting=0;for(let i=0;i<500;i++){waiting=(await fixture.pool.query("SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE l.locktype='advisory' AND NOT l.granted AND a.datname=current_database()")).rows[0].n;if(waiting===4)break;await sleep(10);}assert.equal(waiting,4,'All reads must reach the controlled barrier');
   const heldAt=performance.now();await sleep(200);await blocker.query('COMMIT');const observedHoldMs=rounded(performance.now()-heldAt);await Promise.all(reads);
   lockObservations.push({scope,readers:4,controlledHoldMs:200,observedHoldMs,totalReadBatchMs:rounded(performance.now()-start),interpretation:'Synthetic existing advisory barrier, not a measured long-running business mutation or an SLA'});
  }finally{await blocker.query('ROLLBACK').catch(()=>{});await blocker.end();await Promise.allSettled(reads);}
 }
 const report={measuredAt:new Date().toISOString(),status:results.some(r=>r.status.includes('missed'))?'target missed':'passed',node:process.version,platform:`${process.platform}/${process.arch}`,database:'PostgreSQL 18 in disposable Docker container',transport:'Fastify HTTP injection with actual cookie/PAT/OAuth validation and official MCP SDK. No TLS/network latency. MCP timings include handler/Skills setup.',profile:{...profile,visibility:'5% of custom rows denied Personal; first journal record visible',deletedIdentityHistory:0,samplesPerCompleteScenario:24,concurrency:8},targets,results,lockObservations,limits:'No external host/model, native AMD64, production sizing, or released predecessor claim. Preflight misses skip expensive repetition and are not p95 estimates.'};
 await mkdir('.local',{recursive:true,mode:0o700});await writeFile('.local/v1-path-performance.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
 assert.equal(report.status,'passed','At least one predefined local target was missed; retain the report before optimizing.');
}catch(error){benchmarkFailed=true;benchmarkFailure=error;throw error;}finally{
 try{await cleanupV1Benchmark({clients,runtime,fixture,removeOwnContainer:()=>exec('docker',['rm','--force',container])});}
 catch(error){if(benchmarkFailed)throw new AggregateError([benchmarkFailure,error],'V1 benchmark and cleanup failed');throw error;}
}
