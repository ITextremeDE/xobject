import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('snapshot links target separate artifacts while local links retain strict validation',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'xobject-doc-links-'));
  try{
    for(const dir of ['scripts','dist','.astro'])await mkdir(path.join(root,dir));
    const script=path.join(root,'scripts/check-build.mjs');
    await copyFile(new URL('../scripts/check-build.mjs',import.meta.url),script);
    await writeFile(path.join(root,'.astro/canonical-sources.json'),'[{}]');
    const check=async(html,version='')=>{
      await writeFile(path.join(root,'dist/index.html'),html);
      return spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,XOBJECT_DOCS_VERSION:version}});
    };
    const published='<a href="https://docs.xobject.org/versions/1.0.1/api/">Released API</a>';
    for(const version of ['', '0.0.0-unreleased']){
      const result=await check(published,version);
      assert.equal(result.status,0,result.stderr);
    }
    assert.notEqual((await check('<a href="missing/">Missing page</a>')).status,0);
    assert.notEqual((await check('<a href="/versions/1.0.1/api/">Wrong version</a>','0.0.0-unreleased')).status,0);
    assert.notEqual((await check(published,'1.0.1')).status,0,'same-version absolute links must be checked locally');
    assert.notEqual((await check('<a href="#missing">Missing anchor</a>')).status,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
