import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { sql } from 'kysely';
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
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await exec('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'xobject_test']); ready = true; break; }
    catch { await setTimeout(250); }
  }
  assert.ok(ready, 'Temporary PostgreSQL must become ready');
  databaseURL = `postgres://postgres:xobject_test_only@${mapping}/xobject_test`;
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
  const type = await tool('create_object_type', { workspaceId: ws.id, technicalName: 'vehicles', label: 'Vehicles' });
  assert.equal(type.tableName, 'itx_vehicles');
  assert.equal(type.id[14], '7');
  const field = await ok('create_field', { objectTypeId: type.id, technicalName: 'registration', label: 'Registration' });
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
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'vehicles', label: 'Other vehicles' });
  assert.equal(type.tableName, 'other_vehicles');
  for (const code of ['sys', 'bad_code', 'Bad', '1bad']) {
    assert.equal((await api('create_workspace', { name: 'Invalid', code })).statusCode, 400);
  }
  assert.equal((await api('create_workspace', { name: 'Duplicate', code: 'itx' })).statusCode, 409);
  for (const name of ['id', 'keyword', 'select', 'bad-name', 'x'.repeat(63)]) {
    assert.equal((await api('create_object_type', { workspaceId: ws.id, technicalName: name, label: 'Invalid' })).statusCode, 400);
  }
  assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'version', label: 'Invalid' })).statusCode, 400);
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
  const type = await ok('create_object_type', { workspaceId: ws.id, technicalName: 'items', label: 'Items' });
  const record = await ok('create_record', { objectTypeId: type.id, keyword: 'Original' });
  await sql`CREATE FUNCTION reject_test_journal() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Induced journal failure'; END $$`.execute(runtime.db);
  await sql`CREATE TRIGGER reject_journal BEFORE INSERT ON sys_journal FOR EACH ROW EXECUTE FUNCTION reject_test_journal()`.execute(runtime.db);
  try {
    assert.equal((await api('update_record', { objectTypeId: type.id, recordId: record.id, version: 1, keyword: 'Should roll back' })).statusCode, 500);
    assert.equal((await api('create_field', { objectTypeId: type.id, technicalName: 'rolled_back', label: 'Rolled back' })).statusCode, 500);
    assert.equal((await api('create_object_type', { workspaceId: ws.id, technicalName: 'rolled_back', label: 'Rolled back' })).statusCode, 500);
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
});

test('concurrent edits cannot silently overwrite each other', async () => {
  const workspaces = await ok('list_workspaces', {});
  const workspace = workspaces.find((w: { code: string }) => w.code === 'rollback');
  const type = await ok('create_object_type', { workspaceId: workspace.id, technicalName: 'concurrent', label: 'Concurrent edits' });
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
