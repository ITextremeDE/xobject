import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {webBuildId,assertCurrentWebBuild} from './web-build-id.ts';

test('browser acceptance rejects missing/stale assets before starting its infrastructure',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'xobject-build-id-')),root=pathToFileURL(directory+'/');
 try{
  for(const folder of ['apps/web/src','apps/web/public','apps/web/dist','packages/contracts/src','scripts'])await mkdir(join(directory,folder),{recursive:true});
  for(const file of ['apps/web/index.html','apps/web/vite.config.ts','scripts/web-build-id.ts','package-lock.json'])await writeFile(join(directory,file),'fixture');
  assert.throws(()=>assertCurrentWebBuild(root),/missing or stale/);
  const id=webBuildId(root);await writeFile(join(directory,'apps/web/dist/index.html'),`<meta name="xobject-build" content="${id}">`);
  assert.equal(assertCurrentWebBuild(root),id);
  await writeFile(join(directory,'packages/contracts/src/index.ts'),'changed contract');assert.throws(()=>assertCurrentWebBuild(root),/missing or stale/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
