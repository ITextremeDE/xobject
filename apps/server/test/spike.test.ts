import { after, before, test } from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { sql } from 'kysely';
import { Client as PgClient } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildServer } from '../src/server.js';
import { migrate } from '../src/database.js';
import { createAuth } from '../src/auth.js';
import { moveClassificationOption, type ClassificationRules } from '@xobject/contracts';
import type { Operation } from '../src/domain.js';

process.env.LOG_LEVEL ??= 'silent';
const exec = promisify(execFile);
const container = `xobject-spike-test-${randomUUID()}`;
const secret = randomBytes(48).toString('base64url');
const baseURL = 'http://127.0.0.1:4100';
let runtime: ReturnType<typeof buildServer>;
let adminCookie: string;
let userCookie: string;
let adminId: string;
let client: Client;
let databaseURL: string;

async function login(email: string, password: string) {
  const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-in/email',
    headers: { host: '127.0.0.1:4100', origin: baseURL }, payload: { email, password } });
  assert.equal(response.statusCode, 200, response.body);
  return response.cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function api(operation: Operation, payload: unknown, cookie = adminCookie) {
  return runtime.app.inject({ method: 'POST', url: `/api/v1/${operation}`,
    headers: { host: '127.0.0.1:4100', cookie, 'x-xobject-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
}
async function ok(operation: Operation, payload: unknown) {
  const response = await api(operation, payload);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
async function tool(operation: Operation, args: Record<string, unknown>) {
  const result = await client.callTool({ name: operation, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return JSON.parse((result.content as { type: string; text: string }[])[0].text);
}

before(async () => {
  // Real, disposable PostgreSQL. No connection to existing user databases.
  await exec('docker', ['run', '--detach', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=xobject_test_only', '-e', 'POSTGRES_DB=xobject_test',
    '-p', '127.0.0.1::5432', 'postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5'], { timeout: 120000 });
  const mapping = (await exec('docker', ['port', container, '5432/tcp'])).stdout.trim();
  databaseURL = `postgres://postgres:xobject_test_only@${mapping}/xobject_test`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    // The image's temporary bootstrap server accepts local socket connections.
    // Wait for the final server using the actual published TCP endpoint instead.
    const probe = new PgClient({ connectionString: databaseURL, connectionTimeoutMillis: 1000 });
    try { await probe.connect(); await probe.query('SELECT 1'); ready = true; break; }
    catch { await setTimeout(250); }
    finally { await probe.end().catch(() => {}); }
  }
  assert.ok(ready, 'Temporary PostgreSQL must accept SQL over its published TCP endpoint');
  await migrate(databaseURL, secret, baseURL);
  await migrate(databaseURL, secret, baseURL); // Explicit migration is repeatable.
  runtime = buildServer({ databaseURL, authSecret: secret, baseURL });
  // Provisioning has its own pool and is never an HTTP endpoint.
  const { Pool } = await import('pg');
  const provisionPool = new Pool({ connectionString: databaseURL });
  const localAuth = createAuth(provisionPool, secret, baseURL, true);
  try {
    const admin = await localAuth.api.signUpEmail({ body: { email: 'admin@example.test', name: 'Test Administrator', password: 'test-password-administrator' } });
    adminId = admin.user.id;
    await sql`UPDATE sys_users SET is_admin = true WHERE id = ${adminId}`.execute(runtime.db);
    await localAuth.api.signUpEmail({ body: { email: 'user@example.test', name: 'Test User', password: 'test-password-regular-user' } });
  } finally { await provisionPool.end(); }
  adminCookie = await login('admin@example.test', 'test-password-administrator');
  userCookie = await login('user@example.test', 'test-password-regular-user');
  // Use the real MCP client and HTTP transport against Fastify's HTTP injection.
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseURL), {
    requestInit: { headers: { cookie: adminCookie, 'x-xobject-request': '1' } },
    fetch: async (url, init) => {
      const req = new Request(url, init);
      const response = await runtime.app.inject({ method: req.method as 'POST', url: new URL(req.url).pathname,
        headers: { ...Object.fromEntries(req.headers), host: '127.0.0.1:4100' },
        ...(req.method === 'POST' ? { payload: await req.text() } : {}) });
      return new Response(response.body || null, { status: response.statusCode, headers: response.headers as Record<string, string> });
    },
  });
  client = new Client({ name: 'xobject-acceptance', version: '0.0.0' });
  await client.connect(transport);
}, { timeout: 180000 });

after(async () => {
  if (client) await client.close();
  if (runtime) await runtime.app.close();
  await exec('docker', ['rm', '--force', container]).catch(() => {});
});

test('credentials and sessions are persisted in PostgreSQL; public signup stays disabled', async () => {
  const credentials = await sql<{ password: string }>`SELECT password FROM sys_accounts WHERE provider_id = 'credential'`.execute(runtime.db);
  assert.equal(credentials.rows.length, 2);
  assert.ok(credentials.rows.every(r => r.password && !r.password.includes('test-password')));
  const sessions = await sql`SELECT id FROM sys_sessions`.execute(runtime.db);
  assert.ok(sessions.rows.length >= 2);
  const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-up/email',
    headers: { host: '127.0.0.1:4100', origin: baseURL },
    payload: { name: 'Unexpected user', email: 'stranger@example.test', password: 'test-password-stranger' } });
  assert.notEqual(response.statusCode, 200);
});

test('API and real MCP share definitions, data, UUIDv7 identities and per-field journal', async () => {
  const ws = await ok('create_workspace', { name: 'ITextreme', code: 'itx' });
  const type = await tool('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Vehicles' } });
  assert.equal(type.tableName, 'itx_vehicles');
  assert.equal(type.id[14], '7');
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', labels: { en: 'Registration' } });
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Delivery van', values: { registration: 'ITX 1' } });
  assert.equal(record.id[14], '7');
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Service van', values: { registration: 'ITX 2' } });
  assert.equal(updated.version, 2);
  const readback = await tool('get_record', { objectTypeId: type.id, recordId: record.id });
  assert.equal(readback.registration, 'ITX 2');
  const journal = await tool('get_journal', { objectTypeId: type.id, recordId: record.id });
  assert.equal(journal.length, 4);
  const changes = journal.filter((e: { old_value: unknown }) => e.old_value !== null);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].change_id, changes[1].change_id);
  const registration = changes.find((e: { field_key: string }) => e.field_key === 'registration');
  assert.equal(registration.field_id, field.id);
  assert.equal(registration.old_value, 'ITX 1');
  assert.equal(registration.new_value, 'ITX 2');
  assert.equal(registration.actor_id, adminId);
  const unchanged = await tool('update_record', { objectTypeId: type.id, recordId: record.id, version: 2, values: { registration: 'ITX 2' } });
  assert.equal(unchanged.version, 2);
  const stale = await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Stale' });
  assert.equal(stale.statusCode, 409);
  const invalid = await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 2, values: { unknown: 'invalid' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal((await ok('get_journal', { objectTypeId: type.id, recordId: record.id })).length, 4);
});

test('names are validated and same object names in different workspaces remain separate', async () => {
  const ws = await tool('create_workspace', { name: 'Other workspace', code: 'other' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Other vehicles' } });
  assert.equal(type.tableName, 'other_vehicles');
  for (const code of ['sys', 'bad_code', 'Bad', '1bad']) {
    assert.equal((await api('create_workspace', { name: 'Invalid', code })).statusCode, 400);
  }
  assert.equal((await api('create_workspace', { name: 'Duplicate', code: 'itx' })).statusCode, 409);
  for (const name of ['id', 'keyword', 'select', 'bad-name', 'x'.repeat(63)]) {
    assert.equal((await api('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: name, labels: { en: 'Invalid' } })).statusCode, 400);
  }
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'version', labels: { en: 'Invalid' } })).statusCode, 400);
  const columns = await sql<{ table_name: string }>`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('itx_vehicles', 'other_vehicles')`.execute(runtime.db);
  assert.equal(columns.rows.length, 2);
});

test('unauthenticated, non-admin, forged and cross-origin requests cannot mutate through API or MCP', async () => {
  assert.equal((await api('list_workspaces', {}, '')).statusCode, 401);
  assert.equal((await api('create_workspace', { name: 'Denied', code: 'denied' }, userCookie)).statusCode, 403);
  const spoofed = await api('create_workspace', { name: 'Spoofed', code: 'spoofed', userId: adminId }, userCookie);
  assert.equal(spoofed.statusCode, 400);
  for (const url of ['/api/v1/create_workspace', '/mcp']) {
    const response = await runtime.app.inject({ method: 'POST', url,
      headers: { host: '127.0.0.1:4100', cookie: adminCookie, origin: 'https://untrusted.example', 'x-xobject-request': '1' }, payload: {} });
    assert.equal(response.statusCode, 403);
  }
  const missingHeader = await runtime.app.inject({ method: 'POST', url: '/api/v1/list_workspaces',
    headers: { host: '127.0.0.1:4100', cookie: adminCookie }, payload: {} });
  assert.equal(missingHeader.statusCode, 400);
  const deniedMcp = await runtime.app.inject({ method: 'POST', url: '/mcp',
    headers: { host: '127.0.0.1:4100', cookie: userCookie, 'x-xobject-request': '1', accept: 'application/json, text/event-stream' },
    payload: { jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'create_workspace', arguments: { name: 'Denied', code: 'denied' } } } });
  assert.equal(deniedMcp.json().result.isError, true);
});

