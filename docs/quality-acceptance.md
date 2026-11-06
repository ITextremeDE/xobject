# Local quality acceptance

This report describes the current unreleased candidate. Local evidence does not establish a published release, a production SLA or client/model compatibility.

## Permission and query performance

Run `npm run measure:permissions` from the repository root. The command creates and removes its own isolated PostgreSQL 18 container; it never loads the development database. Its local result is written under `.local/permission-performance.json`.

The measured profile contains 10,250 records across ten objects, including five custom sensitive objects, 20 nested groups, a foreign-owner group and 3,000 relationships. Sensitive records mix direct ownership, group ownership, foreign access, public access and denied Personal records; 80% are readable. Field exceptions remain applied. Each read scenario uses 48 requests with concurrency eight after three warmups; writes use 24 sequential optimistic-version updates with journals.

Initial targets were set before measurement. The accepted local run used Node.js 26.9.0 on macOS ARM64 and PostgreSQL 18 in Docker. Fastify HTTP injection includes session/authentication, database and application work; it excludes TLS and network latency.

| Scenario | p95 target | Measured p95 |
| --- | ---: | ---: |
| Object list | 750 ms | 140.4 ms |
| Workspace list | 750 ms | 301.4 ms |
| Global search | 750 ms | 231.7 ms |
| Dashboard | 1,500 ms | 281.0 ms |
| Record | 750 ms | 47.6 ms |
| Incident relationships | 1,000 ms | 247.7 ms |
| Versioned update and journal | 1,000 ms | 40.5 ms |

Equivalent record-level access explanations are reused only within the current object/transaction. Each row retains its own field policy; no cross-request authorization cache exists. Relationship inspection queries incident edges through existing endpoint indexes. All 163 backend tests passed after these changes. Production sizing still requires the actual host, latency, distribution and concurrency profile.

## Accessibility and responsive use

Use the existing shared shadcn primitives, associated form labels, visible keyboard focus, guarded dialogs, keyboard table navigation and command menu. The acceptance target is WCAG 2.2 AA for the supported workflows; an automated result is only one part of that assessment.

Local Playwright Chromium checks cover desktop 1440 × 1000 and mobile 390 × 844. OAuth consent/application revocation and documentation navigation/search were exercised without console errors or horizontal page overflow. Axe reported no serious/critical findings in the tested consent and documentation views. Documentation search corrects a pinned upstream accessible-name mismatch through Starlight's supported composition hook. Whole-product manual and assistive-technology acceptance remains a release gate, rather than being inferred from those focused checks.

## Installation and recovery

The [self-hosting guide](self-hosting.md) defines the current operator path. Isolated Linux/ARM64 container acceptance covers first setup, HTTP content/history, private checksummed backup, content mutation, stopped-writer restore, integrity verification, current-target maintenance and refusal/recovery for an unsupported source fingerprint. Node.js 24 is the image runtime. The same procedure also passes with the Linux/AMD64 application/operator image under emulation on the ARM64 Docker host, using native PostgreSQL 18. This is architecture/emulation evidence, not native AMD64-host acceptance. The separate Caddy loopback-HTTPS test passes with its local CA, canonical Host, secure cookies, spoofed-IP replacement, Origin rejection and HTTPS OAuth metadata. It reserves the fixed proxy address outside Docker’s dynamic pool. Live public TLS, the actual supported host and released-predecessor migrations remain separate delivery gates.

## Provider acceptance

The primary OpenAI path passed live acceptance on **2026-11-06** using **Codex CLI 0.158.0 and `gpt-6-astra`**, the existing ChatGPT account, xObject API `1.0.0` and official MCP SDK `2.4.0`. A preliminary `gpt-6-sol` run exercised discovery. Codex negotiated **2025-06-18** by default; a separate run with its opt-in `mcp_2026_07_28` feature exercised **2026-07-28** discovery and result envelopes. Both used local Streamable HTTP. This is evidence for those combinations, not every OpenAI model or client.

