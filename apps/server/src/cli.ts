import { sql } from 'kysely';
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
  default: throw new Error('Expected migrate or create-admin');
}
