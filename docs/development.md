# Local development

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
4. Run `npm run dev`. The development server listens on `127.0.0.1:4100`. Open `http://127.0.0.1:4100` for the web interface. The command builds shared contracts and the web client before starting Fastify.
5. Stop the development database with `docker compose --env-file .env -f deploy/compose.dev.yaml down`. Its named volume is retained. Integration tests use separate disposable containers and do not touch that volume.

The root development commands read `.env` through Node's environment-file support. No credentials or default administrator account are provided in the repository. The database container uses the unmodified official PostgreSQL image.

## Web interface

The React/Vite client uses standard Radix-based shadcn/ui components and Tailwind semantic tokens in `apps/web/src/index.css`. Adjust appearance through those variables and existing component variants. UI strings live in `apps/web/src/lib/i18n.ts`; definition labels come from PostgreSQL. Record contents are never translated.

The server serves `apps/web/dist` and API/auth/MCP from one origin. For frontend iteration, leave `npm run dev` running and run `npm run dev:web` in a second terminal. Vite rebuilds on changes; refresh the browser afterwards. There is deliberately no cross-origin development proxy or relaxed auth origin check. Restart the backend after server changes.

The client covers login/logout, workspace selection/creation, object and text-field creation, Keyword search with 25-row pagination, record creation/editing and record journals. Conflicting versions are rejected by the backend; unsaved record edits prompt before navigation. Language follows the user preference or workspace default. Theme is local to the browser; authentication uses the server session cookie. Business data and credentials are not persisted in browser local storage.

Shared operation schemas and wire types live in `packages/contracts`; all three workspaces build from the root. Browser validation supplements the same backend rules used by HTTP and MCP. The entire experiment still requires an Administrator account; it is not the complete permissions model or version-1 acceptance.

## HTTP and MCP interface

Sign in by sending a JSON `POST` request to `/api/auth/sign-in/email` with `email` and `password`. Preserve the returned session cookie. Better Auth also provides session lookup and sign-out under `/api/auth/`.

For this experiment, each application operation is a JSON `POST` to `/api/v1/<operation>`. This operation-oriented adapter is not the final REST/OpenAPI contract. The identical operation names are MCP tools at `/mcp`:

| Operation | Input |
| --- | --- |
| `create_workspace` | `name`, `code`, optional `defaultLanguage` (`en` by default) |
| `list_workspaces` | Empty object |
| `create_object_type` | `workspaceId`, `technicalName`, `labels` |
| `list_object_types` | `workspaceId`; returns localized object names |
| `list_records` | `objectTypeId`, optional literal Keyword `query`, `limit` (1–100, default 25), `offset` |
| `create_field` | `objectTypeId`, `technicalName`, `labels`; text only |
| `get_object_type` | `objectTypeId`; returns labels, resolved names, fields and physical column names |
| `set_labels` | `kind` (`object_type` or `field`), definition `id`, complete replacement `labels` map |
| `set_workspace_language` | `workspaceId`, `language` (`de` or `en`) |
| `set_user_language` | Own preference `language` (`de`, `en` or null to inherit) |
| `create_record` | `objectTypeId`, `keyword`, optional `values` map |
| `update_record` | `objectTypeId`, `recordId`, expected `version`, optional `keyword` and `values` |
| `get_record` | `objectTypeId`, `recordId` |
| `get_journal` | `objectTypeId`, `recordId` |

Send `Content-Type: application/json`, the current session cookie and `X-XObject-Request: 1`. Requests with an Origin must match `BASE_URL`; Host must match its configured host/port. No cross-origin web access is enabled. An agent cannot provide a user ID to impersonate a different account. Non-administrators are denied in this spike.

The MCP endpoint supports stateless Streamable HTTP POST requests with JSON responses. GET/DELETE return 405. For local evaluation, configure the MCP client's request headers with the current session cookie and `X-XObject-Request: 1`; do not store these credentials in a committed configuration. This proves the MCP/application integration without claiming a production OAuth/token flow.

Example operation bodies, sent in order using the IDs returned by earlier calls:

```json
{"name":"ITextreme","code":"itx","defaultLanguage":"de"}
```

```json
{"workspaceId":"<workspace UUID>","technicalName":"vehicles","labels":{"de":"Fahrzeuge","en":"Vehicles"}}
```

```json
{"objectTypeId":"<object type UUID>","technicalName":"registration","labels":{"de":"Kennzeichen","en":"Registration"}}
```

```json
{"objectTypeId":"<object type UUID>","keyword":"Delivery van","values":{"registration":"ITX 1"}}
```

This creates the physical table `itx_vehicles` and its `registration` text column. Table prefixes are readable names, not an authorization mechanism.

## Labels, language preferences and column order

Definition names use `labels` JSONB maps; they accept at least one of `de` and `en`. Technical table and field names stay English and stable. `get_object_type` returns both the raw maps and a derived `label`, resolved using the current user's preference and workspace default. The stored Keyword and other contents are never translated. The Keyword definition itself has fixed `de: Stichwort` / `en: Keyword` labels.

`set_labels` replaces a custom definition's complete labels map. Preference and label changes are journaled; assigning an unchanged value does not add a change entry. The current Administrator-only restriction still applies to all application operations, including the preference operations. A user-language journal event has no workspace ID because the account is installation-wide.

Stop the development HTTP process before applying schema changes, then restart it after `npm run db:migrate`. For earlier local databases, this command preserves scalar labels under the undetermined-language key `und`. Explicitly replace known labels through `set_labels` when their languages are known. Existing business records, definition IDs, journal rows and physical column order are retained. Newly created tables use `id`, `keyword`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`, followed by custom columns as they are added. No table rebuild is performed for ordering. See [ADR 0003](adr/0003-localized-labels-and-column-order.md).

## What the experiment establishes

The tests exercise persisted credential hashes and sessions, identical API/MCP behavior, stable UUIDv7 identities, per-field journal entries, rejected invalid names and writes, two workspaces with the same object name, stale/concurrent edit rejection and full rollback on journal failure, including table/column creation.

It does not deliver all shared fields, collections, relationships, CRM/PM modules, memberships, Designer/User rights, field/record permissions, complete authentication-event journaling, production migrations, production MCP authorization or a release package. No product requirement or complete acceptance scenario is marked fulfilled solely by this test.