Fresh, ephemeral model runs used fictional data and the normal User, Designer and Administrator accounts. Application data was accessible only through MCP, without repository, SQL or direct-API assistance. The packaged-skill exercise additionally allowed reading only the installed plugin's canonical instruction files. Independent operator checks used application readback, credential metadata, journals and the web UI; model success messages alone were not acceptance evidence.

| Area | Observed outcome |
| --- | --- |
| Discovery and workflows | The model discovered current definitions/input aids, created a Contact person under one Organization, built Contact → Project → Case → Tasks chains in two workspaces, edited records and completed a Task through the configured status meaning, Progress and completion instant. Workspace-specific record numbers and distinct descriptions/Notes were retained. |
| Permissions | User reads omitted a restricted field and denied a Personal record; attempted field/definition writes failed without partial changes. Administrator reads included the retained values. Designer definition rights granted no content automatically; an explicit grant on the new test object enabled valid creation while its required-field failure left no partial row. |
| Credentials | Personal tokens, read-only denial and loss of access after actual expiry/revocation were exercised through live clients. OAuth used the actual Codex CIMD identity, browser sign-in/consent, callback/code exchange and automatic renewal. A model-driven OAuth write was independently matched to its user, Codex client and issued OAuth credential. |
| Concurrency | The model requested clarification for identical names. With an unambiguous record number, a deliberately concurrent write caused a version conflict; rereading and reconciliation preserved the reviewer's text and appended the requested note exactly once. |
| Lifecycle | An unsaved duplicate allocated no persisted copy. A saved duplicate passed recycle/restore/recycle; missing permanent-delete confirmation was rejected. Confirmed deletion retained full Administrator history and only a content-free notice for the formerly authorized User. The original remained unchanged. |
| Skills | All four workflows were read and used through permission-filtered MCP resources. The portable plugin was also installed locally; Foundation and Projects instructions matched their canonical hashes and were read from the installed package and used with MCP. This was separate from resource loading. |
| Independent checks | Record/relationship readback confirmed one direct Primary parent, preserved ancestors, completion fields in one journal change, current user/credential/channel provenance, rejected-write atomicity and valid installation integrity. The resulting Task rendered with its number, ownership, chain, Done status and 100% Progress without page errors; the OAuth consent flow also had no page errors. |

The test exposed two usability gaps, now corrected: `get_access_context` supplies the authenticated user's ID/name, and field-value schemas, tool descriptions, errors and Foundation guidance distinguish `values` technical-name keys from field/option/reference IDs. Four focused backend cases, contract generation/typechecking, application build and packaging checks cover these changes.

Native MCP Skills list/get/activation was **not exposed or negotiated** in the tested Codex paths, including the current-protocol run. Ordinary resources and installed plugin instructions worked; neither establishes native extension activation. ChatGPT app/cloud and Responses API integration, other providers, public TLS and the supported external deployment host were not exercised by this test. Whole-product accessibility and final release acceptance remain separate gates.

### Repeat the model exercise

1. Use a disposable fictional installation, activate the intended modules and prepare reviewed User/Designer/Administrator accounts with deliberate field/record restrictions. Complete normal first-password changes and issue short-lived user-bound MCP credentials or authorize OAuth. Retain client approval controls; explicitly authorize any automated fixture writes and the one disposable permanent-deletion target.
2. Start a fresh client conversation with MCP as its only business-data path. Ask it to discover the workspace and create an Organization-linked Project, Case and three Tasks with different descriptions/Notes, then complete one Task. Supply human-readable names/numbers rather than installation IDs. Exercise Contacts and model design with their actual schemas and configured rights.
3. Repeat the denial, requiredness, conflict and lifecycle cases above. Revoke/expire a credential after a successful call in the same running client. Check resource-based and packaged-skill loading independently; record unsupported client capabilities explicitly.
4. Independently compare records, relationships, versions and journals with the requested outcome. Record client/model/protocol/authentication and actual errors. Revoke test access and remove temporary client/plugin registrations; retain recoverable fixture evidence without changing unrelated data.

The broader SDK suite separately covers schema validation, PKCE/resource binding, scopes, token management and permission-aware Skills digests/direct-read denial. See [API and MCP](api.md) for connection and compatibility boundaries.

