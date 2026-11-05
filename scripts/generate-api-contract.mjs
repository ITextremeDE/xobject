import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import {createHash} from 'node:crypto';
import {schemas,API_VERSION} from '@xobject/contracts';
import {z} from 'zod';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=JSON.parse(execFileSync(process.execPath,[root+'node_modules/typescript-json-schema/bin/typescript-json-schema',root+'packages/contracts/tsconfig.json','Outputs','--required'],{cwd:root,maxBuffer:5*1024*1024}).toString());
// Public schema identities must be portable across developer/CI paths and valid OpenAPI keys.
const names=new Map(),used=new Set();
for(const raw of Object.keys(output.definitions??{})){
 const portable=raw.replace(/import\("([^"]+)"[^)]*\)\./g,(_,path)=>{const module=relative(root+'packages/contracts/src',path).replace(/\\/g,'/').replace(/\.ts$/,'');return module==='index'?'':module+'.';});
 const base=portable.replace(/[^A-Za-z0-9._-]+/g,'_');let name=base;
 if(used.has(name))name=base+'_'+createHash('sha256').update(portable).digest('hex').slice(0,10);
 if(used.has(name))throw Error('Duplicate portable schema identity');used.add(name);names.set(raw,name);
}
function ref(value){
 if(Array.isArray(value))return value.map(ref);if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,child])=>{
  if(key==='$ref'){
   const raw=decodeURIComponent(child.slice('#/definitions/'.length)).replaceAll('~1','/').replaceAll('~0','~');
   if(!child.startsWith('#/definitions/')||!names.has(raw))throw Error('Unresolved response schema reference');
   return [key,'#/components/schemas/'+names.get(raw)];
  }
  return [key,ref(child)];
 }));
}
const definitions=Object.fromEntries(Object.entries(output.definitions??{}).map(([name,value])=>[names.get(name),ref(value)])),paths={};
const management=new Set(['list_api_credentials','create_api_credential','revoke_api_credential','revoke_all_api_credentials','get_account_security','change_password','revoke_session','revoke_other_sessions']);
for(const [name,input] of Object.entries(schemas)){
 if(!output.properties[name])throw Error(`Missing response contract for ${name}`);
 const request=z.toJSONSchema(input,{target:'draft-7',io:'input'});delete request.$schema;
 definitions[`Input_${name}`]=request;
 paths[`/api/v1/${name}`]={post:{operationId:name,summary:name.replaceAll('_',' '),security:management.has(name)?[{sessionCookie:[]}]:[{bearerAuth:[]},{sessionCookie:[]}],parameters:[{name:'X-XObject-API-Version',in:'header',required:false,schema:{type:'string',const:'1'}},{name:'X-XObject-Request',in:'header',required:false,schema:{type:'string',const:'1'},description:'Required for cookie-authenticated requests.'}],requestBody:{required:true,content:{'application/json':{schema:{$ref:`#/components/schemas/Input_${name}`}}}},responses:{'200':{description:'Operation-specific result. Additional response fields may be introduced.',headers:{'X-XObject-API-Version':{schema:{type:'string',const:API_VERSION}}},content:{'application/json':{schema:ref(output.properties[name])}}},...Object.fromEntries([400,401,403,404,409,429,500].map(status=>[String(status),{description:({400:'Invalid input',401:'Authentication required',403:'Forbidden',404:'Not found',409:'Conflict',429:'Rate limit',500:'Internal server error'})[status],content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}}]))}}};
}
definitions.ApiError={type:'object',required:['error','code'],properties:{error:{type:'string'},code:{type:'string'},details:{type:'object',properties:{code:{type:'string'},fieldId:{type:'string'},context:{type:'string'}}},issues:{type:'array',items:{type:'object'}}}};
const contract={openapi:'3.1.0',info:{title:'xObject API',version:API_VERSION,description:'User-bound REST operations. MCP exposes the same named operations and shared validation. Authorization and field visibility are evaluated for each call; schema presence grants no permission.'},servers:[{url:'/'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'opaque xObject access token'},sessionCookie:{type:'apiKey',in:'cookie',name:'better-auth.session_token',description:'The browser obtains its session cookie through /api/auth/sign-in/email. HTTPS uses the secure cookie prefix. CSRF headers apply to POST operations; same-origin checks apply.'}},schemas:definitions}};
const text=JSON.stringify(contract,null,2)+'\n',path=root+'packages/contracts/api-v1.openapi.json';
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==text)throw Error('API contract drift: run npm run api:generate and review the generated contract.');}
else await writeFile(path,text);
console.log(`${Object.keys(paths).length} operations with input/output schemas; API ${API_VERSION}${process.argv.includes('--check')?' verified':' generated'}.`);
