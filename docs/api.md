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

Call `get_access_context` to identify the authenticated `user.id`, `user.name` and `isAdmin`; obtain workspace roles separately from `list_workspaces`. Use that user identity for requests such as assigning work to yourself, rather than inferring it from a member list. For record writes, `values` keys are the writable field `technicalName` strings returned by `get_object_type`, not field UUIDs. Supply Keyword separately; record numbers and derived Contact names are computed. Field UUIDs identify definition/permission targets, while choice/reference values retain their discovered option/user/group IDs. Relationship-attribute writes are separate: `relationshipAttributes[].values` uses the relationship field UUIDs from its definition; follow that nested schema rather than the top-level record map.

### Classification list filters

`list_records.classificationFilters` accepts optional `type`, `status` and `category` arrays of discovered option UUIDs or `null`. Values within an array combine with OR; dimensions combine with AND. `null` matches an unset Type/Status or empty Category. Omitted/empty arrays do not restrict that dimension. Each array allows at most 100 distinct values. Retained inactive options remain filterable. Unknown options or unavailable classification fields are rejected.

Category arrays select at least one matching value. Tree records already retain their ancestors: selecting a parent finds its descendant selections; selecting a leaf does not add its parents to the filter. Queries exclude records whose filtered field is unreadable before counts/paging; a globally unreadable field cannot be filtered. Search, filters and sorting share the authorized result. These rules apply identically to REST and MCP.

## Contract and versions

- `GET /api/v1/openapi.json`: authenticated OpenAPI 3.1 document with input and output JSON Schemas for all application operations, authentication alternatives and error envelopes.
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

All operation names and input/output schemas are exposed as tools. Output schemas reuse the generated REST contract and contain only reachable definitions. Read-only/destructive annotations assist clients but grant no authority. Successful tools return schema-validated `structuredContent` and JSON text; the official SDK projects non-object results for negotiated older revisions. Modern requests use MCP 2026-07-28 discovery, per-request metadata and result envelopes; the SDK also serves stateless 2025-era clients. Tool reads are marked read-only/idempotent, writes conservatively destructive/non-idempotent, and all operations closed-world. Hints do not authorize automatic retries. Successful tool text contains the operation's JSON result; application tool failures use `isError` with the shared JSON error envelope. SDK argument-validation failures can instead return its standard `isError` text result before the application callback runs; clients must not assume every failed result contains JSON. Transport authentication can fail before tool execution. A long-lived client cannot outlive revocation: each HTTP request authenticates, and every operation rechecks the credential in its application transaction. Token-management and password/session operations require an interactive session rather than bearer access.

The read-only resource `xobject://api/v1/openapi` supplies the complete input/output contract to MCP-only clients. Personal access tokens are independent of the OAuth flow below. External SSO remains later scope.

### OAuth authorization

MCP clients can discover `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server/api/auth`. The maintained Better Auth 1.7.18 MCP/OAuth/CIMD plugins implement Authorization Code with S256 PKCE and signed, expiring consent continuations. Client identity uses HTTPS Client ID Metadata Documents under the MCP 2026-07-28 profile. The Node transport validates DNS answers, pins the approved public address and refuses redirects/private addresses. Anonymous dynamic registration, client-credentials grants and external SSO are not enabled.

Clients request the canonical `<BASE_URL>/mcp` resource and `xobject:read` or `xobject:write` (read/change) scopes. Optional `offline_access` enables rotating refresh tokens. Access tokens are opaque, hashed at rest and valid for 15 minutes; refresh tokens have seven-day validity with strict replay handling. This Bearer-only profile advertises no DPoP signing algorithms and rejects sender-constrained tokens. No session JWT or arbitrary third-party token is accepted. REST continues using personal access tokens; OAuth tokens are bound to MCP.

