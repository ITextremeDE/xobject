import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const base=process.env.XOBJECT_DOCS_VERSION?`/versions/${process.env.XOBJECT_DOCS_VERSION}/`:'/';
async function files(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(item=>item.isDirectory()?files(path.join(dir,item.name)):item.name.endsWith('.html')?[path.join(dir,item.name)]:[]))).flat();}
const pages=await files(root),manifest=JSON.parse(await readFile(new URL('../.astro/canonical-sources.json',import.meta.url),'utf8'));
if(pages.length<manifest.length)throw Error('Documentation build is incomplete');
const errors=[],cache=new Map();let checked=0;
for(const file of pages){
  const html=await readFile(file,'utf8'),relative=path.relative(root,file).replaceAll(path.sep,'/'),pageURL=new URL(base+relative.replace(/index\.html$/,''),'https://docs.xobject.org');
  for(const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
    const href=match[1].replaceAll('&amp;','&');
    if(/^(?:mailto:|tel:|data:|javascript:)/.test(href))continue;
    const url=new URL(href,pageURL);if(url.origin!==pageURL.origin)continue;
    const decoded=decodeURIComponent(url.pathname);
    // Explicit published snapshot URLs point to separate release artifacts, not this build.
    // Relative internal links must still remain inside the selected version and be checked.
    const snapshotBase=decoded.match(/^\/versions\/\d+\.\d+\.\d+\//)?.[0];
    if(href.startsWith('https://docs.xobject.org/')&&snapshotBase&&snapshotBase!==base)continue;
    if(base!=='/'&&decoded==='/')continue; // Explicit link to current documentation from archived version guidance.
    if(!decoded.startsWith(base)){errors.push(`${relative}: link leaves documentation version: ${href}`);continue;}
    let target=decoded===base+'404/'?path.join(root,'404.html'):path.join(root,decoded.slice(base.length));
    try{const info=await stat(target);if(info.isDirectory())target=path.join(target,'index.html');await stat(target);}catch{errors.push(`${relative}: missing ${href}`);continue;}
    checked++;
    if(url.hash&&target.endsWith('.html')){
      let ids=cache.get(target);if(!ids){ids=new Set([...((await readFile(target,'utf8')).matchAll(/\bid="([^"]+)"/g))].map(item=>item[1]));cache.set(target,ids);}
      if(!ids.has(decodeURIComponent(url.hash.slice(1))))errors.push(`${relative}: missing anchor ${href}`);
    }
  }
}
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exit(1);}
console.log(`Checked ${pages.length} built pages and ${checked} local links/assets/anchors (${base}).`);
