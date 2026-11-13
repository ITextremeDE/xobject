import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

/** The builder and acceptance harness must agree on exactly the served sources. */
export function webBuildId(root:URL = new URL('../',import.meta.url)) {
 const web=fileURLToPath(new URL('apps/web/',root)),hash=createHash('sha256');
 function digest(folder:string){for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=resolve(folder,entry.name);if(entry.isDirectory())digest(file);else hash.update(relative(web,file)).update(readFileSync(file));}}
 for(const folder of ['src','public','../../packages/contracts/src'])digest(resolve(web,folder));
 for(const file of ['index.html','vite.config.ts','../../scripts/web-build-id.ts','../../package-lock.json'])hash.update(readFileSync(resolve(web,file)));
 return hash.digest('hex').slice(0,20);
}
export function assertCurrentWebBuild(root:URL = new URL('../',import.meta.url)) {
 const expected=webBuildId(root);let actual:string|undefined;
 try{actual=readFileSync(new URL('apps/web/dist/index.html',root),'utf8').match(/name="xobject-build" content="([^"]+)"/)?.[1];}catch{}
 if(actual!==expected)throw new Error('Web assets are missing or stale. Build @xobject/contracts and @xobject/web before browser acceptance.');
 return expected;
}