## Browser identity and live refresh — 2026-11-06

The local implementation in ADR 0036 was checked with repository type checking, server/web builds and targeted metadata/URL/merge/SSE-framing tests. Real disposable-PostgreSQL scenarios verify commit-only deduplicated signals, rollback after queued NOTIFY, API/MCP journal parity, existing record/classification/localization/security rollback guards, hidden-record filtering, retained-reference access-loss invalidation and stream closure on session revocation. Additional server checks cover generic metadata/manifest, deep routes, cookie-only live access, cross-origin rejection and watch-list bounds. The supplied pinned Caddy configuration validates with SSE excluded from compression.

An isolated Chromium context verified a clean form adopting an external API change without navigation/reload, an unsaved local keyword surviving a concurrent write, explicit draft/latest conflict review and normal saving of the reviewed draft. The saved test record was restored to its original keyword. Desktop (1440×1000) and mobile (390×844) screenshots showed no horizontal overflow or browser errors. Offline/focus, a simulated background HTTP 500 for both record/session refresh and a successful retry retained the unsaved draft. Other checks verified all favicon/install/share assets, generic private HTML, parsed manifest with no Chromium installability errors, current light/dark theme color, offline/reconnect status and an explicit app-update reload. No public reading was enabled.

Actual operating-system app installation, native share destinations, external preview-crawler caches and Safari/Firefox/other-device acceptance were not exercised. The browser checks used local Chromium on loopback; they are not a public deployment or cross-platform acceptance claim. Stream bounds and the one-minute fixed safety resynchronization are documented in ADR 0036.

## Selection trees and shared choice dialogs — 2026-11-06

Four shared tree-helper scenarios verify ancestor closure, independent branches, descendant removal, hierarchy validation, activation, sibling ordering and display order independently of canonical UUID storage. Five targeted disposable-PostgreSQL scenarios cover object and relationship-owned tree fields, API/MCP writes, safe/unsafe conversions, Category defaults/ancestor propagation, record/edge/endpoint versions, history, journal rollback and existing both-endpoint attribute permissions. The existing complete demo fixture scenario passes with all new hierarchy definitions and layouts. Root type checking, generated API-contract checks and server/web builds pass.

Desktop and mobile browser checks exercise searchable tree selection by keyboard, automatic ancestor checkboxes, parent-only selection, descendant deselection, Apply/Save, Cancel preservation, general tree fields independent of Category and the flat multiple-choice list. An additional concurrency check retains a changed dialog selection through an external API edit, applies it with the save shortcut, merges the independent remote edit and saves both. Unchanged selections cannot be submitted. Settled dialog screenshots show no horizontal overflow at 1440×1000 and 390×844; no browser page errors were observed. These are local Chromium checks, not a cross-platform accessibility certification.

The disposable local database was recreated from the current schema after retaining a private pre-change database/account-fixture snapshot. All three scenarios contain single/multiple/tree Category and one independent general tree field; schema fingerprint/readback passes. The restored Administrator identity uses the existing locally selected credentials; generated fictional accounts retain the normal first-password-change policy. No release, push or public deployment occurred.

## URL-field navigation — 2026-11-06

The shared URL input is used by general URL fields and structured Contact websites. Focused validation checks HTTP(S) URLs and rejects empty, malformed, relative and non-web schemes. Web type checking/build pass. A Chrome check on a fictional Workshop tools record verified the native anchor's target/rel attributes and an actual second tab at the configured example URL, preserving the original record page. This was a local UI check; it did not change stored data.

## Stable live-update navigation — 2026-11-06

The shared live-update hook delays connecting notices by 1.5 seconds and scopes the pending notice to the current workspace. Normal visible-record subscription renewals no longer insert/remove a banner during navigation. Offline feedback remains immediate. Web type checking/build and a Chrome check across Tasks, Projects and Dashboard passed without the transient notice. Tab-scoped network emulation verified immediate offline feedback, a visible notice during a deliberately slow reconnect and automatic removal after recovery; normal network conditions were restored afterward.
