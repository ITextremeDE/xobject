import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
const hash=createHash('sha256');
function digest(path:string){for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=resolve(path,entry.name);if(entry.isDirectory())digest(file);else hash.update(relative(import.meta.dirname,file)).update(readFileSync(file));}}
for(const folder of ['src','public','../../packages/contracts/src'])digest(resolve(import.meta.dirname,folder));
for(const file of ['index.html','vite.config.ts','../../package-lock.json'])hash.update(readFileSync(resolve(import.meta.dirname,file)));
const buildId=hash.digest('hex').slice(0,20);
export default defineConfig({ define:{__XOBJECT_BUILD__:JSON.stringify(buildId)}, build: { emptyOutDir: true }, plugins: [react(), tailwindcss(),{name:'xobject-build',transformIndexHtml(html){return html.replace('</head>',`<meta name="xobject-build" content="${buildId}" /></head>`);}}], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } });
