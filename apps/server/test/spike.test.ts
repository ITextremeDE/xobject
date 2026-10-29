import { after, before, test } from 'node:test';
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
    await sql`INSERT INTO sys_administrators (user_id) VALUES (${adminId})`.execute(runtime.db);
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
  const type = await tool('create_object_type', { workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Vehicles' } });
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
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'vehicles', labels: { en: 'Other vehicles' } });
  assert.equal(type.tableName, 'other_vehicles');
  for (const code of ['sys', 'bad_code', 'Bad', '1bad']) {
    assert.equal((await api('create_workspace', { name: 'Invalid', code })).statusCode, 400);
  }
  assert.equal((await api('create_workspace', { name: 'Duplicate', code: 'itx' })).statusCode, 409);
  for (const name of ['id', 'keyword', 'select', 'bad-name', 'x'.repeat(63)]) {
    assert.equal((await api('create_object_type', { workspaceId: ws.id, technicalName: name, labels: { en: 'Invalid' } })).statusCode, 400);
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
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', labels: { en: 'Items' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Original' });
  await sql`CREATE FUNCTION reject_test_journal() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Induced journal failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Should roll back' })).statusCode, 500);
    assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('create_object_type', { workspaceId: ws.id, technicalName: 'rolled_back', labels: { en: 'Rolled back' } })).statusCode, 500);
    assert.equal((await api('set_labels', { kind: 'object_type', id: type.id, labels: { de: 'Geändert' } })).statusCode, 500);
    assert.equal((await api('set_workspace_language', { workspaceId: ws.id, language: 'de' })).statusCode, 500);
    assert.equal((await api('set_user_language', { language: 'de' })).statusCode, 500);
  } finally { await sql`DROP TRIGGER reject_journal ON sys_journal`.execute(runtime.db); }
  const after = await ok('get_record', { objectTypeId: type.id, recordId: record.id });
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
  const type = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'concurrent', labels: { en: 'Concurrent edits' } });
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
  const type = await tool('create_object_type', { workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', labels: { de: 'Kennzeichen', en: 'Registration' } });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Lieferwagen' });
  let definition = await ok('get_object_type', { objectTypeId: type.id });
  assert.equal(definition.label, 'Fahrzeuge');
  assert.deepEqual(definition.columns, ['id', 'keyword', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'registration']);
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

test('upgrading legacy scalar labels preserves identities, records, journal and old column order', async () => {
  const { connect } = await import('../src/database.js');
  await exec('docker', ['exec', container, 'createdb', '-U', 'postgres', 'xobject_legacy_test']);
  const legacyURL = databaseURL.replace('/xobject_test', '/xobject_legacy_test');
  await migrate(legacyURL, secret, baseURL);
  const { db, pool } = connect(legacyURL);
  const { Application } = await import('../src/domain.js');
  try {
    const auth = createAuth(pool, secret, baseURL, true);
    const user = await auth.api.signUpEmail({ body: { email: 'legacy@example.test', name: 'Legacy', password: 'test-password-legacy' } });
    await sql`INSERT INTO sys_administrators (user_id) VALUES (${user.user.id})`.execute(db);
    const application = new Application(db);
    const workspace = await application.execute('create_workspace', { code: 'legacy', name: 'Legacy' }, user.user.id) as { id: string };
    const type = await application.execute('create_object_type', { workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Original label' } }, user.user.id) as { id: string };
    const record = await application.execute('create_record', { objectTypeId: type.id, keyword: 'Existing record' }, user.user.id) as { id: string };
    // Recreate the previous scalar-label/preference schema in this disposable database.
    for (const name of ['sys_object_types', 'sys_fields']) {
      await sql`ALTER TABLE ${sql.table(name)} ALTER COLUMN labels TYPE text USING labels->>'en'`.execute(db);
      await sql`ALTER TABLE ${sql.table(name)} RENAME COLUMN labels TO label`.execute(db);
    }
    await sql`ALTER TABLE sys_workspaces DROP COLUMN default_language`.execute(db);
    await sql`ALTER TABLE sys_users DROP COLUMN language`.execute(db);
    const beforeColumns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'legacy_items' ORDER BY ordinal_position`.execute(db);
    const beforeJournal = await sql`SELECT * FROM sys_journal ORDER BY id`.execute(db);
    await migrate(legacyURL, secret, baseURL);
    await migrate(legacyURL, secret, baseURL);
    const labels = await sql<{ labels: unknown }>`SELECT labels FROM sys_object_types WHERE id = ${type.id}::uuid`.execute(db);
    assert.deepEqual(labels.rows[0].labels, { und: 'Original label' });
    const afterColumns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'legacy_items' ORDER BY ordinal_position`.execute(db);
    assert.deepEqual(afterColumns.rows, beforeColumns.rows);
    assert.deepEqual((await sql`SELECT * FROM sys_journal ORDER BY id`.execute(db)).rows, beforeJournal.rows);
    const readback = await application.execute('get_record', { objectTypeId: type.id, recordId: record.id }, user.user.id) as { keyword: string };
    assert.equal(readback.keyword, 'Existing record');
    assert.equal((await application.execute('get_object_type', { objectTypeId: type.id }, user.user.id) as { label: string }).label, 'Original label');
  } finally { await db.destroy(); }
});

test('object/record lists are scoped, localized, paginated and search literal keywords through API and MCP', async () => {
  const workspace = await ok('create_workspace', { code: 'lists', name: 'Lists', defaultLanguage: 'de' });
  const type = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'items', labels: { de: 'Einträge', en: 'Items' } });
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
  const type = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'items', labels: { en: 'Items' } });
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
  const type = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge', en: 'Vehicles' } });
  const second = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'notes', labels: { de: 'Notizen' } });
  const outsider = await ok('create_object_type', { workspaceId: other.id, technicalName: 'vehicles', labels: { de: 'Fahrzeuge' } });
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
