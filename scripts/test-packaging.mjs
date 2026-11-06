import './test-release-source.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
test('plugin package preserves canonical skills and rejects unsafe endpoints/overwrite',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'xobject-plugin-'));
 try{
  const output=path.join(directory,'plugin');
  const run=(url,out=output)=>execFileSync(process.execPath,['scripts/prepare-openai-plugin.mjs','--url',url,'--output',out],{cwd:root,stdio:'pipe'});
  for(const url of ['http://remote.test/mcp','https://user:secret@example.test/mcp','https://example.test/mcp?token=secret'])assert.throws(()=>run(url));
  run('http://127.0.0.1:4100/mcp');assert.throws(()=>run('http://127.0.0.1:4100/mcp'));
  const manifest=JSON.parse(await readFile(path.join(output,'source-manifest.json'),'utf8'));
  assert.equal(manifest.skills.length,4);
  for(const file of manifest.skills){const bytes=await readFile(new URL(file.path,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);const relative=file.path.replace('apps/server/src/','');assert.deepEqual(await readFile(path.join(output,relative)),bytes);}
  const mcp=JSON.parse(await readFile(path.join(output,'mcp.json'),'utf8'));assert.equal(mcp.mcpServers.xobject.type,'streamable-http');assert.deepEqual(Object.keys(mcp.mcpServers.xobject).sort(),['type','url']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
