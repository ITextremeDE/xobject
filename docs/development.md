# Local development

This guide describes source development against the published Community 1.0.2 baseline and subsequent unreleased changes. Use the [self-hosting guide](self-hosting.md) for released installation and maintenance. Use fictional, disposable development data; retain offline recovery artifacts separately when they exist. The [PRD](PRD.md) defines the product target; [the documentation index](README.md) identifies the applicable architecture decisions. The current ownership/foreign-access model is implemented locally under ADR 0027; recorded acceptance and deferred features are listed below.

## Requirements

- Node.js 24 LTS and npm. The root engine range also permits Node.js 25/26 for local evaluation.
- Docker with a running daemon for the official PostgreSQL development container and isolated integration tests.
- Run application commands from the repository root. The independent website has its own package/lockfile under `apps/site` and [website guide](website.md).

## Install and verify

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Tests start and remove an isolated PostgreSQL container on a random loopback port; they do not use `.env`, an existing server or the development database. The first run may download the pinned official image. The root [Application checks workflow](../.github/workflows/checks.yml) repeats these commands on Node.js 24. There is no application lint command. Run only checks relevant to the actual change; documentation-only edits require link/structure/reference and whitespace checks, not application builds.

## Run locally

1. Copy `.env.example` to `.env`. Use the same independently generated bootstrap password in `POSTGRES_PASSWORD` and `OPERATOR_DATABASE_URL`, a different runtime password in `DATABASE_URL`, and an independent `BETTER_AUTH_SECRET` of at least 32 characters. Hexadecimal passwords avoid URL-escaping issues. Keep this ignored file private.
2. Start the database, then initialize explicitly:

   ```sh
   docker compose --env-file .env -f deploy/compose.dev.yaml up -d --wait
   npm run db:init
   ```

3. Supply `ADMIN_EMAIL`, `ADMIN_NAME` and a strong `ADMIN_PASSWORD` of 12–128 characters in the local process environment, then run `npm run admin:create`. Remove provisioning variables afterwards. Repeating this command for an existing email fails rather than modifying the account. No default credentials or public signup are shipped.
4. Run `npm run dev` and open `http://127.0.0.1:4100`. It builds contracts and browser assets before starting Fastify. The HTTP service verifies the current schema; it does not initialize or upgrade it.
5. For frontend iteration, leave the server running and run `npm run dev:web` in another terminal. This rebuilds browser assets on changes; refresh the browser. Restart the backend after server changes.
6. Stop the HTTP process with Ctrl+C. Stop PostgreSQL with `docker compose --env-file .env -f deploy/compose.dev.yaml down`; its named data volume is retained. Do not add `--volumes` to ordinary shutdown.

Root development commands read `.env` through Node's environment-file support. PostgreSQL uses the unmodified pinned official image and listens on `127.0.0.1:5410`. The application serves auth/API/MCP and `apps/web/dist` from the same origin. Host must match the configured `BASE_URL` host/port; supplied Origin must match its origin. A hostname mismatch can produce `Unexpected Host`; use the configured URL or deliberately update the local configuration and restart. Do not relax the checks for a second development origin.

Every build clears its generated output before compiling. Refresh open development clients after rebuilding. Generated bundles are disposable and are not retained for older application clients.

## Current database installation and SQL inspection