test('journal failure rolls back record writes and schema/metadata changes', async () => {
  const ws = await ok('create_workspace', { name: 'Rollback test', code: 'rollback' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Original' });
  await sql`CREATE FUNCTION reject_test_journal() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Induced journal failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Should roll back' })).statusCode, 500);
    assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: { de: 'Geändert' } })).statusCode, 500);
    assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Must roll back' })).statusCode, 500);
    assert.equal((await api('set_workspace_language', { workspaceId: ws.id, language: 'de' })).statusCode, 500);
    assert.equal((await api('set_user_language', { language: 'de' })).statusCode, 500);
  } finally { await sql`DROP TRIGGER reject_journal ON sys_journal`.execute(runtime.db); }
  const after = await ok('get_record', { objectTypeId: type.id, recordId: record.id });
  assert.equal((await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id).name, 'Rollback test');
  assert.equal(after.keyword, 'Original');
  assert.equal(after.version, 1);
  const fields = await sql`SELECT id FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND technical_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(fields.rows.length, 0);
  const columns = await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'rollback_items' AND column_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(columns.rows.length, 0);
  const tables = await sql`SELECT to_regclass('rollback_rolled_back') AS name`.execute(runtime.db);
  assert.equal((tables.rows[0] as { name: unknown }).name, null);
  const types = await sql`SELECT 1 FROM sys_object_types WHERE workspace_id = ${ws.id}::uuid AND technical_name = 'rolled_back'`.execute(runtime.db);
  assert.equal(types.rows.length, 0);
  const definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.deepEqual(definition.labels, { en: 'Items' });
  const preferences = await sql<{ language: string | null; default_language: string }>`SELECT u.language, w.default_language
    FROM sys_users u CROSS JOIN sys_workspaces w WHERE u.id = ${adminId} AND w.id = ${ws.id}::uuid`.execute(runtime.db);
  assert.equal(preferences.rows[0].language, null);
  assert.equal(preferences.rows[0].default_language, 'en');
});

test('concurrent edits cannot silently overwrite each other', async () => {
  const workspaces = await ok('list_workspaces', {});
  const workspace = workspaces.find((w: { code: string }) => w.code === 'rollback');
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'concurrent', labels: { en: 'Concurrent edits' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Initial' });
  const results = await Promise.all(['First', 'Second'].map(keyword => api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const journal = await ok('get_journal', { objectTypeId: type.id, recordId: record.id });
  assert.equal(journal.length, 2);
});

test('the local administrator CLI provisions a database account that can sign in', async () => {
  await exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'create-admin'], {
    env: { ...process.env, DATABASE_URL: databaseURL, BETTER_AUTH_SECRET: secret, BASE_URL: baseURL,
      ADMIN_EMAIL: 'cli@example.test', ADMIN_NAME: 'CLI Administrator', ADMIN_PASSWORD: 'test-password-local-cli' },
  });
  const cookie = await login('cli@example.test', 'test-password-local-cli');
  assert.equal((await api('list_workspaces', {}, cookie)).statusCode, 200);
});

test('sign-out revokes the session for API and MCP', async () => {
  const cookie = await login('admin@example.test', 'test-password-administrator');
  const signOut = await runtime.app.inject({ method: 'POST', url: '/api/auth/sign-out',
    headers: { host: '127.0.0.1:4100', origin: baseURL, cookie }, payload: {} });
  assert.equal(signOut.statusCode, 200);
  assert.equal((await api('list_workspaces', {}, cookie)).statusCode, 401);
  const mcp = await runtime.app.inject({ method: 'POST', url: '/mcp',
    headers: { host: '127.0.0.1:4100', cookie, 'x-xobject-request': '1' }, payload: {} });
  assert.equal(mcp.statusCode, 401);
});

test('translated definitions use user/workspace fallback while contents and physical names stay unchanged', async () => {
  const workspace = await ok('create_workspace', { name: 'Languages', code: 'languages', defaultLanguage: 'de' });
  const type = await tool('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', labels: { de: 'Kennzeichen', en: 'Registration' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Lieferwagen' });
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.label, 'Fahrzeuge');
  assert.deepEqual(definition.columns, ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'keyword', 'type', 'status', 'category', 'registration']);
  await tool('set_user_language', { language: 'en' });
  definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.label, 'Vehicles');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Registration');
  await tool('set_labels', { kind: 'field', id: field.id, labels: { de: 'Amtliches Kennzeichen' } });
  await tool('set_labels', { kind: 'field', id: field.id, labels: { de: 'Amtliches Kennzeichen' } });
  definition = await tool('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Amtliches Kennzeichen');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Lieferwagen');
  await ok('set_user_language', { language: null });
  await tool('set_workspace_language', { workspaceId: workspace.id, language: 'en' });
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).label, 'Vehicles');
  const fixedField = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal((await api('set_labels', { kind: 'field', id: fixedField.id, labels: { en: 'Wrong' } })).statusCode, 400);
  for (const invalid of [{}, { fr: 'Véhicules' }, { en: '' }]) {
    assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: invalid })).statusCode, 400);
  }
  assert.equal((await api('set_user_language', { language: 'invalid' })).statusCode, 400);
  assert.equal((await api('set_workspace_language', { workspaceId: workspace.id, language: 'invalid' })).statusCode, 400);
  const changes = await sql<{ field_id: string; new_value: unknown }>`SELECT field_id, new_value FROM sys_journal
    WHERE entity_id = ${field.id}::uuid AND field_key = 'labels' AND old_value <> 'null'::jsonb`.execute(runtime.db);
  assert.equal(changes.rows.length, 1);
  assert.equal(changes.rows[0].field_id, field.id);
  assert.deepEqual(changes.rows[0].new_value, { de: 'Amtliches Kennzeichen' });
});

test('upgrading legacy labels and administrator mappings preserves roles, identities, records, journal and old column order', async () => {
  const { connect } = await import('../src/database.js');
  await exec('docker', ['exec', container, 'createdb', '-U', 'postgres', 'xobject_legacy_test']);
  const legacyURL = databaseURL.replace('/xobject_test', '/xobject_legacy_test');
  await migrate(legacyURL, secret, baseURL);
  const { db, pool } = connect(legacyURL);
  const { Application } = await import('../src/domain.js');
  try {
    const auth = createAuth(pool, secret, baseURL, true);
    const user = await auth.api.signUpEmail({ body: { email: 'legacy@example.test', name: 'Legacy', password: 'test-password-legacy' } });
    await sql`UPDATE sys_users SET is_admin = true WHERE id = ${user.user.id}`.execute(db);
    const regular = await auth.api.signUpEmail({ body: { email: 'legacy-user@example.test', name: 'Legacy user', password: 'test-password-legacy-user' } });
    const application = new Application(db);
    const workspace = await application.execute('create_workspace', { code: 'legacy', name: 'Legacy' }, user.user.id) as { id: string };
    const type = await application.execute('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Original label' } }, user.user.id) as { id: string };
    const record = await application.execute('create_record', { objectTypeId: type.id, keyword: 'Existing record' }, user.user.id) as { id: string };
    // Simulate a database predating classification fields; only disposable test data is changed.
    await sql`DELETE FROM sys_journal WHERE field_id IN (SELECT id FROM sys_fields WHERE kind <> 'text')`.execute(db);
    await sql`DELETE FROM sys_fields WHERE kind <> 'text'`.execute(db);
    await sql`ALTER TABLE legacy_items DROP COLUMN type, DROP COLUMN status, DROP COLUMN category`.execute(db);
    await sql`ALTER TABLE sys_object_types DROP COLUMN classification`.execute(db);
    // Recreate the previous scalar-label/preference schema in this disposable database.
    for (const name of ['sys_object_types', 'sys_fields']) {
      await sql`ALTER TABLE ${sql.table(name)} ALTER COLUMN labels TYPE text USING labels->>'en'`.execute(db);
      await sql`ALTER TABLE ${sql.table(name)} RENAME COLUMN labels TO label`.execute(db);
    }
    await sql`ALTER TABLE sys_workspaces DROP COLUMN default_language`.execute(db);
    await sql`ALTER TABLE sys_users DROP COLUMN language`.execute(db);
    await sql`CREATE TABLE sys_administrators (user_id text PRIMARY KEY REFERENCES sys_users(id))`.execute(db);
    await sql`INSERT INTO sys_administrators (user_id) VALUES (${user.user.id})`.execute(db);
    await sql`ALTER TABLE sys_users DROP COLUMN is_admin`.execute(db);
    const beforeColumns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'legacy_items' ORDER BY ordinal_position`.execute(db);
    const beforeJournal = await sql`SELECT * FROM sys_journal ORDER BY id`.execute(db);
    await migrate(legacyURL, secret, baseURL);
    await migrate(legacyURL, secret, baseURL);
    const upgradedRoles = (await sql<{ id: string; is_admin: boolean }>`SELECT id, is_admin FROM sys_users`.execute(db)).rows;
    assert.equal(upgradedRoles.find(item => item.id === user.user.id)?.is_admin, true);
    assert.equal(upgradedRoles.find(item => item.id === regular.user.id)?.is_admin, false);
    assert.equal((await sql<{ name: string | null }>`SELECT to_regclass('sys_administrators')::text AS name`.execute(db)).rows[0].name, null);
    const labels = await sql<{ labels: unknown }>`SELECT labels FROM sys_object_types WHERE id = ${type.id}::uuid`.execute(db);
    assert.deepEqual(labels.rows[0].labels, { und: 'Original label' });
    const afterColumns = await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_name = 'legacy_items' ORDER BY ordinal_position`.execute(db);
    assert.deepEqual(afterColumns.rows.slice(0, beforeColumns.rows.length), beforeColumns.rows);
    assert.deepEqual(afterColumns.rows.slice(-3).map(column => column.column_name), ['type', 'status', 'category']);
    assert.deepEqual((await sql`SELECT * FROM sys_journal ORDER BY id`.execute(db)).rows, beforeJournal.rows);
    const readback = await application.execute('get_record', { objectTypeId: type.id, recordId: record.id }, user.user.id) as { keyword: string; type: string | null; status: string | null; category: string[] };
    assert.equal(readback.type, null); assert.equal(readback.status, null); assert.deepEqual(readback.category, []);
    assert.equal(readback.keyword, 'Existing record');
    assert.equal((await application.execute('get_object_type', { objectTypeId: type.id }, user.user.id) as { label: string }).label, 'Original label');
  } finally { await db.destroy(); }
});

