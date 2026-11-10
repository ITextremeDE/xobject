import {Kysely,PostgresDialect,sql,type Transaction} from 'kysely';
import {Pool,types} from 'pg';
import {getMigrations} from 'better-auth/db/migration';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {v7} from 'uuid';
import {authSchemaRevision} from './oauth.js';
import {authOptions} from './auth.js';
import {seedModuleCatalog,moduleCatalogFile} from './module-catalog.js';

// Dynamic definitions are validated at runtime, not represented as compile-time tables.
export type Database = Kysely<Record<string, never>>;
export type Executor = Database | Transaction<Record<string, never>>;

export function connect(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, types: { getTypeParser: (oid: number, format?: 'text' | 'binary') => oid === 1082 && format !== 'binary' ? (value: string) => value : types.getTypeParser(oid, format) } });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
  return { pool, db };
}

const schemaFile=new URL('./schema.sql',import.meta.url);
export async function schemaDefinition(){
 const [base,oauthJournal,catalog]=await Promise.all([readFile(schemaFile,'utf8'),readFile(new URL('./oauth-journal.sql',import.meta.url),'utf8'),readFile(moduleCatalogFile,'utf8')]);
 const source=base+oauthJournal;
 return {source,oauthJournal,hash:createHash('sha256').update(source).update(catalog).update(authSchemaRevision).digest('hex')};
}
export async function assertCurrentSchema(pool:Pool){
 const {hash}=await schemaDefinition();
 const exists=(await pool.query("SELECT to_regclass('public.sys_schema_version') AS name")).rows[0]?.name;
 if(!exists)throw new Error('Initialize an empty database with db:init before starting xObject');
 const current=(await pool.query('SELECT version,definition_hash FROM sys_schema_version WHERE singleton')).rows[0];
 if(current?.version!==1||current.definition_hash!==hash)throw new Error('Database schema does not match this application. Stop writers and use the documented upgrade or matching-image recovery procedure.');
}
/** Install the current model into an empty database; never adopt older development schemas. */
export async function initializeDatabase(connectionString:string,secret:string,baseURL:string){
 const {db,pool}=connect(connectionString),lock=await pool.connect();
 try{
  await lock.query("SELECT pg_advisory_lock(hashtext('xobject:installation'))");
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  if(tables.length){await assertCurrentSchema(pool);return;}
  const {source,hash}=await schemaDefinition();
  const auth=await getMigrations(authOptions(pool,secret,baseURL));const authSchema=await auth.compileMigrations();
  await db.transaction().execute(async tx=>{
   await sql.raw(authSchema).execute(tx);await sql.raw(source).execute(tx);await seedModuleCatalog(tx);
   await sql`INSERT INTO sys_schema_version(singleton,version,definition_hash) VALUES(true,1,${hash})`.execute(tx);
  });
 }finally{try{await lock.query("SELECT pg_advisory_unlock(hashtext('xobject:installation'))");}finally{lock.release();await db.destroy();if(!pool.ended)await pool.end();}}
}

export async function addClassificationFields(tx: Executor, objectTypeId: string, table: string, names = ['type', 'status', 'category']) {
  const fields = [
    { name: 'type', labels: { de: 'Typ', en: 'Type' }, storage: sql`uuid` },
    { name: 'status', labels: { de: 'Status', en: 'Status' }, storage: sql`uuid` },
    { name: 'category', labels: { de: 'Kategorie', en: 'Category' }, storage: sql`uuid[] NOT NULL DEFAULT '{}'::uuid[]` },
  ];
  for (const field of fields.filter(field => names.includes(field.name))) {
    await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN IF NOT EXISTS ${sql.ref(field.name)} ${field.storage}`.execute(tx);
    await sql`INSERT INTO sys_fields (id, object_type_id, technical_name, labels, kind)
      VALUES (${v7()}::uuid, ${objectTypeId}::uuid, ${field.name}, ${JSON.stringify(field.labels)}::jsonb, ${field.name}) ON CONFLICT (object_type_id, technical_name) WHERE state <> 'deleted' DO UPDATE SET labels = EXCLUDED.labels, kind = EXCLUDED.kind`.execute(tx);
  }
}
