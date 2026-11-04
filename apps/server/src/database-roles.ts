import pg from 'pg';

/** DBA-only setup; business definitions remain runtime-owned because the app supports DDL. */
export async function provisionRuntimeRole(operatorURL:string,runtimeURL:string) {
  const admin=new URL(operatorURL),runtime=new URL(runtimeURL);
  if(admin.host!==runtime.host||admin.pathname!==runtime.pathname||admin.username===runtime.username) throw new Error('Operator and runtime must use distinct roles on the same database');
  const role=decodeURIComponent(runtime.username),password=decodeURIComponent(runtime.password);
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(role)||!password)throw new Error('Runtime role name and password are required');
  const pool=new pg.Pool({connectionString:operatorURL});
  const client=await pool.connect();
  const id=(name:string)=>pg.escapeIdentifier(name);
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('xobject:model'))");
    const exists=(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount;
    if(!exists)await client.query(`CREATE ROLE ${id(role)} LOGIN PASSWORD ${pg.escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    else {
      // Never rotate an existing credential as a side effect of initialization.
      const probe=new pg.Pool({connectionString:runtimeURL});
      try {await probe.query('SELECT 1');}finally{await probe.end();}
      await client.query(`ALTER ROLE ${id(role)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    }
    const operatorRole=(await client.query('SELECT current_user AS name')).rows[0].name;
    await client.query(`GRANT ${id(role)} TO ${id(operatorRole)}`);
    await client.query(`GRANT CONNECT ON DATABASE ${id(decodeURIComponent(admin.pathname.slice(1)))} TO ${id(role)}`);
    await client.query(`GRANT USAGE,CREATE ON SCHEMA public TO ${id(role)}`);
    const system=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'sys\\_%' ESCAPE '\\'")).rows;
    for(const {tablename} of system) {
      await client.query(`REVOKE ALL ON TABLE ${id(tablename)} FROM ${id(role)}`);
      const rights=tablename==='sys_schema_version'?'SELECT':['sys_journal','sys_relationship_journal_endpoints'].includes(tablename)?'SELECT,INSERT':'SELECT,INSERT,UPDATE,DELETE,REFERENCES';
      await client.query(`GRANT ${rights} ON TABLE ${id(tablename)} TO ${id(role)}`);
    }
    const tables=(await client.query("SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.state<>'deleted'")).rows;
    for(const {name} of tables)await client.query(`ALTER TABLE ${id(name)} OWNER TO ${id(role)}`);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();await pool.end();}
}