test('object/record lists are scoped, localized, paginated and search literal keywords through API and MCP', async () => {
  const workspace = await ok('create_workspace', { code: 'lists', name: 'Lists', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { de: 'Einträge', en: 'Items' } });
  const types = await tool('list_object_types', { workspaceId: workspace.id });
  assert.equal(types.length, 1);
  assert.equal(types[0].id, type.id);
  assert.equal(types[0].label, 'Einträge');
  const first = await ok('create_record', { objectTypeId: type.id, keyword: 'Alpha 100%' });
  await tool('create_record', { objectTypeId: type.id, keyword: 'Beta' });
  const page = await tool('list_records', { objectTypeId: type.id, limit: 1, offset: 0 });
  assert.equal(page.total, 2);
  assert.equal(page.records.length, 1);
  const secondPage = await ok('list_records', { objectTypeId: type.id, limit: 1, offset: 1 });
  assert.equal(secondPage.total, 2);
  assert.notEqual(page.records[0].id, secondPage.records[0].id);
  const search = await ok('list_records', { objectTypeId: type.id, query: 'ALPHA 100%' });
  assert.equal(search.total, 1);
  assert.equal(search.records[0].id, first.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: "' OR 1=1 --" })).total, 0);
  assert.equal((await ok('list_records', { objectTypeId: type.id, offset: 10 })).total, 2);
  for (const input of [{ limit: 0 }, { limit: 101 }, { offset: -1 }]) {
    assert.equal((await api('list_records', { objectTypeId: type.id, ...input })).statusCode, 400);
  }
  assert.equal((await api('list_object_types', { workspaceId: workspace.id }, userCookie)).statusCode, 403);
  assert.equal((await api('list_records', { objectTypeId: type.id }, '')).statusCode, 401);
});

test('record sorting validates fields and applies before pagination identically through API and MCP', async () => {
  const workspace = await ok('create_workspace', { code: 'sorting', name: 'Sorting' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Items' } });
  await ok('create_field', { objectTypeId: type.id, technicalName: 'note', labels: { en: 'Note' } });
  const zulu = await ok('create_record', { objectTypeId: type.id, keyword: 'Zulu', values: { note: 'Alpha' } });
  const alpha = await ok('create_record', { objectTypeId: type.id, keyword: 'Alpha', values: { note: 'Zulu' } });
  const blank = await ok('create_record', { objectTypeId: type.id, keyword: 'Bravo' });
  const args = { objectTypeId: type.id, sortBy: 'keyword', sortDirection: 'asc', limit: 1 };
  const first = await ok('list_records', args);
  assert.equal(first.records[0].id, alpha.id);
  assert.deepEqual(await tool('list_records', args), first);
  assert.equal((await ok('list_records', { ...args, offset: 1 })).records[0].id, blank.id);
  assert.equal((await ok('list_records', { ...args, sortDirection: 'desc' })).records[0].id, zulu.id);
  for (const direction of ['asc', 'desc']) {
    const page = await ok('list_records', { objectTypeId: type.id, sortBy: 'note', sortDirection: direction });
    assert.deepEqual(page.records.map((record: { id: string }) => record.id), direction === 'asc' ? [zulu.id, alpha.id, blank.id] : [alpha.id, zulu.id, blank.id]);
  }
  const filtered = await ok('list_records', { ...args, query: 'Alpha', sortDirection: 'desc' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.records[0].id, alpha.id);
  // Identical values use record IDs as a deterministic tie-breaker across pages.
  await ok('update_record', { objectTypeId: type.id, recordId: alpha.id, version: alpha.version, values: { note: 'Alpha' } });
  const tied = await ok('list_records', { objectTypeId: type.id, sortBy: 'note', sortDirection: 'asc' });
  assert.deepEqual(tied.records.slice(0, 2).map((record: { id: string }) => record.id), [alpha.id, zulu.id].sort());
  const latest = await ok('list_records', { objectTypeId: type.id });
  assert.equal(latest.records[0].id, alpha.id);
  for (const input of [{ sortBy: 'missing' }, { sortBy: 'created_by' }, { sortBy: 'keyword; DROP TABLE sys_users' }, { sortDirection: 'sideways' }]) {
    assert.equal((await api('list_records', { objectTypeId: type.id, ...input })).statusCode, 400);
  }
});

test('workspace search shares API/MCP behavior, isolates workspaces and treats text literally', async () => {
  const workspace = await ok('create_workspace', { code: 'search', name: 'Search', defaultLanguage: 'de' });
  const other = await ok('create_workspace', { code: 'searchother', name: 'Other' });
  const empty = await ok('create_workspace', { code: 'searchempty', name: 'Empty' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const second = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'notes', labels: { de: 'Notizen' } });
  const outsider = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: other.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Suche 100%_Test' });
  await ok('create_record', { objectTypeId: second.id, keyword: 'Suche ebenfalls' });
  await ok('create_record', { objectTypeId: outsider.id, keyword: 'Suche geheim' });
  const input = { workspaceId: workspace.id, query: 'SUCHE' };
  const result = await ok('search_workspace', input);
  assert.deepEqual(result, await tool('search_workspace', input));
  assert.equal(result.records.length, 2);
  assert.equal(result.records.find((r: { id: string }) => r.id === record.id).objectLabel, 'Fahrzeuge');
  assert.equal(result.records.some((r: { keyword: string }) => r.keyword === 'Suche geheim'), false);
  const literal = await ok('search_workspace', { ...input, query: '100%_' });
  assert.equal(literal.records.length, 1);
  assert.equal(literal.records[0].id, record.id);
  assert.equal((await ok('search_workspace', { ...input, query: "' OR 1=1 --" })).records.length, 0);
  assert.equal((await ok('search_workspace', { ...input, query: 'fahr' })).objectTypes[0].id, type.id);
  assert.equal((await ok('search_workspace', { ...input, query: 'vehicles' })).objectTypes[0].id, type.id);
  const limited = await ok('search_workspace', { ...input, limit: 1 });
  assert.equal(limited.records.length, 1);
  assert.equal(limited.hasMoreRecords, true);
  assert.deepEqual((await ok('search_workspace', { ...input, workspaceId: empty.id })).records, []);
  assert.equal((await api('search_workspace', { ...input, workspaceId: randomUUID() })).statusCode, 404);
  for (const change of [{ query: ' ' }, { limit: 0 }, { limit: 51 }]) assert.equal((await api('search_workspace', { ...input, ...change })).statusCode, 400);
  assert.equal((await api('search_workspace', input, userCookie)).statusCode, 403);
  assert.equal((await api('search_workspace', input, '')).statusCode, 401);
});

test('web deep links serve only the application shell and preserve API/asset errors', { skip: !existsSync(new URL('../../web/dist/index.html', import.meta.url)) }, async () => {
  for (const url of ['/settings', '/w/itx', '/w/itx/objects/vehicles?q=sample&sort=keyword&direction=asc&page=2', '/w/itx/objects/vehicles/new', `/w/itx/objects/vehicles/${randomUUID()}`]) {
    const response = await runtime.app.inject({ method: 'GET', url, headers: { host: '127.0.0.1:4100', accept: 'text/html' } });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.headers['content-type']!, /text\/html/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.body, /id="root"/);
  }
  for (const url of ['/api/v1/missing', '/api/missing', '/mcp/missing', '/assets/missing.js', '/unknown']) {
    assert.equal((await runtime.app.inject({ method: 'GET', url, headers: { host: '127.0.0.1:4100', accept: 'text/html' } })).statusCode, 404);
  }
  assert.equal((await runtime.app.inject({ method: 'GET', url: '/settings', headers: { host: '127.0.0.1:4100', accept: 'application/json' } })).statusCode, 404);
  assert.equal((await runtime.app.inject({ method: 'POST', url: '/settings', headers: { host: '127.0.0.1:4100', accept: 'text/html' } })).statusCode, 404);
  assert.equal((await runtime.app.inject({ method: 'GET', url: '/settings', headers: { host: 'wrong.test', accept: 'text/html' } })).statusCode, 400);
});

function classificationFixture() {
  const [typeA, typeB, statusA, statusB, untyped, catA, catB] = Array.from({ length: 7 }, () => randomUUID());
  return { typeA, typeB, statusA, statusB, untyped, catA, catB, config: {
    type: { required: false, defaultId: typeA },
    status: { required: false, defaults: [{ typeId: typeA, statusId: statusA }, { typeId: null, statusId: untyped }] },
    category: { required: false, multiple: true, defaultIds: [catA] },
    options: [
      { id: typeA, kind: 'type', labels: { de: 'Intern', en: 'Internal' }, active: true, typeId: null },
      { id: typeB, kind: 'type', labels: { en: 'External' }, active: true, typeId: null },
      { id: statusA, kind: 'status', labels: { de: 'Offen', en: 'Open' }, active: true, typeId: typeA },
      { id: statusB, kind: 'status', labels: { en: 'Done' }, active: true, typeId: typeB },
      { id: untyped, kind: 'status', labels: { en: 'Unclassified' }, active: true, typeId: null },
      { id: catA, kind: 'category', labels: { en: 'Customer' }, active: true, typeId: null },
      { id: catB, kind: 'category', labels: { en: 'Partner' }, active: true, typeId: null },
    ],
  } as ClassificationRules };
}
async function classificationObject(code: string) {
  const workspace = await ok('create_workspace', { code, name: code });
  return ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Items' } });
}

test('classification defaults, optional values, Type/Status scopes and API/MCP journaling share one backend', async () => {
  const type = await classificationObject('choices');
  const fixture = classificationFixture();
  const { typeA, typeB, statusA, statusB, untyped, catA, catB, config } = fixture;
  const definition = await tool('configure_classification', { objectTypeId: type.id, version: 1, config });
  assert.equal(definition.classification.version, 2);
  assert.equal(definition.fields.filter((field: { kind: string }) => field.kind !== 'text').length, 3);
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Defaults' });
  assert.equal(record.type, typeA); assert.equal(record.status, statusA); assert.deepEqual(record.category, [catA]);
  assert.deepEqual(await tool('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  const none = await tool('create_record', { objectTypeId: type.id, keyword: 'No Type', classification: { type: null, category: [] } });
  assert.equal(none.type, null); assert.equal(none.status, untyped); assert.deepEqual(none.category, []);
  const cleared = await ok('create_record', { objectTypeId: type.id, keyword: 'Explicit empty', classification: { type: null, status: null, category: [] } });
  assert.equal(cleared.status, null);
  for (const classification of [{ type: typeB }, { type: typeB, status: statusA }, { status: untyped }, { category: [randomUUID()] }, { category: [catA, catA] }]) {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification })).statusCode, 400);
  }
  const changed = await tool('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification: { type: typeB, status: statusB, category: [catB, catA] } });
  const journal = await ok('get_journal', { objectTypeId: type.id, recordId: record.id });
  const entries = journal.slice(-3);
  assert.deepEqual(entries.map((entry: { field_key: string }) => entry.field_key).sort(), ['category', 'status', 'type']);
  assert.equal(new Set(entries.map((entry: { change_id: string }) => entry.change_id)).size, 1);
  assert.equal(new Set(entries.map((entry: { field_id: string }) => entry.field_id)).size, 3);
  assert.equal(entries.find((entry: { field_key: string }) => entry.field_key === 'type').old_value, typeA);
  assert.equal(entries.find((entry: { field_key: string }) => entry.field_key === 'type').new_value, typeB);
  const unchanged = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: changed.version, classification: { category: [catA, catB] } });
  assert.equal(unchanged.version, changed.version);
  assert.equal((await ok('get_journal', { objectTypeId: type.id, recordId: record.id })).length, journal.length);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 1, config })).statusCode, 409);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config }, userCookie)).statusCode, 403);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config }, '')).statusCode, 401);
  assert.equal((await tool('configure_classification', { objectTypeId: type.id, version: 2, config })).classification.version, 2);
  await ok('set_user_language', { language: 'de' });
  assert.equal((await tool('get_object_type', { objectTypeId: type.id })).classification.options.find((option: { id: string }) => option.id === typeA).label, 'Intern');
  await ok('set_user_language', { language: 'en' });
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).classification.options.find((option: { id: string }) => option.id === typeA).label, 'Internal');
  await ok('set_user_language', { language: null });
  const another = await ok('create_record', { objectTypeId: type.id, keyword: 'Sorting' });
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'type', sortDirection: 'asc', limit: 1 })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'status', sortDirection: 'asc', limit: 1 })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'category', sortDirection: 'asc', limit: 1 })).records[0].id, another.id);

});

