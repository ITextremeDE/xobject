import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
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

test('shared guide illustrations resolve to local Astro assets with unchanged source bytes',async()=>{
  const output=fileURLToPath(new URL('../src/content/docs/',import.meta.url));
  for(const name of ['user-guide','projects-and-tasks','contacts']){
    const source=await readFile(root+`docs/${name}.md`,'utf8');
    const generated=await readFile(path.join(output,`${name}.md`),'utf8');
    const originals=[...source.matchAll(/!\[([^\]]+)\]\(([^)]+)\)/g)];
    const copies=[...generated.matchAll(/!\[([^\]]+)\]\(([^)]+)\)/g)];
    assert(originals.length>0&&originals.length===copies.length,name);
    for(let i=0;i<originals.length;i++){
      assert.equal(copies[i][1],originals[i][1],'accessible alternative text is retained');
      assert(copies[i][2].startsWith('../../assets/generated-guides/'),'image is a build-local Astro asset');
      const original=await readFile(path.resolve(root,'docs',originals[i][2]));
      const copy=await readFile(path.resolve(output,copies[i][2]));
      assert.deepEqual(copy,original,'shared capture is not modified or replaced by a GitHub page URL');
      const name=path.basename(copies[i][2]);
      const base=process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/`:'/';
      assert(generated.includes(`](${base}guide-images/${name})`),'full-size link stays inside this documentation version');
      assert.deepEqual(await readFile(new URL(`../public/guide-images/${name}`,import.meta.url)),original,'full-size source remains unchanged');
    }
  }
});

test('the documented mjs API example is valid executable JavaScript',async()=>{
  const source=await readFile(root+'docs/api.md','utf8');
  const example=source.split('ignored `.local/api-example.mjs`')[1]?.match(/```js\n([\s\S]*?)\n```/)?.[1];
  assert(example,'the source-checkout example must match its .mjs instructions');
  execFileSync(process.execPath,['--check','--input-type=module'],{input:example,encoding:'utf8'});
});

test('version choices identify one current build and link only to supported documentation origins',async()=>{
  const {versionOptions,releasedVersions}=await import('../src/config/versions.ts');
  assert.equal(versionOptions.filter(option=>option.selected).length,1);
  assert.equal(new Set(releasedVersions).size,releasedVersions.length);
  for(const option of versionOptions)assert.equal(new URL(option.value).origin,'https://docs.xobject.org');
  const selected=versionOptions.find(option=>option.selected);
  assert.equal(selected.value,process.env.XOBJECT_DOCS_VERSION?`https://docs.xobject.org/versions/${process.env.XOBJECT_DOCS_VERSION}/`:'https://docs.xobject.org/');
});
