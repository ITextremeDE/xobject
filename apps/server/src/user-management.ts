import { sql } from 'kysely';
import { v7 } from 'uuid';
import type { Executor } from './database.js';
import type { ManagedUser, Inputs } from '@xobject/contracts';
import type { ConfigurationJournal } from './workspace-configuration.js';
import { passwordCrypto } from './auth.js';
import { AppError } from './errors.js';
export async function managedUsers(tx: Executor): Promise<ManagedUser[]> {
  return (await sql<ManagedUser>`SELECT id, name, email, is_admin AS "isAdmin", active, must_change_password AS "mustChangePassword", management_version AS version FROM sys_users ORDER BY name, id`.execute(tx)).rows;
}
export async function createUser(tx: Executor, args: Inputs['create_user'], journal: ConfigurationJournal) {
  const id = v7(), change = v7(), hash = await passwordCrypto.hash(args.initialPassword);
  await sql`INSERT INTO sys_users (id, name, email, email_verified, created_at, updated_at, is_admin, active, must_change_password) VALUES (${id}, ${args.name}, ${args.email.toLowerCase()}, false, now(), now(), false, true, true)`.execute(tx);
  await sql`INSERT INTO sys_accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (${v7()}, ${id}, ${id}, 'credential', ${hash}, now(), now())`.execute(tx);
  for (const [key, value] of Object.entries({ name: args.name, email: args.email.toLowerCase(), active: true, is_admin: false, must_change_password: true })) await journal('user', id, change, key, null, value);
  return (await managedUsers(tx)).find(item => item.id === id)!;
}
export async function configureUser(tx: Executor, args: Inputs['configure_user'], actor: string, journal: ConfigurationJournal) {
  const previous = (await managedUsers(tx)).find(item => item.id === args.userId);
  if (!previous) throw new AppError(404, 'User not found');
  if (previous.version !== args.version) throw new AppError(409, 'User version conflict');
  if (actor === args.userId && (!args.active || !args.isAdmin)) throw new AppError(400, 'Cannot remove own Administrator access');
  if (previous.isAdmin && previous.active && (!args.isAdmin || !args.active) && !(await sql`SELECT id FROM sys_users WHERE is_admin AND active AND id <> ${args.userId} LIMIT 1`.execute(tx)).rows.length) throw new AppError(400, 'Last active Administrator must remain');
  const changes = [{ key: 'name', before: previous.name, after: args.name }, { key: 'is_admin', before: previous.isAdmin, after: args.isAdmin }, { key: 'active', before: previous.active, after: args.active }].filter(item => item.before !== item.after);
  if (changes.length) {
    const change = v7();
    await sql`UPDATE sys_users SET name = ${args.name}, active = ${args.active}, is_admin = ${args.isAdmin}, management_version = management_version + 1, updated_at = now() WHERE id = ${args.userId}`.execute(tx);
    for (const item of changes) await journal('user', args.userId, change, item.key, item.before, item.after);
    if (!args.active) {
      const sessions = (await sql<{ id: string }>`DELETE FROM sys_sessions WHERE user_id = ${args.userId} RETURNING id`.execute(tx)).rows;
      for (const session of sessions) await journal('session', session.id, change, 'revoked', false, true);
    }
  }
  return (await managedUsers(tx)).find(item => item.id === args.userId)!;
}
