import {Application} from './domain.js';
import {seedModuleCatalog} from './module-catalog.js';
import {sql} from 'kysely';
import {connect,assertCurrentSchema,schemaDefinition} from './database.js';

/** Maintenance-only verification of the current target; never adapts an older development schema. */
export async function verifyInstallation(databaseURL:string,requireAdministrator=true){
  const {db,pool}=connect(databaseURL);
  try{
    await assertCurrentSchema(pool);
    return await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      const pg=(await sql<{version:number}>`SELECT current_setting('server_version_num')::int AS version`.execute(tx)).rows[0].version;
      if(pg<180000||pg>=190000)throw new Error('This installation requires PostgreSQL major version 18.');
      if((await sql`SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated`.execute(tx)).rows.length)throw new Error('Unvalidated database constraints exist.');
      await sql`SELECT sys_assert_record_identity(workspace_id,object_type_id,record_id) FROM sys_record_identities`.execute(tx);
      const objects=(await sql<{id:string;table_name:string}>`SELECT o.id,w.code||'_'||o.technical_name AS table_name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.state<>'deleted'`.execute(tx)).rows;
      for(const object of objects){
        if((await sql`SELECT 1 FROM ${sql.table(object.table_name)} b LEFT JOIN sys_record_identities r ON r.object_type_id=${object.id}::uuid AND r.record_id=b.id WHERE r.record_id IS NULL LIMIT 1`.execute(tx)).rows.length)throw new Error('Business storage contains an unregistered record.');
      }
      const administrators=Number((await sql<{n:string}>`SELECT count(*) AS n FROM sys_users WHERE active AND is_admin`.execute(tx)).rows[0].n);
      if(requireAdministrator&&!administrators)throw new Error('Initial Administrator setup is incomplete.');
      return {schemaVersion:1,objects:objects.length,records:Number((await sql<{n:string}>`SELECT count(*) AS n FROM sys_record_identities`.execute(tx)).rows[0].n),administrators,integrity:'valid'};
    });
  }finally{await db.destroy();if(!pool.ended)await pool.end();}
}
export async function upgradeInstallation(operatorURL:string,runtimeURL:string,backupVerified:boolean,writersStopped:boolean){
  const operator=new URL(operatorURL),runtime=new URL(runtimeURL);
  if(operator.host!==runtime.host||operator.pathname!==runtime.pathname||operator.username===runtime.username)throw new Error('Use distinct operator/runtime roles on the same database.');
  if(!backupVerified||!writersStopped)throw new Error('An upgrade requires a verified backup and stopped writers.');
  const {db,pool}=connect(operatorURL);
  try{
    const role=decodeURIComponent(new URL(runtimeURL).username);
    const writers=await pool.query('SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename=$1 AND pid<>pg_backend_pid() LIMIT 1',[role]);
    if(writers.rowCount)throw new Error('Stop all application writers before upgrading.');
    const target=await schemaDefinition();
    await db.transaction().execute(async tx=>{
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:installation'))`.execute(tx);
      await sql`SELECT pg_advisory_xact_lock(hashtext('xobject:model'))`.execute(tx);
      const source=(await sql<{version:number;definition_hash:string}>`SELECT version,definition_hash FROM sys_schema_version WHERE singleton FOR UPDATE`.execute(tx)).rows[0];
      if(source?.version===1&&source.definition_hash===target.hash)return;
      // Exact released 1.0.0/1.0.1 and 1.0.2 fingerprints; no development-schema adoption.
      if(source?.version!==1||!['37fe6ee81a1fadc580d6cd7678d1b088a72e7f1f4e5d0810937e9489fd6a921d','1258a98cca87240c1f600ef414567b84be738731044cac929412bc81f1c16e86'].includes(source.definition_hash))throw new Error('No supported released upgrade path exists for this source installation. Use its matching application and recovery backup.');
      if(source.definition_hash==='37fe6ee81a1fadc580d6cd7678d1b088a72e7f1f4e5d0810937e9489fd6a921d'){
      await sql.raw('DROP TRIGGER sys_oauth_access_token_journal ON public.sys_oauth_access_token; DROP TRIGGER sys_oauth_refresh_token_journal ON public.sys_oauth_refresh_token; DROP FUNCTION public.journal_oauth_token_state();').execute(tx);
      await sql.raw(target.oauthJournal).execute(tx);
      }
      await seedModuleCatalog(tx,true);
      await new Application(db).refreshInstalledModuleTemplates(tx);
      await sql`UPDATE sys_schema_version SET definition_hash=${target.hash} WHERE singleton`.execute(tx);
      // Token hashes, consents, sessions and existing audit history are preserved.
    });
    await assertCurrentSchema(pool);
  }finally{await db.destroy();if(!pool.ended)await pool.end();}
  return verifyInstallation(operatorURL);
}
