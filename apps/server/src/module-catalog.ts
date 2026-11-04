import {sql} from 'kysely';
import {readFile} from 'node:fs/promises';
import type {Executor} from './database.js';
export const moduleCatalogFile=new URL('./module-catalog.json',import.meta.url);
export async function seedModuleCatalog(tx:Executor){
 const catalog=JSON.parse(await readFile(moduleCatalogFile,'utf8')) as {key:string;labels:Record<string,string>;description:Record<string,string>;available:boolean;position:number;objects:unknown[]}[];
 for(const module of catalog)await sql`INSERT INTO sys_modules(key,labels,description,available,position,objects) VALUES(${module.key},${JSON.stringify(module.labels)}::jsonb,${JSON.stringify(module.description)}::jsonb,${module.available},${module.position},${JSON.stringify(module.objects)}::jsonb)`.execute(tx);
}