test('required fields, changed mappings and single Category mode cannot invalidate existing records', async () => {
  const type = await classificationObject('stricter');
  const { config, typeA, typeB, statusA, catA, catB } = classificationFixture();
  const empty = await ok('create_record', { objectTypeId: type.id, keyword: 'Existing empty' });
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  for (const kind of ['type', 'status', 'category'] as const) {
    const stricter = structuredClone(config);
    stricter[kind].required = true;
    assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: stricter })).statusCode, 400);
  }
  const filled = await ok('update_record', { objectTypeId: type.id, recordId: empty.id, version: empty.version, classification: { type: typeA, status: statusA, category: [catA, catB] } });
  assert.equal(filled.version, 2);
  const single = structuredClone(config); single.category.multiple = false;
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: single })).statusCode, 400);
  const mapped = structuredClone(config); mapped.options.find(option => option.id === statusA)!.typeId = typeB; mapped.status.defaults = [];
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: mapped })).statusCode, 400);
  config.type.required = true; config.status.required = true; config.category.required = true;
  await ok('configure_classification', { objectTypeId: type.id, version: 2, config });
  for (const classification of [{ type: null, status: null }, { status: null }, { category: [] }]) {
    assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Invalid', classification })).statusCode, 400);
  }
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: empty.id })).version, 2);
});

test('renaming/deactivating choices retains identities and assignments; new inactive or foreign choices are rejected', async () => {
  const type = await classificationObject('inactivechoices');
  const other = await classificationObject('foreignchoices');
  const { config, typeA, statusA, catA } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Retained' });
  config.type.defaultId = null; config.status.defaults = []; config.category.defaultIds = [];
  for (const option of config.options) if (new Set<string>([typeA, statusA, catA]).has(option.id)) { option.active = false; option.labels = { en: 'Renamed' }; }
  await tool('configure_classification', { objectTypeId: type.id, version: 2, config });
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, keyword: 'Still retained', classification: { type: typeA, status: statusA, category: [catA] } });
  assert.equal(updated.type, typeA); assert.equal(updated.status, statusA); assert.deepEqual(updated.category, [catA]);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Inactive', classification: { type: typeA, status: statusA, category: [catA] } })).statusCode, 400);
  assert.equal((await api('create_record', { objectTypeId: other.id, keyword: 'Foreign', classification: { type: typeA } })).statusCode, 400);
  assert.equal((await api('configure_classification', { objectTypeId: other.id, version: 1, config })).statusCode, 400);
  const removed = structuredClone(config); removed.options = removed.options.filter(option => option.id !== catA);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config: removed })).statusCode, 400);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Bypass', values: { type: typeA } })).statusCode, 400);
});

test('journal failure rolls back classification configuration and record selections atomically', async () => {
  const type = await classificationObject('classificationrollback');
  const { config, typeB, statusB } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Rollback' });
  const before = await ok('get_object_type', { objectTypeId: type.id });
  const history = await ok('get_journal', { objectTypeId: type.id, recordId: record.id });
  await sql`CREATE FUNCTION reject_classification_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test journal failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_classification_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_classification_journal()`.execute(runtime.db);
  try {
    const renamed = structuredClone(config); renamed.options[0].labels = { en: 'Rollback label' };
    assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: renamed })).statusCode, 500);
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, classification: { type: typeB, status: statusB } })).statusCode, 500);
  } finally {
    await sql`DROP TRIGGER reject_classification_journal ON sys_journal`.execute(runtime.db);
    await sql`DROP FUNCTION reject_classification_journal()`.execute(runtime.db);
  }
  assert.deepEqual(await ok('get_object_type', { objectTypeId: type.id }), before);
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual(await ok('get_journal', { objectTypeId: type.id, recordId: record.id }), history);
});


test('workspace name changes share API/MCP validation and atomic journals without changing identity or tables', async () => {
  const ws = await ok('create_workspace', { name: 'Original workspace', code: 'workspaceprefs', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { de: 'Einträge' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Preserved record' });
  assert.deepEqual(await tool('set_workspace_name', { workspaceId: ws.id, name: '  Renamed workspace  ' }), { workspaceId: ws.id, name: 'Renamed workspace' });
  const updated = (await ok('list_workspaces', {})).find((item: { id: string }) => item.id === ws.id);
  assert.deepEqual(updated, { id: ws.id, code: 'workspaceprefs', name: 'Renamed workspace', default_language: 'de', role: 'administrator' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Preserved record');
  const journal = await sql<{ old_value: string; new_value: string; actor_id: string }>`SELECT old_value, new_value, actor_id FROM sys_journal WHERE entity_id = ${ws.id}::uuid AND field_key = 'name' ORDER BY id`.execute(runtime.db);
  assert.equal(journal.rows.length, 2);
  assert.deepEqual(journal.rows[1], { old_value: 'Original workspace', new_value: 'Renamed workspace', actor_id: adminId });
  await ok('set_workspace_name', { workspaceId: ws.id, name: 'Renamed workspace' });
  assert.equal((await sql`SELECT id FROM sys_journal WHERE entity_id = ${ws.id}::uuid AND field_key = 'name'`.execute(runtime.db)).rows.length, 2);
  for (const name of ['', '  ', 'x'.repeat(201)]) assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name })).statusCode, 400);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Wrong', code: 'changed' })).statusCode, 400);
  assert.equal((await api('set_workspace_name', { workspaceId: randomUUID(), name: 'Missing' })).statusCode, 404);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Denied' }, userCookie)).statusCode, 403);
  assert.equal((await api('set_workspace_name', { workspaceId: ws.id, name: 'Denied' }, '')).statusCode, 401);
});

test('every business field exposes requiredness, validates writes and preflights stricter rules without losing journal atomicity', async () => {
  const ws = await ok('create_workspace', { name: 'Required fields', code: 'requiredfields' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'reference', labels: { en: 'Reference' }, required: true });
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  const keyword = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal(keyword.required, false);
  await ok('set_field_required', { fieldId: keyword.id, required: true });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, true);
  assert.equal((await api('create_record', { objectTypeId: type.id, values: { reference: 'REF' } })).statusCode, 400);
  for (const values of [{}, { reference: null }, { reference: ' \t\n' }]) assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Missing', values })).statusCode, 400);
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Valid', values: { reference: 'REF' } });
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'missing', labels: { en: 'Missing' }, required: true })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: { reference: ' ' } })).statusCode, 400);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, keyword: 'Still valid' });
  await tool('set_field_required', { fieldId: field.id, required: false });
  const changed = await ok('get_record', { objectTypeId: type.id, recordId: record.id });
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: changed.version, values: { reference: null } });
  assert.equal((await api('set_field_required', { fieldId: field.id, required: true })).statusCode, 400);
  await tool('set_field_required', { fieldId: keyword.id, required: false });
  const unnamed = await ok('create_record', { objectTypeId: type.id });
  assert.equal(unnamed.keyword, '');
  assert.equal((await api('set_field_required', { fieldId: keyword.id, required: true })).statusCode, 400);
  await migrate(databaseURL, secret, baseURL);
  definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === keyword.id).required, false);
  const typeField = definition.fields.find((f: { kind: string }) => f.kind === 'type');
  assert.equal((await api('set_field_required', { fieldId: typeField.id, required: true })).statusCode, 400);
  assert.equal((await tool('set_field_required', { fieldId: typeField.id, required: false })).classification.type.required, false);
  assert.equal((await api('set_field_required', { fieldId: field.id, required: true }, userCookie)).statusCode, 403);
  assert.equal((await api('set_field_required', { fieldId: randomUUID(), required: false })).statusCode, 404);
  const journals = (await sql<{ old_value: boolean; new_value: boolean }>`SELECT old_value, new_value FROM sys_journal WHERE entity_id = ${keyword.id}::uuid AND field_key = 'required' AND old_value IS NOT NULL AND old_value <> 'null'::jsonb ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(journals, [{ old_value: false, new_value: true }, { old_value: true, new_value: false }]);
  const filled = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'filled', labels: { en: 'Filled' } });
  const filledDef = await ok('get_object_type', { objectTypeId: filled.id });
  const filledKeyword = filledDef.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  await ok('set_field_required', { fieldId: filledKeyword.id, required: true });
  await sql`CREATE TRIGGER reject_required_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_field_required', { fieldId: filledKeyword.id, required: false })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_required_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: filled.id })).fields.find((f: { id: string }) => f.id === filledKeyword.id).required, true);
});

