import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import {Client as PgClient} from 'pg';
import {chromium,firefox,webkit,expect as playwrightExpect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {initializeDatabase} from '../apps/server/src/database.ts';
import {createFirstAdministrator} from '../apps/server/src/setup.ts';
import {buildServer} from '../apps/server/src/server.ts';
import {defaultWorkspaceAppearance,emptyClassification} from '@xobject/contracts';

const exec=promisify(execFile),expect=playwrightExpect.configure({timeout:10000});
const postgresImage='postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5';
const engineName=process.env.XOBJECT_TEST_BROWSER??'chromium';
assert.ok(['chromium','firefox','webkit'].includes(engineName),'Unsupported acceptance browser');
const engine={chromium,firefox,webkit}[engineName];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;}

test('rendered application workflows on an isolated current installation',{timeout:360000},async t=>{
 const container=`xobject-browser-${randomUUID()}`,baseURL=`http://127.0.0.1:${await freePort()}`;
 const secret=randomBytes(48).toString('base64url'),password=randomBytes(24).toString('base64url');
 const artifacts=path.resolve('.local/browser-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
 let runtime,browser,failure;
 const scenarios=[],accessibilityFindings=[],authenticatedStates=new Map();
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
  await api('create_field',{objectTypeId:object.id,technicalName:'custodians',labels:{en:'Custodians',de:'Betreuung'},kind:'reference',config:{referenceTarget:'both',multiple:true}});
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
  const editable=await api('create_record',{objectTypeId:object.id,keyword:'Editable sample',values:{internal_note:'Admin-only fixture note',custodians:[{kind:'user',id:actors.user.id}]}});
  await api('create_record',{objectTypeId:object.id,keyword:'Alpha filter sample',classification:{type:ids.typeA,status:ids.open,category:[ids.child]}});
  await api('create_record',{objectTypeId:object.id,keyword:'Beta filter sample',classification:{type:ids.typeB,status:ids.ready}});
  await api('create_record',{objectTypeId:object.id,keyword:'Gamma filter sample',classification:{type:ids.typeA,status:ids.done}});
  for(const key of ['contacts','projects']){
   const module=(await api('list_workspace_modules',{workspaceId:workspace.id})).find(m=>m.key===key);
   await api('configure_workspace_module',{workspaceId:workspace.id,key,enabled:true,version:module.version});
  }
  const supplied=(await api('list_object_types',{workspaceId:workspace.id})).filter(o=>o.id!==object.id);
  for(const model of supplied){const rights=await api('get_content_permissions',{objectTypeId:model.id});await api('configure_content_permissions',{...rights,grants:[{kind:'user',id:actors.user.id,level:'full',create:true,fields:{}}]});}
  const domainCookie=await login(actors.user.email),domain={};
  const contact=await api('get_object_type',{objectTypeId:supplied.find(o=>o.technicalName==='contacts').id});
  const organization=contact.fields.find(f=>f.technicalName==='contact_kind').config.options.find(o=>o.labels.en==='Organization').id;
  domain.contacts={model:contact,record:await api('create_record',{objectTypeId:contact.id,values:{contact_kind:organization,company_name:'Acceptance client'}},domainCookie)};
  const contactKinds=contact.fields.find(f=>f.technicalName==='contact_kind').config.options;
  for(const [key,kind,first] of [['contact_person','Contact person','Jane'],['individual','Individual contact','James']]){
   domain[key]={model:contact,record:await api('create_record',{objectTypeId:contact.id,values:{contact_kind:contactKinds.find(o=>o.labels.en===kind).id,first_name:[{id:randomUUID(),text:first}],last_name:[{id:randomUUID(),text:'Doe'}]}},domainCookie)};
  }
  for(const model of supplied){
   const current=await api('get_object_type',{objectTypeId:model.id}),groups=current.formLayouts.default.groups;
   const primaryIndex=groups.findIndex(g=>g.fields.some(e=>e.primary));
   assert.ok(primaryIndex>=0,`Supplied ${model.technicalName} has a Primary starter group`);
   const classificationIndex=groups.findIndex(g=>g.fields.some(e=>'fieldId'in e&&current.fields.some(f=>f.id===e.fieldId&&f.technicalName==='type')));
   assert.ok(classificationIndex<0||primaryIndex<classificationIndex,'Primary precedes Classification');
  }
  const primary=(await api('list_relationship_types',{workspaceId:workspace.id})).find(r=>r.kind==='primary');
  let parent=domain.contacts;
  for(const key of ['projects','cases','tasks']){
   const model=supplied.find(o=>o.technicalName===key);
   const record=await api('create_record',{objectTypeId:model.id,keyword:`Acceptance ${key}`,relationships:[{relationshipTypeId:primary.id,version:primary.version,side:'right',targets:[{objectTypeId:parent.model.id,recordId:parent.record.id}]}]},domainCookie);
   domain[key]={model,record};parent=domain[key];
  }
  const list=supplied.find(o=>o.technicalName==='distribution_lists');domain.distribution_lists={model:list,record:await api('create_record',{objectTypeId:list.id,keyword:'Acceptance distribution'},domainCookie)};
  browser=await engine.launch({headless:true,timeout:10000});
  async function auditPage(page,name){
     await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});
     const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
     await mkdir(artifacts,{recursive:true,mode:0o700});
     await writeFile(path.join(artifacts,`${engineName}-${name.replace(/[^a-z0-9]+/gi,'-')}-axe.json`),JSON.stringify(accessibility.violations,null,2));
     if(accessibility.violations.length){
      const selectors=accessibility.violations.flatMap(finding=>finding.nodes.flatMap(node=>node.target.filter(item=>typeof item==='string')));
      const diagnostics=await page.evaluate(selectors=>({dialogs:[...document.querySelectorAll('[role="dialog"]')].map(el=>({label:el.getAttribute('aria-labelledby'),modal:el.getAttribute('aria-modal')})),targets:selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return {selector,missing:true};const style=getComputedStyle(el);return {selector,disabled:el.disabled,opacity:style.opacity,color:style.color,background:style.backgroundColor,ariaHidden:!!el.closest('[aria-hidden="true"]'),inert:!!el.closest('[inert]'),busy:!!el.closest('[aria-busy="true"]'),ancestors:[...function*(node){while(node){yield {tag:node.tagName,slot:node.getAttribute('data-slot'),opacity:getComputedStyle(node).opacity};node=node.parentElement;}}(el)].filter(n=>n.opacity!=='1')};})}),selectors);
      await writeFile(path.join(artifacts,`${engineName}-${name.replace(/[^a-z0-9]+/gi,'-')}-diagnostics.json`),JSON.stringify(diagnostics,null,2));
      await page.screenshot({path:path.join(artifacts,`${engineName}-${name.replace(/[^a-z0-9]+/gi,'-')}-axe.png`),fullPage:true});
     }

     if(name.endsWith('-Details'))await page.screenshot({path:path.join(artifacts,`${engineName}-${name}.png`),fullPage:true});
     accessibilityFindings.push(...accessibility.violations.map(item=>({view:name,id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)})));
  }
  async function resetFixtureAuthQuota(){const limiter=new PgClient({connectionString:databaseURL});await limiter.connect();try{await limiter.query('DELETE FROM sys_auth_rate_limits');}finally{await limiter.end();}}
  async function scenario(name,role,run,viewport={width:1440,height:1000}){
   if(process.env.XOBJECT_TEST_SCENARIO&&!name.includes(process.env.XOBJECT_TEST_SCENARIO))return;
   await t.test(name,async()=>{
    // Each scenario owns its synthetic loopback request quota; production limits remain enabled.
    await resetFixtureAuthQuota();
    const context=await browser.newContext({viewport,colorScheme:'light',locale:'en-US',storageState:authenticatedStates.get(role)});
    await context.tracing.start({screenshots:true,snapshots:true,sources:false});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    try{
     await page.goto(baseURL);
     if(!authenticatedStates.has(role)){
     await page.getByRole('textbox',{name:'Email',exact:true}).fill(actors[role].email);
     await page.getByRole('textbox',{name:'Password',exact:true}).fill(password);
     await page.getByRole('button',{name:/^Sign in/}).click();
     await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
     authenticatedStates.set(role,await context.storageState());
     }
     await run(page,context);
     await auditPage(page,name);
     assert.deepEqual(errors,[],'No uncaught browser errors');
     scenarios.push({name,status:'passed'});
     await context.tracing.stop();
    }catch(error){
     console.error(`Scenario failed: ${name}: ${String(error.message).slice(0,700)}`);
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
  async function selectChecks(page){await page.locator('#settings-object').click();await page.getByRole('option',{name:'Checks',exact:true}).click();}
  async function settings(page){await page.locator('[data-user-menu="header"]').click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]')).toBeVisible();}
  for(const mobile of [false,true])await scenario(`Workspace icon catalog ${mobile?'mobile':'desktop'}`,'admin',async page=>{
   const baseline=(await api('list_workspaces',{})).find(w=>w.id===workspace.id).appearance;
   try{
    await settings(page);
    if(mobile)await page.getByRole('combobox',{name:'Settings',exact:true}).selectOption({label:'Workspace · Appearance'});
    else await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Appearance',exact:true}).nth(1).click();
    await page.getByRole('tab',{name:'Logo',exact:true}).click();
    const selector=page.getByRole('combobox',{name:'Workspace icon',exact:true});await selector.click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(48);
    await expect(page.getByRole('group',{name:'Ideas & creativity',exact:true})).toBeAttached();
    await page.getByRole('option',{name:'Skull',exact:true}).scrollIntoViewIfNeeded();
    await mkdir(artifacts,{recursive:true,mode:0o700});await page.screenshot({path:path.join(artifacts,`workspace-icons-${mobile?'mobile':'desktop'}.png`)});
    await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);
    await auditPage(page,`workspace-icon-picker-${mobile?'mobile':'desktop'}-dark`);
    await page.screenshot({path:path.join(artifacts,`workspace-icons-${mobile?'mobile':'desktop'}-dark.png`),animations:'disabled'});
    await page.keyboard.press('s');await page.keyboard.press('k');await page.keyboard.press('Enter');
    await expect(selector.locator('[data-slot="select-value"]')).toHaveText('Skull');
    await expect(page.getByRole('img',{name:'Skull',exact:true})).toBeVisible();
    await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:/^Save/}).click();
    await expect.poll(async()=>(await api('list_workspaces',{})).find(w=>w.id===workspace.id).appearance.logoIcon).toBe('skull');
    const dialog=page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').filter({has:page.locator('#settings-form')});
    await dialog.getByRole('button',{name:'Close',exact:true}).first().click();await expect(dialog).not.toBeVisible();
    if(mobile)await page.getByRole('button',{name:'Navigation',exact:true}).click();
    await expect(page.locator('[data-definition-trigger="workspace"] .lucide-skull')).toBeVisible();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No page horizontal overflow');
   }finally{
    const current=(await api('list_workspaces',{})).find(w=>w.id===workspace.id);
    await api('set_workspace_appearance',{workspaceId:workspace.id,version:current.appearance_version,appearance:baseline});
   }
  },mobile?{width:390,height:844}:{width:1440,height:1000});
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
   await settings(page);await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Object types',exact:true}).click();await selectChecks(page);
   await page.getByRole('button',{name:'Internal note',exact:true}).click();await expect(page.getByRole('dialog',{name:'Field attributes',exact:true})).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Field attributes',exact:true})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Internal note',exact:true})).toBeFocused();
   await page.keyboard.press('Escape');await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]')).toHaveCount(0);await expect(page.locator('[data-user-menu="header"]')).toBeFocused();
   await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+k');await expect(page.getByRole('dialog',{name:'Search and navigate',exact:true})).toBeVisible();
   await expect(page.getByRole('combobox',{name:'Search and navigate',exact:true})).toBeFocused();await expect(page.getByRole('option',{name:'Customize navigation',exact:true})).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Search and navigate',exact:true})).toHaveCount(0);
   // Closing the command dialog can trigger list refresh; measure the settled, enabled headers.
   await expect.poll(()=>page.locator('thead [data-slot="button"]').evaluateAll(buttons=>buttons.length>0&&buttons.every(button=>!button.disabled&&getComputedStyle(button).opacity==='1'))).toBe(true);
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
   await expect(page.getByRole('button',{name:`Checks ${(await api('get_record',{objectTypeId:object.id,recordId:editable.id})).keyword}`,exact:true})).toBeVisible();await expect(alpha).toHaveCount(0);
  });
  await scenario('Workspace and system-theme changes reach portalled previews','admin',async page=>{
   await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);
   await page.locator('[data-definition-trigger="workspace"]').click();await page.getByRole('menuitem',{name:'Studio checks',exact:true}).click();
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--primary'))).toBe('#F26074');
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--workspace-heading-font'))).toContain('Orbitron');
   await page.locator('[data-definition-trigger="workspace"]').click();await page.getByRole('menuitem',{name:'Browser checks',exact:true}).click();
   await expect.poll(()=>page.locator('html').evaluate(el=>el.style.getPropertyValue('--workspace-heading-font'))).toContain('Geist');
   await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).not.toHaveClass(/dark/);
   await settings(page);await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Appearance',exact:true}).nth(1).click();
   await page.getByRole('tab',{name:'Dark',exact:true}).click();await page.getByRole('tabpanel',{name:'Dark',exact:true}).getByRole('button',{name:'Try menu',exact:true}).click();
   const menu=page.getByRole('menu',{name:'Try menu',exact:true});await expect(menu).toBeVisible();await expect(menu).toHaveClass(/dark/);
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   for(const colorScheme of ['light','dark']){
   await page.emulateMedia({colorScheme});await settings(page);
   const dialog=page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]'),navigation=dialog.locator('[data-sidebar="menu-button"]');
   const labels=await navigation.allTextContents();assert.ok(labels.length>=15,'All settings groups must be present');
   for(let i=0;i<labels.length;i++){
    await navigation.nth(i).click();
    await expect(dialog.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await auditPage(page,`settings-${colorScheme}-${i}-${labels[i]}`);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'No settings overflow');
   }
   await page.keyboard.press('Escape');
   }
  });
  await scenario('User sees read-only records without restricted fields','user',async page=>{
   await page.goto(recordPath);await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toHaveValue('Saved browser sample');
   await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toBeDisabled();await expect(page.getByRole('textbox',{name:'Internal note',exact:true})).toHaveCount(0);
   await page.goto(listPath);await expect(page.getByRole('heading',{name:'Checks',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Create record',exact:true})).toHaveCount(0);
   await page.locator('[data-user-menu="header"]').click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
   await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]')).toBeVisible();await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'User management',exact:true})).toHaveCount(0);
   await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Object types',exact:true}).click();await selectChecks(page);await expect(page.getByRole('button',{name:'Add field',exact:true})).toHaveCount(0);
  });
  await scenario('Designer manages fields without installation administration','designer',async page=>{
   await page.locator('[data-user-menu="header"]').click();await page.getByRole('menuitem',{name:'Settings',exact:true}).click();await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]')).toBeVisible();
   await expect(page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'User management',exact:true})).toHaveCount(0);
   await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Object types',exact:true}).click();await selectChecks(page);await page.getByRole('button',{name:'Add field',exact:true}).click();
   const field=page.getByRole('dialog',{name:'Add field',exact:true});await expect(field).toBeVisible();await field.getByRole('textbox',{name:'Name',exact:true}).fill('Designer note');await field.getByRole('textbox',{name:'Technical name',exact:true}).fill('designer_note');
   await field.getByRole('button',{name:/^Create/}).click();await expect(field).toHaveCount(0);await expect(page.getByRole('button',{name:'Designer note',exact:true})).toBeVisible();
   // A visible new field does not yet mean that definition/record refetch and
   // disabled-button opacity transitions have finished. Audit the settled view.
   await expect.poll(()=>page.locator('thead [data-slot="button"]').evaluateAll(buttons=>buttons.length>0&&buttons.every(button=>!button.disabled&&getComputedStyle(button).opacity==='1'))).toBe(true);

  });
  await scenario('Ordinary user follows all five V1 objects and their Primary chain','user',async page=>{
   for(const [key,{model,record}] of Object.entries(domain)){
    let releaseContext;const contextGate=new Promise(resolve=>{releaseContext=resolve;});
    const holdContext=async route=>{await contextGate;await route.continue();};
    if(key==='tasks')await page.route('**/api/v1/get_primary_chain_context',holdContext);
    try{
    await page.goto(`${baseURL}/w/qa/objects/${model.technicalName}/${record.id}`);
    await expect(page.getByRole('heading',{name:record.keyword,exact:true})).toBeVisible();
    if(key==='tasks'){
     const parent=page.locator('input[id^="primary-"]').last(),group=parent.locator('..');
     await expect(parent).toHaveValue(`${domain.cases.record.keyword} reviewed`);
     await expect(parent).toBeEnabled();await expect(group.locator('button').first()).toBeDisabled();
     await expect(group).toHaveCSS('opacity','1');
     await page.screenshot({path:path.join(artifacts,`${engineName}-primary-context-loading.png`),fullPage:true});
    }
    }finally{releaseContext();if(key==='tasks')await page.unrouteAll({behavior:'wait'});}
    if(['projects','cases','tasks'].includes(key)){
     await page.getByRole('textbox',{name:/^Keyword(?: \*)?$/}).fill(`${record.keyword} reviewed`);
     await page.getByRole('button',{name:/^Save/}).click();
     await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
     assert.equal((await api('get_record',{objectTypeId:model.id,recordId:record.id})).keyword,`${record.keyword} reviewed`);
    }
    await expect(page.locator('#record-link-with')).toBeEnabled();
    await auditPage(page,`${key}-Details`);
    for(const tab of ['Journal','Dossier','Tree']){
     await page.getByRole('tab',{name:tab,exact:true}).click();
     await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
     await auditPage(page,`${key}-${tab}`);
    }
   }
   const chain=await api('get_primary_chain_context',{objectTypeId:domain.tasks.model.id,recordId:domain.tasks.record.id});
   assert.deepEqual(chain.levels.map(l=>l.record?.recordId),['contacts','projects','cases'].map(k=>domain[k].record.id));
  });
  await scenario('Unsaved duplicate and recycle restoration preserve the original','admin',async page=>{
   const original=await api('get_record',{objectTypeId:object.id,recordId:editable.id});
   await page.goto(recordPath);await expect(page.getByRole('button',{name:'Duplicate record',exact:true})).toBeEnabled();
   await page.getByRole('button',{name:'Duplicate record',exact:true}).click();await expect(page).toHaveURL(/\/new\?duplicateFrom=/);
   await expect(page.getByText('Edit this copy before saving. It becomes a new record only when you save it.',{exact:true})).toBeVisible();
   await expect(page).toHaveTitle('Create record · Browser checks · xObject');
   await expect(page.getByRole('button',{name:'Custodians: James Doe (User)',exact:true})).toBeVisible();
   await auditPage(page,'duplicate-draft');
   await page.getByRole('textbox',{name:/^Keyword(?: \*)?$/}).fill('Lifecycle acceptance copy');
   await page.locator('button[type=submit]').click();await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   const copyId=new URL(page.url()).pathname.split('/').at(-1);assert.notEqual(copyId,editable.id);assert.notEqual(copyId,'new');
   assert.equal((await api('get_record',{objectTypeId:object.id,recordId:editable.id})).keyword,original.keyword);
   await page.getByRole('button',{name:'Move to recycle bin',exact:true}).click();
   await page.getByRole('alertdialog').getByRole('button',{name:'Move to recycle bin',exact:true}).click();
   await page.goto(`${baseURL}/w/qa/recycle-bin`);
   await page.getByRole('button',{name:'Checks Lifecycle acceptance copy',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'Lifecycle acceptance copy',exact:true})).toBeVisible();
   await auditPage(page,'recycled-copy');
   await page.getByRole('button',{name:'Restore record',exact:true}).click();
   await page.getByRole('alertdialog').getByRole('button',{name:'Restore record',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'Lifecycle acceptance copy',exact:true})).toHaveCount(0);
   assert.equal((await api('get_record',{objectTypeId:object.id,recordId:copyId})).keyword,'Lifecycle acceptance copy');
   // Closing the dialog precedes list invalidation; audit only after the controls' re-enable transition has started.
   await expect(page.getByRole('button',{name:'Checks Lifecycle acceptance copy',exact:true})).toHaveCount(0);
   await expect(page.getByRole('columnheader').getByRole('button').first()).toBeEnabled();
  });
  await scenario('Mobile record and settings remain usable','admin',async page=>{
   await page.goto(recordPath);await expect(page.getByRole('textbox',{name:/^Keyword(?: \*)?$/})).toBeVisible();
   await page.getByRole('button',{name:'Navigation',exact:true}).click();await expect(page.getByRole('dialog',{name:'Navigation',exact:true})).toBeVisible();await auditPage(page,'Mobile navigation drawer');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Navigation',exact:true})).toBeFocused();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
   await settings(page);await expect(page.getByRole('combobox',{name:'Settings',exact:true})).toBeVisible();
   await page.getByRole('combobox',{name:'Settings',exact:true}).selectOption({label:'Workspace · Object types'});await selectChecks(page);
   await expect(page.getByRole('button',{name:'Internal note',exact:true})).toBeVisible();await page.getByRole('button',{name:'Internal note',exact:true}).click();
   const field=page.getByRole('dialog',{name:'Field attributes',exact:true});await expect(field).toBeVisible();assert.ok(await field.evaluate(el=>el.scrollWidth<=el.clientWidth),'No horizontal field dialog overflow');
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  },{width:390,height:844});
  await scenario('Central Organization details and configurable Family lists share normal record drafts','admin',async page=>{
   let def=await api('get_object_type',{objectTypeId:contact.id});const profile=def.contactProfile;
   const functionId=randomUUID(),functionField=def.fields.find(field=>field.id===profile.fields.function);await api('configure_field',{fieldId:functionField.id,version:functionField.version,required:false,config:{...functionField.config,options:[{id:functionId,active:true,labels:{en:'Customer adviser',de:'Kundenberatung'}}]}});def=await api('get_object_type',{objectTypeId:contact.id});
   const centralPhoneId=randomUUID(),directPhoneId=randomUUID();
   const org=await api('create_record',{objectTypeId:contact.id,values:{contact_kind:organization,company_name:'Central example',phones:[{id:centralPhoneId,value:'+12025550123',contexts:[],preference:1}]}});
   const personKind=profile.kinds.person,individualKind=profile.kinds.individual;
   const membership=(await api('list_relationship_types',{workspaceId:workspace.id})).find(r=>r.id===profile.relationships.contact_person);
   const person=await api('create_record',{objectTypeId:contact.id,values:{contact_kind:personKind,last_name:[{id:randomUUID(),text:'Family example'}],job_title:'Support manager',department:'Operations',function:[functionId],phones:[{id:directPhoneId,value:'+442079460018',contexts:[],preference:1}]},relationships:[{relationshipTypeId:membership.id,version:membership.version,side:'right',targets:[{objectTypeId:contact.id,recordId:org.id}]}]});
   const relative=await api('create_record',{objectTypeId:contact.id,values:{contact_kind:personKind,last_name:[{id:randomUUID(),text:'Relative example'}],job_title:'Account manager',department:'Sales',function:[functionId]}});
   const defaultFamily=def.formLayouts.default.groups.find(group=>group.relationshipList);assert.equal(defaultFamily.labels.en,'Family');assert.equal(defaultFamily.fields.length,4);
   await page.goto(`${baseURL}/w/qa/objects/contacts/${org.id}`);const people=page.getByRole('table',{name:'Contact persons',exact:true});await expect(people.getByRole('columnheader',{name:'Object type',exact:true})).toHaveCount(0);await expect(people.getByText('Support manager',{exact:true})).toBeVisible();await expect(people.getByText('Operations',{exact:true})).toBeVisible();await expect(people.getByText('Customer adviser',{exact:true})).toBeVisible();await people.getByRole('link').first().hover();await expect(people.getByRole('link').first()).toHaveCSS('text-decoration-line','none');
   await page.goto(`${baseURL}/w/qa/objects/contacts/${person.id}`);await page.getByRole('button',{name:'Edit contact',exact:true}).click();
   const inherited=page.locator(`#field-${profile.fields.organization_phones}-${centralPhoneId}`);await expect(inherited).toHaveValue('+1 202 555 0123');await expect(inherited).toBeDisabled();
   await expect(page.locator(`#field-${profile.fields.phones}-${directPhoneId}`)).toHaveValue('+44 20 7946 0018');
   const section=inherited.locator('xpath=ancestor::fieldset[1]');await section.getByRole('button',{name:'Own value',exact:true}).click();await expect(inherited).toBeEnabled();
   await inherited.fill('+49891234567');await inherited.press('Tab');await expect(inherited).toHaveValue('+49 89 1234567');
   const plus=page.getByRole('button',{name:'Choose linked records: Family',exact:true});await plus.click();await page.getByRole('menuitem',{name:'Children',exact:true}).click();
   const dialog=page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]');await dialog.locator('#relationship-picker-search').fill('Relative example');await expect(dialog.getByRole('columnheader',{name:'Job title',exact:true})).toBeVisible();await dialog.getByRole('checkbox',{name:/Relative example/}).check();await dialog.getByRole('button',{name:'Apply selection',exact:true}).click();
   const table=page.getByRole('table',{name:'Family',exact:true});await table.getByRole('link').first().hover();await expect(table.getByRole('link').first()).toHaveCSS('text-decoration-line','none');await expect(table.getByRole('columnheader',{name:'Object type',exact:true})).toHaveCount(0);await expect(table.getByText('Relative example',{exact:true})).toBeVisible();await expect(table.getByText('Account manager',{exact:true})).toBeVisible();await expect(table.getByText('Sales',{exact:true})).toBeVisible();await expect(table.getByText('Customer adviser',{exact:true})).toBeVisible();assert.ok(await table.evaluate((table,notesId)=>Boolean(table.compareDocumentPosition(document.getElementById(`field-${notesId}`))&Node.DOCUMENT_POSITION_FOLLOWING),profile.fields.notes));
   await expect(page.getByText('Changes have not been saved yet.',{exact:true})).toBeVisible();await page.locator('button[type=submit]').click();await expect(page.getByRole('button',{name:'Edit contact',exact:true})).toBeVisible();
   const saved=await api('get_record',{objectTypeId:contact.id,recordId:person.id});assert.equal(saved.organization_phones[0].value,'+49891234567');assert.equal(saved.phones[0].value,'+442079460018');assert.equal((await api('get_record',{objectTypeId:contact.id,recordId:org.id})).phones[0].value,'+12025550123');
   await page.getByRole('button',{name:'Edit contact',exact:true}).click();
   await page.screenshot({path:path.join(artifacts,'central-family-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});await expect(plus).toBeVisible();await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth,undefined,{timeout:3000});await page.screenshot({path:path.join(artifacts,'central-family-mobile.png'),fullPage:true});
   await auditPage(page,'Central Organization and Family list mobile light');
   await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);await page.screenshot({path:path.join(artifacts,'central-family-mobile-dark.png'),fullPage:true});
   await page.setViewportSize({width:1440,height:1000});await settings(page);await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').getByRole('button',{name:'Form designer',exact:true}).click();
   await page.locator('#form-designer-object').click();await page.getByRole('option',{name:'Contacts',exact:true}).click();
   const combined=page.locator('#form-list-contact-family');await expect(combined).toBeChecked();await page.locator('label[for="form-list-contact-family"]').click();await expect(combined).not.toBeChecked();await page.locator('label[for="form-list-contact-family"]').click();await expect(combined).toBeChecked();await page.locator('#form-object-column-contact-family').selectOption('show');await page.locator('[role=dialog][aria-modal=true], [role=dialog][data-slot=dialog-content]').locator('button[type=submit]').click();
   await expect.poll(async()=>(await api('get_object_type',{objectTypeId:contact.id})).formLayouts.default.groups.find(group=>group.relationshipList)?.objectColumn).toBe('show');await page.goto(`${baseURL}/w/qa/objects/contacts/${person.id}`);await page.getByRole('button',{name:'Edit contact',exact:true}).click();
   await expect(table.getByRole('columnheader',{name:'Object type',exact:true})).toBeVisible();
   const configured=await api('get_object_type',{objectTypeId:contact.id});assert.equal(configured.formLayouts.default.groups.find(group=>group.relationshipList).objectColumn,'show');
   await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth,undefined,{timeout:3000});

  });
  await scenario('Contact-person affiliations select Organizations without changing the main Organization','admin',async page=>{
   const p=contact.contactProfile,args={objectTypeId:contact.id},definitions=await api('list_relationship_types',{workspaceId:workspace.id});
   const main=definitions.find(r=>r.id===p.relationships.contact_person),aff=definitions.find(r=>r.id===p.relationships.contact_affiliation);
   const home=await api('create_record',{...args,values:{contact_kind:p.kinds.organization,company_name:'Affiliation household'}});
   const club=await api('create_record',{...args,values:{contact_kind:p.kinds.organization,company_name:'Affiliation test club'}});
   const member=await api('create_record',{...args,values:{contact_kind:p.kinds.person,last_name:[{id:randomUUID(),text:'Affiliation member'}]},relationships:[{relationshipTypeId:main.id,version:main.version,side:'right',targets:[{objectTypeId:contact.id,recordId:home.id}]}]});
   await page.goto(`${baseURL}/w/qa/objects/contacts/${member.id}`);await page.getByRole('button',{name:'Edit contact',exact:true}).click();
   await page.locator(`[id$="${aff.id}-right-choose"]`).click();
   const dialog=page.getByRole('dialog',{name:'Choose Organizations',exact:true});await expect(dialog).toBeVisible();
   await dialog.getByRole('searchbox').fill('Affiliation test club');
   await dialog.getByRole('row').filter({hasText:'Affiliation test club'}).getByRole('checkbox').click();
   await dialog.getByRole('button',{name:'Apply selection',exact:true}).click();
   await page.locator('button[type=submit]').click();
   await expect.poll(async()=>{const list=await api('get_record_relationships',{...args,recordId:member.id});return list.fields.find(f=>f.definition.id===aff.id&&f.side==='right')?.targets.map(r=>r.recordId);}).toEqual([club.id]);
   assert.equal((await api('get_record',{...args,recordId:member.id})).organization_name,'Affiliation household');
   await page.screenshot({path:path.join(artifacts,'contact-person-affiliations-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth);
   await page.screenshot({path:path.join(artifacts,'contact-person-affiliations-mobile.png'),fullPage:true});
  });
  await scenario('Contact lists default to Keyword ascending and retain explicit sorting','admin',async page=>{
   for(const company_name of ['Zulu sorting fixture','Alpha sorting fixture'])await api('create_record',{objectTypeId:contact.id,values:{contact_kind:organization,company_name}});
   const assertOrder=async()=>{
    await expect(page.locator('thead th[aria-sort]').first()).toHaveAttribute('aria-sort','ascending');
    await expect(page.locator('[data-record-row]')).not.toHaveCount(0);
    const labels=await page.locator('[data-record-row]').evaluateAll(rows=>rows.map(row=>row.querySelector('a')?.textContent?.trim()));
    assert.ok(labels.length>=2);assert.ok(labels.every(Boolean));
    assert.deepEqual(labels,[...labels].sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0));
   };
   await page.goto(`${baseURL}/w/qa/objects/contacts`);await assertOrder();
   await page.goto(`${baseURL}/w/qa/objects/contacts?kind=${organization}`);await assertOrder();
   await page.goto(`${baseURL}/w/qa?object=${contact.id}`);await assertOrder();
   await page.goto(`${baseURL}/w/qa/objects/contacts?sort=keyword&direction=desc`);
   await expect(page.locator('thead th[aria-sort]').first()).toHaveAttribute('aria-sort','descending');
  });
  await scenario('Saved Contact overview is compact, actionable and opens the full editor','admin',async page=>{
   const definition=await api('get_object_type',{objectTypeId:contact.id}),p=definition.contactProfile;
   const phoneId=randomUUID(),person=await api('create_record',{objectTypeId:contact.id,values:{contact_kind:p.kinds.individual,first_name:[{id:randomUUID(),text:'Taylor'}],last_name:[{id:randomUUID(),text:'Overview'}],phones:[{id:phoneId,value:'+12025550123',contexts:[],preference:1}],notes:'A **readable** contact note.'}});
   await page.goto(`${baseURL}/w/qa/objects/contacts/${person.id}`);await expect(page.getByRole('heading',{name:person.keyword,exact:true})).toBeVisible();
   const input=page.locator(`#field-${p.fields.phones}-${phoneId}`);await expect(input).toHaveCount(0);
   await expect(page.getByRole('link',{name:'+1 202 555 0123',exact:true})).toHaveAttribute('href','tel:+12025550123');
   await expect(page.getByText('readable',{exact:true})).toBeVisible();
   await expect(page.locator('#record-link-with')).toBeEnabled();await expect(page.locator('#record-link-with')).toHaveCSS('opacity','1');
   await expect(page.locator('[data-record-form-actions]')).toHaveCount(0);await expect(page.getByText('No details entered.',{exact:true})).toHaveCount(0);
   await auditPage(page,'Contact overview desktop');await page.screenshot({path:path.join(artifacts,'contact-overview-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth);await auditPage(page,'Contact overview mobile');await page.screenshot({path:path.join(artifacts,'contact-overview-mobile.png'),fullPage:true});
   await page.getByRole('button',{name:'Edit contact',exact:true}).click();await expect(input).toHaveValue('+1 202 555 0123');await input.fill('+442079460018');await input.press('Tab');
   await expect(page.getByRole('button',{name:'Show overview',exact:true})).toBeDisabled();
   await page.locator('button[type=submit]').click();await expect(page.getByRole('button',{name:'Edit contact',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit contact',exact:true})).toBeFocused();await expect(input).toHaveCount(0);
   assert.equal((await api('get_record',{objectTypeId:contact.id,recordId:person.id})).phones[0].value,'+442079460018');
  });
  await scenario('Phone numbers are readable without dirtying untouched fields or moving the editing cursor','admin',async page=>{
   const field=await api('create_field',{objectTypeId:object.id,technicalName:'telephone',labels:{en:'Telephone'},kind:'phone'});
   const before=await api('get_record',{objectTypeId:object.id,recordId:editable.id});
   await api('update_record',{objectTypeId:object.id,recordId:editable.id,version:before.version,values:{telephone:'+49891234567'}});
   await page.goto(recordPath);
   const input=page.locator(`#field-${field.id}`);
   await expect(input).toHaveValue('+49 89 1234567');
   await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   await input.focus();await input.press('Tab');
   await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   await input.fill('+12025550123');await expect(input).toHaveValue('+12025550123');
   await input.evaluate(el=>el.setSelectionRange(5,5));await input.press('8');
   await expect(input).toHaveValue('+120285550123');assert.equal(await input.evaluate(el=>el.selectionStart),6);
   await input.fill('+12025550123');await input.press('Tab');await expect(input).toHaveValue('+1 202 555 0123');
   await page.locator('button[type=submit]').click();await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   assert.equal((await api('get_record',{objectTypeId:object.id,recordId:editable.id})).telephone,'+12025550123');
   await expect(page.locator('[data-slot=toast]').first()).toBeVisible();
   const closeToast=page.locator('[data-slot=toast-close]').first();
   await expect(closeToast).toHaveAttribute('aria-hidden','true');
   await expect(closeToast).toHaveAttribute('tabindex','-1');
   await page.locator('[data-slot=toast]').first().hover();
   await expect(closeToast).toHaveAttribute('aria-hidden','false');
   await expect(closeToast).toHaveAttribute('tabindex','0');
   await auditPage(page,'Expanded success toast');
   await input.hover();
   await expect(closeToast).toHaveAttribute('aria-hidden','true');
   await expect(closeToast).toHaveAttribute('tabindex','-1');

   await expect.poll(async()=>{const toast=await page.locator('[data-slot=toast]').first().boundingBox(),footer=await page.locator('[data-record-form-actions]').boundingBox();return !!toast&&!!footer&&toast.y+toast.height<=footer.y;}).toBe(true);
   await input.fill('+49891234567');await page.getByRole('button',{name:/^Reset/}).click();
   await expect(input).toHaveValue('+1 202 555 0123');await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   await page.setViewportSize({width:390,height:844});
   await input.fill('+49891234567');await page.locator('button[type=submit]').click();await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   await expect(page.locator('[data-slot=toast]').first()).toBeVisible();
   await expect.poll(async()=>{const toast=await page.locator('[data-slot=toast]').first().boundingBox(),footer=await page.locator('[data-record-form-actions]').boundingBox();return !!toast&&!!footer&&toast.y+toast.height<=footer.y;}).toBe(true);
   await input.fill('+12025550123');await page.getByRole('button',{name:/^Reset/}).click();await expect(input).toHaveValue('+49 89 1234567');
   await settings(page);await expect.poll(async()=>{const toast=await page.locator('[data-slot=toast]').first().boundingBox(),footer=await page.locator('[data-slot=dialog-footer]').boundingBox();return !toast||!!footer&&toast.y+toast.height<=footer.y;}).toBe(true);await page.keyboard.press('Escape');
   await page.setViewportSize({width:1440,height:1000});
   const phoneField=contact.fields.find(f=>f.config.schema==='phone_entries'),entryId=randomUUID();
   const contactBefore=await api('get_record',{objectTypeId:contact.id,recordId:domain.contacts.record.id});
   await api('update_record',{objectTypeId:contact.id,recordId:contactBefore.id,version:contactBefore.version,values:{[phoneField.technicalName]:[{id:entryId,value:'+12025550123',contexts:[],preference:1}]}});
   await page.goto(`${baseURL}/w/qa/objects/contacts/${contactBefore.id}`);await page.getByRole('button',{name:'Edit contact',exact:true}).click();
   const contactInput=page.locator(`#field-${phoneField.id}-${entryId}`);
   await expect(contactInput).toHaveValue('+1 202 555 0123');
   await contactInput.focus();await contactInput.press('Tab');await expect(page.getByText('No unsaved changes.',{exact:true})).toBeVisible();
   await contactInput.fill('+49891234567');await expect(contactInput).toHaveValue('+49891234567');await contactInput.press('Tab');await expect(contactInput).toHaveValue('+49 89 1234567');
   await page.locator('button[type=submit]').click();await expect(page.getByRole('button',{name:'Edit contact',exact:true})).toBeVisible();
   assert.equal((await api('get_record',{objectTypeId:contact.id,recordId:contactBefore.id}))[phoneField.technicalName][0].value,'+49891234567');
  });
  if(!process.env.XOBJECT_TEST_SCENARIO||'Throttled sign-in shows retry guidance'.includes(process.env.XOBJECT_TEST_SCENARIO))await t.test('Throttled sign-in shows retry guidance',async()=>{
   // Isolate this synthetic 429 response from earlier scenarios' shared loopback quota.
   await resetFixtureAuthQuota();
   const context=await browser.newContext({locale:'en-US',colorScheme:'light'});try{
    const page=await context.newPage();
    await page.route('**/api/auth/sign-in/email',route=>route.fulfill({status:429,contentType:'text/plain',body:'Too many requests'}));
    await page.goto(baseURL);await page.getByRole('textbox',{name:'Email',exact:true}).fill('fixture@example.test');await page.getByRole('textbox',{name:'Password',exact:true}).fill('fixture-only');
    await page.getByRole('button',{name:/^Sign in/}).click();await expect(page.getByText('Too many requests. Please wait a moment and try again.',{exact:true})).toBeVisible();
    await auditPage(page,'throttled-login');scenarios.push({name:'Throttled sign-in shows retry guidance',status:'passed'});
   }finally{await context.close();}
  });
  await mkdir(artifacts,{recursive:true,mode:0o700});
  await writeFile(path.join(artifacts,'result.json'),JSON.stringify({status:scenarios.every(s=>s.status==='passed')&&!accessibilityFindings.length?'passed':'failed',accessibilityFindings,scenarioFilter:process.env.XOBJECT_TEST_SCENARIO??null,browser:engineName,fixture:'disposable current PostgreSQL installation; normal account onboarding',scenarios},null,2)+'\n',{mode:0o600});
  console.log(`Browser acceptance evidence: ${artifacts}`);
  assert.deepEqual(accessibilityFindings,[],'No automated WCAG A/AA violations across checked views');
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
