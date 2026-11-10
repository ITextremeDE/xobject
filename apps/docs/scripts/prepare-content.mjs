import {readFile,writeFile,mkdir,readdir,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),app=fileURLToPath(new URL('../',import.meta.url));
const version=process.env.XOBJECT_DOCS_VERSION,base=version?`/versions/${version}/`:'/';
if(version&&!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('Invalid documentation version');
const sourceRef=process.env.XOBJECT_SOURCE_REF??'main';
if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(sourceRef)||sourceRef.includes('..'))throw Error('Invalid source ref');
async function markdownFiles(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(item=>item.isDirectory()?markdownFiles(path.join(dir,item.name)):item.name.endsWith('.md')?[path.join(dir,item.name)]:[]))).flat();}
const roots={'README.md':'index','CHANGELOG.md':'changelog','ROADMAP.md':'roadmap','CONTRIBUTING.md':'contributing','SECURITY.md':'security','LICENSE':'license'};
const pages=new Map(Object.entries(roots).map(([file,slug])=>[path.join(root,file),slug]));
for(const file of await markdownFiles(path.join(root,'docs'))){const relative=path.relative(path.join(root,'docs'),file).replaceAll(path.sep,'/');pages.set(file,relative==='README.md'?'documentation-index':relative.replace(/\.md$/,'').toLowerCase());}
const target=path.join(app,'src/content/docs');await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
async function rewrite(body,file){
  const chunks=body.split(/(```[\s\S]*?```)/g);
  for(let i=0;i<chunks.length;i+=2){
    const links=[...chunks[i].matchAll(/(!?\[[^\]\n]*\])\(([^)\n]+)\)/g)];
    for(const match of links){
      const raw=match[2];if(/^(?:https?:|mailto:|tel:|#|data:)/.test(raw))continue;
      if(raw.startsWith('/Users/')||raw.startsWith('file:'))throw Error('Local private link in public documentation');
      if(raw.startsWith('/'))continue;
      const [link,...fragment]=raw.split('#'),absolute=path.resolve(path.dirname(file),decodeURIComponent(link));
      const hash=fragment.length?'#'+fragment.join('#'):'';
      let replacement;
      if(!version&&['changelog','roadmap'].includes(pages.get(absolute)))replacement='https://xobject.org/'+pages.get(absolute)+'/'+hash;
      else if(pages.has(absolute))replacement=base+(pages.get(absolute)==='index'?'':pages.get(absolute)+'/')+hash;
      else{
        const relative=path.relative(root,absolute).replaceAll(path.sep,'/');
        if(relative.startsWith('../'))throw Error(`Source link leaves repository: ${path.relative(root,file)}`);
        const info=await stat(absolute);
        replacement=`https://github.com/ITextremeDE/xobject/${info.isDirectory()?'tree':'blob'}/${sourceRef}/${relative}`+hash;
      }
      chunks[i]=chunks[i].replace(match[0],`${match[1]}(${replacement})`);
    }
  }
  return chunks.join('');
}
const manifest=[];
for(const [file,slug] of pages){
  if(!version&&['changelog','roadmap'].includes(slug))continue;
  const source=await readFile(file,'utf8'),relative=path.relative(root,file).replaceAll(path.sep,'/');
  const license=relative==='LICENSE',heading=source.match(/^# (.+)$/m);
  const title=license?'License':heading?.[1].replaceAll('`','')??slug;
  const body=license?'SPDX identifier: `AGPL-3.0-only`. The following is the unchanged project license.\n\n```text\n'+source+'\n```\n':await rewrite(source.replace(/^# .+\r?\n/,''),file);
  const output=path.join(target,`${slug}.md`);await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,`---\ntitle: ${JSON.stringify(title)}\neditUrl: ${JSON.stringify(`https://github.com/ITextremeDE/xobject/edit/${sourceRef}/${relative}`)}\n---\n\n${body}`);
  manifest.push({source:relative,slug:slug==='index'?'':slug,sha256:createHash('sha256').update(source).digest('hex')});
}
await mkdir(path.join(app,'.astro'),{recursive:true});await writeFile(path.join(app,'.astro/canonical-sources.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${manifest.length} documentation pages from canonical repository sources.`);
