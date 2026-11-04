# Local development

This guide describes the current local prototype, not an installable release. Use fictional development data and preserve existing databases and recovery artifacts. The [PRD](PRD.md) defines the product target; [the documentation index](README.md) identifies the applicable architecture decisions. The initial local ACL in ADR 0026 is implemented; the expanded ownership/foreign-access concept in PRD section 4 is not.

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

1. Copy `.env.example` to `.env`. Use the same independently generated bootstrap password in `POSTGRES_PASSWORD` and `MIGRATION_DATABASE_URL`, a different runtime password in `DATABASE_URL`, and an independent `BETTER_AUTH_SECRET` of at least 32 characters. Hexadecimal passwords avoid URL-escaping issues. Keep this ignored file private.
2. Start the database, then initialize/upgrade explicitly:

   ```sh
   docker compose --env-file .env -f deploy/compose.dev.yaml up -d --wait
   npm run db:migrate
   ```

3. Supply `ADMIN_EMAIL`, `ADMIN_NAME` and a strong `ADMIN_PASSWORD` of 12–128 characters in the local process environment, then run `npm run admin:create`. Remove provisioning variables afterwards. Repeating this command for an existing email fails rather than modifying the account. No default credentials or public signup are shipped.
4. Run `npm run dev` and open `http://127.0.0.1:4100`. It builds contracts and browser assets before starting Fastify. The HTTP service never migrates automatically.
5. For frontend iteration, leave the server running and run `npm run dev:web` in another terminal. This rebuilds browser assets on changes; refresh the browser. Restart the backend after server changes.
6. Stop the HTTP process with Ctrl+C. Stop PostgreSQL with `docker compose --env-file .env -f deploy/compose.dev.yaml down`; its named data volume is retained. Do not add `--volumes` to ordinary shutdown.

Root development commands read `.env` through Node's environment-file support. PostgreSQL uses the unmodified pinned official image and listens on `127.0.0.1:5410`. The application serves auth/API/MCP and `apps/web/dist` from the same origin. Host must match the configured `BASE_URL` host/port; supplied Origin must match its origin. A hostname mismatch can produce `Unexpected Host`; use the configured URL or deliberately update the local configuration and restart. Do not relax the checks for a second development origin.

Local web builds retain hashed assets so open clients can still load their original lazy chunks. CI and `XOBJECT_CLEAN_BUILD=1 npm run build --workspace @xobject/web` clear output first. Stop the local server before an explicit clean build. Generated assets are neither source backups nor release artifacts.

## Database migrations and SQL inspection

[ADR 0022](adr/0022-database-integrity-and-concurrency.md) defines numbered migrations, registry integrity and schema/workspace barriers. `MIGRATION_DATABASE_URL` is the operator connection; `DATABASE_URL` uses a distinct restricted runtime role. The migration CLI provisions/verifies runtime grants without implicitly rotating existing credentials. Keep the migration connection out of a deployed HTTP environment; the ignored development `.env` is an operator convenience, not production isolation.

Before upgrading a populated database: stop writers, take a private custom-format dump, verify restoration in a separate database, run `npm run db:migrate`, verify retained data/history, then restart. Retain recovery artifacts. Do not edit completed numbered migrations for a new upgrade.

| Schema step | Purpose |
| --- | --- |
| 1 | Adopt the earlier prototype, after Better Auth initialization. |
| 2 | Definition versions, deferred registry integrity and indexes. |
| 3 | Conditional field applicability. |
| 4 | Primary role storage and relationship endpoint conditions. |
| 5 | Object form-layout metadata. |
| 6 | Materialize existing form arrangements before removing semantic group defaults. |
| 7 | Module catalog, reserved module names and fixed supplied Primary bindings. |
| 8 | Local object/field content grants and sensitive-object metadata. |

The ledger is `sys_schema_migrations`; application startup does not advance it. Repeated migrations skip completed steps and unknown newer schema versions are rejected. Operator/runtime credentials and all dump contents stay outside Git. DbGate or another PostgreSQL client can inspect the local database using an appropriate private connection. Direct SQL writes bypass application validation and journaling; registry triggers do not turn SQL maintenance into a supported business-data API.

### Fresh development databases and physical layout

