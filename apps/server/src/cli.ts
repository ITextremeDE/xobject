import { provisionRuntimeRole } from './database-roles.js';
import { sql } from 'kysely';
import { mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { configFromEnvironment } from './config.js';
import { connect, initializeDatabase } from './database.js';

const config = configFromEnvironment();
switch (process.argv[2]) {
  case 'verify-installation': {
    const {verifyInstallation}=await import('./installation.js');
    console.log(JSON.stringify(await verifyInstallation(process.env.OPERATOR_DATABASE_URL??config.databaseURL)));
    break;
  }
  case 'upgrade': {
    if(!process.env.OPERATOR_DATABASE_URL)throw new Error('OPERATOR_DATABASE_URL is required');
    const {upgradeInstallation}=await import('./installation.js');
    console.log(JSON.stringify(await upgradeInstallation(process.env.OPERATOR_DATABASE_URL,config.databaseURL,process.argv.includes('--backup-verified'),process.argv.includes('--writers-stopped'))));
    break;
  }
  case 'initialize':
    await initializeDatabase(process.env.OPERATOR_DATABASE_URL ?? config.databaseURL, config.authSecret, config.baseURL);
    if (process.env.OPERATOR_DATABASE_URL) await provisionRuntimeRole(process.env.OPERATOR_DATABASE_URL,config.databaseURL);
    console.log('Current installation schema ready.');
    break;
  case 'reset-development': {
    const runtimeURL=new URL(config.databaseURL),operatorSource=process.env.OPERATOR_DATABASE_URL;
    if(!process.argv.includes('--confirm-dev-reset')||!operatorSource)throw new Error('Explicit development reset and OPERATOR_DATABASE_URL are required');
    const operatorURL=new URL(operatorSource);
    if(runtimeURL.hostname!=='127.0.0.1'||runtimeURL.port!=='5410'||runtimeURL.pathname!=='/xobject_dev'||operatorURL.host!==runtimeURL.host||operatorURL.pathname!==runtimeURL.pathname)throw new Error('Reset is restricted to the documented local development database');
    operatorURL.pathname='/postgres';const {db,pool}=connect(operatorURL.href);
    try{await pool.query('DROP DATABASE IF EXISTS xobject_dev WITH (FORCE)');await pool.query('CREATE DATABASE xobject_dev');}finally{await db.destroy();if(!pool.ended)await pool.end();}
    await initializeDatabase(operatorSource,config.authSecret,config.baseURL);await provisionRuntimeRole(operatorSource,config.databaseURL);
    console.log('Empty development installation ready. No accounts or business records were created.');break;
  }
  case 'provision-runtime':
    if (!process.env.OPERATOR_DATABASE_URL) throw new Error('OPERATOR_DATABASE_URL is required');
    await provisionRuntimeRole(process.env.OPERATOR_DATABASE_URL,config.databaseURL);
    console.log('Runtime database role ready.');
    break;
  case 'setup':
  case 'create-admin': {
    const {administratorInput,createFirstAdministrator,assertSetupAvailable}=await import('./setup.js');
    await assertSetupAvailable(config.databaseURL);
    await createFirstAdministrator(config.databaseURL,await administratorInput());
    console.log('Initial Administrator created. Sign in with the credentials you selected.');
    break;
  }
  case 'seed-demo': {
    const url = new URL(config.databaseURL);
    if (!process.argv.includes('--confirm-local-demo') || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5410' || url.pathname !== '/xobject_dev') throw new Error('Demo seed requires explicit confirmation and the documented local development database');
    const { db } = connect(config.databaseURL);
    try {
      const count = (await sql<{ count: number }>`SELECT count(*)::integer AS count FROM sys_workspaces`.execute(db)).rows[0].count;
      if (count) throw new Error('Demo seeding requires an empty business database; no data was changed');
      const actor = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = ${process.env.ADMIN_EMAIL ?? ''} AND is_admin AND active`.execute(db)).rows[0];
      if (!actor) throw new Error('ADMIN_EMAIL must identify an existing active Administrator');
      const { seedDemoWorkspaces } = await import('./demo-data.js');
      const result = await seedDemoWorkspaces(db, actor.id);
      await mkdir('.local', { recursive: true, mode: 0o700 });
      await chmod('.local', 0o700);
      const administrator = (await sql<{name:string;email:string}>`SELECT name,email FROM sys_users WHERE id=${actor.id}`.execute(db)).rows[0];
      let installationAdmin: {name:string;email:string;password:string}|undefined;
      try { installationAdmin = JSON.parse(await readFile('.local/installation-admin.json','utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const accounts = [{...administrator, role:'administrator', ...(installationAdmin?.email===administrator.email?{password:installationAdmin.password}:{}), mustChangePassword:false}, ...result.accounts.map(account=>({...account,mustChangePassword:true}))];
      for (const [path, body] of [
        ['.local/demo-accounts.json',JSON.stringify(accounts,null,2)],
        ['.local/demo-accounts.md', '# Local fictional demo accounts\n\nWorkspaces: Demo (`demo`, standard design), ITextreme (`itx`, brand-inspired design). Default language: English.\n\n'+accounts.map(account=>`- ${account.name} — ${account.role}\n  - Email: ${account.email}\n  - ${account.mustChangePassword?'Initial password (change at first sign-in)':'Password'}: ${account.password??'Use the existing Administrator password.'}`).join('\n')+'\n'],
      ]) { await writeFile(path,body,{mode:0o600}); await chmod(path,0o600); }
      for(const dataset of result.workspaces)await writeFile(dataset.workspaceCode==='itx'?'.local/demo-relationships.json':`.local/demo-relationships-${dataset.workspaceCode}.json`,JSON.stringify({version:1,workspaceId:dataset.workspaceId,objects:Object.fromEntries(Object.entries(dataset.objects).map(([name,model])=>[name,model.id])),links:dataset.links},null,2),{mode:0o600});
      await writeFile('.local/demo-workspaces.json',JSON.stringify(result.workspaces.map(({workspaceId,workspaceCode,workspaceName})=>({workspaceId,workspaceCode,workspaceName})),null,2),{mode:0o600});
      console.log('Two fictional demo workspaces created, sharing the same accounts. Each has',Object.keys(result.objects).length,'active objects and',Object.values(result.records).flat().length,'records. Relationships use the application layer.');
    } finally { await db.destroy(); }
    break;
  }
  default: throw new Error('Expected initialize, reset-development, provision-runtime, setup/create-admin or seed-demo');
}