test('field attribute edits save labels and requiredness atomically with a shared change ID', async () => {
  const ws = await ok('create_workspace', { name: 'Field attributes', code: 'fieldattributes' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'note', labels: { en: 'Note' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Record' });
  assert.equal((await api('configure_field', { fieldId: field.id, labels: { en: 'Renamed' }, required: true })).statusCode, 400);
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Note');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, false);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { note: 'Filled' } });
  definition = await tool('configure_field', { fieldId: field.id, labels: { en: 'Renamed' }, required: true });
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).label, 'Renamed');
  assert.equal(definition.fields.find((f: { id: string }) => f.id === field.id).required, true);
  const edits = (await sql<{ field_key: string; change_id: string }>`SELECT field_key, change_id FROM sys_journal WHERE entity_id = ${field.id}::uuid AND old_value IS NOT NULL AND old_value <> 'null'::jsonb ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(edits.map(entry => entry.field_key), ['labels', 'required']);
  assert.equal(edits[0].change_id, edits[1].change_id);
  const keyword = definition.fields.find((f: { technicalName: string }) => f.technicalName === 'keyword');
  assert.equal((await api('configure_field', { fieldId: keyword.id, labels: { en: 'Forbidden' }, required: false })).statusCode, 400);
  assert.equal((await api('configure_field', { fieldId: field.id, required: false }, userCookie)).statusCode, 403);
});

test('all custom field types round-trip through API/MCP with typed storage, exact amounts, choices and scoped references', async () => {
  const ws = await ok('create_workspace', { name: 'Typed fields', code: 'typedfields' });
  const foreign = await ok('create_workspace', { name: 'Foreign references', code: 'foreignrefs' });
  const group = await tool('create_group', { workspaceId: ws.id, name: 'Team' });
  const foreignGroup = await ok('create_group', { workspaceId: foreign.id, name: 'Other team' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Typed items' } });
  const choice = randomUUID();
  const fields = [
    ['short_text', 'text', {}, 'Hello'], ['notes', 'multiline', { formatted: true }, '**Bold**\nText'],
    ['count_value', 'integer', {}, '9007199254740993'], ['ratio', 'decimal', { scale: 4 }, '12345678901234567890.1234'],
    ['price', 'money', { scale: 2, currency: 'EUR' }, { amount: '12345678901234567890.12', currency: 'USD' }],
    ['enabled', 'boolean', {}, false], ['birthday', 'date', {}, '2024-02-29'], ['appointment', 'datetime', {}, '2026-10-30T12:34:56+02:00'],
    ['selection', 'single_choice', { options: [{ id: choice, labels: { en: 'Choice' }, active: true }] }, choice],
    ['selections', 'multiple_choice', { options: [{ id: randomUUID(), labels: { en: 'Multiple' }, active: true }] }, null],
    ['email_address', 'email', {}, 'person@example.test'], ['phone_number', 'phone', {}, '+442079460018'], ['website', 'url', {}, 'https://example.test/path'],
    ['owner_ref', 'reference', { referenceTarget: 'user', multiple: false }, { kind: 'user', id: adminId }],
    ['team_refs', 'reference', { referenceTarget: 'both', multiple: true }, [{ kind: 'group', id: group.id }, { kind: 'user', id: adminId }]],
  ] as const;
  for (const [technicalName, kind, config] of fields) await tool('create_field', { objectTypeId: type.id, technicalName, kind, config, labels: { en: technicalName } });
  const definition = await ok('get_object_type', { objectTypeId: type.id });
  const multi = definition.fields.find((field: { technicalName: string }) => field.technicalName === 'selections');
  const input = Object.fromEntries(fields.map(([name, , , value]) => [name, value]));
  input.selections = [multi.config.options[0].id] as never;
  const record = await tool('create_record', { objectTypeId: type.id, keyword: 'Typed record', values: input });
  assert.equal(record.count_value, '9007199254740993');
  assert.equal(record.ratio, '12345678901234567890.1234');
  assert.deepEqual(record.price, { amount: '12345678901234567890.12', currency: 'USD' });
  assert.equal(record.enabled, false);
  assert.equal(record.birthday, '2024-02-29');
  assert.equal(record.appointment, '2026-10-30T10:34:56.000Z');
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual((await ok('list_records', { objectTypeId: type.id })).records[0], record);
  const noOp = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: input });
  assert.equal(noOp.version, record.version);
  const columns = (await sql<{ column_name: string; data_type: string }>`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'typedfields_items'`.execute(runtime.db)).rows;
  for (const [name, expected] of [['count_value', 'bigint'], ['ratio', 'numeric'], ['enabled', 'boolean'], ['birthday', 'date'], ['appointment', 'timestamp with time zone'], ['selection', 'uuid'], ['selections', 'ARRAY'], ['price', 'jsonb'], ['team_refs', 'jsonb']]) assert.equal(columns.find(column => column.column_name === name)?.data_type, expected);
  for (const values of [
    { count_value: '9223372036854775808' }, { count_value: '1.2' }, { ratio: '1.12345' }, { enabled: 'false' }, { birthday: '2025-02-29' }, { appointment: '2026-10-30T12:00:00' }, { appointment: '2026-10-30T12:00:00.1234Z' },
    { price: { amount: '1.234', currency: 'EUR' } }, { price: { amount: '1', currency: 'XYZ' } }, { email_address: 'invalid' }, { website: 'javascript:alert(1)' }, { phone_number: '1234' },
    { selection: randomUUID() }, { selections: [multi.config.options[0].id, multi.config.options[0].id] }, { owner_ref: { kind: 'group', id: group.id } }, { team_refs: [{ kind: 'group', id: foreignGroup.id }] },
  ]) assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values })).statusCode, 400, JSON.stringify(values));
  await ok('create_record', { objectTypeId: type.id, keyword: 'Euro', values: { price: { amount: '100', currency: 'EUR' } } });
  await ok('create_record', { objectTypeId: type.id, keyword: 'Small USD', values: { price: { amount: '1', currency: 'USD' } } });
  assert.deepEqual((await ok('list_records', { objectTypeId: type.id, sortBy: 'price', sortDirection: 'asc' })).records.map((row: { keyword: string }) => row.keyword), ['Euro', 'Small USD', 'Typed record']);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'owner_ref', sortDirection: 'asc' })).records[0].id, record.id);
  assert.equal((await ok('list_records', { objectTypeId: type.id, sortBy: 'selection', sortDirection: 'asc' })).records[0].id, record.id);
  const principals = await tool('list_field_principals', { workspaceId: ws.id });
  assert.ok(principals.some((entry: { id: string }) => entry.id === group.id));
  assert.ok(!principals.some((entry: { id: string }) => entry.id === foreignGroup.id));
  const selection = definition.fields.find((field: { technicalName: string }) => field.technicalName === 'selection');
  await ok('configure_field', { fieldId: selection.id, required: false, config: { options: [{ id: choice, labels: { en: 'Renamed' }, active: false }] } });
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version, values: { selection: choice } });
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Inactive', values: { selection: choice } })).statusCode, 400);
  assert.equal((await api('configure_field', { fieldId: selection.id, required: false, config: { options: [] } })).statusCode, 400);
});

test('safe field conversions preflight every row, preserve historical journals and roll back schema/values on errors', async () => {
  const ws = await ok('create_workspace', { name: 'Conversions', code: 'conversions' });
  const type = await ok('create_object_type', { standardFields: ['keyword', 'type_status', 'category'], workspaceId: ws.id, technicalName: 'items', labels: { en: 'Conversion items' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'amount', labels: { en: 'Amount' } });
  const first = await ok('create_record', { objectTypeId: type.id, keyword: 'First', values: { amount: '12' } });
  const second = await ok('create_record', { objectTypeId: type.id, keyword: 'Second', values: { amount: '0013' } });
  assert.equal((await api('configure_field', { fieldId: field.id, kind: 'integer', required: false, labels: { en: 'Should roll back' } })).statusCode, 400);
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).fields.find((item: { id: string }) => item.id === field.id).kind, 'text');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: first.id })).version, 1);
  await ok('update_record', { objectTypeId: type.id, recordId: second.id, version: 1, values: { amount: '13' } });
  await tool('configure_field', { fieldId: field.id, kind: 'integer', required: true });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: first.id })).amount, '12');
  const integerColumn = (await sql<{ data_type: string }>`SELECT data_type FROM information_schema.columns WHERE table_name = 'conversions_items' AND column_name = 'amount'`.execute(runtime.db)).rows[0];
  assert.equal(integerColumn.data_type, 'bigint');
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: first.id, version: 1, values: { amount: '14' } })).statusCode, 409);
  const convertedRecord = await ok('get_record', { objectTypeId: type.id, recordId: first.id });
  assert.ok(convertedRecord.version > 1);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: first.id, version: convertedRecord.version, values: { amount: 'bad' } })).statusCode, 400);
  await sql`CREATE TRIGGER reject_conversion_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_field', { fieldId: field.id, kind: 'decimal', config: { scale: 2 }, required: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_conversion_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).fields.find((item: { id: string }) => item.id === field.id).kind, 'integer');
  assert.equal((await sql<{ data_type: string }>`SELECT data_type FROM information_schema.columns WHERE table_name = 'conversions_items' AND column_name = 'amount'`.execute(runtime.db)).rows[0].data_type, 'bigint');
  const beforeJournal = await ok('get_journal', { objectTypeId: type.id, recordId: first.id });
  assert.equal(beforeJournal.find((entry: { field_key: string; old_value: unknown }) => entry.field_key === 'amount' && entry.old_value === null).new_value, '12');
  const multi = await ok('create_field', { objectTypeId: type.id, technicalName: 'choices', kind: 'multiple_choice', config: { options: [{ id: randomUUID(), labels: { en: 'A' }, active: true }, { id: randomUUID(), labels: { en: 'B' }, active: true }] }, labels: { en: 'Choices' } });
  const def = await ok('get_object_type', { objectTypeId: type.id });
  const choiceField = def.fields.find((item: { id: string }) => item.id === multi.id);
  const current = await ok('get_record', { objectTypeId: type.id, recordId: first.id });
  await ok('update_record', { objectTypeId: type.id, recordId: first.id, version: current.version, values: { choices: choiceField.config.options.map((option: { id: string }) => option.id) } });
  assert.equal((await api('configure_field', { fieldId: multi.id, kind: 'single_choice', config: choiceField.config, required: false })).statusCode, 400);
});


test('administrator flags cannot be set by profile input and authorization reads revocation immediately', async () => {
  const ordinary = (await sql<{ id: string; is_admin: boolean }>`SELECT id, is_admin FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  assert.equal(ordinary.is_admin, false);
  for (const flags of [{ isAdmin: true }, { is_admin: true }, { isAdmin: true, is_admin: true }]) {
    const response = await runtime.app.inject({ method: 'POST', url: '/api/auth/update-user', headers: { host: '127.0.0.1:4100', origin: baseURL, cookie: userCookie }, payload: { name: 'Test User', ...flags } });
    assert.ok([200, 400].includes(response.statusCode), response.body);
    assert.equal((await sql<{ is_admin: boolean }>`SELECT is_admin FROM sys_users WHERE id = ${ordinary.id}`.execute(runtime.db)).rows[0].is_admin, false);
    assert.deepEqual((await api('list_workspaces', {}, userCookie)).json(), []);
    assert.deepEqual((await api('get_access_context', {}, userCookie)).json(), { isAdmin: false });
  }
  const session = await runtime.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { host: '127.0.0.1:4100', cookie: adminCookie } });
  assert.equal(session.statusCode, 200);
  assert.equal(Object.hasOwn(session.json().user, 'isAdmin'), false);
  assert.equal(Object.hasOwn(session.json().user, 'is_admin'), false);
  await sql`UPDATE sys_users SET is_admin = false WHERE id = ${adminId}`.execute(runtime.db);
  try {
    assert.deepEqual((await api('list_workspaces', {})).json(), []);
    assert.equal((await api('create_workspace', { name: 'Revoked', code: 'revoked' })).statusCode, 403);
    assert.deepEqual(await tool('get_access_context', {}), { isAdmin: false });
  } finally { await sql`UPDATE sys_users SET is_admin = true WHERE id = ${adminId}`.execute(runtime.db); }
  const before = (await sql`SELECT id, is_admin FROM sys_users ORDER BY id`.execute(runtime.db)).rows;
  await migrate(databaseURL, secret, baseURL);
  assert.deepEqual((await sql`SELECT id, is_admin FROM sys_users ORDER BY id`.execute(runtime.db)).rows, before);
  assert.equal((await api('list_workspaces', {})).statusCode, 200);
});

test('manual choice ordering persists through API/MCP with per-field journals and unchanged records', async () => {
  const type = await classificationObject('orderedchoices');
  const { config, typeA, typeB, statusA, statusB, catA, catB } = classificationFixture();
  const secondStatus = randomUUID();
  config.options.push({ id: secondStatus, kind: 'status', labels: { en: 'Review' }, active: true, typeId: typeA });
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Keep selections' });
  const recordJournal = await ok('get_journal', { objectTypeId: type.id, recordId: record.id });
  const reordered = structuredClone(config);
  reordered.options = moveClassificationOption(reordered.options, typeB, typeA);
  reordered.options = moveClassificationOption(reordered.options, secondStatus, statusA);
  reordered.options = moveClassificationOption(reordered.options, catB, catA);
  assert.equal(moveClassificationOption(reordered.options, statusA, statusB), reordered.options, 'Status cannot be dragged across scopes');
  assert.equal(moveClassificationOption(reordered.options, catA, typeA), reordered.options, 'Kinds cannot be mixed');
  const result = await tool('configure_classification', { objectTypeId: type.id, version: 2, config: reordered });
  assert.deepEqual(result.classification.options.map((option: { id: string }) => option.id), reordered.options.map(option => option.id));
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).classification, result.classification);
  assert.equal(result.classification.version, 3);
  assert.equal(result.classification.type.defaultId, typeA);
  assert.deepEqual(await ok('get_record', { objectTypeId: type.id, recordId: record.id }), record);
  assert.deepEqual(await ok('get_journal', { objectTypeId: type.id, recordId: record.id }), recordJournal);
  const fieldIds = result.fields.filter((field: { technicalName: string }) => ['type', 'status', 'category'].includes(field.technicalName)).map((field: { id: string }) => field.id);
  const entries = (await sql<{ field_id: string; change_id: string; old_value: string[]; new_value: string[] }>`SELECT field_id, change_id, old_value, new_value FROM sys_journal WHERE entity_id = ANY(${fieldIds}::uuid[]) AND field_key = 'option_order' AND old_value <> '[]'::jsonb`.execute(runtime.db)).rows;
  assert.equal(entries.length, 3); assert.equal(new Set(entries.map(entry => entry.change_id)).size, 1);
  for (const entry of entries) { assert.deepEqual([...entry.old_value].sort(), [...entry.new_value].sort()); assert.notDeepEqual(entry.old_value, entry.new_value); }
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config })).statusCode, 409);
  assert.equal((await ok('configure_classification', { objectTypeId: type.id, version: 3, config: reordered })).classification.version, 3);
  await sql`CREATE FUNCTION reject_order_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test order failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_order_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_order_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_order_journal ON sys_journal`.execute(runtime.db); await sql`DROP FUNCTION reject_order_journal()`.execute(runtime.db); }
  assert.deepEqual((await tool('get_object_type', { objectTypeId: type.id })).classification, result.classification);
});

test('standard fields are opt-in, can be added atomically through API/MCP and stay absent across migrations', async () => {
  const ws = await ok('create_workspace', { name: 'Optional standards', code: 'optionalstandards' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'bare', labels: { en: 'Bare' } });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  assert.deepEqual(def.fields, []);
  assert.deepEqual(def.columns, ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version']);
  const record = await tool('create_record', { objectTypeId: type.id });
  assert.equal(record.keyword, ''); assert.equal(record.type, null); assert.deepEqual(record.category, []);
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: record.id, sortBy: 'id' })).total, 1);
  assert.equal((await tool('search_workspace', { workspaceId: ws.id, query: record.id })).records[0].id, record.id);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Missing field' })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, classification: { type: null } })).statusCode, 400);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 1, config: classificationFixture().config })).statusCode, 400);
  await migrate(databaseURL, secret, baseURL);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).fields, []);
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'keyword' }, userCookie)).statusCode, 403);
  await sql`CREATE TRIGGER reject_standard_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_standard_journal ON sys_journal`.execute(runtime.db); }
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).columns, def.columns);
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'category' });
  assert.deepEqual(def.fields.map((field: { technicalName: string }) => field.technicalName), ['category']);
  const categoryConfig = { type: { required: false, defaultId: null }, status: { required: false, defaults: [] }, category: { required: false, multiple: false, defaultIds: [] }, options: [] };
  assert.equal((await ok('configure_classification', { objectTypeId: type.id, version: 1, config: categoryConfig })).classification.version, 1);
  await migrate(databaseURL, secret, baseURL);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: type.id })).fields.map((field: { technicalName: string }) => field.technicalName), ['category']);
  def = await ok('add_standard_field', { objectTypeId: type.id, field: 'type_status' });
  assert.deepEqual(def.fields.map((field: { technicalName: string }) => field.technicalName), ['category', 'type', 'status']);
  assert.equal((await api('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 409);
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'keyword' });
  assert.equal(def.fields.length, 4); assert.ok(def.fields.every((field: { required: boolean }) => !field.required));
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).version, 1);
  const updated = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Now named', classification: { type: null, status: null, category: [] } });
  assert.equal(updated.keyword, 'Now named');
  assert.equal((await ok('list_records', { objectTypeId: type.id, query: 'Now named', sortBy: 'keyword' })).total, 1);
  const history = (await sql<{ change_id: string }>`SELECT change_id FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND entity_kind = 'field' AND field_key = 'technical_name' AND new_value IN ('"type"'::jsonb, '"status"'::jsonb)`.execute(runtime.db)).rows;
  assert.equal(history.length, 2); assert.equal(new Set(history.map(entry => entry.change_id)).size, 1);
  const pair = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'pair', labels: { en: 'Pair only' }, standardFields: ['type_status'] });
  const pairConfig = classificationFixture().config;
  pairConfig.options = pairConfig.options.filter(option => option.kind !== 'category'); pairConfig.category.defaultIds = []; pairConfig.category.multiple = false;
  await tool('configure_classification', { objectTypeId: pair.id, version: 1, config: pairConfig });
  assert.equal((await ok('create_record', { objectTypeId: pair.id })).type, pairConfig.type.defaultId);
});

test('unused Types and Statuses can be deleted with journals, while record/history references and identities stay protected', async () => {
  const type = await classificationObject('deletechoices');
  const { config, typeA, typeB, statusA, statusB } = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Referenced' });
  const def = await tool('get_object_type', { objectTypeId: type.id });
  assert.equal(def.classification.options.find((option: { id: string }) => option.id === statusA).canDelete, false);
  assert.equal(def.classification.options.find((option: { id: string }) => option.id === statusB).canDelete, true);
  const removeTypeOnly = structuredClone(config); removeTypeOnly.options = removeTypeOnly.options.filter(option => option.id !== typeB);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removeTypeOnly })).statusCode, 400);
  const used = structuredClone(config); used.options = used.options.filter(option => option.id !== statusA); used.status.defaults = [];
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: used })).statusCode, 400);
  await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, classification: { type: null, status: null } });
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: used })).statusCode, 400, 'Historical references also protect choices');
  const removed = structuredClone(config); removed.options = removed.options.filter(option => !new Set<string>([typeB, statusB]).has(option.id));
  await sql`CREATE TRIGGER reject_delete_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removed })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_delete_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: type.id })).classification.options.length, config.options.length);
  const result = await tool('configure_classification', { objectTypeId: type.id, version: 2, config: removed });
  assert.equal(result.classification.version, 3);
  assert.equal(result.classification.options.length, config.options.length - 2);
  const entries = (await sql<{ change_id: string; old_value: { id: string }; new_value: unknown }>`SELECT change_id, old_value, new_value FROM sys_journal WHERE object_type_id = ${type.id}::uuid AND field_key = 'deleted'`.execute(runtime.db)).rows;
  assert.equal(entries.length, 2); assert.equal(new Set(entries.map(entry => entry.change_id)).size, 1);
  assert.deepEqual(entries.map(entry => entry.old_value.id).sort(), [typeB, statusB].sort()); assert.ok(entries.every(entry => entry.new_value === null));
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config })).statusCode, 400, 'Deleted identities cannot be reused');
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 2, config: removed })).statusCode, 409);
  const final = structuredClone(removed); final.options = final.options.filter(option => option.id !== typeA); final.type.defaultId = null; final.status.defaults = []; final.options = final.options.filter(option => option.id !== statusA);
  assert.equal((await api('configure_classification', { objectTypeId: type.id, version: 3, config: final })).statusCode, 400);
});

