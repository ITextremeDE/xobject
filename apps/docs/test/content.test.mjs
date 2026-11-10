import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('generated public pages match canonical sources and keep changelog/roadmap in one place',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../.astro/canonical-sources.json',import.meta.url),'utf8'));
  for(const page of manifest){const source=await readFile(root+page.source,'utf8');assert.equal(page.sha256,createHash('sha256').update(source).digest('hex'),page.source);}
  for(const name of ['docs/start.md','docs/first-steps.md','docs/PRD.md','docs/self-hosting.md'])assert.ok(manifest.some(page=>page.source===name));
  for(const [name,slug] of [['CHANGELOG.md','changelog'],['ROADMAP.md','roadmap']]){
    assert.equal(manifest.some(page=>page.source===name),Boolean(process.env.XOBJECT_DOCS_VERSION));
    const output=new URL(`../src/content/docs/${slug}.md`,import.meta.url);
    if(process.env.XOBJECT_DOCS_VERSION)await access(output);
    else await assert.rejects(access(output));
  }
  assert.equal(manifest.find(page=>page.slug==='').source,'docs/start.md');
  assert(!manifest.some(page=>page.source==='README.md'),'repository overview is not duplicated as the docs landing page');
  for(const page of manifest){
    const text=await readFile(new URL(`../src/content/docs/${page.slug||'index'}.md`,import.meta.url),'utf8');
    const description=JSON.parse(text.match(/^description: (.+)$/m)[1]);
    assert(description.length>30&&description.length<=185,page.slug);
    assert(!description.includes(']('),'descriptions are plain text');
  }
  const index=await readFile(new URL('../src/content/docs/documentation-index.md',import.meta.url),'utf8');
  assert.ok(index.includes(process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/changelog/`:'https://xobject.org/changelog/'));
  assert.ok(index.includes(process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/roadmap/`:'https://xobject.org/roadmap/'));
});

test('version choices identify one current build and link only to supported documentation origins',async()=>{
  const {versionOptions,releasedVersions}=await import('../src/config/versions.ts');
  assert.equal(versionOptions.filter(option=>option.selected).length,1);
  assert.equal(new Set(releasedVersions).size,releasedVersions.length);
  for(const option of versionOptions)assert.equal(new URL(option.value).origin,'https://docs.xobject.org');
  const selected=versionOptions.find(option=>option.selected);
  assert.equal(selected.value,process.env.XOBJECT_DOCS_VERSION?`https://docs.xobject.org/versions/${process.env.XOBJECT_DOCS_VERSION}/`:'https://docs.xobject.org/');
});