The login/consent pages show the verified application identity, requested access and return address. Consent does not widen current business permissions. Every MCP request and application transaction rechecks token expiry/revocation, resource, scope, active user, first-password-change state, active client and attached session. Password changes and account deactivation revoke OAuth tokens. Session termination invalidates attached access. Issuance/refresh is serialized with application security mutations; token state changes are journaled atomically without tokens/hashes/codes/proofs.

**Settings → Personal → Account & security → Authorized applications** lists current token/refresh/consent grants, including applications whose access token has expired but refresh/consent remains. Revoke removes your application's consent and revokes its access/refresh tokens. Authorization management requires an interactive session, including through the shared API/MCP operation names; delegated agents cannot grant themselves more access.

Local SDK acceptance covers discovery, explicit consent, tampered-query rejection, PKCE code exchange, structured read/write, read-only restriction, resource mismatch, refresh, interactive-management denial, revocation and secret-free journals. Actual Codex OAuth authorization, renewal and model-driven access also passed the [live provider exercise](quality-acceptance.md#provider-acceptance); skill loading paths are distinguished below.

### Client compatibility and acceptance

MCP connects a **client/host** to xObject. Model tool-use capability and client support for the negotiated MCP revision, transport and authentication are all required. Support for MCP by a vendor is not proof of tested xObject compatibility.

| Client path | Documentation-supported connection | xObject acceptance status |
| --- | --- | --- |
| OpenAI Codex (local desktop/CLI/IDE path) | Streamable HTTP with configured Bearer or OAuth credentials. A local client can reach local xObject. | CLI path passed live model-driven acceptance on 2026-11-06; exact versions/protocols and limits are in the [quality report](quality-acceptance.md#provider-acceptance). Desktop/IDE surfaces are not independently certified by that run. |
| OpenAI ChatGPT plugin/app path | MCP integration subject to account/workspace features, plugin setup, authentication and endpoint reachability. | Additional OpenAI coverage when available; not yet executed. |
| OpenAI Responses API | Remote MCP with authorization; supported private connectivity can replace public exposure. The selected model must support the MCP tool. | Additional OpenAI coverage only with separately available API access; not yet executed. |
| Anthropic Claude API MCP connector | Documented remote Streamable HTTP/tool-call path; supported features differ by client/product. | Documentation assessed only; untested, outside V1 provider acceptance. |
| Google Gemini Interactions API | Documented remote Streamable HTTP tool path with optional request headers. | Documentation assessed only; untested, outside V1 provider acceptance. |
| Other MCP clients and locally hosted models | A suitable MCP client can bridge a tool-capable model to the same endpoint. | No blanket compatibility claim; evaluate the concrete client/model combination later. |

Documentation reviewed on 2026-11-05: [OpenAI client setup](https://developers.openai.com/codex/mcp), [OpenAI Responses MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [Claude MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector), [Gemini remote MCP](https://aistudio.google.com/docs/function-calling#mcp). These are connection possibilities, not xObject test receipts. A subscription to an assistant does not establish API access, model availability or permission to use every integration feature. Record exact versions/models and supported capabilities when testing rather than maintaining an assumed universal model list.

The pinned official server/client SDKs are 2.4.0. Local integration tests exercise MCP 2026-07-28 discovery, structured results, schema validation, permission-aware Skills and the SDK's 2025-11-25 stateless path. The separate live Codex exercise covers actual model calls and personal/OAuth access; it does not extend compatibility to untested clients. [PRD section 9.2](PRD.md#92-mcp-interoperability-and-v1-acceptance) defines OpenAI-only provider acceptance. SDK integration tests do not call a paid model.

### Supplied skills

The versioned [skill sources](../apps/server/src/skills/) provide the shared foundation, Contacts & Relations, Projects & Tasks and model-design workflows. The build includes their canonical `SKILL.md` files. They inspect current definitions/rights and use normal tools for work; they contain no installation-specific UUIDs.

The official [MCP Skills Extension](https://skills.extensions.modelcontextprotocol.io/) declares `io.modelcontextprotocol/skills`, with `skills/list`, `skills/get` and file reads through resources. Foundation is available to authenticated application users. Module workflows require an active module and readable contributed objects in an accessible workspace. Model design requires a workspace Designer/Administrator role. Each discovery/read rechecks current context; denied and unlisted file URIs cannot be read directly. Resources are private with zero cache lifetime. The SDK client verifies file size/digest and frontmatter in local acceptance.

The live Codex exercise discovered/read all four permitted workflows through resources and separately loaded/used Foundation and Projects from an installed [OpenAI plugin package](agent-plugin.md). The tested client did not expose/negotiate native MCP Skills activation, even in its current-protocol run. Resource reads and packaged instructions therefore remain the proven paths. The plugin generator and portable manifests are locally verified; the temporary test installation was removed, and no public-directory submission occurred. Other providers remain untested under the existing acceptance policy.

## Permanent deletion

`permanently_delete_record` requires a recycled record, current Full access, its version and `confirm: true`. It removes the live row and operational edges, not the immutable journal. Required relationships/Primary ancestors of surviving records must remain valid; otherwise the whole operation fails. Record numbers remain reserved, while removed operational edges no longer reserve cardinality slots.

Installation Administrators can use `list_deleted_records` and `list_record_journal` with `includeDeleted: true` to inspect retained history. The Administrator list includes the last display Keyword captured before deletion, including derived Contact names; query text searches that caption or the record ID. `objectTypeId`, `sortBy` and `sortDirection` apply before counts and paging. Other users cannot list deleted identities or read their retained captions. In an authorized, previously visible context they receive only a content-free deletion notice, including in surviving linked-record history. Frozen event/field/context eligibility and current account, workspace, object, field and graded ownership/foreign-access rules are both required; later grants do not reveal previously hidden events. Raw historical values/snapshots remain Administrator-only through REST, MCP, paging/counts and detail views. See [ADR 0029](adr/0029-record-recycle-bin.md).

## Duplicate drafts

`get_record_duplicate` reads an authorized creation draft without allocating an identity, record number or journal event. It requires Duplicate on the source and Create on its object; only readable, initially writable, active values are copied. Unique values, derived values, record numbers, ownership and relationships are omitted. The response includes the source version.

The web client opens the ordinary new-record form with those values. Saving calls `create_record` with `duplicateFrom` (source ID/version), so Duplicate/Create and the current source version are checked again atomically. The user can edit fields and add relationships before saving; ordinary validation and creation defaults apply. Canceling leaves no new record. `duplicate_record` remains the immediate server-side copy operation for clients that deliberately need one-step duplication.

## Browser-only freshness transport

The interactive web client uses same-origin cookie-authenticated POST `/api/events` with `X-XObject-Request: 1` and `{workspaceId, watched: [{objectTypeId, recordId}]}` (at most 200 references). It is a bounded refresh-hint SSE stream, not a business mutation API or a durable change feed. PAT/OAuth credentials are rejected on this browser route. `ready` includes the web build ID; `refresh` carries no record data; `session` expires the local session; fixed `heartbeat` events keep the connection alive. Clients reload normal authorized queries after readiness/reconnect. API/MCP mutations generate the same commit notifications automatically. The public generic `/api/client-info` and `/manifest.webmanifest` routes provide installation metadata. See ADR 0036.

## Selection trees

Use custom `kind: "tree_choice"` with normal choice options plus optional `parentId` UUIDs. Category uses `category: {required, multiple: true, tree: true, defaultIds}` and Category options with optional same-object Category `parentId`. Create/update/default values may name leaves; the shared backend stores their complete ancestor-closed UUID set. To deselect a parent, submit a set excluding both it and its descendants; submitting a descendant selects that parent again. Flat multiple choice remains `multiple_choice` with no parent assignments. All definitions, conversions, rights and journal operations use the existing versioned endpoints/tools; see ADR 0037 for limits and configuration behavior.
