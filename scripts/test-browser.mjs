import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {Client as PgClient} from 'pg';
import {chromium,expect as playwrightExpect} from '@playwright/test';
import {initializeDatabase} from '../apps/server/src/database.ts';
import {createFirstAdministrator} from '../apps/server/src/setup.ts';
import {buildServer} from '../apps/server/src/server.ts';
import {defaultWorkspaceAppearance,emptyClassification} from '@xobject/contracts';

const exec=promisify(execFile),expect=playwrightExpect.configure({timeout:10000});
const postgresImage='postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;}

test('rendered application workflows on an isolated current installation',{timeout:240000},async t=>{
 const container=`xobject-browser-${randomUUID()}`,baseURL=`http://127.0.0.1:${await freePort()}`;
 const secret=randomBytes(48).toString('base64url'),password=randomBytes(24).toString('base64url');
 const artifacts=path.resolve('.local/browser-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
 let runtime,browser,failure;
 const scenarios=[];
 process.env.LOG_LEVEL??='silent';
 try{
  await exec('docker',['run','--detach','--rm','--name',container,'-e','POSTGRES_PASSWORD=browser_test_only','-e','POSTGRES_DB=xobject_browser','-p','127.0.0.1::5432',postgresImage],{timeout:120000});
  const address=(await exec('docker',['port',container,'5432/tcp'])).stdout.trim();
  const databaseURL=`postgres://postgres:browser_test_only@${address}/xobject_browser`;
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){const probe=new PgClient({connectionString:databaseURL,connectionTimeoutMillis:1000});try{await probe.connect();await probe.query('SELECT 1');ready=true;break;}catch{await sleep(250);}finally{await probe.end().catch(()=>{});}}
  assert.ok(ready,'Disposable PostgreSQL must accept TCP connections');
  await initializeDatabase(databaseURL,secret,baseURL);
  await createFirstAdministrator(databaseURL,{name:'John Doe',email:'admin@example.test',password});
  runtime=buildServer({databaseURL,authSecret:secret,baseURL});
  await runtime.app.listen({host:'127.0.0.1',port:Number(new URL(baseURL).port)});
  async function login(email,pass=password){const response=await fetch(`${baseURL}/api/auth/sign-in/email`,{method:'POST',headers:{'Content-Type':'application/json',origin:baseURL},body:JSON.stringify({email,password:pass})});assert.equal(response.status,200,`Fixture sign-in status ${response.status}`);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
  const adminCookie=await login('admin@example.test');
  async function api(operation,input,cookie=adminCookie){const response=await fetch(`${baseURL}/api/v1/${operation}`,{method:'POST',headers:{'Content-Type':'application/json','X-XObject-Request':'1',origin:baseURL,cookie},body:JSON.stringify(input)});assert.equal(response.status,200,`${operation}: HTTP ${response.status}`);return response.json();}
  const workspace=await api('create_workspace',{name:'Browser checks',code:'qa'});
  const studio=await api('create_workspace',{name:'Studio checks',code:'studio'});
  const studioSettings=(await api('list_workspaces',{})).find(item=>item.id===studio.id);
  await api('set_workspace_appearance',{workspaceId:studio.id,version:studioSettings.appearance_version,appearance:{...defaultWorkspaceAppearance,primaryColor:'#A11235',primaryColorDark:'#F26074',fontHeading:'orbitron'}});
  const actors={admin:{email:'admin@example.test',name:'John Doe',password}};
  for(const [role,name] of [['user','James Doe'],['designer','Jane Doe']]){
   const email=`${role}@example.test`,initialPassword=randomBytes(24).toString('base64url'),user=await api('create_user',{name,email,initialPassword});
   // Exercise the normal first-password-change path; never weaken production policy.
   const initialCookie=await login(email,initialPassword);
   await api('change_password',{currentPassword:initialPassword,newPassword:password,revokeOtherSessions:true},initialCookie);
   await api('set_workspace_member',{workspaceId:workspace.id,userId:user.id,role,expectedRole:null});
   actors[role]={email,name,password,id:user.id};
  }
  const object=await api('create_object_type',{workspaceId:workspace.id,technicalName:'checks',labels:{en:'Checks',de:'Prüfungen'},standardFields:['keyword','type_status','category']});
  const privateField=await api('create_field',{objectTypeId:object.id,technicalName:'internal_note',labels:{en:'Internal note',de:'Interne Notiz'},kind:'multiline'});
  const permissions=await api('get_content_permissions',{objectTypeId:object.id});
  await api('configure_content_permissions',{...permissions,grants:[{kind:'user',id:actors.user.id,level:'read',create:false,fields:{[privateField.id]:'none'}},{kind:'user',id:actors.designer.id,level:'edit',create:true,fields:{}}]});
  const ids={typeA:randomUUID(),typeB:randomUUID(),open:randomUUID(),done:randomUUID(),ready:randomUUID(),parent:randomUUID(),child:randomUUID()};
  const config=emptyClassification();delete config.version;
  config.category={required:false,multiple:true,tree:true,defaultIds:[]};
  config.options=[
   {id:ids.typeA,kind:'type',typeId:null,labels:{en:'Type A'},active:true},
   {id:ids.typeB,kind:'type',typeId:null,labels:{en:'Type B'},active:true},
   {id:ids.open,kind:'status',typeId:ids.typeA,labels:{en:'Open'},active:true},
   {id:ids.done,kind:'status',typeId:ids.typeA,labels:{en:'Done'},active:true},
   {id:ids.ready,kind:'status',typeId:ids.typeB,labels:{en:'Ready'},active:true},
   {id:ids.parent,kind:'category',typeId:null,labels:{en:'Coverage'},active:true},
   {id:ids.child,parentId:ids.parent,kind:'category',typeId:null,labels:{en:'Browser'},active:true},
  ];
  const definition=await api('get_object_type',{objectTypeId:object.id});
  await api('configure_classification',{objectTypeId:object.id,version:definition.classification.version,config});
  const editable=await api('create_record',{objectTypeId:object.id,keyword:'Editable sample',values:{internal_note:'Admin-only fixture note'}});
  await api('create_record',{objectTypeId:object.id,keyword:'Alpha filter sample',classification:{type:ids.typeA,status:ids.open,category:[ids.child]}});
  await api('create_record',{objectTypeId:object.id,keyword:'Beta filter sample',classification:{type:ids.typeB,status:ids.ready}});
  await api('create_record',{objectTypeId:object.id,keyword:'Gamma filter sample',classification:{type:ids.typeA,status:ids.done}});
  browser=await chromium.launch({headless:true});
  async function scenario(name,role,run,viewport={width:1440,height:1000}){
   await t.test(name,async()=>{
    const context=await browser.newContext({viewport,colorScheme:'light',locale:'en-US'});
    await context.tracing.start({screenshots:true,snapshots:true,sources:false});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    try{
     await page.goto(baseURL);
     await page.getByRole('textbox',{name:'Email',exact:true}).fill(actors[role].email);
     await page.getByRole('textbox',{name:'Password',exact:true}).fill(password);
     await page.getByRole('button',{name:/^Sign in/}).click();
     await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
     await run(page,context);
     assert.deepEqual(errors,[],'No uncaught browser errors');
     scenarios.push({name,status:'passed'});
     await context.tracing.stop();
    }catch(error){
     scenarios.push({name,status:'failed'});
     await mkdir(artifacts,{recursive:true,mode:0o700});
     const file=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase();
     await page.screenshot({path:path.join(artifacts,`${file}.png`),fullPage:true}).catch(()=>{});
     await context.tracing.stop({path:path.join(artifacts,`${file}.zip`)}).catch(()=>{});
     throw error;
    }finally{await context.close();}
   });
  }
  const listPath=`${baseURL}/w/qa/objects/checks`,recordPath=`${listPath}/${editable.id}`;
  async function settings(page){await page.getByRole('button',{name:actors.admin.name,exact:true}).last().click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();}
  await scenario('Administrator saves and discards record drafts','admin',async page=>{
   await page.goto(recordPath);const keyword=page.getByRole('textbox',{name:/^Keyword(?: \*)?$/});await expect(keyword).toHaveValue('Editable sample');
   await keyword.fill('Saved browser sample');await page.getByRole('button',{name:/^Save/}).click();
   await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   assert.equal((await api('get_record',{objectTypeId:object.id,recordId:editable.id})).keyword,'Saved browser sample');
   await keyword.fill('Discard this draft');await page.getByRole('button',{name:'Back to overview',exact:true}).click();
   await expect(page.getByRole('alertdialog',{name:'Discard unsaved changes?',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(keyword).toHaveValue('Discard this draft');
   await page.getByRole('button',{name:'Back to overview',exact:true}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Checks',exact:true})).toBeVisible();
   assert.equal((await api('get_record',{objectTypeId:object.id,recordId:editable.id})).keyword,'Saved browser sample');
  });
  await scenario('Settings nested dialogs preserve keyboard focus','admin',async page=>{
   await settings(page);await page.getByRole('dialog').getByRole('button',{name:'Object types',exact:true}).click();
   await page.getByRole('button',{name:'Internal note',exact:true}).click();await expect(page.getByRole('dialog',{name:'Field attributes',exact:true})).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Field attributes',exact:true})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Internal note',exact:true})).toBeFocused();
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('[data-user-menu="header"]')).toBeFocused();
   await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+k');await expect(page.getByRole('dialog',{name:'Search and navigate',exact:true})).toBeVisible();
   await expect(page.getByRole('combobox',{name:'Search and navigate',exact:true})).toBeFocused();await expect(page.getByRole('option',{name:'Customize navigation',exact:true})).toBeVisible();
   await page.keyboard.press('Escape');
  });
  await scenario('Classification filters combine values and retain list context','admin',async page=>{
   await page.goto(listPath);await expect(page.getByRole('group',{name:'Classification filters',exact:true})).toBeVisible();
   const alpha=page.getByRole('button',{name:'Checks Alpha filter sample',exact:true}),beta=page.getByRole('button',{name:'Checks Beta filter sample',exact:true}),gamma=page.getByRole('button',{name:'Checks Gamma filter sample',exact:true});
   await expect(alpha).toBeVisible();await expect(beta).toBeVisible();await expect(gamma).toBeVisible();
   await page.getByRole('button',{name:'Filter by Type',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Type A',exact:true}).click();await page.keyboard.press('Escape');
   await expect(alpha).toBeVisible();await expect(gamma).toBeVisible();await expect(beta).toHaveCount(0);
   await page.getByRole('button',{name:'Filter by Type',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Type B',exact:true}).click();await page.keyboard.press('Escape');
   await expect(alpha).toBeVisible();await expect(beta).toBeVisible();
   await page.getByRole('button',{name:'Filter by Type',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Type B',exact:true}).click();await page.keyboard.press('Escape');await expect(beta).toHaveCount(0);
   await page.getByRole('button',{name:'Filter by Status',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Open',exact:true}).click();await page.keyboard.press('Escape');
   await expect(alpha).toBeVisible();await expect(gamma).toHaveCount(0);
   await page.getByRole('button',{name:'Filter by Category',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Coverage',exact:true}).click();await page.keyboard.press('Escape');
   await expect(alpha).toBeVisible();const filteredURL=page.url();
   await alpha.click();await expect(page.getByRole('heading',{name:'Alpha filter sample',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to overview',exact:true}).click();
   await expect(page).toHaveURL(filteredURL);await expect(beta).toHaveCount(0);await expect(alpha).toBeVisible();
   await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(beta).toBeVisible();
   await page.getByRole('button',{name:'Filter by Type',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Without value',exact:true}).click();await page.keyboard.press('Escape');
   await expect(page.getByRole('button',{name:'Checks Saved browser sample',exact:true})).toBeVisible();await expect(alpha).toHaveCount(0);
  });
  await scenario('Workspace and system-theme changes reach portalled previews','admin',async page=>{
   await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);
   await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('menuitem',{name:'Studio checks',exact:true}).click();
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--primary'))).toBe('#F26074');
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--workspace-heading-font'))).toContain('Orbitron');
   await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('menuitem',{name:'Browser checks',exact:true}).click();
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--workspace-heading-font'))).toContain('Geist');
   await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).not.toHaveClass(/dark/);
   await settings(page);await page.getByRole('dialog').getByRole('button',{name:'Appearance',exact:true}).nth(1).click();
   await page.getByRole('tab',{name:'Dark',exact:true}).click();await page.getByRole('tabpanel',{name:'Dark',exact:true}).getByRole('button',{name:'Try menu',exact:true}).click();
   const menu=page.getByRole('menu',{name:'Try menu',exact:true});await expect(menu).toBeVisible();await expect(menu).toHaveClass(/dark/);
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  });
  await scenario('User sees read-only records without restricted fields','user',async page=>{
   await page.goto(recordPath);await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toHaveValue('Saved browser sample');
   await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toBeDisabled();await expect(page.getByRole('textbox',{name:'Internal note',exact:true})).toHaveCount(0);
   await page.goto(listPath);await expect(page.getByRole('heading',{name:'Checks',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Create record',exact:true})).toHaveCount(0);
   await page.getByRole('button',{name:actors.user.name,exact:true}).last().click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
   await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByRole('button',{name:'User management',exact:true})).toHaveCount(0);
   await page.getByRole('dialog').getByRole('button',{name:'Object types',exact:true}).click();await expect(page.getByRole('button',{name:'Add field',exact:true})).toHaveCount(0);
  });
  await scenario('Designer manages fields without installation administration','designer',async page=>{
   await page.getByRole('button',{name:actors.designer.name,exact:true}).last().click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.getByRole('dialog').getByRole('button',{name:'User management',exact:true})).toHaveCount(0);
   await page.getByRole('dialog').getByRole('button',{name:'Object types',exact:true}).click();await page.getByRole('button',{name:'Add field',exact:true}).click();
   const field=page.getByRole('dialog',{name:'Add field',exact:true});await expect(field).toBeVisible();await field.getByRole('textbox',{name:'Name',exact:true}).fill('Designer note');await field.getByRole('textbox',{name:'Technical name',exact:true}).fill('designer_note');
   await field.getByRole('button',{name:/^Create/}).click();await expect(field).toHaveCount(0);await expect(page.getByRole('button',{name:'Designer note',exact:true})).toBeVisible();
  });
  await scenario('Mobile record and settings remain usable','admin',async page=>{
   await page.goto(recordPath);await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toBeVisible();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
   await settings(page);await expect(page.getByRole('combobox',{name:'Settings',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Settings',exact:true}).selectOption({label:'Workspace · Object types'});
   await expect(page.getByRole('button',{name:'Internal note',exact:true})).toBeVisible();await page.getByRole('button',{name:'Internal note',exact:true}).click();
   const field=page.getByRole('dialog',{name:'Field attributes',exact:true});await expect(field).toBeVisible();assert.ok(await field.evaluate(el=>el.scrollWidth<=el.clientWidth),'No horizontal field dialog overflow');
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  },{width:390,height:844});
  await mkdir(artifacts,{recursive:true,mode:0o700});
  await writeFile(path.join(artifacts,'result.json'),JSON.stringify({status:scenarios.every(s=>s.status==='passed')?'passed':'failed',browser:'Chromium',fixture:'disposable current PostgreSQL installation; normal account onboarding',scenarios},null,2)+'\n',{mode:0o600});
  console.log(`Browser acceptance evidence: ${artifacts}`);
 }catch(error){failure=error;throw error;}finally{
  // Attempt every owned resource even if another close fails; never prune shared Docker state.
  const errors=[];
  for(const [name,close] of [
   ['Browser',()=>browser?.close()],
   ['Application server',()=>runtime?.app.close()],
   ['PostgreSQL container',async()=>{
    try{await exec('docker',['rm','--force',container],{timeout:30000});}catch(error){
     // --rm may already have removed this exact fixture after a failed/startup run.
     if(!String(error.stderr).includes(`No such container: ${container}`))throw error;
    }
   }],
  ])try{await close();}catch(error){errors.push(new Error(`${name} cleanup failed`,{cause:error}));}
  if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Browser acceptance cleanup failed');
 }
});
