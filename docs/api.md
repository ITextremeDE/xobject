# API and MCP access

xObject exposes the same application operations through REST and MCP. Both channels resolve the acting user's current account, workspace, object, record and field permissions for every operation. Navigation visibility and possession of a token grant no additional business rights.

## Create and manage access

Open **Settings → Personal → Account & security → API & MCP access**. Choose **Create access token**, enter an application/agent name, select REST API and/or MCP, choose 30, 90 or 365 days and optionally restrict it to read-only access. Confirm with your current local password. The API accepts an explicit future expiry within 366 days; there are at most 50 unexpired, unrevoked tokens per user.

Copy the secret from the one-time result and store it in a secret manager. It is never returned by list operations, journal entries or subsequent requests. The server stores a SHA-256 hash of a cryptographically random 256-bit secret, not the bearer token. Revoked/expired metadata remains available for inspection; the secret cannot be recovered. Creating a replacement and revoking the previous token provides rotation.

The list shows name, permitted channels, permission restriction, expiration, last successful operation and state. Revoke one token or all of your tokens. Administrators can inspect/revoke another user's access from **User management → user → API & MCP access**. Creation is always for the current user, requires an unexpired interactive session and password confirmation, and cannot be performed with another bearer token. Listing/revocation also require an interactive session. Deactivating a user or changing their password revokes their tokens; role, membership and content-permission changes apply immediately without reissuing tokens. Revocation is serialized with application operations: an already executing transaction may finish before revocation, but later operations cannot use the revoked token.

The token's name identifies its application/agent in journal metadata alongside the actual user, channel and credential UUID. A bearer client cannot supply or override its acting user or audit identity. Passwords, bearer tokens and stored hashes are never journaled. Password confirmation has a bounded per-process failed-attempt guard; this is not a distributed gateway rate limiter.

## REST

Use HTTPS. Plain HTTP is suitable only for a loopback development instance. Send tokens in the Authorization header, never in URLs or request bodies. Do not send a browser session cookie together with a bearer token.

```sh
curl --request POST 'https://your-xobject.example/api/v1/list_workspaces' \
  --header "Authorization: Bearer $XOBJECT_TOKEN" \
  --header 'X-XObject-API-Version: 1' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

Every named operation is a JSON `POST /api/v1/<operation>`. Inputs reject unknown properties and share validation with MCP. Successful responses contain the operation's direct result; errors have `error` (human-readable), `code` (machine-readable), and optional `details`/validation `issues`. Clients should branch on HTTP status and machine code rather than wording. Common statuses are 400 invalid input, 401 invalid/missing/expired access, 403 forbidden, 404 unavailable target, 409 version/dependency/uniqueness conflict, 429 rate limit and 500 internal failure. Authentication failures for a bearer request include a Bearer challenge. Secrets and request bodies are excluded from application logs; logged request URLs omit query strings.

Cookie-authenticated browser `POST` requests additionally require `X-XObject-Request: 1`; Host and any supplied Origin must match the configured application origin. Read-only contract GETs can use the authenticated browser cookie directly. Token-only calls do not require the browser's CSRF header. No cross-origin browser access or alternate authorization bypass is enabled by these endpoints.

## Contract and versions

- `GET /api/v1/openapi.json`: authenticated OpenAPI 3.1 document with input and output JSON Schemas for all 80 application operations, authentication alternatives and error envelopes.
- `GET /api/v1/contract`: authenticated operation manifest with the same schemas and references.
- [Generated contract](../packages/contracts/api-v1.openapi.json): the versioned source artifact; [shared contracts](../packages/contracts/src/index.ts) own its types/validation. `npm run api:generate` regenerates it and `npm run api:check` rejects drift. The TypeScript schema generator is a build dependency, not part of the running HTTP server.

The API contract is `1.0.0`, independent of application version `0.0.0`. Requests can pin major version `1` with `X-XObject-API-Version`; another major is rejected before execution. Responses identify their contract through `X-XObject-API-Version: 1.0.0`. External clients should pin the major and reject incompatible successful responses. Compatible additions may add optional fields/operations; callers should tolerate additional response fields. Breaking changes require a new explicit major contract/endpoint and documented client changes rather than silent reinterpretation. The application remains unreleased; current-installation rebuild policy is [ADR 0028](adr/0028-current-installation-baseline.md). This document does not declare a software release or historical-schema compatibility.

The typed bearer client is exported as `@xobject/contracts/client` within the shared package:

```ts
import { createApiClient } from '@xobject/contracts/client';

const client = createApiClient({
  baseUrl: 'https://your-xobject.example/',
  token: process.env.XOBJECT_TOKEN!,
});
const workspaces = await client.call('list_workspaces', {});
```

It sends versioned JSON without cookies, redirects, token persistence or automatic retries. It rejects non-HTTPS origins except loopback, propagates machine-readable errors and accepts an AbortSignal. Mutations must not be blindly retried after an unknown network outcome; inspect the current record/version before deciding what to do. Versioned writes reject stale records/definitions atomically. An aborted HTTP request does not imply that a committed transaction was undone.

## MCP

Use the stateless Streamable HTTP endpoint `/mcp`, with the same Bearer header and preferably `X-XObject-API-Version: 1`. A token must permit the MCP channel. The MCP server advertises `xobject` version `1.0.0`; the SDK-negotiated MCP protocol version is separate from this application contract.

All 80 operation names and input schemas are exposed as tools. Read-only/destructive annotations assist clients but grant no authority. Successful tool text contains the operation's JSON result; tool failures use `isError` with the shared JSON error envelope. Transport authentication can fail before tool execution. A long-lived client cannot outlive revocation: each HTTP request authenticates, and every operation rechecks the credential in its application transaction. Token-management and password/session operations require an interactive session rather than bearer access.

The read-only resource `xobject://api/v1/openapi` supplies the complete input/output contract to MCP-only clients. No OAuth server, SSO or third-party consent flow is supplied by these personal access tokens.

## Permanent deletion

`permanently_delete_record` requires a recycled record, current Full access, its version and `confirm: true`. It removes the live row and operational edges, not the immutable journal. Required relationships/Primary ancestors of surviving records must remain valid; otherwise the whole operation fails. Business numbers remain reserved, while removed operational edges no longer reserve cardinality slots.

Installation Administrators can use `list_deleted_records` and `list_record_journal` with `includeDeleted: true` to inspect retained history. The Administrator list includes the last display Keyword captured before deletion, including derived Contact names; query text searches that caption or the record ID. `objectTypeId`, `sortBy` and `sortDirection` apply before counts and paging. Other users cannot list deleted identities or read their retained captions. In an authorized, previously visible context they receive only a content-free deletion notice, including in surviving linked-record history. Frozen event/field/context eligibility and current account, workspace, object, field and graded ownership/foreign-access rules are both required; later grants do not reveal previously hidden events. Raw historical values/snapshots remain Administrator-only through REST, MCP, paging/counts and detail views. See [ADR 0029](adr/0029-record-recycle-bin.md).
