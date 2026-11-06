import {mkdir,readFile,writeFile,readdir,lstat,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--url')||!args.includes('--output'))throw Error('Usage: node scripts/prepare-openai-plugin.mjs --url HTTPS_MCP_URL --output NEW_DIRECTORY [--version SEMVER]');
const endpoint=new URL(option('--url')),output=path.resolve(option('--output')),version=args.includes('--version')?option('--version'):'0.0.0-unreleased';
if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/mcp'||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))))throw Error('Use an HTTPS /mcp URL without credentials/query, or HTTP loopback.');
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('Invalid plugin version');
await mkdir(path.dirname(output),{recursive:true});await mkdir(output,{mode:0o700});
const manifest={$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:'xobject',version,description:'Work with connected business data using the current xObject user permissions.',author:{name:'Jürgen Schadek',url:'https://itextreme.de'},homepage:'https://xobject.org',repository:'https://github.com/ITextremeDE/xobject',license:'AGPL-3.0-only',extensions:{'com.openai':{onboardingSkill:'./skills/xobject-foundation/SKILL.md',interface:{displayName:'xObject',shortDescription:'Connected business data with your current permissions.',developerName:'ITextreme / Jürgen Schadek',capabilities:['Read','Write'],websiteURL:'https://xobject.org'}}}};
const mcp={$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{xobject:{type:'streamable-http',url:endpoint.href}}};
await writeFile(path.join(output,'plugin.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(path.join(output,'mcp.json'),JSON.stringify(mcp,null,2)+'\n');
const sources=[];
async function copySkill(source,target){await mkdir(target,{recursive:true});for(const entry of await readdir(source,{withFileTypes:true})){const from=path.join(source,entry.name),to=path.join(target,entry.name),info=await lstat(from);if(info.isSymbolicLink())throw Error('Skill symlinks are not packaged');if(info.isDirectory())await copySkill(from,to);else if(info.isFile()){await copyFile(from,to);sources.push({path:path.relative(root,from).replaceAll(path.sep,'/'),sha256:createHash('sha256').update(await readFile(from)).digest('hex')});}}}
for(const entry of await readdir(path.join(root,'apps/server/src/skills'),{withFileTypes:true})){if(!entry.isDirectory())continue;const target=path.join(output,'skills',entry.name);await copySkill(path.join(root,'apps/server/src/skills',entry.name),target);await mkdir(path.join(target,'agents'),{recursive:true});await writeFile(path.join(target,'agents/openai.yaml'),`dependencies:\n  tools:\n    - type: "mcp"\n      value: "xobject"\n      description: "Use the current user's xObject workspace and record permissions"\n      transport: "streamable_http"\n      url: ${JSON.stringify(endpoint.href)}\n`);}
for(const file of ['LICENSE','NOTICE'])await copyFile(path.join(root,file),path.join(output,file));
await writeFile(path.join(output,'source-manifest.json'),JSON.stringify({version,skills:sources},null,2)+'\n');
console.log(`Prepared local xObject plugin (${sources.length} canonical skill files). No installation or submission performed.`);