test('standard field labels and technical names are reserved even when optional fields are absent', async () => {
  const ws = await ok('create_workspace', { name: 'Reserved labels', code: 'reservedlabels' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  for (const name of ['keyword', 'type', 'status', 'category', 'typ', 'stichwort', 'kategorie']) assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: name, labels: { en: 'Custom' } })).statusCode, 400);
  for (const label of ['Keyword', 'Stichwort', 'Typ', 'Type', 'STATUS', 'Kategorie', 'Category', '  type  ', 'Ｋｅｙｗｏｒｄ']) assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'custom', labels: { en: label } })).statusCode, 400);
  assert.deepEqual((await tool('get_object_type', { objectTypeId: type.id })).fields, []);
  const custom = await ok('create_field', { objectTypeId: type.id, technicalName: 'custom', labels: { de: 'Eigene Angabe', en: 'Custom detail' } });
  assert.equal((await api('set_labels', { kind: 'field', id: custom.id, labels: { de: 'Status' } })).statusCode, 400);
  const error = await client.callTool({ name: 'configure_field', arguments: { fieldId: custom.id, required: true, kind: 'integer', labels: { en: 'Custom detail', de: 'Kategorie' } } });
  assert.equal(error.isError, true);
  const after = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(after.fields[0].kind, 'text'); assert.equal(after.fields[0].required, false); assert.equal(after.fields[0].labels.de, 'Eigene Angabe');
  assert.equal((await tool('add_standard_field', { objectTypeId: type.id, field: 'keyword' })).fields.length, 2);
});

