import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('generated public pages match canonical sources and keep changelog/roadmap in one place',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../.astro/canonical-sources.json',import.meta.url),'utf8'));
  for(const page of manifest){const source=await readFile(root+page.source,'utf8');assert.equal(page.sha256,createHash('sha256').update(source).digest('hex'),page.source);}
  for(const name of ['CHANGELOG.md','ROADMAP.md','docs/PRD.md','docs/self-hosting.md'])assert.ok(manifest.some(page=>page.source===name));
});
