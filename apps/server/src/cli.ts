import { sql } from 'kysely';
import { mkdir, writeFile } from 'node:fs/promises';
import { configFromEnvironment } from './config.js';
import { connect, migrate } from './database.js';
import { createAuth } from './auth.js';

const config = configFromEnvironment();
switch (process.argv[2]) {
  case 'migrate':
    await migrate(config.databaseURL, config.authSecret, config.baseURL);
    console.log('Development schema ready.');
    break;
  case 'create-admin': {
    // This isolated provisioning instance is never exposed through HTTP.
    const { pool, db } = connect(config.databaseURL);
    try {
      const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: name } = process.env;
      if (!email || !password || !name) throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME are required');
      const auth = createAuth(pool, config.authSecret, config.baseURL, true);
      const result = await auth.api.signUpEmail({ body: { email, password, name } });
      await sql`UPDATE sys_users SET is_admin = true WHERE id = ${result.user.id}`.execute(db);
      console.log('Administrator created.');
    } finally { await db.destroy(); }
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
      const { seedDemoData } = await import('./demo-data.js');
      const result = await seedDemoData(db, actor.id);
      await mkdir('.local', { recursive: true, mode: 0o700 });
      await writeFile('.local/demo-relationships.json', JSON.stringify({ version: 1, workspaceId: result.workspaceId, objects: Object.fromEntries(Object.entries(result.objects).map(([name, model]) => [name, model.id])), links: result.links }, null, 2), { mode: 0o600 });
      console.log('Fictional demo workspace created:', Object.keys(result.objects).length, 'objects,', Object.values(result.records).flat().length, 'records. Relationship plans are not implemented relationships.');
    } finally { await db.destroy(); }
    break;
  }
  default: throw new Error('Expected migrate, create-admin or seed-demo');
}