test('instance Administrators assign workspace roles; users read settings and Designers configure only their own workspace through API/MCP', async () => {
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const ws = await ok('create_workspace', { name: 'Role workspace', code: 'roles' });
  const other = await ok('create_workspace', { name: 'Other workspace', code: 'otherroles' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' }, standardFields: ['keyword'] });
  const foreign = await ok('create_object_type', { workspaceId: other.id, technicalName: 'items', labels: { en: 'Other' }, standardFields: ['keyword'] });
  const foreignDef = await ok('get_object_type', { objectTypeId: foreign.id });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Private content' });
  const userRequest = (operation: Operation, payload: unknown) => api(operation, payload, userCookie);
  async function userTool(operation: Operation, args: unknown) {
    const response = await runtime.app.inject({ method: 'POST', url: '/mcp', headers: { host: '127.0.0.1:4100', cookie: userCookie, 'x-xobject-request': '1', accept: 'application/json, text/event-stream' }, payload: { jsonrpc: '2.0', id: 913, method: 'tools/call', params: { name: operation, arguments: args } } });
    assert.equal(response.statusCode, 200, response.body); return response.json().result;
  }
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 403);
  await tool('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: null });
  assert.deepEqual((await userRequest('list_workspaces', {})).json().map((item: { id: string; role: string }) => [item.id, item.role]), [[ws.id, 'user']]);
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 200);
  assert.equal((await userRequest('list_workspace_members', { workspaceId: ws.id })).statusCode, 200);
  assert.equal((await userRequest('list_object_types', { workspaceId: other.id })).statusCode, 403);
  assert.equal((await userRequest('get_object_type', { objectTypeId: foreign.id })).statusCode, 403);
  assert.equal((await userRequest('set_user_language', { language: 'de' })).statusCode, 200);
  for (const [operation, payload] of [
    ['set_workspace_name', { workspaceId: ws.id, name: 'Denied' }], ['set_workspace_language', { workspaceId: ws.id, language: 'en' }],
    ['create_object_type', { workspaceId: ws.id, technicalName: 'denied', labels: { en: 'Denied' } }], ['add_standard_field', { objectTypeId: type.id, field: 'category' }],
    ['create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } }], ['set_labels', { kind: 'object_type', id: type.id, labels: { en: 'Denied' } }],
    ['set_field_required', { fieldId: (await ok('get_object_type', { objectTypeId: type.id })).fields[0].id, required: false }],
  ] as [Operation, unknown][]) assert.equal((await userRequest(operation, payload)).statusCode, 403);
  assert.equal((await userTool('create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } })).isError, true);
  assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: null })).statusCode, 409);
  await sql`CREATE TRIGGER reject_membership_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_membership_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await userRequest('list_workspaces', {})).json()[0].role, 'user');
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  assert.equal((await userRequest('list_workspaces', {})).json()[0].role, 'designer');
  assert.equal((await userRequest('set_workspace_name', { workspaceId: ws.id, name: 'Designer workspace' })).statusCode, 200);
  assert.equal((await userRequest('set_workspace_language', { workspaceId: ws.id, language: 'de' })).statusCode, 200);
  const newField = await userTool('create_field', { objectTypeId: type.id, technicalName: 'detail', labels: { en: 'Detail' } }); assert.notEqual(newField.isError, true);
  const fieldId = JSON.parse(newField.content[0].text).id;
  assert.equal((await userRequest('configure_field', { fieldId, required: false, labels: { de: 'Angabe', en: 'Detail' } })).statusCode, 200);
  assert.equal((await userRequest('set_labels', { kind: 'object_type', id: type.id, labels: { en: 'Designer items' } })).statusCode, 200);
  assert.equal((await userRequest('add_standard_field', { objectTypeId: type.id, field: 'type_status' })).statusCode, 200);
  assert.equal((await userRequest('add_standard_field', { objectTypeId: type.id, field: 'category' })).statusCode, 200);
  assert.equal((await userRequest('configure_classification', { objectTypeId: type.id, version: 1, config: classificationFixture().config })).statusCode, 200);
  assert.equal((await userRequest('create_group', { workspaceId: ws.id, name: 'Team' })).statusCode, 200);
  assert.equal((await userRequest('create_object_type', { workspaceId: ws.id, technicalName: 'designed', labels: { en: 'Designed' } })).statusCode, 200);
  assert.equal((await userRequest('set_labels', { kind: 'field', id: foreignDef.fields[0].id, labels: { en: 'Foreign' } })).statusCode, 403);
  assert.equal((await userRequest('configure_field', { fieldId: foreignDef.fields[0].id, required: false })).statusCode, 403);
  assert.equal((await userRequest('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'designer', expectedRole: 'designer' })).statusCode, 403);
  assert.equal((await userRequest('list_users', {})).statusCode, 403);
  for (const [operation, payload] of [['get_record', { objectTypeId: type.id, recordId: record.id }], ['list_records', { objectTypeId: type.id }], ['get_journal', { objectTypeId: type.id, recordId: record.id }], ['create_record', { objectTypeId: type.id, keyword: 'Denied' }], ['update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Denied' }], ['search_workspace', { workspaceId: ws.id, query: 'Private' }]] as [Operation, unknown][]) assert.equal((await userRequest(operation, payload)).statusCode, 403, 'Designer does not grant content rights');
  await tool('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: 'user', expectedRole: 'designer' });
  assert.equal((await userTool('create_field', { objectTypeId: type.id, technicalName: 'revoked', labels: { en: 'Revoked' } })).isError, true);
  await ok('set_workspace_member', { workspaceId: ws.id, userId: ordinary.id, role: null, expectedRole: 'user' });
  assert.deepEqual((await userRequest('list_workspaces', {})).json(), []);
  assert.equal((await userRequest('get_object_type', { objectTypeId: type.id })).statusCode, 403);
  assert.ok((await ok('list_workspaces', {})).every((item: { role: string }) => item.role === 'administrator'));
  assert.equal((await api('set_workspace_member', { workspaceId: ws.id, userId: adminId, role: 'user', expectedRole: null })).statusCode, 400);
  const entries = (await sql<{ old_value: string | null; new_value: string | null }>`SELECT old_value, new_value FROM sys_journal WHERE workspace_id = ${ws.id}::uuid AND entity_kind = 'workspace_member' ORDER BY id`.execute(runtime.db)).rows;
  assert.deepEqual(entries, [{ old_value: null, new_value: 'user' }, { old_value: 'user', new_value: 'designer' }, { old_value: 'designer', new_value: 'user' }, { old_value: 'user', new_value: null }]);
});

test('field lifecycle preserves used values/history, supports preflighted reactivation and deletes only unused storage', async () => {
  const type = await classificationObject('fieldlife');
  const used = await ok('create_field', { objectTypeId: type.id, technicalName: 'amount', kind: 'integer', labels: { en: 'Amount' }, required: true });
  const empty = await ok('create_field', { objectTypeId: type.id, technicalName: 'spare', labels: { en: 'Spare' } });
  const bool = await ok('create_field', { objectTypeId: type.id, technicalName: 'flag', kind: 'boolean', labels: { en: 'Flag' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Keep', values: { amount: '0', flag: false } });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(def.fields.find((field: { id: string }) => field.id === used.id).canDelete, false);
  assert.equal(def.fields.find((field: { id: string }) => field.id === bool.id).canDelete, false);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted' })).statusCode, 400);
  await tool('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'inactive' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).amount, '0');
  const newRecord = await ok('create_record', { objectTypeId: type.id, keyword: 'No amount' });
  assert.equal(newRecord.amount, null);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { amount: '5' } })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'inactive', state: 'active' })).statusCode, 400);
  await ok('configure_field', { fieldId: used.id, required: false });
  await ok('set_definition_state', { kind: 'field', id: used.id, expectedState: 'inactive', state: 'active' });
  const changed = await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, values: { amount: null } });
  assert.equal(changed.amount, null);
  assert.equal((await api('set_definition_state', { kind: 'field', id: used.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400, 'Old values remain a usage reference');
  await sql`CREATE VIEW lifecycle_field_dependency AS SELECT spare FROM fieldlife_items`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 409); }
  finally { await sql`DROP VIEW lifecycle_field_dependency`.execute(runtime.db); }
  await sql`CREATE TRIGGER reject_lifecycle_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_lifecycle_journal ON sys_journal`.execute(runtime.db); }
  assert.ok((await ok('get_object_type', { objectTypeId: type.id })).columns.includes('spare'));
  await tool('set_definition_state', { kind: 'field', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(!def.columns.includes('spare')); assert.ok(!def.fields.some((field: { id: string }) => field.id === empty.id));
  assert.equal(def.historicalFields.find((field: { id: string }) => field.id === empty.id).label, 'Spare');
  const replacement = await ok('create_field', { objectTypeId: type.id, technicalName: 'spare', labels: { en: 'New spare' } });
  assert.notEqual(replacement.id, empty.id);
  assert.equal((await api('configure_field', { fieldId: empty.id, required: false })).statusCode, 404);
  const journal = await tool('get_definition_journal', { objectTypeId: type.id });
  assert.ok(journal.some((entry: { field_id: string; new_value: unknown }) => entry.field_id === empty.id && entry.new_value === 'deleted'));
  assert.equal((await ok('get_journal', { objectTypeId: type.id, recordId: record.id })).find((entry: { field_id: string }) => entry.field_id === used.id).new_value, '0');
});

test('object lifecycle hides inactive objects from normal lists, preserves readable records and retains deleted metadata', async () => {
  const ws = await ok('create_workspace', { name: 'Lifecycle', code: 'objectlife' });
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' }, standardFields: ['keyword'] });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Preserved' });
  await tool('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' });
  assert.equal((await ok('list_object_types', { workspaceId: ws.id })).length, 0);
  assert.equal((await ok('list_object_types', { workspaceId: ws.id, includeInactive: true }))[0].state, 'inactive');
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).keyword, 'Preserved');
  assert.equal((await ok('search_workspace', { workspaceId: ws.id, query: 'Preserved' })).records.length, 0);
  assert.equal((await api('create_record', { objectTypeId: type.id, keyword: 'Denied' })).statusCode, 400);
  assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Denied' })).statusCode, 400);
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'denied', labels: { en: 'Denied' } })).statusCode, 400);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'active' })).statusCode, 409);
  await ok('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'inactive', state: 'active' });
  assert.equal((await ok('get_record', { objectTypeId: type.id, recordId: record.id })).version, 1);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
  await sql`DELETE FROM objectlife_items WHERE id = ${record.id}::uuid`.execute(runtime.db);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400, 'Historical records protect the type');
  const empty = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'empty', labels: { en: 'Unused' }, standardFields: ['type_status', 'category'] });
  await sql`CREATE TRIGGER reject_object_delete_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 500); }
  finally { await sql`DROP TRIGGER reject_object_delete_journal ON sys_journal`.execute(runtime.db); }
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'active');
  await sql`CREATE VIEW lifecycle_type_dependency AS SELECT * FROM objectlife_empty`.execute(runtime.db);
  try { assert.equal((await api('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 409); }
  finally { await sql`DROP VIEW lifecycle_type_dependency`.execute(runtime.db); }
  await tool('set_definition_state', { kind: 'object_type', id: empty.id, expectedState: 'active', state: 'deleted', confirm: true });
  assert.equal((await sql<{ exists: string | null }>`SELECT to_regclass('objectlife_empty')::text AS exists`.execute(runtime.db)).rows[0].exists, null);
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'deleted');
  assert.ok((await ok('list_object_types', { workspaceId: ws.id, includeDeleted: true })).some((item: { id: string }) => item.id === empty.id));
  const replacement = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'empty', labels: { en: 'Replacement' } }); assert.notEqual(replacement.id, empty.id);
  assert.deepEqual((await ok('get_object_type', { objectTypeId: empty.id })).columns, []);
  assert.ok((await tool('get_definition_journal', { objectTypeId: empty.id })).some((entry: { field_key: string; new_value: string }) => entry.field_key === 'state' && entry.new_value === 'deleted'));
  await migrate(databaseURL, secret, baseURL);
  assert.equal((await ok('get_object_type', { objectTypeId: empty.id })).state, 'deleted');
  assert.deepEqual((await ok('get_object_type', { objectTypeId: replacement.id })).fields, []);
});