[ADR 0028](adr/0028-current-installation-baseline.md) distinguishes disposable development resets from supported released-version upgrades. The [operator guide](self-hosting.md#upgrade-from-100-or-101-to-102) documents the supported 1.0.0/1.0.1 → 1.0.2 authorization-journal migration; future schema-changing released updates require dedicated migrations. `apps/server/src/schema.sql` is the current application schema, including constraints, indexes and deferred integrity functions/triggers. The pinned Better Auth schema API creates its own authentication tables. `module-catalog.json` supplies the initial module definitions. The base schema, shared OAuth journal fragment and module catalog are copied into the server build and contribute to the installation fingerprint.

`npm run db:init` installs this model into an empty database. The only initial rows are the three module definitions and the single `sys_schema_version` fingerprint/version row. No accounts, sessions, workspaces, groups, object definitions, records, policies or journals are preloaded. Repeating initialization against an identical current installation changes nothing and closes every connection. A different or unrecognized schema is rejected without adoption, repair or upgrade.

`OPERATOR_DATABASE_URL` is the initialization/provisioning connection. `DATABASE_URL` uses a distinct restricted runtime role. Runtime can create dynamic business tables, read/append journals and read the schema marker; it cannot mutate journals or the installation marker. Operator credentials stay out of the HTTP process environment in a packaged installation; the local ignored `.env` is a development convenience. See [ADR 0022](adr/0022-database-integrity-and-concurrency.md).

### Current fictional demo

The optional `dev:seed` command supplies three independent fictional scenarios: a general feature laboratory, an IT-service company and a small family/household. They have different contents, custom object types, number formats and workspace memberships/rights. All available modules are enabled and supplied forms remain canonical. The [demo guide](demo-data.md) owns the current account matrix, object/record counts, numbering, appearance and feature-coverage examples.

The seed uses ordinary application operations and requires a provisioned Administrator and an empty business database. It never overwrites existing workspaces. Generated initial credentials are stored only in ignored local receipts and must be changed at first sign-in; installation itself creates no demo accounts or business contents.

### Rebuild the disposable local instance

Stop the application, then run `npm run db:reset`. This explicitly discards and recreates only `xobject_dev` on `127.0.0.1:5410`, initializes the current schema and provisions the runtime role. It requires `OPERATOR_DATABASE_URL` and refuses other hosts, ports or database names. It does not restore an older fixture or create accounts. Provision the first Administrator with `npm run admin:create`, then start `npm run dev`. Optional `dev:seed` creates fictional test content through current application operations and requires an empty business database.

The development instance is disposable. Whenever a change requires it, rebuild the affected generated assets and current database, provision the first Administrator and reapply the current demo seed; do not retain outdated test schemas, interfaces, fixtures or compatibility tests. Preserve unrelated work and offline recovery artifacts. After the first release, supported updates must fully migrate data/schema/configuration to the target model before serving it. Dedicated upgrade tooling may interpret released source formats; application code supports only the resulting current model. Initial release updates use a maintenance window: stop application processes and other writers, back up database/configuration consistently, migrate, verify the target schema/integrity, then start the target version. Failures keep the app stopped until consistent recovery with the matching application version. Mixed-version rolling updates are outside the initial scope; see ADR 0028. The concrete migration/backup/restore tooling is not implemented by the current initializer.

### Physical layout

System tables use `sys_`; business tables use `<workspace_code>_<object_name>`. The current system schema groups identity/scope, attributes/configuration, lifecycle/version and audit metadata directly in its CREATE definitions. Authentication column types/defaults follow Better Auth. Dynamic business tables start with `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`; installed business fields append in creation order. Display order is configured independently.

Access principals are a protected virtual system field derived from `sys_record_security.policy.owners`; no business-table column duplicates them. A missing sensitive-record policy is an integrity error, never an implicit Full/public policy. Supplied object UUIDs live once in `sys_module_object_bindings`; Primary context selects its fixed Contact/Project/Case roles from those bindings. DbGate may inspect the database with an appropriate private connection. Direct SQL bypasses application validation/journaling and is not a supported content API.

Contacts supplies nine typed JSONB contact codecs under ADR 0032. `list_field_schemas` returns installed schema keys and bilingual names. `create_field`/`configure_field` use kind `structured` plus `config.schema`; list-like codecs also have configurable UUID context options. Entry IDs/order, preference and optional birthday year are explicit values. Arbitrary JSON and unsafe nonempty kind/schema conversions are rejected. Structured columns expose read-only summaries and do not support scalar sorting or uniqueness. Existing field rights apply to the entire collection; each write has one immutable per-field event with optional `detail_context` component/entry paths.

Base Contacts activation creates Contacts and Distribution lists with protected field/relationship-purpose bindings. Virtual Contact Keyword/formatted/Organization names have no storage columns and cannot be assigned. Company/name/controller/Organization rights constrain derived projections before search/counts; real membership and Identities edges have the ordinary lifecycle/history rules. Direct Contact professional fields, relationship attributes and the temporal codec are implemented. Structured Contact references, recurrence and calendar parties remain planned. See ADR 0032 for the staged boundary and later refinements.

## HTTP and MCP interface

Sign in through JSON `POST /api/auth/sign-in/email` with `email` and `password` and preserve the session cookie. Auth also exposes the supported session lookup/sign-out routes. Generic auth profile/account mutations cannot bypass the application layer. Every application operation is a JSON `POST /api/v1/<operation>` and an identically named MCP tool at `/mcp`.

Send `Content-Type: application/json`, the current session cookie and `X-XObject-Request: 1`. MCP uses stateless Streamable HTTP POST with SDK-managed JSON/SSE responses; GET/DELETE return 405. Cookie transport is a local evaluation mechanism; external clients use personal Bearer credentials or the OAuth flow in the API guide. An agent cannot submit a different user identity to impersonate another account.

The canonical input schemas, defaults, limits and output mappings live in [shared contracts](../packages/contracts/src/index.ts). The [API guide](api.md) owns protocol/authentication details, operation discovery and the generated OpenAPI contract; use it instead of a separately maintained operation inventory.

The versioned REST/OpenAPI and MCP contracts are documented in the [API guide](api.md); generated schemas are checked against the shared source. Content reads/writes apply current actor-bound grants inside the transaction. Definition and workspace configuration use User/Designer roles; Administrator-only security operations remain separate. Expected versions reject stale drafts with 409; do not automatically retry them with a new version. No-op operations do not fabricate changes, and journals commit atomically with mutations.

Example bodies, sent in order with the identities returned by previous calls:

```json
{"name":"ITextreme","code":"itx","defaultLanguage":"de","timeZone":"Europe/Berlin"}
```

```json
{"workspaceId":"<workspace UUID>","technicalName":"vehicles","labels":{"de":"Fahrzeuge","en":"Vehicles"},"standardFields":["keyword"]}
```

```json
{"objectTypeId":"<object type UUID>","technicalName":"registration","labels":{"de":"Kennzeichen","en":"Registration"}}
```

```json
{"objectTypeId":"<object type UUID>","keyword":"Delivery van","values":{"registration":"ITX 1"}}
```

This creates `itx_vehicles` with a text `registration` column. For non-admin users, configure explicit local object/field grants first. Names/labels alone never confer rights.

## Web interface and URLs

The React/Vite client uses Base UI-based shadcn `base-nova`, semantic Tailwind tokens and shared contracts. The shell follows Sidebar 07, search placement Sidebar 02, Settings Sidebar 13, record lists the Tasks reference and the Dashboard dashboard-01. Prefer standard primitives and composition; no global cursor-pointer override or arbitrary component CSS. The current component baseline and rules are recorded in [AGENTS.md](../AGENTS.md).

| URL | View |
| --- | --- |
| `/` | First accessible workspace or initial workspace creation |
| `/settings` | Settings over the originating workspace/view; direct entry uses a default accessible context |
| `/w/itx` | ITextreme Dashboard |
| `/w/itx/objects/vehicles` | Vehicle record list |
| `/w/itx/objects/vehicles/new` | Unsaved record creation |
| `/w/itx/objects/vehicles/<UUID>` | Saved record details |

Lists retain search/sort/filter/page state in URL parameters; invalid values fall back to supported defaults. Keyword/record-number search and supported active-field/metadata sorting run on the server before pagination, with stable tie-breakers. Missing Keyword uses the UUID. Browser storage contains only presentation preferences such as theme and account/view-scoped column visibility, never business values or credentials.

Record pages share one full-width creation/edit form. Save replaces `new` with its UUID. Drafts survive tab switches; Tree/Dossier/Journal show saved state. Back returns to the validated originating list/Dashboard, or the source record for linked creation, preserving appropriate list parameters/focus. Direct entry falls back to the object's list. Internal and Back/Forward navigation share discard guards; reload/tab exit uses the native before-unload guard. Pending saves block navigation. Missing routes/assets/API errors retain their proper handling. Clicking the exact active Sidebar destination refetches view data without a document reload or lost URL state.

### Settings layout and navigation

Personal settings are Profile, Account & security, Appearance, Language & region. Workspace settings are General, Appearance, Language & region, Modules, Object types, Relationship types, Form designer, Members & roles, User groups. Instance settings are User management and Journal for Administrators only. Desktop/mobile navigation and breadcrumbs share one definition.

The viewport-constrained 960 × 720 px preferred Settings frame uses the Sidebar 13 composition: background dialog, sidebar/footer surface, and rounded muted functional sections. Forms and nested editors share section spacing, framed technical disclosures and consistent action placement. The deleted-definition toggle sits below the object chooser. Object labels/sensitivity save together through `configure_object_settings`; Designers may edit permitted labels, while security changes remain Administrator-only.

Creation dialogs use Cancel/Create; editors use Close/Reset/Save where applicable. Normal dialogs offer a localized X; decision confirmations use explicit actions without an X. Pending/dirty guards cover all close paths. Root-footer actions use native form association. Section changes retain drafts; membership/activation actions identified as immediate save directly. Object/field administration is alphabetical, separate from configured form order. Requiredness uses consistent Yes/No controls and read-only table indicators.

### Sidebar search and keyboard interaction

The scrollable command menu combines permitted local navigation with authorized workspace record search. Local navigation has no minimum query length. Remote search requires two characters, is debounced, and searches readable Keywords (UUID fallback), permitted record numbers, localized object names and technical names. It does not search arbitrary custom values or journal text. Overflow flags ask the user to refine the query. Normal workspace members can search content permitted by ADRs 0026 and 0027; metadata access alone grants no result. Production full-text indexing and measured scaling remain open.

Shortcuts live in `apps/web/src/lib/keyboard.ts`; Base UI owns native widget navigation and focus. Both user menus expose Settings and keyboard help. Preserve visible hints and normal browser shortcuts:

- Command/Ctrl+K opens sidebar search, including from text inputs, while respecting another open modal/menu.
- `/` focuses the current record-table search outside editable controls/menus/dialogs.
- Command/Ctrl+Enter submits the focused opted-in form, respecting validation, pending state and key repeats.
- Tab/Shift+Tab, arrows, Enter/Space and Escape retain native widget behavior and focus return.
- Tree navigation uses roving focus, arrows, Home/End, Space to expand and Enter to open. The upstream Sidebar Command/Ctrl+B handler is disabled.

## Feature references and current boundaries

Detailed behavior belongs to the following ADRs rather than duplicate implementation descriptions in this guide:

| Capability | Authority and delivery boundary |
| --- | --- |
| Readable names, labels and SQL order | ADRs [0001](adr/0001-readable-workspace-table-names.md) and [0003](adr/0003-localized-labels-and-column-order.md); fixed technical identities, optional standards append later. |
| Classification and typed fields | ADRs [0006](adr/0006-record-classification.md) and [0007](adr/0007-custom-field-types.md); configured requiredness/options, precise strings, safe conversions, protected kinds and journals. Descriptions, input hints, typed defaults, scalar uniqueness and automatic record numbers are implemented in ADR [0030](adr/0030-field-input-rules-and-record-numbers.md). |
| Roles, groups and content policy | ADRs [0008](adr/0008-workspace-roles.md), [0013](adr/0013-workspace-groups.md), [0026](adr/0026-content-permissions.md) and [0027](adr/0027-ownership-and-foreign-access.md); object/field ceilings, graded/nested membership, ownership and foreign access implemented locally. |
| Definition lifecycle | [ADR 0009](adr/0009-definition-lifecycle.md); deactivation/reactivation and deletion only when unused, retained tombstones/history. Record recycling/restoration is implemented under ADR 0029; controlled permanent deletion retains Administrator-only history. |
| External API/MCP access | [ADR 0034](adr/0034-user-bound-api-mcp-access.md) and [API guide](api.md); personal expiring tokens, channel/read-only restrictions, owner/Admin revocation, current-rights enforcement, journal provenance and generated input/output contracts. |
| Profile, passwords and instance users | ADRs [0010](adr/0010-account-security.md) and [0015](adr/0015-instance-administration-and-journal.md); mandatory initial-password changes, own sessions, reversible users. Email change and image upload remain deferred; the [self-hosting guide](self-hosting.md) describes first-Administrator setup. |
| Appearance and localization | ADRs [0011](adr/0011-workspace-appearance.md), [0012](adr/0012-workspace-languages.md), [0014](adr/0014-time-zones-and-regional-display.md); shared workspace design, shipped de/en packs, personal inheritance and exact regional/DST-aware inputs. |
| Dashboard, tables and navigation | ADRs [0004](adr/0004-first-web-interface.md), [0016](adr/0016-dashboard-and-shared-table-navigation.md), [0017](adr/0017-record-pages-and-local-demo-data.md); shared tables/pagination and real authorized metrics. Statistic/chart content remains exploratory; the Dashboard table is part of the normal UI. |
| Relationships and linked creation | ADRs [0018](adr/0018-relationship-type-definitions.md), [0019](adr/0019-record-relationships.md), [0021](adr/0021-relationship-scope-and-projects-module.md), [0024](adr/0024-primary-levels-and-relationship-conditions.md); original scope refined by later decisions. General is core, Primary Projects-owned, custom types have one pair. Single targets are fields; multiple targets are tables. |
| Tree and Dossier | [ADR 0020](adr/0020-relationship-tree.md) and ADR 0019; Primary-only tree while Projects is active, all authorized connections in the Dossier. Required ancestor levels are configured under ADR 0024. |
| Journals and applicability | [ADR 0023](adr/0023-record-journal-and-conditional-fields.md); shared Journal tables/details, historic formatting, final-state applicability and protected controllers. Definition results page/filter locally; record and instance queries page/filter on the server. Current-rights projection follows ADRs 0026 and 0027. |
| Modules and forms | [ADR 0025](adr/0025-modules-and-form-views.md); the current three-entry module catalog is visible; Projects base objects and Contacts/Distribution-list base provisioning are implemented locally. Contacts and Distribution lists are locally accepted. The PRD specifies five V1 objects; lean Projects/Cases/Tasks templates and shared temporal values are implemented. Additional Projects profiles and recurrence remain later work; released installation/maintenance tooling is documented in the operator guide. One common form is used across modules. Documents & Communication is a planned V2 target with domain/storage/mail contracts still to be specified; [PRD section 1.3](PRD.md#13-agreed-v2-scope) lists the full V2 scope. Form groups/order/relationship placement are configurable for actual objects. |

### Regional record inputs

Integer/Decimal/Money drafts use regional grouping and exact canonical strings; valid values format on blur, invalid/incomplete text stays editable and blocks Save. Date/Date-time uses localized text and the standard lazy Calendar/Popover, effective named zone and explicit DST occurrence. Preference changes reformat valid values and baselines together without changing semantic dirty state; invalid drafts retain the old interpretation until corrected/reset. Never parse exact amounts through floating point or convert currency values because display preferences change. See ADR 0014 for the full rules and regression coverage.

## Fictional test data and browser acceptance

Use a separate disposable database and synthetic identities for browser mutations, not the operator's real account/business records. Use a distinct loopback hostname as well as a separate port: cookies are host-scoped across ports. Confirm configured Host/Origin match the fixture. Tear down only the fixture resources you created. Keep recovery dumps and the development volume intact; always distinguish read-only inspection from intentional fixture provisioning.

## Record recycle bin

The [record guide](user-guide.md#recycle-and-restore) owns the UI workflow and deletion consequences. Shared API/MCP operations enforce lifecycle permissions, expected record versions and final-state dependencies. [ADR 0029](adr/0029-record-recycle-bin.md) owns retained edge/history behavior; [API access](api.md#permanent-deletion) owns retained-history operations and redaction.

## Field input rules and record numbers

[Object and field design](model-design.md) owns the configuration workflow, including [number formats and counters](model-design.md#configure-record-numbers). [Field types](field-types.md) owns the value-selection guide. Keep UI instructions there rather than duplicating them in this implementation reference.

`create_field`/`configure_field` accept `inputRules: {description, helpText, defaultValue, unique}`; omitted configuration preserves the current rules on edit. `configure_classification.fieldInputRules` carries versioned explanations for its fields. `configure_object_settings.numbering` uses `{enabled,prefix,suffix,start,increment,padding,restart}`. Start/increment are positive decimal strings, up to 30 digits; padding is 1–30. No preview or failed creation consumes a number. The protected `record_number` cannot be written through `values`. The unreleased Administrator-only `get_numbering_backfill_preview`/`backfill_record_numbers` pair assigns only missing numbers under current object/preview versions; [ADR 0030](adr/0030-field-input-rules-and-record-numbers.md#missing-number-assignment--2026-11-11-unreleased) defines ordering, limits and atomicity.

Defaults apply only on creation/omission and permitted fields, never updates/backfill or explicit null/false/empty values. Unique scalar indexes include the recycle bin; duplicate feedback does not reveal another record. See [ADR 0030](adr/0030-field-input-rules-and-record-numbers.md) for comparison semantics, limits and retained issuance rules. The current schema adds field-rule metadata and numbering tables; rebuild the disposable local instance using the documented reset/seed workflow, retaining private configuration and backups.

Unique-value API/MCP errors include a field ID and record/definition context, with no conflicting record or value; web forms mark/focus the field or uniqueness control.

## Permission administration

[Users and content access](access-administration.md) owns account/group configuration, the worked ownership/foreign-access example and effective-right troubleshooting. [PRD section 4](PRD.md#4-permissions) and [ADR 0027](adr/0027-ownership-and-foreign-access.md) own exact precedence and the stored resolver model.

`configure_group` may atomically combine name and graded/nested membership writes under one optimistic group version; only Administrators may submit memberships. Record `update_record.security` and `configure_record_security` share a writer, source version and change group. Full access, object/field ceilings and explicit public-widening confirmation apply; generic `values.access_principals` is rejected. Combined contents/links/policy writes commit atomically, and stale versions fail with 409.

Effective-right explanations use the same resolver as the operation. Field restrictions apply before search/count/paging and to history, relationship and Dashboard projections. Delegated own-record foreign management exposes only the authenticated owner's incoming rules and cannot modify inheritance/delegation flags or another owner's rules. Calendar-only levels remain reserved until their feature exists; notification delivery is not implemented.

## Verification and acceptance

Use the checks appropriate to the affected source. The [Application checks workflow](../.github/workflows/checks.yml) defines the reproducible application, documentation and container gates. The [website workflow](../.github/workflows/site.yml) defines the independent project-site checks. Passing checks establish the tested revision and environment, not an application release or production deployment.

| Area | Reproducible check | Coverage / reference |
| --- | --- | --- |
| Contracts and application | `npm run typecheck`, `npm run build`, `npm test` | [Backend integration tests](../apps/server/test), [web tests](../apps/web/test) and generated API-contract freshness. |
| Plugin/installer packaging | `npm run test:packaging` | Packaging contracts and file/endpoint validation; [agent plugin](agent-plugin.md) and [release preparation](releasing.md). |
| Installation and recovery | `docker build --tag xobject:local-acceptance .`, then `node scripts/test-selfhost.mjs` | Disposable container setup, first Administrator, backup/restore, integrity, stopped maintenance and recovery after refused upgrades. |
| HTTPS/proxy boundary | `node scripts/test-selfhost-proxy.mjs` after building the image above | Loopback TLS, canonical Host/Origin, secure cookies, forwarded client addresses and authorization metadata. Run sequentially with recovery acceptance because the supplied topology uses a fixed subnet. |
| Permission/query performance | `npm run measure:permissions` | Isolated synthetic workload and measured targets in [quality acceptance](quality-acceptance.md#permission-and-query-performance). |
| Tree, journal and principal-selection performance | `npm run measure:v1-paths` | Isolated 10,000-record profile, fixed p95 targets, cookie/PAT/OAuth comparisons and observed advisory-lock waits. See [scoped path measurements](quality-acceptance.md#v1-path-performance-and-targeted-query-corrections). |
| Public documentation | `npm --prefix apps/docs run check`, `npm --prefix apps/docs run build`, `npm --prefix apps/docs test` | Generated canonical pages, types, source consistency and built links/assets/anchors. See [documentation delivery](public-documentation.md). |
| Project website | Commands in the [website guide](website.md) | Its independent dependency lockfile, typecheck, build, tests and browser acceptance. |

The container scripts create their own test resources and remove those resources afterwards. They require a running Docker daemon and must not target a real installation. Test outputs may contain generated credentials or data; keep them out of public issues and source control. Preserve operator backups and unrelated volumes.

### Functional coverage

Backend tests exercise the normal API/MCP operations and include denied actions and transactional failure paths, not just successful reads/writes:

- Empty/current initialization, runtime/operator separation and registry integrity.
- Workspace boundaries, graded nested groups, ownership/foreign access, field ceilings, revocation and current-rights projections before search/count/paging.
- Typed scalar/structured fields, exact regional values, temporal/DST rules, safe conversion, input defaults, uniqueness and numbering races.
- Contact kinds, derived names, Organization membership, Identities, distribution membership and the lean Project/Case/Task profiles.
- Versioned definitions, shared module contributions/forms, relationship cardinalities/attributes, Primary chains, cascade drafts and required-context preflight.
- Per-field journals, rollback, recycling/restoration, permanent deletion and role-dependent retained history.
- Local accounts, password/session controls, personal credentials, OAuth consent/PKCE/resource binding, token revocation, protocol schemas and supplied Skills.
- Distinct demo scenarios, number formats, identity isolation, relationship replay, lifecycle samples and concrete restricted-user behavior.

Web tests cover form drafts/validation, record navigation, field/relationship layouts, region-aware controls, classification, loading views and shared interaction helpers. Manual/browser acceptance should additionally exercise desktop and narrow layouts, pointer/keyboard access, focus return, dialog/dirty guards, translated labels, Light/Dark appearance, collections, Journal/Dossier, tree navigation and restricted-user views. Use fictional identities, reset temporary drafts and distinguish automated test coverage from observations of rendered UI.

### Public evidence and remaining limits

The application baseline at commit `6e5097065dfc20c45be6e817acb0adcae0e927f0` passed **163 backend tests and 128 web tests**, packaging, documentation and container installation/recovery acceptance in [Application checks](https://github.com/ITextremeDE/xobject/actions/runs/42173753953). Its [Website Quality run](https://github.com/ITextremeDE/xobject/actions/runs/42173753852) also passed. Subsequent source revisions need their own applicable checks; these links identify a tested baseline rather than certify later working-tree changes. Current runs are available in [GitHub Actions](https://github.com/ITextremeDE/xobject/actions).

The [quality report](quality-acceptance.md) owns measured performance, scoped accessibility/responsive results and platform evidence. The [API guide](api.md#client-compatibility-and-acceptance) owns actual provider/client coverage; SDK protocol tests do not establish native host skill activation or model compatibility. The quality report records the actual OpenAI Codex host/model exercise and its supported resource/package skill paths. Full-product assistive-technology testing, supported external-host/public-TLS acceptance and final release validation remain distinct gates. Released-predecessor migration testing is part of the native release workflow for each supported architecture.

## Browser assets and live refresh

The original vector mark is `apps/web/public/icons/xobject.svg`; generated PNG/ICO assets are tracked. After changing the mark, run `npm run icons:generate --workspace @xobject/web` using the pinned Sharp development dependency. Vite derives the web build ID from source, public assets, shared contracts, build configuration and the lockfile. Build the web client before starting the server, which reads the same built shell/build ID. No service worker or browser database stores business data.

[ADR 0036](adr/0036-browser-presence-and-live-updates.md) describes the transaction-derived notification transport and guarded query refresh. Keep all business mutations in `Application.execute`; it derives notifications from that transaction's journal and endpoints. Current bootstrap/demo setup runs before clients connect. Reconnect/focus and a fixed one-minute safety refresh resynchronize views beyond the bounded watch list without revealing hidden activity timing. Use the same draft guard for every refresh source. The focused browser/live tests cover merging, event framing, metadata, commit/rollback, visibility and authentication; actual browser checks exercise concurrent API writes without a page reload.

## Rendered application regression

Run `npm run build`, `npx playwright install chromium`, then `npm run test:browser` from the repository root. Docker must be available. The suite creates an isolated current PostgreSQL installation and normal Administrator/User/Designer accounts, including the required initial password change. It never loads the development database or a personal browser profile. CI installs Chromium system dependencies and runs this as a separate browser job. Failed scenarios retain screenshots and traces under ignored `.local/browser-acceptance/`; CI failure artifacts expire after seven days. Traces may contain short-lived passwords/cookies belonging only to that isolated fictional fixture; disposal removes the corresponding database and sessions. Use this harness with its own fixture, never a live installation.

The seven Chromium scenarios cover record Save/discard/readback, nested-dialog focus and the command shortcut, classification filters and list return context, workspace/system-theme and portal previews, restricted User views, Designer field creation and mobile record/settings/editor layouts. These interaction checks complement the Node logic/rendering tests; they are not a full assistive-technology or cross-browser certification.

`npm run test:packaging` also requires Docker for a scratch build-context regression. Its synthetic-secret tests check source archives and operator recovery paths in addition to portable agent-plugin contents.

## Repeat the scoped path measurements

Run `npm run measure:v1-paths` with Docker available. It creates and removes its own PostgreSQL 18 container and writes `.local/v1-path-performance.json`; it does not load `.env` or connect to the development database. The default profile has 10,000 records, 1,000 Primary edges, 10,000 field-journal events and 32 eligible accounts. Complete scenarios use 24 measured calls with eight concurrent readers. A single preflight exceeding its fixed target skips expensive repetition and fails the command; that observation is not a p95 result. Preserve a baseline report before rerunning. `npm run test:benchmark-cleanup` separately exercises shutdown failures without Docker or a database; CI runs those four cases alongside packaging checks.

For exploration, `XOBJECT_BENCH_RECORDS`, `XOBJECT_BENCH_EDGES`, `XOBJECT_BENCH_JOURNAL` and `XOBJECT_BENCH_USERS` accept bounded fixture sizes. Changed profiles require separate interpretation and must not replace the default acceptance comparison. The harness includes ordinary cookie authentication, personal-token and local OAuth/PKCE MCP flows, and controlled model/workspace lock waits. HTTP injection excludes network/TLS latency; production capacity still requires measurement on the intended host.

## Cross-browser and automated accessibility acceptance

The isolated application harness accepts `XOBJECT_TEST_BROWSER=chromium|firefox|webkit` (Chromium by default). Install the intended engine with `npx playwright install firefox` or `npx playwright install webkit`, then run `XOBJECT_TEST_BROWSER=firefox npm run test:browser`. The CI matrix retains the `browser` Chromium check and adds Firefox, with separate engine-specific failure artifacts. Both Linux jobs have passed the expanded suite; the quality report records the exact run and remaining platform boundaries.

The harness uses the pinned Axe integration for WCAG A/AA tags, waits for finite UI animations to finish and collects findings without suppressing rules or vendor nodes. A finding makes the overall test fail after the functional scenarios finish. It includes all five V1 object profiles, ordinary-user edits with independent API readback, the Primary chain, Journal/Dossier/Tree views and every settings section in Light/Dark. Browser contexts reuse only their own fixture role's normally signed-in session; first-password rules and login limits remain unchanged. Firefox/WebKit engine checks do not establish native Firefox/Safari/device or real screenreader acceptance.

Use `XOBJECT_TEST_SCENARIO` for a case-sensitive substring of a scenario title when investigating a finding. The artifact records the filter; a focused run is not full-suite evidence. The full suite has twelve workflows/thirteen Node test entries, including lifecycle and throttled-sign-in feedback. See the [acceptance map](quality-acceptance.md#expanded-v1-product-acceptance--2026-11-06) for checked views, reused evidence and remaining release gates.
