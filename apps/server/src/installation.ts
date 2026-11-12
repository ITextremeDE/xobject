import {v7} from 'uuid';
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
      // Exact released 1.0.0–1.3.0 fingerprints; no development-schema adoption.
      if(source?.version!==1||!['37fe6ee81a1fadc580d6cd7678d1b088a72e7f1f4e5d0810937e9489fd6a921d','1258a98cca87240c1f600ef414567b84be738731044cac929412bc81f1c16e86','c90239c3007922f096bd22cd4dadeeed35ea94c61182853f05f1883dd17a6b21','b819eeb2cecc2c7cd9a25065aa838b1cbfde8b67651dfd4959703ec6927063ab','4b50eb80a34a503460f079e6e84ad0f14a1983829771660f3c9782e69f7c0b19'].includes(source.definition_hash))throw new Error('No supported released upgrade path exists for this source installation. Use its matching application and recovery backup.');
      if(source.definition_hash==='37fe6ee81a1fadc580d6cd7678d1b088a72e7f1f4e5d0810937e9489fd6a921d'){
      await sql.raw('DROP TRIGGER sys_oauth_access_token_journal ON public.sys_oauth_access_token; DROP TRIGGER sys_oauth_refresh_token_journal ON public.sys_oauth_refresh_token; DROP FUNCTION public.journal_oauth_token_state();').execute(tx);
      await sql.raw(target.oauthJournal).execute(tx);
      }
      if(source.definition_hash==='b819eeb2cecc2c7cd9a25065aa838b1cbfde8b67651dfd4959703ec6927063ab'){
        // Retire the unused AP-only register as an ordinary field tombstone. Immutable history keeps its field identity.
        const retiredFields=(await sql<{id:string;object_type_id:string;workspace_id:string;state:string}>`SELECT f.id,f.object_type_id,b.workspace_id,f.state FROM sys_fields f JOIN sys_module_field_bindings b ON b.field_id=f.id WHERE b.object_key='contact' AND b.field_key='organization_commercial_register'`.execute(tx)).rows;
        const retired=retiredFields.map(f=>f.id);
        if(retired.length){
          if((await sql`SELECT 1 FROM sys_contact_field_overrides WHERE field_id=ANY(${retired}::uuid[]) AND value<>'null'::jsonb LIMIT 1`.execute(tx)).rows.length)throw new Error('Contact-person register exceptions must be resolved before upgrading. No data was changed.');
          await sql`DELETE FROM sys_contact_field_overrides WHERE field_id=ANY(${retired}::uuid[])`.execute(tx);
          await sql`DELETE FROM sys_module_field_contributions WHERE field_id=ANY(${retired}::uuid[])`.execute(tx);
          await sql`DELETE FROM sys_module_field_bindings WHERE field_id=ANY(${retired}::uuid[])`.execute(tx);
          await sql`UPDATE sys_fields SET state='deleted',version=version+1 WHERE id=ANY(${retired}::uuid[])`.execute(tx);
          const actor=(await sql<{id:string}>`SELECT id FROM sys_users WHERE is_admin AND active ORDER BY created_at,id LIMIT 1`.execute(tx)).rows[0]?.id;
          if(!actor)throw new Error('Contact-field retirement requires an active Administrator');
          for(const field of retiredFields)await sql`INSERT INTO sys_journal(id,change_id,workspace_id,object_type_id,entity_kind,entity_id,field_id,field_key,old_value,new_value,actor_id) VALUES(${v7()}::uuid,${v7()}::uuid,${field.workspace_id}::uuid,${field.object_type_id}::uuid,'field',${field.id}::uuid,${field.id}::uuid,'state',${JSON.stringify(field.state)}::jsonb,'"deleted"'::jsonb,${actor})`.execute(tx);
        }
        await sql.raw("ALTER TABLE public.sys_contact_field_overrides DROP CONSTRAINT sys_contact_field_overrides_value_check; ALTER TABLE public.sys_contact_field_overrides ADD CONSTRAINT sys_contact_field_overrides_value_check CHECK(jsonb_typeof(value) IN ('string','array','null'))").execute(tx);
      }else if(source.definition_hash!=='4b50eb80a34a503460f079e6e84ad0f14a1983829771660f3c9782e69f7c0b19')await sql.raw(target.contactInheritance).execute(tx);
      if((await sql`SELECT 1 FROM pg_roles WHERE rolname=${role}`.execute(tx)).rows.length)await sql`GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES ON TABLE sys_contact_field_overrides TO ${sql.id(role)}`.execute(tx);
      // Type is workspace-owned classification, not a supplied Contact-profile purpose.
      await sql`DELETE FROM sys_module_field_bindings b USING sys_fields f WHERE b.field_id=f.id AND b.object_key='contact' AND b.field_key='contact_type' AND f.technical_name='type' AND f.kind='type'`.execute(tx);
      await sql.raw(target.recordCreationRequests).execute(tx);
      if((await sql`SELECT 1 FROM pg_roles WHERE rolname=${role}`.execute(tx)).rows.length)await sql`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE sys_record_creation_requests TO ${sql.id(role)}`.execute(tx);
      await seedModuleCatalog(tx,true);
      await new Application(db).refreshInstalledModuleTemplates(tx);
      await sql`UPDATE sys_schema_version SET definition_hash=${target.hash} WHERE singleton`.execute(tx);
      // Token hashes, consents, sessions and existing audit history are preserved.
    });
    await assertCurrentSchema(pool);
  }finally{await db.destroy();if(!pool.ended)await pool.end();}
  return verifyInstallation(operatorURL);
}