A fresh initialized database has system schema and its fresh migration ledger, without accounts, sessions, workspaces or business records. Administrator provisioning and optional [fictional seeding](demo-data.md) are separate steps. Never reset a populated development database as part of normal startup or migration.

Use one `public` schema: `sys_` for system tables and `<workspace_code>_<object_name>` for dynamic business tables. Prefixes organize names; identities and authorization enforce isolation. Explicitly prepared empty schemas may group system columns as identity/scope, attributes/configuration, lifecycle/version, then audit metadata. Keep relationship endpoint rules together and preserve auth-provider types/defaults.

Dynamic object tables start with `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. Installed standard/custom fields append in creation order. Physical SQL order, form arrangement and alphabetical field administration are independent; populated tables are not rebuilt merely to change display order. See [ADR 0003](adr/0003-localized-labels-and-column-order.md).

An explicitly authorized empty rebuild uses a disposable database migrated from current source as schema authority. Export schema only, reorder only column declarations, retain every constraint/index/trigger/function, and compare schema equivalence ignoring column order. Copy only the fresh ledger, rerun migration for idempotency, provision runtime grants and verify that all other tables are empty. Before cutover, stop writers, verify a full dump and archive the previous database by renaming it. Reversal stops writers and swaps names back. Reconnect SQL clients after cutover. Retain original databases, dumps and named volumes; no ordinary seed/migration command deletes them. This is operator maintenance, not a second maintained schema snapshot.

## HTTP and MCP interface

Sign in through JSON `POST /api/auth/sign-in/email` with `email` and `password` and preserve the session cookie. Auth also exposes the supported session lookup/sign-out routes. Generic auth profile/account mutations cannot bypass the application layer. Every application operation is a JSON `POST /api/v1/<operation>` and an identically named MCP tool at `/mcp`.

Send `Content-Type: application/json`, the current session cookie and `X-XObject-Request: 1`. MCP uses stateless Streamable HTTP POST with JSON responses; GET/DELETE return 405. Cookie transport is a local evaluation mechanism, not production OAuth/token issuance. An agent cannot submit a different user identity to impersonate another account.

The canonical input schemas, defaults, limits, wire types and output mappings live in [shared contracts](../packages/contracts/src/index.ts). The following inventory groups the current operations; it does not duplicate their schemas:

| Area | Operations |
| --- | --- |
| Access context and account directory | `get_access_context`, `list_users` |
| Instance users and journal | `list_managed_users`, `create_user`, `configure_user`, `list_system_journal` |
| Own profile/security | `set_user_profile`, `get_account_security`, `change_password`, `revoke_session`, `revoke_other_sessions` |
| Workspaces and membership | `create_workspace`, `list_workspaces`, `set_workspace_name`, `list_workspace_members`, `set_workspace_member` |
| Groups and references | `create_group`, `list_groups`, `configure_group`, `set_group_members`, `set_group_active`, `list_field_principals` |
| Language, region and appearance | `get_language_catalog`, `get_time_zone_catalog`, `configure_workspace_languages`, `configure_user_localization`, `set_workspace_language`, `set_user_language`, `set_workspace_appearance` |
| Object and field definitions | `create_object_type`, `list_object_types`, `get_object_type`, `create_field`, `configure_field`, `set_field_required`, `set_labels`, `add_standard_field`, `configure_classification`, `configure_object_settings` |
| Definition lifecycle/history | `set_definition_state`, `get_definition_journal` |
| Local content policy | `get_content_permissions`, `configure_content_permissions`, `list_access_principals` |
| Record contents/history | `create_record`, `update_record`, `get_record`, `list_records`, `get_journal`, `list_record_journal` |
| Workspace search/dashboard | `search_workspace`, `get_workspace_dashboard`, `list_workspace_records` |
| Relationship definitions | `list_relationship_types`, `create_relationship_type`, `configure_relationship_type`, `activate_relationship_type` |
| Relationships and context | `get_record_relationships`, `search_relationship_candidates`, `list_record_link_options`, `get_primary_chain_context`, `get_relationship_tree_branch` |
| Modules | `list_workspace_modules`, `configure_workspace_module` |
| Form layout | `configure_form_layout` |

The operation adapter is experimental, not a final REST/OpenAPI contract. Content reads/writes apply current actor-bound grants inside the transaction. Definition and workspace configuration use User/Designer roles; Administrator-only security operations remain separate. Expected versions reject stale drafts with 409; do not automatically retry them with a new version. No-op operations do not fabricate changes, and journals commit atomically with mutations.

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

Lists retain search/sort/filter/page state in URL parameters; invalid values fall back to supported defaults. Keyword search, active fields and supported metadata sort on the server before pagination, with stable tie-breakers. Missing Keyword uses the UUID. Browser storage contains only presentation preferences such as theme and account/view-scoped column visibility, never business values or credentials.

Record pages share one full-width creation/edit form. Save replaces `new` with its UUID. Drafts survive tab switches; Tree/Dossier/Journal show saved state. Back returns to the validated originating list/Dashboard, or the source record for linked creation, preserving appropriate list parameters/focus. Direct entry falls back to the object's list. Internal and Back/Forward navigation share discard guards; reload/tab exit uses the native before-unload guard. Pending saves block navigation. Missing routes/assets/API errors retain their proper handling. Clicking the exact active Sidebar destination refetches view data without a document reload or lost URL state.

### Settings layout and navigation

Personal settings are Profile, Account & security, Appearance, Language & region. Workspace settings are General, Appearance, Language & region, Modules, Object types, Relationship types, Form designer, Members & roles, User groups. Instance settings are User management and Journal for Administrators only. Desktop/mobile navigation and breadcrumbs share one definition.

The viewport-constrained 960 × 720 px preferred Settings frame uses the Sidebar 13 composition: background dialog, sidebar/footer surface, and rounded muted functional sections. Forms and nested editors share section spacing, framed technical disclosures and consistent action placement. The deleted-definition toggle sits below the object chooser. Object labels/sensitivity save together through `configure_object_settings`; Designers may edit permitted labels, while security changes remain Administrator-only.

Creation dialogs use Cancel/Create; editors use Close/Reset/Save where applicable. Normal dialogs offer a localized X; decision confirmations use explicit actions without an X. Pending/dirty guards cover all close paths. Root-footer actions use native form association. Section changes retain drafts; membership/activation actions identified as immediate save directly. Object/field administration is alphabetical, separate from configured form order. Requiredness uses consistent Yes/No controls and read-only table indicators.

### Sidebar search and keyboard interaction

The scrollable command menu combines permitted local navigation with authorized workspace record search. Local navigation has no minimum query length. Remote search requires two characters, is debounced, and searches readable Keywords (UUID fallback), localized object names and technical names. It does not search arbitrary custom values or journal text. Overflow flags ask the user to refine the query. Normal workspace members can search content permitted by ADR 0026; metadata access alone grants no result. Production full-text indexing and measured scaling remain open.

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
| Classification and typed fields | ADRs [0006](adr/0006-record-classification.md) and [0007](adr/0007-custom-field-types.md); configured requiredness/options, precise strings, safe conversions, protected kinds and journals. Business numbering, helper text, custom defaults and uniqueness remain incomplete. |
| Roles, groups and content policy | ADRs [0008](adr/0008-workspace-roles.md), [0013](adr/0013-workspace-groups.md), [0026](adr/0026-content-permissions.md); direct memberships and initial ACL implemented. Graded ownership/foreign access in PRD section 4 remains a target. |
| Definition lifecycle | [ADR 0009](adr/0009-definition-lifecycle.md); deactivation/reactivation and deletion only when unused, retained tombstones/history. Record recycling/erasure is not implemented. |
| Profile, passwords and instance users | ADRs [0010](adr/0010-account-security.md) and [0015](adr/0015-instance-administration-and-journal.md); mandatory initial-password changes, own sessions, reversible users. Email change, image upload and interactive release setup remain deferred. |
| Appearance and localization | ADRs [0011](adr/0011-workspace-appearance.md), [0012](adr/0012-workspace-languages.md), [0014](adr/0014-time-zones-and-regional-display.md); shared workspace design, shipped de/en packs, personal inheritance and exact regional/DST-aware inputs. |
| Dashboard, tables and navigation | ADRs [0004](adr/0004-first-web-interface.md), [0016](adr/0016-dashboard-and-shared-table-navigation.md), [0017](adr/0017-record-pages-and-local-demo-data.md); shared tables/pagination and real authorized metrics. Statistic/chart content remains exploratory; the Dashboard table is part of the normal UI. |
| Relationships and linked creation | ADRs [0018](adr/0018-relationship-type-definitions.md), [0019](adr/0019-record-relationships.md), [0021](adr/0021-relationship-scope-and-projects-module.md), [0024](adr/0024-primary-levels-and-relationship-conditions.md); original scope refined by later decisions. General is core, Primary Projects-owned, custom types have one pair. Single targets are fields; multiple targets are tables. |
| Tree and Dossier | [ADR 0020](adr/0020-relationship-tree.md) and ADR 0019; Primary-only tree while Projects is active, all authorized connections in the Dossier. Required ancestor-chain sections remain open. |
| Journals and applicability | [ADR 0023](adr/0023-record-journal-and-conditional-fields.md); shared Journal tables/details, historic formatting, final-state applicability and protected controllers. Definition results page/filter locally; record and instance queries page/filter on the server. Current-rights projection follows ADR 0026. |
| Modules and forms | [ADR 0025](adr/0025-modules-and-form-views.md); full catalog visible, Projects base-object provisioning implemented. Contacts/Documents activation, complete domain templates and module-specific view selection remain open. Form groups/order/relationship placement are configurable for actual objects. |

### Regional record inputs

Integer/Decimal/Money drafts use regional grouping and exact canonical strings; valid values format on blur, invalid/incomplete text stays editable and blocks Save. Date/Date-time uses localized text and the standard lazy Calendar/Popover, effective named zone and explicit DST occurrence. Preference changes reformat valid values and baselines together without changing semantic dirty state; invalid drafts retain the old interpretation until corrected/reset. Never parse exact amounts through floating point or convert currency values because display preferences change. See ADR 0014 for the full rules and regression coverage.

## Fictional test data and browser acceptance

The versioned `dev:seed` command creates the five-domain fixture documented in [Demo data](demo-data.md), using an existing Administrator and an empty business database. It does not overwrite an existing workspace. A manually provisioned four-object inventory fixture is independent of that seed; its live counts, user identities and credentials are not a default installation contract. Private manifests/recovery files remain ignored under `.local/`.

Use a separate disposable database and synthetic identities for browser mutations, not the operator's real account/business records. Use a distinct loopback hostname as well as a separate port: cookies are host-scoped across ports. Confirm configured Host/Origin match the fixture. Tear down only the fixture resources you created. Keep recovery dumps and the development volume intact; always distinguish read-only inspection from intentional fixture provisioning.

## Recorded local verification — 2026-11-04

Before publication, the complete root checks passed: 96 isolated PostgreSQL integration tests, 49 web tests, root type checking and contracts/server/web builds. Two untyped SQL-count assertions in the linked-creation tests were corrected before this run. Coverage includes the initial ACL and atomic object/security settings, effective-rule explanations, current-rights history, membership revocation, object-first linking menus, source/version checks and atomic linked creation/rollback. Synthetic browser checks covered keyboard interaction, 390 × 844 layouts, guarded cancellation, source return and persisted inverse links. The earlier documentation review identified a failing test-source type check rather than treating a source build as sufficient. The subsequent pre-publication run above includes the corrected tests; application source builds alone exclude test sources. Synthetic browser results were retained from the preceding application checks, not newly repeated for this documentation/typing correction.

Migration 8 was rehearsed on a restored copy; original columns/rows across 25 existing tables were compared before/after adoption without content/auth/history loss. No grants were created automatically. Later explicitly requested demo-account/group/grant provisioning is separate from migration and browser acceptance; do not claim that no users were provisioned during the whole batch. No credentials belong in public documentation.

Earlier slice-specific test totals are superseded by this recorded snapshot, not separate current test counts. CI/merge/deployment evidence belongs to its PR and OpenProject work package. This snapshot does not claim publication of the current working tree, a software release, production deployment, physical-device acceptance, full domain modules or completion of the target permission model. Login/sign-out and the experimental Administrator CLI lifecycle are not yet journaled. Public documentation/changelog/roadmap URLs are selected destinations, not evidence that their pages are deployed.
