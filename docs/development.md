# Backend technical spike

This is a local experiment, not a software release or the official self-hosting package. Use disposable data. The [PRD](PRD.md) remains the product specification; [ADR 0002](adr/0002-backend-technical-spike.md) explains the experiment's design and limits.

## Requirements

- Node.js 24 LTS and npm; the package engine range also permits Node.js 25/26 for local evaluation.
- Docker with a running daemon, for the development PostgreSQL container and integration tests.
- Run the following commands from the repository root.

## Install and verify

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Tests start their own temporary PostgreSQL container on a random loopback port and remove it afterwards. They do not use `.env`, the development database or an existing server. The first run downloads the official PostgreSQL image if necessary. The GitHub workflow repeats these checks on Node.js 24.

## Run locally

1. Copy `.env.example` to `.env`. Replace the database-password placeholder in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same random value; hexadecimal values avoid URL-escaping issues. Replace `BETTER_AUTH_SECRET` with an independently generated random secret of at least 32 characters. Keep the file private; it is ignored by Git.
2. Start PostgreSQL and wait for its health check:

   ```sh
   docker compose --env-file .env -f deploy/compose.dev.yaml up -d --wait
   npm run db:migrate
   ```

3. Supply `ADMIN_EMAIL`, `ADMIN_NAME` and a strong `ADMIN_PASSWORD` of at least 12 characters in the local process environment, then run `npm run admin:create`. Remove those provisioning variables afterwards. This is a local operator command; there is no public signup endpoint. Repeating it for an existing email fails rather than changing that account's privileges.
4. Run `npm run dev`. The development server listens on `127.0.0.1:4100`. There is no web interface yet.
5. Stop the development database with `docker compose --env-file .env -f deploy/compose.dev.yaml down`. Its named volume is retained. Integration tests use separate disposable containers and do not touch that volume.

The root development commands read `.env` through Node's environment-file support. No credentials or default administrator account are provided in the repository. The database container uses the unmodified official PostgreSQL image.

## HTTP and MCP interface

Sign in by sending a JSON `POST` request to `/api/auth/sign-in/email` with `email` and `password`. Preserve the returned session cookie. Better Auth also provides session lookup and sign-out under `/api/auth/`.

For this experiment, each application operation is a JSON `POST` to `/api/v1/<operation>`. This operation-oriented adapter is not the final REST/OpenAPI contract. The identical operation names are MCP tools at `/mcp`:

| Operation | Input |
| --- | --- |
| `create_workspace` | `name`, `code` |
| `list_workspaces` | Empty object |
| `create_object_type` | `workspaceId`, `technicalName`, `label` |
| `create_field` | `objectTypeId`, `technicalName`, `label`; text only |
| `create_record` | `objectTypeId`, `keyword`, optional `values` map |
| `update_record` | `objectTypeId`, `recordId`, expected `version`, optional `keyword` and `values` |
| `get_record` | `objectTypeId`, `recordId` |
| `get_journal` | `objectTypeId`, `recordId` |

Send `Content-Type: application/json`, the current session cookie and `X-XObject-Request: 1`. Requests with an Origin must match `BASE_URL`; Host must match its configured host/port. No cross-origin web access is enabled. An agent cannot provide a user ID to impersonate a different account. Non-administrators are denied in this spike.

The MCP endpoint supports stateless Streamable HTTP POST requests with JSON responses. GET/DELETE return 405. For local evaluation, configure the MCP client's request headers with the current session cookie and `X-XObject-Request: 1`; do not store these credentials in a committed configuration. This proves the MCP/application integration without claiming a production OAuth/token flow.

Example operation bodies, sent in order using the IDs returned by earlier calls:

```json
{"name":"ITextreme","code":"itx"}
```

```json
{"workspaceId":"<workspace UUID>","technicalName":"vehicles","label":"Vehicles"}
```

```json
{"objectTypeId":"<object type UUID>","technicalName":"registration","label":"Registration"}
```

```json
{"objectTypeId":"<object type UUID>","keyword":"Delivery van","values":{"registration":"ITX 1"}}
```

This creates the physical table `itx_vehicles` and its `registration` text column. Table prefixes are readable names, not an authorization mechanism.

## What the experiment establishes

The tests exercise persisted credential hashes and sessions, identical API/MCP behavior, stable UUIDv7 identities, per-field journal entries, rejected invalid names and writes, two workspaces with the same object name, stale/concurrent edit rejection and full rollback on journal failure, including table/column creation.

It does not deliver the web client, all shared fields, collections, relationships, CRM/PM modules, memberships, Designer/User rights, field/record permissions, auth-event journaling, production migrations, production MCP authorization, pagination or a release package. No product requirement or complete acceptance scenario is marked fulfilled solely by this test.
