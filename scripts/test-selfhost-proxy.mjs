// Isolated loopback HTTPS acceptance with Caddy's local CA; no ACME or public listener.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import https from 'node:https';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile),project=`xobject-proxy-${randomUUID()}`;
const directory=path.join(root,'.local','selfhost-acceptance',project);await mkdir(directory,{recursive:true,mode:0o700});
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`https://localhost:${port}`,image=process.env.XOBJECT_TEST_IMAGE??'xobject:local-acceptance';
const env={...process.env,XOBJECT_PROJECT_NAME:project,XOBJECT_ENV_FILE:path.join(directory,'install.env'),XOBJECT_COMPOSE_OVERRIDE:path.join(directory,'override.yaml'),ADMIN_NAME:'John Doe',ADMIN_EMAIL:'john@example.test',ADMIN_PASSWORD:randomBytes(24).toString('base64url')};
await writeFile(env.XOBJECT_COMPOSE_OVERRIDE,`services:\n  proxy:\n    ports: !override ["127.0.0.1:${port}:${port}"]\n`,{mode:0o600});
const compose=['compose','--project-name',project,'--env-file',env.XOBJECT_ENV_FILE,'-f',path.join(root,'deploy/compose.selfhost.yaml'),'-f',env.XOBJECT_COMPOSE_OVERRIDE];
async function run(command,args){try{return await exec(command,args,{cwd:root,env,timeout:180000,maxBuffer:4*1024*1024});}catch(error){await writeFile(path.join(directory,'failed-command.log'),String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600});console.error(String(error.stderr??'').split('\n').filter(line=>/xObject operator failed at line|unknown flag:|unknown shorthand flag:|no such option|unknown option/.test(line)).join('\n'));throw Error(`Proxy acceptance failed; private diagnostic: ${directory}`);}}
const helper=(...args)=>run(path.join(root,'scripts/xobject'),args);
let ca;
function request(urlPath,body,headers={}){return new Promise((resolve,reject)=>{const data=body===undefined?undefined:JSON.stringify(body);const req=https.request({hostname:'127.0.0.1',servername:'localhost',port,path:urlPath,ca,method:data?'POST':'GET',headers:{Host:`localhost:${port}`,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text}));});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('HTTPS timeout')));req.end(data);});}
try{
 await helper('configure',base,image,'qa@example.test');await run('docker',[...compose,'up','-d','--wait','db']);
 await run('docker',[...compose,'run','--rm','-T','operator','initialize']);
 await run('docker',[...compose,'run','--rm','-T','-e','ADMIN_NAME','-e','ADMIN_EMAIL','-e','ADMIN_PASSWORD','operator','setup']);
 await helper('start');
 for(let i=0;i<60;i++){try{const result=await run('docker',[...compose,'exec','-T','proxy','cat','/data/caddy/pki/authorities/local/root.crt']);ca=result.stdout;break;}catch{await new Promise(r=>setTimeout(r,250));}}
 assert.ok(ca,'Caddy local CA ready');
 const health=await request('/healthz');assert.equal(health.status,200);assert.equal(health.headers['cache-control'],'no-store');assert.match(health.headers['strict-transport-security'],/max-age=/);
 const login=await request('/api/auth/sign-in/email',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD},{origin:base,'x-forwarded-for':'203.0.113.42','x-xobject-client-ip':'203.0.113.43'});assert.equal(login.status,200);
 const cookies=login.headers['set-cookie'];assert.ok(cookies.some(c=>/Secure/i.test(c)&&/HttpOnly/i.test(c)&&/SameSite=Lax/i.test(c)));const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 const list=await request('/api/v1/list_workspaces',{}, {cookie,origin:base,'x-xobject-request':'1'});assert.equal(list.status,200);assert.deepEqual(JSON.parse(list.text),[]);
 const blocked=await request('/api/auth/sign-out',{}, {cookie,origin:'https://untrusted.example'});assert.equal(blocked.status,403);
 const metadata=await request('/.well-known/oauth-protected-resource/mcp');assert.equal(metadata.status,200);assert.equal(JSON.parse(metadata.text).resource,base+'/mcp');
 const sessionIP=(await run('docker',[...compose,'exec','-T','db','psql','-X','-At','-U','xobject','-d','xobject','-c','SELECT ip_address FROM sys_sessions LIMIT 1'])).stdout.trim();assert.ok(sessionIP);assert.ok(!['203.0.113.42','203.0.113.43','172.30.61.2'].includes(sessionIP));
 await writeFile(path.join(directory,'acceptance.json'),JSON.stringify({status:'passed',checks:['loopback HTTPS with trusted Caddy local CA','canonical Host and TLS','secure session cookie','trusted proxy address and spoofed-IP replacement','same-origin API','foreign-Origin rejection','OAuth HTTPS resource discovery'],publicDNS:false,ACME:false,publication:'none'},null,2)+'\n',{mode:0o600});
 console.log(`Caddy HTTPS acceptance passed: ${directory}`);
}finally{try{const result=await run('docker',[...compose,'logs','--no-color','app','proxy']);await writeFile(path.join(directory,'runtime.log'),result.stdout,{mode:0o600});}catch{}await run('docker',[...compose,'down','--volumes']).catch(()=>{});}
