import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('generated public pages match canonical sources and keep changelog/roadmap in one place',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../.astro/canonical-sources.json',import.meta.url),'utf8'));
  for(const page of manifest){const source=await readFile(root+page.source,'utf8');assert.equal(page.sha256,createHash('sha256').update(source).digest('hex'),page.source);}
  for(const name of ['docs/PRD.md','docs/self-hosting.md'])assert.ok(manifest.some(page=>page.source===name));
  for(const [name,slug] of [['CHANGELOG.md','changelog'],['ROADMAP.md','roadmap']]){
    assert.equal(manifest.some(page=>page.source===name),Boolean(process.env.XOBJECT_DOCS_VERSION));
    const output=new URL(`../src/content/docs/${slug}.md`,import.meta.url);
    if(process.env.XOBJECT_DOCS_VERSION)await access(output);
    else await assert.rejects(access(output));
  }
  const index=await readFile(new URL('../src/content/docs/documentation-index.md',import.meta.url),'utf8');
  assert.ok(index.includes(process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/changelog/`:'https://xobject.org/changelog/'));
  assert.ok(index.includes(process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/roadmap/`:'https://xobject.org/roadmap/'));
});