test('standard-field lifecycle keeps Type/Status together, resets deleted input aids and obeys workspace/protection rights', async () => {
  const type = await classificationObject('standardlife');
  const fixture = classificationFixture();
  await ok('configure_classification', { objectTypeId: type.id, version: 1, config: fixture.config });
  let def = await ok('get_object_type', { objectTypeId: type.id });
  const typeField = def.fields.find((field: { technicalName: string }) => field.technicalName === 'type');
  await ok('set_definition_state', { kind: 'field', id: typeField.id, expectedState: 'active', state: 'inactive' });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(def.fields.filter((field: { kind: string }) => ['type', 'status'].includes(field.kind)).every((field: { state: string }) => field.state === 'inactive'));
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'No pair' }); assert.equal(record.type, null); assert.equal(record.status, null);
  assert.equal((await api('create_record', { objectTypeId: type.id, classification: { type: fixture.typeA } })).statusCode, 400);
  await tool('set_definition_state', { kind: 'field', id: typeField.id, expectedState: 'inactive', state: 'deleted', confirm: true });
  def = await ok('get_object_type', { objectTypeId: type.id });
  assert.ok(!def.columns.includes('type') && !def.columns.includes('status')); assert.equal(def.classification.type.defaultId, null);
  assert.ok(!def.classification.options.some((option: { kind: string }) => ['type', 'status'].includes(option.kind)));
  def = await tool('add_standard_field', { objectTypeId: type.id, field: 'type_status' });
  assert.notEqual(def.fields.find((field: { technicalName: string }) => field.technicalName === 'type').id, typeField.id);
  const emptyType = await classificationObject('protectedlife');
  const protectedField = (await ok('get_object_type', { objectTypeId: emptyType.id })).fields[0];
  await sql`UPDATE sys_fields SET is_protected = true WHERE id = ${protectedField.id}::uuid`.execute(runtime.db);
  assert.equal((await api('set_definition_state', { kind: 'field', id: protectedField.id, expectedState: 'active', state: 'inactive' })).statusCode, 403);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: emptyType.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 403);
  const ordinary = (await sql<{ id: string }>`SELECT id FROM sys_users WHERE email = 'user@example.test'`.execute(runtime.db)).rows[0];
  const wsId = def.workspaceId;
  await ok('set_workspace_member', { workspaceId: wsId, userId: ordinary.id, role: 'user', expectedRole: null });
  assert.equal((await api('get_definition_journal', { objectTypeId: type.id }, userCookie)).statusCode, 200);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 403);
  await ok('set_workspace_member', { workspaceId: wsId, userId: ordinary.id, role: 'designer', expectedRole: 'user' });
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 200);
  assert.equal((await api('set_definition_state', { kind: 'object_type', id: emptyType.id, expectedState: 'active', state: 'inactive' }, userCookie)).statusCode, 403);
});


test('empty classification-only records retain creation history through API/MCP and prevent definition deletion', async () => {
  const ws = await ok('create_workspace', { name: 'Empty record history', code: 'emptyhistory' });
  for (const [index, create] of [ok, tool].entries()) {
    const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: `items_${index}`, labels: { en: 'Items' }, standardFields: ['type_status', 'category'] });
    const record = await create('create_record', { objectTypeId: type.id });
    const journal = await ok('get_journal', { objectTypeId: type.id, recordId: record.id });
    assert.equal(journal.length, 1);
    assert.equal(journal[0].field_key, 'created');
    assert.equal(journal[0].field_id, null);
    assert.equal(journal[0].new_value, true);
    await ok('update_record', { objectTypeId: type.id, recordId: record.id, version: record.version });
    assert.deepEqual(await ok('get_journal', { objectTypeId: type.id, recordId: record.id }), journal);
    await sql`DELETE FROM ${sql.table(`emptyhistory_items_${index}`)} WHERE id = ${record.id}::uuid`.execute(runtime.db);
    assert.equal((await api('set_definition_state', { kind: 'object_type', id: type.id, expectedState: 'active', state: 'deleted', confirm: true })).statusCode, 400);
    assert.equal((await ok('get_object_type', { objectTypeId: type.id })).canDelete, false);
  }
});
