import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import { after, before, beforeEach, test } from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { sql } from 'kysely';
import { Client as PgClient } from 'pg';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { buildServer } from '../src/server.js';
import { initializeDatabase } from '../src/database.js';
import { createAuth } from '../src/auth.js';
import { defaultRecordSecurity,defaultRegionalSettings, defaultWorkspaceAppearance, moveClassificationOption, type ClassificationRules } from '@xobject/contracts';
import {schemas,type Operation} from '../src/domain.js';

process.env.LOG_LEVEL ??= 'silent';
const exec = promisify(execFile);
const container = `xobject-spike-test-${randomUUID()}`;
const secret = randomBytes(48).toString('base64url');
const baseURL = 'http://127.0.0.1:4100';
let runtime: ReturnType<typeof buildServer>;
let adminCookie: string;
let userCookie: string;
let adminId: string;
let client: Client;
let databaseURL: string;
const require=createRequire(import.meta.url),Ajv=require('ajv'),responseValidator=new Ajv({strict:false,validateFormats:false,allErrors:true,allowUnionTypes:true});
const apiContract=JSON.parse(readFileSync(require.resolve('@xobject/contracts/openapi'),'utf8')),validators=new Map<string,any>();
function validateResponse(operation:Operation,value:unknown){
 let validate=validators.get(operation);if(!validate){const schema=apiContract.paths[`/api/v1/${operation}`].post.responses['200'].content['application/json'].schema;validate=responseValidator.compile({...schema,components:apiContract.components});validators.set(operation,validate);}
 assert.ok(validate(value),`Response contract ${operation}: ${JSON.stringify(validate.errors)}`);
}


async function login(email: string, password: string) {
  const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-in/email',
    headers: { host: '127.0.0.1:4100', origin: baseURL }, payload: { email, password } });
  assert.equal(response.statusCode, 200, response.body);
  return response.cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// Existing scenarios use fresh metadata; conflict scenarios pass explicit versions.
async function versionedInput(operation:Operation,input:unknown,actorForInput=adminId) {
  const args=input as Record<string,any>;
  if(operation==='configure_user_localization'&&!Object.hasOwn(args,'expectedLanguage')){const current=(await sql<{language:string|null;time_zone:string|null}>`SELECT language,time_zone FROM sys_users WHERE id=${actorForInput}`.execute(runtime.db)).rows[0];return {...args,timeZone:current.time_zone,expectedLanguage:current.language,expectedTimeZone:current.time_zone};}
  if(operation==='configure_workspace_languages'&&Object.hasOwn(args,'language')){const ws=(await sql<any>`SELECT * FROM sys_workspaces WHERE id=${args.workspaceId}::uuid`.execute(runtime.db)).rows[0];const {language,...rest}=args;return {...rest,version:ws?.language_version??1,availableLanguages:ws?.available_languages??['de','en'],labelLanguages:ws?.label_languages??['de','en'],defaultLanguage:language};}
  if(!['configure_field','set_labels'].includes(operation)||!input||typeof input!=='object')return input;
  if(args.version!==undefined)return args;
  const table=args.kind==='object_type'?'sys_object_types':'sys_fields';
  const row=(await sql<{version:number}>`SELECT version FROM ${sql.table(table)} WHERE id=${args.fieldId??args.id}::uuid`.execute(runtime.db)).rows[0];
  return {...args,version:row?.version??1};
}
async function api(operation: Operation, payload: unknown, cookie = adminCookie) {
  payload = await versionedInput(operation,payload,cookie===userCookie?(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0].id:adminId);
  const response=await runtime.app.inject({ method: 'POST', url: `/api/v1/${operation}`,
    headers: { host: '127.0.0.1:4100', cookie, 'x-xobject-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  if(response.statusCode===200)validateResponse(operation,response.json());
  return response;
}
async function ok(operation: Operation, payload: unknown) {
  const response = await api(operation, payload);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
async function enableProjects(workspaceId:string) {
  const module=(await ok('list_workspace_modules',{workspaceId})).find((m:any)=>m.key==='projects');
  await ok('configure_workspace_module',{workspaceId,key:'projects',enabled:true,version:module.version});
  return (await ok('list_relationship_types',{workspaceId})).find((type:any)=>type.kind==='primary');
}
async function createOrganization(objectTypeId:string,name='Organization'){
 const definition=await ok('get_object_type',{objectTypeId});
 return ok('create_record',{objectTypeId,values:{contact_kind:definition.contactProfile.kinds.organization,company_name:name}});
}
async function tool(operation: Operation, args: Record<string, unknown>) {
  args = await versionedInput(operation,args) as Record<string,unknown>;
  const result = await client.callTool({ name: operation, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return JSON.parse((result.content as { type: string; text: string }[])[0].text);
}

async function journalEntries(args:{objectTypeId:string;recordId:string},viaMcp=false){
 const entries:any[]=[];for(let offset=0;;offset+=100){const page=viaMcp?await tool('list_record_journal',{...args,offset,limit:100}):await ok('list_record_journal',{...args,offset,limit:100});entries.push(...page.entries);if(offset+100>=page.total)break;}return entries.reverse();
}

before(async () => {
  // Real, disposable PostgreSQL. No connection to existing user databases.
  await exec('docker', ['run', '--detach', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=xobject_test_only', '-e', 'POSTGRES_DB=xobject_test',
    '-p', '127.0.0.1::5432', 'postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5'], { timeout: 120000 });
  const mapping = (await exec('docker', ['port', container, '5432/tcp'])).stdout.trim();
  databaseURL = `postgres://postgres:xobject_test_only@${mapping}/xobject_test`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    // The image's temporary bootstrap server accepts local socket connections.
    // Wait for the final server using the actual published TCP endpoint instead.
    const probe = new PgClient({ connectionString: databaseURL, connectionTimeoutMillis: 1000 });
    try { await probe.connect(); await probe.query('SELECT 1'); ready = true; break; }
    catch { await setTimeout(250); }
    finally { await probe.end().catch(() => {}); }
  }
  assert.ok(ready, 'Temporary PostgreSQL must accept SQL over its published TCP endpoint');
  await initializeDatabase(databaseURL, secret, baseURL);
  await initializeDatabase(databaseURL, secret, baseURL); // Identical current initialization is repeatable.
  runtime = buildServer({ databaseURL, authSecret: secret, baseURL });
  // Shared fault injection belongs to setup so selected scenarios run independently.
  await sql`CREATE FUNCTION reject_test_journal() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Induced journal failure'; END $$`.execute(runtime.db);
  // Provisioning has its own pool and is never an HTTP endpoint.
  const { Pool } = await import('pg');
  const provisionPool = new Pool({ connectionString: databaseURL });
  const localAuth = createAuth(provisionPool, secret, baseURL, true);
  try {
    const admin = await localAuth.api.signUpEmail({ body: { email: 'admin@example.test', name: 'Test Administrator', password: 'test-password-administrator' } });
    adminId = admin.user.id;
    await sql`UPDATE sys_users SET is_admin = true WHERE id = ${adminId}`.execute(runtime.db);
    await localAuth.api.signUpEmail({ body: { email: 'user@example.test', name: 'Test User', password: 'test-password-regular-user' } });
  } finally { await provisionPool.end(); }
  adminCookie = await login('admin@example.test', 'test-password-administrator');
  userCookie = await login('user@example.test', 'test-password-regular-user');
  // Use the real MCP client and HTTP transport against Fastify's HTTP injection.
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseURL), {
    requestInit: { headers: { cookie: adminCookie, 'x-xobject-request': '1' } },
    fetch: async (url, init) => {
      const req = new Request(url, init);
      const response = await runtime.app.inject({ method: req.method as 'POST', url: new URL(req.url).pathname,
        headers: { ...Object.fromEntries(req.headers), host: '127.0.0.1:4100' },
        ...(req.method === 'POST' ? { payload: await req.text() } : {}) });
      return new Response(response.body || null, { status: response.statusCode, headers: response.headers as Record<string, string> });
    },
  });
  client = new Client({ name: 'xobject-acceptance', version: '0.0.0' }, {versionNegotiation:{mode:'auto'}});
  await client.connect(transport);
}, { timeout: 180000 });

beforeEach(async()=>{await sql`DELETE FROM sys_auth_rate_limits`.execute(runtime.db);});

after(async () => {
  if (client) await client.close();
  if (runtime) await runtime.app.close();
  await exec('docker', ['rm', '--force', container]).catch(() => {});
});

test('credentials and sessions are persisted in PostgreSQL; public signup stays disabled', async () => {
  const credentials = await sql<{ password: string }>`SELECT password FROM sys_accounts WHERE provider_id = 'credential'`.execute(runtime.db);
  assert.equal(credentials.rows.length, 2);
  assert.ok(credentials.rows.every(r => r.password && !r.password.includes('test-password')));
  const sessions = await sql`SELECT id FROM sys_sessions`.execute(runtime.db);
  assert.ok(sessions.rows.length >= 2);
  const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-up/email',
    headers: { host: '127.0.0.1:4100', origin: baseURL },
    payload: { name: 'Unexpected user', email: 'stranger@example.test', password: 'test-password-stranger' } });
  assert.notEqual(response.statusCode, 200);
});

test('trusted client IPs bound database-backed login attempts across instances and HTTPS sessions carry secure headers/cookies',async()=>{
  for(let i=0;i<11;i++){
    const response=await runtime.app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{host:'127.0.0.1:4100',origin:baseURL,'x-forwarded-for':`192.0.2.${i+1}`,'x-xobject-client-ip':`198.51.100.${i+1}`},payload:{email:'unknown@example.test',password:'a-wrong-test-password'}});
    assert.equal(response.statusCode,i<10?401:429,response.body);
  }
  const second=buildServer({databaseURL,authSecret:secret,baseURL});
  try{
    const denied=await second.app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{host:'127.0.0.1:4100',origin:baseURL},payload:{email:'admin@example.test',password:'test-password-administrator'}});
    assert.equal(denied.statusCode,429);
  }finally{await second.app.close();}
  const secure=buildServer({databaseURL,authSecret:secret,baseURL:'https://secure.example'});
  try{
    const result=await secure.app.inject({method:'POST',url:'/api/auth/sign-in/email',remoteAddress:'192.0.2.51',headers:{host:'secure.example',origin:'https://secure.example'},payload:{email:'admin@example.test',password:'test-password-administrator'}});
    assert.equal(result.statusCode,200,result.body);assert.ok(result.cookies.some(cookie=>cookie.secure&&cookie.httpOnly&&cookie.sameSite==='Lax'));
    assert.equal(result.headers['x-frame-options'],'DENY');assert.match(String(result.headers['content-security-policy']),/frame-ancestors 'none'/);assert.equal(result.headers['referrer-policy'],'no-referrer');assert.match(String(result.headers['strict-transport-security']),/max-age=/);
    const health=await secure.app.inject({method:'GET',url:'/healthz',headers:{host:'secure.example'}});assert.equal(health.statusCode,200);assert.deepEqual(health.json(),{status:'ok'});
  }finally{await secure.app.close();}
});

test('API and real MCP share definitions, data, UUIDv7 identities and per-field journal', async () => {
  const ws = await ok('create_workspace', { name: 'ITextreme', code: 'itx' });
  const type = await tool('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Vehicles' } });
  assert.equal(type.tableName, 'itx_vehicles');
  assert.equal(type.id[14], '7');
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', labels: { en: 'Registration' } });
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Delivery van', values: { registration: 'ITX 1' } });
  assert.equal(record.id[14], '7');
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Service van', values: { registration: 'ITX 2' } });
  assert.equal(updated.version, 2);
  const readback = await tool('get_record', { objectTypeId: type.id, recordId: record.id });
  assert.equal(readback.registration, 'ITX 2');
  const journal = await journalEntries({ objectTypeId: type.id, recordId: record.id },true);
  assert.equal(journal.length, 4);
  const changes = journal.filter((e: { old_value: unknown }) => e.old_value !== null);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].change_id, changes[1].change_id);
  const registration = changes.find((e: { field_key: string }) => e.field_key === 'registration');
  assert.equal(registration.field_id, field.id);
  assert.equal(registration.old_value, 'ITX 1');
  assert.equal(registration.new_value, 'ITX 2');
  assert.equal(registration.actor_id, adminId);
  const unchanged = await tool('update_record', { objectTypeId: type.id, recordId: record.id, version: 2, values: { registration: 'ITX 2' } });
  assert.equal(unchanged.version, 2);
  const stale = await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Stale' });
  assert.equal(stale.statusCode, 409);
  const invalid = await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 2, values: { unknown: 'invalid' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal((await journalEntries({ objectTypeId: type.id, recordId: record.id })).length, 4);
});

test('MCP 2026 discovery, typed results and Skills use current permissions without exposing unlisted files', async () => {
  assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
  assert.equal(client.getProtocolEra(), 'modern');
  const tools = await client.listTools();
  assert.equal(tools.tools.length, Object.keys(schemas).length);
  for (const item of tools.tools) {
    assert.ok(item.outputSchema, item.name);
    assert.ok(item.description && !item.description.includes('API v1 operation:'), item.name);
    assert.equal(item.annotations?.openWorldHint, false);
  }
  const listing = await client.callTool({name:'list_workspaces',arguments:{}});
  assert.ok(Array.isArray(listing.structuredContent));
  assert.deepEqual(listing.structuredContent, JSON.parse((listing.content as {text:string}[])[0].text));
  const ws = await ok('create_workspace', {name:'Skills workspace',code:'skillscheck'});
  const member = (await ok('list_users',{})).find((item:any) => item.email === 'user@example.test');
  await ok('set_workspace_member',{workspaceId:ws.id,userId:member.id,role:'user',expectedRole:null});
  let modules = await ok('list_workspace_modules',{workspaceId:ws.id});
  for (const key of ['contacts','projects']) {
    const module = modules.find((item:any) => item.key === key);
    await ok('configure_workspace_module',{workspaceId:ws.id,key,enabled:true,version:module.version});
  }
  const skills = new SkillsClient(client);
  assert.equal(skills.supported,true);
  const catalog = await skills.list();
  assert.equal(catalog.cacheScope,'private');
  assert.equal(catalog.ttlMs,0);
  assert.deepEqual(catalog.skills.map(item => item.frontmatter.name).sort(), ['xobject-contacts','xobject-foundation','xobject-model-design','xobject-projects']);
  for (const item of catalog.skills) {
    const file = await skills.read(item);
    assert.equal(file.verified,true);
    assert.ok(file.text?.includes('---'));
    assert.equal((await skills.get(item.uri)).skill.uri,item.uri);
  }
  const ordinary = new Client({name:'Skills ordinary user',version:'1'}, {versionNegotiation:{mode:'auto'}});
  await ordinary.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL), {
    requestInit:{headers:{cookie:userCookie,'x-xobject-request':'1'}},
    fetch:async (url,init) => {
      const req=new Request(url,init);
      const response=await runtime.app.inject({method:req.method as 'POST',url:new URL(req.url).pathname,headers:{...Object.fromEntries(req.headers),host:'127.0.0.1:4100'},...(req.method==='POST'?{payload:await req.text()}:{})});
      return new Response(response.body || null,{status:response.statusCode,headers:response.headers as HeadersInit});
    },
  }));
  try {
    const restricted = new SkillsClient(ordinary);
    assert.deepEqual((await restricted.list()).skills.map(item => item.frontmatter.name),['xobject-foundation']);
    const designer = catalog.skills.find(item => item.frontmatter.name === 'xobject-model-design')!;
    await assert.rejects(() => restricted.get(designer.uri));
    await assert.rejects(() => ordinary.readResource({uri:designer.uri}));
    await assert.rejects(() => ordinary.readResource({uri:'skill://xobject-foundation/../../.env'}));
    const objects = await ok('list_object_types',{workspaceId:ws.id});
    for (const object of objects) {
      const policy = await ok('get_content_permissions',{objectTypeId:object.id});
      await ok('configure_content_permissions',{...policy,grants:[{kind:'user',id:member.id,level:'read',fields:{}}]});
    }
    assert.deepEqual((await restricted.list()).skills.map(item => item.frontmatter.name).sort(),['xobject-contacts','xobject-foundation','xobject-projects']);
    await ok('set_workspace_member',{workspaceId:ws.id,userId:member.id,role:null,expectedRole:'user'});
    assert.deepEqual((await restricted.list()).skills.map(item => item.frontmatter.name),['xobject-foundation']);
  } finally { await ordinary.close(); }
});

test('OAuth discovery, PKCE, explicit consent, resource-bound opaque tokens, refresh and revocation share application rights',async()=>{
  const headers={host:'127.0.0.1:4100',cookie:adminCookie,'x-xobject-request':'1',origin:baseURL};
  const resource=`${baseURL}/mcp`;
  const metadata=await runtime.app.inject({method:'GET',url:'/.well-known/oauth-protected-resource/mcp',headers:{host:headers.host}});
  assert.equal(metadata.statusCode,200,metadata.body);assert.equal(metadata.json().resource,resource);
  const discovery=await runtime.app.inject({method:'GET',url:'/.well-known/oauth-authorization-server/api/auth',headers:{host:headers.host}});
  assert.equal(discovery.statusCode,200,discovery.body);assert.equal(discovery.json().client_id_metadata_document_supported,true);assert.ok(!discovery.json().registration_endpoint);
  const unauthorized=await runtime.app.inject({method:'POST',url:'/mcp',headers:{host:headers.host},payload:{}});
  assert.equal(unauthorized.statusCode,401);assert.match(String(unauthorized.headers['www-authenticate']),/resource_metadata/);
  const registered=await runtime.auth.api.createOAuthClient({headers:new Headers({cookie:adminCookie}),body:{client_name:'Local acceptance client',redirect_uris:['http://127.0.0.1:49152/callback'],token_endpoint_auth_method:'none',application_type:'native',grant_types:['authorization_code','refresh_token'],scope:'xobject:read xobject:write offline_access'}});
  const clientId=registered.client_id;
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const query=new URLSearchParams({client_id:clientId,redirect_uri:'http://127.0.0.1:49152/callback',response_type:'code',scope:'xobject:read xobject:write offline_access',resource,code_challenge:challenge,code_challenge_method:'S256',state:'acceptance-state'});
  const authorize=await runtime.app.inject({method:'GET',url:`/api/auth/oauth2/authorize?${query}`,headers});
  assert.equal(authorize.statusCode,302,authorize.body);
  const consentUrl=new URL(String(authorize.headers.location),baseURL);assert.equal(consentUrl.pathname,'/oauth/consent');
  const context=await runtime.app.inject({method:'POST',url:'/api/oauth/consent-context',headers,payload:{query:consentUrl.search.slice(1)}});
  assert.equal(context.statusCode,200,context.body);assert.equal(context.json().name,'Local acceptance client');
  assert.equal((await runtime.app.inject({method:'POST',url:'/api/oauth/consent-context',headers,payload:{query:consentUrl.search.slice(1)+'&scope=changed'}})).statusCode,400);
  const consent=await runtime.app.inject({method:'POST',url:'/api/auth/oauth2/consent',headers,payload:{accept:true,oauth_query:consentUrl.search.slice(1)}});
  assert.equal(consent.statusCode,200,consent.body);
  const callback=new URL(consent.json().url);assert.equal(callback.searchParams.get('state'),'acceptance-state');
  const code=callback.searchParams.get('code')!;
  const tokenCall=(body:Record<string,string>)=>runtime.app.inject({method:'POST',url:'/api/auth/oauth2/token',headers:{host:headers.host,'content-type':'application/x-www-form-urlencoded'},payload:new URLSearchParams(body).toString()});
  const token=await tokenCall({grant_type:'authorization_code',client_id:clientId,redirect_uri:'http://127.0.0.1:49152/callback',code,code_verifier:verifier,resource});
  assert.equal(token.statusCode,200,token.body);const issued=token.json();assert.ok(issued.access_token);assert.ok(issued.refresh_token);assert.equal(issued.token_type,'Bearer');
  const external=new Client({name:'OAuth SDK acceptance',version:'1'},{versionNegotiation:{mode:'auto'}});
  await external.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{authorization:`Bearer ${issued.access_token}`}},fetch:async(url,init)=>{const req=new Request(url,init),response=await runtime.app.inject({method:req.method as 'POST',url:new URL(req.url).pathname,headers:{...Object.fromEntries(req.headers),host:headers.host},...(req.method==='POST'?{payload:await req.text()}:{})});return new Response(response.body||null,{status:response.statusCode,headers:response.headers as HeadersInit});}}));
  try{
    assert.equal(external.getNegotiatedProtocolVersion(),'2026-07-28');
    assert.ok(!(await external.callTool({name:'list_workspaces',arguments:{}})).isError);
    const write=await external.callTool({name:'create_workspace',arguments:{name:'OAuth workspace',code:'oauthscope'}});assert.ok(!write.isError,JSON.stringify(write));
    const events=await ok('list_system_journal',{limit:100});assert.ok(events.entries.some((entry:any)=>entry.access_channel==='mcp'&&entry.agent_name==='Local acceptance client'&&entry.actor_id===adminId));
    const applications=await ok('list_oauth_authorizations',{});assert.ok(applications.some((app:any)=>app.clientId===clientId));
    const tokenId=(await sql<{id:string}>`SELECT id FROM sys_oauth_access_token WHERE token=${createHash('sha256').update(issued.access_token).digest('hex')}`.execute(runtime.db)).rows[0].id;
    await sql`UPDATE sys_oauth_access_token SET scopes='["xobject:read"]'::jsonb WHERE id=${tokenId}`.execute(runtime.db);
    assert.equal((await external.callTool({name:'create_workspace',arguments:{name:'Denied',code:'oauthdenied'}})).isError,true);
    assert.ok(!(await external.callTool({name:'list_workspaces',arguments:{}})).isError);
    await sql`UPDATE sys_oauth_access_token SET resources='["https://other.example/mcp"]'::jsonb WHERE id=${tokenId}`.execute(runtime.db);
    await assert.rejects(()=>external.callTool({name:'list_workspaces',arguments:{}}));
    await sql`UPDATE sys_oauth_access_token SET resources=${JSON.stringify([resource])}::jsonb,scopes='["xobject:read","xobject:write","offline_access"]'::jsonb WHERE id=${tokenId}`.execute(runtime.db);
    assert.equal((await external.callTool({name:'list_oauth_authorizations',arguments:{}})).isError,true);
    const refreshed=await tokenCall({grant_type:'refresh_token',client_id:clientId,refresh_token:issued.refresh_token,resource});assert.equal(refreshed.statusCode,200,refreshed.body);
    await ok('revoke_oauth_authorization',{clientId});
    await assert.rejects(()=>external.callTool({name:'list_workspaces',arguments:{}}));
    assert.notEqual((await tokenCall({grant_type:'refresh_token',client_id:clientId,refresh_token:refreshed.json().refresh_token,resource})).statusCode,200);
    assert.ok(!(await ok('list_oauth_authorizations',{})).some((app:any)=>app.clientId===clientId));
    const history=(await sql<{old_value:unknown;new_value:unknown}>`SELECT old_value,new_value FROM sys_journal WHERE entity_kind='oauth_credential'`.execute(runtime.db)).rows;
    assert.ok(history.length>=4);assert.ok(!JSON.stringify(history).includes(issued.access_token));assert.ok(!JSON.stringify(history).includes(issued.refresh_token));
  }finally{await external.close();}
});

test('names are validated and same object names in different workspaces remain separate', async () => {
  const ws = await tool('create_workspace', { name: 'Other workspace', code: 'other' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Other vehicles' } });
  assert.equal(type.tableName, 'other_vehicles');
  for (const code of ['sys', 'bad_code', 'Bad', '1bad']) {
    assert.equal((await api('create_workspace', { name: 'Invalid', code })).statusCode, 400);
  }
  assert.equal((await api('create_workspace', { name: 'Duplicate', code: 'itx' })).statusCode, 409);
  for (const name of ['id', 'keyword', 'select', 'bad-name', 'x'.repeat(63)]) {
    assert.equal((await api('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: name, labels: { en: 'Invalid' } })).statusCode, 400);
  }
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'version', labels: { en: 'Invalid' } })).statusCode, 400);
  const columns = await sql<{ table_name: string }>`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('itx_vehicles', 'other_vehicles')`.execute(runtime.db);
  assert.equal(columns.rows.length, 2);
});

test('unauthenticated, non-admin, forged and cross-origin requests cannot mutate through API or MCP', async () => {
  assert.equal((await api('list_workspaces', {}, '')).statusCode, 401);
  assert.equal((await api('create_workspace', { name: 'Denied', code: 'denied' }, userCookie)).statusCode, 403);
  const spoofed = await api('create_workspace', { name: 'Spoofed', code: 'spoofed', userId: adminId }, userCookie);
  assert.equal(spoofed.statusCode, 400);
  for (const url of ['/api/v1/create_workspace', '/mcp']) {
    const response = await runtime.app.inject({ method: 'POST', url,
      headers: { host: '127.0.0.1:4100', cookie: adminCookie, origin: 'https://untrusted.example', 'x-xobject-request': '1' }, payload: {} });
    assert.equal(response.statusCode, 403);
  }
  const missingHeader = await runtime.app.inject({ method: 'POST', url: '/api/v1/list_workspaces',
    headers: { host: '127.0.0.1:4100', cookie: adminCookie }, payload: {} });
  assert.equal(missingHeader.statusCode, 400);
  const deniedMcp = await runtime.app.inject({ method: 'POST', url: '/mcp',
    headers: { host: '127.0.0.1:4100', cookie: userCookie, 'x-xobject-request': '1', accept: 'application/json, text/event-stream' },
    payload: { jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'create_workspace', arguments: { name: 'Denied', code: 'denied' } } } });
  const deniedBody = deniedMcp.headers['content-type']?.includes('text/event-stream')
    ? JSON.parse(deniedMcp.body.split('\n').find(line => line.startsWith('data: '))!.slice(6))
    : deniedMcp.json();
  assert.equal(deniedBody.result.isError, true);
});

test('journal failure rolls back record writes and schema/metadata changes', async () => {
  const ws = await ok('create_workspace', { name: 'Rollback test', code: 'rollback' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Original' });
  await sql`CREATE TRIGGER reject_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Should roll back' })).statusCode, 500);
    assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: { de: 'Geändert' } })).statusCode, 500);
    assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Must roll back' })).statusCode, 500);
    assert.equal((await api('configure_workspace_languages', { workspaceId: ws.id, language: 'de' })).statusCode, 500);
    assert.equal((await api('configure_user_localization', { language: 'de' })).statusCode, 500);
  } finally { await sql`DROP TRIGGER reject_journal ON sys_journal`.execute(runtime.db); }
  const after = await ok('get_record', { objectTypeId: type.id, recordId: record.id });
  assert.equal((await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id).name, 'Rollback test');
  assert.equal(after.keyword, 'Original');
  assert.equal(after.version, 1);
  const fields = await sql`SELECT id FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND technical_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(fields.rows.length, 0);
  const columns = await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'rollback_items' AND column_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(columns.rows.length, 0);
  const tables = await sql`SELECT to_regclass('rollback_rolled_back') AS name`.execute(runtime.db);
  assert.equal((tables.rows[0] as { name: unknown }).name, null);
  const types = await sql`SELECT 1 FROM sys_object_types WHERE workspace_id = ${ws.id}::uuid AND technical_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(types.rows.length, 0);
  const definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.deepEqual(definition.labels, { en: 'Items' });
  const preferences = await sql<{ language: string | null; default_language: string }>`SELECT u.language, w.default_language
    FROM sys_users u CROSS JOIN sys_workspaces w WHERE u.id = ${adminId} AND w.id = ${ws.id}::uuid`.execute(runtime.db);
  assert.equal(preferences.rows[0].language, null);
  assert.equal(preferences.rows[0].default_language, 'en');
});

test('concurrent edits cannot silently overwrite each other', async () => {
  const workspaces = await ok('list_workspaces', {});
  const workspace = workspaces.find((w: { code: string }) => w.code === 'rollback');
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'concurrent', labels: { en: 'Concurrent edits' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Initial' });
  const results = await Promise.all(['First', 'Second'].map(keyword => api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const journal = await journalEntries({ objectTypeId: type.id, recordId: record.id });
  assert.equal(journal.length, 2);
});

test('first-Administrator CLI provisions an empty installation once and signs in without exposing credentials', async () => {
  const name=`xobject_setup_${randomUUID().replaceAll('-','')}`,url=new URL(databaseURL);url.pathname=`/${name}`;
  await sql`CREATE DATABASE ${sql.id(name)}`.execute(runtime.db);
  let instance:ReturnType<typeof buildServer>|undefined;
  try{
    await initializeDatabase(url.href,secret,baseURL);
    const args=['--import','tsx',new URL('../src/cli.ts',import.meta.url).pathname,'create-admin'];
    const env={...process.env,DATABASE_URL:url.href,BETTER_AUTH_SECRET:secret,BASE_URL:baseURL,ADMIN_EMAIL:'cli@example.test',ADMIN_NAME:'CLI Administrator',ADMIN_PASSWORD:'test-password-local-cli'};
    const created=await exec(process.execPath,args,{env});assert.ok(!created.stdout.includes(env.ADMIN_PASSWORD));
    await assert.rejects(()=>exec(process.execPath,args,{env}),/already complete/);
    instance=buildServer({databaseURL:url.href,authSecret:secret,baseURL});
    const signedIn=await instance.app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{host:'127.0.0.1:4100',origin:baseURL},payload:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});
    assert.equal(signedIn.statusCode,200,signedIn.body);
    const user=(await sql<{is_admin:boolean;must_change_password:boolean}>`SELECT is_admin,must_change_password FROM sys_users`.execute(instance.db)).rows[0];assert.equal(user.is_admin,true);assert.equal(user.must_change_password,false);
    assert.equal((await sql`SELECT 1 FROM sys_journal WHERE entity_kind='user' AND field_key='created'`.execute(instance.db)).rows.length,1);
  }finally{await instance?.app.close();await sql`DROP DATABASE ${sql.id(name)} WITH (FORCE)`.execute(runtime.db);}
});

test('sign-out revokes the session for API and MCP', async () => {
  const cookie = await login('admin@example.test', 'test-password-administrator');
  const signOut = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-out',
    headers: { host: '127.0.0.1:4100', origin: baseURL, cookie }, payload: {} });
  assert.equal(signOut.statusCode, 200);
  assert.equal((await api('list_workspaces', {}, cookie)).statusCode, 401);
  const mcp = await runtime.app.inject({ method: 'POST', url: '/mcp',
    headers: { host: '127.0.0.1:4100', cookie, 'x-xobject-request': '1' }, payload: {} });
  assert.equal(mcp.statusCode, 401);
});

test('translated definitions use user/workspace fallback while contents and physical names stay unchanged', async () => {
  const workspace = await ok('create_workspace', { name: 'Languages', code: 'languages', defaultLanguage: 'de' });
  const type = await tool('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', labels: { de: 'Kennzeichen', en: 'Registration' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Lieferwagen' });
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.label, 'Fahrzeuge');
  assert.deepEqual(definition.columns, ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'keyword', 'type', 'status', 'category', 'registration']);
  await tool('configure_user_localization', { language: 'en' });
  definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.label, 'Vehicles');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Registration');
  await tool('set_labels', { kind: 'field', id: field.id, labels: { de: 'Amtliches Kennzeichen' } });
  await tool('set_labels', { kind: 'field', id: field.id, labels: { de: 'Amtliches Kennzeichen' } });
  definition = await tool('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Amtliches Kennzeichen');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Lieferwagen');
  await ok('configure_user_localization', { language: null });
  await tool('configure_workspace_languages', { workspaceId: workspace.id, language: 'en' });
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).label, 'Vehicles');
  const fixedField = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal((await api('set_labels', { kind: 'field', id: fixedField.id, labels: { en: 'Wrong' } })).statusCode, 400);
  for (const invalid of [{}, { fr: 'Véhicules' }, { en: '' }]) {
    assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: invalid })).statusCode, 400);
  }
  assert.equal((await api('configure_user_localization', { language: 'invalid' })).statusCode, 400);
  assert.equal((await api('configure_workspace_languages', { workspaceId: workspace.id, language: 'invalid' })).statusCode, 400);
  const changes = await sql<{ field_id: string; new_value: unknown }>`SELECT field_id, new_value FROM sys_journal
    WHERE entity_id = ${field.id}::uuid AND field_key = 'labels' AND old_value <> 'null'::jsonb`.execute(runtime.db);
  assert.equal(changes.rows.length, 1);
  assert.equal(changes.rows[0].field_id, field.id);
  assert.deepEqual(changes.rows[0].new_value, { de: 'Amtliches Kennzeichen' });
});

test('object/record lists are scoped, localized, paginated and search literal keywords through API and MCP', async () => {
  const workspace = await ok('create_workspace', { code: 'lists', name: 'Lists', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { de: 'Einträge', en: 'Items' } });
  const types = await tool('list_object_types', { workspaceId: workspace.id });
  assert.equal(types.length, 1);
  assert.equal(types[0].id, type.id);
  assert.equal(types[0].label, 'Einträge');
  const first = await ok('create_record', { objectTypeId: type.id, keyword: 'Alpha 100%' });
  await tool('create_record', { objectTypeId: type.id, keyword: 'Beta' });
  const page = await tool('list_records', { objectTypeId: type.id, limit: 1, offset: 0 });
  assert.equal(page.total, 2);
  assert.equal(page.records.length, 1);
  const secondPage = await ok('list_records', { objectTypeId: type.id, limit: 1, offset: 1 });
  assert.equal(secondPage.total, 2);
  assert.notEqual(page.records[0].id, secondPage.records[0].id);
  const search = await ok('list_records', { objectTypeId: type.id, query: 'ALPHA 100%' });
  assert.equal(search.total, 1);
  assert.equal(search.records[0].id, first.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: "' OR 1=1 --" })).total, 0);
  assert.equal((await ok('list_records', { objectTypeId: type.id, offset: 10 })).total, 2);
  for (const input of [{ limit: 0 }, { limit: 101 }, { offset: -1 }]) {
    assert.equal((await api('list_records', { objectTypeId: type.id, ...input })).statusCode, 400);
  }
  assert.equal((await api('list_object_types', { workspaceId: workspace.id }, userCookie)).statusCode, 403);
  assert.equal((await api('list_records', { objectTypeId: type.id }, '')).statusCode, 401);
});

test('record sorting validates fields and applies before pagination identically through API and MCP', async () => {
  const workspace = await ok('create_workspace', { code: 'sorting', name: 'Sorting' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Items' } });
  await ok('create_field', { objectTypeId: type.id, technicalName: 'note', labels: { en: 'Note' } });
  const zulu = await ok('create_record', { objectTypeId: type.id, keyword: 'Zulu', values: { note: 'Alpha' } });
  const alpha = await ok('create_record', { objectTypeId: type.id, keyword: 'Alpha', values: { note: 'Zulu' } });
  const blank = await ok('create_record', { objectTypeId: type.id, keyword: 'Bravo' });
  const args = { objectTypeId: type.id, sortBy: 'keyword', sortDirection: 'asc', limit: 1 };
  const chronological = { ...args, sortBy: 'created_at' };
  const byCreation = await ok('list_records', chronological);
  assert.equal(byCreation.records[0].id, zulu.id);
  assert.deepEqual(await tool('list_records', chronological), byCreation);
  const first = await ok('list_records', args);
  assert.equal(first.records[0].id, alpha.id);
  assert.deepEqual(await tool('list_records', args), first);
  assert.equal((await ok('list_records', { ...args, offset: 1 })).records[0].id, blank.id);
  assert.equal((await ok('list_records', { ...args, sortDirection: 'desc' })).records[0].id, zulu.id);
  for (const direction of ['asc', 'desc']) {
    const page = await ok('list_records', { objectTypeId: type.id, sortBy: 'note', sortDirection: direction });
    assert.deepEqual(page.records.map((record: { id: string }) => record.id), direction === 'asc' ? [zulu.id, alpha.id, blank.id] : [alpha.id, zulu.id, blank.id]);
  }
  const filtered = await ok('list_records', { ...args, query: 'Alpha', sortDirection: 'desc' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.records[0].id, alpha.id);
  // Identical values use record IDs as a deterministic tie-breaker across pages.
  await ok('update_record', { objectTypeId: type.id, recordId: alpha.id, version: alpha.version, values: { note: 'Alpha' } });
  const tied = await ok('list_records', { objectTypeId: type.id, sortBy: 'note', sortDirection: 'asc' });
  assert.deepEqual(tied.records.slice(0, 2).map((record: { id: string }) => record.id), [alpha.id, zulu.id].sort());
  const latest = await ok('list_records', { objectTypeId: type.id });
  assert.equal(latest.records[0].id, alpha.id);
  for (const input of [{ sortBy: 'missing' }, { sortBy: 'created_by' }, { sortBy: 'keyword; DROP TABLE sys_users' }, { sortDirection: 'sideways' }]) {
    assert.equal((await api('list_records', { objectTypeId: type.id, ...input })).statusCode, 400);
  }
});

test('workspace search shares API/MCP behavior, isolates workspaces and treats text literally', async () => {
  const workspace = await ok('create_workspace', { code: 'search', name: 'Search', defaultLanguage: 'de' });
  const other = await ok('create_workspace', { code: 'searchother', name: 'Other' });
  const empty = await ok('create_workspace', { code: 'searchempty', name: 'Empty' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const second = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'notes', labels: { de: 'Notizen' } });
  const outsider = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: other.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Suche 100%_Test' });
  await ok('create_record', { objectTypeId: second.id, keyword: 'Suche ebenfalls' });
  await ok('create_record', { objectTypeId: outsider.id, keyword: 'Suche geheim' });
  const input = { workspaceId: workspace.id, query: 'SUCHE' };
  const result = await ok('search_workspace', input);
  assert.deepEqual(result, await tool('search_workspace', input));
  assert.equal(result.records.length, 2);
  assert.equal(result.records.find((r: { id: string }) => r.id === record.id).objectLabel, 'Fahrzeuge');
  assert.equal(result.records.some((r: { keyword: string }) => r.keyword === 'Suche geheim'), false);
  const literal = await ok('search_workspace', { ...input, query: '100%_' });
  assert.equal(literal.records.length, 1);
  assert.equal(literal.records[0].id, record.id);
  assert.equal((await ok('search_workspace', { ...input, query: "' OR 1=1 --" })).records.length, 0);
  assert.equal((await ok('search_workspace', { ...input, query: 'fahr' })).objectTypes[0].id, type.id);
  assert.equal((await ok('search_workspace', { ...input, query: 'vehicles' })).objectTypes[0].id, type.id);
  const limited = await ok('search_workspace', { ...input, limit: 1 });
  assert.equal(limited.records.length, 1);
  assert.equal(limited.hasMoreRecords, true);
  assert.deepEqual((await ok('search_workspace', { ...input, workspaceId: empty.id })).records, []);
  assert.equal((await api('search_workspace', { ...input, workspaceId: randomUUID() })).statusCode, 404);
  for (const change of [{ query: ' ' }, { limit: 0 }, { limit: 51 }]) assert.equal((await api('search_workspace', { ...input, ...change })).statusCode, 400);
  assert.equal((await api('search_workspace', input, userCookie)).statusCode, 403);
  assert.equal((await api('search_workspace', input, '')).statusCode, 401);
});

test('web deep links serve only the application shell and preserve API/asset errors', { skip: !existsSync(new URL('../../web/dist/index.html', import.meta.url)) }, async () => {
  for (const url of ['/settings', '/w/itx', '/w/itx/recycle-bin', '/w/itx/objects/vehicles?q=sample&sort=keyword&direction=asc&page=2', '/w/itx/objects/vehicles/new', `/w/itx/objects/vehicles/${randomUUID()}`, '/unknown', '/w/itx/review-missing-route']) {
    const response = await runtime.app.inject({ method: 'GET', url, headers: { host: '127.0.0.1:4100', accept: 'text/html' } });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.headers['content-type']!, /text\/html/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.body, /id="root"/);
  }
  for (const url of ['/api/v1/missing', '/api/missing', '/mcp/missing', '/assets/missing.js', '/missing.css', '/w/itx/missing.js']) {
    assert.equal((await runtime.app.inject({ method: 'GET', url, headers: { host: '127.0.0.1:4100', accept: 'text/html' } })).statusCode, 404);
  }
  assert.equal((await runtime.app.inject({ method: 'GET', url: '/settings', headers: { host: '127.0.0.1:4100', accept: 'application/json' } })).statusCode, 404);
  assert.equal((await runtime.app.inject({ method: 'POST', url: '/settings', headers: { host: '127.0.0.1:4100', accept: 'text/html' } })).statusCode, 404);
  assert.equal((await runtime.app.inject({ method: 'GET', url: '/settings', headers: { host: 'wrong.test', accept: 'text/html' } })).statusCode, 400);
});

function classificationFixture() {
  const [typeA, typeB, statusA, statusB, untyped, catA, catB] = Array.from({ length: 7 }, () => randomUUID());
  return { typeA, typeB, statusA, statusB, untyped, catA, catB, config: {
    type: { required: false, defaultId: typeA },
    status: { required: false, defaults: [{ typeId: typeA, statusId: statusA }, { typeId: null, statusId: untyped }] },
    category: { required: false, multiple: true, defaultIds: [catA] },
    options: [
      { id: typeA, kind: 'type', labels: { de: 'Intern', en: 'Internal' }, active: true, typeId: null },
      { id: typeB, kind: 'type', labels: { en: 'External' }, active: true, typeId: null },
      { id: statusA, kind: 'status', labels: { de: 'Offen', en: 'Open' }, active: true, typeId: typeA },
      { id: statusB, kind: 'status', labels: { en: 'Done' }, active: true, typeId: typeB },
      { id: untyped, kind: 'status', labels: { en: 'Unclassified' }, active: true, typeId: null },
      { id: catA, kind: 'category', labels: { en: 'Customer' }, active: true, typeId: null },
      { id: catB, kind: 'category', labels: { en: 'Partner' }, active: true, typeId: null },
    ],
  } as ClassificationRules };
}
async function classificationObject(code: string) {
  const workspace = await ok('create_workspace', { code, name: code });
  return ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Items' } });
}

test('classification defaults, optional values, Type/Status scopes and API/MCP journaling share one backend', async () => {
  const type = await classificationObject('choices');
  const fixture = classificationFixture();
  const { typeA, typeB, statusA, statusB, untyped, catA, catB, config } = fixture;
  const definition = await tool('configure_classification', { objectTypeId: type.id, version: 1, config });
  assert.equal(definition.classification.version, 2);
  assert.equal(definition.fields.filter((field: { kind: string }) => field.kind !== 'text').length, 3);
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Defaults' });
  assert.equal(record.type, typeA); assert.equal(record.status, statusA); assert.deepEqual(record.category, [catA]);
  assert.deepEqual(await tool('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  const none = await tool('create_record', { objectTypeId: type.id, keyword: 'No Type', classification: { type: null, category: [] } });
  assert.equal(none.type, null); assert.equal(none.status, untyped); assert.deepEqual(none.category, []);
  const cleared = await ok('create_record', { objectTypeId: type.id, keyword: 'Explicit empty', classification: { type: null, status: null, category: [] } });
  assert.equal(cleared.status, null);
  for (const classification of [{ type: typeB }, { type: typeB, status: statusA }, { status: untyped }, { category: [randomUUID()] }, { category: [catA, catA] }]) {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification })).statusCode, 400);
  }
  const changed = await tool('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification: { type: typeB, status: statusB, category: [catB, catA] } });
  const journal = await journalEntries({ objectTypeId: type.id, recordId: record.id });
  const entries = journal.slice(-3);
  assert.deepEqual(entries.map((entry: { field_key: string }) => entry.field_key).sort(), ['category', 'status', 'type']);
  assert.equal(new Set(entries.map((entry: { change_id: string }) => entry.change_id)).size, 1);
  assert.equal(new Set(entries.map((entry: { field_id: string }) => entry.field_id)).size, 3);
  assert.equal(entries.find((entry: { field_key: string }) => entry.field_key === 'type').old_value, typeA);
  assert.equal(entries.find((entry: { field_key: string }) => entry.field_key === 'type').new_value, typeB);
  const unchanged = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: changed.version, classification: { category: [catA, catB] } });
  assert.equal(unchanged.version, changed.version);
  assert.equal((await journalEntries({ objectTypeId: type.id, recordId: record.id })).length, journal.length);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 1, config })).statusCode, 409);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config }, userCookie)).statusCode, 403);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config }, '')).statusCode, 401);
  assert.equal((await tool('configure_classification', { objectTypeId: type.id, version: 2, config })).classification.version, 2);
  await ok('configure_user_localization', { language: 'de' });
  assert.equal((await tool('get_object_type', { objectTypeId: type.id })).classification.options.find((option: { id: string }) => option.id === typeA).label, 'Intern');
  await ok('configure_user_localization', { language: 'en' });
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).classification.options.find((option: { id: string }) => option.id === typeA).label, 'Internal');
  await ok('configure_user_localization', { language: null });
  const another = await ok('create_record', { objectTypeId: type.id, keyword: 'Sorting' });
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'type', sortDirection: 'asc', limit: 1 })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'status', sortDirection: 'asc', limit: 1 })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'category', sortDirection: 'asc', limit: 1 })).records[0].id, another.id);

});

test('required fields, changed mappings and single Category mode cannot invalidate existing records', async () => {
  const type = await classificationObject('stricter');
  const { config, typeA, typeB, statusA, catA, catB } = classificationFixture();
  const empty = await ok('create_record', { objectTypeId: type.id, keyword: 'Existing empty' });
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  for (const kind of ['type', 'status', 'category'] as const) {
    const stricter = structuredClone(config);
    stricter[kind].required = true;
    assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: stricter })).statusCode, 400);
  }
  const filled = await ok('update_record', { objectTypeId: type.id, recordId: empty.id, version: empty.version, classification: { type: typeA, status: statusA, category: [catA, catB] } });
  assert.equal(filled.version, 2);
  const single = structuredClone(config); single.category.multiple = false;
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: single })).statusCode, 400);
  const mapped = structuredClone(config); mapped.options.find(option => option.id === statusA)!.typeId = typeB; mapped.status.defaults = [];
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: mapped })).statusCode, 400);
  config.type.required = true; config.status.required = true; config.category.required = true;
  await ok('configure_classification', { objectTypeId: type.id, version: 2, config });
  for (const classification of [{ type: null, status: null }, { status: null }, { category: [] }]) {
    assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Invalid', classification })).statusCode, 400);
  }
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: empty.id })).version, 2);
});

test('renaming/deactivating choices retains identities and assignments; new inactive or foreign choices are rejected', async () => {
  const type = await classificationObject('inactivechoices');
  const other = await classificationObject('foreignchoices');
  const { config, typeA, statusA, catA } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Retained' });
  config.type.defaultId = null; config.status.defaults = []; config.category.defaultIds = [];
  for (const option of config.options) if (new Set<string>([typeA, statusA, catA]).has(option.id)) { option.active = false; option.labels = { en: 'Renamed' }; }
  await tool('configure_classification', { objectTypeId: type.id, version: 2, config });
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, keyword: 'Still retained', classification: { type: typeA, status: statusA, category: [catA] } });
  assert.equal(updated.type, typeA); assert.equal(updated.status, statusA); assert.deepEqual(updated.category, [catA]);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Inactive', classification: { type: typeA, status: statusA, category: [catA] } })).statusCode, 400);
  assert.equal((await api('create_record', { objectTypeId: other.id, keyword: 'Foreign', classification: { type: typeA } })).statusCode, 400);
  assert.equal((await api('configure_classification', { objectTypeId: other.id, version: 1, config })).statusCode, 400);
  const removed = structuredClone(config); removed.options = removed.options.filter(option => option.id !== catA);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config: removed })).statusCode, 400);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Bypass', values: { type: typeA } })).statusCode, 400);
});

test('journal failure rolls back classification configuration and record selections atomically', async () => {
  const type = await classificationObject('classificationrollback');
  const { config, typeB, statusB } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Rollback' });
  const before = await ok('get_object_type', { objectTypeId: type.id });
  const history = await journalEntries({ objectTypeId: type.id, recordId: record.id });
  await sql`CREATE FUNCTION reject_classification_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test journal failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_classification_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_classification_journal()`.execute(runtime.db);
  try {
    const renamed = structuredClone(config); renamed.options[0].labels = { en: 'Rollback label' };
    assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: renamed })).statusCode, 500);
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification: { type: typeB, status: statusB } })).statusCode, 500);
  } finally {
    await sql`DROP TRIGGER reject_classification_journal ON sys_journal`.execute(runtime.db);
    await sql`DROP FUNCTION reject_classification_journal()`.execute(runtime.db);
  }
  assert.deepEqual(await ok('get_object_type', { objectTypeId: type.id }), before);
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual(await journalEntries({ objectTypeId: type.id, recordId: record.id }), history);
});


test('workspace name changes share API/MCP validation and atomic journals without changing identity or tables', async () => {
  const ws = await ok('create_workspace', { name: 'Original workspace', code: 'workspaceprefs', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { de: 'Einträge' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Preserved record' });
  assert.deepEqual(await tool('set_workspace_name', { workspaceId: ws.id, name: '  Renamed workspace  ' }), { workspaceId: ws.id, name: 'Renamed workspace' });
  const updated = (await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.equal(updated.created_by, adminId);
  assert.equal(updated.created_by_name, 'Test Administrator');
  assert.ok(Number.isFinite(Date.parse(updated.created_at)));
  const { created_by, created_by_name, created_at, ...withoutCreation } = updated;
  assert.deepEqual(withoutCreation, { id: ws.id, code: 'workspaceprefs', name: 'Renamed workspace', default_language: 'de', available_languages: ['de', 'en'], label_languages: ['de', 'en'], language_version: 1, time_zone: 'UTC', regional: { ...defaultRegionalSettings, locale: 'de-DE' }, appearance: defaultWorkspaceAppearance, appearance_version: 1, role: 'administrator' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Preserved record');
  const journal = await sql<{ old_value: string; new_value: string; actor_id: string }>`SELECT old_value, new_value, actor_id FROM sys_journal WHERE entity_id = ${ws.id}::uuid AND field_key = 'name' ORDER BY id`.execute(runtime.db);
  assert.equal(journal.rows.length, 2);
  assert.deepEqual(journal.rows[1], { old_value: 'Original workspace', new_value: 'Renamed workspace', actor_id: adminId });
  await ok('set_workspace_name', { workspaceId: ws.id, name: 'Renamed workspace' });
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id = ${ws.id}::uuid AND field_key = 'name'`.execute(runtime.db)).rows.length, 2);
  for (const name of ['', '  ', 'x'.repeat(201)]) assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name })).statusCode, 400);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Wrong', code: 'changed' })).statusCode, 400);
  assert.equal((await api('set_workspace_name', { workspaceId: randomUUID(), name: 'Missing' })).statusCode, 404);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Denied' }, userCookie)).statusCode, 403);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Denied' }, '')).statusCode, 401);
});

test('every business field exposes requiredness, validates writes and preflights stricter rules without losing journal atomicity', async () => {
  const ws = await ok('create_workspace', { name: 'Required fields', code: 'requiredfields' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'reference', labels: { en: 'Reference' }, required: true });
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  const keyword = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal(keyword.required, false);
  await ok('configure_field', { fieldId: keyword.id, required: true });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, true);
  assert.equal((await api('create_record', { objectTypeId: type.id, values: { reference: 'REF' } })).statusCode, 400);
  for (const values of [{}, { reference: null }, { reference: ' \t\n' }]) assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Missing', values })).statusCode, 400);
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Valid', values: { reference: 'REF' } });
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'missing', labels: { en: 'Missing' }, required: true })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: { reference: ' ' } })).statusCode, 400);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, keyword: 'Still valid' });
  await tool('configure_field', { fieldId: field.id, required: false });
  const changed = await ok('get_record', { objectTypeId: type.id, recordId: record.id });
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: changed.version, values: { reference: null } });
  assert.equal((await api('configure_field', { fieldId: field.id, required: true })).statusCode, 400);
  await tool('configure_field', { fieldId: keyword.id, required: false });
  const unnamed = await ok('create_record', { objectTypeId: type.id });
  assert.equal(unnamed.keyword, '');
  assert.equal((await api('configure_field', { fieldId: keyword.id, required: true })).statusCode, 400);
  await initializeDatabase(databaseURL, secret, baseURL);
  definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === keyword.id).required, false);
  const typeField = definition.fields.find((f: { kind: string }) => f.kind === 'type');
  assert.equal((await api('configure_field', { fieldId: typeField.id, required: true })).statusCode, 400);
  assert.equal((await tool('configure_field', { fieldId: typeField.id, required: false })).classification.type.required, false);
  assert.equal((await api('configure_field', { fieldId: field.id, required: true }, userCookie)).statusCode, 403);
  assert.equal((await api('configure_field', { fieldId: randomUUID(), required: false })).statusCode, 404);
  const journals = (await sql<{ old_value: boolean; new_value: boolean }>`SELECT old_value, new_value FROM sys_journal WHERE entity_id = ${keyword.id}::uuid AND field_key = 'required' AND old_value IS NOT NULL AND old_value <> 'null'::jsonb ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(journals, [{ old_value: false, new_value: true }, { old_value: true, new_value: false }]);
  const filled = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'filled', labels: { en: 'Filled' } });
  const filledDef = await ok('get_object_type', { objectTypeId: filled.id });
  const filledKeyword = filledDef.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  await ok('configure_field', { fieldId: filledKeyword.id, required: true });
  await sql`CREATE TRIGGER reject_required_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_field', { fieldId: filledKeyword.id, required: false })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_required_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: filled.id })).fields.find((f: { id: string }) => f.id === filledKeyword.id).required, true);
});

test('field attribute edits save labels and requiredness atomically with a shared change ID', async () => {
  const ws = await ok('create_workspace', { name: 'Field attributes', code: 'fieldattributes' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'note', labels: { en: 'Note' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Record' });
  assert.equal((await api('configure_field', { fieldId: field.id, labels: { en: 'Renamed' }, required: true })).statusCode, 400);
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Note');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, false);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { note: 'Filled' } });
  definition = await tool('configure_field', { fieldId: field.id, labels: { en: 'Renamed' }, required: true });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Renamed');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, true);
  const edits = (await sql<{ field_key: string; change_id: string }>`SELECT field_key, change_id FROM sys_journal WHERE entity_id = ${field.id}::uuid AND old_value IS NOT NULL AND old_value <> 'null'::jsonb ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(edits.map(entry => entry.field_key), ['labels', 'required']);
  assert.equal(edits[0].change_id, edits[1].change_id);
  const keyword = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal((await api('configure_field', { fieldId: keyword.id, labels: { en: 'Forbidden' }, required: false })).statusCode, 400);
  assert.equal((await api('configure_field', { fieldId: field.id, required: false }, userCookie)).statusCode, 403);
});

test('all custom field types round-trip through API/MCP with typed storage, exact amounts, choices and scoped references', async () => {
  const ws = await ok('create_workspace', { name: 'Typed fields', code: 'typedfields' });
  const foreign = await ok('create_workspace', { name: 'Foreign references', code: 'foreignrefs' });
  const group = await tool('create_group', { workspaceId: ws.id, name: 'Team' });
  const foreignGroup = await ok('create_group', { workspaceId: foreign.id, name: 'Other team' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Typed items' } });
  const choice = randomUUID();
  const fields = [
    ['short_text', 'text', {}, 'Hello'], ['notes', 'multiline', { formatted: true }, '**Bold**\nText'],
    ['count_value', 'integer', {}, '9007199254740993'], ['ratio', 'decimal', { scale: 4 }, '12345678901234567890.1234'],
    ['price', 'money', { scale: 2, currency: 'EUR' }, { amount: '12345678901234567890.12', currency: 'USD' }],
    ['enabled', 'boolean', {}, false], ['birthday', 'date', {}, '2024-02-29'], ['appointment', 'datetime', {}, '2026-10-30T12:34:56+02:00'],
    ['selection', 'single_choice', { options: [{ id: choice, labels: { en: 'Choice' }, active: true }] }, choice],
    ['selections', 'multiple_choice', { options: [{ id: randomUUID(), labels: { en: 'Multiple' }, active: true }] }, null],
    ['email_address', 'email', {}, 'person@example.test'], ['phone_number', 'phone', {}, '+442079460018'], ['website', 'url', {}, 'https://example.test/path'],
    ['owner_ref', 'reference', { referenceTarget: 'user', multiple: false }, { kind: 'user', id: adminId }],
    ['team_refs', 'reference', { referenceTarget: 'both', multiple: true }, [{ kind: 'group', id: group.id }, { kind: 'user', id: adminId }]],
  ] as const;
  for (const [technicalName, kind, config] of fields) await tool('create_field', { objectTypeId: type.id, technicalName, kind, config, labels: { en: technicalName } });
  const definition = await ok('get_object_type', { objectTypeId: type.id });
  const multi = definition.fields.find((field: { technicalName: string }) => field.technicalName === 'selections');
  const input = Object.fromEntries(fields.map(([name, , , value]) => [name, value]));
  input.selections = [multi.config.options[0].id] as never;
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Typed record', values: input });
  assert.equal(record.count_value, '9007199254740993');
  assert.equal(record.ratio, '12345678901234567890.1234');
  assert.deepEqual(record.price, { amount: '12345678901234567890.12', currency: 'USD' });
  assert.equal(record.enabled, false);
  assert.equal(record.birthday, '2024-02-29');
  assert.equal(record.appointment, '2026-10-30T10:34:56.000Z');
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual((await ok('list_records', { objectTypeId: type.id })).records[0], record);
  const noOp = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: input });
  assert.equal(noOp.version, record.version);
  const columns = (await sql<{ column_name: string; data_type: string }>`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'typedfields_items'`.execute(runtime.db)).rows;
  for (const [name, expected] of [['count_value', 'bigint'], ['ratio', 'numeric'], ['enabled', 'boolean'], ['birthday', 'date'], ['appointment', 'timestamp with time zone'], ['selection', 'uuid'], ['selections', 'ARRAY'], ['price', 'jsonb'], ['team_refs', 'jsonb']]) assert.equal(columns.find(column => column.column_name === name)?.data_type, expected);
  for (const values of [
    { count_value: '9223372036854775808' }, { count_value: '1.2' }, { ratio: '1.12345' }, { enabled: 'false' }, { birthday: '2025-02-29' }, { appointment: '2026-10-30T12:00:00' }, { appointment: '2026-10-30T12:00:00.1234Z' },
    { price: { amount: '1.234', currency: 'EUR' } }, { price: { amount: '1', currency: 'XYZ' } }, { email_address: 'invalid' }, { website: 'javascript:alert(1)' }, { phone_number: '1234' },
    { selection: randomUUID() }, { selections: [multi.config.options[0].id, multi.config.options[0].id] }, { owner_ref: { kind: 'group', id: group.id } }, { team_refs: [{ kind: 'group', id: foreignGroup.id }] },
  ]) assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values })).statusCode, 400, JSON.stringify(values));
  await ok('create_record', { objectTypeId: type.id, keyword: 'Euro', values: { price: { amount: '100', currency: 'EUR' } } });
  await ok('create_record', { objectTypeId: type.id, keyword: 'Small USD', values: { price: { amount: '1', currency: 'USD' } } });
  assert.deepEqual((await ok('list_records', { objectTypeId: type.id, sortBy: 'price', sortDirection: 'asc' })).records.map((row: { keyword: string }) => row.keyword), ['Euro', 'Small USD', 'Typed record']);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'owner_ref', sortDirection: 'asc' })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'selection', sortDirection: 'asc' })).records[0].id, record.id);
  const principals = await tool('list_field_principals', { workspaceId: ws.id });
  assert.ok(principals.some((entry: { id: string }) => entry.id === group.id));
  assert.ok(!principals.some((entry: { id: string }) => entry.id === foreignGroup.id));
  const selection = definition.fields.find((field: { technicalName: string }) => field.technicalName === 'selection');
  await ok('configure_field', { fieldId: selection.id, required: false, config: { options: [{ id: choice, labels: { en: 'Renamed' }, active: false }] } });
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: { selection: choice } });
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Inactive', values: { selection: choice } })).statusCode, 400);
  assert.equal((await api('configure_field', { fieldId: selection.id, required: false, config: { options: [] } })).statusCode, 400);
});

test('safe field conversions preflight every row, preserve historical journals and roll back schema/values on errors', async () => {
  const ws = await ok('create_workspace', { name: 'Conversions', code: 'conversions' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Conversion items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'amount', labels: { en: 'Amount' } });
  const first = await ok('create_record', { objectTypeId: type.id, keyword: 'First', values: { amount: '12' } });
  const second = await ok('create_record', { objectTypeId: type.id, keyword: 'Second', values: { amount: '0013' } });
  assert.equal((await api('configure_field', { fieldId: field.id, kind: 'integer', required: false, labels: { en: 'Should roll back' } })).statusCode, 400);
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).fields.find((item: { id: string }) => item.id === field.id).kind, 'text');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: first.id })).version, 1);
  await ok('update_record', { objectTypeId: type.id, recordId: second.id, version: 1, values: { amount: '13' } });
  await tool('configure_field', { fieldId: field.id, kind: 'integer', required: true });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: first.id })).amount, '12');
  const integerColumn = (await sql<{ data_type: string }>`SELECT data_type FROM information_schema.columns WHERE table_name = 'conversions_items' AND column_name = 'amount'`.execute(runtime.db)).rows[0];
  assert.equal(integerColumn.data_type, 'bigint');
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: first.id, version: 1, values: { amount: '14' } })).statusCode, 409);
  const convertedRecord = await ok('get_record', { objectTypeId: type.id, recordId: first.id });
  assert.ok(convertedRecord.version > 1);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: first.id, version: convertedRecord.version, values: { amount: 'bad' } })).statusCode, 400);
  await sql`CREATE TRIGGER reject_conversion_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_field', { fieldId: field.id, kind: 'decimal', config: { scale: 2 }, required: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_conversion_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).fields.find((item: { id: string }) => item.id === field.id).kind, 'integer');
  assert.equal((await sql<{ data_type: string }>`SELECT data_type FROM information_schema.columns WHERE table_name = 'conversions_items' AND column_name = 'amount'`.execute(runtime.db)).rows[0].data_type, 'bigint');
  const beforeJournal = await journalEntries({ objectTypeId: type.id, recordId: first.id });
  assert.equal(beforeJournal.find((entry: { field_key: string; old_value: unknown }) => entry.field_key === 'amount' && entry.old_value === null).new_value, '12');
  const multi = await ok('create_field', { objectTypeId: type.id, technicalName: 'choices', kind: 'multiple_choice', config: { options: [{ id: randomUUID(), labels: { en: 'A' }, active: true }, { id: randomUUID(), labels: { en: 'B' }, active: true }] }, labels: { en: 'Choices' } });
  const def = await ok('get_object_type', { objectTypeId: type.id });
  const choiceField = def.fields.find((item: { id: string }) => item.id === multi.id);
  const current = await ok('get_record', { objectTypeId: type.id, recordId: first.id });
  await ok('update_record', { objectTypeId: type.id, recordId: first.id, version: current.version, values: { choices: choiceField.config.options.map((option: { id: string }) => option.id) } });
  assert.equal((await api('configure_field', { fieldId: multi.id, kind: 'single_choice', config: choiceField.config, required: false })).statusCode, 400);
});


test('administrator flags cannot be set by profile input and authorization reads revocation immediately', async () => {
  const ordinary = (await sql<{ id: string; is_admin: boolean }>`SELECT id, is_admin FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  assert.equal(ordinary.is_admin, false);
  for (const flags of [{ isAdmin: true }, { is_admin: true }, { isAdmin: true, is_admin: true }]) {
    const response = await api('set_user_profile', { name: 'Test User', ...flags }, userCookie);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal((await sql<{ is_admin: boolean }>`SELECT is_admin FROM sys_users WHERE id = ${ordinary.id}`.execute(runtime.db)).rows[0].is_admin, false);
    assert.deepEqual((await api('list_workspaces', {}, userCookie)).json(), []);
    assert.deepEqual((await api('get_access_context', {}, userCookie)).json(), { isAdmin: false });
  }
  const session = await runtime.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { host: '127.0.0.1:4100', cookie: adminCookie } });
  assert.equal(session.statusCode, 200);
  assert.equal(Object.hasOwn(session.json().user, 'isAdmin'), false);
  assert.equal(Object.hasOwn(session.json().user, 'is_admin'), false);
  await sql`UPDATE sys_users SET is_admin = false WHERE id = ${adminId}`.execute(runtime.db);
  try {
    assert.deepEqual((await api('list_workspaces', {})).json(), []);
    assert.equal((await api('create_workspace', { name: 'Revoked', code: 'revoked' })).statusCode, 403);
    assert.deepEqual(await tool('get_access_context', {}), { isAdmin: false });
  } finally { await sql`UPDATE sys_users SET is_admin = true WHERE id = ${adminId}`.execute(runtime.db); }
  const before = (await sql`SELECT id, is_admin FROM sys_users ORDER BY id`.execute(runtime.db)).rows;
  await initializeDatabase(databaseURL, secret, baseURL);
  assert.deepEqual((await sql`SELECT id, is_admin FROM sys_users ORDER BY id`.execute(runtime.db)).rows, before);
  assert.equal((await api('list_workspaces', {})).statusCode, 200);
});

test('manual choice ordering persists through API/MCP with per-field journals and unchanged records', async () => {
  const type = await classificationObject('orderedchoices');
  const { config, typeA, typeB, statusA, statusB, catA, catB } = classificationFixture();
  const secondStatus = randomUUID();
  config.options.push({ id: secondStatus, kind: 'status', labels: { en: 'Review' }, active: true, typeId: typeA });
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Keep selections' });
  const recordJournal = await journalEntries({ objectTypeId: type.id, recordId: record.id });
  const reordered = structuredClone(config);
  reordered.options = moveClassificationOption(reordered.options, typeB, typeA);
  reordered.options = moveClassificationOption(reordered.options, secondStatus, statusA);
  reordered.options = moveClassificationOption(reordered.options, catB, catA);
  assert.equal(moveClassificationOption(reordered.options, statusA, statusB), reordered.options, 'Status cannot be dragged across scopes');
  assert.equal(moveClassificationOption(reordered.options, catA, typeA), reordered.options, 'Kinds cannot be mixed');
  const result = await tool('configure_classification', { objectTypeId: type.id, version: 2, config: reordered });
  assert.deepEqual(result.classification.options.map((option: { id: string }) => option.id), reordered.options.map(option => option.id));
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).classification, result.classification);
  assert.equal(result.classification.version, 3);
  assert.equal(result.classification.type.defaultId, typeA);
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual(await journalEntries({ objectTypeId: type.id, recordId: record.id }), recordJournal);
  const fieldIds = result.fields.filter((field: { technicalName: string }) => ['type', 'status', 'category'].includes(field.technicalName)).map((field: { id: string }) => field.id);
  const entries = (await sql<{ field_id: string; change_id: string; old_value: string[]; new_value: string[] }>`SELECT field_id, change_id, old_value, new_value FROM sys_journal WHERE entity_id = ANY(${fieldIds}::uuid[]) AND field_key = 'option_order' AND old_value <> '[]'::jsonb`.execute(runtime.db)).rows;
  assert.equal(entries.length, 3); assert.equal(new Set(entries.map(entry => entry.change_id)).size, 1);
  for (const entry of entries) { assert.deepEqual([...entry.old_value].sort(), [...entry.new_value].sort()); assert.notDeepEqual(entry.old_value, entry.new_value); }
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config })).statusCode, 409);
  assert.equal((await ok('configure_classification', { objectTypeId: type.id, version: 3, config: reordered })).classification.version, 3);
  await sql`CREATE FUNCTION reject_order_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test order failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_order_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_order_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_order_journal ON sys_journal`.execute(runtime.db); await sql`DROP FUNCTION reject_order_journal()`.execute(runtime.db); }
  assert.deepEqual((await tool('get_object_type', { objectTypeId: type.id })).classification, result.classification);
});

test('standard fields are opt-in, can be added atomically through API/MCP and stay absent after repeated initialization', async () => {
  const ws = await ok('create_workspace', { name: 'Optional standards', code: 'optionalstandards' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'bare', labels: { en: 'Bare' } });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  assert.deepEqual(def.fields, []);
  assert.deepEqual(def.columns, ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version']);
  const record = await tool('create_record', { objectTypeId: type.id });
  assert.equal(record.keyword, record.id); for(const key of ['type','status','category'])assert.equal(Object.hasOwn(record,key),false);
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: record.id, sortBy: 'id' })).total, 1);
  assert.equal((await tool('search_workspace', { workspaceId: ws.id, query: record.id })).records[0].id, record.id);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Missing field' })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, classification: { type: null } })).statusCode, 400);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 1, config: classificationFixture().config })).statusCode, 400);
  await initializeDatabase(databaseURL, secret, baseURL);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).fields, []);for(const key of ['type','status','category'])assert.equal(Object.hasOwn(record,key),false);
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'keyword' }, userCookie)).statusCode, 403);
  await sql`CREATE TRIGGER reject_standard_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_standard_journal ON sys_journal`.execute(runtime.db); }
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).columns, def.columns);
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'category' });
  assert.deepEqual(def.fields.map((field: { technicalName: string }) => field.technicalName), ['category']);
  const categoryConfig = { type: { required: false, defaultId: null }, status: { required: false, defaults: [] }, category: { required: false, multiple: false, defaultIds: [] }, options: [] };
  assert.equal((await ok('configure_classification', { objectTypeId: type.id, version: 1, config: categoryConfig })).classification.version, 1);
  await initializeDatabase(databaseURL, secret, baseURL);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).fields.map((field: { technicalName: string }) => field.technicalName), ['category']);
  def = await ok('add_standard_field', { objectTypeId: type.id, field: 'type_status' });
  assert.deepEqual(def.fields.map((field: { technicalName: string }) => field.technicalName), ['category', 'type', 'status']);
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 409);
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'keyword' });
  assert.equal(def.fields.length, 4); assert.ok(def.fields.every((field: { required: boolean }) => !field.required));
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).version, 1);
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Now named', classification: { type: null, status: null, category: [] } });
  assert.equal(updated.keyword, 'Now named');
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: 'Now named', sortBy: 'keyword' })).total, 1);
  const history = (await sql<{ change_id: string }>`SELECT change_id FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'field' AND field_key = 'technical_name' AND new_value IN ('"type"'::jsonb, '"status"'::jsonb)`.execute(runtime.db)).rows;
  assert.equal(history.length, 2); assert.equal(new Set(history.map(entry => entry.change_id)).size, 1);
  const pair = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'pair', labels: { en: 'Pair only' }, standardFields: ['type_status'] });
  const pairConfig = classificationFixture().config;
  pairConfig.options = pairConfig.options.filter(option => option.kind !== 'category'); pairConfig.category.defaultIds = []; pairConfig.category.multiple = false;
  await tool('configure_classification', { objectTypeId: pair.id, version: 1, config: pairConfig });
  assert.equal((await ok('create_record', { objectTypeId: pair.id })).type, pairConfig.type.defaultId);
});

test('unused Types and Statuses can be deleted with journals, while record/history references and identities stay protected', async () => {
  const type = await classificationObject('deletechoices');
  const { config, typeA, typeB, statusA, statusB } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Referenced' });
  const def = await tool('get_object_type', { objectTypeId: type.id });
  assert.equal(def.classification.options.find((option: { id: string }) => option.id === statusA).canDelete, false);
  assert.equal(def.classification.options.find((option: { id: string }) => option.id === statusB).canDelete, true);
  const removeTypeOnly = structuredClone(config); removeTypeOnly.options = removeTypeOnly.options.filter(option => option.id !== typeB);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removeTypeOnly })).statusCode, 400);
  const used = structuredClone(config); used.options = used.options.filter(option => option.id !== statusA); used.status.defaults = [];
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: used })).statusCode, 400);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, classification: { type: null, status: null } });
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: used })).statusCode, 400, 'Historical references also protect choices');
  const removed = structuredClone(config); removed.options = removed.options.filter(option => !new Set<string>([typeB, statusB]).has(option.id));
  await sql`CREATE TRIGGER reject_delete_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removed })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_delete_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).classification.options.length, config.options.length);
  const result = await tool('configure_classification', { objectTypeId: type.id, version: 2, config: removed });
  assert.equal(result.classification.version, 3);
  assert.equal(result.classification.options.length, config.options.length - 2);
  const entries = (await sql<{ change_id: string; old_value: { id: string }; new_value: unknown }>`SELECT change_id, old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND field_key = 'deleted'`.execute(runtime.db)).rows;
  assert.equal(entries.length, 2); assert.equal(new Set(entries.map(entry => entry.change_id)).size, 1);
  assert.deepEqual(entries.map(entry => entry.old_value.id).sort(), [typeB, statusB].sort()); assert.ok(entries.every(entry => entry.new_value === null));
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config })).statusCode, 400, 'Deleted identities cannot be reused');
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removed })).statusCode, 409);
  const final = structuredClone(removed); final.options = final.options.filter(option => option.id !== typeA); final.type.defaultId = null; final.status.defaults = []; final.options = final.options.filter(option => option.id !== statusA);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config: final })).statusCode, 400);
});

test('standard field labels and technical names are reserved even when optional fields are absent', async () => {
  const ws = await ok('create_workspace', { name: 'Reserved labels', code: 'reservedlabels' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  for (const name of ['keyword', 'type', 'status', 'category', 'typ', 'stichwort', 'kategorie']) assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: name, labels: { en: 'Custom' } })).statusCode, 400);
  for (const label of ['Keyword', 'Stichwort', 'Typ', 'Type', 'STATUS', 'Kategorie', 'Category', '  type  ', 'Ｋｅｙｗｏｒｄ']) assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'custom', labels: { en: label } })).statusCode, 400);
  assert.deepEqual((await tool('get_object_type', { objectTypeId: type.id })).fields, []);
  const custom = await ok('create_field', { objectTypeId: type.id, technicalName: 'custom', labels: { de: 'Eigene Angabe', en: 'Custom detail' } });
  assert.equal((await api('set_labels', { kind: 'field', id: custom.id, labels: { de: 'Status' } })).statusCode, 400);
  const error = await client.callTool({ name: 'configure_field', arguments: { fieldId: custom.id, required: true, kind: 'integer', labels: { en: 'Custom detail', de: 'Kategorie' } } });
  assert.equal(error.isError, true);
  const after = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(after.fields[0].kind, 'text'); assert.equal(after.fields[0].required, false); assert.equal(after.fields[0].labels.de, 'Eigene Angabe');
  assert.equal((await tool('add_standard_field', { objectTypeId: type.id, field: 'keyword' })).fields.length, 2);
});

test('instance Administrators assign workspace roles; users read settings and Designers configure only their own workspace through API/MCP', async () => {
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await ok('create_workspace', { name: 'Role workspace', code: 'roles' });
  const other = await ok('create_workspace', { name: 'Other workspace', code: 'otherroles' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' }, standardFields: ['keyword'] });
  const foreign = await ok('create_object_type', { workspaceId: other.id, technicalName: 'items', labels: { en: 'Other' }, standardFields: ['keyword'] });
  const foreignDef = await ok('get_object_type', { objectTypeId: foreign.id });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Private content' });
  const userRequest = (operation: Operation, payload: unknown) => api(operation, payload, userCookie);
  async function userTool(operation: Operation, args: unknown) {
    const response = await runtime.app.inject({ method: 'POST', url: '/mcp', headers: { host: '127.0.0.1:4100', cookie: userCookie, 'x-xobject-request': '1', accept: 'application/json, text/event-stream' }, payload: { jsonrpc: '2.0', id: 913, method: 'tools/call', params: { name: operation, arguments: args } } });
    assert.equal(response.statusCode, 200, response.body);
    const envelope = response.headers['content-type']?.includes('text/event-stream')
      ? JSON.parse(response.body.split('\n').find(line => line.startsWith('data: '))!.slice(6)) : response.json();
    return envelope.result;
  }
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 403);
  await tool('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: null });
  assert.deepEqual((await userRequest('list_workspaces', {})).json().map((item: { id: string; role: string }) => [item.id, item.role]), [[ws.id, 'user']]);
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 200);
  assert.equal((await userRequest('list_workspace_members', { workspaceId: ws.id })).statusCode, 200);
  assert.equal((await userRequest('list_object_types', { workspaceId: other.id })).statusCode, 403);
  assert.equal((await userRequest('get_object_type', { objectTypeId: foreign.id })).statusCode, 403);
  assert.equal((await userRequest('configure_user_localization', { language: 'de' })).statusCode, 200);
  for (const [operation, payload] of [
    ['set_workspace_name', { workspaceId: ws.id, name: 'Denied' }], ['configure_workspace_languages', { workspaceId: ws.id, language: 'en' }],
    ['create_object_type', { workspaceId: ws.id, technicalName: 'denied', labels: { en: 'Denied' } }], ['add_standard_field', { objectTypeId: type.id, field: 'category' }],
    ['create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } }], ['set_labels', { kind: 'object_type', id: type.id, labels: { en: 'Denied' } }],
    ['configure_field', { fieldId: (await ok('get_object_type', { objectTypeId: type.id })).fields[0].id, required: false }],
  ] as [Operation, unknown][]) assert.equal((await userRequest(operation, payload)).statusCode, 403);
  assert.equal((await userTool('create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } })).isError, true);
  assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: null })).statusCode, 409);
  await sql`CREATE TRIGGER reject_membership_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_membership_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await userRequest('list_workspaces', {})).json()[0].role, 'user');
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  assert.equal((await userRequest('list_workspaces', {})).json()[0].role, 'designer');
  assert.equal((await userRequest('set_workspace_name', { workspaceId: ws.id, name: 'Designer workspace' })).statusCode, 200);
  assert.equal((await userRequest('configure_workspace_languages', { workspaceId: ws.id, language: 'de' })).statusCode, 200);
  const newField = await userTool('create_field', { objectTypeId: type.id, technicalName: 'detail', labels: { en: 'Detail' } }); assert.notEqual(newField.isError, true);
  const fieldId = JSON.parse(newField.content[0].text).id;
  assert.equal((await userRequest('configure_field', { fieldId, required: false, labels: { de: 'Angabe', en: 'Detail' } })).statusCode, 200);
  assert.equal((await userRequest('set_labels', { kind: 'object_type', id: type.id, labels: { en: 'Designer items' } })).statusCode, 200);
  assert.equal((await userRequest('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 200);
  assert.equal((await userRequest('add_standard_field', { objectTypeId: type.id, field: 'category' })).statusCode, 200);
  assert.equal((await userRequest('configure_classification', { objectTypeId: type.id, version: 1, config: classificationFixture().config })).statusCode, 200);
  assert.equal((await userRequest('create_group', { workspaceId: ws.id, name: 'Team' })).statusCode, 200);
  assert.equal((await userRequest('create_object_type', { workspaceId: ws.id, technicalName: 'designed', labels: { en: 'Designed' } })).statusCode, 200);
  assert.equal((await userRequest('set_labels', { kind: 'field', id: foreignDef.fields[0].id, labels: { en: 'Foreign' } })).statusCode, 403);
  assert.equal((await userRequest('configure_field', { fieldId: foreignDef.fields[0].id, required: false })).statusCode, 403);
  assert.equal((await userRequest('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'designer' })).statusCode, 403);
  assert.equal((await userRequest('list_users', {})).statusCode, 403);
  for (const [operation, payload] of [['get_record', { objectTypeId: type.id, recordId: record.id }], ['list_records', { objectTypeId: type.id }], ['list_record_journal', { objectTypeId: type.id, recordId: record.id }], ['create_record', { objectTypeId: type.id, keyword: 'Denied' }], ['update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Denied' }], ] as [Operation, unknown][]) assert.equal((await userRequest(operation, payload)).statusCode, 403, 'Designer does not grant content rights');
  const permittedSearch=await userRequest('search_workspace',{workspaceId:ws.id,query:'Private'});assert.equal(permittedSearch.statusCode,200);assert.equal(permittedSearch.json().records.length,0,'Designer sees no ungranted contents');
  await tool('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: 'designer' });
  assert.equal((await userTool('create_field', { objectTypeId: type.id, technicalName: 'revoked', labels: { en: 'Revoked' } })).isError, true);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'user' });
  assert.deepEqual((await userRequest('list_workspaces', {})).json(), []);
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 403);
  assert.ok((await ok('list_workspaces', {})).every((item: { role: string }) => item.role === 'administrator'));
  assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: adminId, role: 'user', expectedRole: null })).statusCode, 400);
  const entries = (await sql<{ old_value: string | null; new_value: string | null }>`SELECT old_value, new_value FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND entity_kind = 'workspace_member' ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(entries, [{ old_value: null, new_value: 'user' }, { old_value: 'user', new_value: 'designer' }, { old_value: 'designer', new_value: 'user' }, { old_value: 'user', new_value: null }]);
});

test('field lifecycle preserves used values/history, supports preflighted reactivation and deletes only unused storage', async () => {
  const type = await classificationObject('fieldlife');
  const used = await ok('create_field', { objectTypeId: type.id, technicalName: 'amount', kind: 'integer', labels: { en: 'Amount' }, required: true });
  const empty = await ok('create_field', { objectTypeId: type.id, technicalName: 'spare', labels: { en: 'Spare' } });
  const bool = await ok('create_field', { objectTypeId: type.id, technicalName: 'flag', kind: 'boolean', labels: { en: 'Flag' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Keep', values: { amount: '0', flag: false } });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(def.fields.find((field: { id: string }) => field.id === used.id).canDelete, false);
  assert.equal(def.fields.find((field: { id: string }) => field.id === bool.id).canDelete, false);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted' })).statusCode, 400);
  await tool('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'inactive' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).amount, '0');
  const newRecord = await ok('create_record', { objectTypeId: type.id, keyword: 'No amount' });
  assert.equal(newRecord.amount, null);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { amount: '5' } })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'inactive', state: 'active' })).statusCode, 400);
  await ok('configure_field', { fieldId: used.id, required: false });
  await ok('set_definition_state', { kind: 'field', id: used.id, expectedState: 'inactive', state: 'active' });
  const changed = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { amount: null } });
  assert.equal(changed.amount, null);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400, 'Old values remain a usage reference');
  await sql`CREATE VIEW lifecycle_field_dependency AS SELECT spare FROM fieldlife_items`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 409); }
  finally { await sql`DROP VIEW lifecycle_field_dependency`.execute(runtime.db); }
  await sql`CREATE TRIGGER reject_lifecycle_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_lifecycle_journal ON sys_journal`.execute(runtime.db); }
  assert.ok((await ok('get_object_type', { objectTypeId: type.id })).columns.includes('spare'));
  await tool('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(!def.columns.includes('spare')); assert.ok(!def.fields.some((field: { id: string }) => field.id === empty.id));
  assert.equal(def.historicalFields.find((field: { id: string }) => field.id === empty.id).label, 'Spare');
  const replacement = await ok('create_field', { objectTypeId: type.id, technicalName: 'spare', labels: { en: 'New spare' } });
  assert.notEqual(replacement.id, empty.id);
  assert.equal((await api('configure_field', { fieldId: empty.id, required: false })).statusCode, 404);
  const journal = await tool('get_definition_journal', { objectTypeId: type.id });
  assert.ok(journal.some((entry: { field_id: string; new_value: unknown }) => entry.field_id === empty.id && entry.new_value === 'deleted'));
  assert.equal((await journalEntries({ objectTypeId: type.id, recordId: record.id })).find((entry: { field_id: string }) => entry.field_id === used.id).new_value, '0');
});

test('object lifecycle hides inactive objects from normal lists, preserves readable records and retains deleted metadata', async () => {
  const ws = await ok('create_workspace', { name: 'Lifecycle', code: 'objectlife' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' }, standardFields: ['keyword'] });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Preserved' });
  await tool('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' });
  assert.equal((await ok('list_object_types', { workspaceId: ws.id })).length, 0);
  assert.equal((await ok('list_object_types', { workspaceId: ws.id, includeInactive: true }))[0].state, 'inactive');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Preserved');
  assert.equal((await ok('search_workspace', { workspaceId: ws.id, query: 'Preserved' })).records.length, 0);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Denied' })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Denied' })).statusCode, 400);
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'active' })).statusCode, 409);
  await ok('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'inactive', state: 'active' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).version, 1);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
  await runtime.db.transaction().execute(async tx=>{await sql`DELETE FROM objectlife_items WHERE id = ${record.id}::uuid`.execute(tx);await sql`DELETE FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${record.id}::uuid`.execute(tx);});
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400, 'Historical records protect the type');
  const empty = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'empty', labels: { en: 'Unused' }, standardFields: ['type_status', 'category'] });
  await sql`CREATE TRIGGER reject_object_delete_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_object_delete_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'active');
  await sql`CREATE VIEW lifecycle_type_dependency AS SELECT * FROM objectlife_empty`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 409); }
  finally { await sql`DROP VIEW lifecycle_type_dependency`.execute(runtime.db); }
  await tool('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true });
  assert.equal((await sql<{ exists: string | null }>`SELECT to_regclass('objectlife_empty')::text AS exists`.execute(runtime.db)).rows[0].exists, null);
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'deleted');
  assert.ok((await ok('list_object_types', { workspaceId: ws.id, includeDeleted: true })).some((item: { id: string }) => item.id === empty.id));
  const replacement = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'empty', labels: { en: 'Replacement' } }); assert.notEqual(replacement.id, empty.id);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: empty.id })).columns, []);
  assert.ok((await tool('get_definition_journal', { objectTypeId: empty.id })).some((entry: { field_key: string; new_value: string }) => entry.field_key === 'state' && entry.new_value === 'deleted'));
  await initializeDatabase(databaseURL, secret, baseURL);
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'deleted');
  assert.deepEqual((await ok('get_object_type', { objectTypeId: replacement.id })).fields, []);
});

test('standard-field lifecycle keeps Type/Status together, resets deleted input aids and obeys workspace/protection rights', async () => {
  const type = await classificationObject('standardlife');
  const fixture = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config: fixture.config });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  const typeField = def.fields.find((field: { technicalName: string }) => field.technicalName === 'type');
  await ok('set_definition_state', { kind: 'field', id: typeField.id, expectedState: 'active', state: 'inactive' });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(def.fields.filter((field: { kind: string }) => ['type', 'status'].includes(field.kind)).every((field: { state: string }) => field.state === 'inactive'));
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'No pair' }); assert.equal(record.type, null); assert.equal(record.status, null);
  assert.equal((await api('create_record', { objectTypeId: type.id, classification: { type: fixture.typeA } })).statusCode, 400);
  await tool('set_definition_state', { kind: 'field', id: typeField.id, expectedState: 'inactive', state: 'deleted', confirm: true });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(!def.columns.includes('type') && !def.columns.includes('status')); assert.equal(def.classification.type.defaultId, null);
  assert.ok(!def.classification.options.some((option: { kind: string }) => ['type', 'status'].includes(option.kind)));
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'type_status' });
  assert.notEqual(def.fields.find((field: { technicalName: string }) => field.technicalName === 'type').id, typeField.id);
  const emptyType = await classificationObject('protectedlife');
  const protectedField = (await ok('get_object_type', { objectTypeId: emptyType.id })).fields[0];
  await sql`UPDATE sys_fields SET is_protected = true WHERE id = ${protectedField.id}::uuid`.execute(runtime.db);
  assert.equal((await api('set_definition_state', { kind: 'field', id: protectedField.id, expectedState: 'active', state: 'inactive' })).statusCode, 403);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: emptyType.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 403);
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const wsId = def.workspaceId;
  await ok('set_workspace_member', { workspaceId: wsId, userId: ordinary.id, role: 'user', expectedRole: null });
  assert.equal((await api('get_definition_journal', { objectTypeId: type.id }, userCookie)).statusCode, 200);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: wsId, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 200);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: emptyType.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 403);
});


test('empty classification-only records retain creation history through API/MCP and prevent definition deletion', async () => {
  const ws = await ok('create_workspace', { name: 'Empty record history', code: 'emptyhistory' });
  for (const [index, create] of [ok, tool].entries()) {
    const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: `items_${index}`, labels: { en: 'Items' }, standardFields: ['type_status', 'category'] });
    const record = await create('create_record', { objectTypeId: type.id });
    const journal = await journalEntries({ objectTypeId: type.id, recordId: record.id });
    assert.equal(journal.length, 1);
    assert.equal(journal[0].field_key, 'created');
    assert.equal(journal[0].field_id, null);
    assert.equal(journal[0].new_value, true);
    await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version });
    assert.deepEqual(await journalEntries({ objectTypeId: type.id, recordId: record.id }), journal);
    await runtime.db.transaction().execute(async tx=>{await sql`DELETE FROM ${sql.table(`emptyhistory_items_${index}`)} WHERE id = ${record.id}::uuid`.execute(tx);await sql`DELETE FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${record.id}::uuid`.execute(tx);});
    assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
    assert.equal((await ok('get_object_type', { objectTypeId: type.id })).canDelete, false);
  }
});

test('account security exposes only own active session metadata without credentials through API/MCP', async () => {
  const own = await ok('get_account_security', {});
  assert.equal(own.hasPassword, true);
  assert.equal(own.sessions.filter((session: { current: boolean }) => session.current).length, 1);
  assert.deepEqual(await tool('get_account_security', {}), own);
  const regular = (await api('get_account_security', {}, userCookie)).json();
  assert.ok(regular.sessions.length > 0);
  assert.ok(regular.sessions.every((session: { id: string }) => !own.sessions.some((other: { id: string }) => other.id === session.id)));
  const allowed = ['id', 'current', 'createdAt', 'updatedAt', 'expiresAt', 'ipAddress', 'userAgent'].sort();
  for (const session of own.sessions) assert.deepEqual(Object.keys(session).sort(), allowed);
  assert.equal((await api('get_account_security', { userId: adminId }, userCookie)).statusCode, 400);
  assert.equal((await api('get_account_security', {}, '')).statusCode, 401);
  const expiredCookie = await login('admin@example.test', 'test-password-administrator');
  const expiredId = (await api('get_account_security', {}, expiredCookie)).json().sessions.find((session: { current: boolean }) => session.current).id;
  await sql`UPDATE sys_sessions SET expires_at = now() - interval '1 minute' WHERE id = ${expiredId}`.execute(runtime.db);
  assert.ok(!(await ok('get_account_security', {})).sessions.some((session: { id: string }) => session.id === expiredId));
  assert.equal((await api('get_account_security', {}, expiredCookie)).statusCode, 401);

  for (const path of ['update-user', 'list-sessions', 'list-accounts', 'change-password', 'revoke-session', 'revoke-sessions', 'revoke-other-sessions', 'change-password/']) {
    const response = await runtime.app.inject({ method: path.startsWith('list-') ? 'GET' : 'POST', url: `/api/auth/${path}`, headers: { host: '127.0.0.1:4100', cookie: adminCookie, origin: baseURL }, payload: path.startsWith('list-') ? undefined : {} });
    assert.equal(response.statusCode, 404, path);
  }
});

test('session revocation is owner-scoped, excludes the current session and journals atomically', async () => {
  const second = await login('admin@example.test', 'test-password-administrator');
  const own = await ok('get_account_security', {});
  const secondId = (await api('get_account_security', {}, second)).json().sessions.find((session: { current: boolean }) => session.current).id;
  const foreignId = (await api('get_account_security', {}, userCookie)).json().sessions.find((session: { current: boolean }) => session.current).id;
  assert.equal((await api('revoke_session', { sessionId: foreignId })).statusCode, 404);
  assert.equal((await client.callTool({ name: 'revoke_session', arguments: { sessionId: foreignId } })).isError, true);

  assert.equal((await api('revoke_session', { sessionId: own.sessions.find((session: { current: boolean }) => session.current).id })).statusCode, 400);
  await sql`CREATE FUNCTION reject_session_security_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind = 'session' AND NEW.field_key = 'revoked' THEN RAISE EXCEPTION 'test security journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_session_security_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_session_security_journal()`.execute(runtime.db);
  try { assert.equal((await api('revoke_session', { sessionId: secondId })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_session_security_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await api('get_account_security', {}, second)).statusCode, 200);
  assert.equal((await tool('revoke_session', { sessionId: secondId })).revokedSessions, 1);
  assert.equal((await api('get_account_security', {}, second)).statusCode, 401);
  assert.equal((await api('get_account_security', {}, userCookie)).statusCode, 200);
  assert.equal((await api('revoke_session', { sessionId: secondId })).statusCode, 404);
  const bulk = await tool('revoke_other_sessions', {});
  assert.ok(bulk.revokedSessions >= 0);
  assert.equal((await ok('get_account_security', {})).sessions.length, 1);
  assert.equal((await ok('revoke_other_sessions', {})).revokedSessions, 0);
  const event = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT old_value, new_value FROM sys_journal WHERE entity_id = ${secondId}::uuid AND field_key = 'revoked'`.execute(runtime.db)).rows;
  assert.deepEqual(event, [{ old_value: false, new_value: true }]);
});

test('password changes verify credentials, preserve current authentication and roll back credentials/revocation with journal failures', async () => {
  const original = 'test-password-administrator';
  const next = 'replacement-password-administrator';
  const second = await login('admin@example.test', original);
  const hash = (await sql<{ password: string }>`SELECT password FROM sys_accounts WHERE user_id = ${adminId} AND provider_id = 'credential'`.execute(runtime.db)).rows[0].password;
  assert.equal((await api('change_password', { currentPassword: 'incorrect', newPassword: next })).statusCode, 400);
  assert.equal((await api('change_password', { currentPassword: original, newPassword: 'short' })).statusCode, 400);
  assert.equal((await api('change_password', { currentPassword: original, newPassword: original })).statusCode, 400);
  await sql`CREATE FUNCTION reject_password_security_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key = 'password_changed' THEN RAISE EXCEPTION 'test password journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_password_security_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_password_security_journal()`.execute(runtime.db);
  try { assert.equal((await api('change_password', { currentPassword: original, newPassword: next })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_password_security_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await sql<{ password: string }>`SELECT password FROM sys_accounts WHERE user_id = ${adminId} AND provider_id = 'credential'`.execute(runtime.db)).rows[0].password, hash);
  assert.equal((await api('get_account_security', {}, second)).statusCode, 200);
  const changed = await tool('change_password', { currentPassword: original, newPassword: next });
  assert.equal(changed.changed, true);
  assert.ok(changed.revokedSessions >= 1);
  assert.equal((await api('get_account_security', {}, second)).statusCode, 401);
  assert.equal((await api('get_account_security', {})).statusCode, 200);
  const denied = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { host: '127.0.0.1:4100', origin: baseURL }, payload: { email: 'admin@example.test', password: original } });
  assert.notEqual(denied.statusCode, 200);
  const nextCookie = await login('admin@example.test', next);
  assert.equal((await ok('change_password', { currentPassword: next, newPassword: original, revokeOtherSessions: false })).revokedSessions, 0);
  assert.equal((await api('get_account_security', {}, nextCookie)).statusCode, 200);
  const events = (await sql<{ old_value: unknown; new_value: unknown }>`SELECT old_value, new_value FROM sys_journal WHERE entity_kind = 'account_security' AND entity_id = ${adminId}::uuid AND field_key = 'password_changed'`.execute(runtime.db)).rows;
  assert.deepEqual(events, [{ old_value: null, new_value: true }, { old_value: null, new_value: true }]);
  assert.equal(JSON.stringify(events).includes(original), false);
  assert.equal(JSON.stringify(events).includes(hash), false);
});

test('incorrect password attempts are bounded per account across API/MCP', async () => {
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await api('change_password', { currentPassword: 'incorrect', newPassword: 'new-regular-user-password' }, userCookie)).statusCode, 400);
  assert.equal((await api('change_password', { currentPassword: 'test-password-regular-user', newPassword: 'new-regular-user-password' }, userCookie)).statusCode, 429);
  assert.equal((await api('get_account_security', {}, userCookie)).statusCode, 200);
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await client.callTool({ name: 'change_password', arguments: { currentPassword: 'incorrect', newPassword: 'new-administrator-password' } });
    assert.equal(response.isError, true);
  }
  assert.equal((await api('change_password', { currentPassword: 'test-password-administrator', newPassword: 'new-administrator-password' })).statusCode, 429);
  assert.equal((await tool('get_account_security', {})).hasPassword, true);
});


test('personal profile names are owner-scoped, journaled atomically and reflected by auth sessions through API/MCP', async () => {
  const userBefore = (await sql<{ id: string; name: string; email: string; is_admin: boolean }>`SELECT id, name, email, is_admin FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const adminBefore = (await sql<{ name: string }>`SELECT name FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0].name;
  const renamed = await api('set_user_profile', { name: '  Own display name  ' }, userCookie);
  assert.equal(renamed.statusCode, 200);
  assert.deepEqual(renamed.json(), { name: 'Own display name' });
  const userAfter = (await sql`SELECT id, name, email, is_admin FROM sys_users WHERE id = ${userBefore.id}`.execute(runtime.db)).rows[0];
  assert.deepEqual(userAfter, { ...userBefore, name: 'Own display name' });
  const lookup = await runtime.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { host: '127.0.0.1:4100', cookie: userCookie } });
  assert.equal(lookup.json().user.name, 'Own display name');
  const history = (await sql<{ new_value: string }>`SELECT * FROM sys_journal WHERE entity_kind = 'user' AND entity_id = ${userBefore.id}::uuid AND field_key = 'name'`.execute(runtime.db)).rows;
  assert.equal(history.length, 1);
  assert.equal(history[0].new_value, 'Own display name');
  assert.equal((await api('set_user_profile', { name: 'Own display name' }, userCookie)).statusCode, 200);
  assert.deepEqual((await sql`SELECT * FROM sys_journal WHERE entity_kind = 'user' AND entity_id = ${userBefore.id}::uuid AND field_key = 'name'`.execute(runtime.db)).rows, history);
  for (const payload of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 'Foreign', userId: adminId }, { name: 'Foreign', email: 'other@example.test' }, { name: 'Foreign', isAdmin: true }]) assert.equal((await api('set_user_profile', payload, userCookie)).statusCode, 400);
  assert.equal((await api('set_user_profile', { name: 'Denied' }, '')).statusCode, 401);
  await sql`CREATE FUNCTION reject_profile_name_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind = 'user' AND NEW.field_key = 'name' THEN RAISE EXCEPTION 'test profile journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_profile_name_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_profile_name_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_user_profile', { name: 'Must roll back' }, userCookie)).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_profile_name_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await sql<{ name: string }>`SELECT name FROM sys_users WHERE id = ${userBefore.id}`.execute(runtime.db)).rows[0].name, 'Own display name');
  assert.deepEqual(await tool('set_user_profile', { name: '  Updated Administrator  ' }), { name: 'Updated Administrator' });
  assert.equal((await sql<{ name: string }>`SELECT name FROM sys_users WHERE id = ${userBefore.id}`.execute(runtime.db)).rows[0].name, 'Own display name');
  assert.equal((await ok('set_user_profile', { name: adminBefore })).name, adminBefore);
});

test('workspace appearance is shared, versioned and journaled per property through API/MCP with workspace role boundaries', async () => {
  const { defaultWorkspaceAppearance, workspaceFonts } = await import('@xobject/contracts');
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await ok('create_workspace', { name: 'Shared appearance', code: 'appearance' });
  const other = await ok('create_workspace', { name: 'Other appearance', code: 'appearanceother' });
  const appearance = { ...defaultWorkspaceAppearance, baseColor: 'mauve', font: 'inter', primaryColor: '#2563eb', primaryColorDark:'#60a5fa',logoIcon:'network',fontHeading:'orbitron', secondaryColor: '#facc15', secondaryColorDark: '#713f12', radius: 'large' };
  const payload = { workspaceId: ws.id, version: 1, appearance };
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: null });
  const own = (await api('list_workspaces', {}, userCookie)).json().find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(own.appearance, defaultWorkspaceAppearance);
  assert.equal(own.appearance_version, 1);
  assert.equal((await api('set_workspace_appearance', payload, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  assert.equal((await api('set_workspace_appearance', { ...payload, workspaceId: other.id }, userCookie)).statusCode, 403);
  for (const invalid of [{ ...appearance, font: 'custom-font' },{...appearance,primaryColorDark:'url(https://example.test)'},{...appearance,secondaryColorDark:'url(https://example.test)'},{...appearance,logoIcon:'custom-url'}, { ...appearance, primaryColor: 'url(https://example.test)' }, { ...appearance, extraCSS: 'body{}' }, { ...appearance, radius: 'arbitrary' }]) {
    assert.equal((await api('set_workspace_appearance', { ...payload, appearance: invalid }, userCookie)).statusCode, 400);
  }
  const saved = await api('set_workspace_appearance', payload, userCookie);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().version, 2);
  const updated = (await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(updated.appearance, appearance);
  assert.equal(updated.appearance_version, 2);
  const journals = (await sql<{ field_key: string; change_id: string; actor_id: string }>`SELECT field_key, change_id, actor_id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND field_key LIKE 'appearance.%'`.execute(runtime.db)).rows;
  assert.equal(journals.length, 9);
  assert.equal(new Set(journals.map(item => item.change_id)).size, 1);
  assert.ok(journals.every(item => item.actor_id === ordinary.id));
  assert.equal((await api('set_workspace_appearance', payload)).statusCode, 409);
  assert.equal((await tool('set_workspace_appearance', { ...payload, version: 2 })).version, 2);
  assert.equal((await sql<{ count: number }>`SELECT count(*)::int AS count FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND field_key LIKE 'appearance.%'`.execute(runtime.db)).rows[0].count, 9);
  assert.equal(workspaceFonts.length, 27);
  for (const font of workspaceFonts) {
    const result = await tool('set_workspace_appearance', { workspaceId: other.id, version: (await tool('list_workspaces', {})).find((w: { id: string }) => w.id === other.id).appearance_version, appearance: { ...defaultWorkspaceAppearance, font } });
    assert.equal(result.appearance.font, font);
  }
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'designer' });
});

test('appearance persistence rolls back with its journal, survives repeated initialization and rejects concurrent stale writes', async () => {
  const { defaultWorkspaceAppearance } = await import('@xobject/contracts');
  const ws = await ok('create_workspace', { name: 'Atomic appearance', code: 'atomicappearance' });
  const appearance = { ...defaultWorkspaceAppearance, font: 'lora', primaryColor: '#ffffff' };
  await sql`CREATE FUNCTION reject_appearance_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key LIKE 'appearance.%' THEN RAISE EXCEPTION 'test appearance journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_appearance_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_appearance_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_workspace_appearance', { workspaceId: ws.id, version: 1, appearance })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_appearance_journal ON sys_journal`.execute(runtime.db); }
  let stored = (await tool('list_workspaces', {})).find((w: { id: string }) => w.id === ws.id);
  assert.deepEqual(stored.appearance, defaultWorkspaceAppearance);
  assert.equal(stored.appearance_version, 1);
  const parallel = await Promise.all([api('set_workspace_appearance', { workspaceId: ws.id, version: 1, appearance }), api('set_workspace_appearance', { workspaceId: ws.id, version: 1, appearance: { ...appearance, font: 'inter' } })]);
  assert.deepEqual(parallel.map(response => response.statusCode).sort(), [200, 409]);
  stored = (await tool('list_workspaces', {})).find((w: { id: string }) => w.id === ws.id);
  await initializeDatabase(databaseURL, secret, baseURL);
  const reloaded = (await tool('list_workspaces', {})).find((w: { id: string }) => w.id === ws.id);
  assert.deepEqual(reloaded.appearance, stored.appearance);
  assert.equal(reloaded.appearance_version, stored.appearance_version);
});

test('custom color foregrounds provide at least 4.5:1 contrast for solid sRGB fills', async () => {
  const { colorForeground } = await import('@xobject/contracts');
  for (let red = 0; red < 256; red += 17) for (let green = 0; green < 256; green += 17) for (let blue = 0; blue < 256; blue += 17) {
    const hex = '#' + [red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('');
    const rgb = [red, green, blue].map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const ratio = colorForeground(hex) === '#000000' ? (luminance + 0.05) / 0.05 : 1.05 / (luminance + 0.05);
    assert.ok(ratio >= 4.5, `${hex} contrast ${ratio}`);
  }
});

test('theme, chart palette and heading font share versioned API/MCP configuration and per-property journals', async () => {
  const ws = await ok('create_workspace', { name: 'Independent design choices', code: 'designchoices' });
  const appearance = { ...defaultWorkspaceAppearance, baseColor: 'taupe', theme: 'blue', chartColor: 'amber', fontHeading: 'lora' };
  const saved = await tool('set_workspace_appearance', { workspaceId: ws.id, version: 1, appearance });
  assert.equal(saved.version, 2);
  const stored = (await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(stored.appearance, appearance);
  const entries = (await sql<{ field_key: string; new_value: string; change_id: string }>`SELECT field_key, new_value, change_id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND field_key LIKE 'appearance.%' ORDER BY field_key`.execute(runtime.db)).rows;
  assert.deepEqual(entries.map(entry => [entry.field_key, entry.new_value]), [['appearance.baseColor', 'taupe'], ['appearance.chartColor', 'amber'], ['appearance.fontHeading', 'lora'], ['appearance.theme', 'blue']]);
  assert.equal(new Set(entries.map(entry => entry.change_id)).size, 1);
  for (const invalid of [{ ...appearance, theme: 'unknown' }, { ...appearance, chartColor: 'url(https://example.test)' }, { ...appearance, fontHeading: 'custom-font' }]) assert.equal((await api('set_workspace_appearance', { workspaceId: ws.id, version: 2, appearance: invalid })).statusCode, 400);
  assert.equal((await tool('set_workspace_appearance', { workspaceId: ws.id, version: 2, appearance })).version, 2);
});

test('menu choices share strict API/MCP validation, workspace authorization, version checks and property journals', async () => {
  const ws = await ok('create_workspace', { name: 'Shared menus', code: 'sharedmenus' });
  const appearance = { ...defaultWorkspaceAppearance, menuColor: 'inverted-translucent', menuAccent: 'bold' };
  const request = { workspaceId: ws.id, version: 1, appearance };
  assert.equal((await api('set_workspace_appearance', request, userCookie)).statusCode, 403);
  for (const invalid of [{ ...appearance, menuColor: 'custom-css' }, { ...appearance, menuAccent: 'url(https://example.test)' }]) assert.equal((await api('set_workspace_appearance', { ...request, appearance: invalid })).statusCode, 400);
  const result = await tool('set_workspace_appearance', request);
  assert.equal(result.version, 2);
  assert.equal((await api('set_workspace_appearance', request)).statusCode, 409);
  const read = (await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(read.appearance, appearance);
  const events = (await sql<{ field_key: string; new_value: string; change_id: string }>`SELECT field_key, new_value, change_id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND field_key LIKE 'appearance.%' ORDER BY field_key`.execute(runtime.db)).rows;
  assert.deepEqual(events.map(event => [event.field_key, event.new_value]), [['appearance.menuAccent', 'bold'], ['appearance.menuColor', 'inverted-translucent']]);
  assert.equal(new Set(events.map(event => event.change_id)).size, 1);
  await initializeDatabase(databaseURL, secret, baseURL);
  const retained = (await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(retained.appearance, appearance);
});

test('workspace language availability has independent label languages, effective fallback and retained preferences/translations through API/MCP', async () => {
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await ok('create_workspace', { name: 'Language availability', code: 'languagepolicy' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { de: 'Einträge', en: 'Items' }, standardFields: ['category'] });
  assert.deepEqual((await tool('get_language_catalog', {})).map((item: { code: string }) => item.code), ['de', 'en']);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: null });
  const input = { workspaceId: ws.id, version: 1, availableLanguages: ['de'], defaultLanguage: 'de', labelLanguages: ['de'] };
  assert.equal((await api('configure_workspace_languages', input, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  const configured = await api('configure_workspace_languages', input, userCookie);
  assert.equal(configured.statusCode, 200, configured.body);
  assert.equal(configured.json().version, 2);
  await api('configure_user_localization', { language: 'en' }, userCookie);
  const types = (await api('list_object_types', { workspaceId: ws.id }, userCookie)).json();
  assert.equal(types[0].label, 'Einträge');
  assert.equal((await sql<{ language: string }>`SELECT language FROM sys_users WHERE id = ${ordinary.id}`.execute(runtime.db)).rows[0].language, 'en');
  const definition = (await api('get_object_type', { objectTypeId: type.id }, userCookie)).json();
  assert.equal(definition.label, 'Einträge');
  assert.deepEqual(definition.labels, { de: 'Einträge', en: 'Items' });
  assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: { de: 'Neu', en: 'Changed' } }, userCookie)).statusCode, 400);
  assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: { de: 'Neu', en: 'Items' } }, userCookie)).statusCode, 200);
  assert.equal((await api('create_object_type', { workspaceId: ws.id, technicalName: 'blocked', labels: { en: 'Blocked' } }, userCookie)).statusCode, 400);
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'blocked', labels: { de: 'Gültig' }, kind: 'single_choice', config: { options: [{ id: randomUUID(), labels: { en: 'Blocked' }, active: true }] } }, userCookie)).statusCode, 400);
  const blockedClassification = await api('configure_classification', { objectTypeId: type.id, version: definition.classification.version, config: { type: definition.classification.type, status: definition.classification.status, category: definition.classification.category, options: [{ id: randomUUID(), kind: 'category', typeId: null, labels: { en: 'Blocked' }, active: true }] } }, userCookie);
  assert.equal(blockedClassification.statusCode, 400);
  assert.equal(blockedClassification.json().error, 'Definition language is unavailable');
  assert.equal((await api('configure_workspace_languages', { workspaceId: ws.id, language: 'en' })).statusCode, 400);
  for (const invalid of [{ ...input, version: 2, availableLanguages: [] }, { ...input, version: 2, defaultLanguage: 'en' }, { ...input, version: 2, labelLanguages: [] }, { ...input, version: 2, availableLanguages: ['fr'] }]) assert.equal((await api('configure_workspace_languages', invalid)).statusCode, 400);
  assert.equal((await api('configure_workspace_languages', input)).statusCode, 409);
  const eventsBefore = (await sql`SELECT id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid`.execute(runtime.db)).rows.length;
  assert.equal((await tool('configure_workspace_languages', { ...input, version: 2 })).version, 2);
  assert.equal((await sql`SELECT id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid`.execute(runtime.db)).rows.length, eventsBefore);
  await initializeDatabase(databaseURL, secret, baseURL);
  const retained = (await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(retained.available_languages, ['de']);
  assert.deepEqual(retained.label_languages, ['de']);
  assert.equal(retained.default_language, 'de');
  assert.equal(retained.language_version, 2);
  const independent = await tool('configure_workspace_languages', { ...input, version: 2, labelLanguages: ['en'] });
  assert.deepEqual(independent.availableLanguages, ['de']);
  assert.deepEqual(independent.labelLanguages, ['en']);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'designer' });
});

test('language configuration rolls back atomically when its journal fails', async () => {
  const ws = await ok('create_workspace', { name: 'Atomic languages', code: 'atomiclanguages' });
  await sql`CREATE FUNCTION reject_language_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key = 'available_languages' THEN RAISE EXCEPTION 'test language journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_language_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_language_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_workspace_languages', { workspaceId: ws.id, version: 1, availableLanguages: ['de'], defaultLanguage: 'de', labelLanguages: ['de'] })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_language_journal ON sys_journal`.execute(runtime.db); }
  const after = (await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.equal(after.default_language, 'en');
  assert.deepEqual(after.available_languages, ['de', 'en']);
  assert.deepEqual(after.label_languages, ['de', 'en']);
  assert.equal(after.language_version, 1);
});

test('workspace groups enforce definition/member roles, scoped users and versions; removal of workspace membership cleans groups atomically', async () => {
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await ok('create_workspace', { name: 'Managed groups', code: 'managedgroups' });
  const other = await ok('create_workspace', { name: 'Other groups', code: 'othergroups' });
  assert.equal((await api('create_group', { workspaceId: other.id, name: 'Out of scope', members:([ordinary.id]).map(id=>({kind:'user',id,level:'full'})) })).statusCode, 400);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: null });
  assert.equal((await api('create_group', { workspaceId: ws.id, name: 'Not allowed' }, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  const group = (await api('create_group', { workspaceId: ws.id, name: 'Design team' }, userCookie)).json();
  let current = (await tool('list_groups', { workspaceId: ws.id }))[0];
  assert.equal(current.id, group.id);
  assert.equal(current.version, 1);
  assert.equal((await api('configure_group_inheritance', { workspaceId: ws.id, groupId: group.id, version: 1, members:([ordinary.id]).map(id=>({kind:'user',id,level:'full'})) }, userCookie)).statusCode, 403);
  assert.equal((await api('set_group_active', { workspaceId: ws.id, groupId: group.id, version: 1, active: false }, userCookie)).statusCode, 403);
  assert.equal((await api('configure_group', { workspaceId: other.id, groupId: group.id, version: 1, name: 'Foreign' })).statusCode, 404);
  assert.equal((await api('list_groups', { workspaceId: other.id }, userCookie)).statusCode, 403);
  assert.equal((await api('configure_group', { workspaceId: ws.id, groupId: group.id, version: 1, name: 'Team' }, userCookie)).statusCode, 200);
  await tool('configure_group', { workspaceId: ws.id, groupId: group.id, version: 2, name: 'Delivery team' });
  current=await tool('configure_group_inheritance',{workspaceId:ws.id,groupId:group.id,version:3,members:[{kind:'user',id:ordinary.id,level:'full'}]});
  assert.equal(current.version, 4);
  assert.deepEqual(current.members.filter((m:any)=>m.kind==='user').map((m:any)=>m.id), [ordinary.id]);
  assert.equal((await api('configure_group', { workspaceId: ws.id, groupId: group.id, version: 2, name: 'Stale' })).statusCode, 409);
  await sql`CREATE FUNCTION reject_group_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind = 'group' THEN RAISE EXCEPTION 'test group journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_group_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_group_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('configure_group', { workspaceId: ws.id, groupId: group.id, version: 4, name: 'Rollback' })).statusCode, 500);
    assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'designer' })).statusCode, 500);
  } finally { await sql`DROP TRIGGER reject_group_journal ON sys_journal`.execute(runtime.db); }
  assert.deepEqual((await tool('list_groups', { workspaceId: ws.id }))[0], current);
  assert.equal((await api('list_groups', { workspaceId: ws.id }, userCookie)).statusCode, 200);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'designer' });
  const cleaned = (await tool('list_groups', { workspaceId: ws.id }))[0];
  assert.deepEqual(cleaned.members.filter((m:any)=>m.kind==='user').map((m:any)=>m.id), []);
  assert.equal(cleaned.version, 5);
  const events = (await sql<{ old_value: string|null; new_value: string|null }>`SELECT old_value, new_value FROM sys_journal WHERE entity_id = ${group.id}::uuid AND field_key = ${`membership.user:${ordinary.id}`} ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(events, [{ old_value: null, new_value: 'full' }, { old_value: 'full', new_value: null }]);
});

test('inactive groups retain records, member identities and journals while preventing new assignments', async () => {
  const ws = await ok('create_workspace', { name: 'Inactive groups', code: 'inactivegroups' });
  const group = await tool('create_group', { workspaceId: ws.id, name: 'Retained group', members:([adminId]).map(id=>({kind:'user',id,level:'full'})) });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' }, standardFields: ['keyword'] });
  await ok('create_field', { objectTypeId: type.id, technicalName: 'team', labels: { en: 'Team' }, kind: 'reference', config: { referenceTarget: 'group', multiple: false } });
  const reference = { kind: 'group', id: group.id };
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Retained', values: { team: reference } });
  const inactive = await tool('set_group_active', { workspaceId: ws.id, groupId: group.id, version: 1, active: false });
  assert.deepEqual(inactive.members.filter((m:any)=>m.kind==='user').map((m:any)=>m.id), [adminId]);
  const principals = await tool('list_field_principals', { workspaceId: ws.id });
  assert.equal(principals.find((item: { id: string }) => item.id === group.id).active, false);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Blocked', values: { team: reference } })).statusCode, 400);
  assert.equal((await api('configure_group_inheritance', { workspaceId: ws.id, groupId: group.id, version: 2, members:([]).map(id=>({kind:'user',id,level:'full'})) })).statusCode, 400);
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Still retained' });
  assert.deepEqual(updated.team, reference);
  const history = await journalEntries({ objectTypeId: type.id, recordId: record.id },true);
  assert.deepEqual(history.find((event: { field_key: string }) => event.field_key === 'team').new_value, reference);
  await tool('set_group_active', { workspaceId: ws.id, groupId: group.id, version: 2, active: true });
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Allowed again', values: { team: reference } })).statusCode, 200);
});

test('time zones share API/MCP policy, user ownership, workspace roles, versions and initialization retention', async () => {
  const ordinary = (await sql<{ id: string; language: 'de' | 'en' | null }>`SELECT id, language FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await tool('create_workspace', { name: 'Time zones', code: 'timezones', timeZone: 'Europe/Berlin' });
  const catalog = await tool('get_time_zone_catalog', {});
  assert.ok(catalog.includes('Europe/Berlin') && catalog.includes('UTC'));
  const input = { workspaceId: ws.id, version: 1, availableLanguages: ['de', 'en'], labelLanguages: ['de', 'en'], defaultLanguage: 'en', timeZone: 'America/New_York' };
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, expectedRole: null, role: 'user' });
  assert.equal((await api('configure_workspace_languages', input, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, expectedRole: 'user', role: 'designer' });
  assert.equal((await api('configure_workspace_languages', input, userCookie)).json().timeZone, 'America/New_York');
  assert.equal((await api('configure_workspace_languages', input)).statusCode, 409);
  const events = (await sql`SELECT id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid`.execute(runtime.db)).rows.length;
  assert.equal((await tool('configure_workspace_languages', { ...input, version: 2 })).version, 2);
  assert.equal((await sql`SELECT id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid`.execute(runtime.db)).rows.length, events);
  for (const timeZone of ['+01:00', 'UTC+1', 'Unknown/Zone', '']) assert.equal((await api('configure_workspace_languages', { ...input, version: 2, timeZone })).statusCode, 400);
  // Language preference updates preserve the configured zone.
  await ok('configure_workspace_languages', { workspaceId: ws.id, language: 'de' });
  const pref = { language: 'de', timeZone: 'Asia/Tokyo', expectedLanguage: ordinary.language, expectedTimeZone: null };
  const own = await api('configure_user_localization', pref, userCookie);
  assert.equal(own.statusCode, 200, own.body);
  assert.deepEqual(own.json(), { language: 'de', timeZone: 'Asia/Tokyo', regional: null });
  assert.equal((await api('configure_user_localization', { ...pref, userId: adminId }, userCookie)).statusCode, 400);
  assert.equal((await api('configure_user_localization', pref, userCookie)).statusCode, 409);
  const session = await runtime.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { host: '127.0.0.1:4100', cookie: userCookie } });
  assert.equal(session.json().user.timeZone, 'Asia/Tokyo');
  assert.equal((await sql<{ time_zone: string | null }>`SELECT time_zone FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0].time_zone, null);
  const personalEvents = (await sql`SELECT id FROM sys_journal WHERE entity_id = ${ordinary.id}::uuid AND field_key = 'time_zone'`.execute(runtime.db)).rows.length;
  assert.equal((await api('configure_user_localization', { ...pref, expectedLanguage: 'de', expectedTimeZone: 'Asia/Tokyo' }, userCookie)).statusCode, 200);
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id = ${ordinary.id}::uuid AND field_key = 'time_zone'`.execute(runtime.db)).rows.length, personalEvents);
  await initializeDatabase(databaseURL, secret, baseURL);
  const retained = (await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.equal(retained.time_zone, 'America/New_York');
  assert.equal((await sql<{ time_zone: string }>`SELECT time_zone FROM sys_users WHERE id = ${ordinary.id}`.execute(runtime.db)).rows[0].time_zone, 'Asia/Tokyo');
  assert.equal((await api('configure_user_localization', { language: null, timeZone: null, expectedLanguage: 'de', expectedTimeZone: 'Asia/Tokyo' }, userCookie)).statusCode, 200);
});

test('time zone journal failure rolls back personal and workspace localization atomically', async () => {
  const ws = await ok('create_workspace', { name: 'Atomic time zones', code: 'atomictimezones' });
  const before = (await sql<{ language: 'de' | 'en' | null }>`SELECT language FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0];
  await sql`CREATE FUNCTION reject_zone_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key = 'time_zone' THEN RAISE EXCEPTION 'test time zone journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_zone_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_zone_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('configure_user_localization', { language: before.language === 'de' ? 'en' : 'de', timeZone: 'Europe/Berlin', expectedLanguage: before.language, expectedTimeZone: null })).statusCode, 500);
    assert.equal((await api('configure_workspace_languages', { workspaceId: ws.id, version: 1, availableLanguages: ['de'], labelLanguages: ['de'], defaultLanguage: 'de', timeZone: 'Europe/Berlin' })).statusCode, 500);
  } finally { await sql`DROP TRIGGER reject_zone_journal ON sys_journal`.execute(runtime.db); }
  assert.deepEqual((await sql`SELECT language, time_zone FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0], { language: before.language, time_zone: null });
  const retained = (await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.equal(retained.default_language, 'en'); assert.equal(retained.time_zone, 'UTC'); assert.equal(retained.language_version, 1);
});

test('regional policies use shared versions, independent personal overrides and property journals without rewriting records', async () => {
  const ws = await ok('create_workspace', { name: 'Regional formats', code: 'regional', defaultLanguage: 'de' });
  const input = { workspaceId: ws.id, version: 1, availableLanguages: ['de', 'en'], labelLanguages: ['de', 'en'], defaultLanguage: 'de', regional: { ...defaultRegionalSettings, locale: 'de-CH', weekStart: 'sunday' } };
  assert.equal((await api('configure_workspace_languages', input, userCookie)).statusCode, 403);
  const changed = await tool('configure_workspace_languages', input);
  assert.equal(changed.version, 2); assert.equal(changed.regional.locale, 'de-CH');
  const events = (await sql<{ field_key: string; change_id: string }>`SELECT field_key, change_id FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND old_value <> 'null'::jsonb`.execute(runtime.db)).rows;
  assert.deepEqual(events.map(item => item.field_key).sort(), ['regional.locale', 'regional.weekStart']); assert.equal(new Set(events.map(item => item.change_id)).size, 1);
  const pref = { locale: null, dateFormat: 'iso', hourCycle: null, numberFormat: null, weekStart: null };
  const user = (await sql<{ language: 'de' | 'en' | null }>`SELECT language FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0];
  const personal = { language: user.language, timeZone: null, expectedLanguage: user.language, expectedTimeZone: null, regional: pref, expectedRegional: null };
  assert.equal((await tool('configure_user_localization', personal)).regional.dateFormat, 'iso');
  assert.equal((await api('configure_user_localization', personal)).statusCode, 409);
  assert.equal((await api('configure_user_localization', { ...personal, regional: { ...pref, locale: 'unsupported' } })).statusCode, 400);
  await initializeDatabase(databaseURL, secret, baseURL);
  assert.equal((await tool('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id).regional.locale, 'de-CH');
  await tool('configure_user_localization', { ...personal, expectedRegional: pref, regional: { locale: null, dateFormat: null, hourCycle: null, numberFormat: null, weekStart: null } });
});

test('managed users require a first password change, enforce Administrator management and never expose credentials in journals', async () => {
  const password = 'initial-test-user-only';
  const created = await tool('create_user', { name: 'Provisioned user', email: 'provisioned@example.test', initialPassword: password });
  assert.equal(created.mustChangePassword, true); assert.equal(created.isAdmin, false);
  assert.equal((await api('list_managed_users', {}, userCookie)).statusCode, 403);
  assert.equal((await api('create_user', { name: 'Denied', email: 'denied@example.test', initialPassword: password }, userCookie)).statusCode, 403);
  const initialCookie = await login('provisioned@example.test', password);
  const gate = await api('list_workspaces', {}, initialCookie); assert.equal(gate.statusCode, 403); assert.equal(gate.json().error, 'Password change required');
  const session = await runtime.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { host: '127.0.0.1:4100', cookie: initialCookie } }); assert.equal(session.json().user.mustChangePassword, true);
  const credential = (await sql<{ password: string }>`SELECT password FROM sys_accounts WHERE user_id = ${created.id}`.execute(runtime.db)).rows[0];
  assert.notEqual(credential.password, password);
  assert.equal((await api('change_password', { currentPassword: password, newPassword: 'changed-test-user-only', revokeOtherSessions: true }, initialCookie)).statusCode, 200);
  assert.equal((await api('list_workspaces', {}, initialCookie)).statusCode, 200);
  const fresh = (await tool('list_managed_users', {})).find((item: { id: string }) => item.id === created.id); assert.equal(fresh.mustChangePassword, false);
  const configured = await tool('configure_user', { userId: created.id, version: fresh.version, name: 'Renamed provisioned user', isAdmin: false, active: false });
  assert.equal(configured.active, false);
  assert.equal((await api('list_workspaces', {}, initialCookie)).statusCode, 401);
  const deniedLogin = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { host: '127.0.0.1:4100', origin: baseURL }, payload: { email: 'provisioned@example.test', password: 'changed-test-user-only' } });
  assert.notEqual(deniedLogin.statusCode, 200);
  assert.equal((await api('configure_user', { userId: created.id, version: fresh.version, name: 'Stale', isAdmin: false, active: true })).statusCode, 409);
  const self = (await tool('list_managed_users', {})).find((item: { id: string }) => item.id === adminId);
  assert.equal((await api('configure_user', { userId: adminId, version: self.version, name: self.name, isAdmin: false, active: true })).statusCode, 400);
  const journal = await tool('list_system_journal', { fieldKey: '', limit: 100 });
  assert.ok(journal.entries.some((entry: { entity_id: string }) => entry.entity_id === created.id));
  assert.equal((await api('list_system_journal', {}, userCookie)).statusCode, 403);
  const raw = JSON.stringify((await sql`SELECT * FROM sys_journal WHERE entity_id = ${created.id}::uuid`.execute(runtime.db)).rows);
  assert.ok(!raw.includes(password) && !raw.includes(credential.password) && !raw.includes('changed-test-user-only'));
  const page = await tool('list_system_journal', { entityKind: 'user', fieldKey: 'must_change_password', limit: 1 });
  assert.ok(page.total >= 2); assert.equal(page.entries.length, 1);
});

test('user creation and mandatory password flags roll back with journals; all-inherited regional settings are a no-op', async () => {
  await sql`CREATE FUNCTION reject_user_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind = 'user' AND NEW.field_key = 'name' THEN RAISE EXCEPTION 'test user journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_user_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_user_journal()`.execute(runtime.db);
  try { assert.equal((await api('create_user', { name: 'Rollback user', email: 'rollback-user@example.test', initialPassword: 'test-rollback-user-only' })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_user_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await sql`SELECT id FROM sys_users WHERE email = 'rollback-user@example.test'`.execute(runtime.db)).rows.length, 0);
  const created = await tool('create_user', { name: 'First password rollback', email: 'first-password-rollback@example.test', initialPassword: 'test-initial-password-only' });
  const first = await login(created.email, 'test-initial-password-only');
  const other = await login(created.email, 'test-initial-password-only');
  await sql`CREATE FUNCTION reject_initial_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key = 'must_change_password' AND NEW.old_value = 'true'::jsonb THEN RAISE EXCEPTION 'test initial password journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_initial_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_initial_journal()`.execute(runtime.db);
  try { assert.equal((await api('change_password', { currentPassword: 'test-initial-password-only', newPassword: 'test-new-password-only', revokeOtherSessions: false }, first)).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_initial_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await sql<{ must_change_password: boolean }>`SELECT must_change_password FROM sys_users WHERE id = ${created.id}`.execute(runtime.db)).rows[0].must_change_password, true);
  assert.equal((await api('change_password', { currentPassword: 'test-initial-password-only', newPassword: 'test-new-password-only', revokeOtherSessions: false }, first)).statusCode, 200);
  assert.equal((await api('get_account_security', {}, other)).statusCode, 401);
  const current = (await sql<{ language: 'de' | 'en' | null; time_zone: string | null; regional_preferences: unknown }>`SELECT language, time_zone, regional_preferences FROM sys_users WHERE id = ${adminId}`.execute(runtime.db)).rows[0];
  const count = (await sql`SELECT id FROM sys_journal WHERE entity_id = ${adminId}::uuid`.execute(runtime.db)).rows.length;
  const response = await tool('configure_user_localization', { language: current.language, timeZone: current.time_zone, expectedLanguage: current.language, expectedTimeZone: current.time_zone, regional: { locale: null, dateFormat: null, hourCycle: null, numberFormat: null, weekStart: null }, expectedRegional: current.regional_preferences });
  assert.equal(response.regional, null);
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id = ${adminId}::uuid`.execute(runtime.db)).rows.length, count);
});

test('dashboard aggregates actual workspace records and journal activity across heterogeneous active objects through API/MCP', async () => {
  const ws = await ok('create_workspace', { name: 'Dashboard', code: 'dashboard', defaultLanguage: 'de', timeZone: 'Europe/Berlin' });
  const other = await ok('create_workspace', { name: 'Other dashboard', code: 'otherdashboard' });
  const bare = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'bare', labels: { de: 'Ohne Standardfelder', en: 'Bare' } });
  const contacts = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'directory', labels: { de: 'Kontakte', en: 'Contacts' }, standardFields: ['keyword', 'type_status', 'category'] });
  const hidden = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'hidden', labels: { en: 'Inactive' }, standardFields: ['keyword'] });
  const foreign = await ok('create_object_type', { workspaceId: other.id, technicalName: 'foreign_items', labels: { en: 'Foreign' }, standardFields: ['keyword'] });
  const empty = await ok('create_record', { objectTypeId: bare.id });
  const model = await ok('get_object_type', { objectTypeId: contacts.id });
  const typeId = randomUUID(), statusId = randomUUID(), catA = randomUUID(), catB = randomUUID();
  await ok('configure_classification', { objectTypeId: contacts.id, version: model.classification.version, config: { type: model.classification.type, status: model.classification.status, category: { ...model.classification.category, multiple: true }, options: [{ id: typeId, kind: 'type', typeId: null, labels: { en: 'Standard', de: 'Standard' }, active: true }, { id: statusId, kind: 'status', typeId, labels: { en: 'Open', de: 'Open' }, active: true }, { id: catA, kind: 'category', typeId: null, labels: { en: 'A', de: 'A' }, active: true }, { id: catB, kind: 'category', typeId: null, labels: { en: 'B', de: 'B' }, active: true }] } });
  const first = await ok('create_record', { objectTypeId: contacts.id, keyword: 'Alpha', classification: { type: typeId, status: statusId, category: [catA, catB] } });
  await ok('create_record', { objectTypeId: contacts.id, keyword: 'Zulu' });
  await ok('create_record', { objectTypeId: hidden.id, keyword: 'Hidden row' });
  await ok('create_record', { objectTypeId: foreign.id, keyword: 'Foreign row' });
  await ok('set_definition_state', { kind: 'object_type', id: hidden.id, expectedState: 'active', state: 'inactive' });
  await ok('update_record', { objectTypeId: contacts.id, recordId: first.id, version: 1, keyword: 'Alpha updated' });
  const dashboard = await tool('get_workspace_dashboard', { workspaceId: ws.id, days: 7 });
  assert.equal(dashboard.total, 3); assert.equal(dashboard.objectTypes, 2); assert.equal(dashboard.created30, 3); assert.equal(dashboard.updated7, 1);
  assert.equal(dashboard.activity.length, 7); assert.equal(dashboard.timeZone, 'Europe/Berlin');
  assert.equal(dashboard.activity.reduce((sum: number, day: { created: number }) => sum + day.created, 0), 3);
  assert.equal(dashboard.activity.reduce((sum: number, day: { updated: number }) => sum + day.updated, 0), 1);
  const page = await tool('list_workspace_records', { workspaceId: ws.id, sortBy: 'keyword', sortDirection: 'asc', limit: 1 });
  assert.equal(page.total, 3); assert.equal(page.records[0].keyword, 'Alpha updated'); assert.equal(page.records[0].objectTypeId, contacts.id);
  assert.equal(page.records[0].type, 'Standard'); assert.equal(page.records[0].status, 'Open'); assert.equal(page.records[0].category, [...first.category].map((id: string) => id === catA ? 'A' : 'B').join(', '));
  assert.equal(page.records[0].createdByName, 'Test Administrator');
  const next = await tool('list_workspace_records', { workspaceId: ws.id, sortBy: 'keyword', sortDirection: 'asc', limit: 1, offset: 1 });
  assert.equal(next.records[0].keyword, 'Zulu');
  const standardless = await tool('list_workspace_records', { workspaceId: ws.id, objectTypeId: bare.id });
  assert.equal(standardless.records[0].id, empty.id); assert.equal(standardless.records[0].keyword, null); assert.equal(standardless.records[0].status, null); assert.equal(standardless.records[0].category, null);
  assert.equal((await tool('list_workspace_records', { workspaceId: ws.id, query: 'Alpha' })).total, 1);
  assert.equal((await tool('list_workspace_records', { workspaceId: ws.id, objectTypeId: foreign.id })).total, 0);
  assert.equal((await api('get_workspace_dashboard', { workspaceId: ws.id }, userCookie)).statusCode, 403);
  assert.equal((await api('list_workspace_records', { workspaceId: ws.id }, userCookie)).statusCode, 403);
  assert.equal((await api('list_workspace_records', { workspaceId: ws.id, sortBy: 'password' })).statusCode, 400);
  const blank = await ok('create_workspace', { name: 'Empty dashboard', code: 'emptydashboard' });
  const zero = await tool('get_workspace_dashboard', { workspaceId: blank.id, days: 30 });
  assert.equal(zero.total, 0); assert.equal(zero.activity.length, 30); assert.ok(zero.activity.every((day: { created: number; updated: number }) => !day.created && !day.updated));
});

test('configured standard field creation is atomic, versioned and shared by API and MCP', async () => {
  const ws = await ok('create_workspace', { name: 'Configured standards', code: 'configuredstandards' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const categoryId = randomUUID();
  const rules: ClassificationRules = { type: { required: false, defaultId: null }, status: { required: false, defaults: [] }, category: { required: true, multiple: true, defaultIds: [categoryId] }, options: [{ id: categoryId, kind: 'category', labels: { en: 'Important' }, active: true, typeId: null }] };
  const before = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'category', configuration: { version: 999, config: rules } })).statusCode, 409);
  const unchanged = await ok('get_object_type', { objectTypeId: type.id });
  assert.deepEqual(unchanged.fields, before.fields); assert.deepEqual(unchanged.columns, before.columns);
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'category', configuration: { version: 1, config: rules } }, userCookie)).statusCode, 403);
  let definition = await tool('add_standard_field', { objectTypeId: type.id, field: 'category', configuration: { version: 1, config: rules } });
  assert.equal(definition.classification.category.required, true);
  assert.equal(definition.classification.category.multiple, true);
  assert.equal(definition.classification.options[0].id, categoryId);
  const typeId = randomUUID(), statusId = randomUUID();
  const next: ClassificationRules = { ...rules, type: { required: false, defaultId: typeId }, status: { required: false, defaults: [{ typeId, statusId }] }, options: [...rules.options, { id: typeId, kind: 'type', labels: { en: 'Work' }, active: true, typeId: null }, { id: statusId, kind: 'status', labels: { en: 'Open' }, active: true, typeId }] };
  definition = await ok('add_standard_field', { objectTypeId: type.id, field: 'type_status', configuration: { version: definition.classification.version, config: next } });
  assert.equal(definition.classification.type.defaultId, typeId);
  assert.equal(definition.classification.status.defaults[0].statusId, statusId);
  definition = await tool('add_standard_field', { objectTypeId: type.id, field: 'keyword', required: true });
  assert.equal(definition.fields.find((field: { technicalName: string }) => field.technicalName === 'keyword').required, true);
  const changes = (await sql<{ change_id: string }>`SELECT DISTINCT change_id FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind <> 'object_type'`.execute(runtime.db)).rows;
  assert.equal(changes.length, 3, 'Each configured field installation has one atomic journal change');
  const occupied = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'occupied', labels: { en: 'Occupied' } });
  await ok('create_record', { objectTypeId: occupied.id });
  assert.equal((await api('add_standard_field', { objectTypeId: occupied.id, field: 'keyword', required: true })).statusCode, 400);
  assert.equal((await api('add_standard_field', { objectTypeId: occupied.id, field: 'category', configuration: { version: 1, config: rules } })).statusCode, 400);
  const stillBare = await ok('get_object_type', { objectTypeId: occupied.id });
  assert.deepEqual(stillBare.fields, []);
  assert.equal(stillBare.columns.includes('keyword'), false); assert.equal(stillBare.columns.includes('category'), false);
  const audit = await ok('get_definition_journal', { objectTypeId: occupied.id });
  assert.equal(audit.some((entry: { field_key: string }) => entry.field_key === 'required'), false);
});

test('journal read context resolves current localized names without exposing records through definition history', async () => {
  const ws = await ok('create_workspace', { name: 'Journal context', code: 'journalcontext', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge' }, standardFields: ['keyword'] });
  await ok('create_field', { objectTypeId: type.id, technicalName: 'plate', labels: { de: 'Kennzeichen' }, kind: 'text' });
  const model = await ok('get_object_type', { objectTypeId: type.id });
  const plate = model.fields.find((f: { technicalName: string }) => f.technicalName === 'plate');
  assert.ok(plate);
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Vehicle A', values: { plate: 'TEST 1' } });
  let page = await tool('list_system_journal', { workspaceId: ws.id, entityKind: 'record' });
  const change = page.entries.find((entry: { field_key: string }) => entry.field_key === 'plate');
  assert.equal(change.entity_name, 'Vehicle A');
  assert.equal(change.field_label, 'Kennzeichen');
  assert.equal(change.object_type_name, 'Fahrzeuge');
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Vehicle renamed' });
  await ok('set_definition_state', { kind: 'field', id: plate.id, expectedState: 'active', state: 'inactive' });
  page = await ok('list_system_journal', { workspaceId: ws.id, entityKind: 'record' });
  const retained = page.entries.find((entry: { id: string }) => entry.id === change.id);
  assert.equal(retained.entity_name, 'Vehicle renamed');
  assert.equal(retained.field_label, 'Kennzeichen');
  assert.equal(retained.new_value, 'TEST 1', 'Stored historical values stay unchanged');
  const history = await tool('get_definition_journal', { objectTypeId: type.id });
  assert.ok(history.every((entry: { entity_kind: string }) => entry.entity_kind !== 'record'));
  assert.ok(history.some((entry: { field_id: string; entity_name: string }) => entry.field_id === plate.id && entry.entity_name === 'Kennzeichen'));
  assert.ok(!JSON.stringify(history).includes('TEST 1'));
  assert.equal((await api('list_system_journal', { workspaceId: ws.id }, userCookie)).statusCode, 403);
  await ok('create_field', { objectTypeId: type.id, technicalName: 'unused', labels: { de: 'Unbenutzt' } });
  const before = await ok('get_object_type', { objectTypeId: type.id });
  const unusedId = before.fields.find((f: { technicalName: string }) => f.technicalName === 'unused').id;
  await ok('set_definition_state', { kind: 'field', id: unusedId, expectedState: 'active', state: 'deleted', confirm: true });
  const deletedHistory = await ok('get_definition_journal', { objectTypeId: type.id });
  assert.ok(deletedHistory.some((entry: { field_id: string; field_label: string }) => entry.field_id === unusedId && entry.field_label === 'Unbenutzt'));
});

test('fictional demo fixtures use validated fields, canonical field order and actual idempotent demo relationships', async () => {
  const { seedDemoData } = await import('../src/demo-data.js');
  const result = await seedDemoData(runtime.db, adminId, 'demofixture');
  assert.deepEqual(Object.keys(result.objects), ['contacts', 'projects', 'cases', 'tasks', 'mobile_workshops', 'distribution_lists', 'support_packages', 'workshop_tools', 'access_checks']);
  assert.equal(Object.values(result.records).flat().length, 74);
  for (const [name, model] of Object.entries(result.objects)) {
    const definition = await ok('get_object_type', { objectTypeId: model.id });
    for (const field of definition.fields.filter((f:any) => f.kind === 'multiline')) {
      if (name === 'distribution_lists' && field.technicalName === 'description') {
        assert.equal(field.config.formatted,false);assert.equal(String(result.records[name][0].description).split('\n').length,3);continue;
      }
      assert.equal(field.config.formatted,true);
      for(const row of result.records[name]){
        const text=row[field.technicalName];assert.ok(typeof text==='string');
        if(field.technicalName==='notes'||field.technicalName.endsWith('_notes')){
          assert.match(text,/\(John Doe\) -----\n/);assert.match(text,/\(Jane Doe\) -----\n/);assert.match(text,/\(James Doe\) -----\n/);assert.doesNotMatch(text,/^#{1,6}\s/m);
          if(typeof row.description==='string')assert.notEqual(text,row.description);
        }else if(field.technicalName==='description'){
          assert.match(text,/^## /);assert.match(text,/```text/);assert.match(text,/> /);assert.match(text,/\[Example reference\]\(https:\/\/example.org\/\)/);assert.doesNotMatch(text,/-----.*Doe/);
        }
      }
    }
    const expected=['id','created_at','created_by','updated_at','updated_by','version',...(name==='contacts'?[]:['keyword']),'type','status','category'];
    assert.deepEqual(definition.columns.slice(0,expected.length),expected);
    assert.ok(definition.fields.find((field: { technicalName: string; required: boolean }) => field.technicalName === 'keyword').required);
    assert.equal((await ok('list_records', { objectTypeId: model.id, limit: 100 })).total, result.records[name].length);
    const groups=definition.formLayouts.default.groups;
    if(name==='projects'||name==='cases'){
      assert.ok(groups.find((g:any)=>g.id===(name==='projects'?'project_details':'case_details')));assert.ok(groups.find((g:any)=>g.id==='schedule'));assert.equal(groups.at(-1).labels.en,'Notes');
    }
    if(name==='workshop_tools')assert.ok(groups.some((g:any)=>g.id==='inventory'&&g.width==='half'));
    if(name==='support_packages')assert.ok(groups.some((g:any)=>g.id==='service_terms'));
    if(name==='mobile_workshops')assert.ok(groups.some((g:any)=>g.id==='operation'));

  }
  assert.ok(result.objects.distribution_lists.numbering);assert.equal(result.objects.distribution_lists.numbering.enabled,false);assert.ok(!result.objects.distribution_lists.fields.some((f:any)=>f.technicalName==='business_number'));
  const identities = new Map(Object.entries(result.records).flatMap(([name, rows]) => rows.map(row => [row.id, result.objects[name].id])));
  const primaryChildren = new Set<string>();
  for (const link of result.links) {
    assert.equal(identities.get(link.from.recordId), link.from.objectTypeId);
    assert.equal(identities.get(link.to.recordId), link.to.objectTypeId);
    if (link.relation === 'primary') { assert.ok(!primaryChildren.has(link.to.recordId)); primaryChildren.add(link.to.recordId); }
  }
  assert.ok(result.records.tasks.some(row => !primaryChildren.has(row.id)), 'Standalone task is retained');
  assert.ok(result.records.projects.some(row => !primaryChildren.has(row.id)), 'Project without a contact is retained');
  for(const name of ['mobile_workshops','support_packages','access_checks'])assert.ok(result.records[name].every(row=>primaryChildren.has(row.id)),`${name} demonstrates Primary associations`);
  assert.equal(result.records.workshop_tools.filter(row=>primaryChildren.has(row.id)).length,3);
  assert.ok(!primaryChildren.has(result.records.workshop_tools.find(row=>row.keyword==='Unassigned diagnostic kit')!.id));
  const primary=await ok('get_primary_chain_context',{objectTypeId:result.objects.mobile_workshops.id,recordId:result.records.mobile_workshops[0].id});
  assert.equal(primary.direct.recordId,result.records.cases[0].id);
  assert.deepEqual(primary.levels.map((level:any)=>[level.role,level.record?.recordId,level.inherited]),[['contact',result.records.contacts[0].id,true],['project',result.records.projects[0].id,true],['case',result.records.cases[0].id,false]]);
  const internal=await ok('get_primary_chain_context',{objectTypeId:result.objects.workshop_tools.id,recordId:result.records.workshop_tools[2].id});
  assert.equal(internal.direct.recordId,result.records.projects[3].id);
  assert.equal(internal.levels.find((level:any)=>level.role==='contact').record,null);

  assert.ok((await journalEntries({ objectTypeId: result.objects.tasks.id, recordId: result.records.tasks[0].id })).some((entry: { old_value: unknown; new_value: unknown }) => entry.old_value === '0' && entry.new_value === '25'));
  const edgeCount=(await sql<{count:number}>`SELECT count(*)::integer AS count FROM sys_relationships WHERE workspace_id=${result.workspaceId}::uuid`.execute(runtime.db)).rows[0].count;
  assert.equal(edgeCount,75);
  const {connectDemoRelationships}=await import('../src/demo-data.js');
  await connectDemoRelationships(runtime.db,adminId,result.workspaceId,result.links);
  assert.equal((await sql<{count:number}>`SELECT count(*)::integer AS count FROM sys_relationships WHERE workspace_id=${result.workspaceId}::uuid`.execute(runtime.db)).rows[0].count,75);
  const workspace=(await ok('list_workspaces',{})).find((item:any)=>item.id===result.workspaceId);
  assert.equal(workspace.default_language,'en');
  const modules=await ok('list_workspace_modules',{workspaceId:result.workspaceId});assert.ok(modules.filter((m:any)=>m.available).every((m:any)=>m.enabled));assert.ok(modules.filter((m:any)=>!m.available).every((m:any)=>!m.enabled));
  const navigation=await ok('get_workspace_navigation',{workspaceId:result.workspaceId});assert.equal(navigation.workspace.layout,null);assert.equal(navigation.personal.layout,null);
  assert.deepEqual(workspace.available_languages,['de','en']);
  assert.deepEqual(result.accounts.map(account=>[account.name,account.role]),[['Jane Doe','designer'],['James Doe','user']]);
  const kinds = new Set<string>();
  for(const model of Object.values(result.objects)) {
    for(const item of [model,...model.fields,...model.classification.options,...Object.values(model.formLayouts??{}).flatMap(layout=>layout.groups)]) {
      assert.ok(item.labels.en, 'English definition label');assert.ok(item.labels.de,'German definition label');
    }
    for(const item of model.fields)if(item.state==='active')kinds.add(item.kind);
  }
  for(const kind of (await import('@xobject/contracts')).customFieldKinds)assert.ok(kinds.has(kind),`Demo covers ${kind}`);
  const customKinds=new Set(['mobile_workshops','support_packages','workshop_tools','access_checks'].flatMap(name=>result.objects[name].fields.filter((f:any)=>f.state==='active').map((f:any)=>f.kind)));
  for(const kind of (await import('@xobject/contracts')).customFieldKinds)assert.ok(customKinds.has(kind),`Custom demo covers ${kind}`);
  const {Application}=await import('../src/domain.js');const app=new Application(runtime.db);
  // Exercise the real initial-password change gate before assessing role/content differences.
  for(const account of result.accounts) {
    assert.equal((await sql<{must_change_password:boolean}>`SELECT must_change_password FROM sys_users WHERE id=${account.id}`.execute(runtime.db)).rows[0].must_change_password,true);
    assert.ok(account.password);
    const cookie=await login(account.email,account.password);
    const session=(await sql<{id:string}>`SELECT id FROM sys_sessions WHERE user_id=${account.id}`.execute(runtime.db)).rows[0];
    await app.execute('change_password',{currentPassword:account.password,newPassword:randomBytes(24).toString('base64url')},account.id,{sessionId:session.id});
    assert.ok(cookie);
  }
  const [designer,member]=result.accounts;
  for(const level of ['none','availability','read','duplicate','schedule','edit','delete','full']) {
    const row=result.records.access_checks.find(row=>row.keyword===`Foreign access – ${level}`)!;
    if(['none','availability'].includes(level))await assert.rejects(app.execute('get_record',{objectTypeId:result.objects.access_checks.id,recordId:row.id},member.id));
    else {const actual=await app.execute('get_record',{objectTypeId:result.objects.access_checks.id,recordId:row.id},member.id) as any;assert.equal(actual.permissions.edit,['edit','delete','full'].includes(level));assert.equal(actual.permissions.full,level==='full');assert.equal(actual.permissions.delete,['delete','full'].includes(level));assert.equal(actual.permissions.duplicate,level!=='read');assert.equal(actual.permissions.schedule,['schedule','edit','delete','full'].includes(level));}
  }
  for(const privacy of ['personal','confidential'])await assert.rejects(app.execute('get_record',{objectTypeId:result.objects.access_checks.id,recordId:result.records.access_checks.find(row=>row.keyword===`Privacy – ${privacy}`)!.id},member.id));
  const contract=await app.execute('get_record',{objectTypeId:result.objects.support_packages.id,recordId:result.records.support_packages[0].id},member.id) as any;
  assert.equal(contract.internal_notes,undefined);
  await assert.rejects(app.execute('create_field',{objectTypeId:result.objects.workshop_tools.id,technicalName:'forbidden',labels:{en:'Forbidden'}},member.id));
  const designerField=await app.execute('create_field',{objectTypeId:result.objects.workshop_tools.id,technicalName:'designer_test',labels:{en:'Designer test',de:'Gestaltertest'}},designer.id) as any;assert.ok(designerField.id);
  await app.execute('set_definition_state',{kind:'field',id:designerField.id,expectedState:'active',state:'deleted',confirm:true},designer.id);
  const {defaultWorkspaceAppearance}=await import('@xobject/contracts');
  const {itextremeDemoAppearance}=await import('../src/demo-data.js');
  assert.deepEqual((await ok('list_workspaces',{})).find((w:any)=>w.id===result.workspaceId).appearance,itextremeDemoAppearance);
  const usersBefore=Number((await sql<{count:string}>`SELECT count(*) FROM sys_users`.execute(runtime.db)).rows[0].count);
  const standard=await seedDemoData(runtime.db,adminId,'standardfixture',{name:'Demo',appearance:defaultWorkspaceAppearance,members:result.accounts.map(({id,role})=>({id,role}))});
  assert.equal(Number((await sql<{count:string}>`SELECT count(*) FROM sys_users`.execute(runtime.db)).rows[0].count),usersBefore);
  assert.deepEqual(standard.accounts.map(a=>a.id),result.accounts.map(a=>a.id));
  assert.ok(standard.accounts.every(a=>a.password===undefined));
  assert.deepEqual((await ok('list_workspaces',{})).find((w:any)=>w.id===standard.workspaceId).appearance,defaultWorkspaceAppearance);
  assert.notEqual(standard.objects.contacts.id,result.objects.contacts.id);
  await assert.rejects(seedDemoData(runtime.db, adminId, 'demofixture'), /already exists/);
  assert.equal((await api('list_records', { objectTypeId: result.objects.contacts.id }, userCookie)).statusCode, 403);
});

test('relationship definitions share API/MCP rules, protected system defaults, workspace rights, cardinalities and atomic journals', async () => {
  const ws=await ok('create_workspace',{name:'Relationship definitions',code:'relations'});
  const other=await ok('create_workspace',{name:'Other relations',code:'otherrelations'});
  const a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'parents',labels:{en:'Parents'}});
  const b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'children',labels:{en:'Children'}});
  const foreign=await ok('create_object_type',{workspaceId:other.id,technicalName:'foreign_items',labels:{en:'Foreign'}});
  const system=await tool('list_relationship_types',{workspaceId:ws.id});
  assert.equal(system.length,2);
  const primary=system.find((row:any)=>row.kind==='primary'),general=system.find((row:any)=>row.kind==='general');
  const config=(row:any)=>Object.fromEntries(['labels','leftLabels','rightLabels','directed','leftMin','leftMax','rightMin','rightMax','allowAll','pairs','active'].map(key=>[key,row[key]]));
  assert.equal(primary.rightMax,1);assert.equal(primary.directed,true);assert.equal(general.allowAll,true);assert.equal(general.directed,false);
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:primary.id,version:1,configuration:{...config(primary),rightMax:null}})).statusCode,400);
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:general.id,version:1,configuration:{...config(general),directed:true}})).statusCode,400);
  const base={labels:{en:'Project work'},leftLabels:{en:'Tasks'},rightLabels:{en:'Project'},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true};
  const ordinary=(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0];
  assert.equal((await api('list_relationship_types',{workspaceId:ws.id},userCookie)).statusCode,403);
  await ok('set_workspace_member',{workspaceId:ws.id,userId:ordinary.id,role:'user',expectedRole:null});
  assert.equal((await api('list_relationship_types',{workspaceId:ws.id},userCookie)).statusCode,200);
  assert.equal((await api('create_relationship_type',{workspaceId:ws.id,technicalName:'work',configuration:base},userCookie)).statusCode,403);
  await ok('set_workspace_member',{workspaceId:ws.id,userId:ordinary.id,role:'designer',expectedRole:'user'});
  const response=await api('create_relationship_type',{workspaceId:ws.id,technicalName:'work',configuration:base},userCookie);assert.equal(response.statusCode,200,response.body);const created=response.json();
  const journals=(await sql<{change_id:string;field_key:string}>`SELECT change_id,field_key FROM sys_journal WHERE entity_id=${created.id}::uuid`.execute(runtime.db)).rows;
  assert.equal(journals.length,Object.keys(base).length+2);assert.equal(new Set(journals.map(row=>row.change_id)).size,1);assert.equal(new Set(journals.map(row=>row.field_key)).size,journals.length);
  const count=await sql`SELECT id FROM sys_journal WHERE entity_id=${created.id}::uuid`.execute(runtime.db);
  await tool('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:1,configuration:base});
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id=${created.id}::uuid`.execute(runtime.db)).rows.length,count.rows.length);
  const updated=await tool('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:1,configuration:{...base,active:false}});assert.equal(updated.version,2);
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:1,configuration:base})).statusCode,409);
  assert.equal((await api('configure_relationship_type',{workspaceId:other.id,relationshipTypeId:created.id,version:2,configuration:base})).statusCode,404);
  for(const configuration of [
    {...base,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:foreign.id}]},
    {...base,pairs:[base.pairs[0],base.pairs[0]]},
    {...base,directed:false,allowAll:true,pairs:[]},
    {...base,directed:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:a.id}]},
    {...base,directed:false,leftMax:1,pairs:[base.pairs[0],{leftObjectTypeId:b.id,rightObjectTypeId:a.id}]},
  ]) assert.equal((await api('create_relationship_type',{workspaceId:ws.id,technicalName:'invalid',configuration})).statusCode,400);
  const distinctSides=await tool('create_relationship_type',{workspaceId:ws.id,technicalName:'undirected_roles',configuration:{...base,directed:false}});assert.equal(distinctSides.leftMax,null);assert.equal(distinctSides.rightMax,1);
  const undirected=await tool('create_relationship_type',{workspaceId:ws.id,technicalName:'partners',configuration:{...base,leftLabels:{en:'Partners'},rightLabels:{en:'Partners'},directed:false,leftMax:1,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:a.id}]}});assert.equal(undirected.directed,false);
  assert.equal((await api('create_relationship_type',{workspaceId:ws.id,technicalName:'primary_association',configuration:base})).statusCode,400);
  assert.equal((await api('create_relationship_type',{workspaceId:ws.id,technicalName:'reserved_label',configuration:{...base,labels:{en:'Primary association'}}})).statusCode,400);
  await assert.rejects(runtime.db.transaction().execute(async tx=>{await sql`DELETE FROM sys_relationship_type_pairs WHERE relationship_type_id=${created.id}::uuid`.execute(tx);await sql`INSERT INTO sys_relationship_type_pairs VALUES(${created.id}::uuid,${ws.id}::uuid,${a.id}::uuid,${foreign.id}::uuid)`.execute(tx);}), /foreign key/i);
  assert.equal((await api('set_definition_state',{kind:'object_type',id:a.id,expectedState:'active',state:'deleted',confirm:true})).statusCode,409);
  assert.equal((await ok('get_object_type',{objectTypeId:a.id})).canDelete,false);
  const before=JSON.stringify(await ok('list_relationship_types',{workspaceId:ws.id}));
  await sql`CREATE FUNCTION reject_relationship_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind='relationship_type' AND NEW.field_key='rightLabels' THEN RAISE EXCEPTION 'test relationship journal rejection'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_relationship_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_relationship_journal()`.execute(runtime.db);
  try {assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:2,configuration:{...base,rightLabels:{en:'Changed'},pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:a.id}]}})).statusCode,500);}finally{await sql`DROP TRIGGER reject_relationship_journal ON sys_journal`.execute(runtime.db);}
  assert.equal(JSON.stringify(await ok('list_relationship_types',{workspaceId:ws.id})),before);
  await initializeDatabase(databaseURL,secret,baseURL);await initializeDatabase(databaseURL,secret,baseURL);
  assert.equal(JSON.stringify(await ok('list_relationship_types',{workspaceId:ws.id})),before);
  assert.ok((await ok('list_system_journal',{workspaceId:ws.id,entityKind:'relationship_type'})).entries.some((entry:any)=>entry.entity_name==='Project work'));
  await ok('configure_workspace_languages',{workspaceId:ws.id,version:1,availableLanguages:['de','en'],defaultLanguage:'en',labelLanguages:['de']});
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:2,configuration:{...base,labels:{en:'Unavailable edit'},active:false}})).statusCode,400);
  await tool('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:created.id,version:2,configuration:{...base,labels:{...base.labels,de:'Projektarbeit'},active:false}});
  assert.equal((await api('list_records',{objectTypeId:a.id},userCookie)).statusCode,403);
  await ok('set_workspace_member',{workspaceId:ws.id,userId:ordinary.id,role:null,expectedRole:'designer'});
});

test('record relationships enforce final-state cardinalities, Primary uniqueness/cycles and share one journal event across endpoints', async () => {
  const ws=await ok('create_workspace',{code:'edges',name:'Edges'});
  await enableProjects(ws.id);const models=await Promise.all(['contacts','projects','tasks'].map(async technicalName=>{const list=await ok('list_object_types',{workspaceId:ws.id});return list.find((o:any)=>o.technicalName===technicalName);}));
  const [parents,children,tasks]=models;
  const make=(model:any,keyword:string)=>model.id===parents.id?createOrganization(model.id,keyword):ok('create_record',{objectTypeId:model.id,keyword});
  const [a,b,c,d,e]=await Promise.all([make(parents,'Parent A'),make(parents,'Parent B'),make(children,'Child'),make(tasks,'Task'),make(tasks,'Other task')]);
  const types=await ok('list_relationship_types',{workspaceId:ws.id});
  const primary=types.find((t:any)=>t.kind==='primary');
  const config=(({id,workspaceId,technicalName,kind,rulesState,version,...rest}:any)=>rest)(primary);
  const configured=await enableProjects(ws.id);
  const active=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:primary.id,version:configured.version});
  const update=async(model:any,row:any,side:string,targets:any[])=>{const current=await ok('get_record',{objectTypeId:model.id,recordId:row.id});return api('update_record',{objectTypeId:model.id,recordId:row.id,version:current.version,relationships:[{relationshipTypeId:active.id,version:active.version,side,targets}]});};
  const ref=(model:any,row:any)=>({objectTypeId:model.id,recordId:row.id});
  assert.equal((await update(children,c,'right',[ref(parents,a)])).statusCode,200);
  assert.equal((await update(tasks,d,'right',[ref(children,c)])).statusCode,200);
  assert.equal((await update(parents,a,'right',[ref(tasks,d)])).statusCode,400,'Contact cannot have a parent');
  const priorB=await ok('get_record',{objectTypeId:parents.id,recordId:b.id});
  assert.equal((await update(parents,b,'left',[ref(tasks,d)])).statusCode,409,'second parent rejected across object pairs');
  assert.equal((await ok('get_record',{objectTypeId:parents.id,recordId:b.id})).version,priorB.version);
  assert.equal((await update(tasks,e,'right',[ref(parents,a),ref(children,c)])).statusCode,409);
  const fields=await tool('get_record_relationships',{objectTypeId:tasks.id,recordId:d.id});
  assert.equal(fields.fields.find((f:any)=>f.definition.id===active.id&&f.side==='right').targets[0].recordId,c.id);
  const journalC=await journalEntries({objectTypeId:children.id,recordId:c.id}),journalD=await journalEntries({objectTypeId:tasks.id,recordId:d.id});
  const shared=journalD.find((j:any)=>j.entity_kind==='relationship');
  assert.ok(shared);assert.ok(journalC.some((j:any)=>j.id===shared.id));assert.equal(shared.new_value.left.keyword,'Child');
  const before=await ok('get_record',{objectTypeId:tasks.id,recordId:d.id});
  assert.equal((await update(tasks,d,'right',[ref(children,c)])).statusCode,200);
  assert.equal((await ok('get_record',{objectTypeId:tasks.id,recordId:d.id})).version,before.version,'no-op does not bump version');
  const candidates=await ok('search_relationship_candidates',{objectTypeId:tasks.id,recordId:d.id,relationshipTypeId:active.id,side:'right',query:'Parent',limit:1});
  assert.equal(candidates.total,2);assert.equal(candidates.records.length,1);
  assert.equal((await api('get_record_relationships',{objectTypeId:tasks.id,recordId:d.id},userCookie)).statusCode,403);
  const snapshot=await ok('list_relationship_types',{workspaceId:ws.id});
  const now=snapshot.find((t:any)=>t.id===active.id);
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:active.id,version:now.version,configuration:{...config,active:true,allowAll:false,pairs:[{leftObjectTypeId:parents.id,rightObjectTypeId:children.id}]}})).statusCode,400,'cannot restrict the global Primary scope');
  await initializeDatabase(databaseURL,secret,baseURL);
  assert.equal((await ok('get_record_relationships',{objectTypeId:tasks.id,recordId:d.id})).edges.length,1,'repeated initialization preserves edges');
});

test('symmetric links, optimistic records and late journal failure preserve atomic record/edge state',async()=>{
  const ws=await ok('create_workspace',{code:'symedges',name:'Symmetric'}),model=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
  const a=await ok('create_record',{objectTypeId:model.id,keyword:'A'}),b=await ok('create_record',{objectTypeId:model.id,keyword:'B'}),c=await ok('create_record',{objectTypeId:model.id,keyword:'C'});
  const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((t:any)=>t.kind==='general');
  const active=await tool('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:general.id,version:general.version});
  const write=(row:any,targets:any[],version=row.version,keyword?:string)=>({objectTypeId:model.id,recordId:row.id,version,keyword,relationships:[{relationshipTypeId:active.id,version:active.version,side:'left',targets:targets.map(target=>({objectTypeId:model.id,recordId:target.id}))}]});
  assert.equal((await api('update_record',write(a,[b]))).statusCode,200);
  const currentB=await ok('get_record',{objectTypeId:model.id,recordId:b.id});
  assert.equal((await api('update_record',write(b,[a],currentB.version))).statusCode,200,'reverse symmetric request is a no-op');
  assert.equal((await ok('get_record',{objectTypeId:model.id,recordId:b.id})).version,currentB.version);
  assert.equal((await api('update_record',write(c,[c]))).statusCode,400);
  assert.equal((await api('update_record',write(c,[a,a]))).statusCode,400);
  const currentA=await ok('get_record',{objectTypeId:model.id,recordId:a.id});
  const outcomes=await Promise.all([api('update_record',write(a,[b,c],currentA.version)),api('update_record',write(a,[],currentA.version))]);
  assert.deepEqual(outcomes.map(r=>r.statusCode).sort(),[200,409]);
  const stable=await ok('get_record',{objectTypeId:model.id,recordId:a.id}),before=await ok('get_record_relationships',{objectTypeId:model.id,recordId:a.id});
  await sql`CREATE FUNCTION fail_edge_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_kind='relationship' THEN RAISE EXCEPTION 'edge journal failure'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER fail_edge_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_edge_journal()`.execute(runtime.db);
  try {
    const target=before.edges.length?[]:[b];
    assert.equal((await api('update_record',write(a,target,stable.version,'Must roll back'))).statusCode,500);
    assert.deepEqual(await ok('get_record',{objectTypeId:model.id,recordId:a.id}),stable);
    assert.deepEqual(await ok('get_record_relationships',{objectTypeId:model.id,recordId:a.id}),before);
  }finally{await sql`DROP TRIGGER fail_edge_journal ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_edge_journal()`.execute(runtime.db);}
  const foreign=await ok('create_workspace',{code:'foreignedges',name:'Foreign'}),other=await ok('create_object_type',{workspaceId:foreign.id,technicalName:'items',labels:{en:'Foreign'}}),otherRow=await ok('create_record',{objectTypeId:other.id});
  const current=await ok('get_record',{objectTypeId:model.id,recordId:a.id});
  const invalid=write(a,[],current.version);invalid.relationships[0].targets=[{objectTypeId:other.id,recordId:otherRow.id}];
  assert.equal((await api('update_record',invalid)).statusCode,400);
  await assert.rejects(sql`INSERT INTO sys_relationships(id,workspace_id,relationship_type_id,left_object_type_id,left_record_id,right_object_type_id,right_record_id,created_by) VALUES(${randomUUID()}::uuid,${ws.id}::uuid,${active.id}::uuid,${model.id}::uuid,${a.id}::uuid,${other.id}::uuid,${otherRow.id}::uuid,${adminId})`.execute(runtime.db),{code:'23503'});
});

test('minimum rules activate only after preflight and record creation supplies required relationships atomically',async()=>{
  const ws=await ok('create_workspace',{code:'minedges',name:'Minimums'}),parent=await ok('create_object_type',{workspaceId:ws.id,technicalName:'parents',labels:{en:'Parents'}}),child=await ok('create_object_type',{workspaceId:ws.id,technicalName:'children',labels:{en:'Children'}});
  const p=await ok('create_record',{objectTypeId:parent.id});
  const config={labels:{en:'Required parent'},leftLabels:{en:'Children'},rightLabels:{en:'Parent'},directed:true,leftMin:0,leftMax:null,rightMin:1,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:parent.id,rightObjectTypeId:child.id}],active:true};
  const type=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'required_parent',configuration:config});
  const active=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:type.id,version:type.version});
  assert.equal((await api('create_record',{objectTypeId:child.id})).statusCode,409,'missing required link rejects creation');
  const row=await ok('create_record',{objectTypeId:child.id,relationships:[{relationshipTypeId:active.id,version:active.version,side:'right',targets:[{objectTypeId:parent.id,recordId:p.id}]}]});
  assert.equal((await ok('get_record_relationships',{objectTypeId:child.id,recordId:row.id})).edges.length,1);
  assert.equal((await api('update_record',{objectTypeId:child.id,recordId:row.id,version:row.version,relationships:[{relationshipTypeId:active.id,version:active.version,side:'right',targets:[]}]})).statusCode,409);
  const p2=await ok('create_record',{objectTypeId:parent.id});
  const replaced=await tool('update_record',{objectTypeId:child.id,recordId:row.id,version:row.version,relationships:[{relationshipTypeId:active.id,version:active.version,side:'right',targets:[{objectTypeId:parent.id,recordId:p2.id}]}]});
  assert.equal((await ok('get_record_relationships',{objectTypeId:parent.id,recordId:p.id})).edges.length,0);
  const oneToOne=await ok('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:active.id,version:active.version,configuration:{...config,leftMax:1}});
  assert.equal((await api('create_record',{objectTypeId:child.id,relationships:[{relationshipTypeId:oneToOne.id,version:oneToOne.version,side:'right',targets:[{objectTypeId:parent.id,recordId:p2.id}]}]})).statusCode,409,'1:1 applies on both sides');
  assert.equal((await api('update_record',{objectTypeId:child.id,recordId:row.id,version:replaced.version,relationships:[{relationshipTypeId:active.id,version:active.version,side:'right',targets:[{objectTypeId:parent.id,recordId:p.id}]}]})).statusCode,409,'stale definition version rejected');
  const second=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'preflight',configuration:{...config,labels:{en:'Preflight'},rightMin:0}});
  const stricter=await ok('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:second.id,version:second.version,configuration:config});
  assert.equal((await api('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:second.id,version:stricter.version})).statusCode,409);
  assert.equal((await ok('list_relationship_types',{workspaceId:ws.id})).find((t:any)=>t.id===second.id).rulesState,'draft');
  const regular=(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0];
  await ok('set_workspace_member',{workspaceId:ws.id,userId:regular.id,role:'user',expectedRole:null});
  assert.equal((await api('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:second.id,version:stricter.version},userCookie)).statusCode,403);
  await ok('set_workspace_member',{workspaceId:ws.id,userId:regular.id,role:'designer',expectedRole:'user'});
  const preflight=await api('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:second.id,version:stricter.version},userCookie);
  assert.equal(preflight.statusCode,409);assert.ok(!preflight.body.includes(row.id),'Designer preflight errors expose no record identities');
});

test('undirected disjoint roles retain side labels and asymmetric cardinalities while removals retain shared history',async()=>{
  const ws=await ok('create_workspace',{code:'undirectedroles',name:'Roles'}),a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'a',labels:{en:'A'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'b',labels:{en:'B'}});
  const one=await ok('create_record',{objectTypeId:a.id}),two=await ok('create_record',{objectTypeId:a.id}),partner=await ok('create_record',{objectTypeId:b.id});
  const draft=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'roles',configuration:{labels:{en:'Roles'},leftLabels:{en:'Partners'},rightLabels:{en:'Owner'},directed:false,leftMin:0,leftMax:null,rightMin:0,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true}});
  const type=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:draft.id,version:draft.version});
  const saved=await ok('update_record',{objectTypeId:a.id,recordId:one.id,version:one.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[{objectTypeId:b.id,recordId:partner.id}]}]});
  assert.equal((await api('update_record',{objectTypeId:a.id,recordId:two.id,version:two.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[{objectTypeId:b.id,recordId:partner.id}]}]})).statusCode,409);
  const opposite=await ok('get_record_relationships',{objectTypeId:b.id,recordId:partner.id});
  assert.equal(opposite.fields[0].side,'right');assert.equal(opposite.fields[0].definition.rightLabels.en,'Owner');
  const original=(await journalEntries({objectTypeId:a.id,recordId:one.id})).find((e:any)=>e.entity_kind==='relationship');
  await ok('update_record',{objectTypeId:a.id,recordId:one.id,version:saved.version,relationships:[{relationshipTypeId:type.id,version:type.version,side:'left',targets:[]}]});
  assert.equal((await ok('get_record_relationships',{objectTypeId:b.id,recordId:partner.id})).edges.length,0);
  const historyA=await journalEntries({objectTypeId:a.id,recordId:one.id}),historyB=await journalEntries({objectTypeId:b.id,recordId:partner.id});
  assert.ok(historyB.some((e:any)=>e.id===original.id));
  const removed=historyA.find((e:any)=>e.entity_kind==='relationship'&&e.new_value===null);
  assert.ok(removed);assert.ok(historyB.some((e:any)=>e.id===removed.id));
  const used=(await ok('list_relationship_types',{workspaceId:ws.id})).find((d:any)=>d.id===type.id);assert.equal(used.pairLocked,true);
  const configuration=Object.fromEntries(['labels','leftLabels','rightLabels','directed','leftMin','leftMax','rightMin','rightMax','allowAll','pairs','active'].map(key=>[key,used[key]]));
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:used.id,version:used.version,configuration:{...configuration,pairs:[{leftObjectTypeId:b.id,rightObjectTypeId:a.id}]}})).statusCode,409,'historical use fixes the semantic object pair');
});

test('custom relationships reject unrestricted and multiple object pairs through API and MCP',async()=>{
  const ws=await ok('create_workspace',{code:'overlapedges',name:'Single pair'});
  const [a,b,c]=await Promise.all(['a','b','c'].map(technicalName=>ok('create_object_type',{workspaceId:ws.id,technicalName,labels:{en:technicalName}})));
  const base={labels:{en:'Pair'},leftLabels:{en:'Related'},rightLabels:{en:'Related'},directed:false,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true};
  for(const configuration of [{...base,allowAll:true,pairs:[]},{...base,pairs:[]},{...base,pairs:[...base.pairs,{leftObjectTypeId:b.id,rightObjectTypeId:c.id}]}])assert.equal((await api('create_relationship_type',{workspaceId:ws.id,technicalName:'invalid',configuration})).statusCode,400);
  const type=await tool('create_relationship_type',{workspaceId:ws.id,technicalName:'single_pair',configuration:base});
  assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:type.id,version:type.version,configuration:{...base,allowAll:true,pairs:[]}})).statusCode,400);
  const malformed=await client.callTool({name:'create_relationship_type',arguments:{workspaceId:ws.id,technicalName:'multi',configuration:{...base,pairs:[...base.pairs,{leftObjectTypeId:b.id,rightObjectTypeId:c.id}]}}});
  assert.equal(malformed.isError,true);
  await assert.rejects(sql`INSERT INTO sys_relationship_type_pairs VALUES(${type.id}::uuid,${ws.id}::uuid,${b.id}::uuid,${c.id}::uuid)`.execute(runtime.db),{code:'23505'});

});

test('relationship tree requires the Projects module through both API and MCP',async()=>{
  const ws=await ok('create_workspace',{code:'treemodule',name:'Tree module'});
  const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'},standardFields:['keyword']});
  const record=await ok('create_record',{objectTypeId:object.id,keyword:'Asset'}),input={objectTypeId:object.id,recordId:record.id};
  const denied=await api('get_relationship_tree_branch',input);assert.equal(denied.statusCode,409);assert.match(denied.json().error,/Projects module/);
  assert.equal((await client.callTool({name:'get_relationship_tree_branch',arguments:input})).isError,true);
  await enableProjects(ws.id);
  assert.equal((await ok('get_relationship_tree_branch',input)).total,0);
  assert.deepEqual(await tool('get_relationship_tree_branch',input),await ok('get_relationship_tree_branch',input));
  const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');
  await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:module.version,enabled:false});
  assert.equal((await api('get_relationship_tree_branch',input)).statusCode,409);
});

test('relationship tree branches derive only Primary context and descendants without cross references or writes',async()=>{
  const ws=await ok('create_workspace',{code:'treefixture',name:'Tree fixture'});
  await enableProjects(ws.id);const installed=await ok('list_object_types',{workspaceId:ws.id});const models=await Promise.all(['contacts','projects','cases','tasks','vehicles'].map(technicalName=>installed.find((o:any)=>o.technicalName===technicalName)??ok('create_object_type',{workspaceId:ws.id,technicalName,labels:{en:technicalName},standardFields:['keyword']})));
  const [contact,project,caseType,task,vehicle]=models;
  const make=(model:any,keyword:string)=>model.id===contact.id?createOrganization(model.id,keyword):ok('create_record',{objectTypeId:model.id,keyword});
  const [c,p,independent,ca,tc,tp,tcontact,standalone,v]=await Promise.all([make(contact,'Contact'),make(project,'Project'),make(project,'Independent project'),make(caseType,'Case'),make(task,'Case task'),make(task,'Project task'),make(task,'Contact task'),make(task,'Standalone'),make(vehicle,'Vehicle')]);
  const defs=await ok('list_relationship_types',{workspaceId:ws.id}),primary=defs.find((d:any)=>d.kind==='primary');
  const config=(({id,workspaceId,technicalName,kind,rulesState,version,...rest}:any)=>rest)(primary);
  const configured=await enableProjects(ws.id);
  const primaryActive=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:configured.id,version:configured.version});
  const general=defs.find((d:any)=>d.kind==='general'),generalActive=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:general.id,version:general.version});
  const directed=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'case_vehicle',configuration:{labels:{en:'Service'},leftLabels:{en:'Vehicles'},rightLabels:{en:'Cases'},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:caseType.id,rightObjectTypeId:vehicle.id}],active:true}});
  const service=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:directed.id,version:directed.version});
  const connect=async(a:any,ar:any,b:any,br:any,def:any=primaryActive)=>{
    const current=await ok('get_record',{objectTypeId:a.id,recordId:ar.id}),snapshot=await ok('get_record_relationships',{objectTypeId:a.id,recordId:ar.id});
    const field=snapshot.fields.find((f:any)=>f.definition.id===def.id&&f.side==='left');
    return ok('update_record',{objectTypeId:a.id,recordId:ar.id,version:current.version,relationships:[{relationshipTypeId:def.id,version:def.version,side:'left',targets:[...field.targets.map((r:any)=>({objectTypeId:r.objectTypeId,recordId:r.recordId})),{objectTypeId:b.id,recordId:br.id}]}]});
  };
  await connect(contact,c,project,p);await connect(project,p,caseType,ca);await connect(caseType,ca,task,tc);await connect(project,p,task,tp);await connect(contact,c,task,tcontact);
  await connect(caseType,ca,vehicle,v,service);await connect(contact,c,project,p,generalActive);
  const input=(model:any,row:any)=>({objectTypeId:model.id,recordId:row.id});
  const beforeJournal=(await sql<{count:number}>`SELECT count(*)::int AS count FROM sys_journal`.execute(runtime.db)).rows[0].count;
  const root=await ok('get_relationship_tree_branch',input(contact,c));
  assert.equal(root.ancestors.length,0);assert.equal(root.ancestorsTruncated,false);assert.equal(root.total,2);
  assert.deepEqual(root.children.map((n:any)=>n.kind),['primary','primary']);
  assert.equal(root.children.filter((n:any)=>n.record.recordId===p.id).length,1,'a parallel General link must not duplicate a Primary child');
  const pages=await Promise.all([0,1].map(offset=>ok('get_relationship_tree_branch',{...input(contact,c),offset,limit:1})));
  assert.equal(new Set(pages.flatMap(page=>page.children.map((n:any)=>n.edgeId))).size,2);
  const projectTree=await ok('get_relationship_tree_branch',input(project,p));
  assert.deepEqual(projectTree.ancestors.map((r:any)=>r.recordId),[c.id]);
  assert.ok(!projectTree.children.some((n:any)=>n.kind==='primary'&&n.record.recordId===c.id),'Primary parents are not descendants');
  assert.ok(projectTree.children.every((n:any)=>n.kind==='primary'&&n.direction==='outgoing'),'General and custom edges never create tree branches');
  const direct=await ok('get_relationship_tree_branch',input(task,tp));
  assert.deepEqual(direct.ancestors.map((r:any)=>r.recordId),[c.id,p.id],'no invented Case');assert.equal(direct.total,0);
  const deepest=await tool('get_relationship_tree_branch',input(task,tc));
  assert.deepEqual(deepest.ancestors.map((r:any)=>r.recordId),[c.id,p.id,ca.id]);
  assert.equal((await ok('get_relationship_tree_branch',input(project,independent))).ancestors.length,0);
  assert.equal((await ok('get_relationship_tree_branch',input(task,standalone))).total,0);
  const vehicleTree=await ok('get_relationship_tree_branch',input(vehicle,v));
  assert.equal(vehicleTree.ancestors.length,0);assert.equal(vehicleTree.total,0,'an incoming custom link does not create a Primary ancestor or descendant');
  const dossier=await ok('get_record_relationships',input(vehicle,v));assert.ok(dossier.dossier.some((entry:any)=>entry.record.recordId===ca.id),'custom links remain in the dossier');
  assert.deepEqual(await tool('get_relationship_tree_branch',input(contact,c)),root);
  assert.equal((await api('get_relationship_tree_branch',input(contact,c),userCookie)).statusCode,403);
  assert.equal((await api('get_relationship_tree_branch',{objectTypeId:task.id,recordId:c.id})).statusCode,404);
  assert.equal((await sql<{count:number}>`SELECT count(*)::int AS count FROM sys_journal`.execute(runtime.db)).rows[0].count,beforeJournal,'tree reads do not journal or change records');
  assert.equal((await api('set_definition_state',{kind:'object_type',id:caseType.id,expectedState:'active',state:'inactive'})).statusCode,409,'module levels cannot be deactivated');
});

test('Primary cannot form arbitrary deep or same-object hierarchies',async()=>{
  const ws=await ok('create_workspace',{code:'deeptree',name:'Fixed tree'});
  const primary=await enableProjects(ws.id),model=await ok('create_object_type',{workspaceId:ws.id,technicalName:'nodes',labels:{en:'Nodes'},standardFields:['keyword']});
  const parent=await ok('create_record',{objectTypeId:model.id,keyword:'Parent'});
  assert.equal((await api('create_record',{objectTypeId:model.id,keyword:'Child',relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:model.id,recordId:parent.id}]}]})).statusCode,400);
});

test('Projects activation gates global Primary while General is always available; module writes are scoped, versioned and journaled atomically',async()=>{
  const ws=await ok('create_workspace',{code:'projectmodule',name:'Projects module'});
  const a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'alpha',labels:{en:'Alpha'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'beta',labels:{en:'Beta'}});
  const ar=await ok('create_record',{objectTypeId:a.id}),br=await ok('create_record',{objectTypeId:b.id});
  const initial=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects'),types=await ok('list_relationship_types',{workspaceId:ws.id});
  assert.equal(initial.enabled,false);
  const primary=types.find((t:any)=>t.kind==='primary'),general=types.find((t:any)=>t.kind==='general');
  assert.equal(general.active,true);assert.equal(general.rulesState,'active');assert.equal(primary.active,false);assert.equal(primary.allowAll,true);assert.equal(primary.pairs.length,0);
  assert.ok(!(await ok('get_record_relationships',{objectTypeId:a.id,recordId:ar.id})).fields.some((f:any)=>f.definition.kind==='primary'));
  assert.equal((await api('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:primary.id,version:primary.version})).statusCode,400);
  const enabled=await tool('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:initial.version});
  assert.equal(enabled.enabled,true);
  assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:false,version:initial.version})).statusCode,409);
  const currentPrimary=(await ok('list_relationship_types',{workspaceId:ws.id})).find((t:any)=>t.kind==='primary');
  const later=await ok('create_object_type',{workspaceId:ws.id,technicalName:'later',labels:{en:'Later'}});
  assert.equal((await ok('get_record_relationships',{objectTypeId:later.id})).fields.filter((f:any)=>f.definition.kind==='primary').length,1,'custom objects can have one direct Primary parent but cannot become a Primary level');
  const root=await createOrganization(enabled.primaryChain.contact);
  const linked=await ok('update_record',{objectTypeId:b.id,recordId:br.id,version:br.version,relationships:[{relationshipTypeId:currentPrimary.id,version:currentPrimary.version,side:'right',targets:[{objectTypeId:enabled.primaryChain.contact,recordId:root.id}]}]});
  assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:false,version:enabled.version})).statusCode,409,'module off must not orphan existing Primary links');
  await ok('update_record',{objectTypeId:b.id,recordId:br.id,version:linked.version,relationships:[{relationshipTypeId:currentPrimary.id,version:currentPrimary.version,side:'right',targets:[]}]});
  const disabled=await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:false,version:enabled.version});
  assert.equal(disabled.enabled,false);assert.equal((await ok('get_record_relationships',{objectTypeId:b.id,recordId:br.id})).fields.some((f:any)=>f.definition.kind==='primary'),false);
  const events=(await sql<{change_id:string}>`SELECT change_id FROM sys_journal WHERE workspace_id=${ws.id}::uuid AND field_key='module.projects' ORDER BY id DESC LIMIT 1`.execute(runtime.db)).rows;
  assert.equal((await sql`SELECT id FROM sys_journal WHERE change_id=${events[0].change_id}::uuid`.execute(runtime.db)).rows.length,2);
  const before=await ok('list_relationship_types',{workspaceId:ws.id});
  await sql`CREATE FUNCTION fail_module_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key='module.projects' THEN RAISE EXCEPTION 'module journal failure'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER fail_module_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_module_journal()`.execute(runtime.db);
  try{assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:disabled.version})).statusCode,500);assert.deepEqual(await ok('list_relationship_types',{workspaceId:ws.id}),before);assert.deepEqual((await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects'),disabled);}
  finally{await sql`DROP TRIGGER fail_module_journal ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_module_journal()`.execute(runtime.db);}
  const user=(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0];
  await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
  assert.equal((await api('list_workspace_modules',{workspaceId:ws.id},userCookie)).statusCode,200);
  assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:disabled.version},userCookie)).statusCode,403);
  await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:'user'});
  assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:disabled.version},userCookie)).statusCode,200);
});

test('definition versions reject stale API/MCP drafts and protected fields retain configurable input aids',async()=>{
  const ws=await ok('create_workspace',{code:'versionedmeta',name:'Versions'});
  const type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
  const field=await ok('create_field',{objectTypeId:type.id,technicalName:'detail',labels:{en:'Detail'}});
  const original=(await ok('get_object_type',{objectTypeId:type.id})).fields[0];
  const next=await tool('configure_field',{fieldId:field.id,version:original.version,required:false,labels:{en:'New'}});
  const current=next.fields[0];assert.ok(current.version>original.version);
  const events=(await sql`SELECT id FROM sys_journal WHERE entity_id=${field.id}::uuid`.execute(runtime.db)).rows.length;
  assert.equal((await api('configure_field',{fieldId:field.id,version:original.version,required:true})).statusCode,409);
  const stale=await client.callTool({name:'set_labels',arguments:{kind:'field',id:field.id,version:original.version,labels:{en:'Stale'}}});assert.equal(stale.isError,true);
  const missing=await runtime.app.inject({method:'POST',url:'/api/v1/configure_field',headers:{host:'127.0.0.1:4100',cookie:adminCookie,'x-xobject-request':'1'},payload:{fieldId:field.id,required:false}});assert.equal(missing.statusCode,400);
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id=${field.id}::uuid`.execute(runtime.db)).rows.length,events);
  await sql`UPDATE sys_fields SET is_protected=true WHERE id=${field.id}::uuid`.execute(runtime.db);
  assert.equal((await api('configure_field',{fieldId:field.id,version:current.version,kind:'integer',required:false})).statusCode,403);
  assert.equal((await api('set_labels',{kind:'field',id:field.id,version:current.version,labels:{en:'Forbidden'}})).statusCode,403);
  const protectedSaved=await ok('configure_field',{fieldId:field.id,version:current.version,required:true,labels:current.labels});
  const protectedCurrent=protectedSaved.fields.find((f:any)=>f.id===field.id);
  assert.equal((await ok('configure_field',{fieldId:field.id,version:protectedCurrent.version,required:true,labels:protectedCurrent.labels})).fields.find((f:any)=>f.id===field.id).version,protectedCurrent.version);
  const choice=await ok('create_field',{objectTypeId:type.id,technicalName:'selection',kind:'single_choice',labels:{en:'Selection'},config:{options:[]}});
  await sql`UPDATE sys_fields SET is_protected=true WHERE id=${choice.id}::uuid`.execute(runtime.db);
  await tool('configure_field',{fieldId:choice.id,required:false,config:{options:[{id:randomUUID(),labels:{en:'Allowed input aid'},active:true}]}});
  const before=await ok('get_object_type',{objectTypeId:type.id});
  await ok('set_labels',{kind:'object_type',id:type.id,version:before.version,labels:{en:'Renamed'}});
  assert.equal((await api('set_labels',{kind:'object_type',id:type.id,version:before.version,labels:{en:'Stale'}})).statusCode,409);
});

test('deferred registry checks reject orphan rows, registrations and identity moves without changing retained data',async()=>{
  const ws=await ok('create_workspace',{code:'identityguard',name:'Integrity'});
  const type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
  const record=await ok('create_record',{objectTypeId:type.id});
  await assert.rejects(sql`DELETE FROM identityguard_items WHERE id=${record.id}::uuid`.execute(runtime.db),{code:'23503'});
  await assert.rejects(sql`DELETE FROM sys_record_identities WHERE object_type_id=${type.id}::uuid AND record_id=${record.id}::uuid`.execute(runtime.db),{code:'23503'});
  await assert.rejects(sql`UPDATE identityguard_items SET id=${randomUUID()}::uuid WHERE id=${record.id}::uuid`.execute(runtime.db),{code:'23503'});
  await assert.rejects(sql`INSERT INTO identityguard_items(id,created_by,updated_by) VALUES(${randomUUID()}::uuid,${adminId},${adminId})`.execute(runtime.db),{code:'23503'});
  await assert.rejects(sql`INSERT INTO sys_record_identities VALUES(${ws.id}::uuid,${type.id}::uuid,${randomUUID()}::uuid)`.execute(runtime.db),{code:'23503'});
  assert.deepEqual(await ok('get_record',{objectTypeId:type.id,recordId:record.id}),record);
});

test('readers share schema/workspace locks while unrelated workspace writes proceed and schema changes wait',async()=>{
  const {lockOperation}=await import('../src/operation-locks.js');
  const ws=await ok('create_workspace',{code:'lockscope',name:'Lock scope'}),other=await ok('create_workspace',{code:'lockother',name:'Other'});
  const holder=new PgClient({connectionString:databaseURL});await holder.connect();
  try {
    await holder.query('BEGIN');await holder.query("SELECT pg_advisory_xact_lock_shared(hashtext('xobject:model'))");
    await holder.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",[`xobject:workspace:${ws.id}`]);
    const attempt=(operation:Operation,workspaceId:string)=>runtime.db.transaction().execute(async tx=>{await sql`SET LOCAL lock_timeout='100ms'`.execute(tx);await lockOperation(tx,operation,{workspaceId});});
    await attempt('list_object_types',ws.id);
    await assert.rejects(attempt('configure_workspace_module',other.id),{code:'55P03'},'module installation may create tables and requires the schema barrier');
    await assert.rejects(attempt('configure_workspace_module',ws.id),{code:'55P03'});
    await assert.rejects(attempt('configure_workspace_module',ws.id.toUpperCase()),{code:'55P03'});
    await assert.rejects(attempt('create_field',other.id),{code:'55P03'});
  }finally{await holder.query('ROLLBACK');await holder.end();}
});

test('scalar saves avoid graph scans but changed endpoints still enforce minimums, maxima and cycles',async()=>{
  const ws=await ok('create_workspace',{code:'targetgraph',name:'Targeted validation'});
  await enableProjects(ws.id);const a=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts'),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'children',labels:{en:'Children'},standardFields:['keyword']});
  const parent=await createOrganization(a.id),child=await ok('create_record',{objectTypeId:b.id,keyword:'Child'});
  const primary=await enableProjects(ws.id);
  await ok('update_record',{objectTypeId:b.id,recordId:child.id,version:child.version,relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:a.id,recordId:parent.id}]}]});
  const current=await ok('get_record',{objectTypeId:b.id,recordId:child.id});
  const holder=new PgClient({connectionString:databaseURL});await holder.connect();
  let request:Promise<unknown>|undefined,timer:ReturnType<typeof globalThis.setTimeout>|undefined;
  try {
    await holder.query('BEGIN');await holder.query('LOCK TABLE targetgraph_contacts IN ACCESS EXCLUSIVE MODE');
    request=ok('update_record',{objectTypeId:b.id,recordId:child.id,version:current.version,keyword:'Changed'});
    const saved=await Promise.race([request,new Promise<never>((_,reject)=>{timer=globalThis.setTimeout(()=>reject(new Error('Scalar save scanned an unrelated locked content table')),1500);})]) as {keyword:string};
    assert.equal(saved.keyword,'Changed');
  }finally{if(timer)globalThis.clearTimeout(timer);await holder.query('ROLLBACK');await holder.end();await request;}

  // Existing integration scenarios above cover changed-edge cardinalities and Primary cycles.
  const before=(await sql`SELECT * FROM sys_schema_version`.execute(runtime.db)).rows;
  await initializeDatabase(databaseURL,secret,baseURL);assert.deepEqual((await sql`SELECT * FROM sys_schema_version`.execute(runtime.db)).rows,before);

});

test('runtime role can manage dynamic objects and journal changes without superuser or journal/installation-marker mutation rights',async()=>{
  const {provisionRuntimeRole}=await import('../src/database-roles.js');
  const {connect}=await import('../src/database.js');const {Application}=await import('../src/domain.js');
  const url=new URL(databaseURL);url.username='xobject_runtime_test';url.password=randomBytes(24).toString('hex');
  await provisionRuntimeRole(databaseURL,url.href);
  const {db}=connect(url.href);
  try {
    const role=(await sql<{rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean}>`SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`.execute(db)).rows[0];assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false});
    const app=new Application(db);
    const ws=await app.execute('create_workspace',{code:'runtimerole',name:'Runtime'},adminId) as {id:string};
    const model=await app.execute('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}},adminId) as {id:string};
    const field=await app.execute('create_field',{objectTypeId:model.id,technicalName:'detail',labels:{en:'Detail'}},adminId) as {id:string};
    const record=await app.execute('create_record',{objectTypeId:model.id,values:{detail:'Value'}},adminId) as {id:string;version:number};
    await app.execute('configure_field',{fieldId:field.id,version:1,required:true},adminId);
    await app.execute('update_record',{objectTypeId:model.id,recordId:record.id,version:record.version,values:{detail:'New value'}},adminId);
    await assert.rejects(sql`DELETE FROM sys_journal WHERE false`.execute(db),{code:'42501'});
    await assert.rejects(sql`UPDATE sys_journal SET field_key=field_key WHERE false`.execute(db),{code:'42501'});
    await assert.rejects(sql`UPDATE sys_schema_version SET definition_hash='forbidden'`.execute(db),{code:'42501'});
    await assert.rejects(sql`ALTER TABLE sys_fields ADD COLUMN forbidden text`.execute(db),{code:'42501'});
    await assert.rejects(sql`CREATE ROLE forbidden_runtime_role`.execute(db),{code:'42501'});
    await assert.rejects(sql`DELETE FROM runtimerole_items WHERE id=${record.id}::uuid`.execute(db),{code:'23503'});
    await provisionRuntimeRole(databaseURL,url.href); // no credential rotation
  }finally{await db.destroy();}
});


test('conditional fields enforce the final record through API and MCP and retain definition dependencies',async()=>{
  const ws=await ok('create_workspace',{name:'Conditional fields',code:'conditional'});
  const model=await ok('create_object_type',{workspaceId:ws.id,technicalName:'parties',labels:{en:'Parties'}});
  const org=randomUUID(),person=randomUUID(),other=randomUUID();
  const options=[{id:org,labels:{en:'Organization'},active:true},{id:person,labels:{en:'Person'},active:true},{id:other,labels:{en:'Other'},active:true}];
  const control=await ok('create_field',{objectTypeId:model.id,technicalName:'party_kind',labels:{en:'Party kind'},kind:'single_choice',config:{options},required:true});
  const rule={fieldId:control.id,optionIds:[person]};
  const detail=await tool('create_field',{objectTypeId:model.id,technicalName:'birth_date',labels:{en:'Birthday'},kind:'date',required:true,applicability:rule});
  const organization=await ok('create_record',{objectTypeId:model.id,values:{party_kind:org}});
  assert.equal((await api('create_record',{objectTypeId:model.id,values:{party_kind:person}})).statusCode,400);
  assert.equal((await api('create_record',{objectTypeId:model.id,values:{party_kind:org,birth_date:'2000-01-01'}})).statusCode,400);
  const human=await tool('create_record',{objectTypeId:model.id,values:{party_kind:person,birth_date:'2000-01-01'}});
  const before=(await sql`SELECT count(*)::int AS n FROM sys_journal`.execute(runtime.db)).rows;
  assert.equal((await api('update_record',{objectTypeId:model.id,recordId:human.id,version:human.version,values:{party_kind:org}})).statusCode,400);
  assert.deepEqual((await sql`SELECT count(*)::int AS n FROM sys_journal`.execute(runtime.db)).rows,before);
  assert.equal((await ok('get_record',{objectTypeId:model.id,recordId:human.id})).birth_date,'2000-01-01');
  for(const [technicalName,kind,value] of [['conditional_flag','boolean',false],['conditional_count','integer','0']] as const) {
    await ok('create_field',{objectTypeId:model.id,technicalName,labels:{en:technicalName},kind,applicability:rule});
    assert.equal((await api('update_record',{objectTypeId:model.id,recordId:organization.id,version:organization.version,values:{[technicalName]:value}})).statusCode,400);
  }
  const changed=await tool('update_record',{objectTypeId:model.id,recordId:human.id,version:human.version,values:{party_kind:org,birth_date:null}});
  assert.equal(changed.birth_date,null);
  assert.equal((await api('configure_field',{fieldId:control.id,required:true,kind:'text'})).statusCode,409);
  assert.equal((await api('configure_field',{fieldId:control.id,required:true,kind:'single_choice',config:{options:options.filter(option=>option.id!==person)}})).statusCode,400);
  assert.equal((await api('set_definition_state',{kind:'field',id:control.id,expectedState:'active',state:'inactive',confirm:true})).statusCode,409);
  const foreign=await ok('create_object_type',{workspaceId:ws.id,technicalName:'foreign_model',labels:{en:'Foreign'}});
  assert.equal((await api('create_field',{objectTypeId:foreign.id,technicalName:'detail',labels:{en:'Detail'},kind:'text',applicability:rule})).statusCode,400);
  const bad=(await api('configure_field',{fieldId:detail.id,required:true,applicability:{fieldId:control.id,optionIds:[org]}}));assert.equal(bad.statusCode,400,bad.body);
  await ok('configure_field',{fieldId:detail.id,required:false});
  const latest=await ok('get_object_type',{objectTypeId:model.id});assert.deepEqual(latest.fields.find((f:any)=>f.id===detail.id).applicability,rule);
  assert.equal((await api('list_record_journal',{objectTypeId:model.id,recordId:organization.id},userCookie)).statusCode,403);
});

test('paged record journal reconstructs historical field kinds/config and keeps edge identity',async()=>{
  const ws=await ok('create_workspace',{name:'History context',code:'historyctx'});
  const model=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
  const field=await ok('create_field',{objectTypeId:model.id,technicalName:'test_value',labels:{en:'Value'},kind:'text'});
  const row=await ok('create_record',{objectTypeId:model.id,keyword:'Item',values:{test_value:'true'}});
  await ok('configure_field',{fieldId:field.id,required:false,kind:'boolean'});
  let history=await tool('list_record_journal',{objectTypeId:model.id,recordId:row.id,fieldId:field.id,limit:1});
  assert.equal(history.total,2);assert.equal(history.entries.length,1);
  assert.equal(history.entries[0].old_value,'true');assert.equal(history.entries[0].new_value,true);
  assert.equal(history.entries[0].value_context.before.kind,'text');assert.equal(history.entries[0].value_context.after.kind,'boolean');
  const conversion=history.entries[0];
  await ok('configure_field',{fieldId:field.id,required:false,kind:'text'});
  history=await ok('list_record_journal',{objectTypeId:model.id,recordId:row.id,fieldId:field.id,offset:1,limit:1});
  assert.equal(history.entries[0].id,conversion.id);assert.deepEqual(history.entries[0].value_context,conversion.value_context);
  const historical=await journalEntries({objectTypeId:model.id,recordId:row.id});
  assert.equal(historical.find((entry:any)=>entry.id===conversion.id).old_value,'true');
  const optionId=randomUUID(),oldConfig={options:[{id:optionId,labels:{en:'Original choice'},active:true}]};
  const choice=await ok('create_field',{objectTypeId:model.id,technicalName:'choice_value',labels:{en:'Choice'},kind:'single_choice',config:oldConfig});
  const currentChoiceRecord=await ok('get_record',{objectTypeId:model.id,recordId:row.id});
  await ok('update_record',{objectTypeId:model.id,recordId:row.id,version:currentChoiceRecord.version,values:{choice_value:optionId}});
  await ok('configure_field',{fieldId:choice.id,required:false,config:{options:[{id:optionId,labels:{en:'Renamed choice'},active:true}]}});
  const choiceHistory=await ok('list_record_journal',{objectTypeId:model.id,recordId:row.id,fieldId:choice.id});
  assert.equal(choiceHistory.entries[0].value_context.after.config.options[0].labels.en,'Original choice');
  const target=await ok('create_record',{objectTypeId:model.id,keyword:'Target'});
  const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((item:any)=>item.kind==='general');
  const current=await ok('get_record',{objectTypeId:model.id,recordId:row.id});
  await ok('update_record',{objectTypeId:model.id,recordId:row.id,version:current.version,relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:model.id,recordId:target.id}]}]});
  const edges=await ok('list_record_journal',{objectTypeId:model.id,recordId:row.id,entityKind:'relationship'});
  assert.equal(edges.total,1);assert.notEqual(edges.entries[0].entity_id,row.id);
  assert.equal(edges.entries[0].entity_id,(await ok('get_record_relationships',{objectTypeId:model.id,recordId:row.id})).edges[0].id);
  const otherField=await ok('create_field',{objectTypeId:(await ok('create_object_type',{workspaceId:ws.id,technicalName:'others',labels:{en:'Others'}})).id,technicalName:'other',labels:{en:'Other'}});
  assert.equal((await api('list_record_journal',{objectTypeId:model.id,recordId:row.id,fieldId:otherField.id})).statusCode,400);
});

test('dossier projects opposite endpoint standard fields through API/MCP without changing edges or history',async()=>{
  const ws=await ok('create_workspace',{code:'dossier',name:'Dossier'});
  const source=await ok('create_object_type',{workspaceId:ws.id,technicalName:'sources',labels:{en:'Sources'},standardFields:['keyword']});
  const target=await ok('create_object_type',{workspaceId:ws.id,technicalName:'targets',labels:{en:'Targets'},standardFields:['keyword','type_status','category']});
  const empty=await ok('create_object_type',{workspaceId:ws.id,technicalName:'empty_model',labels:{en:'Empty'}});
  const type=randomUUID(),status=randomUUID(),cat=randomUUID();
  const config={type:{required:false,defaultId:null},status:{required:false,defaults:[]},category:{required:false,multiple:true,defaultIds:[]},options:[{id:type,kind:'type',typeId:null,labels:{de:'Kunde',en:'Customer'},active:true},{id:status,kind:'status',typeId:type,labels:{de:'Aktiv',en:'Active'},active:true},{id:cat,kind:'category',typeId:null,labels:{de:'Intern',en:'Internal'},active:true}]};
  await ok('configure_classification',{objectTypeId:target.id,version:1,config});
  const a=await ok('create_record',{objectTypeId:source.id,keyword:'Source'}),b=await ok('create_record',{objectTypeId:target.id,keyword:'Target',classification:{type,status,category:[cat]}}),c=await ok('create_record',{objectTypeId:empty.id});
  const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((d:any)=>d.kind==='general');
  await ok('update_record',{objectTypeId:source.id,recordId:a.id,version:a.version,relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:target.id,recordId:b.id},{objectTypeId:empty.id,recordId:c.id}]}]});
  const journals=(await sql`SELECT * FROM sys_journal ORDER BY id`.execute(runtime.db)).rows;
  const fromSource=await ok('get_record_relationships',{objectTypeId:source.id,recordId:a.id});
  const projected=fromSource.dossier.find((e:any)=>e.record.recordId===b.id);
  assert.equal(projected.record.type,type);assert.equal(projected.record.status,status);assert.deepEqual(projected.record.category,[cat]);
  assert.equal(projected.record.classificationOptions.find((o:any)=>o.id===type).labels.de,'Kunde');
  assert.equal(projected.id,fromSource.edges.find((e:any)=>e.left.recordId===b.id||e.right.recordId===b.id).id);
  const noFields=fromSource.dossier.find((e:any)=>e.record.recordId===c.id).record;
  assert.equal(noFields.type,null);assert.equal(noFields.status,null);assert.deepEqual(noFields.category,[]);assert.deepEqual(noFields.classificationOptions,[]);
  const reverse=await tool('get_record_relationships',{objectTypeId:target.id,recordId:b.id});
  assert.equal(reverse.dossier[0].record.recordId,a.id);assert.equal(reverse.dossier[0].record.type,null);
  assert.deepEqual((await sql`SELECT * FROM sys_journal ORDER BY id`.execute(runtime.db)).rows,journals);
  const renamed={...config,options:config.options.map(option=>option.id===type?{...option,labels:{de:'Bestandskunde',en:'Existing customer'},active:false}:option)};
  await ok('configure_classification',{objectTypeId:target.id,version:2,config:renamed});
  const retained=await tool('get_record_relationships',{objectTypeId:source.id,recordId:a.id});
  assert.equal(retained.dossier.find((e:any)=>e.record.recordId===b.id).record.classificationOptions.find((o:any)=>o.id===type).labels.de,'Bestandskunde');
  assert.deepEqual(retained.edges,fromSource.edges);
  assert.equal((await api('get_record_relationships',{objectTypeId:source.id,recordId:a.id},userCookie)).statusCode,403);
});

test('relationship picker object filters apply before server pagination and never broaden eligible endpoints',async()=>{
  const ws=await ok('create_workspace',{code:'picker',name:'Picker'});
  const make=async(technicalName:string)=>ok('create_object_type',{workspaceId:ws.id,technicalName,labels:{en:technicalName},standardFields:['keyword']});
  const a=await make('source'),b=await make('partners'),c=await make('others');
  const root=await ok('create_record',{objectTypeId:a.id,keyword:'Root'});
  for(let n=0;n<11;n++)await ok('create_record',{objectTypeId:b.id,keyword:`Row ${String(n).padStart(2,'0')}`});
  await ok('create_record',{objectTypeId:c.id,keyword:'Row other'});
  const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((item:any)=>item.kind==='general');
  const input={objectTypeId:a.id,recordId:root.id,relationshipTypeId:general.id,side:'left',targetObjectTypeId:b.id.toUpperCase(),limit:5,offset:5,query:'Row'};
  const page=await ok('search_relationship_candidates',input);
  assert.equal(page.total,11);assert.equal(page.records.length,5);assert.equal(page.records[0].keyword,'Row 05');assert.ok(page.records.every((record:any)=>record.objectTypeId===b.id));
  assert.deepEqual(await tool('search_relationship_candidates',input),page);
  const custom=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'picker_link',configuration:{labels:{en:'Partners'},leftLabels:{en:'Partners'},rightLabels:{en:'Sources'},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true}});
  await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:custom.id,version:custom.version});
  assert.equal((await ok('search_relationship_candidates',{...input,relationshipTypeId:custom.id,targetObjectTypeId:c.id,offset:0})).total,0);
  assert.equal((await ok('search_relationship_candidates',{...input,targetObjectTypeId:a.id,query:'',offset:0})).total,0,'self remains excluded');
  const otherWorkspace=await ok('create_workspace',{code:'pickerother',name:'Other'});
  const foreign=await ok('create_object_type',{workspaceId:otherWorkspace.id,technicalName:'foreign_picker',labels:{en:'Foreign'}});
  assert.equal((await ok('search_relationship_candidates',{...input,targetObjectTypeId:foreign.id,offset:0})).total,0);
  await ok('set_definition_state',{kind:'object_type',id:b.id,expectedState:'active',state:'inactive'});
  assert.equal((await ok('search_relationship_candidates',input)).total,0,'inactive definitions cannot receive new assignments');
  assert.equal((await api('search_relationship_candidates',input,userCookie)).statusCode,403);
});

test('fixed module Primary levels use stable identities, inherited context and common API/MCP rules',async()=>{
  const catalog=await client.listTools();assert.ok(!catalog.tools.some(tool=>tool.name==='configure_primary_chain'));assert.ok(catalog.tools.some(tool=>tool.name==='get_primary_chain_context'));
  const ws=await ok('create_workspace',{name:'Primary levels',code:'primarylevels'});
  await enableProjects(ws.id);const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');
  const levels=module.primaryChain;
  const ids:Record<string,string>={customers:levels.contact,jobs:levels.project,tickets:levels.case,items:(await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']})).id};
  const rows:Record<string,any>={};for(const name of Object.keys(ids))rows[name]=name==='customers'?await createOrganization(ids[name],name):await ok('create_record',{objectTypeId:ids[name],keyword:name});
  async function assign(child:string,parent:string|null){const record=await ok('get_record',{objectTypeId:ids[child],recordId:rows[child].id});const field=(await ok('get_record_relationships',{objectTypeId:ids[child],recordId:record.id})).fields.find((f:any)=>f.definition.kind==='primary'&&f.side==='right');return api('update_record',{objectTypeId:ids[child],recordId:record.id,version:record.version,relationships:[{relationshipTypeId:field.definition.id,version:field.definition.version,side:'right',targets:parent?[{objectTypeId:ids[parent],recordId:rows[parent].id}]:[]}]});}
  for(const [child,parent] of [['jobs','customers'],['tickets','jobs'],['items','tickets']])assert.equal((await assign(child,parent)).statusCode,200);
  const args={objectTypeId:ids.items,recordId:rows.items.id};const before=(await sql`SELECT * FROM sys_journal ORDER BY id`.execute(runtime.db)).rows;
  const context=await ok('get_primary_chain_context',args);assert.deepEqual(await tool('get_primary_chain_context',args),context);
  assert.deepEqual(await ok('get_primary_chain_context',{objectTypeId:ids.items.toUpperCase(),recordId:rows.items.id.toUpperCase(),parent:{objectTypeId:ids.tickets.toUpperCase(),recordId:rows.tickets.id.toUpperCase()}}),context);
  assert.deepEqual(context.levels.map((level:any)=>[level.role,level.record.recordId,level.inherited]),[['contact',rows.customers.id,true],['project',rows.jobs.id,true],['case',rows.tickets.id,false]]);
  assert.deepEqual((await sql`SELECT * FROM sys_journal ORDER BY id`.execute(runtime.db)).rows,before);
  assert.equal((await assign('jobs','tickets')).statusCode,400);
  const primary=(await ok('list_relationship_types',{workspaceId:ws.id})).find((type:any)=>type.kind==='primary');
  const candidates=await ok('search_relationship_candidates',{objectTypeId:ids.jobs,recordId:rows.jobs.id,relationshipTypeId:primary.id,side:'right'});assert.deepEqual(candidates.records.map((row:any)=>row.objectTypeId),[ids.customers]);
  assert.equal((await api('set_definition_state',{kind:'object_type',id:ids.tickets,expectedState:'active',state:'inactive'})).statusCode,409);
  assert.equal((await api('get_primary_chain_context',args,userCookie)).statusCode,403);
  const skip=await ok('get_primary_chain_context',{...args,parent:{objectTypeId:ids.customers,recordId:rows.customers.id}});assert.deepEqual(skip.levels.map((level:any)=>level.record?.recordId??null),[rows.customers.id,null,null]);
});

test('relationship endpoint rules constrain candidates and all final record writes, with protected controller dependencies',async()=>{
  const ws=await ok('create_workspace',{name:'Contact rules',code:'contactrules'});
  const type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'people',labels:{en:'People'},standardFields:['keyword']});
  const org=randomUUID(),person=randomUUID(),individual=randomUUID();
  const kind=await ok('create_field',{objectTypeId:type.id,technicalName:'kind',labels:{en:'Kind'},kind:'single_choice',config:{options:[org,person,individual].map((id,i)=>({id,labels:{en:['Organization','Contact person','Individual'][i]},active:true}))}});
  const records=[];for(const [i,id] of [org,person,individual].entries())records.push(await ok('create_record',{objectTypeId:type.id,keyword:String(i),values:{kind:id}}));
  const configuration={labels:{en:'Contact person'},leftLabels:{en:'Contact persons'},rightLabels:{en:'Organization'},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:type.id,rightObjectTypeId:type.id}],active:true,leftApplicability:{fieldId:kind.id,optionIds:[org]},rightApplicability:{fieldId:kind.id,optionIds:[person]}};
  let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'organization_membership',configuration});relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
  const candidates=await ok('search_relationship_candidates',{objectTypeId:type.id,recordId:records[1].id,relationshipTypeId:relation.id,side:'right'});assert.deepEqual(candidates.records.map((row:any)=>row.recordId),[records[0].id]);
  assert.equal((await ok('search_relationship_candidates',{objectTypeId:type.id,recordId:records[2].id,relationshipTypeId:relation.id,side:'right'})).total,0);
  assert.equal((await ok('search_relationship_candidates',{objectTypeId:type.id,recordId:records[2].id,relationshipTypeId:relation.id,side:'right',sourceValues:{kind:person}})).total,1,'a permitted staged controller value can prepare an atomic record-kind/link change');
  const write=(target:any)=>[{relationshipTypeId:relation.id,version:relation.version,side:'right',targets:[{objectTypeId:type.id,recordId:target.id}]}];
  assert.equal((await api('update_record',{objectTypeId:type.id,recordId:records[1].id,version:records[1].version,relationships:write(records[2])})).statusCode,409);
  await tool('update_record',{objectTypeId:type.id,recordId:records[1].id,version:records[1].version,relationships:write(records[0])});
  let current=await ok('get_record',{objectTypeId:type.id,recordId:records[1].id});const count=(await sql`SELECT id FROM sys_journal WHERE workspace_id=${ws.id}::uuid`.execute(runtime.db)).rows.length;
  assert.equal((await api('update_record',{objectTypeId:type.id,recordId:current.id,version:current.version,values:{kind:org}})).statusCode,409,'scalar discriminator changes cannot bypass relationship conditions');
  assert.equal((await sql`SELECT id FROM sys_journal WHERE workspace_id=${ws.id}::uuid`.execute(runtime.db)).rows.length,count);
  assert.equal((await api('set_definition_state',{kind:'field',id:kind.id,expectedState:'active',state:'inactive'})).statusCode,409);
  assert.equal((await api('configure_field',{fieldId:kind.id,required:false,kind:'text',config:{}})).statusCode,409);
  current=await ok('update_record',{objectTypeId:type.id,recordId:current.id,version:current.version,values:{kind:org},relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'right',targets:[]}]});assert.equal(current.kind,org);
  const invalid={...configuration,rightApplicability:{fieldId:kind.id,optionIds:[individual]}};await ok('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version,configuration:invalid});
  const identityRule={fieldId:kind.id,optionIds:[individual,person]},identityConfig={...configuration,labels:{en:'Identities'},leftLabels:{en:'Identities'},rightLabels:{en:'Identities'},directed:false,rightMax:null,leftApplicability:identityRule,rightApplicability:identityRule};
  let identity=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'identities',configuration:identityConfig});identity=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:identity.id,version:identity.version});
  const another=await ok('create_record',{objectTypeId:type.id,keyword:'Another contact person',values:{kind:person}});
  const identityCandidates=await tool('search_relationship_candidates',{objectTypeId:type.id,recordId:another.id,relationshipTypeId:identity.id,side:'left'});assert.deepEqual(identityCandidates.records.map((row:any)=>row.recordId),[records[2].id]);
  await tool('update_record',{objectTypeId:type.id,recordId:another.id,version:another.version,relationships:[{relationshipTypeId:identity.id,version:identity.version,side:'left',targets:[{objectTypeId:type.id,recordId:records[2].id}]}]});
  assert.equal((await ok('get_record_relationships',{objectTypeId:type.id,recordId:records[2].id})).dossier.find((row:any)=>row.definition.id===identity.id).record.recordId,another.id);
});

test('conditional relationship minima are validated when a scalar choice activates the rule',async()=>{
  const ws=await ok('create_workspace',{code:'conditionalmin',name:'Conditional required links'}),a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'parents',labels:{en:'Parents'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'children',labels:{en:'Children'}});
  const yes=randomUUID(),no=randomUUID(),field=await ok('create_field',{objectTypeId:b.id,technicalName:'kind',labels:{en:'Kind'},kind:'single_choice',config:{options:[yes,no].map(id=>({id,labels:{en:id===yes?'Qualified':'Other'},active:true}))}});
  const relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'required_parent',configuration:{labels:{en:'Parent'},leftLabels:{en:'Children'},rightLabels:{en:'Parent'},directed:true,leftMin:0,leftMax:null,rightMin:1,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true,rightApplicability:{fieldId:field.id,optionIds:[yes]}}});
  const active=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version}),parent=await ok('create_record',{objectTypeId:a.id}),child=await ok('create_record',{objectTypeId:b.id,values:{kind:no}});
  assert.equal((await api('update_record',{objectTypeId:b.id,recordId:child.id,version:child.version,values:{kind:yes}})).statusCode,409);
  assert.equal((await ok('get_record',{objectTypeId:b.id,recordId:child.id})).kind,no);
  const saved=await tool('update_record',{objectTypeId:b.id,recordId:child.id,version:child.version,values:{kind:yes},relationships:[{relationshipTypeId:active.id,version:active.version,side:'right',targets:[{objectTypeId:a.id,recordId:parent.id}]}]});assert.equal(saved.kind,yes);
});


test('form layouts share object identities, reject foreign fields and stale writes, and journal atomically through API/MCP',async()=>{
  const registryBefore=(await sql`SELECT * FROM sys_record_identities ORDER BY workspace_id,object_type_id,record_id`.execute(runtime.db)).rows;
  await initializeDatabase(databaseURL,secret,baseURL);
  assert.deepEqual((await sql`SELECT * FROM sys_record_identities ORDER BY workspace_id,object_type_id,record_id`.execute(runtime.db)).rows,registryBefore);
  const ws=await ok('create_workspace',{name:'Forms',code:'forms'});
  const type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
  await ok('create_field',{objectTypeId:type.id,technicalName:'serial',labels:{en:'Serial'}});
  let model=await ok('get_object_type',{objectTypeId:type.id});
  const layout={groups:[{id:'details',labels:{en:'Details'},fields:[{fieldId:model.fields[0].id,width:'full'}]}]};
  const before=(await ok('get_definition_journal',{objectTypeId:type.id})).length;
  assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:model.version,context:'contacts',layout})).statusCode,400);
  const first=await tool('configure_form_layout',{objectTypeId:type.id,version:model.version,layout});
  assert.deepEqual(first.formLayouts.default,layout);assert.equal(first.version,model.version+1);
  const event=(await tool('get_definition_journal',{objectTypeId:type.id})).find((entry:any)=>entry.field_key==='form_layout.default');
  assert.equal(event.form_layout_context.fields[model.fields[0].id],'Serial');
  assert.deepEqual(event.new_value,layout,'name enrichment preserves immutable historical values');
  const globalEvent=(await ok('list_system_journal',{workspaceId:ws.id,fieldKey:'form_layout.default'})).entries.find((entry:any)=>entry.id===event.id);
  assert.deepEqual(globalEvent.form_layout_context,event.form_layout_context,'definition and instance journals share the same context');

  assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:model.version,layout})).statusCode,409);
  assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:first.version,layout},userCookie)).statusCode,403);
  const same=await ok('configure_form_layout',{objectTypeId:type.id,version:first.version,layout});assert.equal(same.version,first.version);
  assert.equal((await ok('get_definition_journal',{objectTypeId:type.id})).length,before+1);
  const foreign=await ok('create_object_type',{workspaceId:ws.id,technicalName:'other',labels:{en:'Other'},standardFields:['keyword']});
  const foreignModel=await ok('get_object_type',{objectTypeId:foreign.id});
  assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:first.version,layout:{groups:[{...layout.groups[0],fields:[{fieldId:foreignModel.fields[0].id,width:'half'}]}]}})).statusCode,400);
  assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:first.version,layout:{groups:[layout.groups[0],layout.groups[0]]}})).statusCode,400);
  await sql`CREATE FUNCTION fail_form_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key='form_layout.default' THEN RAISE EXCEPTION 'journal failure'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER fail_form_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_form_journal()`.execute(runtime.db);
  try{assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:first.version,layout:{groups:[]}})).statusCode,500);}finally{await sql`DROP TRIGGER fail_form_journal ON sys_journal;DROP FUNCTION fail_form_journal()`.execute(runtime.db);}
  model=await ok('get_object_type',{objectTypeId:type.id});assert.equal(model.version,first.version);assert.deepEqual(model.formLayouts.default,layout);
  const second=await ok('configure_form_layout',{objectTypeId:type.id,version:model.version,layout:{groups:[{...layout.groups[0],fields:[]}]}});
  assert.deepEqual(second.formLayouts.default,{groups:[{...layout.groups[0],fields:[]}]});assert.equal(second.fields[0].id,model.fields[0].id);
  const removed=await ok('configure_form_layout',{objectTypeId:type.id,version:second.version,layout:null});assert.equal(removed.formLayouts.default,undefined);
});

test('relationship form elements enforce side scope, width and required visibility without changing link rules',async()=>{
  const ws=await ok('create_workspace',{name:'Relationship forms',code:'relationforms'});
  const left=await ok('create_object_type',{workspaceId:ws.id,technicalName:'parents',labels:{en:'Parents'},standardFields:['keyword']});
  const right=await ok('create_object_type',{workspaceId:ws.id,technicalName:'children',labels:{en:'Children'},standardFields:['keyword']});
  const configuration={labels:{en:'Connection'},leftLabels:{en:'Child'},rightLabels:{en:'Parents'},directed:true,leftMin:1,leftMax:1,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:left.id,rightObjectTypeId:right.id}],active:true};
  let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'connection',configuration});relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
  let model=await ok('get_object_type',{objectTypeId:left.id});
  assert.deepEqual(model.formRelationships.map((item:any)=>[item.definition.id,item.side]),[[relation.id,'left']]);
  const view=(entry:any)=>({groups:[{id:'connections',labels:{en:'Connections'},fields:[entry]}]});
  const single={relationshipTypeId:relation.id,side:'left',width:'half',visible:true};
  assert.equal((await api('configure_form_layout',{objectTypeId:left.id,version:model.version,layout:view({...single,visible:false})})).statusCode,400);
  assert.equal((await api('configure_form_layout',{objectTypeId:left.id,version:model.version,layout:{groups:[],unassigned:[{...single,visible:false}]}})).statusCode,400,'unassigned elements cannot bypass required visibility');
  assert.equal((await api('configure_form_layout',{objectTypeId:left.id,version:model.version,layout:view({...single,side:'right'})})).statusCode,400);
  const saved=await tool('configure_form_layout',{objectTypeId:left.id,version:model.version,layout:view(single)});assert.deepEqual(saved.formLayouts.default,view(single));
  const event=(await ok('get_definition_journal',{objectTypeId:left.id})).find((entry:any)=>entry.field_key==='form_layout.default');
  assert.deepEqual(event.form_layout_context.relationships[relation.id],{left:'Child',right:'Parents'});
  assert.deepEqual(event.new_value,view(single));

  model=await ok('get_object_type',{objectTypeId:right.id});
  const many={relationshipTypeId:relation.id,side:'right',width:'full',visible:false,expanded:'closed'};
  assert.equal((await api('configure_form_layout',{objectTypeId:right.id,version:model.version,layout:view({...many,width:'half'})})).statusCode,400);
  await ok('configure_form_layout',{objectTypeId:right.id,version:model.version,layout:view(many)});
  const types=await ok('list_relationship_types',{workspaceId:ws.id});assert.deepEqual(types.find((type:any)=>type.id===relation.id),relation,'presentation does not mutate relationship rules');
  const general=types.find((type:any)=>type.kind==='general');
  model=await ok('get_object_type',{objectTypeId:right.id});assert.equal((await api('configure_form_layout',{objectTypeId:right.id,version:model.version,layout:view({...many,relationshipTypeId:general.id})})).statusCode,400);
});

test('Primary is one full-width form element and its stored position survives a disabled Projects module',async()=>{
  const ws=await ok('create_workspace',{name:'Primary forms',code:'primaryforms'});
  await enableProjects(ws.id);let module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');
  const ids=[module.primaryChain.contact,module.primaryChain.project,module.primaryChain.case];
  const root=await ok('get_object_type',{objectTypeId:ids[0]});assert.equal(root.formRelationships.some((item:any)=>item.definition.kind==='primary'),false);
  let model=await ok('get_object_type',{objectTypeId:ids[1]});assert.equal(model.formRelationships.filter((item:any)=>item.definition.kind==='primary').length,1);
  const layout={groups:[{id:'context',labels:{en:'Context'},fields:[{primary:true,width:'full',visible:true}]}]};
  const saved=await ok('configure_form_layout',{objectTypeId:ids[1],version:model.version,layout});assert.deepEqual(saved.formLayouts.default,layout);
  module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:module.version,enabled:false});
  model=await ok('get_object_type',{objectTypeId:ids[1]});assert.equal(model.formRelationships.length,0);
  assert.deepEqual(model.formLayouts.default,layout,'disabled module retains the authored view');
  layout.groups[0].labels.en='Retained context';assert.equal((await api('configure_form_layout',{objectTypeId:ids[1],version:model.version,layout})).statusCode,400,'inactive module definitions are read-only');
  const unconfigured=await ok('get_object_type',{objectTypeId:ids[2]});assert.equal((await api('configure_form_layout',{objectTypeId:ids[2],version:unconfigured.version,layout})).statusCode,400);
});

test('new objects start with editable General, while added elements remain unassigned and scoped through API/MCP',async()=>{
 const ws=await ok('create_workspace',{name:'Free forms',code:'freeforms'});
 const type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 let model=await ok('get_object_type',{objectTypeId:type.id});const initial=model.formLayouts.default;
 assert.equal(initial.groups.length,1);assert.deepEqual(initial.groups[0].labels,{de:'Allgemein',en:'General'});assert.equal(initial.groups[0].fields.length,1);
 const field=await ok('create_field',{objectTypeId:type.id,technicalName:'serial',labels:{en:'Serial'}});model=await ok('get_object_type',{objectTypeId:type.id});assert.deepEqual(model.formLayouts.default,initial,'new field creation does not change any group');
 const layout={groups:[{...initial.groups[0],labels:{en:'Our own group'}}],unassigned:[{fieldId:field.id,width:'half'}]};
 const saved=await tool('configure_form_layout',{objectTypeId:type.id,version:model.version,layout});assert.deepEqual(saved.formLayouts.default,layout);
 const foreign=await ok('create_object_type',{workspaceId:ws.id,technicalName:'other',labels:{en:'Other'},standardFields:['keyword']});const foreignModel=await ok('get_object_type',{objectTypeId:foreign.id});
 assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:saved.version,layout:{...layout,unassigned:[{fieldId:foreignModel.fields[0].id,width:'half'}]}})).statusCode,400);
 assert.equal((await api('configure_form_layout',{objectTypeId:type.id,version:saved.version,layout:{...layout,unassigned:[layout.groups[0].fields[0]]}})).statusCode,400);
 const placed={groups:[{...layout.groups[0],fields:[...layout.groups[0].fields,...layout.unassigned]}],unassigned:[]};
 const result=await ok('configure_form_layout',{objectTypeId:type.id,version:saved.version,layout:placed});assert.deepEqual(result.formLayouts.default,placed);
});

test('module catalog is complete and planned modules cannot activate; fixed installation is atomic and never adopts matching custom names',async()=>{
  const ws=await ok('create_workspace',{code:'modulecatalog',name:'Module catalog'});
  const catalog=await ok('list_workspace_modules',{workspaceId:ws.id});
  assert.deepEqual(await tool('list_workspace_modules',{workspaceId:ws.id}),catalog);
  assert.deepEqual(catalog.map((m:any)=>[m.key,m.available,m.enabled]),[['contacts',true,false],['projects',true,false],['documents',false,false]]);
  assert.equal(catalog[0].labels.de,'Kontakte & Beziehungen');assert.equal(catalog[2].labels.en,'Documents & Communication');
  for(const module of catalog.filter((m:any)=>!m.available))assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:module.key,version:module.version,enabled:true})).statusCode,409);
  for(const name of ['contacts','projects','cases','tasks','emails','documents']){
    assert.equal((await api('create_object_type',{workspaceId:ws.id,technicalName:name,labels:{en:'Own object'}})).statusCode,400);
    const result=await client.callTool({name:'create_object_type',arguments:{workspaceId:ws.id,technicalName:name,labels:{en:'Own object'}}});assert.equal(result.isError,true);
  }
  const custom=await ok('create_object_type',{workspaceId:ws.id,technicalName:'custom_project_data',labels:{en:'User data'}});
  // Simulate an object that pre-dates catalog reservation; never rename live user data.
  await sql`ALTER TABLE modulecatalog_custom_project_data RENAME TO modulecatalog_projects`.execute(runtime.db);
  await sql`UPDATE sys_object_types SET technical_name='projects' WHERE id=${custom.id}::uuid`.execute(runtime.db);
  const history=(await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows;
  const rejected=await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:catalog[1].version,enabled:true});
  assert.equal(rejected.statusCode,409);assert.match(rejected.body,/custom object/);
  assert.deepEqual((await ok('list_object_types',{workspaceId:ws.id})).map((o:any)=>o.id),[custom.id],'no partial Contact object remains');
  assert.deepEqual((await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows,history);
  assert.equal((await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_module_object_bindings WHERE workspace_id=${ws.id}::uuid`.execute(runtime.db)).rows[0].n,0);
  assert.equal((await ok('get_object_type',{objectTypeId:custom.id})).isProtected,false);

  const clean=await ok('create_workspace',{code:'moduleatomic',name:'Module atomic'});
  const module=(await ok('list_workspace_modules',{workspaceId:clean.id})).find((m:any)=>m.key==='projects');
  await sql`CREATE FUNCTION fail_initial_module() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key='module_binding' AND NEW.new_value='"case"'::jsonb THEN RAISE EXCEPTION 'module journal rejected'; END IF; RETURN NEW; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER fail_initial_module BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_initial_module()`.execute(runtime.db);
  try{assert.equal((await api('configure_workspace_module',{workspaceId:clean.id,key:'projects',version:module.version,enabled:true})).statusCode,500);assert.deepEqual(await ok('list_object_types',{workspaceId:clean.id}),[]);assert.equal((await sql`SELECT 1 FROM sys_module_object_bindings WHERE workspace_id=${clean.id}::uuid`.execute(runtime.db)).rows.length,0);}
  finally{await sql`DROP TRIGGER fail_initial_module ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_initial_module()`.execute(runtime.db);}
  const enabled=await tool('configure_workspace_module',{workspaceId:clean.id,key:'projects',version:module.version,enabled:true});
  const objects=await ok('list_object_types',{workspaceId:clean.id});assert.equal(objects.length,4);
  for(const object of objects){const definition=await ok('get_object_type',{objectTypeId:object.id});assert.equal(definition.isProtected,true);assert.ok(definition.fields.every((f:any)=>f.isProtected));}
  const contact=await createOrganization(enabled.primaryChain.contact,'Retain me');
  const disabled=await ok('configure_workspace_module',{workspaceId:clean.id,key:'projects',version:enabled.version,enabled:false});
  assert.deepEqual((await ok('get_primary_chain_context',{objectTypeId:enabled.primaryChain.project})).levels,[]);
  assert.equal((await ok('get_record',{objectTypeId:enabled.primaryChain.contact,recordId:contact.id})).keyword,'Retain me');
  const again=await ok('configure_workspace_module',{workspaceId:clean.id,key:'projects',version:disabled.version,enabled:true});assert.deepEqual(again.primaryChain,enabled.primaryChain);assert.equal((await ok('list_object_types',{workspaceId:clean.id})).length,4);
  const count=(await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_journal WHERE workspace_id=${clean.id}::uuid`.execute(runtime.db)).rows[0].n;
  assert.deepEqual(await ok('configure_workspace_module',{workspaceId:clean.id,key:'projects',version:again.version,enabled:true}),again);
  assert.equal((await sql<{n:number}>`SELECT count(*)::int AS n FROM sys_journal WHERE workspace_id=${clean.id}::uuid`.execute(runtime.db)).rows[0].n,count);
  assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/configure_primary_chain',headers:{host:'127.0.0.1:4100',cookie:adminCookie,'x-xobject-request':'1'},payload:{workspaceId:clean.id,version:again.version,levels:enabled.primaryChain}})).statusCode,404);
});

test('content permissions combine groups, apply user and field overrides and govern every content projection',async()=>{
  const ws=await ok('create_workspace',{code:'rights',name:'Rights'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
  await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
  const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'},standardFields:['keyword','type_status','category']});
  const title=await ok('create_field',{objectTypeId:object.id,technicalName:'description',labels:{en:'Description'}}),secretField=await ok('create_field',{objectTypeId:object.id,technicalName:'secret',labels:{en:'Secret'}});
  const row=await ok('create_record',{objectTypeId:object.id,keyword:'Visible asset',values:{description:'Public',secret:'DO NOT DISCLOSE'}});
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).statusCode,403,'membership alone grants no content access');
  const groupA=await ok('create_group',{workspaceId:ws.id,name:'Editors',members:([user.id]).map(id=>({kind:'user',id,level:'full'}))}),groupB=await ok('create_group',{workspaceId:ws.id,name:'Readers',members:([user.id]).map(id=>({kind:'user',id,level:'full'}))});
  const grant=async(grants:any[])=>{const current=await ok('get_content_permissions',{objectTypeId:object.id});return ok('configure_content_permissions',{...current,grants});};
  const groups=[{kind:'group',id:groupA.id,level:'edit',fields:{[secretField.id]:'none'}},{kind:'group',id:groupB.id,level:'read',fields:{[secretField.id]:'read'}}];
  await grant(groups);
  let response=await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie);assert.equal(response.statusCode,200);assert.equal(response.json().secret,'DO NOT DISCLOSE','group field grants add together');
  const version=response.json().version;
  assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version,values:{description:'Must roll back',secret:'Forbidden'}},userCookie)).statusCode,403);
  assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).description,'Public','forbidden mixed writes are atomic');
  await grant([...groups,{kind:'user',id:user.id,level:null,fields:{[secretField.id]:'none'}}]);
  response=await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie);assert.equal(response.statusCode,200);assert.ok(!Object.hasOwn(response.json(),'secret'));
  let journal=(await api('list_record_journal',{objectTypeId:object.id,recordId:row.id,limit:1},userCookie)).json();assert.equal(journal.total,2);assert.ok(!JSON.stringify(journal).includes('DO NOT DISCLOSE'));
  assert.ok(!JSON.stringify((await api('list_record_journal',{objectTypeId:object.id,recordId:row.id},userCookie)).json()).includes('DO NOT DISCLOSE'));
  const kw=(await ok('get_object_type',{objectTypeId:object.id})).fields.find((f:any)=>f.technicalName==='keyword');
  await grant([...groups,{kind:'user',id:user.id,level:'read',fields:{[secretField.id]:'none',[kw.id]:'none'}}]);
  response=await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie);assert.equal(response.json().keyword,row.id);
  assert.equal((await api('list_records',{objectTypeId:object.id,query:'Visible asset'},userCookie)).json().total,0);
  assert.equal((await api('list_records',{objectTypeId:object.id,sortBy:'secret'},userCookie)).statusCode,403);
  assert.equal((await api('search_workspace',{workspaceId:ws.id,query:'Visible asset'},userCookie)).json().records.length,0);
  const workspaceList=(await api('list_workspace_records',{workspaceId:ws.id},userCookie)).json();assert.equal(workspaceList.total,1);assert.ok(!JSON.stringify(workspaceList).includes('Visible asset'));
  assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version,values:{description:'No'}},userCookie)).statusCode,403);
  assert.equal((await api('configure_content_permissions',{objectTypeId:object.id,version:1,sensitive:false,grants:[]},userCookie)).statusCode,403,'users cannot grant themselves rights');
  await grant([{kind:'user',id:user.id,level:'none',fields:{[title.id]:'edit'}}]);
  assert.equal((await api('get_workspace_dashboard',{workspaceId:ws.id},userCookie)).json().total,0);assert.equal((await api('list_workspace_records',{workspaceId:ws.id},userCookie)).json().total,0);
  assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).secret,'DO NOT DISCLOSE','Administrator bypasses all content restrictions');
  assert.equal((await api('list_object_types',{workspaceId:ws.id},userCookie)).json()[0].permissions.read,false,'metadata remains readable without granting content access');
});

test('sensitive records default to creator and enforce eligible principals, public clearing, revocation and optimistic journals',async()=>{
  const ws=await ok('create_workspace',{code:'sensitivity',name:'Sensitivity'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
  const other=await ok('create_user',{name:'Other user',email:'other-rights@example.test',initialPassword:'test-password-other-rights'});
  await sql`UPDATE sys_users SET must_change_password=false WHERE id=${other.id}`.execute(runtime.db);
  const otherCookie=await login('other-rights@example.test','test-password-other-rights');
  for(const id of [user.id,other.id])await ok('set_workspace_member',{workspaceId:ws.id,userId:id,role:'user',expectedRole:null});
  const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'notes',labels:{en:'Notes'},standardFields:['keyword']});
  const original=await ok('get_content_permissions',{objectTypeId:object.id});
  const settings=await ok('configure_content_permissions',{...original,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}},{kind:'user',id:other.id,level:'read',fields:{}}]});
  const stale=await api('configure_content_permissions',{...original,sensitive:true,grants:[]});assert.equal(stale.statusCode,409);
  let created=await api('create_record',{objectTypeId:object.id,keyword:'Private note'},userCookie);assert.equal(created.statusCode,200,created.body);let row=created.json();assert.deepEqual(row.access_principals,[{kind:'user',id:user.id,level:'full'}]);
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},otherCookie)).statusCode,403);
  assert.equal((await api('list_records',{objectTypeId:object.id},otherCookie)).json().total,0);
  assert.equal((await api('search_workspace',{workspaceId:ws.id,query:'Private'},otherCookie)).json().records.length,0);
  assert.equal((await api('get_workspace_dashboard',{workspaceId:ws.id},otherCookie)).json().total,0);
  assert.equal((await api('list_record_journal',{objectTypeId:object.id,recordId:row.id},otherCookie)).statusCode,403);
  assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{access_principals:[]}},userCookie)).statusCode,400);
  const policy=(await api('get_record_security',{objectTypeId:object.id,recordId:row.id},userCookie)).json().policy;const publicResult=await api('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:row.version,policy:{...policy,owners:[],publicLevel:'full'},confirmPublic:true},userCookie);assert.equal(publicResult.statusCode,200,publicResult.body);row=publicResult.json();
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},otherCookie)).statusCode,200);
  const ineligible=randomUUID();assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{access_principals:[{kind:'user',id:ineligible}]}},userCookie)).statusCode,400);
  const group=await ok('create_group',{workspaceId:ws.id,name:'Private group',members:([user.id]).map(id=>({kind:'user',id,level:'full'}))});
  await ok('configure_content_permissions',{...settings,grants:[...settings.grants,{kind:'group',id:group.id,level:'edit',fields:{}}]});
  row=await ok('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:row.version,policy:defaultRecordSecurity([{kind:'group',id:group.id,level:'full'}])});
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).statusCode,200);
  await ok('set_group_active',{workspaceId:ws.id,groupId:group.id,version:(await ok('list_groups',{workspaceId:ws.id})).find((g:any)=>g.id===group.id).version,active:false});
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).statusCode,403,'existing session immediately loses record access when group is inactive');
  assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).id,row.id);
});

test('content permissions protect relationship candidates, Primary context, tree branches and historical endpoints through API and MCP',async()=>{
  const ws=await ok('create_workspace',{code:'rightslinks',name:'Rights links'});const primary=await enableProjects(ws.id);
  const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
  const objects=await ok('list_object_types',{workspaceId:ws.id}),contact=objects.find((o:any)=>o.technicalName==='contacts'),project=objects.find((o:any)=>o.technicalName==='projects'),task=objects.find((o:any)=>o.technicalName==='tasks');
  for(const type of [contact,project,task]){const current=await ok('get_content_permissions',{objectTypeId:type.id});await ok('configure_content_permissions',{...current,sensitive:true,grants:[{kind:'user',id:user.id,level:'edit',fields:{}}]});}
  const contactDefinition=await ok('get_object_type',{objectTypeId:contact.id});
  const hidden=await ok('create_record',{objectTypeId:contact.id,values:{contact_kind:contactDefinition.contactProfile.kinds.organization,company_name:'Hidden organization'},security:{policy:defaultRecordSecurity([{kind:'user',id:adminId,level:'full'}]),confirmPublic:true}});
  const parent=await ok('create_record',{objectTypeId:project.id,keyword:'Visible project',security:{policy:defaultRecordSecurity(),confirmPublic:true},relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:contact.id,recordId:hidden.id}]}]});
  await ok('create_record',{objectTypeId:task.id,keyword:'Hidden task',security:{policy:defaultRecordSecurity([{kind:'user',id:adminId,level:'full'}]),confirmPublic:true},relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:project.id,recordId:parent.id}]}]});
  const input={objectTypeId:project.id,recordId:parent.id};
  const tree=await api('get_relationship_tree_branch',input,userCookie);assert.equal(tree.statusCode,200,tree.body);assert.equal(tree.json().total,0);assert.equal(tree.json().ancestors.length,0);assert.ok(!tree.body.includes(hidden.id));
  const context=await api('get_primary_chain_context',input,userCookie);assert.equal(context.statusCode,200,context.body);assert.equal(context.json().direct,null);
  const relations=await api('get_record_relationships',input,userCookie);assert.equal(relations.statusCode,200);assert.equal(relations.json().dossier.length,0);assert.equal(relations.json().fields.find((f:any)=>f.definition.kind==='primary'&&f.side==='right').editable,false);
  const candidates=await api('search_relationship_candidates',{...input,relationshipTypeId:primary.id,side:'right'},userCookie);assert.equal(candidates.statusCode,200,candidates.body);assert.equal(candidates.json().total,0);
  const history=await api('list_record_journal',input,userCookie);assert.ok(!history.body.includes('Hidden organization'));assert.ok(!history.body.includes('Hidden task'));
  let current=(await api('get_record',input,userCookie)).json();let changed=await api('update_record',{...input,version:current.version,keyword:'Changed project',relationships:[]},userCookie);assert.equal(changed.statusCode,200,changed.body);
  current=changed.json();assert.equal((await api('update_record',{...input,version:current.version,relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[]}]},userCookie)).statusCode,403);
  assert.equal((await ok('get_record_relationships',input)).dossier.length,2,'hidden edges survive unrelated changes');
  const regularClient=new Client({name:'rights-test-user',version:'0.0.0'});
  const transport=new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{cookie:userCookie,'x-xobject-request':'1'}},fetch:async(url,init)=>{const req=new Request(url,init),response=await runtime.app.inject({method:req.method as 'POST',url:new URL(req.url).pathname,headers:{...Object.fromEntries(req.headers),host:'127.0.0.1:4100'},...(req.method==='POST'?{payload:await req.text()}:{})});return new Response(response.body||null,{status:response.statusCode,headers:response.headers as Record<string,string>});}});
  try{await regularClient.connect(transport);const result=await regularClient.callTool({name:'get_relationship_tree_branch',arguments:input});assert.equal(result.isError,undefined);assert.deepEqual(JSON.parse((result.content as any)[0].text),(await api('get_relationship_tree_branch',input,userCookie)).json());assert.equal((await regularClient.callTool({name:'get_record',arguments:{objectTypeId:contact.id,recordId:hidden.id}})).isError,true);assert.equal((await regularClient.callTool({name:'get_content_permissions',arguments:{objectTypeId:project.id}})).isError,true);}finally{await regularClient.close();}
});

test('content permission changes are no-op stable, revocable, journaled and preserve hidden required fields and disabled sensitivity lists',async()=>{
 const ws=await ok('create_workspace',{code:'rightslifecycle',name:'Rights lifecycle'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'},standardFields:['keyword']});
 const hidden=await ok('create_field',{objectTypeId:object.id,technicalName:'hidden_value',labels:{en:'Hidden'},required:true});
 const record=await ok('create_record',{objectTypeId:object.id,keyword:'Visible',values:{hidden_value:'Retain me'}});
 const original=await ok('get_content_permissions',{objectTypeId:object.id}),grant={kind:'user',id:user.id,level:'edit',fields:{[hidden.id]:'none'}};
 let settings=await ok('configure_content_permissions',{...original,sensitive:true,grants:[grant]});
 assert.equal((await ok('configure_content_permissions',{...settings,grants:[{...grant,fields:{...grant.fields}}]})).version,settings.version,'semantic no-op changes no version');
 const deniedCreate=await api('create_record',{objectTypeId:object.id,keyword:'Missing hidden required'},userCookie);assert.equal(deniedCreate.statusCode,403);assert.ok(!deniedCreate.body.includes('Retain me'));
 let current=(await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).json();const updated=await api('update_record',{objectTypeId:object.id,recordId:record.id,version:current.version,keyword:'Changed'},userCookie);assert.equal(updated.statusCode,200,updated.body);assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:record.id})).hidden_value,'Retain me');
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:record.id,version:updated.json().version,values:{hidden_value:'Retain me'}},userCookie)).statusCode,403,'guessed no-ops cannot probe hidden values');
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:updated.json().version,policy:defaultRecordSecurity(),confirmPublic:true},userCookie)).statusCode,403,'Edit cannot set Access principals');
 settings=await ok('configure_content_permissions',{...settings,grants:[{...grant,level:'full'}]});
 current=await ok('get_record',{objectTypeId:object.id,recordId:record.id});const transferred=await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:current.version,policy:defaultRecordSecurity([{kind:'user',id:adminId,level:'full'}])},userCookie);assert.equal(transferred.statusCode,200,transferred.body);assert.equal(transferred.json().permissions.read,false);assert.ok(!Object.hasOwn(transferred.json(),'hidden_value'));assert.equal(transferred.json().keyword,record.id);
 assert.equal((await api('configure_content_permissions',{...settings,sensitive:false})).statusCode,400);settings=await ok('configure_content_permissions',{...settings,sensitive:false,confirmWidening:true});assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).statusCode,200);assert.ok(!(await ok('get_object_type',{objectTypeId:object.id})).fields.some((f:any)=>f.technicalName==='access_principals'));
 settings=await ok('configure_content_permissions',{...settings,sensitive:true});assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).statusCode,403,'re-enabling sensitivity restores the retained list');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:null,expectedRole:'user'});await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).statusCode,403,'re-adding membership restores no prior grant');
 const final=await ok('get_content_permissions',{objectTypeId:object.id});assert.ok(!final.grants.some((g:any)=>g.kind==='user'&&g.id===user.id));assert.ok(final.version>settings.version);
 const journal=await ok('get_definition_journal',{objectTypeId:object.id});assert.ok(journal.some((e:any)=>e.field_key===`permission.user:${user.id}.field.${hidden.id}`&&e.new_value===null));assert.ok(journal.some((e:any)=>e.field_key==='sensitive'));
});

test('content permissions preserve editable dependent fields and statuses without returning hidden controllers',async()=>{
 const ws=await ok('create_workspace',{code:'rightsdependencies',name:'Rights dependencies'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'},standardFields:['keyword','type_status','category']});
 const option=randomUUID(),controller=await ok('create_field',{objectTypeId:object.id,technicalName:'private_kind',labels:{en:'Private kind'},kind:'single_choice',config:{options:[{id:option,labels:{en:'Applicable'},active:true}]}}),dependent=await ok('create_field',{objectTypeId:object.id,technicalName:'detail',labels:{en:'Detail'},applicability:{fieldId:controller.id,optionIds:[option]}});
 let definition=await ok('get_object_type',{objectTypeId:object.id});const type=definition.fields.find((f:any)=>f.technicalName==='type'),typeId=randomUUID(),statusId=randomUUID();
 await ok('configure_classification',{objectTypeId:object.id,version:definition.classification.version,config:{options:[{id:typeId,kind:'type',typeId:null,labels:{en:'Private type'},active:true},{id:statusId,kind:'status',typeId,labels:{en:'Available status'},active:true}],type:{required:false,defaultId:null},status:{required:false,defaults:[]},category:{required:false,multiple:true,defaultIds:[]}}});
 const row=await ok('create_record',{objectTypeId:object.id,keyword:'Dependent',values:{private_kind:option,detail:'Editable'},classification:{type:typeId,status:statusId}});
 const perms=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...perms,grants:[{kind:'user',id:user.id,level:'edit',fields:{[controller.id]:'none',[type.id]:'none'}}]});
 const visible=(await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).json();assert.ok(!Object.hasOwn(visible,'private_kind'));assert.ok(!Object.hasOwn(visible,'type'));assert.equal(visible.detail,'Editable');assert.ok(visible.applicableFieldIds.includes(dependent.id));assert.deepEqual(visible.allowedStatusIds,[statusId]);
 const updated=await api('update_record',{objectTypeId:object.id,recordId:row.id,version:visible.version,values:{detail:'Updated'},classification:{status:statusId}},userCookie);assert.equal(updated.statusCode,200,updated.body);assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).private_kind,option);
});

test('content permissions prevent probing private relationship controllers through direct writes',async()=>{
 const ws=await ok('create_workspace',{code:'rightsconditions',name:'Rights conditions'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const source=await ok('create_object_type',{workspaceId:ws.id,technicalName:'sources',labels:{en:'Sources'},standardFields:['keyword']}),target=await ok('create_object_type',{workspaceId:ws.id,technicalName:'targets',labels:{en:'Targets'},standardFields:['keyword']});const option=randomUUID();
 const controller=await ok('create_field',{objectTypeId:target.id,technicalName:'secret_kind',labels:{en:'Secret kind'},kind:'single_choice',config:{options:[{id:option,labels:{en:'Eligible'},active:true}]}});
 let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'conditioned',configuration:{labels:{en:'Conditioned'},leftLabels:{en:'Targets'},rightLabels:{en:'Sources'},directed:true,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:source.id,rightObjectTypeId:target.id}],rightApplicability:{fieldId:controller.id,optionIds:[option]},active:true}});relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
 for(const object of [source,target]){const permissions=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'edit',fields:object.id===target.id?{[controller.id]:'none'}:{}}]});}
 const a=await ok('create_record',{objectTypeId:source.id,keyword:'Source'}),b=await ok('create_record',{objectTypeId:target.id,keyword:'Target',values:{secret_kind:option}});
 const candidates=await api('search_relationship_candidates',{objectTypeId:source.id,recordId:a.id,relationshipTypeId:relation.id,side:'left'},userCookie);assert.equal(candidates.statusCode,200);assert.equal(candidates.json().total,0);
 const choices=(await api('list_record_link_options',{objectTypeId:source.id,recordId:a.id},userCookie)).json();assert.ok(!choices.flatMap((o:any)=>o.relationships).some((r:any)=>r.relationshipTypeId===relation.id));
 assert.equal((await api('list_record_link_options',{objectTypeId:target.id,recordId:b.id,sourceValues:{secret_kind:option}},userCookie)).statusCode,403);
 const forbidden=await api('update_record',{objectTypeId:source.id,recordId:a.id,version:a.version,relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'left',targets:[{objectTypeId:target.id,recordId:b.id}]}]},userCookie);assert.equal(forbidden.statusCode,403,forbidden.body);assert.equal((await ok('get_record_relationships',{objectTypeId:source.id,recordId:a.id})).edges.length,0);
});

test('object settings save labels and sensitivity atomically with both optimistic versions and shared API/MCP authorization',async()=>{
 const ws=await ok('create_workspace',{code:'atomicsettings',name:'Atomic settings'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'}});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:null});
 let def=await ok('get_object_type',{objectTypeId:object.id});
 let response=await api('configure_object_settings',{objectTypeId:object.id,version:def.version,labels:{en:'Denied'},security:{version:def.permissionsVersion,sensitive:true}},userCookie);
 assert.equal(response.statusCode,403);assert.equal((await ok('get_object_type',{objectTypeId:object.id})).labels.en,'Assets');
 const changed=await ok('configure_object_settings',{objectTypeId:object.id,version:def.version,labels:{en:'Secured assets'},security:{version:def.permissionsVersion,sensitive:true}});
 assert.equal(changed.labels.en,'Secured assets');assert.equal(changed.sensitive,true);assert.ok(changed.fields.some((f:any)=>f.technicalName==='access_principals'));
 const events=await ok('get_definition_journal',{objectTypeId:object.id});const label=events.find((e:any)=>e.field_key==='labels'&&e.new_value.en==='Secured assets'),sensitivity=events.find((e:any)=>e.field_key==='sensitive');assert.equal(label.change_id,sensitivity.change_id);
 response=await api('configure_object_settings',{objectTypeId:object.id,version:def.version,labels:{en:'Stale'},security:{version:def.permissionsVersion,sensitive:false}});assert.equal(response.statusCode,409);
 response=await api('configure_object_settings',{objectTypeId:object.id,version:changed.version,labels:{en:'Stale permission'},security:{version:def.permissionsVersion,sensitive:false}});assert.equal(response.statusCode,409);
 // A later label validation failure must also roll back the earlier security write.
 await sql`UPDATE sys_object_types SET is_protected=true WHERE id=${object.id}::uuid`.execute(runtime.db);
 response=await api('configure_object_settings',{objectTypeId:object.id,version:changed.version,labels:{en:'Protected rename'},security:{version:changed.permissionsVersion,sensitive:false,confirmWidening:true}});
 assert.equal(response.statusCode,403);const rolledBack=await ok('get_object_type',{objectTypeId:object.id});assert.equal(rolledBack.sensitive,true);assert.equal(rolledBack.permissionsVersion,changed.permissionsVersion);
 await sql`UPDATE sys_object_types SET is_protected=false WHERE id=${object.id}::uuid`.execute(runtime.db);
 const renamed=await api('configure_object_settings',{objectTypeId:object.id,version:changed.version,labels:{en:'Designer label'}},userCookie);assert.equal(renamed.statusCode,200,renamed.body);
 def=renamed.json();const mcp=await tool('configure_object_settings',{objectTypeId:object.id,version:def.version,labels:{en:'MCP label'},security:{version:def.permissionsVersion,sensitive:false,confirmWidening:true}});assert.equal(mcp.labels.en,'MCP label');assert.equal(mcp.sensitive,false);
});

test('record link menus expose eligible pairs and linked creation atomically preserves source links, cardinalities and journals through API/MCP',async()=>{
 const ws=await ok('create_workspace',{code:'linkedactions',name:'Linked actions'});
 const a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'agreements',labels:{en:'Agreements'},standardFields:['keyword']}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets'},standardFields:['keyword']}),c=await ok('create_object_type',{workspaceId:ws.id,technicalName:'places',labels:{en:'Places'}});
 let source=await ok('create_record',{objectTypeId:a.id,keyword:'Service agreement'});
 const configuration={labels:{en:'Coverage'},leftLabels:{en:'Covered asset'},rightLabels:{en:'Agreement'},directed:true,leftMin:0,leftMax:1,rightMin:0,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true};
 let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'coverage',configuration});relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
 let options=await ok('list_record_link_options',{objectTypeId:a.id,recordId:source.id});assert.equal(options.length,3);assert.equal(options.find((o:any)=>o.objectType.id===b.id).relationships.length,2);assert.equal(options.find((o:any)=>o.objectType.id===c.id).relationships.length,1);
 const from={objectTypeId:a.id,recordId:source.id,recordVersion:source.version,relationshipTypeId:relation.id,version:relation.version,side:'left'};
 const target=await tool('create_record',{objectTypeId:b.id,keyword:'Covered asset',linkFrom:from});
 const edge=(await ok('get_record_relationships',{objectTypeId:b.id,recordId:target.id})).edges.find((e:any)=>e.definition.id===relation.id);assert.equal(edge.left.recordId,source.id);assert.equal(edge.right.recordId,target.id);
 const journal=(await sql<{change_id:string}>`SELECT DISTINCT change_id FROM sys_journal WHERE entity_id=${target.id}::uuid OR entity_id=${edge.id}::uuid`.execute(runtime.db)).rows;assert.equal(journal.length,1);
 source=await ok('get_record',{objectTypeId:a.id,recordId:source.id});assert.equal(source.version,from.recordVersion+1);
 const before=(await sql<{n:number}>`SELECT count(*)::integer AS n FROM sys_journal`.execute(runtime.db)).rows[0].n;
 assert.equal((await api('create_record',{objectTypeId:b.id,keyword:'Stale source',linkFrom:from})).statusCode,409);
 assert.equal((await api('create_record',{objectTypeId:b.id,keyword:'Too many',linkFrom:{...from,recordVersion:source.version}})).statusCode,409);
 assert.equal((await ok('list_records',{objectTypeId:b.id})).total,1);assert.equal((await sql<{n:number}>`SELECT count(*)::integer AS n FROM sys_journal`.execute(runtime.db)).rows[0].n,before);
 options=await tool('list_record_link_options',{objectTypeId:a.id,recordId:source.id});assert.equal(options.find((o:any)=>o.objectType.id===b.id).relationships.find((r:any)=>r.relationshipTypeId===relation.id).canCreate,false);
 const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.kind==='general');
 const another=await ok('create_record',{objectTypeId:b.id,keyword:'General asset',linkFrom:{...from,recordVersion:source.version,relationshipTypeId:general.id,version:general.version}});
 const dossier=(await ok('get_record_relationships',{objectTypeId:a.id,recordId:source.id})).dossier;assert.equal(dossier.length,2);assert.ok(dossier.some((e:any)=>e.record.recordId===another.id));assert.ok(dossier.some((e:any)=>e.record.recordId===target.id));
});

test('linked record actions enforce both source and target rights and invert undirected roles without replacing endpoints',async()=>{
 const ws=await ok('create_workspace',{code:'linkedrights',name:'Linked rights'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'sources',labels:{en:'Sources'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'targets',labels:{en:'Targets'}});
 const source=await ok('create_record',{objectTypeId:a.id});
 const relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'association',configuration:{labels:{en:'Association'},leftLabels:{en:'Targets'},rightLabels:{en:'Sources'},directed:false,leftMin:0,leftMax:null,rightMin:0,rightMax:null,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true}});const active=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
 async function grant(id:string,level:string){const p=await ok('get_content_permissions',{objectTypeId:id});await ok('configure_content_permissions',{...p,grants:[{kind:'user',id:user.id,level,create:level==='edit',fields:{}}]});}
 await grant(a.id,'edit');await grant(b.id,'read');
 let options=(await api('list_record_link_options',{objectTypeId:a.id,recordId:source.id},userCookie)).json();assert.equal(options.find((o:any)=>o.objectType.id===b.id).relationships.every((r:any)=>!r.canCreate),true);
 const from={objectTypeId:a.id,recordId:source.id,recordVersion:source.version,relationshipTypeId:active.id,version:active.version,side:'left'};
 assert.equal((await api('create_record',{objectTypeId:b.id,linkFrom:from},userCookie)).statusCode,403);
 await grant(b.id,'edit');await grant(a.id,'read');assert.equal((await api('list_record_link_options',{objectTypeId:a.id,recordId:source.id},userCookie)).statusCode,403);assert.equal((await api('create_record',{objectTypeId:b.id,linkFrom:from},userCookie)).statusCode,403);assert.equal((await ok('list_records',{objectTypeId:b.id})).total,0);
 await grant(a.id,'edit');const target=(await api('create_record',{objectTypeId:b.id,linkFrom:from},userCookie));assert.equal(target.statusCode,200,target.body);
 const reverse=await tool('create_record',{objectTypeId:a.id,linkFrom:{objectTypeId:b.id,recordId:target.json().id,recordVersion:target.json().version,relationshipTypeId:active.id,version:active.version,side:'right'}});assert.equal((await ok('get_record_relationships',{objectTypeId:b.id,recordId:target.json().id})).dossier.length,2);assert.ok(reverse.id);
 const other=await ok('create_workspace',{code:'linkedforeign',name:'Foreign'}),foreign=await ok('create_object_type',{workspaceId:other.id,technicalName:'assets',labels:{en:'Foreign'}});
 const current=await ok('get_record',{objectTypeId:a.id,recordId:source.id});assert.equal((await api('create_record',{objectTypeId:foreign.id,linkFrom:{...from,recordVersion:current.version}})).statusCode,400);assert.equal((await ok('list_records',{objectTypeId:foreign.id})).total,0);
});

test('ownership model enforces graded groups, foreign inheritance, privacy and per-record fields through shared API/MCP',async()=>{
 const ws=await ok('create_workspace',{code:'ownershipmodel',name:'Ownership model'});
 async function person(name:string){const user=await ok('create_user',{name,email:`ownership-${name.toLowerCase()}@example.test`,initialPassword:'ownership-model-password'});await sql`UPDATE sys_users SET must_change_password=false WHERE id=${user.id}`.execute(runtime.db);await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});return {...user,cookie:await login(`ownership-${name.toLowerCase()}@example.test`,'ownership-model-password')};}
 const clara=await person('Clara'),hans=await person('Hans'),martin=await person('Martin');
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'activities',labels:{en:'Activities'},standardFields:['keyword']});
 const detail=await ok('create_field',{objectTypeId:object.id,technicalName:'private_detail',labels:{en:'Private detail'}});
 const before=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...before,sensitive:true,grants:[clara,hans,martin].map(u=>({kind:'user',id:u.id,level:'full',create:u.id===clara.id,fields:{}}))});
 const salesId=(await ok('create_group',{workspaceId:ws.id,name:'Sales'})).id,managementId=(await ok('create_group',{workspaceId:ws.id,name:'Management'})).id;
 for(const [groupId,user] of [[salesId,hans],[managementId,martin]])await tool('configure_group_inheritance',{workspaceId:ws.id,groupId,version:1,members:[{kind:'user',id:user.id,level:'full'}]});
 let record=await ok('create_record',{objectTypeId:object.id,keyword:'Only Clara',values:{private_detail:'Secret detail'}});
 let security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id});security.policy.owners=[{kind:'user',id:clara.id,level:'full'}];security.policy.publicLevel=null;
 record=await tool('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:security.policy});
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},hans.cookie)).statusCode,403);
 let foreign=await ok('get_foreign_access',{workspaceId:ws.id});foreign=await tool('configure_foreign_access',{...foreign,rules:[{id:randomUUID(),requester:{kind:'user',id:hans.id},owner:{kind:'user',id:clara.id},level:'edit',confidential:false,objects:{}}]});
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},hans.cookie)).json().permissions.edit,true);
 assert.equal((await api('duplicate_record',{objectTypeId:object.id,recordId:record.id,version:record.version},hans.cookie)).statusCode,403);
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:security.policy},hans.cookie)).statusCode,403);
 security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id});const keyword=(await ok('get_object_type',{objectTypeId:object.id})).fields.find((f:any)=>f.technicalName==='keyword');security.policy.fields=[{kind:'user',id:hans.id,fields:{[detail.id]:'none',[keyword.id]:'none'}}];
 record=await ok('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:security.policy});
 const visible=(await api('get_record',{objectTypeId:object.id,recordId:record.id},hans.cookie)).json();assert.equal(visible.private_detail,undefined);assert.equal(visible.fieldAccess[detail.id].read,false);assert.equal(visible.keyword,record.id);
 assert.equal((await api('list_records',{objectTypeId:object.id,query:'Only Clara'},hans.cookie)).json().total,0);
 assert.equal((await api('search_workspace',{workspaceId:ws.id,query:'Only Clara'},hans.cookie)).json().records.length,0);
 assert.equal((await api('list_workspace_records',{workspaceId:ws.id,query:'Only Clara'},hans.cookie)).json().total,0);
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:record.id,version:record.version,values:{private_detail:'Denied'}},hans.cookie)).statusCode,403);
 assert.equal((await api('list_records',{objectTypeId:object.id,sortBy:'private_detail'},hans.cookie)).statusCode,403);
 assert.equal((await api('list_record_journal',{objectTypeId:object.id,recordId:record.id},hans.cookie)).json().entries.some((e:any)=>e.field_id===detail.id),false);
 security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id});security.policy.privacy='personal';record=await ok('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:security.policy});
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},hans.cookie)).statusCode,403);
 security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id});security.policy.privacy='normal';security.policy.owners=[{kind:'user',id:hans.id,level:'full'}];record=await ok('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:security.policy});
 foreign=await ok('configure_foreign_access',{...foreign,rules:[{id:randomUUID(),requester:{kind:'group',id:managementId},owner:{kind:'group',id:salesId},level:'edit',confidential:false,objects:{}}]});
 const inherited=(await api('get_record_security',{objectTypeId:object.id,recordId:record.id},martin.cookie)).json();assert.equal(inherited.effective.level,'edit');assert.equal(inherited.effective.source,'foreign');
 assert.equal(inherited.policy.owners.some((p:any)=>p.id===martin.id||p.id===managementId),false);
 foreign=await ok('configure_foreign_access',{...foreign,users:[{userId:martin.id,inherit:false,manageOwn:false}]});assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},martin.cookie)).statusCode,403);
 // No widening to public is accepted without an explicit confirmation, and stale writes preserve history.
 security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id});const publicPolicy={...security.policy,owners:[],publicLevel:'full'};
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:publicPolicy})).statusCode,400);
 const publicRecord=await ok('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:publicPolicy,confirmPublic:true});
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:publicPolicy,confirmPublic:true})).statusCode,409);
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},martin.cookie)).statusCode,200);
 assert.ok(publicRecord.version>record.version);
});

test('nested group membership rejects cycles, preserves grades on name edits and limits participating-group ownership',async()=>{
 const ws=await ok('create_workspace',{code:'gradedgroups',name:'Graded groups'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const a=(await ok('create_group',{workspaceId:ws.id,name:'Team'})).id,b=(await ok('create_group',{workspaceId:ws.id,name:'Division'})).id;
 await ok('configure_group_inheritance',{workspaceId:ws.id,groupId:a,version:1,members:[{kind:'user',id:user.id,level:'read'}]});
 await ok('configure_group_inheritance',{workspaceId:ws.id,groupId:b,version:1,members:[{kind:'group',id:a,level:'full'}]});
 const cycle=await api('configure_group_inheritance',{workspaceId:ws.id,groupId:a,version:2,members:[{kind:'group',id:b,level:'full'}]});assert.equal(cycle.statusCode,400);
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'work',labels:{en:'Work'},standardFields:['keyword']});const cfg=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[{kind:'group',id:b,level:'full',fields:{}}]});
 const record=await ok('create_record',{objectTypeId:object.id,keyword:'Group owned',security:{policy:defaultRecordSecurity([{kind:'group',id:b,level:'full'}]),confirmPublic:true}});
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).json().permissions.edit,false);
 const renamed=await ok('configure_group',{workspaceId:ws.id,groupId:a,version:2,name:'Renamed team'});assert.equal(renamed.members[0].level,'read');
 const foreignWorkspace=await ok('create_workspace',{code:'gradedforeign',name:'Other'}),foreignGroup=(await ok('create_group',{workspaceId:foreignWorkspace.id,name:'Foreign group'})).id;
 assert.equal((await api('configure_group_inheritance',{workspaceId:ws.id,groupId:a,version:renamed.version,members:[{kind:'group',id:foreignGroup,level:'full'}]})).statusCode,400);
});

test('delegated foreign administration remains owner-scoped on reads, no-ops and writes and revokes immediately',async()=>{
 const ws=await ok('create_workspace',{code:'foreignself',name:'Foreign self'}),users=(await ok('list_users',{})),user=users.find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}}),cfg=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[{kind:'user',id:user.id,level:'edit',fields:{}}]});
 assert.equal((await api('get_foreign_access',{workspaceId:ws.id},userCookie)).statusCode,403);
 let all=await ok('get_foreign_access',{workspaceId:ws.id});const unrelated={id:randomUUID(),requester:{kind:'user',id:user.id},owner:{kind:'user',id:adminId},level:'read',confidential:false,objects:{}};
 all=await ok('configure_foreign_access',{...all,rules:[unrelated],users:[{userId:user.id,inherit:true,manageOwn:true}]});
 assert.equal((await api('get_foreign_access_capabilities',{workspaceId:ws.id},userCookie)).json().manageOwn,true);
 let own=(await api('get_foreign_access',{workspaceId:ws.id},userCookie)).json();assert.deepEqual(own.rules,[]);
 const noOp=await api('configure_foreign_access',own,userCookie);assert.equal(noOp.statusCode,200,noOp.body);assert.deepEqual(noOp.json().rules,[]);
 const delegated={id:randomUUID(),requester:{kind:'user',id:adminId},owner:{kind:'user',id:user.id},level:'edit',confidential:false,objects:{}};
 assert.equal((await api('configure_foreign_access',{...own,rules:[{...delegated,level:'full'}]},userCookie)).statusCode,403);
 assert.equal((await api('configure_foreign_access',{...own,rules:[unrelated]},userCookie)).statusCode,403);
 assert.equal((await api('configure_foreign_access',{...own,users:[]},userCookie)).statusCode,403);
 const saved=await api('configure_foreign_access',{...own,rules:[delegated]},userCookie);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().rules.length,1);
 all=await ok('get_foreign_access',{workspaceId:ws.id});assert.equal(all.rules.length,2);assert.ok(all.rules.some((r:any)=>r.id===unrelated.id));
 await ok('configure_foreign_access',{...all,users:[{userId:user.id,inherit:true,manageOwn:false}]});
 assert.equal((await api('get_foreign_access',{workspaceId:ws.id},userCookie)).statusCode,403);assert.equal((await api('configure_foreign_access',saved.json(),userCookie)).statusCode,403);
});

test('Create is independent of existing Read and duplication copies only accessible initial values',async()=>{
 const ws=await ok('create_workspace',{code:'createonly',name:'Create only'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']}),visible=await ok('create_field',{objectTypeId:object.id,technicalName:'detail',labels:{en:'Detail'}}),hidden=await ok('create_field',{objectTypeId:object.id,technicalName:'secret',labels:{en:'Secret'}});
 let cfg=await ok('get_content_permissions',{objectTypeId:object.id});cfg=await ok('configure_content_permissions',{...cfg,grants:[{kind:'user',id:user.id,level:'none',create:true,fields:{[hidden.id]:'none'}}]});
 const definition=(await api('get_object_type',{objectTypeId:object.id},userCookie)).json();assert.equal(definition.permissions.create,true);assert.equal(definition.fields.find((f:any)=>f.id===visible.id).fieldPermissions.create,true);
 assert.equal((await api('get_record_relationships',{objectTypeId:object.id},userCookie)).statusCode,200,'Create-only forms can load their empty relationship controls');
 const created=await api('create_record',{objectTypeId:object.id,keyword:'New only',values:{detail:'Initial'}},userCookie);assert.equal(created.statusCode,200,created.body);assert.equal(created.json().permissions.read,false);
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:created.json().id},userCookie)).statusCode,403);assert.equal((await api('list_records',{objectTypeId:object.id},userCookie)).statusCode,403);
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{secret:'Denied'}},userCookie)).statusCode,403);
 const sourceType=await ok('create_object_type',{workspaceId:ws.id,technicalName:'sources',labels:{en:'Sources'}}),sourceGrant=await ok('get_content_permissions',{objectTypeId:sourceType.id});await ok('configure_content_permissions',{...sourceGrant,grants:[{kind:'user',id:user.id,level:'edit',create:false,fields:{}}]});
 const parent=await ok('create_record',{objectTypeId:sourceType.id}),general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.kind==='general');
 const options=(await api('list_record_link_options',{objectTypeId:sourceType.id,recordId:parent.id},userCookie)).json().find((o:any)=>o.objectType.id===object.id);assert.ok(options.relationships.some((r:any)=>r.canCreate&&!r.canLink));
 const linked=await api('create_record',{objectTypeId:object.id,linkFrom:{objectTypeId:sourceType.id,recordId:parent.id,recordVersion:parent.version,relationshipTypeId:general.id,version:general.version,side:'left'}},userCookie);assert.equal(linked.statusCode,200,linked.body);assert.equal(linked.json().permissions.read,false);assert.equal((await ok('get_record_relationships',{objectTypeId:sourceType.id,recordId:parent.id})).edges.length,1);
 const source=await ok('create_record',{objectTypeId:object.id,keyword:'Source',values:{detail:'Copy this',secret:'Never copy'}});
 cfg=await ok('configure_content_permissions',{...cfg,grants:[{kind:'user',id:user.id,level:'duplicate',create:true,fields:{[hidden.id]:'none'}}]});
 const beforeDraft=(await ok('list_records',{objectTypeId:object.id})).total;
 const beforeEvents=(await sql<{count:string}>`SELECT count(*) AS count FROM sys_journal`.execute(runtime.db)).rows[0].count;
 const draftResponse=await api('get_record_duplicate',{objectTypeId:object.id,recordId:source.id},userCookie);assert.equal(draftResponse.statusCode,200,draftResponse.body);const draft=draftResponse.json();
 assert.equal(draft.sourceVersion,source.version);assert.equal(draft.values.detail,'Copy this');assert.equal(draft.values.secret,undefined);assert.equal(draft.values.access_principals,undefined);assert.equal(draft.values.business_number,undefined);
 assert.equal((await ok('list_records',{objectTypeId:object.id})).total,beforeDraft,'preparing and discarding a copy creates no row');
 assert.equal((await sql<{count:string}>`SELECT count(*) AS count FROM sys_journal`.execute(runtime.db)).rows[0].count,beforeEvents,'preparation writes no journal');
 const savedDraft=await api('create_record',{objectTypeId:object.id,duplicateFrom:{recordId:source.id,version:draft.sourceVersion},keyword:'Edited copy',values:{...draft.values,detail:'Changed before saving'},classification:draft.classification},userCookie);assert.equal(savedDraft.statusCode,200,savedDraft.body);
 const edited=await ok('get_record',{objectTypeId:object.id,recordId:savedDraft.json().id});assert.equal(edited.keyword,'Edited copy');assert.equal(edited.detail,'Changed before saving');assert.equal(edited.secret,null);
 assert.equal((await api('create_record',{objectTypeId:object.id,duplicateFrom:{recordId:source.id,version:source.version+1},values:draft.values},userCookie)).statusCode,409,'stale duplicate sources cannot save');
 const copy=await api('duplicate_record',{objectTypeId:object.id,recordId:source.id,version:source.version},userCookie);assert.equal(copy.statusCode,200,copy.body);
 const full=await ok('get_record',{objectTypeId:object.id,recordId:copy.json().id});assert.equal(full.detail,'Copy this');assert.equal(full.secret,null);assert.notEqual(full.id,source.id);
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:source.id,version:source.version,values:{detail:'Denied'}},userCookie)).statusCode,403);
 cfg=await ok('configure_content_permissions',{...cfg,grants:[{kind:'user',id:user.id,level:'edit',create:null,fields:{}}]});
 assert.equal((await api('create_record',{objectTypeId:object.id},userCookie)).statusCode,403,'Edit does not implicitly grant Create');
 assert.equal((await api('get_record_duplicate',{objectTypeId:object.id,recordId:source.id},userCookie)).statusCode,403);
 assert.equal((await api('create_record',{objectTypeId:object.id,duplicateFrom:{recordId:source.id,version:source.version},values:draft.values},userCookie)).statusCode,403,'current Duplicate and Create are rechecked when saving');
 const group=await ok('create_group',{workspaceId:ws.id,name:'Creators',members:([user.id]).map(id=>({kind:'user',id,level:'full'}))});
 cfg=await ok('configure_content_permissions',{...cfg,grants:[{kind:'user',id:user.id,level:'none',create:null,fields:{}},{kind:'group',id:group.id,level:'none',create:true,fields:{}}]});
 assert.equal((await api('create_record',{objectTypeId:object.id},userCookie)).statusCode,200,'Missing user Create inherits a group despite an explicit object None');
 cfg=await ok('configure_content_permissions',{...cfg,grants:cfg.grants.map((g:any)=>g.kind==='user'?{...g,create:false}:g)});
 assert.equal((await api('create_record',{objectTypeId:object.id},userCookie)).statusCode,403,'Explicit user Create denial wins');

});

test('security, foreign and membership journal failures roll back policy rows and optimistic versions',async()=>{
 const ws=await ok('create_workspace',{code:'securityrollback',name:'Security rollback'}),group=await ok('create_group',{workspaceId:ws.id,name:'Rollback group'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}}),cfg=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[]});
 const record=await ok('create_record',{objectTypeId:object.id}),security=await ok('get_record_security',{objectTypeId:object.id,recordId:record.id}),foreign=await ok('get_foreign_access',{workspaceId:ws.id});
 await sql`CREATE FUNCTION fail_security_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key LIKE 'access.%' OR NEW.field_key LIKE 'foreign.%' OR NEW.field_key LIKE 'membership.%' THEN RAISE EXCEPTION 'security journal rejected'; END IF; RETURN NEW; END $$`.execute(runtime.db);
 await sql`CREATE TRIGGER fail_security_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_security_journal()`.execute(runtime.db);
 try{
  assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:{...security.policy,foreignMax:'read'}})).statusCode,500);
  assert.equal((await api('configure_foreign_access',{...foreign,rules:[{id:randomUUID(),requester:{kind:'user',id:user.id},owner:{kind:'user',id:adminId},level:'read',confidential:false,objects:{}}]})).statusCode,500);
  assert.equal((await api('configure_group_inheritance',{workspaceId:ws.id,groupId:group.id,version:1,members:[{kind:'user',id:user.id,level:'read'}]})).statusCode,500);
 }finally{await sql`DROP TRIGGER fail_security_journal ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_security_journal()`.execute(runtime.db);}
 assert.deepEqual(await ok('get_record_security',{objectTypeId:object.id,recordId:record.id}),security);assert.deepEqual(await ok('get_foreign_access',{workspaceId:ws.id}),foreign);assert.equal((await ok('list_groups',{workspaceId:ws.id}))[0].version,1);
});

test('record Full preserves stronger retained field restrictions without allowing new delegation above a field ceiling',async()=>{
 const ws=await ok('create_workspace',{code:'retainedfieldcaps',name:'Retained field caps'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}}),secret=await ok('create_field',{objectTypeId:object.id,technicalName:'secret',labels:{en:'Secret'}}),cfg=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',fields:{[secret.id]:'none'}}]});
 let record=await ok('create_record',{objectTypeId:object.id,values:{secret:'Preserved value'}}),policy=(await ok('get_record_security',{objectTypeId:object.id,recordId:record.id})).policy;
 policy={...policy,owners:[{kind:'user',id:user.id,level:'full'}],fields:[{kind:'user',id:adminId,fields:{[secret.id]:'edit'}}]};record=await ok('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy});
 const retained=await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:{...policy,foreignMax:'read'}},userCookie);assert.equal(retained.statusCode,200,retained.body);record=retained.json();assert.equal(record.secret,undefined);
 const forbidden=await api('configure_record_security',{objectTypeId:object.id,recordId:record.id,version:record.version,policy:{...policy,foreignMax:'read',fields:[...policy.fields,{kind:'user',id:user.id,fields:{[secret.id]:'edit'}}]}},userCookie);assert.equal(forbidden.statusCode,403);
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:record.id})).secret,'Preserved value');
 await ok('set_definition_state',{kind:'object_type',id:object.id,expectedState:'active',state:'inactive',confirm:true});const inactive=(await api('get_record_security',{objectTypeId:object.id,recordId:record.id},userCookie));assert.equal(inactive.statusCode,200,inactive.body);assert.equal(inactive.json().canManage,false);
});

test('fresh installation creates only the current schema/catalog, is repeatable and rejects noncurrent databases without adopting them',async()=>{
 const {Pool}=await import('pg'),operator=new Pool({connectionString:databaseURL});
 const freshName=`install_${randomUUID().replaceAll('-','')}`,url=new URL(databaseURL);url.pathname='/'+freshName;await operator.query(`CREATE DATABASE "${freshName}"`);const inspection=new Pool({connectionString:url.href});
 try{
  await initializeDatabase(url.href,secret,baseURL);await initializeDatabase(url.href,secret,baseURL);
  assert.equal((await inspection.query('SELECT count(*)::int AS n FROM sys_users')).rows[0].n,0);
  for(const table of ['sys_sessions','sys_accounts','sys_verifications','sys_workspaces','sys_groups','sys_object_types','sys_fields','sys_record_identities','sys_record_security','sys_journal'])assert.equal((await inspection.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0,table);
  assert.equal((await inspection.query('SELECT count(*)::int AS n FROM sys_modules')).rows[0].n,3);
  assert.equal((await inspection.query('SELECT version FROM sys_schema_version')).rows[0].version,1);
  assert.equal((await inspection.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename IN('sys_primary_chain_levels','sys_schema_migrations','sys_administrators')")).rows[0].n,0);
  await inspection.query("UPDATE sys_schema_version SET definition_hash='different' WHERE singleton");await assert.rejects(initializeDatabase(url.href,secret,baseURL),/does not match/);
  await inspection.query('DROP TABLE sys_schema_version');await assert.rejects(initializeDatabase(url.href,secret,baseURL),/empty database/);
  assert.equal((await inspection.query('SELECT count(*)::int AS n FROM sys_modules')).rows[0].n,3,'Rejected initialization does not modify an existing schema');
 }finally{await inspection.end();await operator.query(`DROP DATABASE "${freshName}"`);await operator.end();}
});

test('sensitive policy is the sole ownership storage, covers sensitivity changes and is enforced by deferred integrity',async()=>{
 const ws=await ok('create_workspace',{code:'currentsecurity',name:'Current security'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const first=await ok('create_record',{objectTypeId:object.id}),second=await ok('create_record',{objectTypeId:object.id});let cfg=await ok('get_content_permissions',{objectTypeId:object.id});cfg=await ok('configure_content_permissions',{...cfg,sensitive:true});
 assert.equal((await sql`SELECT 1 FROM information_schema.columns WHERE table_name='currentsecurity_items' AND column_name='access_principals'`.execute(runtime.db)).rows.length,0);
 for(const record of [first,second])assert.equal((await ok('get_record_security',{objectTypeId:object.id,recordId:record.id})).policy.publicLevel,'full');
 await assert.rejects(sql`DELETE FROM sys_record_security WHERE object_type_id=${object.id}::uuid AND record_id=${first.id}::uuid`.execute(runtime.db),{code:'23503'});
 cfg=await ok('configure_content_permissions',{...cfg,sensitive:false,confirmWidening:true});const third=await ok('create_record',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true});assert.equal((await ok('get_record_security',{objectTypeId:object.id,recordId:third.id})).policy.publicLevel,'full');
 const created=await ok('create_record',{objectTypeId:object.id});assert.deepEqual(created.access_principals,[{kind:'user',id:adminId,level:'full'}]);assert.equal((await api('list_records',{objectTypeId:object.id,sortBy:'access_principals'})).statusCode,400);
});

test('permission editing retains inactive principals, exposes truthful snapshots and rejects new inactive memberships',async()=>{
 const ws=await ok('create_workspace',{name:'Permission lifecycle',code:'permissionlife'});
 const user=await ok('create_user',{name:'Inactive security sample',email:'inactive-security@example.test',initialPassword:randomBytes(24).toString('base64url')});
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const team=await ok('create_group',{workspaceId:ws.id,name:'Retained team',members:[{kind:'user',id:user.id,level:'read'}]});
 const destination=await ok('create_group',{workspaceId:ws.id,name:'New memberships'});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const detail=await ok('create_field',{objectTypeId:object.id,technicalName:'detail',labels:{en:'Detail'}});
 let rights=await ok('get_content_permissions',{objectTypeId:object.id});
 rights=await ok('configure_content_permissions',{...rights,sensitive:true,grants:[{kind:'group',id:team.id,level:'full',fields:{}},{kind:'user',id:user.id,level:'full',fields:{}}]});
 const row=await ok('create_record',{objectTypeId:object.id,values:{detail:'Retain me'}});
 let security=await ok('get_record_security',{objectTypeId:object.id,recordId:row.id});
 const policy={...security.policy,owners:[{kind:'group',id:team.id,level:'full'}],fields:[{kind:'group',id:team.id,fields:{[detail.id]:'none'}},{kind:'user',id:user.id,fields:{[detail.id]:'read'}}]};
 await ok('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy});
 await ok('set_group_active',{workspaceId:ws.id,groupId:team.id,version:team.version,active:false});
 await ok('configure_user',{userId:user.id,version:user.version,name:user.name,active:false,isAdmin:false});
 const members=await ok('list_workspace_members',{workspaceId:ws.id});assert.equal(members.find((p:any)=>p.id===user.id).active,false);
 const principalList=await ok('list_field_principals',{workspaceId:ws.id});assert.equal(principalList.find((p:any)=>p.id===user.id).active,false);
 security=await ok('get_record_security',{objectTypeId:object.id,recordId:row.id});
 assert.equal(security.principals.find((p:any)=>p.id===team.id).name,'Retained team');assert.equal(security.principals.find((p:any)=>p.id===team.id).assignable,false);
 assert.equal(security.principals.find((p:any)=>p.id===user.id).active,false);assert.deepEqual(security.fieldAccess[detail.id],{read:true,edit:true});
 const changed=await ok('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy:{...security.policy,privacy:'personal'}});assert.equal(changed.version,security.version+1);
 for(const member of [{kind:'user',id:user.id,level:'full'},{kind:'group',id:team.id,level:'full'}])assert.equal((await api('configure_group_inheritance',{workspaceId:ws.id,groupId:destination.id,version:destination.version,members:[member]})).statusCode,400);
 await ok('set_group_active',{workspaceId:ws.id,groupId:team.id,version:team.version+1,active:true});
 const retained=await ok('configure_group_inheritance',{workspaceId:ws.id,groupId:team.id,version:team.version+2,members:team.members});assert.equal(retained.version,team.version+2);
 assert.equal((await api('configure_group_inheritance',{workspaceId:ws.id,groupId:team.id,version:retained.version,members:[{kind:'user',id:user.id,level:'full'}]})).statusCode,400);
 await ok('configure_group_inheritance',{workspaceId:ws.id,groupId:team.id,version:retained.version,members:[]});
});

test('workspace removal journals Create grants and security snapshots enforce record field ceilings and stale drafts',async()=>{
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 const ws=await ok('create_workspace',{name:'Rights snapshot',code:'rightssnapshot'});
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'detail',labels:{en:'Detail'}});
 let rights=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...rights,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const row=await ok('create_record',{objectTypeId:object.id,values:{detail:'Restricted'}});
 let security=await ok('get_record_security',{objectTypeId:object.id,recordId:row.id});
 await ok('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy:{...security.policy,owners:[{kind:'user',id:user.id,level:'full'}],fields:[{kind:'user',id:user.id,fields:{[field.id]:'read'}}]}});
 const snapshot=await api('get_record_security',{objectTypeId:object.id,recordId:row.id},userCookie);assert.equal(snapshot.statusCode,200,snapshot.body);security=snapshot.json();assert.deepEqual(security.fieldAccess[field.id],{read:true,edit:false});
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy:{...security.policy,fields:[{kind:'user',id:user.id,fields:{[field.id]:'edit'}}]}},userCookie)).statusCode,403);
 const changed=await ok('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy:{...security.policy,foreignMax:'read'}});
 assert.equal((await api('configure_record_security',{objectTypeId:object.id,recordId:row.id,version:security.version,policy:security.policy},userCookie)).statusCode,409);
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).version,changed.version);
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:null,expectedRole:'user'});
 const journal=await ok('list_system_journal',{workspaceId:ws.id,fieldKey:`permission.user:${user.id}.create`,limit:100});
 assert.ok(journal.entries.some((entry:any)=>entry.old_value===true&&entry.new_value===null));
 assert.equal((await api('get_record_security',{objectTypeId:object.id,recordId:row.id},userCookie)).statusCode,403);
});

test('foreign settings retain deleted object overrides without blocking edits and reject newly inactive principals',async()=>{
 const ws=await ok('create_workspace',{name:'Foreign lifecycle',code:'foreignlife'});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const group=await ok('create_group',{workspaceId:ws.id,name:'Foreign owner'});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'unused',labels:{en:'Unused'}});
 let foreign=await ok('get_foreign_access',{workspaceId:ws.id});
 const rule={id:randomUUID(),requester:{kind:'user',id:user.id},owner:{kind:'group',id:group.id},level:'read',confidential:false,objects:{[object.id]:{level:'none'}}};
 foreign=await ok('configure_foreign_access',{...foreign,rules:[rule]});
 await ok('set_definition_state',{kind:'object_type',id:object.id,expectedState:'active',state:'deleted',confirm:true});
 foreign=await ok('configure_foreign_access',{...foreign,users:[{userId:user.id,inherit:false,manageOwn:false}]});
 assert.equal(foreign.rules[0].objects[object.id].level,'none');
 assert.equal((await api('configure_foreign_access',{...foreign,rules:[{...rule,objects:{[object.id]:{level:'full'}}}]})).statusCode,400);
 foreign=await ok('configure_foreign_access',{...foreign,rules:[{...rule,objects:{}}]});
 await ok('set_group_active',{workspaceId:ws.id,groupId:group.id,version:group.version,active:false});
 assert.equal((await api('configure_foreign_access',{...foreign,rules:[{...foreign.rules[0],level:'edit'}]})).statusCode,400);
 const unchanged=await ok('configure_foreign_access',foreign);assert.equal(unchanged.version,foreign.version);
 foreign=await ok('configure_foreign_access',{...foreign,rules:[]});assert.equal(foreign.rules.length,0);
 assert.equal((await api('configure_foreign_access',{...foreign,rules:[{...rule,objects:{}}]})).statusCode,400);
});

test('record form saves contents, links and security atomically with one version and change ID',async()=>{
 const ws=await ok('create_workspace',{name:'Atomic record access',code:'atomicaccess'});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const cfg=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const row=await ok('create_record',{objectTypeId:object.id,keyword:'Before'}),target=await ok('create_record',{objectTypeId:object.id,keyword:'Target'});
 const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((type:any)=>type.kind==='general');
 const policy={...defaultRecordSecurity([{kind:'user',id:user.id,level:'full'}]),foreignMax:'read' as const};
 const changed=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,keyword:'After',security:{policy},relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:object.id,recordId:target.id}]}]});
 assert.equal(changed.version,row.version+1);assert.equal(changed.keyword,'After');
 const securityHistory=(await journalEntries({objectTypeId:object.id,recordId:row.id})).find((entry:any)=>entry.field_key==='access.owners'&&entry.new_value?.some((p:any)=>p.id===user.id));
 assert.equal(securityHistory.security_context.principals[`user:${user.id}`],user.name);
 assert.deepEqual(securityHistory.new_value,[{kind:'user',id:user.id,level:'full'}],'current names supplement immutable ownership snapshots');
 const systemHistory=await ok('list_system_journal',{workspaceId:ws.id,fieldKey:'access.owners',limit:100});
 assert.ok(systemHistory.entries.some((entry:any)=>entry.id===securityHistory.id&&entry.security_context?.principals[`user:${user.id}`]===user.name));
 const entries=(await journalEntries({objectTypeId:object.id,recordId:row.id})).filter((entry:any)=>entry.old_value==='Before'||entry.field_key==='access.foreignMax'&&entry.old_value==='full'||entry.entity_kind==='relationship');
 assert.equal(new Set(entries.map((entry:any)=>entry.change_id)).size,1);assert.ok(entries.length>=3);
 const noOp=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:changed.version,security:{policy}});assert.equal(noOp.version,changed.version);
 const publicPolicy={...policy,owners:[],publicLevel:'full'};
 const invalid=await api('update_record',{objectTypeId:object.id,recordId:row.id,version:changed.version,keyword:'Must roll back',security:{policy:publicPolicy}});assert.equal(invalid.statusCode,400);
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).keyword,'After');
 const before=await ok('get_record_security',{objectTypeId:object.id,recordId:row.id});
 const narrowed=await api('update_record',{objectTypeId:object.id,recordId:row.id,version:changed.version,keyword:'Delegated',security:{policy:{...policy,owners:[{kind:'user',id:adminId,level:'full'}]}}},userCookie);
 assert.equal(narrowed.statusCode,200,narrowed.body);assert.equal(narrowed.json().permissions.read,false);assert.equal(narrowed.json().version,changed.version+1);
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).statusCode,403);
 const current=await ok('get_record',{objectTypeId:object.id,recordId:row.id});assert.equal(current.keyword,'Delegated');
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:before.version,security:{policy}})).statusCode,409);
});

test('record-form security changes require Full and journal failure rolls back the whole edit',async()=>{
 const ws=await ok('create_workspace',{name:'Guarded access form',code:'guardedaccess'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 let cfg=await ok('get_content_permissions',{objectTypeId:object.id});cfg=await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[{kind:'user',id:user.id,level:'edit',fields:{}}]});
 const policy=defaultRecordSecurity([{kind:'user',id:user.id,level:'full'}]);
 const row=await ok('create_record',{objectTypeId:object.id,keyword:'Original',security:{policy}});
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,keyword:'Denied',security:{policy:{...policy,foreignMax:'none'}}},userCookie)).statusCode,403);
 await sql`CREATE TRIGGER reject_access_form BEFORE INSERT ON sys_journal FOR EACH ROW WHEN (NEW.field_key='access.foreignMax') EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try {assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,keyword:'Rollback',security:{policy:{...policy,foreignMax:'read'}}})).statusCode,500);}
 finally{await sql`DROP TRIGGER reject_access_form ON sys_journal`.execute(runtime.db);}
 const stored=await ok('get_record',{objectTypeId:object.id,recordId:row.id});assert.equal(stored.keyword,'Original');assert.equal(stored.version,row.version);
 assert.equal((await ok('get_record_security',{objectTypeId:object.id,recordId:row.id})).policy.foreignMax,'full');
});

test('Designer can place the protected Access principals field without changing security or introducing a business column',async()=>{
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 const ws=await ok('create_workspace',{name:'Security form design',code:'securitylayout'});
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:null});
 const created=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const cfg=await ok('get_content_permissions',{objectTypeId:created.id});await ok('configure_content_permissions',{...cfg,sensitive:true,grants:[]});
 const row=await ok('create_record',{objectTypeId:created.id,keyword:'Protected'});
 const before=await ok('get_record_security',{objectTypeId:created.id,recordId:row.id});
 let object=await ok('get_object_type',{objectTypeId:created.id});const field=object.fields.find((f:any)=>f.technicalName==='access_principals'),keyword=object.fields.find((f:any)=>f.technicalName==='keyword');
 assert.equal(field.isProtected,true);
 const layout={groups:[{id:'custom',labels:{en:'My section',de:'Mein Bereich'},fields:[{fieldId:field.id,width:'half'},{fieldId:keyword.id,width:'half'}]}]};
 const response=await api('configure_form_layout',{objectTypeId:object.id,version:object.version,layout},userCookie);assert.equal(response.statusCode,200,response.body);object=response.json();
 assert.deepEqual(object.formLayouts.default,layout);
 assert.deepEqual(await ok('get_record_security',{objectTypeId:object.id,recordId:row.id}),before);
 assert.equal((await api('configure_field',{fieldId:field.id,version:field.version,required:false,labels:{en:'Changed'}},userCookie)).statusCode,403);
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{access_principals:[]}})).statusCode,400);
 assert.ok(!object.columns.includes('access_principals'));
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:'designer'});
 assert.equal((await api('configure_form_layout',{objectTypeId:object.id,version:object.version,layout},userCookie)).statusCode,403);
 const history=await ok('get_definition_journal',{objectTypeId:object.id});assert.ok(history.some((entry:any)=>entry.field_key==='form_layout.default'&&entry.new_value.groups[0].fields[0].fieldId===field.id));
});

test('recycle bin excludes records from every normal projection, retains edges/history and restores through API/MCP',async()=>{
 const ws=await ok('create_workspace',{name:'Recycle scope',code:'recycle'});
 const objects=[];for(const name of ['devices','contracts'])objects.push(await ok('create_object_type',{workspaceId:ws.id,technicalName:name,labels:{en:name},standardFields:['keyword']}));
 const [device,contract]=objects;
 let a=await ok('create_record',{objectTypeId:device.id,keyword:'Recycle needle'});
 let b=await ok('create_record',{objectTypeId:contract.id,keyword:'Retained contract'});
 const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.kind==='general');
 a=await ok('update_record',{objectTypeId:device.id,recordId:a.id,version:a.version,relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:contract.id,recordId:b.id}]}]});
 b=await ok('get_record',{objectTypeId:contract.id,recordId:b.id});const originalB=b.version;
 const before=(await ok('list_record_journal',{objectTypeId:device.id,recordId:a.id})).total;
 assert.equal((await api('recycle_record',{objectTypeId:device.id,recordId:a.id,version:a.version-1})).statusCode,409);
 const receipt=await tool('recycle_record',{objectTypeId:device.id,recordId:a.id,version:a.version});
 assert.equal(receipt.version,a.version+1);
 for(const operation of ['get_record','get_record_security','duplicate_record','get_record_relationships','get_relationship_tree_branch','list_record_link_options','update_record'] as const){const input:any={objectTypeId:device.id,recordId:a.id};if(['duplicate_record','update_record'].includes(operation))input.version=receipt.version;assert.equal((await api(operation,input)).statusCode,404,operation);}
 assert.equal((await ok('list_records',{objectTypeId:device.id})).total,0);
 assert.equal((await ok('list_workspace_records',{workspaceId:ws.id})).total,1);
 assert.equal((await ok('get_workspace_dashboard',{workspaceId:ws.id})).total,1);
 const search=await ok('search_workspace',{workspaceId:ws.id,query:'Recycle needle'});assert.ok(!JSON.stringify(search).includes(a.id));
 const candidates=await ok('search_relationship_candidates',{objectTypeId:contract.id,recordId:b.id,relationshipTypeId:general.id,side:'left',query:'Recycle needle'});assert.equal(candidates.total,0);
 const other=await ok('get_record_relationships',{objectTypeId:contract.id,recordId:b.id});assert.equal(other.edges.length,0);assert.ok(other.fields.some((f:any)=>f.restricted));
 const bin=await tool('list_recycled_records',{workspaceId:ws.id});assert.equal(bin.total,1);assert.equal(bin.records[0].id,a.id);assert.ok(bin.records[0].canRestore);
 const snapshot=await ok('get_recycled_record',{objectTypeId:device.id,recordId:a.id});assert.equal(snapshot.keyword,'Recycle needle');
 const history=await ok('list_record_journal',{objectTypeId:device.id,recordId:a.id,includeRecycled:true});assert.equal(history.total,before+1);assert.equal(history.entries.filter((e:any)=>e.field_key==='lifecycle').length,1);assert.ok(history.entries.some((e:any)=>e.entity_kind==='relationship'));
 assert.equal((await ok('get_record',{objectTypeId:contract.id,recordId:b.id})).version,originalB);
 const restored=await tool('restore_record',{objectTypeId:device.id,recordId:a.id,version:receipt.version});assert.equal(restored.version,receipt.version+1);
 assert.equal((await ok('list_recycled_records',{workspaceId:ws.id})).total,0);assert.equal((await ok('list_records',{objectTypeId:device.id})).total,1);
 assert.equal((await ok('get_record_relationships',{objectTypeId:contract.id,recordId:b.id})).edges.length,1);
 assert.equal((await ok('get_record',{objectTypeId:contract.id,recordId:b.id})).version,originalB);
});

test('recycle bin uses current Delete/Full rights, redacts fields and hides foreign workspace records',async()=>{
 const ws=await ok('create_workspace',{name:'Recycle rights',code:'recyclerights'}),user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'secret',kind:'text',labels:{en:'Secret'}});
 let config=await ok('get_content_permissions',{objectTypeId:object.id});
 config=await ok('configure_content_permissions',{...config,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',fields:{[field.id]:'none'}}]});
 const policy={...defaultRecordSecurity(),publicLevel:null,owners:[{kind:'user',id:user.id,level:'delete'}]};
 let record=await ok('create_record',{objectTypeId:object.id,keyword:'Owned item',values:{secret:'private value'},security:{policy,confirmPublic:false}});
 const recycled=await api('recycle_record',{objectTypeId:object.id,recordId:record.id,version:record.version},userCookie);assert.equal(recycled.statusCode,200,recycled.body);record={...record,...recycled.json()};
 assert.equal((await api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version},userCookie)).statusCode,403);
 let bin=await api('list_recycled_records',{workspaceId:ws.id},userCookie);assert.equal(bin.statusCode,200);assert.equal(bin.json().records[0].canRestore,false);
 const snapshot=await api('get_recycled_record',{objectTypeId:object.id,recordId:record.id},userCookie);assert.equal(snapshot.statusCode,200);assert.ok(!JSON.stringify(snapshot.json()).includes('private value'));
 const journal=await api('list_record_journal',{objectTypeId:object.id,recordId:record.id,includeRecycled:true},userCookie);assert.equal(journal.statusCode,200);assert.ok(!JSON.stringify(journal.json()).includes('private value'));
 config=await ok('configure_content_permissions',{...config,grants:[{kind:'user',id:user.id,level:'none',fields:{}}]});
 bin=await api('list_recycled_records',{workspaceId:ws.id},userCookie);assert.equal(bin.json().total,0);
 assert.equal((await api('get_recycled_record',{objectTypeId:object.id,recordId:record.id},userCookie)).statusCode,403);
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id},userCookie)).statusCode,403,'normal reads do not disclose recycled state after revocation');
 const foreign=await ok('create_workspace',{name:'Other bin',code:'foreignbin'});assert.equal((await api('list_recycled_records',{workspaceId:foreign.id},userCookie)).statusCode,403);
 await ok('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version});
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:record.id})).keyword,'Owned item');
});

test('recycle and restore roll back on journal failure and restore rejects changed required fields or inactive objects',async()=>{
 const ws=await ok('create_workspace',{name:'Recycle validation',code:'recyclevalidation'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 let record=await ok('create_record',{objectTypeId:object.id,keyword:'Rollback'});
 await sql`CREATE TRIGGER reject_recycle_journal BEFORE INSERT ON sys_journal FOR EACH ROW WHEN(NEW.field_key='lifecycle') EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('recycle_record',{objectTypeId:object.id,recordId:record.id,version:record.version})).statusCode,500);assert.equal((await ok('list_recycled_records',{workspaceId:ws.id})).total,0);assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:record.id})).version,record.version);}finally{await sql`DROP TRIGGER reject_recycle_journal ON sys_journal`.execute(runtime.db);}
 record={...record,...await ok('recycle_record',{objectTypeId:object.id,recordId:record.id,version:record.version})};
 await sql`CREATE TRIGGER reject_recycle_journal BEFORE INSERT ON sys_journal FOR EACH ROW WHEN(NEW.field_key='lifecycle') EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version})).statusCode,500);assert.equal((await ok('get_recycled_record',{objectTypeId:object.id,recordId:record.id})).version,record.version);}finally{await sql`DROP TRIGGER reject_recycle_journal ON sys_journal`.execute(runtime.db);}
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'required_later',labels:{en:'Required later'},kind:'text'});
 // Definitions normally preflight retained contents; simulate an invalid restored backup to exercise the boundary.
 await sql`UPDATE sys_fields SET required=true WHERE id=${field.id}::uuid`.execute(runtime.db);
 assert.equal((await api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version})).statusCode,400);
 assert.equal((await ok('list_recycled_records',{workspaceId:ws.id})).total,1);
 await sql`UPDATE sys_fields SET required=false WHERE id=${field.id}::uuid`.execute(runtime.db);
 await ok('set_definition_state',{kind:'object_type',id:object.id,expectedState:'active',state:'inactive'});
 assert.equal((await ok('list_recycled_records',{workspaceId:ws.id})).total,1);assert.equal((await ok('list_recycled_records',{workspaceId:ws.id})).records[0].canRestore,false);
 assert.equal((await api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version})).statusCode,400);
 await ok('set_definition_state',{kind:'object_type',id:object.id,expectedState:'inactive',state:'active'});
 const results=await Promise.all([api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version}),api('restore_record',{objectTypeId:object.id,recordId:record.id,version:record.version})]);
 assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});

test('recycle bin keeps Primary children active and cardinality slots reserved until restoration',async()=>{
 const ws=await ok('create_workspace',{code:'recycleprimary',name:'Recycle Primary'});
 const primary=await enableProjects(ws.id),context=await ok('get_primary_chain_context',{objectTypeId:(await ok('list_object_types',{workspaceId:ws.id})).find((t:any)=>t.technicalName==='projects').id}),chain=context.configuration;
 let parent=await createOrganization(chain.contact,'Parent contact');
 let project=await ok('create_record',{objectTypeId:chain.project,keyword:'Project remains',relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:chain.contact,recordId:parent.id}]}]});
 parent=await ok('get_record',{objectTypeId:chain.contact,recordId:parent.id});
 const oldProject=project.version;
 parent={...parent,...await ok('recycle_record',{objectTypeId:chain.contact,recordId:parent.id,version:parent.version})};
 const hidden=await tool('get_primary_chain_context',{objectTypeId:chain.project,recordId:project.id});assert.equal(hidden.direct,null);assert.equal(hidden.unavailable,true);assert.ok(!JSON.stringify(hidden).includes('Parent contact'));
 assert.equal((await ok('get_record',{objectTypeId:chain.project,recordId:project.id})).version,oldProject);
 const relations=await ok('get_record_relationships',{objectTypeId:chain.project,recordId:project.id});assert.ok(relations.fields.some((f:any)=>f.restricted&&f.definition.kind==='primary'));
 await ok('restore_record',{objectTypeId:chain.contact,recordId:parent.id,version:parent.version});assert.equal((await ok('get_primary_chain_context',{objectTypeId:chain.project,recordId:project.id})).direct.recordId,parent.id);
 const a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'licenses',labels:{en:'Licenses'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'machines',labels:{en:'Machines'}});
 const config={labels:{en:'Assigned'},leftLabels:{en:'Machine'},rightLabels:{en:'License'},directed:true,leftMin:0,leftMax:1,rightMin:0,rightMax:1,allowAll:false,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}],active:true};
 let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'assignment',configuration:config});relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
 let first=await ok('create_record',{objectTypeId:a.id}),target=await ok('create_record',{objectTypeId:b.id});
 first=await ok('update_record',{objectTypeId:a.id,recordId:first.id,version:first.version,relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'left',targets:[{objectTypeId:b.id,recordId:target.id}]}]});
 first={...first,...await ok('recycle_record',{objectTypeId:a.id,recordId:first.id,version:first.version})};
 const second=await ok('create_record',{objectTypeId:a.id});
 assert.equal((await api('update_record',{objectTypeId:a.id,recordId:second.id,version:second.version,relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'left',targets:[{objectTypeId:b.id,recordId:target.id}]}]})).statusCode,409);
 await ok('restore_record',{objectTypeId:a.id,recordId:first.id,version:first.version});
});

test('field input rules validate typed defaults, apply only on create/omission and journal translated metadata atomically',async()=>{
 const ws=await ok('create_workspace',{name:'Input rules',code:'inputrules'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const rules={description:{en:'Short purpose',de:'Kurzer Zweck'},helpText:{en:'Enter the identifier',de:'Kennung eingeben'},defaultValue:'001',unique:false};
 const field=await tool('create_field',{objectTypeId:object.id,technicalName:'code',labels:{en:'Code',de:'Kennung'},kind:'text',required:true,inputRules:rules});
 const first=await ok('create_record',{objectTypeId:object.id,keyword:'First'});assert.equal(first.code,'001');
 const explicit=await ok('create_record',{objectTypeId:object.id,keyword:'Explicit',values:{code:'chosen'}});assert.equal(explicit.code,'chosen');
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{code:null}})).statusCode,400);
 let definition=await ok('get_object_type',{objectTypeId:object.id});assert.deepEqual(definition.fields.find((f:any)=>f.id===field.id).inputRules,rules);
 definition=await ok('configure_field',{fieldId:field.id,version:1,required:true,inputRules:{...rules,defaultValue:'new'}});
 const updated=await ok('update_record',{objectTypeId:object.id,recordId:first.id,version:first.version,keyword:'Renamed'});assert.equal(updated.code,'001');
 assert.equal((await tool('create_record',{objectTypeId:object.id})).code,'new');
 const journal=await ok('get_definition_journal',{objectTypeId:object.id});assert.ok(journal.some((e:any)=>e.field_key==='input.defaultValue'&&e.old_value==='001'&&e.new_value==='new'));
 assert.equal((await api('configure_field',{fieldId:field.id,version:1,required:true,inputRules:rules})).statusCode,409);
 const numeric=await ok('create_field',{objectTypeId:object.id,technicalName:'amount',labels:{en:'Amount'},kind:'decimal',inputRules:{defaultValue:'01.20'}});
 const current=await ok('get_object_type',{objectTypeId:object.id});assert.equal(current.fields.find((f:any)=>f.id===numeric.id).inputRules.defaultValue,'1.2');
 assert.equal((await api('create_field',{objectTypeId:object.id,technicalName:'bad',labels:{en:'Bad'},kind:'integer',inputRules:{defaultValue:'not a number'}})).statusCode,400);
});

test('unique field rules use normalized scalar values, protect recycled slots and reject concurrent or existing duplicates without disclosing contents',async()=>{
 const ws=await ok('create_workspace',{name:'Unique fields',code:'uniquefields'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'code',labels:{en:'Code'},inputRules:{unique:true}});
 const results=await Promise.all([api('create_record',{objectTypeId:object.id,values:{code:' AbC '}}),api('create_record',{objectTypeId:object.id,values:{code:'abc'}})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
 const row=results.find(r=>r.statusCode===200)!.json();await ok('recycle_record',{objectTypeId:object.id,recordId:row.id,version:row.version});
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{code:'ABC'}})).statusCode,409);
 for(let i=0;i<2;i++)await ok('create_record',{objectTypeId:object.id,values:{code:null}});
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{code:'x'.repeat(2001)}})).statusCode,400);
 assert.equal((await api('create_field',{objectTypeId:object.id,technicalName:'many',kind:'multiple_choice',labels:{en:'Many'},inputRules:{unique:true}})).statusCode,400);
 const other=await ok('create_field',{objectTypeId:object.id,technicalName:'other',labels:{en:'Other'}});
 for(let i=0;i<2;i++)await ok('create_record',{objectTypeId:object.id,values:{other:'same'}});
 assert.equal((await api('configure_field',{fieldId:other.id,version:1,required:false,inputRules:{unique:true}})).statusCode,409);
 assert.equal((await ok('get_object_type',{objectTypeId:object.id})).fields.find((f:any)=>f.id===other.id).inputRules.unique,false);
 await ok('configure_field',{fieldId:field.id,version:1,required:false,inputRules:{unique:false}});
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{code:'abc'}})).statusCode,200);
});

test('business numbers use atomic workspace-scoped counters, preserve issued values and support guarded configuration and restarts',async()=>{
 const ws=await ok('create_workspace',{name:'Numbering',code:'numbering',timeZone:'Europe/Berlin'});let object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const config={enabled:true,prefix:'ITX-',suffix:'-X',start:'10',increment:'5',padding:4,restart:'never'};
 object=await tool('configure_object_settings',{objectTypeId:object.id,version:1,labels:object.labels,numbering:config});
 assert.equal(object.version,2);assert.ok(object.fields.some((f:any)=>f.technicalName==='business_number'&&f.isProtected));
 const protectedNumber=object.fields.find((f:any)=>f.technicalName==='business_number');const protectedEdit=await api('configure_field',{fieldId:protectedNumber.id,version:protectedNumber.version,required:false});assert.equal(protectedEdit.statusCode,403);assert.equal(protectedEdit.json().error,'System field definition is protected');
 const rows=await Promise.all(Array.from({length:3},(_,i)=>ok('create_record',{objectTypeId:object.id,keyword:String(i)})));
 assert.deepEqual(rows.map(r=>r.business_number).sort(),['ITX-0010-X','ITX-0015-X','ITX-0020-X']);
 assert.equal((await api('create_record',{objectTypeId:object.id,values:{business_number:'manual'}})).statusCode,400);
 assert.equal((await ok('list_records',{objectTypeId:object.id,query:rows[0].business_number})).total,1);
 assert.equal((await ok('list_workspace_records',{workspaceId:ws.id,query:rows[0].business_number})).total,1);
 assert.equal((await ok('search_workspace',{workspaceId:ws.id,query:rows[0].business_number})).records.length,1);
 assert.equal((await api('configure_object_settings',{objectTypeId:object.id,version:1,labels:object.labels,numbering:config})).statusCode,409);
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:{...config,prefix:'NEW-'}});
 assert.equal((await ok('create_record',{objectTypeId:object.id})).business_number,'NEW-0025-X');
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:rows[0].id})).business_number,rows[0].business_number);
 const duplicate=await ok('duplicate_record',{objectTypeId:object.id,recordId:rows[0].id,version:rows[0].version});assert.equal(duplicate.business_number,'NEW-0030-X');
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:{...config,restart:'yearly'}});
 assert.match((await ok('create_record',{objectTypeId:object.id})).business_number,/^ITX-\d{4}-0010-X$/);
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:{...config,restart:'monthly'}});
 assert.match((await ok('create_record',{objectTypeId:object.id})).business_number,/^ITX-\d{4}-\d{2}-0010-X$/);
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:{...config,enabled:false}});
 assert.equal((await ok('create_record',{objectTypeId:object.id})).business_number,null);
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:config});
 assert.equal((await ok('create_record',{objectTypeId:object.id})).business_number,'ITX-0035-X');
});

test('input aid metadata follows language policy, conditional defaults and current field creation rights',async()=>{
 const ws=await ok('create_workspace',{name:'Input rights',code:'inputrights'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['type_status','category']});
 const id=randomUUID(),controller=await ok('create_field',{objectTypeId:object.id,technicalName:'kind',labels:{en:'Kind'},kind:'single_choice',config:{options:[{id,labels:{en:'Yes'},active:true}]},inputRules:{defaultValue:id}});
 await ok('create_field',{objectTypeId:object.id,technicalName:'detail',labels:{en:'Detail'},required:true,applicability:{fieldId:controller.id,optionIds:[id]},inputRules:{defaultValue:'Conditional'}});
 const secret=await ok('create_field',{objectTypeId:object.id,technicalName:'secret',labels:{en:'Secret'},inputRules:{defaultValue:'Private default'}});
 const a=await tool('create_record',{objectTypeId:object.id});assert.equal(a.detail,'Conditional');
 const b=await ok('create_record',{objectTypeId:object.id,values:{kind:id.toUpperCase()}});assert.equal(b.detail,'Conditional');
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const permissions=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{[secret.id]:'none'}}]});
 const own=await api('create_record',{objectTypeId:object.id},userCookie);assert.equal(own.statusCode,200,own.body);assert.ok(!Object.hasOwn(own.json(),'secret'));
 assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:own.json().id})).secret,null,'inaccessible defaults are not written silently');
 const definition=await ok('get_object_type',{objectTypeId:object.id}),type=definition.fields.find((f:any)=>f.kind==='type');
 const {version,...config}=definition.classification;
 const changed=await ok('configure_classification',{objectTypeId:object.id,version,config,fieldInputRules:[{fieldId:type.id,version:type.version,inputRules:{description:{de:'Typ auswählen',en:'Choose a type'},helpText:{en:'Optional'}}}]});
 assert.equal(changed.fields.find((f:any)=>f.id===type.id).description,'Choose a type');
 assert.equal((await api('configure_classification',{objectTypeId:object.id,version,config,fieldInputRules:[{fieldId:type.id,version:type.version,inputRules:{description:{en:'stale'}}}]})).statusCode,409);
 assert.equal((await api('configure_field',{fieldId:secret.id,version:1,required:false,inputRules:{defaultValue:'forbidden'}},userCookie)).statusCode,403);
});

test('failed numbered creation rolls back allocation, counter, contents and journals together',async()=>{
 const ws=await ok('create_workspace',{name:'Number rollback',code:'numberrollback'}),created=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 let object=await ok('get_object_type',{objectTypeId:created.id});
 object=await ok('configure_object_settings',{objectTypeId:object.id,version:object.version,labels:object.labels,numbering:{enabled:true,prefix:'R-',suffix:'',start:'1',increment:'1',padding:2,restart:'never'}});
 await sql`CREATE FUNCTION fail_number_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key='business_number' THEN RAISE EXCEPTION 'number journal fail'; END IF; RETURN NEW; END $$`.execute(runtime.db);
 await sql`CREATE TRIGGER fail_number BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_number_journal()`.execute(runtime.db);
 try {assert.equal((await api('create_record',{objectTypeId:object.id})).statusCode,500);assert.equal((await sql<{count:number}>`SELECT count(*)::integer AS count FROM sys_number_allocations WHERE object_type_id=${object.id}::uuid`.execute(runtime.db)).rows[0].count,0);}
 finally {await sql`DROP TRIGGER fail_number ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_number_journal()`.execute(runtime.db);}
 const row=await ok('create_record',{objectTypeId:object.id});assert.equal(row.business_number,'R-01');
 assert.equal((await journalEntries({objectTypeId:object.id,recordId:row.id})).filter((e:any)=>e.field_key==='business_number').length,1);
});

test('every custom field type accepts typed defaults and rejects stale inactive choices without changing stored metadata',async()=>{
 const ws=await ok('create_workspace',{name:'Typed defaults',code:'typeddefaults'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const option=randomUUID(),group=await ok('create_group',{workspaceId:ws.id,name:'Default team'});
 const cases:any[]=[['text','text','Example',{}],['multiline','multiline','Multiple\nlines',{}],['integer','integer','42',{}],['decimal','decimal','1.20',{scale:2}],['money','money',{amount:'2300.50',currency:'EUR'},{scale:2,currency:'EUR'}],['boolean','boolean',false,{}],['date','date','2026-01-02',{}],['datetime','datetime','2026-01-02T12:30:00+01:00',{}],['single','single_choice',option,{options:[{id:option,labels:{en:'Option'},active:true}]}],['multiple','multiple_choice',[randomUUID()],{}],['email','email','demo@example.test',{}],['phone','phone','+49301234567',{}],['url','url','https://example.test/',{}],['reference','reference',{kind:'user',id:adminId},{referenceTarget:'user',multiple:false}],['references','reference',[{kind:'group',id:group.id},{kind:'user',id:adminId}],{referenceTarget:'both',multiple:true}]];
 const multiple=cases.find(item=>item[0]==='multiple');multiple[3]={options:[{id:multiple[2][0],labels:{en:'Multiple'},active:true}]};
 const fields:any[]=[];for(const [technicalName,kind,defaultValue,config] of cases)fields.push(await ok('create_field',{objectTypeId:object.id,technicalName:`sample_${technicalName}`,kind,labels:{en:technicalName},config,inputRules:{defaultValue}}));
 const record=await tool('create_record',{objectTypeId:object.id});for(const [name,,,] of cases)assert.notEqual(record[`sample_${name}`],null,name);
 assert.equal(record.sample_integer,'42');assert.equal(record.sample_decimal,'1.2');assert.deepEqual(record.sample_money,{amount:'2300.5',currency:'EUR'});assert.equal(record.sample_boolean,false);assert.equal(record.sample_datetime,'2026-01-02T11:30:00.000Z');assert.deepEqual(record.sample_reference,{kind:'user',id:adminId});assert.equal(record.sample_references.length,2);
 const single=fields.find(f=>f.technicalName==='sample_single');assert.equal((await api('configure_field',{fieldId:single.id,version:1,required:false,config:{options:[{id:option,labels:{en:'Option'},active:false}]}})).statusCode,400);
 assert.equal((await ok('get_object_type',{objectTypeId:object.id})).fields.find((f:any)=>f.id===single.id).config.options[0].active,true);
});

test('combined group editing saves name and graded members with one version/change and rejects unauthorized or failed edits atomically',async()=>{
 const ws=await ok('create_workspace',{name:'Inline group editor',code:'inlinegroups'}),ordinary=(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0];
 await ok('set_workspace_member',{workspaceId:ws.id,userId:ordinary.id,role:'designer',expectedRole:null});
 const group=await ok('create_group',{workspaceId:ws.id,name:'Before'});
 const input={workspaceId:ws.id,groupId:group.id,version:1,name:'After',members:[{kind:'user',id:ordinary.id,level:'read'}]};
 assert.equal((await api('configure_group',input,userCookie)).statusCode,403);
 const saved=await tool('configure_group',input);assert.equal(saved.name,'After');assert.equal(saved.version,2);assert.deepEqual(saved.members,input.members);
 const events=(await sql<any>`SELECT * FROM sys_journal WHERE entity_id=${group.id}::uuid AND field_key IN ('name',${`membership.user:${ordinary.id}`})`.execute(runtime.db)).rows;
 const edits=events.filter(e=>e.field_key!=='name'||e.new_value==='After');assert.equal(edits.length,2);assert.equal(new Set(edits.map(e=>e.change_id)).size,1);
 assert.equal((await api('configure_group',input)).statusCode,409);
 assert.equal((await api('configure_group',{...input,version:2,name:'Should roll back',members:[{kind:'group',id:group.id,level:'full'}]})).statusCode,400);
 const retained=(await ok('list_groups',{workspaceId:ws.id}))[0];assert.equal(retained.name,'After');assert.equal(retained.version,2);assert.deepEqual(retained.members,input.members);
 await sql`CREATE FUNCTION fail_inline_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key LIKE 'membership.%' THEN RAISE EXCEPTION 'inline journal fail'; END IF; RETURN NEW; END $$`.execute(runtime.db);
 await sql`CREATE TRIGGER fail_inline_group BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_inline_group()`.execute(runtime.db);
 try{assert.equal((await api('configure_group',{...input,version:2,name:'Also roll back',members:[]})).statusCode,500);}
 finally{await sql`DROP TRIGGER fail_inline_group ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_inline_group()`.execute(runtime.db);}
 assert.equal((await ok('list_groups',{workspaceId:ws.id}))[0].name,'After');
});

test('unique input errors identify only the field and context while global search returns only permitted business numbers',async()=>{
 const ws=await ok('create_workspace',{name:'Field feedback',code:'fieldfeedback'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'registration',kind:'text',labels:{en:'Registration'},inputRules:{unique:true}});
 await ok('create_record',{objectTypeId:object.id,keyword:'Private source',values:{registration:'BUSY'}});
 const conflict=await api('create_record',{objectTypeId:object.id,keyword:'Draft',values:{registration:'busy'}});assert.equal(conflict.statusCode,409);
 assert.deepEqual(conflict.json().details,{code:'unique_value',fieldId:field.id,context:'record'});assert.equal(conflict.body.includes('Private source'),false);assert.equal(conflict.body.includes('BUSY'),false);
 const second=await ok('create_field',{objectTypeId:object.id,technicalName:'duplicate_value',kind:'text',labels:{en:'Other'}});
 await ok('create_record',{objectTypeId:object.id,values:{duplicate_value:'Repeated'}});await ok('create_record',{objectTypeId:object.id,values:{duplicate_value:'Repeated'}});
 const definitionError=await api('configure_field',{fieldId:second.id,version:1,required:false,inputRules:{unique:true}});assert.equal(definitionError.statusCode,409);assert.deepEqual(definitionError.json().details,{code:'unique_value',fieldId:second.id,context:'definition'});
 const configured=await ok('configure_object_settings',{objectTypeId:object.id,version:1,labels:{en:'Items'},numbering:{enabled:true,prefix:'FB-',suffix:'',start:'1',increment:'1',padding:3,restart:'never'}});
 const row=await ok('create_record',{objectTypeId:object.id,keyword:'Numbered'});assert.equal((await ok('search_workspace',{workspaceId:ws.id,query:row.business_number})).records[0].businessNumber,row.business_number);
 const ordinary=(await sql<{id:string}>`SELECT id FROM sys_users WHERE email='user@example.test'`.execute(runtime.db)).rows[0];await ok('set_workspace_member',{workspaceId:ws.id,userId:ordinary.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:object.id}),numberField=configured.fields.find((f:any)=>f.technicalName==='business_number');
 await ok('configure_content_permissions',{objectTypeId:object.id,version:rights.version,sensitive:false,grants:[{kind:'user',id:ordinary.id,level:'read',create:false,fields:{[numberField.id]:'none'}}]});
 assert.equal((await api('search_workspace',{workspaceId:ws.id,query:'Numbered'},userCookie)).json().records[0].businessNumber,null);
 assert.equal((await api('search_workspace',{workspaceId:ws.id,query:row.business_number},userCookie)).json().records.length,0);
});

test('structured contact fields share API/MCP, field permissions, safe conversion, versions and atomic history',async()=>{
 const inventory=await tool('list_field_schemas',{});assert.equal(inventory.length,10);
 const ws=await ok('create_workspace',{name:'Structured contacts',code:'structuredcontacts'});
 const object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'people',labels:{en:'People',de:'Personen'},standardFields:['keyword']});
 const names=await ok('create_field',{objectTypeId:object.id,technicalName:'given_names',labels:{en:'Given names',de:'Vornamen'},kind:'structured',config:{schema:'name_components'}});
 const birthday=await ok('create_field',{objectTypeId:object.id,technicalName:'birthday',labels:{en:'Birthday',de:'Geburtsdatum'},kind:'structured',config:{schema:'partial_date'}});
 const a={id:randomUUID(),text:'Ada'},b={id:randomUUID(),text:'Augusta'};
 const row=await tool('create_record',{objectTypeId:object.id,keyword:'Ada',values:{given_names:[a,b],birthday:{month:2,day:29,year:null}}});
 assert.deepEqual(row.given_names,[a,b]);assert.equal(row.birthday.year,null);
 const before=(await journalEntries({objectTypeId:object.id,recordId:row.id})).length;
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{given_names:[a,a]}})).statusCode,400);
 assert.equal((await journalEntries({objectTypeId:object.id,recordId:row.id})).length,before);
 const updated=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{given_names:[b,a]}});assert.deepEqual(updated.given_names,[b,a]);
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{given_names:[]}})).statusCode,409);
 const journal=await journalEntries({objectTypeId:object.id,recordId:row.id});assert.equal(journal.filter((e:any)=>e.field_id===names.id).length,2);
 const reorder=journal.find((e:any)=>e.field_id===names.id&&e.old_value!==null);assert.deepEqual(reorder.detail_context,{schema:'name_components',changes:[{path:'$order'}]});
 assert.equal((await api('configure_field',{fieldId:names.id,required:false,kind:'text',config:{}})).statusCode,400);
 assert.equal((await api('list_records',{objectTypeId:object.id,sortBy:'given_names'})).statusCode,400);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const permissions=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'edit',fields:{[birthday.id]:'none',[names.id]:'read'}}]});
 const visible=(await api('get_record',{objectTypeId:object.id,recordId:row.id},userCookie)).json();assert.deepEqual(visible.given_names,[b,a]);assert.ok(!Object.hasOwn(visible,'birthday'));
 assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:updated.version,values:{given_names:[]}},userCookie)).statusCode,403);
 const history=(await api('list_record_journal',{objectTypeId:object.id,recordId:row.id},userCookie)).json();assert.ok(!JSON.stringify(history).includes(birthday.id));
 await sql`CREATE FUNCTION fail_structured_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.field_key='given_names' THEN RAISE EXCEPTION 'structured journal fail'; END IF; RETURN NEW; END $$`.execute(runtime.db);
 await sql`CREATE TRIGGER fail_structured_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION fail_structured_journal()`.execute(runtime.db);
 try{assert.equal((await api('update_record',{objectTypeId:object.id,recordId:row.id,version:updated.version,values:{given_names:[a]}})).statusCode,500);}finally{await sql`DROP TRIGGER fail_structured_journal ON sys_journal`.execute(runtime.db);await sql`DROP FUNCTION fail_structured_journal()`.execute(runtime.db);}
 assert.deepEqual((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).given_names,[b,a]);
});

test('Contacts module installs structured Contacts and Distribution lists with shared bindings, derived names and normal relationships',async()=>{
 const ws=await ok('create_workspace',{name:'Contact templates',code:'contacttemplates'});
 const enabled=await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});assert.equal(enabled.enabled,true);
 const types=await ok('list_object_types',{workspaceId:ws.id});assert.equal(types.length,2);
 const contact=await ok('get_object_type',{objectTypeId:types.find((t:any)=>t.technicalName==='contacts').id}),list=types.find((t:any)=>t.technicalName==='distribution_lists');
 const kind=contact.fields.find((f:any)=>f.technicalName==='contact_kind'),organization=kind.config.options.find((o:any)=>o.labels.en==='Organization').id,person=kind.config.options.find((o:any)=>o.labels.en==='Contact person').id,individual=kind.config.options.find((o:any)=>o.labels.en==='Individual contact').id;
 const name=(text:string)=>[{id:randomUUID(),text}];
 const org=await ok('create_record',{objectTypeId:contact.id,values:{contact_kind:organization,company_name:'ITextreme'}});assert.equal(org.keyword,'ITextreme');
 const ap=await ok('create_record',{objectTypeId:contact.id,values:{contact_kind:person,first_name:name('Jane'),last_name:name('Doe')}});assert.equal(ap.keyword,'Doe, Jane');
 const standalone=await ok('create_record',{objectTypeId:contact.id,values:{contact_kind:individual,first_name:name('John'),last_name:name('Doe'),birthday:{year:null,month:2,day:29}}});assert.equal(standalone.keyword,'Doe, John');
 assert.equal((await api('create_record',{objectTypeId:contact.id,keyword:'Override',values:{contact_kind:organization,company_name:'Company'}})).statusCode,400);
 assert.equal((await api('create_record',{objectTypeId:contact.id,values:{contact_kind:person}})).statusCode,400);
 const blockedKind=await api('update_record',{objectTypeId:contact.id,recordId:ap.id,version:ap.version,values:{contact_kind:individual}});assert.equal(blockedKind.statusCode,400);
 assert.equal((await ok('get_record',{objectTypeId:contact.id,recordId:ap.id})).version,ap.version);
 assert.equal((await tool('update_record',{objectTypeId:contact.id,recordId:ap.id,version:ap.version,values:{contact_kind:person}})).contact_kind,person);
 assert.equal((await api('configure_form_layout',{objectTypeId:contact.id,version:contact.version,layout:{groups:[{id:'core',labels:{en:'Core'},fields:[{fieldId:kind.id,width:'half'}]}]}})).statusCode,400);

 assert.ok(contact.contactProfile);assert.equal(contact.contactProfile.fields.contact_kind,kind.id);
 const extra=await ok('create_field',{objectTypeId:contact.id,technicalName:'contact_extension',labels:{en:'Extension',de:'Ergänzung'},kind:'text'});
 const currentContact=await ok('get_object_type',{objectTypeId:contact.id});
 await tool('configure_form_layout',{objectTypeId:contact.id,version:currentContact.version,layout:{groups:[{id:'extension',labels:{en:'Additional',de:'Zusätzlich'},fields:[{fieldId:extra.id,width:'full'}]}]}});
 assert.deepEqual((await ok('get_object_type',{objectTypeId:contact.id})).formLayouts.default.groups[0].fields,[{fieldId:extra.id,width:'full'}]);

 const emails=contact.fields.find((f:any)=>f.technicalName==='emails'),contextId=randomUUID();
 const configured=await ok('configure_field',{fieldId:emails.id,required:false,config:{...emails.config,options:[...emails.config.options,{id:contextId,labels:{en:'Service',de:'Service'},active:true}]}});
 assert.equal(configured.fields.find((f:any)=>f.id===emails.id).config.options.at(-1).id,contextId);
 assert.equal((await api('configure_field',{fieldId:emails.id,required:false,config:{...emails.config,schema:'url_entries'}})).statusCode,403);
 const historical=(await ok('list_system_journal',{workspaceId:ws.id,entityKind:'record'})).entries.find((e:any)=>e.field_id===contact.contactProfile.fields.first_name&&e.entity_id===ap.id);
 assert.equal(historical.value_context.after.kind,'structured');assert.equal(historical.value_context.after.config.schema,'name_components');
 const relations=await ok('list_relationship_types',{workspaceId:ws.id}),membership=relations.find((r:any)=>r.technicalName==='contact_person');assert.equal(membership.moduleKey,'contacts');assert.equal(membership.isProtected,true);
 await ok('update_record',{objectTypeId:contact.id,recordId:ap.id,version:ap.version,relationships:[{relationshipTypeId:membership.id,version:membership.version,side:'right',targets:[{objectTypeId:contact.id,recordId:org.id}]}]});
 assert.equal((await ok('get_record',{objectTypeId:contact.id,recordId:ap.id})).keyword,'Doe, Jane (ITextreme)');
 await ok('update_record',{objectTypeId:contact.id,recordId:org.id,version:(await ok('get_record',{objectTypeId:contact.id,recordId:org.id})).version,values:{company_name:'ITX'}});
 assert.equal((await ok('get_record',{objectTypeId:contact.id,recordId:ap.id})).keyword,'Doe, Jane (ITX)');
 const group=await ok('create_record',{objectTypeId:list.id,keyword:'Partners'}),members=relations.find((r:any)=>r.technicalName==='distribution_members');
 await ok('update_record',{objectTypeId:list.id,recordId:group.id,version:group.version,relationships:[{relationshipTypeId:members.id,version:members.version,side:'left',targets:[{objectTypeId:contact.id,recordId:org.id},{objectTypeId:contact.id,recordId:standalone.id}]}]});
 assert.equal((await ok('get_record_relationships',{objectTypeId:list.id,recordId:group.id})).dossier.length,2);
 assert.equal((await ok('search_workspace',{workspaceId:ws.id,query:'ITX'})).records.length,2);
 assert.equal((await ok('list_records',{objectTypeId:contact.id,sortBy:'keyword'})).total,3);
 assert.equal((await tool('list_workspace_records',{workspaceId:ws.id,query:'ITX'})).total,2);
 assert.equal((await ok('get_workspace_dashboard',{workspaceId:ws.id})).total,4);
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:1});
 assert.equal((await ok('list_object_types',{workspaceId:ws.id})).filter((t:any)=>t.technicalName==='contacts').length,1);
 assert.equal((await ok('get_record',{objectTypeId:contact.id,recordId:org.id})).keyword,'ITX');
});

test('Contacts derived values never bypass source-field rights, membership cardinality or protected kind identities',async()=>{
 const ws=await ok('create_workspace',{name:'Contact security',code:'contactsecurity'});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const summary=(await ok('list_object_types',{workspaceId:ws.id})).find((row:any)=>row.technicalName==='contacts');
 const model=await ok('get_object_type',{objectTypeId:summary.id}),kind=model.fields.find((f:any)=>f.technicalName==='contact_kind');
 const [organization,,person]=kind.config.options.map((o:any)=>o.id),name=(text:string)=>[{id:randomUUID(),text}];
 const org=await ok('create_record',{objectTypeId:model.id,values:{contact_kind:organization,company_name:'Restricted Company'}});
 const other=await ok('create_record',{objectTypeId:model.id,values:{contact_kind:organization,company_name:'Other Company'}});
 const ap=await tool('create_record',{objectTypeId:model.id,values:{contact_kind:person,last_name:name('Private'),first_name:name('Person')}});
 const membership=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.technicalName==='contact_person');
 const payload={relationshipTypeId:membership.id,version:membership.version,side:'right',targets:[{objectTypeId:model.id,recordId:org.id}]};
 const linked=await ok('update_record',{objectTypeId:model.id,recordId:ap.id,version:ap.version,relationships:[payload]});
 assert.equal(linked.keyword,'Private, Person (Restricted Company)');
 assert.equal((await api('update_record',{objectTypeId:model.id,recordId:ap.id,version:linked.version,relationships:[{...payload,targets:[...payload.targets,{objectTypeId:model.id,recordId:other.id}]}]})).statusCode,409);
 assert.equal((await ok('get_record',{objectTypeId:model.id,recordId:ap.id})).version,linked.version);
 assert.equal((await api('configure_field',{fieldId:kind.id,required:false})).statusCode,403);
 assert.equal((await api('configure_field',{fieldId:kind.id,required:true,config:{...kind.config,options:[...kind.config.options,{id:randomUUID(),labels:{en:'Fourth kind'},active:true}]}})).statusCode,400);
 assert.equal((await api('configure_relationship_type',{workspaceId:ws.id,relationshipTypeId:membership.id,version:membership.version,configuration:Object.fromEntries(['labels','leftLabels','rightLabels','directed','leftMin','leftMax','rightMin','rightMax','allowAll','pairs','active','leftApplicability','rightApplicability'].map(key=>[key,key==='rightMax'?null:membership[key]]))})).statusCode,403);
 const unrelated=await ok('create_object_type',{workspaceId:ws.id,technicalName:'unrelated',labels:{en:'Unrelated'}});
 const unrelatedField=await ok('create_field',{objectTypeId:unrelated.id,technicalName:'name',labels:{en:'Name'}});
 await assert.rejects(sql`INSERT INTO sys_module_field_bindings(workspace_id,object_key,field_key,field_id) VALUES(${ws.id}::uuid,'contact','forged',${unrelatedField.id}::uuid)`.execute(runtime.db),{code:'23503'});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const company=model.fields.find((f:any)=>f.technicalName==='company_name');
 const permissions=await ok('get_content_permissions',{objectTypeId:model.id});
 await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'edit',fields:{[company.id]:'none'}}]});
 const visible=(await api('get_record',{objectTypeId:model.id,recordId:ap.id},userCookie)).json();assert.equal(visible.keyword,ap.id);assert.equal(visible.organization_name,null);
 assert.equal((await api('search_workspace',{workspaceId:ws.id,query:'Restricted'},userCookie)).json().records.length,0);
 const history=(await api('list_record_journal',{objectTypeId:model.id,recordId:ap.id},userCookie)).json();assert.ok(!JSON.stringify(history).includes('Restricted Company'));
 const dossier=(await api('get_record_relationships',{objectTypeId:model.id,recordId:ap.id},userCookie)).json();assert.ok(!JSON.stringify(dossier).includes('Restricted Company'));
 const global=await ok('list_system_journal',{workspaceId:ws.id});assert.ok(global.entries.some((e:any)=>e.entity_name==='Private, Person (Restricted Company)'));
 assert.equal((await ok('list_records',{objectTypeId:model.id,sortBy:'keyword'})).total,3);
 const before=(await ok('get_definition_journal',{objectTypeId:model.id})).length;
 assert.equal((await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:2})).version,2);
 assert.equal((await ok('get_definition_journal',{objectTypeId:model.id})).length,before);
});

test('Contact salutations and academic titles are configurable independent choices, with visible name fields and permission-aware formatting',async()=>{
 const ws=await ok('create_workspace',{name:'Contact names',code:'contactnames'});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const summary=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts');
 const model=await ok('get_object_type',{objectTypeId:summary.id}),profile=model.contactProfile;
 const field=(key:string)=>model.fields.find((f:any)=>f.id===profile.fields[key]);
 const title=field('name_prefix'),salutation=field('salutation'),gender=field('gender');
 for(const [purpose,schema] of [['emails','email_entries'],['phones','phone_entries'],['addresses','address_entries'],['websites','url_entries']]){
  const collection=field(purpose);assert.equal(collection.config.schema,schema);assert.notEqual(collection.config.fixedOptions,true);
  assert.deepEqual(collection.config.options.map((o:any)=>o.labels.en),purpose==='phones'?['Work','Home','Mobile','Voice calls','Fax','SMS / text','Video','Pager','Textphone']:['Work','Home']);
  assert.ok(collection.config.options.every((o:any)=>o.labels.de&&o.id));
 }
 assert.equal(gender.kind,'single_choice');assert.equal(gender.required,false);assert.equal(gender.labels.de,'Geschlecht');assert.equal(gender.config.fixedOptions,false);
 const other=gender.config.options.find((o:any)=>o.labels.en==='Other').id,male=gender.config.options.find((o:any)=>o.labels.en==='Male').id;
 assert.equal(title.kind,'single_choice');assert.equal(title.config.fixedOptions,false);assert.equal(title.labels.de,'Titel');
 assert.equal(salutation.kind,'single_choice');assert.equal(salutation.labels.de,'Anrede');assert.equal(field('additional_names').labels.de,'Weitere Vornamen');assert.equal(field('name_suffix').labels.de,'Namenszusatz');
 const name=(text:string)=>[{id:randomUUID(),text}],dr=title.config.options.find((o:any)=>o.labels.en==='Dr.').id,ms=salutation.config.options.find((o:any)=>o.labels.en==='Ms').id;
 const row=await tool('create_record',{objectTypeId:model.id,values:{contact_kind:profile.kinds.person,salutation:ms,gender:other,name_prefix:dr,first_name:name('Jane'),additional_names:name('Marie'),last_name:name('Doe'),name_suffix:name('Jr.')}});
 assert.equal(row.formatted_name,'Dr. Jane Marie Doe Jr.');assert.equal(row.keyword,'Doe, Jane');assert.equal(row.salutation,ms);assert.equal(row.gender,other);
 const added={id:randomUUID(),labels:{en:'Dr. habil.',de:'Dr. habil.'},active:true};
 await ok('configure_field',{fieldId:title.id,required:false,config:{...title.config,options:[...title.config.options,added]}});
 const changed=await ok('update_record',{objectTypeId:model.id,recordId:row.id,version:row.version,values:{name_prefix:added.id,gender:male}});
 assert.equal(changed.formatted_name,'Dr. habil. Jane Marie Doe Jr.');assert.equal(changed.gender,male);assert.equal(changed.salutation,ms);
 const genderHistory=(await ok('list_record_journal',{objectTypeId:model.id,recordId:row.id})).entries.find((entry:any)=>entry.field_id===gender.id&&entry.new_value===male);assert.equal(genderHistory.value_context.after.kind,'single_choice');
 assert.equal((await api('create_record',{objectTypeId:model.id,values:{contact_kind:profile.kinds.organization,company_name:'Company',gender:male}})).statusCode,400);
 const history=(await ok('list_record_journal',{objectTypeId:model.id,recordId:row.id})).entries.find((entry:any)=>entry.field_id===title.id&&entry.new_value===added.id);
 assert.equal(history.value_context.after.kind,'single_choice');assert.ok(history.value_context.after.config.options.some((o:any)=>o.id===added.id));
 assert.equal((await api('create_record',{objectTypeId:model.id,values:{contact_kind:profile.kinds.organization,company_name:'Company',salutation:ms}})).statusCode,400);
});


test('telephone usage and capabilities are independent configurable UUID groups with lossless multi-label history',async()=>{
 const ws=await ok('create_workspace',{name:'Phone groups',code:'phonegroups'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'people',labels:{en:'People'}});
 const work={id:randomUUID(),labels:{en:'Work',de:'Geschäftlich'},active:true,group:'usage'},home={id:randomUUID(),labels:{en:'Home',de:'Privat'},active:true,group:'usage'},mobile={id:randomUUID(),labels:{en:'Mobile',de:'Mobil'},active:true,group:'phone_type'};
 const config={schema:'phone_entries',options:[work,home,mobile]};
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'phones',labels:{en:'Telephone numbers'},kind:'structured',config});
 const entry={id:randomUUID(),value:'+4989123456',contexts:[work.id,home.id,mobile.id],preference:1};
 const row=await tool('create_record',{objectTypeId:object.id,values:{phones:[entry]}});assert.deepEqual(row.phones[0].contexts,entry.contexts);
 const changed=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{phones:[{...entry,contexts:[home.id,mobile.id]}]}});assert.deepEqual(changed.phones[0].contexts,[home.id,mobile.id]);
 const history=(await ok('list_record_journal',{objectTypeId:object.id,recordId:row.id})).entries.find((e:any)=>e.field_id===field.id&&e.old_value!==null);
 assert.deepEqual(history.old_value[0].contexts,entry.contexts);assert.equal(history.value_context.after.config.options.find((o:any)=>o.id===mobile.id).group,'phone_type');
 assert.equal((await api('configure_field',{fieldId:field.id,version:field.version,required:false,config:{...config,options:[{...work,group:'phone_type'},home,mobile]}})).statusCode,400);
 assert.equal((await api('create_field',{objectTypeId:object.id,technicalName:'missing_group',labels:{en:'Invalid'},kind:'structured',config:{schema:'phone_entries',options:[{id:randomUUID(),labels:{en:'Unknown'},active:true}]}})).statusCode,400);
 assert.equal((await api('create_field',{objectTypeId:object.id,technicalName:'wrong_group',labels:{en:'Invalid'},kind:'structured',config:{schema:'email_entries',options:[work]}})).statusCode,400);
});


test('collection order derives consecutive preferences for every contact collection and journals reorder/removal atomically',async()=>{
 const ws=await ok('create_workspace',{name:'Ordered preferences',code:'orderedpreferences'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'entries',labels:{en:'Entries'}});
 for(const [schema,samples] of [['email_entries',['one@example.test','two@example.test']],['phone_entries',['+4989123456','+4989123457']],['url_entries',['https://one.example.test','https://two.example.test']],['address_entries',['One Road','Two Road']]] as const){
  const field=await ok('create_field',{objectTypeId:object.id,technicalName:schema,labels:{en:schema},kind:'structured',config:{schema}});
  const entries=samples.map((value,i)=>({id:randomUUID(),contexts:[],...(i===0?{preference:99}:{}),...(schema==='address_entries'?{address:{poBox:'',extended:'',streetLines:[value],houseNumber:'',postalCode:'',locality:'',region:'',country:'',formatted:''}}:{value})}));
  const row=await tool('create_record',{objectTypeId:object.id,values:{[schema]:entries}});assert.deepEqual(row[schema].map((e:any)=>e.preference),[1,2]);
  const reversed=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{[schema]:[row[schema][1],row[schema][0]]}});assert.deepEqual(reversed[schema].map((e:any)=>[e.id,e.preference]),[[entries[1].id,1],[entries[0].id,2]]);
  const history=(await ok('list_record_journal',{objectTypeId:object.id,recordId:row.id})).entries.find((e:any)=>e.field_id===field.id&&e.old_value!==null);assert.ok(history.detail_context.changes.some((c:any)=>c.path==='$order'));assert.equal(history.new_value[0].preference,1);assert.equal(history.old_value[0].id,entries[0].id);
  const removed=await tool('update_record',{objectTypeId:object.id,recordId:row.id,version:reversed.version,values:{[schema]:[reversed[schema][1]]}});assert.equal(removed[schema][0].preference,1);
 }
});

test('additional Contact details retain kind applicability, typed API/MCP history, field rights and independent contact zones',async()=>{
 const ws=await ok('create_workspace',{name:'More Contact details',code:'contactdetails'});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const contact=await ok('get_object_type',{objectTypeId:(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts').id});
 const kinds=contact.fields.find((f:any)=>f.technicalName==='contact_kind').config.options,person=kinds.find((o:any)=>o.labels.en==='Contact person').id,organization=kinds.find((o:any)=>o.labels.en==='Organization').id;
 const lang={id:randomUUID(),value:'EN-gb',contexts:[],preference:null},messenger={id:randomUUID(),value:'xmpp:jane@example.test',contexts:[],preference:null};
 const row=await ok('create_record',{objectTypeId:contact.id,values:{contact_kind:person,last_name:[{id:randomUUID(),text:'Example'}],nickname:'Jay',languages:[lang],messenger_addresses:[messenger],contact_time_zone:{timeZone:'America/New_York'},anniversary:{year:null,month:9,day:12},death_date:{year:2024,month:2,day:29}}});
 assert.equal(row.languages[0].value,'en-GB');assert.equal(row.languages[0].preference,1);assert.equal(row.contact_time_zone.timeZone,'America/New_York');assert.equal(row.anniversary.year,null);
 assert.equal((await api('update_record',{objectTypeId:contact.id,recordId:row.id,version:row.version,values:{contact_time_zone:{timeZone:'Invalid/Zone'}}})).statusCode,400);
 assert.equal((await ok('get_record',{objectTypeId:contact.id,recordId:row.id})).version,row.version);
 assert.equal((await api('create_record',{objectTypeId:contact.id,values:{contact_kind:organization,company_name:'Test organization',death_date:{year:null,month:1,day:1}}})).statusCode,400);
 const updated=await tool('update_record',{objectTypeId:contact.id,recordId:row.id,version:row.version,values:{death_date:null,contact_time_zone:{timeZone:'UTC'}}});
 assert.equal(updated.death_date,null);assert.equal(updated.contact_time_zone.timeZone,'UTC');
 assert.equal((await api('update_record',{objectTypeId:contact.id,recordId:row.id,version:row.version,values:{nickname:'stale'}})).statusCode,409);
 const history=await journalEntries({objectTypeId:contact.id,recordId:row.id});const zone=history.find((e:any)=>e.field_key==='contact_time_zone'&&e.old_value!==null);assert.deepEqual(zone.old_value,{timeZone:'America/New_York'});assert.deepEqual(zone.new_value,{timeZone:'UTC'});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const hidden=contact.fields.find((f:any)=>f.technicalName==='anniversary'),permissions=await ok('get_content_permissions',{objectTypeId:contact.id});await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'edit',fields:{[hidden.id]:'none'}}]});
 const visible=(await api('get_record',{objectTypeId:contact.id,recordId:row.id},userCookie)).json();assert.ok(!Object.hasOwn(visible,'anniversary'));assert.deepEqual(visible.contact_time_zone,{timeZone:'UTC'});
 assert.equal((await api('update_record',{objectTypeId:contact.id,recordId:row.id,version:updated.version,values:{anniversary:null}},userCookie)).statusCode,403);
 const hiddenHistory=(await api('list_record_journal',{objectTypeId:contact.id,recordId:row.id},userCookie)).json();assert.ok(!JSON.stringify(hiddenHistory).includes(hidden.id));
 const currentWs=(await ok('list_workspaces',{})).find((w:any)=>w.id===ws.id);assert.equal(currentWs.time_zone,'UTC');
});

test('Messenger usage and type groups share configurable API/MCP identities, retained choices and atomic history',async()=>{
 const ws=await ok('create_workspace',{name:'Messenger groups',code:'messengergroups'});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const definition=await ok('get_object_type',{objectTypeId:(await ok('list_object_types',{workspaceId:ws.id})).find((t:any)=>t.technicalName==='contacts').id});
 const field=definition.fields.find((f:any)=>f.technicalName==='messenger_addresses'),profile=definition.contactProfile;
 assert.ok(field.config.options.some((o:any)=>o.group==='usage'&&o.labels.en==='Work'));assert.ok(field.config.options.some((o:any)=>o.group==='messenger_type'&&o.labels.en==='XMPP'));
 const option=(label:string)=>field.config.options.find((o:any)=>o.labels.en===label).id,extra={id:randomUUID(),labels:{en:'Support messenger',de:'Support-Messenger'},active:true,group:'messenger_type'};
 await tool('configure_field',{fieldId:field.id,required:false,config:{...field.config,options:[...field.config.options,extra]}});
 const first={id:randomUUID(),value:'xmpp:jane@example.test',contexts:[option('Work'),extra.id],preference:null};
 const row=await tool('create_record',{objectTypeId:definition.id,values:{contact_kind:profile.kinds.individual,last_name:[{id:randomUUID(),text:'Example'}],messenger_addresses:[first]}});
 assert.deepEqual(row.messenger_addresses,[{...first,preference:1}]);
 const inactive={...field.config,options:[...field.config.options,{...extra,active:false}]};await ok('configure_field',{fieldId:field.id,required:false,config:inactive});
 const updated=await ok('update_record',{objectTypeId:definition.id,recordId:row.id,version:row.version,values:{messenger_addresses:[{...first,value:'xmpp:jane.updated@example.test'}]}});
 assert.deepEqual(updated.messenger_addresses[0].contexts,[option('Work'),extra.id]);
 assert.equal((await api('create_record',{objectTypeId:definition.id,values:{contact_kind:profile.kinds.individual,last_name:[{id:randomUUID(),text:'New'}],messenger_addresses:[{...first,id:randomUUID()}]}})).statusCode,400);
 assert.equal((await api('configure_field',{fieldId:field.id,required:false,config:{...inactive,options:[...field.config.options,{...extra,active:false,group:'usage'}]}})).statusCode,400);
 const events=await journalEntries({objectTypeId:definition.id,recordId:row.id}),event=events.find((e:any)=>e.field_id===field.id&&e.old_value!==null);
 assert.equal(event.value_context.after.kind,'structured');assert.ok(event.value_context.after.config.options.some((o:any)=>o.id===extra.id&&o.group==='messenger_type'));assert.equal(event.detail_context.schema,'messenger_entries');
});

test('postal components roundtrip through API/MCP with exact limits and per-field history without a stored formatted label',async()=>{
 const ws=await ok('create_workspace',{name:'Postal addresses',code:'postaladdresses'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'}});
 const field=await ok('create_field',{objectTypeId:object.id,technicalName:'addresses',labels:{en:'Addresses',de:'Adressen'},kind:'structured',config:{schema:'address_entries',options:[]}});
 const address={poBox:'42',extended:'Building B',streetLines:['Example Road','North entrance'],houseNumber:'10',postalCode:'80331',locality:'Munich',region:'Bavaria',country:'Germany',formatted:''},entry={id:randomUUID(),contexts:[],preference:null,address};
 const row=await tool('create_record',{objectTypeId:object.id,values:{addresses:[entry]}});assert.deepEqual(row.addresses,[{...entry,preference:1}]);
 const invalid=await api('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{addresses:[{...entry,address:{...address,houseNumber:'x'.repeat(101)}}]}});assert.equal(invalid.statusCode,400);assert.equal((await ok('get_record',{objectTypeId:object.id,recordId:row.id})).version,row.version);
 const updated=await ok('update_record',{objectTypeId:object.id,recordId:row.id,version:row.version,values:{addresses:[{...entry,address:{...address,extended:'Building C',region:'Other region'}}]}});assert.equal(updated.addresses[0].address.formatted,'');assert.equal(updated.addresses[0].address.poBox,'42');
 const history=await journalEntries({objectTypeId:object.id,recordId:row.id}),change=history.find((e:any)=>e.field_id===field.id&&e.old_value!==null);assert.ok(change.detail_context.changes.some((c:any)=>c.entryId===entry.id&&c.path==='address.extended'));assert.ok(change.detail_context.changes.some((c:any)=>c.path==='address.region'));assert.equal(change.new_value[0].address.formatted,'');
});

test('relationship attributes use both endpoints and preserve typed versioned history',async()=>{
 const ws=await ok('create_workspace',{name:'CRM attributes',code:'crmattributes'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const id=(await ok('list_object_types',{workspaceId:ws.id})).find((t:any)=>t.technicalName==='contacts').id,definition=await ok('get_object_type',{objectTypeId:id}),profile=definition.contactProfile;
 let rel=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===profile.relationships.contact_person);assert.equal(rel.fields.length,0);for(const [technicalName,kind] of [['context_title','text'],['context_roles','multiple_choice'],['context_department','text']])await ok('create_field',{relationshipTypeId:rel.id,technicalName,kind,labels:{en:technicalName}});rel=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===rel.id);
 const title=rel.fields.find((f:any)=>f.technicalName==='context_title'),role=rel.fields.find((f:any)=>f.technicalName==='context_roles'),option=randomUUID();
 await tool('configure_field',{fieldId:role.id,required:false,config:{...role.config,options:[{id:option,labels:{en:'Board member',de:'Vorstand'},active:true}]}});rel=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===rel.id);
 const org=await ok('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.organization,company_name:'Organization A'}}),other=await ok('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.organization,company_name:'Organization B'}});
 const target={objectTypeId:id,recordId:org.id},attributes={relationshipTypeId:rel.id,definitionVersion:rel.version,target,values:{[title.id]:'Director',[role.id]:[option]}};
 let person=await tool('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.person,last_name:[{id:randomUUID(),text:'Doe'}]},relationships:[{relationshipTypeId:rel.id,version:rel.version,side:'right',targets:[target]}],relationshipAttributes:[attributes]});
 const read=async()=> (await ok('get_record_relationships',{objectTypeId:id,recordId:person.id})).fields.find((f:any)=>f.definition.id===rel.id&&f.side==='right').targets[0];
 const edge=await read();assert.equal(edge.attributeValues[title.id],'Director');
 const write={...attributes,edgeId:edge.edgeId,version:edge.edgeVersion,values:{[title.id]:'Managing director'}};
 person=await tool('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationshipAttributes:[write]});assert.equal((await read()).edgeVersion,edge.edgeVersion+1);
 assert.equal((await api('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationshipAttributes:[write]})).statusCode,409);
 const event=(await journalEntries({objectTypeId:id,recordId:person.id})).find((e:any)=>e.field_id===title.id&&e.old_value==='Director');assert.ok(event);assert.equal(event.value_context.after.kind,'text');assert.ok((await journalEntries({objectTypeId:id,recordId:org.id})).some((e:any)=>e.id===event.id));
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:id});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{[title.id]:'none'}}]});
 const hidden=(await api('get_record_relationships',{objectTypeId:id,recordId:person.id},userCookie)).json().fields.find((f:any)=>f.definition.id===rel.id&&f.side==='right').targets[0];assert.ok(!Object.hasOwn(hidden.attributeValues,title.id));assert.ok(!(await api('list_record_journal',{objectTypeId:id,recordId:org.id},userCookie)).json().entries.some((e:any)=>e.field_id===title.id));
 assert.equal((await api('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationshipAttributes:[{...write,version:edge.edgeVersion+1}]},userCookie)).statusCode,403);
 person=await ok('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationships:[{relationshipTypeId:rel.id,version:rel.version,side:'right',targets:[{objectTypeId:id,recordId:other.id}]}]});assert.notEqual((await read()).edgeId,edge.edgeId);assert.equal((await read()).attributeValues[title.id],null);assert.ok((await journalEntries({objectTypeId:id,recordId:person.id})).some((e:any)=>e.id===event.id));
});

test('shared CRM lifecycle retains identities and authored forms across module activation',async()=>{
 const ws=await ok('create_workspace',{name:'Shared modules',code:'sharedmodules'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:1});
 let types=await ok('list_object_types',{workspaceId:ws.id});const id=types.find((t:any)=>t.technicalName==='contacts').id;let definition=await ok('get_object_type',{objectTypeId:id});assert.ok(definition.contactProfile);assert.deepEqual(definition.moduleKeys,['projects']);assert.ok(!types.some((t:any)=>t.technicalName==='distribution_lists'));
 const field=await ok('create_field',{objectTypeId:id,technicalName:'custom_info',labels:{en:'Custom info',de:'Zusatz'}}),row=await ok('create_record',{objectTypeId:id,values:{contact_kind:definition.contactProfile.kinds.organization,company_name:'Shared organization',custom_info:'Retained'}});
 const layout={groups:[{id:'custom',labels:{en:'Shared details',de:'Gemeinsame Angaben'},fields:[{fieldId:field.id,width:'full'}]}]};definition=await tool('configure_form_layout',{objectTypeId:id,version:definition.version,layout});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});definition=await ok('get_object_type',{objectTypeId:id});assert.equal(definition.moduleKeys.length,2);assert.deepEqual(definition.formLayouts.default,layout);
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:false,version:2});definition=await ok('get_object_type',{objectTypeId:id});assert.equal(definition.state,'active');assert.deepEqual(definition.moduleKeys,['contacts']);
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:false,version:2});definition=await ok('get_object_type',{objectTypeId:id});assert.equal(definition.state,'inactive');assert.deepEqual(definition.formLayouts.default,layout);
 await tool('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:3});definition=await ok('get_object_type',{objectTypeId:id});assert.equal(definition.state,'active');assert.deepEqual(definition.formLayouts.default,layout);assert.ok(definition.fields.some((f:any)=>f.id===field.id));assert.equal((await ok('get_record',{objectTypeId:id,recordId:row.id})).custom_info,'Retained');
});

test('relationship attributes enforce each endpoint exception, rollback atomically and survive recycle/restore',async()=>{
 const ws=await ok('create_workspace',{name:'CRM transaction',code:'crmtransaction'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const id=(await ok('list_object_types',{workspaceId:ws.id})).find((t:any)=>t.technicalName==='contacts').id,definition=await ok('get_object_type',{objectTypeId:id}),p=definition.contactProfile;
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:id});await ok('configure_content_permissions',{...rights,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const org=await createOrganization(id,'Company');let relation=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===p.relationships.contact_person);const field=await ok('create_field',{relationshipTypeId:relation.id,technicalName:'context_title',labels:{en:'Context title'}});relation=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===relation.id);
 let person=await ok('create_record',{objectTypeId:id,values:{contact_kind:p.kinds.person,last_name:[{id:randomUUID(),text:'Doe'}]},relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'right',targets:[{objectTypeId:id,recordId:org.id}]}]});
 for(const row of [person,await ok('get_record',{objectTypeId:id,recordId:org.id})]){const security=await ok('get_record_security',{objectTypeId:id,recordId:row.id});await ok('configure_record_security',{objectTypeId:id,recordId:row.id,version:security.version,policy:{...security.policy,owners:[{kind:'user',id:user.id,level:'full'}],fields:row.id===org.id?[{kind:'user',id:user.id,fields:{[field.id]:'none'}}]:[]}});}
 person=await ok('get_record',{objectTypeId:id,recordId:person.id});const edges=await ok('get_record_relationships',{objectTypeId:id,recordId:person.id}),target=edges.fields.find((f:any)=>f.definition.id===relation.id&&f.side==='right').targets[0];
 const write={relationshipTypeId:relation.id,definitionVersion:relation.version,edgeId:target.edgeId,version:target.edgeVersion,target:{objectTypeId:id,recordId:org.id},values:{[field.id]:'Director'}};
 assert.equal((await api('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationshipAttributes:[write]},userCookie)).statusCode,403,'Organization exception also applies from Contact person');
 const orgView=(await api('get_record_relationships',{objectTypeId:id,recordId:org.id},userCookie)).json();assert.ok(!Object.hasOwn(orgView.fields.find((f:any)=>f.definition.id===relation.id&&f.side==='left').targets[0].attributeValues,field.id));
 const originalOrg=await ok('get_record',{objectTypeId:id,recordId:org.id});
 await sql`CREATE TRIGGER reject_crm_attribute BEFORE INSERT ON sys_journal FOR EACH ROW WHEN (NEW.field_key='context_title') EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('update_record',{objectTypeId:id,recordId:person.id,version:person.version,values:{nickname:'Rollback'},relationshipAttributes:[write]})).statusCode,500);assert.equal((await ok('get_record',{objectTypeId:id,recordId:person.id})).version,person.version);assert.equal((await ok('get_record',{objectTypeId:id,recordId:org.id})).version,originalOrg.version);assert.equal((await sql<any>`SELECT version,values FROM sys_relationships WHERE id=${target.edgeId}::uuid`.execute(runtime.db)).rows[0].version,target.edgeVersion);}
 finally{await sql`DROP TRIGGER reject_crm_attribute ON sys_journal`.execute(runtime.db);}
 person=await tool('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationshipAttributes:[write]});
 const recycled=await ok('recycle_record',{objectTypeId:id,recordId:person.id,version:person.version});const restored=await tool('restore_record',{objectTypeId:id,recordId:person.id,version:recycled.version});assert.equal(restored.id,person.id);
 const retained=(await ok('get_record_relationships',{objectTypeId:id,recordId:person.id})).fields.find((f:any)=>f.definition.id===relation.id&&f.side==='right').targets[0];assert.equal(retained.edgeId,target.edgeId);assert.equal(retained.attributeValues[field.id],'Director');
});

test('shared module template additions retain authored views and configurable values and reject structural collisions atomically',async()=>{
 const ws=await ok('create_workspace',{name:'Module evolution',code:'moduleevolution'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const id=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts').id;let definition=await ok('get_object_type',{objectTypeId:id});
 const row=await createOrganization(id,'Preserved'),extra=await ok('create_field',{objectTypeId:id,technicalName:'my_field',labels:{en:'My field'}}),layout={groups:[{id:'personal',labels:{en:'Our view'},fields:[{fieldId:extra.id,width:'full'}]}]};
 definition=await ok('configure_form_layout',{objectTypeId:id,version:definition.version,layout});
 const catalog=(await sql<any>`SELECT objects FROM sys_modules WHERE key='contacts'`.execute(runtime.db)).rows[0].objects;
 const revised=structuredClone(catalog);revised.find((o:any)=>o.key==='contact').fields.push({key:'crm_segment',technicalName:'crm_segment',labels:{en:'CRM segment',de:'CRM-Segment'},kind:'text'});
 try{
  await sql`UPDATE sys_modules SET objects=${JSON.stringify(revised)}::jsonb,template_version=2 WHERE key='contacts'`.execute(runtime.db);
  const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='contacts');assert.equal(module.installedVersion,1);assert.equal(module.templateVersion,2);
  const updated=await tool('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:module.version});assert.equal(updated.installedVersion,2);
  const next=await ok('get_object_type',{objectTypeId:id});assert.deepEqual(next.formLayouts.default,layout);assert.equal(next.fields.find((f:any)=>f.technicalName==='my_field').id,extra.id);assert.ok(next.moduleFieldIds.contacts.includes(next.fields.find((f:any)=>f.technicalName==='crm_segment').id));assert.equal((await ok('get_record',{objectTypeId:id,recordId:row.id})).keyword,'Preserved');
  const conflict=structuredClone(revised);conflict.find((o:any)=>o.key==='contact').fields.find((f:any)=>f.key==='crm_segment').kind='boolean';await sql`UPDATE sys_modules SET objects=${JSON.stringify(conflict)}::jsonb,template_version=3 WHERE key='contacts'`.execute(runtime.db);
  assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:updated.version})).statusCode,409);assert.equal((await ok('get_object_type',{objectTypeId:id})).fields.find((f:any)=>f.technicalName==='crm_segment').kind,'text');
  const codecConflict=structuredClone(revised);codecConflict.find((o:any)=>o.key==='contact').fields.find((f:any)=>f.key==='birthday').config={schema:'url_entries'};await sql`UPDATE sys_modules SET objects=${JSON.stringify(codecConflict)}::jsonb WHERE key='contacts'`.execute(runtime.db);assert.equal((await api('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:updated.version})).statusCode,409);
 }finally{await sql`UPDATE sys_modules SET objects=${JSON.stringify(catalog)}::jsonb,template_version=1 WHERE key='contacts'`.execute(runtime.db);}
});

test('custom relationship fields have scoped configuration, preflighted requiredness and a retained definition lifecycle',async()=>{
 const ws=await ok('create_workspace',{name:'Attribute definitions',code:'attributedefinitions'}),a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'left_items',labels:{en:'Left'}}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'right_items',labels:{en:'Right'}});
 let relation=await ok('create_relationship_type',{workspaceId:ws.id,technicalName:'detail_link',configuration:{labels:{en:'Details'},leftLabels:{en:'Right'},rightLabels:{en:'Left'},directed:true,leftMin:0,rightMin:0,leftMax:1,rightMax:1,allowAll:false,active:true,pairs:[{leftObjectTypeId:a.id,rightObjectTypeId:b.id}]}});
 relation=await ok('activate_relationship_type',{workspaceId:ws.id,relationshipTypeId:relation.id,version:relation.version});
 const field=await tool('create_field',{relationshipTypeId:relation.id,technicalName:'detail',labels:{en:'Detail',de:'Angabe'},kind:'text'});relation=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===relation.id);
 const right=await ok('create_record',{objectTypeId:b.id}),left=await ok('create_record',{objectTypeId:a.id,relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'left',targets:[{objectTypeId:b.id,recordId:right.id}]}]});
 assert.equal((await api('configure_field',{fieldId:field.id,version:field.version,required:true})).statusCode,400);
 const edge=(await ok('get_record_relationships',{objectTypeId:a.id,recordId:left.id})).fields.find((f:any)=>f.definition.id===relation.id).targets[0];
 const changed=await ok('update_record',{objectTypeId:a.id,recordId:left.id,version:left.version,relationshipAttributes:[{relationshipTypeId:relation.id,definitionVersion:relation.version,target:{objectTypeId:b.id,recordId:right.id},edgeId:edge.edgeId,version:edge.edgeVersion,values:{[field.id]:'Retained'}}]});
 const inactive=await ok('set_definition_state',{kind:'field',id:field.id,expectedState:'active',state:'inactive'});assert.equal(inactive.state,'inactive');assert.equal((await api('set_definition_state',{kind:'field',id:field.id,expectedState:'inactive',state:'deleted',confirm:true})).statusCode,409);
 const retained=(await ok('get_record_relationships',{objectTypeId:b.id,recordId:right.id})).fields.find((f:any)=>f.definition.id===relation.id).targets[0];assert.equal(retained.attributeValues[field.id],'Retained');
 assert.ok((await ok('get_definition_journal',{objectTypeId:b.id})).some((e:any)=>e.field_id===field.id));
 const designer=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:designer.id,role:'designer',expectedRole:null});
 const edited=await api('configure_field',{fieldId:field.id,required:false,inputRules:{description:{en:'Relationship detail',de:'Verknüpfungsangabe'}}},userCookie);assert.equal(edited.statusCode,200,edited.body);assert.equal((await api('get_record',{objectTypeId:a.id,recordId:left.id},userCookie)).statusCode,403,'Designer does not acquire contents');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:designer.id,role:'user',expectedRole:'designer'});assert.equal((await api('create_field',{relationshipTypeId:relation.id,technicalName:'forbidden',labels:{en:'Forbidden'}},userCookie)).statusCode,403);
 const unused=await ok('create_field',{relationshipTypeId:relation.id,technicalName:'unused',labels:{en:'Unused'}});assert.equal((await ok('set_definition_state',{kind:'field',id:unused.id,expectedState:'active',state:'deleted',confirm:true})).state,'deleted');
 assert.equal((await api('create_field',{objectTypeId:a.id,relationshipTypeId:relation.id,technicalName:'bad_owner',labels:{en:'Bad'}})).statusCode,400);
});

test('professional Contact fields belong directly to Contact persons and all Individuals and survive Organization changes',async()=>{
 const ws=await ok('create_workspace',{name:'Professional Contacts',code:'professionalcontacts'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const id=(await ok('list_object_types',{workspaceId:ws.id})).find((t:any)=>t.technicalName==='contacts').id,definition=await ok('get_object_type',{objectTypeId:id}),p=definition.contactProfile;
 const title=definition.fields.find((f:any)=>f.id===p.fields.job_title),role=definition.fields.find((f:any)=>f.id===p.fields.function),department=definition.fields.find((f:any)=>f.id===p.fields.department),option=randomUUID();
 for(const field of [title,role,department]){assert.ok(field.isProtected);assert.deepEqual(new Set(field.applicability.optionIds),new Set([p.kinds.person,p.kinds.individual]));}
 await tool('configure_field',{fieldId:role.id,required:false,config:{...role.config,options:[{id:option,labels:{en:'Board member',de:'Vorstand'},active:true}]}});
 const individual=await tool('create_record',{objectTypeId:id,values:{contact_kind:p.kinds.individual,last_name:[{id:randomUUID(),text:'Doe'}],job_title:'Consultant',department:'Independent',function:[option]}});assert.equal(individual.company_name,null);assert.equal(individual.job_title,'Consultant');
 assert.equal((await api('create_record',{objectTypeId:id,values:{contact_kind:p.kinds.organization,company_name:'Invalid',job_title:'Not an organization field'}})).statusCode,400);
 const a=await createOrganization(id,'Organization A'),b=await createOrganization(id,'Organization B'),relation=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===p.relationships.contact_person);assert.deepEqual(relation.fields,[]);
 let person=await ok('create_record',{objectTypeId:id,values:{contact_kind:p.kinds.person,last_name:[{id:randomUUID(),text:'Example'}],job_title:'Director',department:'Sales',function:[option]}});
 for(const target of [a,b,null]){person=await tool('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationships:[{relationshipTypeId:relation.id,version:relation.version,side:'right',targets:target?[{objectTypeId:id,recordId:target.id}]:[]}]});assert.equal(person.job_title,'Director');assert.equal(person.department,'Sales');assert.deepEqual(person.function,[option]);}
 const before=person;person=await ok('update_record',{objectTypeId:id,recordId:person.id,version:person.version,values:{job_title:'Chair'}});const event=(await journalEntries({objectTypeId:id,recordId:person.id})).find((e:any)=>e.field_id===title.id&&e.old_value==='Director');assert.equal(event.entity_kind,'record');assert.equal(event.entity_id,person.id);assert.equal(event.new_value,'Chair');assert.equal(person.version,before.version+1);
 const identities=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.id===p.relationships.contact_identity);
 person=await tool('update_record',{objectTypeId:id,recordId:person.id,version:person.version,relationships:[{relationshipTypeId:identities.id,version:identities.version,side:'left',targets:[{objectTypeId:id,recordId:individual.id}]}]});
 const currentIndividual=await ok('get_record',{objectTypeId:id,recordId:individual.id});await ok('update_record',{objectTypeId:id,recordId:individual.id,version:currentIndividual.version,values:{job_title:'Independent director'}});
 assert.equal((await ok('get_record',{objectTypeId:id,recordId:person.id})).job_title,'Chair');assert.equal((await ok('get_record_relationships',{objectTypeId:id,recordId:person.id})).fields.find((f:any)=>f.definition.id===identities.id).targets.length,1);
});

test('CRM acceptance keeps Distribution membership explicit, independent, rights-filtered and journalled',async()=>{
 const ws=await ok('create_workspace',{name:'CRM acceptance',code:'crmacceptance'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const types=await ok('list_object_types',{workspaceId:ws.id}),id=types.find((t:any)=>t.technicalName==='contacts').id,listId=types.find((t:any)=>t.technicalName==='distribution_lists').id;
 const definition=await ok('get_object_type',{objectTypeId:id}),profile=definition.contactProfile,user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:id});await ok('configure_content_permissions',{...rights,sensitive:true,grants:[{kind:'user',id:user.id,level:'full',fields:{}}]});
 const listRights=await ok('get_content_permissions',{objectTypeId:listId});await ok('configure_content_permissions',{...listRights,grants:[{kind:'user',id:user.id,level:'full',fields:{}}]});
 const org=await createOrganization(id,'Visible Organization'),name=(text:string)=>[{id:randomUUID(),text}];
 const ap=await tool('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.person,last_name:name('Example'),first_name:name('Jane')}}),ek=await ok('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.individual,last_name:name('Example'),first_name:name('John')}});
 for(const record of [org,ap,ek])await ok('configure_record_security',{objectTypeId:id,recordId:record.id,version:record.version,policy:defaultRecordSecurity([{kind:'user',id:user.id,level:'full'}])});
 const hidden=await ok('create_record',{objectTypeId:id,values:{contact_kind:profile.kinds.organization,company_name:'Hidden membership secret'},security:{policy:{...defaultRecordSecurity(),publicLevel:null,owners:[{kind:'user',id:adminId,level:'full'}]},confirmPublic:false}});
 const relation=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.technicalName==='distribution_members');
 let list=await tool('create_record',{objectTypeId:listId,keyword:'Acceptance list',values:{description:'One\nTwo\nThree',notes:'## Notes\nFictional acceptance record.'}});
 assert.equal((await ok('get_record_relationships',{objectTypeId:listId,recordId:list.id})).dossier.length,0);
 const payload=(records:any[])=>({relationshipTypeId:relation.id,version:relation.version,side:'left',targets:records.map(record=>({objectTypeId:id,recordId:record.id}))});
 list=await ok('update_record',{objectTypeId:listId,recordId:list.id,version:list.version,relationships:[payload([org,ap,ek,hidden])]});
 const original=list;const repeated=await api('update_record',{objectTypeId:listId,recordId:list.id,version:list.version,relationships:[payload([org,org])]});assert.ok([400,409].includes(repeated.statusCode));assert.equal((await ok('get_record',{objectTypeId:listId,recordId:list.id})).version,original.version);
 const visible=(await api('get_record_relationships',{objectTypeId:listId,recordId:list.id},userCookie)).json();assert.equal(visible.dossier.length,3);assert.ok(!JSON.stringify(visible).includes('Hidden membership secret'));
 const history=(await api('list_record_journal',{objectTypeId:listId,recordId:list.id},userCookie)).json();assert.ok(!JSON.stringify(history).includes('Hidden membership secret'));
 const updated=await api('update_record',{objectTypeId:listId,recordId:list.id,version:list.version,relationships:[payload([ap,ek])]},userCookie);assert.equal(updated.statusCode,403,updated.body);assert.equal((await ok('get_record',{objectTypeId:listId,recordId:list.id})).version,list.version);
 const restricted=visible.fields.find((f:any)=>f.definition.id===relation.id&&f.side==='left');assert.equal(restricted.restricted,true);assert.equal(restricted.editable,false);
 const scalar=await api('update_record',{objectTypeId:listId,recordId:list.id,version:list.version,values:{description:'One\nTwo\nThree'}},userCookie);assert.equal(scalar.statusCode,200,scalar.body);list=scalar.json();
 list=await tool('update_record',{objectTypeId:listId,recordId:list.id,version:list.version,relationships:[payload([ap,ek,hidden])]});
 const retained=(await ok('get_record_relationships',{objectTypeId:listId,recordId:list.id})).dossier;assert.equal(retained.length,3);assert.ok(JSON.stringify(retained).includes(hidden.id));assert.equal((await ok('get_record',{objectTypeId:id,recordId:org.id})).keyword,'Visible Organization');
 const journal=await journalEntries({objectTypeId:listId,recordId:list.id});assert.ok(journal.some((e:any)=>e.entity_kind==='relationship'));
 assert.equal((await ok('get_record',{objectTypeId:listId,recordId:list.id})).description,'One\nTwo\nThree');assert.deepEqual((await ok('get_record',{objectTypeId:id,recordId:ek.id})).category,[]);
});

test('Projects module supplies lean bilingual profiles, editable common forms and shared Contacts',async()=>{
 const ws=await ok('create_workspace',{name:'Projects profiles',code:'workprofiles'});await enableProjects(ws.id);
 const objects=await ok('list_object_types',{workspaceId:ws.id});assert.deepEqual(objects.map((o:any)=>o.technicalName).sort(),['cases','contacts','projects','tasks']);
 for(const kind of ['project','case','task']){
  const object=objects.find((o:any)=>o.technicalName===({project:'projects',case:'cases',task:'tasks'} as any)[kind]);let model=await ok('get_object_type',{objectTypeId:object.id});assert.equal(model.workProfile.kind,kind);if(kind==='task'){assert.ok(!model.fields.some((f:any)=>f.technicalName==='assigned_to'));assert.ok(model.formLayouts.default.groups.some((g:any)=>g.id==='task_details'&&g.width==='half'));}
  assert.equal(model.activity,true);assert.equal(model.sensitive,true);assert.equal(model.fields.find((f:any)=>f.technicalName==='access_principals').state,'active');
  const rights=await ok('get_content_permissions',{objectTypeId:model.id});
  const rejected=await api('configure_content_permissions',{...rights,sensitive:false,confirmWidening:true});assert.equal(rejected.statusCode,400,rejected.body);assert.equal(rejected.json().details.code,'activitySensitivityRequired');
  const rejectedSettings=await api('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,security:{version:rights.version,sensitive:false,confirmWidening:true}});assert.equal(rejectedSettings.statusCode,400,rejectedSettings.body);
  assert.equal((await ok('get_content_permissions',{objectTypeId:model.id})).version,rights.version);
  for(const id of Object.values(model.workProfile.fields)){const field=model.fields.find((f:any)=>f.id===id);assert.ok(field.isProtected);assert.ok(field.labels.de&&field.labels.en);assert.equal(field.required,false);}
  assert.equal(model.fields.find((f:any)=>f.technicalName==='notes').config.formatted,true);
  assert.equal(model.formLayouts.default.groups.at(-1).labels.en,'Notes');
  const layout={groups:[{id:'custom',labels:{en:'Our workflow',de:'Unser Ablauf'},fields:model.fields.map((f:any)=>({fieldId:f.id,width:'full'}))}]};
  model=await tool('configure_form_layout',{objectTypeId:model.id,version:model.version,layout});
  await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:2});
  assert.deepEqual((await ok('get_object_type',{objectTypeId:model.id})).formLayouts.default,layout);
 }
});

test('Project dates and Task scheduling/completion validate final values through API/MCP and journal atomically',async()=>{
 const ws=await ok('create_workspace',{name:'Work rules',code:'workrules'});await enableProjects(ws.id);const types=await ok('list_object_types',{workspaceId:ws.id});
 const project=types.find((o:any)=>o.technicalName==='projects'),task=await ok('get_object_type',{objectTypeId:types.find((o:any)=>o.technicalName==='tasks').id});
 assert.equal((await api('create_record',{objectTypeId:project.id,values:{start_date:'2026-11-05',target_date:'2026-11-04'}})).statusCode,400);
 await tool('create_record',{objectTypeId:project.id,values:{start_date:'2026-11-05',target_date:'2026-11-05'}});
 const caseType=types.find((o:any)=>o.technicalName==='cases');const invalidCase=await api('create_record',{objectTypeId:caseType.id,values:{start_date:'2026-11-05',target_date:'2026-11-04'}});assert.equal(invalidCase.statusCode,400);assert.equal(invalidCase.json().details.code,'workDateOrder');
 const datedCase=await tool('create_record',{objectTypeId:caseType.id,values:{start_date:'2026-11-05',target_date:'2026-11-05'}});assert.equal((await api('update_record',{objectTypeId:caseType.id,recordId:datedCase.id,version:datedCase.version,values:{target_date:'2026-11-04'}})).statusCode,400);
 const done=task.classification.options.find((o:any)=>o.meaning==='done'),open=task.classification.options.find((o:any)=>o.meaning==='open');
 assert.equal((await api('create_record',{objectTypeId:task.id,classification:{status:done.id}})).statusCode,400);
 for(const values of [{progress:'101'},{progress:'-1'},{progress:'100'},{completed_at:'2026-11-05T10:00:00Z'},{start:{kind:'date',date:'2026-11-05'},due:{kind:'date',date:'2026-11-05'}},{start:{kind:'date',date:'2026-11-05'},due:{kind:'instant',instant:'2026-11-06T10:00:00Z'}}])assert.equal((await api('create_record',{objectTypeId:task.id,values})).statusCode,400);
 let row=await tool('create_record',{objectTypeId:task.id,keyword:'A result',values:{start:{kind:'zoned',local:'2026-10-25T02:30:00',timeZone:'Europe/Berlin',occurrence:'earlier'},due:{kind:'zoned',local:'2026-10-25T02:30:00',timeZone:'Europe/Berlin',occurrence:'later'}}});
 const before=(await journalEntries({objectTypeId:task.id,recordId:row.id})).length;
 assert.equal((await api('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,classification:{status:done.id},values:{progress:'100'}})).statusCode,400);
 assert.equal((await journalEntries({objectTypeId:task.id,recordId:row.id})).length,before);
 row=await tool('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,classification:{status:done.id},values:{progress:'100',completed_at:'2026-11-05T10:00:00Z'}});
 const changes=(await journalEntries({objectTypeId:task.id,recordId:row.id})).slice(before);assert.equal(changes.length,3);assert.equal(new Set(changes.map((e:any)=>e.change_id)).size,1);
 assert.equal((await api('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,classification:{status:open.id}})).statusCode,400);
 const {version,...config}=task.classification;config.options=config.options.map(({label,canDelete,...o}:any)=>o.id===done.id?{...o,meaning:'open'}:o);const rejected=await api('configure_classification',{objectTypeId:task.id,version,config});assert.equal(rejected.statusCode,400);assert.equal(rejected.json().details.code,'taskCompletionNotDone');
 row=await tool('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,classification:{status:open.id},values:{progress:null,completed_at:null}});
 assert.equal(row.completed_at,null);assert.equal(row.progress,null);
});

test('Task completion respects field ceilings, journal rollback and recycled-record configuration preflight',async()=>{
 const ws=await ok('create_workspace',{name:'Task protection',code:'taskprotection'});await enableProjects(ws.id);
 const task=await ok('get_object_type',{objectTypeId:(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='tasks').id}),done=task.classification.options.find((o:any)=>o.meaning==='done');
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const completed=task.fields.find((f:any)=>f.id===task.workProfile.fields.completed_at),permissions=await ok('get_content_permissions',{objectTypeId:task.id});
 await ok('configure_content_permissions',{...permissions,grants:[{kind:'user',id:user.id,level:'edit',create:true,fields:{[completed.id]:'read'}}]});
 let row=await tool('create_record',{objectTypeId:task.id,keyword:'Protected completion'});
 const write=()=>({objectTypeId:task.id,recordId:row.id,version:row.version,classification:{status:done.id},values:{progress:'100',completed_at:'2026-11-05T11:00:00Z'}});
 assert.equal((await api('update_record',write(),userCookie)).statusCode,403);
 const initialJournal=(await journalEntries({objectTypeId:task.id,recordId:row.id})).length;
 await sql`CREATE TRIGGER reject_task_completion BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('update_record',write())).statusCode,500);}finally{await sql`DROP TRIGGER reject_task_completion ON sys_journal`.execute(runtime.db);}
 assert.equal((await ok('get_record',{objectTypeId:task.id,recordId:row.id})).version,row.version);assert.equal((await journalEntries({objectTypeId:task.id,recordId:row.id})).length,initialJournal);
 row=await tool('update_record',write());
 const recycled=await tool('recycle_record',{objectTypeId:task.id,recordId:row.id,version:row.version});
 const {version,...config}=task.classification;config.options=config.options.map(({label,canDelete,...o}:any)=>o.id===done.id?{...o,meaning:'open'}:o);
 const response=await api('configure_classification',{objectTypeId:task.id,version,config});assert.equal(response.statusCode,400);assert.equal(response.json().details.code,'taskCompletionNotDone');
 await tool('restore_record',{objectTypeId:task.id,recordId:row.id,version:recycled.version});
 assert.equal((await ok('get_record',{objectTypeId:task.id,recordId:row.id})).progress,'100');
});

test('workspace navigation derives active module sections, repeated Contact lists and catalog priorities through API/MCP',async()=>{
 const ws=await ok('create_workspace',{name:'Module navigation',code:'modulenav'});await enableProjects(ws.id);await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const custom=await ok('create_object_type',{workspaceId:ws.id,technicalName:'assets',labels:{en:'Assets',de:'Inventar'},standardFields:['keyword']});
 const model=await tool('get_workspace_navigation',{workspaceId:ws.id});assert.equal(model.workspace.version,0);assert.equal(model.personal.version,0);assert.equal(model.canManage,true);
 const contact=model.nodes.filter((n:any)=>n.kind==='object'&&n.technicalName==='contacts');assert.equal(contact.length,2);assert.equal(new Set(contact.map((n:any)=>n.objectTypeId)).size,1);
 for(const entry of contact){const children=model.nodes.filter((n:any)=>n.parentId===entry.id);assert.deepEqual(children.map((n:any)=>n.contactKind),['organization','person','individual']);assert.ok(children.every((n:any)=>n.labels.en&&n.labels.de&&n.contactKindId));}
 assert.deepEqual(model.nodes.filter((n:any)=>n.parentId==='module:projects').map((n:any)=>n.technicalName),['projects','cases','tasks','contacts']);
 const retainedEntry=model.nodes.find((n:any)=>n.parentId==='module:projects'&&n.technicalName==='tasks').id;
 await ok('configure_navigation',{workspaceId:ws.id,scope:'personal',version:0,layout:{order:[retainedEntry],hidden:[],resources:true}});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:false,version:2});
 const disabled=await ok('get_workspace_navigation',{workspaceId:ws.id});assert.equal(disabled.nodes.find((n:any)=>n.id==='module:projects').available,false);assert.deepEqual(disabled.personal.layout.order,[retainedEntry]);
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',enabled:true,version:3});assert.ok((await ok('get_workspace_navigation',{workspaceId:ws.id})).nodes.some((n:any)=>n.id===retainedEntry&&n.available));

 assert.ok(model.nodes.some((n:any)=>n.parentId==='custom'&&n.objectTypeId===custom.id));assert.equal(model.nodes.find((n:any)=>n.id==='module:documents').available,false);
 await ok('set_definition_state',{kind:'object_type',id:custom.id,expectedState:'active',state:'deleted',confirm:true});
 const retained=(await ok('get_workspace_navigation',{workspaceId:ws.id})).nodes.find((n:any)=>n.objectTypeId===custom.id);assert.equal(retained.available,false);
});

test('navigation defaults and personal overrides have separate rights, versions, isolation, resets and atomic journals',async()=>{
 const ws=await ok('create_workspace',{name:'Navigation policy',code:'navpolicy'});await enableProjects(ws.id);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const layout={order:['module:projects','module:contacts'],hidden:['module:contacts'],resources:false};
 assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'workspace',version:0,layout},userCookie)).statusCode,403);
 const shared=await tool('configure_navigation',{workspaceId:ws.id,scope:'workspace',version:0,layout});assert.equal(shared.workspace.version,1);
 const inherited=(await api('get_workspace_navigation',{workspaceId:ws.id},userCookie)).json();assert.deepEqual(inherited.workspace.layout,layout);assert.equal(inherited.personal.layout,null);
 const personal={...layout,resources:true};const writes=await Promise.all([api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:0,layout:personal},userCookie),api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:0,layout:personal},userCookie)]);assert.deepEqual(writes.map(r=>r.statusCode).sort(),[200,409]);
 assert.equal((await ok('get_workspace_navigation',{workspaceId:ws.id})).personal.layout,null,'cannot read another user override');
 assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:1,layout:{...personal,hidden:['foreign-object-id']}},userCookie)).statusCode,400);
 await ok('configure_navigation',{workspaceId:ws.id,scope:'workspace',version:1,layout:{...layout,resources:true}});
 const reset=await api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:1,layout:null},userCookie);assert.equal(reset.statusCode,200,reset.body);assert.equal(reset.json().personal.version,2);assert.equal(reset.json().personal.layout,null);assert.equal(reset.json().workspace.layout.resources,true);
 assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:1,layout:null},userCookie)).statusCode,409);
 const other=await ok('create_workspace',{name:'Other navigation',code:'othernav'});assert.equal((await api('get_workspace_navigation',{workspaceId:other.id},userCookie)).statusCode,403);
 await sql`CREATE TRIGGER reject_navigation BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'workspace',version:2,layout:null})).statusCode,500);}finally{await sql`DROP TRIGGER reject_navigation ON sys_journal`.execute(runtime.db);}
 assert.equal((await ok('get_workspace_navigation',{workspaceId:ws.id})).workspace.version,2);
 const events=(await sql<any>`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid AND field_key LIKE 'navigation.workspace.%' ORDER BY created_at,id`.execute(runtime.db)).rows;assert.ok(events.length>=4);assert.equal(new Set(events.slice(0,4).map((e:any)=>e.change_id)).size,1);
 assert.ok(events.find((e:any)=>e.field_key.endsWith('.order')).new_value[0].en);
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:'user'});
 assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'workspace',version:2,layout:null},userCookie)).statusCode,200);
 assert.equal((await api('configure_navigation',{workspaceId:ws.id,scope:'personal',version:2,userId:adminId,layout:null},userCookie)).statusCode,400);
});

test('Contact navigation filters apply before counts/paging and respect Contact-kind field rights',async()=>{
 const ws=await ok('create_workspace',{name:'Contact lists',code:'contactlists'});await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
 const object=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts'),definition=await ok('get_object_type',{objectTypeId:object.id}),profile=definition.contactProfile;
 for(let i=0;i<3;i++){
  const created=await ok('create_record',{objectTypeId:object.id,values:{contact_kind:profile.kinds.organization,company_name:`Company ${i}`}});
  assert.equal(created.iconKey,'organization');
  const updated=await tool('update_record',{objectTypeId:object.id,recordId:created.id,version:created.version,values:{company_name:`Company ${i}`}});
  assert.equal(updated.iconKey,'organization');assert.deepEqual(updated,await ok('get_record',{objectTypeId:object.id,recordId:created.id}));
 }
 for(const key of ['person','individual'])await ok('create_record',{objectTypeId:object.id,values:{contact_kind:profile.kinds[key],last_name:[{id:randomUUID(),text:key}]}});
 const page=await tool('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.organization,limit:1,offset:1});assert.equal(page.total,3);assert.equal(page.records.length,1);assert.equal(page.records[0].contact_kind,profile.kinds.organization);assert.equal(page.records[0].iconKey,'organization');
 for(const kind of ['person','individual'])assert.equal((await ok('list_records',{objectTypeId:object.id,contactKindId:profile.kinds[kind]})).records[0].iconKey,kind);
 assert.ok((await ok('list_workspace_records',{workspaceId:ws.id,objectTypeId:object.id})).records.every((r:any)=>['organization','person','individual'].includes(r.iconKey)));
 assert.ok((await ok('search_workspace',{workspaceId:ws.id,query:'Company'})).records.every((r:any)=>r.iconKey==='organization'));
 assert.equal((await ok('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.person})).total,1);
 assert.equal((await ok('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.organization,query:'Company 2'})).total,1);
 assert.equal((await api('list_records',{objectTypeId:object.id,contactKindId:randomUUID()})).statusCode,400);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const initial=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...initial,grants:[{kind:'user',id:user.id,level:'read',fields:{[profile.fields.contact_kind]:'none'}}]});
 assert.equal((await api('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.organization},userCookie)).statusCode,403);
 const nav=(await api('get_workspace_navigation',{workspaceId:ws.id},userCookie)).json();assert.ok(nav.nodes.filter((n:any)=>n.kind==='contact_kind').every((n:any)=>!n.permitted));
 const hiddenKinds=(await api('list_records',{objectTypeId:object.id},userCookie)).json();assert.equal(hiddenKinds.total,5);assert.ok(hiddenKinds.records.every((r:any)=>r.iconKey==='contact'));
 assert.equal((await api('get_record',{objectTypeId:object.id,recordId:hiddenKinds.records[0].id},userCookie)).json().iconKey,'contact');
 assert.ok((await api('list_workspace_records',{workspaceId:ws.id,objectTypeId:object.id},userCookie)).json().records.every((r:any)=>r.iconKey==='contact'));
 assert.ok((await api('search_workspace',{workspaceId:ws.id,query:'Company'},userCookie)).json().records.every((r:any)=>r.iconKey==='contact'));
 const permissions=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...permissions,sensitive:true,grants:[{kind:'user',id:user.id,level:'read',fields:{}}]});
 const one=(await ok('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.organization})).records[0],security=await ok('get_record_security',{objectTypeId:object.id,recordId:one.id});
 await ok('configure_record_security',{objectTypeId:object.id,recordId:one.id,version:security.version,policy:{...security.policy,fields:[{kind:'user',id:user.id,fields:{[profile.fields.contact_kind]:'none'}}]},confirmPublic:true});
 const filtered=await api('list_records',{objectTypeId:object.id,contactKindId:profile.kinds.organization,limit:1},userCookie);assert.equal(filtered.statusCode,200,filtered.body);assert.equal(filtered.json().total,2);assert.ok(filtered.json().records.every((r:any)=>r.id!==one.id));
 const mixed=(await api('list_records',{objectTypeId:object.id},userCookie)).json();assert.equal(mixed.records.find((r:any)=>r.id===one.id).iconKey,'contact');assert.ok(mixed.records.filter((r:any)=>r.id!==one.id).every((r:any)=>r.iconKey!=='contact'));
 const dashboard=(await api('list_workspace_records',{workspaceId:ws.id,objectTypeId:object.id},userCookie)).json();assert.equal(dashboard.records.find((r:any)=>r.id===one.id).iconKey,'contact');
});

test('Task assignment uses Access principals and foreign access never adds assignees',async()=>{
 const ws=await ok('create_workspace',{name:'Task ownership',code:'taskowners'});await enableProjects(ws.id);
 const task=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='tasks');
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const team=await ok('create_group',{workspaceId:ws.id,name:'Execution team'}),rights=await ok('get_content_permissions',{objectTypeId:task.id});
 await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}},{kind:'group',id:team.id,level:'full',create:true,fields:{}}]});
 const teamPolicy={owners:[{kind:'group',id:team.id,level:'full'}],publicLevel:null,privacy:'normal',foreignMax:'full',fields:[]};
 const row=await tool('create_record',{objectTypeId:task.id,keyword:'Team result',security:{policy:teamPolicy}});
 assert.deepEqual(row.access_principals,teamPolicy.owners);assert.equal((await api('get_record',{objectTypeId:task.id,recordId:row.id},userCookie)).statusCode,403);
 const foreign=await ok('get_foreign_access',{workspaceId:ws.id});await ok('configure_foreign_access',{...foreign,rules:[{id:randomUUID(),requester:{kind:'user',id:user.id},owner:{kind:'group',id:team.id},level:'read',confidential:false,objects:{}}]});
 const read=await api('get_record',{objectTypeId:task.id,recordId:row.id},userCookie);assert.equal(read.statusCode,200,read.body);assert.equal(read.json().permissions.edit,false);assert.deepEqual(read.json().access_principals,teamPolicy.owners);
 const before=(await journalEntries({objectTypeId:task.id,recordId:row.id})).length;
 const userPolicy={...teamPolicy,owners:[{kind:'user',id:user.id,level:'full'}]};
 const delegated=await tool('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,values:{description:'Agreed result'},security:{policy:userPolicy}});
 assert.deepEqual(delegated.access_principals,userPolicy.owners);
 const changed=(await journalEntries({objectTypeId:task.id,recordId:row.id})).slice(before);assert.equal(new Set(changed.map((e:any)=>e.change_id)).size,1);assert.ok(changed.some((e:any)=>e.field_key==='access.owners'));assert.ok(changed.some((e:any)=>e.field_key==='description'));
 const own=await api('get_record',{objectTypeId:task.id,recordId:row.id},userCookie);assert.equal(own.json().permissions.full,true);
 assert.equal((await api('create_record',{objectTypeId:task.id,values:{assigned_to:{kind:'user',id:user.id}}})).statusCode,400);
 assert.equal((await api('update_record',{objectTypeId:task.id,recordId:row.id,version:delegated.version,values:{assigned_to:{kind:'user',id:user.id}}})).statusCode,400);
 assert.equal((await sql`SELECT 1 FROM information_schema.columns WHERE table_name='taskowners_tasks' AND column_name='assigned_to'`.execute(runtime.db)).rows.length,0);
});

test('Primary ancestor candidates filter visible paths before counts and paging and preserve a single deepest association',async()=>{
 const ws=await ok('create_workspace',{name:'Cascade picker',code:'cascadepick'});await enableProjects(ws.id);
 const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects'),chain=module.primaryChain;
 const item=(await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']})).id;
 const primary=(await ok('list_relationship_types',{workspaceId:ws.id})).find((t:any)=>t.kind==='primary');
 const a=await createOrganization(chain.contact,'A'),b=await createOrganization(chain.contact,'B');
 const create=async(objectTypeId:string,keyword:string,parent?:any)=>ok('create_record',{objectTypeId,keyword,relationships:parent?[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[parent]}]:undefined});
 const ref=(objectTypeId:string,r:any)=>({objectTypeId,recordId:r.id});
 const p1=await create(chain.project,'A project 1',ref(chain.contact,a)),p2=await create(chain.project,'A project 2',ref(chain.contact,a)),p3=await create(chain.project,'B project',ref(chain.contact,b));
 const c1=await create(chain.case,'A case 1',ref(chain.project,p1)),c2=await create(chain.case,'A case 2',ref(chain.project,p1)),c3=await create(chain.case,'B case',ref(chain.project,p3));
 const direct=await create(chain.case,'Direct A case',ref(chain.contact,a));
 const r=await create(item,'Linked item',ref(chain.case,c1));
 const input={objectTypeId:item,recordId:r.id,relationshipTypeId:primary.id,side:'right',query:'',limit:1,offset:1,targetObjectTypeId:chain.project,primaryAncestor:ref(chain.contact,a)};
 const page=await ok('search_relationship_candidates',input);assert.equal(page.total,2);assert.deepEqual(page.records.map((r:any)=>r.recordId),[p2.id]);assert.deepEqual(await tool('search_relationship_candidates',input),page);
 const cases=await tool('search_relationship_candidates',{...input,targetObjectTypeId:chain.case,primaryAncestor:ref(chain.project,p1),offset:0,limit:10});assert.equal(cases.total,2);assert.deepEqual(cases.records.map((r:any)=>r.recordId),[c1.id,c2.id]);
 const contactCases=await ok('search_relationship_candidates',{...input,targetObjectTypeId:chain.case,offset:0,limit:10});assert.equal(contactCases.total,3);assert.ok(contactCases.records.some((r:any)=>r.recordId===direct.id));assert.ok(!contactCases.records.some((r:any)=>r.recordId===c3.id));
 assert.equal((await api('search_relationship_candidates',{...input,side:'left'})).statusCode,400);
 assert.equal((await api('search_relationship_candidates',{...input,primaryAncestor:ref(chain.case,c1)})).statusCode,400);
 const general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((t:any)=>t.kind==='general');assert.equal((await api('search_relationship_candidates',{...input,relationshipTypeId:general.id})).statusCode,400);
 const foreign=await ok('create_workspace',{name:'Other context',code:'cascadeother'}),foreignType=await ok('create_object_type',{workspaceId:foreign.id,technicalName:'items',labels:{en:'Other'},standardFields:['keyword']}),foreignRecord=await ok('create_record',{objectTypeId:foreignType.id,keyword:'Other'});
 assert.equal((await api('search_relationship_candidates',{...input,primaryAncestor:ref(foreignType.id,foreignRecord)})).statusCode,400);
 // Removing Case promotes Project; removing Project promotes Contact; clearing Contact removes only this record's link.
 let current=r;for(const parent of [ref(chain.project,p1),ref(chain.contact,a),null]){
  current=await tool('update_record',{objectTypeId:item,recordId:r.id,version:current.version,relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:parent?[parent]:[]}]});
  const context=await ok('get_primary_chain_context',{objectTypeId:item,recordId:r.id});assert.equal(context.direct?.recordId??null,parent?.recordId??null);
  assert.equal((await ok('get_record_relationships',{objectTypeId:item,recordId:r.id})).fields.find((f:any)=>f.definition.id===primary.id&&f.side==='right').targets.length,parent?1:0);
 }
 assert.equal((await ok('get_primary_chain_context',{objectTypeId:chain.case,recordId:c1.id})).direct.recordId,p1.id,'the Case itself was not reparented');
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 for(const objectTypeId of [item,chain.contact,chain.project,chain.case]){const config=await ok('get_content_permissions',{objectTypeId});await ok('configure_content_permissions',{...config,grants:[{kind:'user',id:user.id,level:'read',fields:{}}]});}
 for(const record of [c1,c2,c3,direct]){const policy=await ok('get_record_security',{objectTypeId:chain.case,recordId:record.id});await ok('configure_record_security',{objectTypeId:chain.case,recordId:record.id,version:policy.version,policy:{...policy.policy,publicLevel:'read'},confirmPublic:true});}
 const policy=await ok('get_record_security',{objectTypeId:chain.project,recordId:p1.id});await ok('configure_record_security',{objectTypeId:chain.project,recordId:p1.id,version:policy.version,policy:{...policy.policy,owners:[{kind:'user',id:adminId,level:'full'}],publicLevel:null,foreignMax:'none'}});
 const hidden=await api('search_relationship_candidates',{...input,targetObjectTypeId:chain.case,offset:0,limit:10},userCookie);assert.equal(hidden.statusCode,200,hidden.body);assert.deepEqual(hidden.json().records.map((r:any)=>r.recordId),[direct.id]);assert.equal(hidden.json().total,1,'hidden Project paths cannot be inferred through readable Cases');
 assert.equal((await api('search_relationship_candidates',{...input,targetObjectTypeId:chain.case,primaryAncestor:ref(chain.project,p1)},userCookie)).statusCode,403);
});

test('Primary requirements preflight retained records and protect creation, linked creation, duplication and ancestor edits atomically through API/MCP',async()=>{
 const ws=await ok('create_workspace',{name:'Required context',code:'requiredcontext'});const primary=await enableProjects(ws.id);
 const chain=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects').primaryChain;
 const task=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='tasks');
 const ref=(objectTypeId:string,row:any)=>({objectTypeId,recordId:row.id});
 const link=(parent:any)=>[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:parent?[parent]:[]}];
 const configure=async(requirements:any)=>{const d=await ok('get_object_type',{objectTypeId:task.id});return api('configure_object_settings',{objectTypeId:d.id,version:d.version,labels:d.labels,primaryRequirements:requirements});};
 const optional={associationRequired:false,requiredLevels:[]};
 assert.deepEqual((await ok('get_object_type',{objectTypeId:task.id})).primaryRequirements,optional);
 const standalone=await ok('create_record',{objectTypeId:task.id,keyword:'Standalone'});
 const requirements={associationRequired:true,requiredLevels:['contact','project','case']};
 const before=(await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows;
 assert.equal((await configure(requirements)).statusCode,409);
 assert.deepEqual((await ok('get_object_type',{objectTypeId:task.id})).primaryRequirements,optional);
 assert.deepEqual((await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows,before);
 const org=await createOrganization(chain.contact,'Required organization');
 const project=await ok('create_record',{objectTypeId:chain.project,keyword:'Required project',relationships:link(ref(chain.contact,org))});
 const caseRow=await ok('create_record',{objectTypeId:chain.case,keyword:'Required case',relationships:link(ref(chain.project,project))});
 let row=await ok('get_record',{objectTypeId:task.id,recordId:standalone.id});
 row=await ok('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,relationships:link(ref(chain.case,caseRow))});
 const model=(await configure(requirements)).json();assert.deepEqual(model.primaryRequirements,requirements);assert.ok(model.formRelationships.find((r:any)=>r.definition.kind==='primary').required);
 assert.equal((await api('configure_object_settings',{objectTypeId:task.id,version:model.version-1,labels:model.labels,primaryRequirements:optional})).statusCode,409);
 assert.equal((await api('create_record',{objectTypeId:task.id,keyword:'Invalid standalone'})).statusCode,409);
 assert.equal((await api('create_record',{objectTypeId:task.id,keyword:'Missing project',relationships:link(ref(chain.contact,org))})).statusCode,409);
 assert.equal((await api('duplicate_record',{objectTypeId:task.id,recordId:row.id,version:row.version})).statusCode,409);
 const linked=await tool('create_record',{objectTypeId:task.id,keyword:'Linked',linkFrom:{objectTypeId:chain.case,recordId:caseRow.id,recordVersion:(await ok('get_record',{objectTypeId:chain.case,recordId:caseRow.id})).version,relationshipTypeId:primary.id,version:primary.version,side:'left'}});
 assert.ok(linked.id);
 const parent=await ok('get_record',{objectTypeId:chain.project,recordId:project.id});
 const parentBefore=(await journalEntries({objectTypeId:chain.project,recordId:parent.id})).length;
 const denied=await api('update_record',{objectTypeId:chain.project,recordId:parent.id,version:parent.version,values:{description:'Must roll back'},relationships:link(null)});
 assert.equal(denied.statusCode,409,denied.body);assert.equal(denied.json().details.code,'primary_required');
 const unchanged=await ok('get_record',{objectTypeId:chain.project,recordId:parent.id});assert.equal(unchanged.version,parent.version);assert.equal(unchanged.description,parent.description);assert.equal((await journalEntries({objectTypeId:chain.project,recordId:parent.id})).length,parentBefore);
 const recycled=await tool('recycle_record',{objectTypeId:chain.project,recordId:parent.id,version:parent.version});
 const context=await ok('get_primary_chain_context',{objectTypeId:task.id,recordId:row.id});assert.equal(context.levels.find((l:any)=>l.role==='project').record,null);
 await tool('restore_record',{objectTypeId:chain.project,recordId:parent.id,version:recycled.version});
 const current=await ok('get_record',{objectTypeId:task.id,recordId:row.id});
 assert.equal((await api('update_record',{objectTypeId:task.id,recordId:row.id,version:current.version,relationships:link(ref(chain.project,project))})).statusCode,409);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:task.id});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 row=await ok('get_record',{objectTypeId:task.id,recordId:row.id});row=await ok('configure_record_security',{objectTypeId:task.id,recordId:row.id,version:row.version,policy:defaultRecordSecurity([{kind:'user',id:user.id,level:'full'}])});
 const hidden=await api('get_record',{objectTypeId:chain.project,recordId:project.id},userCookie);assert.equal(hidden.statusCode,403);
 const ownEdit=await api('update_record',{objectTypeId:task.id,recordId:row.id,version:row.version,values:{description:'Required context remains structurally valid but private'}},userCookie);assert.equal(ownEdit.statusCode,200,ownEdit.body);
 const layoutModel=await ok('get_object_type',{objectTypeId:task.id});const hiddenLayout=structuredClone(layoutModel.formLayouts.default);let primaryPlaced=false;for(const g of hiddenLayout.groups)for(const entry of g.fields)if(entry.primary){entry.visible=false;primaryPlaced=true;}if(!primaryPlaced)hiddenLayout.groups[0].fields.push({primary:true,width:'full',visible:false});
 assert.equal((await api('configure_form_layout',{objectTypeId:task.id,version:layoutModel.version,layout:hiddenLayout})).statusCode,400);
 assert.equal((await configure(optional)).statusCode,200);
 const standalone2=await ok('create_record',{objectTypeId:task.id,keyword:'Retained invalid'});await ok('recycle_record',{objectTypeId:task.id,recordId:standalone2.id,version:standalone2.version});
 assert.equal((await configure({associationRequired:true,requiredLevels:[]})).statusCode,409);
 const contactModel=await ok('get_object_type',{objectTypeId:chain.contact});assert.equal((await api('configure_object_settings',{objectTypeId:chain.contact,version:contactModel.version,labels:contactModel.labels,primaryRequirements:{associationRequired:true,requiredLevels:[]}})).statusCode,400);
 const projectModel=await ok('get_object_type',{objectTypeId:chain.project});assert.equal((await api('configure_object_settings',{objectTypeId:chain.project,version:projectModel.version,labels:projectModel.labels,primaryRequirements:{associationRequired:false,requiredLevels:['case']}})).statusCode,400);
});

test('Primary requiredness uses model locks, journals individual properties and prevents deactivation without leaking retained records',async()=>{
 const ws=await ok('create_workspace',{name:'Required locks',code:'requiredlocks'});await enableProjects(ws.id);
 const custom=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const d=await ok('get_object_type',{objectTypeId:custom.id});
 const input={objectTypeId:d.id,version:d.version,labels:d.labels,primaryRequirements:{associationRequired:true,requiredLevels:['project']}};
 await sql`CREATE TRIGGER reject_primary_requirement BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('configure_object_settings',input)).statusCode,500);}finally{await sql`DROP TRIGGER reject_primary_requirement ON sys_journal`.execute(runtime.db);}
 assert.equal((await ok('get_object_type',{objectTypeId:d.id})).version,d.version);
 const changed=await tool('configure_object_settings',input);assert.equal(changed.version,d.version+1);
 const events=(await sql<any>`SELECT * FROM sys_journal WHERE entity_id=${d.id}::uuid AND field_key LIKE 'primaryRequirements.%'`.execute(runtime.db)).rows;
 assert.deepEqual(events.map((e:any)=>e.field_key).sort(),['primaryRequirements.associationRequired','primaryRequirements.requiredLevels']);assert.equal(new Set(events.map((e:any)=>e.change_id)).size,1);
 const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='projects');
 const disabled=await api('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:module.version,enabled:false});assert.equal(disabled.statusCode,409);assert.match(disabled.body,/Clear Primary requirements/);
 await ok('configure_object_settings',{objectTypeId:d.id,version:changed.version,labels:d.labels,primaryRequirements:{associationRequired:false,requiredLevels:[]}});
 const disposable=await ok('create_object_type',{workspaceId:ws.id,technicalName:'discarded',labels:{en:'Discarded'},standardFields:['keyword']});
 const unused=await ok('get_object_type',{objectTypeId:disposable.id});await ok('configure_object_settings',{...input,objectTypeId:unused.id,version:unused.version,labels:unused.labels});
 await ok('set_definition_state',{kind:'object_type',id:unused.id,expectedState:'active',state:'deleted',confirm:true});
 const disabledModule=await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:module.version,enabled:false});
 await ok('configure_workspace_module',{workspaceId:ws.id,key:'projects',version:disabledModule.version,enabled:true});
 const clean=await ok('get_object_type',{objectTypeId:d.id});
 const results=await Promise.all([api('configure_object_settings',{...input,version:clean.version}),api('create_record',{objectTypeId:d.id,keyword:'Concurrent'})]);
 assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
});

test('Projects V1 acceptance integrates ordinary user CRUD, completion, Primary tree, journals, recycle and Designer/module boundaries',async()=>{
 const ws=await ok('create_workspace',{name:'Projects V1 acceptance',code:'projectsvone'});const primary=await enableProjects(ws.id);
 let contactsModule=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='contacts');await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:contactsModule.version});
 const objects=await ok('list_object_types',{workspaceId:ws.id}),ids=Object.fromEntries(objects.map((o:any)=>[o.technicalName,o.id]));
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 for(const objectTypeId of [ids.contacts,ids.projects,ids.cases,ids.tasks]){const rights=await ok('get_content_permissions',{objectTypeId});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});}
 const act=async(operation:Operation,payload:unknown)=>{const res=await api(operation,payload,userCookie);assert.equal(res.statusCode,200,res.body);return res.json();};
 const org=await createOrganization(ids.contacts,'Integrated client');
 const ref=(objectTypeId:string,row:any)=>({objectTypeId,recordId:row.id});const link=(parent:any)=>[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[parent]}];
 let project=await act('create_record',{objectTypeId:ids.projects,keyword:'User project',values:{start_date:'2026-11-05',target_date:'2026-12-01'},relationships:link(ref(ids.contacts,org))});
 let caseRow=await act('create_record',{objectTypeId:ids.cases,keyword:'User case',values:{start_date:'2026-11-05',target_date:'2026-11-12'},relationships:link(ref(ids.projects,project))});
 let task=await act('create_record',{objectTypeId:ids.tasks,keyword:'User task',values:{progress:'25',start:{kind:'date',date:'2026-11-05'},due:{kind:'date',date:'2026-11-06'}},relationships:link(ref(ids.cases,caseRow))});
 const model=await ok('get_object_type',{objectTypeId:ids.tasks}),done=model.classification.options.find((o:any)=>o.meaning==='done'),open=model.classification.options.find((o:any)=>o.meaning==='open');
 const rules={associationRequired:false,requiredLevels:['project']};
 assert.equal((await api('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,primaryRequirements:rules},userCookie)).statusCode,403);
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:'user'});
 const configured=await act('configure_object_settings',{objectTypeId:model.id,version:model.version,labels:model.labels,primaryRequirements:rules});assert.deepEqual(configured.primaryRequirements,rules);
 assert.equal((await api('configure_content_permissions',{...(await ok('get_content_permissions',{objectTypeId:ids.tasks})),grants:[]},userCookie)).statusCode,403);
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:'designer'});
 task=await act('update_record',{objectTypeId:ids.tasks,recordId:task.id,version:task.version,classification:{status:done.id},values:{progress:'100',completed_at:'2026-11-05T12:00:00Z'}});assert.equal(task.progress,'100');
 task=await act('update_record',{objectTypeId:ids.tasks,recordId:task.id,version:task.version,classification:{status:open.id},values:{progress:'25',completed_at:null}});assert.equal(task.completed_at,null);
 const context=await act('get_primary_chain_context',{objectTypeId:ids.tasks,recordId:task.id});assert.deepEqual(context.levels.map((l:any)=>l.record?.recordId),[org.id,project.id,caseRow.id]);
 const tree=await act('get_relationship_tree_branch',{objectTypeId:ids.projects,recordId:project.id});assert.equal(tree.total,1);
 const history=await act('list_record_journal',{objectTypeId:ids.tasks,recordId:task.id,limit:100});assert.ok(history.entries.some((e:any)=>e.field_key==='completed_at'));
 const recycled=await act('recycle_record',{objectTypeId:ids.tasks,recordId:task.id,version:task.version});assert.equal((await api('get_record',{objectTypeId:ids.tasks,recordId:task.id},userCookie)).statusCode,404);
 task=await act('restore_record',{objectTypeId:ids.tasks,recordId:task.id,version:recycled.version});assert.equal(task.id,recycled.id);
 const contactId=ids.contacts;contactsModule=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='contacts');await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:false,version:contactsModule.version});
 assert.equal((await act('get_object_type',{objectTypeId:contactId})).state,'active');assert.equal((await act('get_record',{objectTypeId:contactId,recordId:org.id})).id,org.id);
 project=await act('get_record',{objectTypeId:ids.projects,recordId:project.id});await act('update_record',{objectTypeId:ids.projects,recordId:project.id,version:project.version,values:{description:'Updated by ordinary user'}});
 caseRow=await act('get_record',{objectTypeId:ids.cases,recordId:caseRow.id});await act('update_record',{objectTypeId:ids.cases,recordId:caseRow.id,version:caseRow.version,values:{description:'Updated case'}});
});

test('user-bound API credentials have one-time secrets, scoped channels, expiry, revocation, current rights and journal provenance',async()=>{
 const ws=await ok('create_workspace',{name:'Token workspace',code:'tokenworkspace'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const create=await api('create_api_credential',{name:'Test agent',expiresAt:new Date(Date.now()+86400000).toISOString(),channels:['api','mcp'],readOnly:false,currentPassword:'test-password-regular-user'},userCookie);assert.equal(create.statusCode,200,create.body);const issued=create.json();assert.match(issued.token,/^xo1_/);
 const bearer=async(operation:Operation,payload:unknown,token=issued.token)=>runtime.app.inject({method:'POST',url:`/api/v1/${operation}`,headers:{host:'127.0.0.1:4100',authorization:`Bearer ${token}`,'content-type':'application/json'},payload:JSON.stringify(payload)});
 const stored=(await sql<{secret_hash:string}>`SELECT secret_hash FROM sys_api_credentials WHERE id=${issued.credential.id}::uuid`.execute(runtime.db)).rows[0];assert.equal(stored.secret_hash.length,64);assert.ok(!JSON.stringify(stored).includes(issued.token));
 const listed=await api('list_api_credentials',{},userCookie);assert.ok(!listed.body.includes(issued.token));assert.ok(!listed.body.includes('secret_hash'));
 assert.equal((await bearer('list_api_credentials',{})).statusCode,403);
 const written=await bearer('create_record',{objectTypeId:object.id,keyword:'Agent content'});assert.equal(written.statusCode,200,written.body);assert.equal(written.headers['x-xobject-api-version'],'1.0.0');
 const entries=await journalEntries({objectTypeId:object.id,recordId:written.json().id});assert.ok(entries.every((e:any)=>e.actor_id===user.id&&e.access_channel==='api'&&e.credential_id===issued.credential.id&&e.agent_name==='Test agent'));
 const manifest=await runtime.app.inject({method:'GET',url:'/api/v1/contract',headers:{host:'127.0.0.1:4100',authorization:`Bearer ${issued.token}`}});assert.equal(manifest.statusCode,200);assert.equal(manifest.json().apiVersion,'1.0.0');assert.ok(manifest.json().operations.permanently_delete_record.inputSchema);
 const transport=new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{authorization:`Bearer ${issued.token}`}},fetch:async(url,init)=>{const response=await runtime.app.inject({method:'POST',url:'/mcp',headers:{...Object.fromEntries(new Headers(init?.headers).entries()),host:'127.0.0.1:4100'},payload:JSON.parse(String(init?.body))});return new Response(response.body,{status:response.statusCode,headers:response.headers as HeadersInit});}});
 const external=new Client({name:'External test agent',version:'1.0'});await external.connect(transport);const resources=await external.listResources();assert.ok(resources.resources.some(item=>item.uri==='xobject://api/v1/openapi'));const resource=await external.readResource({uri:'xobject://api/v1/openapi'});assert.ok('text' in resource.contents[0]);assert.equal(JSON.parse(resource.contents[0].text).openapi,'3.1.0');const read=await external.callTool({name:'get_record',arguments:{objectTypeId:object.id,recordId:written.json().id}});assert.ok(!read.isError);
 const permissions=await ok('get_content_permissions',{objectTypeId:object.id});await ok('configure_content_permissions',{...permissions,grants:[]});assert.equal((await bearer('get_record',{objectTypeId:object.id,recordId:written.json().id})).statusCode,403);
 assert.equal((await api('revoke_api_credential',{credentialId:issued.credential.id})).statusCode,200);assert.equal((await bearer('list_workspaces',{})).statusCode,401);await assert.rejects(()=>external.callTool({name:'list_workspaces',arguments:{}}));await external.close();
 const tokenHistory=await ok('list_system_journal',{entityKind:'api_credential',limit:100});const createdEvent=tokenHistory.entries.find((e:any)=>e.entity_id===issued.credential.id&&e.field_key==='created');assert.deepEqual(createdEvent.credential_context,{name:'Test agent',userId:user.id,userName:user.name});assert.equal(createdEvent.entity_name,`Test agent · ${user.name}`);assert.ok(tokenHistory.entries.some((e:any)=>e.entity_id===issued.credential.id&&e.field_key==='revoked'&&e.credential_context.name==='Test agent'));
 assert.ok(!(await sql`SELECT * FROM sys_journal WHERE old_value::text LIKE ${'%'+issued.token+'%'} OR new_value::text LIKE ${'%'+issued.token+'%'}`.execute(runtime.db)).rows.length);
});

test('API credentials enforce read-only, transport selection, validation, owner isolation, password confirmation and transactional rollback',async()=>{
 const input={name:'Restricted client',expiresAt:new Date(Date.now()+86400000).toISOString(),channels:['api'],readOnly:true,currentPassword:'test-password-regular-user'};
 assert.equal((await api('create_api_credential',{...input,currentPassword:'wrong-password'},userCookie)).statusCode,400);
 assert.equal((await api('create_api_credential',{...input,expiresAt:'2000-01-01T00:00:00Z'},userCookie)).statusCode,400);
 await sql`CREATE TRIGGER reject_token_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('create_api_credential',input,userCookie)).statusCode,500);}finally{await sql`DROP TRIGGER reject_token_journal ON sys_journal`.execute(runtime.db);}
 const created=await api('create_api_credential',input,userCookie);assert.equal(created.statusCode,200,created.body);const {token,credential}=created.json(),headers={host:'127.0.0.1:4100',authorization:`Bearer ${token}`};
 const blocked=await runtime.app.inject({method:'POST',url:'/api/v1/create_workspace',headers,payload:{name:'No',code:'notallowed'}});assert.equal(blocked.statusCode,403);
 assert.equal((await runtime.app.inject({method:'POST',url:'/mcp',headers,payload:{jsonrpc:'2.0',id:1,method:'tools/list'}})).statusCode,403);
 assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/list_workspaces',headers:{...headers,cookie:userCookie},payload:{}})).statusCode,401);
 assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/list_workspaces',headers:{...headers,'x-xobject-api-version':'2'},payload:{}})).statusCode,400);
 assert.equal((await api('list_api_credentials',{userId:adminId},userCookie)).statusCode,403);
 await sql`UPDATE sys_api_credentials SET expires_at=created_at+interval '1 millisecond' WHERE id=${credential.id}::uuid`.execute(runtime.db);
 assert.equal((await runtime.app.inject({method:'POST',url:'/api/v1/list_workspaces',headers,payload:{}})).statusCode,401);
});

test('permanent deletion retains immutable Administrator history and only authorized deletion notices for other users',async()=>{
 const ws=await ok('create_workspace',{name:'Deletion history',code:'deletedhistory'}),type=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const field=await ok('create_field',{objectTypeId:type.id,technicalName:'description',labels:{en:'Description'},kind:'multiline'});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});const rights=await ok('get_content_permissions',{objectTypeId:type.id});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const source=await ok('create_record',{objectTypeId:type.id,keyword:'Erase live source',values:{description:'Administrator-only historical content'}}),other=await ok('create_record',{objectTypeId:type.id,keyword:'Surviving record'}),general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.kind==='general');
 let current=await ok('update_record',{objectTypeId:type.id,recordId:source.id,version:source.version,relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:type.id,recordId:other.id}]}]});
 current=await ok('recycle_record',{objectTypeId:type.id,recordId:source.id,version:current.version});
 assert.equal((await api('permanently_delete_record',{objectTypeId:type.id,recordId:source.id,version:current.version,confirm:false})).statusCode,400);
 const before=(await sql`SELECT * FROM sys_journal WHERE entity_id=${source.id}::uuid ORDER BY id`.execute(runtime.db)).rows;
 const result=await api('permanently_delete_record',{objectTypeId:type.id,recordId:source.id,version:current.version,confirm:true},userCookie);assert.equal(result.statusCode,200,result.body);
 assert.equal((await sql`SELECT * FROM deletedhistory_items WHERE id=${source.id}::uuid`.execute(runtime.db)).rows.length,0);
 assert.equal((await sql`SELECT * FROM sys_relationships WHERE left_record_id=${source.id}::uuid OR right_record_id=${source.id}::uuid`.execute(runtime.db)).rows.length,0);
 assert.equal((await api('get_record',{objectTypeId:type.id,recordId:source.id})).statusCode,404);
 const adminHistory=await ok('list_record_journal',{objectTypeId:type.id,recordId:source.id,includeDeleted:true,limit:100});assert.ok(JSON.stringify(adminHistory).includes('Administrator-only historical content'));
 const retained=(await sql`SELECT * FROM sys_journal WHERE entity_id=${source.id}::uuid AND field_key<>'lifecycle' ORDER BY id`.execute(runtime.db)).rows;assert.deepEqual(retained,before.filter((r:any)=>r.field_key!=='lifecycle'));
 const own=await api('list_record_journal',{objectTypeId:type.id,recordId:source.id,includeDeleted:true,limit:100},userCookie);assert.equal(own.statusCode,200,own.body);assert.equal(own.json().total,1);assert.equal(own.json().entries[0].new_value,'deleted');assert.ok(!own.body.includes('Administrator-only historical content'));assert.ok(!own.body.includes('Erase live source'));
 const linked=await api('list_record_journal',{objectTypeId:type.id,recordId:other.id,limit:100},userCookie);assert.equal(linked.statusCode,200,linked.body);assert.ok(!linked.body.includes('Erase live source'));assert.ok(linked.json().entries.some((e:any)=>e.new_value==='deleted'));
 assert.equal((await api('list_deleted_records',{workspaceId:ws.id},userCookie)).statusCode,403);assert.equal((await ok('list_deleted_records',{workspaceId:ws.id})).total,1);
 const perms=await ok('get_content_permissions',{objectTypeId:type.id});await ok('configure_content_permissions',{...perms,grants:[]});assert.equal((await api('list_record_journal',{objectTypeId:type.id,recordId:source.id,includeDeleted:true},userCookie)).statusCode,403);
 assert.equal((await api('restore_record',{objectTypeId:type.id,recordId:source.id,version:current.version})).statusCode,404);
});

test('deleted history freezes prior event visibility and still applies current field, group and workspace rights',async()=>{
 const ws=await ok('create_workspace',{name:'History boundaries',code:'historyboundaries'}),a=await ok('create_object_type',{workspaceId:ws.id,technicalName:'shared',labels:{en:'Shared'},standardFields:['keyword']}),b=await ok('create_object_type',{workspaceId:ws.id,technicalName:'private',labels:{en:'Private'},standardFields:['keyword']});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const rights=await ok('get_content_permissions',{objectTypeId:a.id});await ok('configure_content_permissions',{...rights,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const source=await ok('create_record',{objectTypeId:a.id,keyword:'Visible deleted source'}),other=await ok('create_record',{objectTypeId:b.id,keyword:'Previously hidden context'}),general=(await ok('list_relationship_types',{workspaceId:ws.id})).find((r:any)=>r.kind==='general');
 let row=await ok('update_record',{objectTypeId:a.id,recordId:source.id,version:source.version,relationships:[{relationshipTypeId:general.id,version:general.version,side:'left',targets:[{objectTypeId:b.id,recordId:other.id}]}]});row=await ok('recycle_record',{objectTypeId:a.id,recordId:source.id,version:row.version});
 await ok('permanently_delete_record',{objectTypeId:a.id,recordId:source.id,version:row.version,confirm:true});
 const next=await ok('get_content_permissions',{objectTypeId:b.id});await ok('configure_content_permissions',{...next,grants:[{kind:'user',id:user.id,level:'full',create:true,fields:{}}]});
 const hidden=await api('list_record_journal',{objectTypeId:b.id,recordId:other.id,limit:100},userCookie);assert.equal(hidden.statusCode,200,hidden.body);assert.ok(!hidden.json().entries.some((e:any)=>e.new_value==='deleted'));assert.ok(!hidden.body.includes('Visible deleted source'));
 const own=await api('list_record_journal',{objectTypeId:a.id,recordId:source.id,includeDeleted:true},userCookie);assert.equal(own.statusCode,200);assert.equal(own.json().total,1);
 // Later sensitivity changes do not create missing live policies or grant new historical readers.
 const config=await ok('get_content_permissions',{objectTypeId:a.id});await ok('configure_content_permissions',{...config,sensitive:true});
 assert.equal((await api('list_record_journal',{objectTypeId:a.id,recordId:source.id,includeDeleted:true},userCookie)).statusCode,200);
 await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:null,expectedRole:'user'});assert.equal((await api('list_record_journal',{objectTypeId:a.id,recordId:source.id,includeDeleted:true},userCookie)).statusCode,403);
});

test('permanent deletion preflights surviving required context and rolls back contents, edges, versions and journals on failure',async()=>{
 const ws=await ok('create_workspace',{name:'Delete atomicity',code:'deleteatomicity'}),primary=await enableProjects(ws.id),objects=await ok('list_object_types',{workspaceId:ws.id}),projectType=objects.find((o:any)=>o.technicalName==='projects'),taskType=objects.find((o:any)=>o.technicalName==='tasks');
 const project=await ok('create_record',{objectTypeId:projectType.id,keyword:'Retained project'}),task=await ok('create_record',{objectTypeId:taskType.id,keyword:'Dependent Task',relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:projectType.id,recordId:project.id}]}]});
 const model=await ok('get_object_type',{objectTypeId:taskType.id});const configured=await ok('configure_object_settings',{objectTypeId:taskType.id,version:model.version,labels:model.labels,primaryRequirements:{associationRequired:false,requiredLevels:['project']}});
 let row=await ok('get_record',{objectTypeId:projectType.id,recordId:project.id});row=await ok('recycle_record',{objectTypeId:projectType.id,recordId:row.id,version:row.version});
 const before=(await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows;
 const input={objectTypeId:projectType.id,recordId:row.id,version:row.version,confirm:true};assert.equal((await api('permanently_delete_record',input)).statusCode,409);assert.deepEqual((await sql`SELECT * FROM sys_journal WHERE workspace_id=${ws.id}::uuid ORDER BY id`.execute(runtime.db)).rows,before);
 assert.equal((await ok('get_recycled_record',{objectTypeId:projectType.id,recordId:row.id})).version,row.version);
 await ok('configure_object_settings',{objectTypeId:taskType.id,version:configured.version,labels:model.labels,primaryRequirements:{associationRequired:false,requiredLevels:[]}});
 await sql`CREATE TRIGGER reject_permanent_delete_journal BEFORE INSERT ON sys_journal FOR EACH ROW WHEN (NEW.entity_kind='record' AND NEW.field_key='lifecycle' AND NEW.new_value='"deleted"'::jsonb) EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
 try{assert.equal((await api('permanently_delete_record',input)).statusCode,500);}finally{await sql`DROP TRIGGER reject_permanent_delete_journal ON sys_journal`.execute(runtime.db);}
 assert.equal((await ok('get_recycled_record',{objectTypeId:projectType.id,recordId:row.id})).version,row.version);
 await tool('permanently_delete_record',input);const child=await ok('get_record',{objectTypeId:taskType.id,recordId:task.id});assert.equal(child.keyword,task.keyword);assert.ok(child.version>task.version);assert.equal((await ok('get_record_relationships',{objectTypeId:taskType.id,recordId:task.id})).fields.find((f:any)=>f.definition.kind==='primary').targets.length,0);
 assert.ok(JSON.stringify(await tool('list_record_journal',{objectTypeId:projectType.id,recordId:row.id,includeDeleted:true,limit:100})).includes('Retained project'));
});

test('credential owner isolation, revoke-all, password rotation and per-request checks prevent reused access',async()=>{
 const args={name:'Rotation client',expiresAt:new Date(Date.now()+86400000).toISOString(),channels:['api'],currentPassword:'test-password-regular-user'};
 const created=await api('create_api_credential',args,userCookie);assert.equal(created.statusCode,200,created.body);const issued=created.json();
 const raw=(token:string)=>runtime.app.inject({method:'POST',url:'/api/v1/list_workspaces',headers:{host:'127.0.0.1:4100',authorization:`Bearer ${token}`},payload:{}});
 assert.equal((await raw(issued.token.slice(0,-1)+(issued.token.endsWith('A')?'B':'A'))).statusCode,401);
 assert.equal((await api('revoke_all_api_credentials',{userId:adminId},userCookie)).statusCode,403);
 const all=await api('revoke_all_api_credentials',{},userCookie);assert.equal(all.statusCode,200,all.body);assert.ok(all.json().revokedCredentials>=1);assert.equal((await raw(issued.token)).statusCode,401);
 const again=await api('create_api_credential',args,userCookie);assert.equal(again.statusCode,200,again.body);
 const changed=await api('change_password',{currentPassword:'test-password-regular-user',newPassword:'rotated-test-password-regular-user',revokeOtherSessions:false},userCookie);assert.equal(changed.statusCode,200,changed.body);
 assert.equal((await raw(again.json().token)).statusCode,401);
 const restored=await api('change_password',{currentPassword:'rotated-test-password-regular-user',newPassword:'test-password-regular-user',revokeOtherSessions:false},userCookie);assert.equal(restored.statusCode,200,restored.body);
});

test('the versioned API contract covers every operation and resolves all input/output schema references',async()=>{
 const response=await runtime.app.inject({method:'GET',url:'/api/v1/openapi.json',headers:{host:'127.0.0.1:4100',cookie:adminCookie}});assert.equal(response.statusCode,200,response.body);
 const spec=response.json();assert.equal(spec.openapi,'3.1.0');assert.equal(spec.info.version,'1.0.0');assert.deepEqual(Object.keys(spec.paths).sort(),Object.keys(schemas).map(name=>`/api/v1/${name}`).sort());
 function inspect(value:any){if(!value||typeof value!=='object')return;if(value.$ref){assert.ok(value.$ref.startsWith('#/components/schemas/'));const name=value.$ref.slice('#/components/schemas/'.length).replaceAll('~1','/').replaceAll('~0','~');assert.ok(spec.components.schemas[name],name);}for(const child of Object.values(value))inspect(child);}
 inspect(spec);assert.ok(spec.components.schemas.ApiCredential);assert.ok(!JSON.stringify(spec.components.schemas.ApiCredential).includes('secret_hash'));
});

test('deleted notices respect live graded group revocation without exposing retained content',async()=>{
 const ws=await ok('create_workspace',{name:'Deleted group access',code:'deletedgroupaccess'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items'},standardFields:['keyword']});
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const team=await ok('create_group',{workspaceId:ws.id,name:'Owners',members:[{kind:'user',id:user.id,level:'full'}]}),rights=await ok('get_content_permissions',{objectTypeId:object.id});
 await ok('configure_content_permissions',{...rights,sensitive:true,grants:[{kind:'user',id:user.id,level:'read',create:false,fields:{}},{kind:'group',id:team.id,level:'full',create:true,fields:{}}]});
 let row=await ok('create_record',{objectTypeId:object.id,keyword:'Private historic group item',security:{policy:defaultRecordSecurity([{kind:'group',id:team.id,level:'full'}])}});const id=row.id;
 row=await ok('recycle_record',{objectTypeId:object.id,recordId:id,version:row.version});await ok('permanently_delete_record',{objectTypeId:object.id,recordId:id,version:row.version,confirm:true});
 const args={objectTypeId:object.id,recordId:id,includeDeleted:true};assert.equal((await api('list_record_journal',args,userCookie)).statusCode,200);
 await ok('configure_group',{workspaceId:ws.id,groupId:team.id,version:team.version,name:team.name,members:[]});assert.equal((await api('list_record_journal',args,userCookie)).statusCode,403);
});

test('Administrator deleted-record search uses frozen captions, scoped filters and sorting before paging, including derived Contact names',async()=>{
 const ws=await ok('create_workspace',{name:'Deleted captions',code:'deletedcaptions'}),object=await ok('create_object_type',{workspaceId:ws.id,technicalName:'items',labels:{en:'Items',de:'Einträge'},standardFields:['keyword']});
 const other=await ok('create_object_type',{workspaceId:ws.id,technicalName:'other',labels:{en:'Other'},standardFields:['keyword']});
 const make=async(id:string,name:string)=>{let row=await ok('create_record',{objectTypeId:id,keyword:name});row=await ok('recycle_record',{objectTypeId:id,recordId:row.id,version:row.version});await ok('permanently_delete_record',{objectTypeId:id,recordId:row.id,version:row.version,confirm:true});return row;};
 const zulu=await make(object.id,'Zulu caption'),alpha=await make(object.id,'Alpha caption');await make(other.id,'Other caption');
 let page=await ok('list_deleted_records',{workspaceId:ws.id,objectTypeId:object.id,query:' caption ',sortBy:'keyword',sortDirection:'asc',limit:1,offset:1});assert.equal(page.total,2);assert.equal(page.records[0].id,zulu.id);assert.equal(page.records[0].keyword,'Zulu caption');
 page=await ok('list_deleted_records',{workspaceId:ws.id,query:alpha.id});assert.equal(page.total,1);assert.equal(page.records[0].keyword,'Alpha caption');const history=await ok('list_system_journal',{workspaceId:ws.id,entityKind:'record',fieldKey:'lifecycle',limit:100});assert.ok(history.entries.some((e:any)=>e.entity_id===alpha.id&&e.entity_name==='Alpha caption'));assert.equal((await ok('list_deleted_records',{workspaceId:ws.id,query:'%'})).total,0);
 const foreign=await ok('create_workspace',{name:'Foreign captions',code:'foreigncaptions'});assert.equal((await api('list_deleted_records',{workspaceId:foreign.id,objectTypeId:object.id})).statusCode,400);
 const module=(await ok('list_workspace_modules',{workspaceId:ws.id})).find((m:any)=>m.key==='contacts');await ok('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:module.version});
 const contacts=(await ok('list_object_types',{workspaceId:ws.id})).find((o:any)=>o.technicalName==='contacts'),definition=await ok('get_object_type',{objectTypeId:contacts.id}),profile=definition.contactProfile;
 const values=Object.fromEntries([['contact_kind',profile.kinds.organization],['company_name','Retained Organization caption']].map(([purpose,value])=>[definition.fields.find((f:any)=>f.id===profile.fields[purpose]).technicalName,value]));
 let organization=await ok('create_record',{objectTypeId:contacts.id,values});organization=await ok('recycle_record',{objectTypeId:contacts.id,recordId:organization.id,version:organization.version});await ok('permanently_delete_record',{objectTypeId:contacts.id,recordId:organization.id,version:organization.version,confirm:true});
 page=await ok('list_deleted_records',{workspaceId:ws.id,objectTypeId:contacts.id,query:'organization',sortBy:'objectLabel'});assert.equal(page.total,1);assert.equal(page.records[0].keyword,'Retained Organization caption');assert.equal(page.records[0].id,organization.id);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'designer',expectedRole:null});const forbidden=await api('list_deleted_records',{workspaceId:ws.id,query:'caption'},userCookie);assert.equal(forbidden.statusCode,403);assert.ok(!forbidden.body.includes('Retained Organization caption'));
});

test('tree status captions use current object and per-record field rights for roots and children',async()=>{
 const ws=await ok('create_workspace',{code:'treestatus',name:'Tree status'}),primary=await enableProjects(ws.id);
 const user=(await ok('list_users',{})).find((u:any)=>u.email==='user@example.test');await ok('set_workspace_member',{workspaceId:ws.id,userId:user.id,role:'user',expectedRole:null});
 const objects=await ok('list_object_types',{workspaceId:ws.id}),project=await ok('get_object_type',{objectTypeId:objects.find((o:any)=>o.technicalName==='projects').id}),task=await ok('get_object_type',{objectTypeId:objects.find((o:any)=>o.technicalName==='tasks').id});
 const projectStatus=project.classification.options.find((o:any)=>o.kind==='status'&&o.active),taskStatus=task.classification.options.find((o:any)=>o.kind==='status'&&o.active);assert.ok(projectStatus);assert.ok(taskStatus);
 const parent=await ok('create_record',{objectTypeId:project.id,keyword:'Visible project',classification:{type:projectStatus.typeId??null,status:projectStatus.id},security:{policy:defaultRecordSecurity(),confirmPublic:true}});
 const child=await ok('create_record',{objectTypeId:task.id,keyword:'Visible task',classification:{type:taskStatus.typeId??null,status:taskStatus.id},security:{policy:defaultRecordSecurity(),confirmPublic:true},relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:project.id,recordId:parent.id}]}]});
 for(const definition of [project,task]){const config=await ok('get_content_permissions',{objectTypeId:definition.id});await ok('configure_content_permissions',{...config,grants:[{kind:'user',id:user.id,level:'read',fields:{[definition.fields.find((f:any)=>f.kind==='status').id]:'none'}}]});}
 const input={objectTypeId:project.id,recordId:parent.id},admin=await ok('get_relationship_tree_branch',input);assert.deepEqual(admin.record.statusLabels,projectStatus.labels);assert.deepEqual(admin.children[0].record.statusLabels,taskStatus.labels);
 const hidden=await api('get_relationship_tree_branch',input,userCookie);assert.equal(hidden.statusCode,200,hidden.body);assert.equal(hidden.json().record.statusLabels,null);assert.equal(hidden.json().children[0].record.statusLabels,null);assert.equal(hidden.body.includes(projectStatus.id),false);assert.equal(hidden.body.includes(taskStatus.id),false);
 const config=await ok('get_content_permissions',{objectTypeId:task.id});await ok('configure_content_permissions',{...config,grants:[{kind:'user',id:user.id,level:'read',fields:{}}]});
 const allowed=await api('get_relationship_tree_branch',input,userCookie);assert.deepEqual(allowed.json().children[0].record.statusLabels,taskStatus.labels);
 const security=await ok('get_record_security',{objectTypeId:task.id,recordId:child.id});await ok('configure_record_security',{objectTypeId:task.id,recordId:child.id,version:security.version,policy:{...security.policy,fields:[{kind:'user',id:user.id,fields:{[task.fields.find((f:any)=>f.kind==='status').id]:'none'}}]},confirmPublic:true});
 const ceiling=await api('get_relationship_tree_branch',input,userCookie);assert.equal(ceiling.json().children[0].record.statusLabels,null,'record-level field ceilings also apply');
});
