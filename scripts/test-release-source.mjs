import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {releaseSourceSnapshot,archiveReleaseSource,isPublicSourcePath} from './release-source.mjs';
const root=new URL('../',import.meta.url);
async function put(root,file,content,options){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),content,options);}
function git(root,...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'});}

test('release source uses reviewed commit files and excludes tracked/untracked private recovery artifacts',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'xobject-release-source-'));
 try{
  git(directory,'init','-q');git(directory,'config','user.name','Release test');git(directory,'config','user.email','release@example.test');
  const publicFiles={'.env.example':'SAMPLE=example\n','deploy/selfhost.env.example':'SAMPLE=example\n','README.md':'Reviewed source\n','CODE_OF_CONDUCT.md':'Public community policy\n','package.json':'{}\n','apps/server/src/main.ts':'export const value=1;\n','scripts/xobject':'operator\n'};
  const privateFiles=['deploy/selfhost.env','deploy/selfhost.env.before-restore-20261106T120000Z','deploy/selfhost.env.upgrade.aBc123','deploy/.env.xobject-upgrade.aBc123','docs/recovery/install.env','.local/accounts.json','apps/server/key.pem','docs/database.dump'];
  for(const [file,content] of Object.entries(publicFiles))await put(directory,file,content);
  for(const file of privateFiles)await put(directory,file,'SECRET-FIXTURE-DO-NOT-PACK');
  git(directory,'add','.');git(directory,'commit','-qm','Reviewed fixture');
  await put(directory,'deploy/selfhost.env.before-restore-untracked','SECRET-UNTRACKED-FIXTURE');
  const snapshot=releaseSourceSnapshot(directory);
  assert.equal(snapshot.commit,git(directory,'rev-parse','HEAD').trim());
  assert.deepEqual(snapshot.source.map(item=>item.path).sort(),Object.keys(publicFiles).sort());
  for(const item of snapshot.source)assert.equal(item.sha256,createHash('sha256').update(publicFiles[item.path]).digest('hex'));
  const archive=path.join(directory,'candidate.tar.gz');archiveReleaseSource(directory,snapshot,archive);
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).split('\n').filter(name=>name&&!name.endsWith('/')).sort();assert.deepEqual(names,Object.keys(publicFiles).sort());
  assert.ok(!gunzipSync(await readFile(archive)).includes(Buffer.from('SECRET-')));
  // Archive generation always reads the selected commit, even if a file changes afterwards.
  await put(directory,'README.md','SECRET-UNCOMMITTED-FIXTURE');
  const second=path.join(directory,'second.tar.gz');archiveReleaseSource(directory,snapshot,second);
  assert.equal(execFileSync('tar',['-xOf',second,'README.md'],{encoding:'utf8'}),publicFiles['README.md']);
  assert.throws(()=>releaseSourceSnapshot(directory),/tracked changes/);
  git(directory,'restore','README.md');await put(directory,'docs/new-public-source.md','Unreviewed');
  assert.throws(()=>releaseSourceSnapshot(directory),/untracked public source/);
  for(const file of [...privateFiles,'deploy/install.env.before-restore-1','deploy/.env.xobject-upgrade.abc'])assert.equal(isPublicSourcePath(file),false,file);
  assert.throws(()=>isPublicSourcePath('docs/../.env'),/Unsupported/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('release candidate rejects a dirty checkout before creating artifacts or running builds',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'xobject-release-dirty-'));
 try{
  await mkdir(path.join(directory,'scripts'));
  for(const file of ['prepare-release.mjs','release-source.mjs'])await cp(new URL(`scripts/${file}`,root),path.join(directory,'scripts',file));
  await put(directory,'README.md','Reviewed');git(directory,'init','-q');git(directory,'config','user.name','Release test');git(directory,'config','user.email','release@example.test');git(directory,'add','.');git(directory,'commit','-qm','Reviewed fixture');
  await put(directory,'README.md','Uncommitted');const output=path.join(directory,'artifacts');
  assert.throws(()=>execFileSync(process.execPath,['scripts/prepare-release.mjs','--output',output],{cwd:directory,stdio:'pipe'}),error=>String(error.stderr).includes('Commit or discard tracked changes'));
  await assert.rejects(()=>stat(output),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('restore and upgrade keep recovery configuration private and replacement atomic',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'xobject-operator-recovery-'));
 try{
  const installation=path.join(directory,'installation'),bundle=path.join(directory,'backup'),bin=path.join(directory,'bin'),recovery=path.join(directory,'private-recovery');
  await mkdir(path.join(installation,'scripts'),{recursive:true});await cp(new URL('scripts/xobject',root),path.join(installation,'scripts/xobject'));
  const old='XOBJECT_IMAGE=sha256:fixture\nBETTER_AUTH_SECRET=OLD-FAKE-SECRET\n',next='XOBJECT_IMAGE=sha256:fixture\nBETTER_AUTH_SECRET=NEW-FAKE-SECRET\n';
  const config=path.join(installation,'deploy/selfhost.env');await put(installation,'deploy/selfhost.env',old,{mode:0o600});
  const contents={'install.env':next,'image-id.txt':'sha256:fixture\n','database.dump':'FAKE-DATABASE-ARCHIVE'};
  for(const [file,content] of Object.entries(contents))await put(bundle,file,content,{mode:0o600});
  await put(bundle,'SHA256SUMS',Object.entries(contents).map(([file,content])=>`${createHash('sha256').update(content).digest('hex')}  ${file}`).join('\n')+'\n');
  await put(bin,'docker',`#!/usr/bin/env bash
set -eu
case "$*" in
  *"image inspect"*) [[ "$*" != *"--format"* ]] || printf 'sha256:fixture\\n' ;;
  *"SELECT count(*)"*) printf '0\\n' ;;
  *"pg_restore"*) cat >/dev/null ;;
esac
`,{mode:0o700});
  execFileSync('bash',[path.join(installation,'scripts/xobject'),'restore',bundle,'--confirm-restore'],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,XOBJECT_ENV_FILE:config,XOBJECT_RECOVERY_DIR:recovery},stdio:'pipe'});
  assert.equal(await readFile(config,'utf8'),next);
  assert.deepEqual((await readdir(path.dirname(config))).sort(),['selfhost.env']);
  const retained=await readdir(recovery);assert.equal(retained.length,1);assert.match(retained[0],/^before-restore\.env\./);assert.equal(await readFile(path.join(recovery,retained[0]),'utf8'),old);
  assert.equal((await stat(recovery)).mode&0o777,0o700);assert.equal((await stat(path.join(recovery,retained[0]))).mode&0o777,0o600);
  // Observe the actual upgrade rename without ever invoking real Docker.
  const nativeMv=execFileSync('which',['mv'],{encoding:'utf8'}).trim(),trace=path.join(directory,'rename-source.txt');
  await put(bin,'mv',`#!/usr/bin/env bash
set -eu
case "$1" in *.env.xobject-upgrade.*) printf '%s' "$1" > "$RENAME_TRACE";; esac
exec "${nativeMv}" "$@"
`,{mode:0o700});
  const target='sha256:'+'a'.repeat(64);
  execFileSync('bash',[path.join(installation,'scripts/xobject'),'upgrade',target,path.join(directory,'upgrade-backup')],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,XOBJECT_ENV_FILE:config,XOBJECT_RECOVERY_DIR:recovery,RENAME_TRACE:trace},stdio:'pipe'});
  assert.equal(await readFile(config,'utf8'),next.replace('sha256:fixture',target));
  const replacement=await readFile(trace,'utf8');assert.equal(path.dirname(replacement),path.dirname(config));assert.match(path.basename(replacement),/^\.env\.xobject-upgrade\./);assert.equal(isPublicSourcePath(`deploy/${path.basename(replacement)}`),false);
  assert.deepEqual((await readdir(path.dirname(config))).sort(),['selfhost.env']);
  // The normal default also stays outside the installation tree.
  const defaultHome=path.join(directory,'home');
  const defaultEnv={...process.env,HOME:defaultHome,PATH:`${bin}:${process.env.PATH}`,XOBJECT_ENV_FILE:config};delete defaultEnv.XOBJECT_RECOVERY_DIR;delete defaultEnv.XDG_STATE_HOME;
  execFileSync('bash',[path.join(installation,'scripts/xobject'),'restore',bundle,'--confirm-restore'],{env:defaultEnv,stdio:'pipe'});
  const defaults=await readdir(path.join(defaultHome,'.local/state/xobject/xobject/recovery'));assert.equal(defaults.length,1);assert.match(defaults[0],/^before-restore\.env\./);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('Git and the actual Docker context exclude generated private environment files but retain examples',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'xobject-private-context-'));
 try{
  const context=path.join(directory,'context'),output=path.join(directory,'export');await mkdir(context);
  for(const file of ['.gitignore','.dockerignore'])await cp(new URL(file,root),path.join(context,file));
  await put(context,'Dockerfile','FROM scratch\nCOPY . /context/\n');
  const privateFiles=['.env','deploy/selfhost.env','deploy/selfhost.env.before-restore-20261106','deploy/selfhost.env.upgrade.abc','deploy/.env.xobject-upgrade.abc','.local/recovery/before-restore.env.abc'];
  const examples=['.env.example','deploy/selfhost.env.example'];
  for(const file of privateFiles)await put(context,file,'SECRET-SYNTHETIC-CONTEXT');
  for(const file of examples)await put(context,file,'EXAMPLE-ONLY');
  git(context,'init','-q');
  for(const file of privateFiles)assert.equal(git(context,'check-ignore','--no-index',file).trim(),file);
  for(const file of examples)assert.throws(()=>git(context,'check-ignore','--no-index',file),error=>error.status===1);
  execFileSync('docker',['build','--quiet','--output',`type=local,dest=${output}`,context],{stdio:'pipe',timeout:60000});
  for(const file of privateFiles)await assert.rejects(()=>stat(path.join(output,'context',file)),{code:'ENOENT'});
  for(const file of examples)assert.equal(await readFile(path.join(output,'context',file),'utf8'),'EXAMPLE-ONLY');
 }finally{await rm(directory,{recursive:true,force:true});}
});
