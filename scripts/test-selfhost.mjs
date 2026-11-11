// Disposable Linux-container acceptance. Requires a locally built image, Docker and Node.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const project=`xobject-accept-${randomUUID()}`,directory=path.join(root,'.local','selfhost-acceptance',project);
await mkdir(directory,{recursive:true,mode:0o700});
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const base=`http://127.0.0.1:${port}`,image=process.env.XOBJECT_TEST_IMAGE??'xobject:local-acceptance';
const predecessor=process.env.XOBJECT_TEST_PREDECESSOR_IMAGE;
if(predecessor&&!/@sha256:[a-f0-9]{64}$/.test(predecessor))throw Error('Use an immutable predecessor image digest');
const env={...process.env,XOBJECT_ENV_FILE:path.join(directory,'install.env'),XOBJECT_RECOVERY_DIR:path.join(directory,'recovery'),XOBJECT_PROJECT_NAME:project,XOBJECT_COMPOSE_OVERRIDE:path.join(directory,'override.yaml'),XOBJECT_START_SERVICES:'app',ADMIN_NAME:'John Doe',ADMIN_EMAIL:'john@example.test',ADMIN_PASSWORD:randomBytes(24).toString('base64url')};
await writeFile(env.XOBJECT_COMPOSE_OVERRIDE,`services:\n  app:\n    ports: [\"127.0.0.1:${port}:4100\"]\n`,{mode:0o600});
const compose=['compose','--project-name',project,'--env-file',env.XOBJECT_ENV_FILE,'-f',path.join(root,'deploy/compose.selfhost.yaml'),'-f',env.XOBJECT_COMPOSE_OVERRIDE];
async function run(command,args){try{return await exec(command,args,{cwd:root,env,timeout:180000,maxBuffer:4*1024*1024});}catch(error){await writeFile(path.join(directory,'failed-command.log'),String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600});console.error(String(error.stderr??'').split('\n').filter(line=>/xObject operator failed at line|unknown flag:|unknown shorthand flag:|no such option|unknown option/.test(line)).join('\n'));throw new Error(`Acceptance command failed; private diagnostic: ${path.join(directory,'failed-command.log')}`,{cause:undefined});}}
const operator=(...args)=>run('docker',[...compose,'run','--rm','-T','operator',...args]);
const helper=(...args)=>run(path.join(root,'scripts/xobject'),args);
let cookie='';
async function login(){const response=await fetch(`${base}/api/auth/sign-in/email`,{method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});assert.equal(response.status,200);cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
async function api(name,input){const response=await fetch(`${base}/api/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json','X-XObject-Request':'1',origin:base,cookie},body:JSON.stringify(input)});assert.equal(response.status,200,`${name} returned ${response.status}`);return response.json();}
try{
  if(predecessor)await run('docker',['pull',predecessor]);
  await helper('configure',base,predecessor??image,'qa@example.test');
  await run('docker',[...compose,'up','-d','--wait','db']);
  await operator('initialize');
  await run('docker',[...compose,'run','--rm','-T','-e','ADMIN_NAME','-e','ADMIN_EMAIL','-e','ADMIN_PASSWORD','operator','setup']);
  await helper('start');await login();
  const response=await fetch(base);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const ws=await api('create_workspace',{name:'ITextreme',code:'itx'});
  const object=await api('create_object_type',{workspaceId:ws.id,technicalName:'recovery_checks',labels:{en:'Recovery checks',de:'Wiederherstellung'},standardFields:['keyword']});
  await api('create_field',{objectTypeId:object.id,technicalName:'description',labels:{en:'Description',de:'Beschreibung'},kind:'multiline'});
  const record=await api('create_record',{objectTypeId:object.id,keyword:'Recovery sample',values:{description:'Before backup'}});
  const originalJournal=await api('list_record_journal',{objectTypeId:object.id,recordId:record.id});
  await api('configure_workspace_module',{workspaceId:ws.id,key:'contacts',enabled:true,version:1});
  const contactSummary=(await api('list_object_types',{workspaceId:ws.id})).find(item=>item.technicalName==='contacts');
  const contactModel=await api('get_object_type',{objectTypeId:contactSummary.id});
  const contact=await api('create_record',{objectTypeId:contactModel.id,values:{contact_kind:contactModel.contactProfile.kinds.organization,company_name:'Retained release contact'}});
  const contactJournal=await api('list_record_journal',{objectTypeId:contactModel.id,recordId:contact.id});

  const bundle=path.join(directory,'backup');await helper('backup',bundle);
  await api('update_record',{objectTypeId:object.id,recordId:record.id,version:record.version,values:{description:'After backup'}});
  const extra=await api('create_record',{objectTypeId:object.id,keyword:'After snapshot'});
  await helper('restore',bundle,'--confirm-restore');
  const stopped=await run('docker',[...compose,'ps','--status','running','--services']);assert.ok(!stopped.stdout.split('\n').includes('app'));
  await helper('start');await login();
  const restored=await api('get_record',{objectTypeId:object.id,recordId:record.id});assert.equal(restored.description,'Before backup');assert.equal(restored.version,record.version);
  const gone=await fetch(`${base}/api/v1/get_record`,{method:'POST',headers:{'Content-Type':'application/json','X-XObject-Request':'1',origin:base,cookie},body:JSON.stringify({objectTypeId:object.id,recordId:extra.id})});assert.equal(gone.status,404);
  const journal=await api('list_record_journal',{objectTypeId:object.id,recordId:record.id});assert.equal(journal.total,originalJournal.total);
  await helper('verify');
  const imageId=(await run('docker',['image','inspect',image,'--format','{{.Id}}'])).stdout.trim();
  await helper('upgrade',imageId,path.join(directory,'upgrade-backup'));
  await login();
  const upgraded=await api('get_record',{objectTypeId:object.id,recordId:record.id});
  assert.equal(upgraded.description,'Before backup');assert.equal(upgraded.version,record.version);assert.equal(upgraded.keyword,record.keyword);
  assert.deepEqual(await api('list_record_journal',{objectTypeId:object.id,recordId:record.id}),journal);
  const retainedContact=await api('get_record',{objectTypeId:contactModel.id,recordId:contact.id});
  assert.equal(retainedContact.company_name,contact.company_name);assert.equal(retainedContact.version,contact.version);
  assert.deepEqual(await api('list_record_journal',{objectTypeId:contactModel.id,recordId:contact.id}),contactJournal);
  const upgradedContactModel=await api('get_object_type',{objectTypeId:contactModel.id});
  for(const key of ['address_form','letter_salutation','pronouns'])assert.ok(upgradedContactModel.contactProfile.fields[key]);

  await run('docker',[...compose,'stop','app']);
  await run('docker',[...compose,'exec','-T','db','psql','-X','-v','ON_ERROR_STOP=1','-U','xobject','-d','xobject','-c',"UPDATE sys_schema_version SET definition_hash='unsupported-source' WHERE singleton"]);
  await assert.rejects(()=>helper('upgrade',imageId,path.join(directory,'unsupported-source-backup')));
  const failedState=await run('docker',[...compose,'ps','--status','running','--services']);assert.ok(!failedState.stdout.split('\n').includes('app'));
  await helper('restore',bundle,'--confirm-restore');await helper('start');await login();
  assert.equal((await api('get_record',{objectTypeId:object.id,recordId:record.id})).description,'Before backup');
  await writeFile(path.join(directory,'acceptance.json'),JSON.stringify({status:'passed',platform:process.platform,containerPlatform:(await run('docker',['image','inspect',image,'--format','{{.Os}}/{{.Architecture}}'])).stdout.trim(),imageId,predecessor:predecessor??null,checks:['empty installation','one-time first Administrator','runtime-only application','HTTP security headers','record and journal backup/restore','restoration remains stopped',predecessor?'released-source upgrade with unchanged records/versions/journal':'same-target upgrade','unknown-source rejection remains stopped','recovery after failed upgrade'],publication:'none'},null,2)+'\n',{mode:0o600});
  console.log(`Self-hosting acceptance passed: ${directory}`);
}finally{
  try{const logs=await run('docker',[...compose,'logs','--no-color','app']);await writeFile(path.join(directory,'runtime.log'),logs.stdout,{mode:0o600});}catch{}
  await run('docker',[...compose,'down','--volumes']).catch(()=>{});
}
