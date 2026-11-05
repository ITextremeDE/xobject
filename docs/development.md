# Local development

This guide describes the current local prototype, not an installable release. Use fictional, disposable development data; retain offline recovery artifacts separately when they exist. The [PRD](PRD.md) defines the product target; [the documentation index](README.md) identifies the applicable architecture decisions. The current ownership/foreign-access model is implemented locally under ADR 0027; remaining product acceptance and deferred features are listed below.

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

[ADR 0028](adr/0028-current-installation-baseline.md) defines the unreleased installation policy. `apps/server/src/schema.sql` is the current application schema, including constraints, indexes and deferred integrity functions/triggers. The pinned Better Auth schema API creates its own authentication tables. `module-catalog.json` supplies the initial module definitions. Both source resources are copied into the server build and contribute to the installation fingerprint.

`npm run db:init` installs this model into an empty database. The only initial rows are the three module definitions and the single `sys_schema_version` fingerprint/version row. No accounts, sessions, workspaces, groups, object definitions, records, policies or journals are preloaded. Repeating initialization against an identical current installation changes nothing and closes every connection. A different or unrecognized schema is rejected without adoption, repair or upgrade.

`OPERATOR_DATABASE_URL` is the initialization/provisioning connection. `DATABASE_URL` uses a distinct restricted runtime role. Runtime can create dynamic business tables, read/append journals and read the schema marker; it cannot mutate journals or the installation marker. Operator credentials stay out of the HTTP process environment in a packaged installation; the local ignored `.env` is a development convenience. See [ADR 0022](adr/0022-database-integrity-and-concurrency.md).

### Rebuild the disposable local instance

Stop the application, then run `npm run db:reset`. This explicitly discards and recreates only `xobject_dev` on `127.0.0.1:5410`, initializes the current schema and provisions the runtime role. It requires `OPERATOR_DATABASE_URL` and refuses other hosts, ports or database names. It does not restore an older fixture or create accounts. Provision the first Administrator with `npm run admin:create`, then start `npm run dev`. Optional `dev:seed` creates fictional test content through current application operations and requires an empty business database.

The development instance is disposable. Whenever a change requires it, rebuild the affected generated assets and current database, provision the first Administrator and reapply the current demo seed; do not retain outdated test schemas, interfaces, fixtures or compatibility tests. This is an authorized standing development procedure. Preserve unrelated work and offline recovery artifacts. After the first release, supported updates must fully migrate data/schema/configuration to the target model before serving it. Dedicated upgrade tooling may interpret released source formats; application code supports only the resulting current model. Initial release updates use a maintenance window: stop application processes and other writers, back up database/configuration consistently, migrate, verify the target schema/integrity, then start the target version. Failures keep the app stopped until consistent recovery with the matching application version. Mixed-version rolling updates are outside the initial scope; see ADR 0028. The concrete migration/backup/restore tooling is not implemented by the current initializer.

### Physical layout

System tables use `sys_`; business tables use `<workspace_code>_<object_name>`. The current system schema groups identity/scope, attributes/configuration, lifecycle/version and audit metadata directly in its CREATE definitions. Authentication column types/defaults follow Better Auth. Dynamic business tables start with `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`; installed business fields append in creation order. Display order is configured independently.

Access principals are a protected virtual system field derived from `sys_record_security.policy.owners`; no business-table column duplicates them. A missing sensitive-record policy is an integrity error, never an implicit Full/public policy. Supplied object UUIDs live once in `sys_module_object_bindings`; Primary context selects its fixed Contact/Project/Case roles from those bindings. DbGate may inspect the database with an appropriate private connection. Direct SQL bypasses application validation/journaling and is not a supported content API.

Contacts supplies nine typed JSONB contact codecs under ADR 0032. `list_field_schemas` returns installed schema keys and bilingual names. `create_field`/`configure_field` use kind `structured` plus `config.schema`; list-like codecs also have configurable UUID context options. Entry IDs/order, preference and optional birthday year are explicit values. Arbitrary JSON and unsafe nonempty kind/schema conversions are rejected. Structured columns expose read-only summaries and do not support scalar sorting or uniqueness. Existing field rights apply to the entire collection; each write has one immutable per-field event with optional `detail_context` component/entry paths.

Base Contacts activation creates Contacts and Distribution lists with protected field/relationship-purpose bindings. Virtual Contact Keyword/formatted/Organization names have no storage columns and cannot be assigned. Company/name/controller/Organization rights constrain derived projections before search/counts; real membership and Identities edges have the ordinary lifecycle/history rules. Additional edge roles, structured references and temporal/recurrence functionality are still pending. See ADR 0032 for the exact staged boundary.

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
| Groups and references | `create_group`, `list_groups`, `configure_group`, `set_group_active`, `configure_group_inheritance`, `list_field_principals` |
| Language, region and appearance | `get_language_catalog`, `get_time_zone_catalog`, `configure_workspace_languages`, `configure_user_localization`, `set_workspace_appearance` |
| Object and field definitions | `list_field_schemas`, `create_object_type`, `list_object_types`, `get_object_type`, `create_field`, `configure_field`, `set_labels`, `add_standard_field`, `configure_classification`, `configure_object_settings` |
| Definition lifecycle/history | `set_definition_state`, `get_definition_journal` |
| Local content policy | `get_content_permissions`, `configure_content_permissions`, `list_access_principals`, `get_foreign_access_capabilities`, `get_foreign_access`, `configure_foreign_access`, `get_record_security`, `configure_record_security` |
| Record lifecycle | `recycle_record`, `restore_record`, `list_recycled_records`, `get_recycled_record` |
| Record contents/history | `create_record`, `duplicate_record`, `update_record`, `get_record`, `list_records`, `list_record_journal` |
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

Lists retain search/sort/filter/page state in URL parameters; invalid values fall back to supported defaults. Keyword/business-number search and supported active-field/metadata sorting run on the server before pagination, with stable tie-breakers. Missing Keyword uses the UUID. Browser storage contains only presentation preferences such as theme and account/view-scoped column visibility, never business values or credentials.

Record pages share one full-width creation/edit form. Save replaces `new` with its UUID. Drafts survive tab switches; Tree/Dossier/Journal show saved state. Back returns to the validated originating list/Dashboard, or the source record for linked creation, preserving appropriate list parameters/focus. Direct entry falls back to the object's list. Internal and Back/Forward navigation share discard guards; reload/tab exit uses the native before-unload guard. Pending saves block navigation. Missing routes/assets/API errors retain their proper handling. Clicking the exact active Sidebar destination refetches view data without a document reload or lost URL state.

### Settings layout and navigation

Personal settings are Profile, Account & security, Appearance, Language & region. Workspace settings are General, Appearance, Language & region, Modules, Object types, Relationship types, Form designer, Members & roles, User groups. Instance settings are User management and Journal for Administrators only. Desktop/mobile navigation and breadcrumbs share one definition.

The viewport-constrained 960 × 720 px preferred Settings frame uses the Sidebar 13 composition: background dialog, sidebar/footer surface, and rounded muted functional sections. Forms and nested editors share section spacing, framed technical disclosures and consistent action placement. The deleted-definition toggle sits below the object chooser. Object labels/sensitivity save together through `configure_object_settings`; Designers may edit permitted labels, while security changes remain Administrator-only.

Creation dialogs use Cancel/Create; editors use Close/Reset/Save where applicable. Normal dialogs offer a localized X; decision confirmations use explicit actions without an X. Pending/dirty guards cover all close paths. Root-footer actions use native form association. Section changes retain drafts; membership/activation actions identified as immediate save directly. Object/field administration is alphabetical, separate from configured form order. Requiredness uses consistent Yes/No controls and read-only table indicators.

### Sidebar search and keyboard interaction

The scrollable command menu combines permitted local navigation with authorized workspace record search. Local navigation has no minimum query length. Remote search requires two characters, is debounced, and searches readable Keywords (UUID fallback), permitted business numbers, localized object names and technical names. It does not search arbitrary custom values or journal text. Overflow flags ask the user to refine the query. Normal workspace members can search content permitted by ADRs 0026 and 0027; metadata access alone grants no result. Production full-text indexing and measured scaling remain open.

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
| Classification and typed fields | ADRs [0006](adr/0006-record-classification.md) and [0007](adr/0007-custom-field-types.md); configured requiredness/options, precise strings, safe conversions, protected kinds and journals. Descriptions, input hints, typed defaults, scalar uniqueness and automatic business numbers are implemented in ADR [0030](adr/0030-field-input-rules-and-business-numbers.md). |
| Roles, groups and content policy | ADRs [0008](adr/0008-workspace-roles.md), [0013](adr/0013-workspace-groups.md), [0026](adr/0026-content-permissions.md) and [0027](adr/0027-ownership-and-foreign-access.md); object/field ceilings, graded/nested membership, ownership and foreign access implemented locally. |
| Definition lifecycle | [ADR 0009](adr/0009-definition-lifecycle.md); deactivation/reactivation and deletion only when unused, retained tombstones/history. Record recycling/restoration is implemented under ADR 0029; permanent deletion/history erasure remains pending. |
| Profile, passwords and instance users | ADRs [0010](adr/0010-account-security.md) and [0015](adr/0015-instance-administration-and-journal.md); mandatory initial-password changes, own sessions, reversible users. Email change, image upload and interactive release setup remain deferred. |
| Appearance and localization | ADRs [0011](adr/0011-workspace-appearance.md), [0012](adr/0012-workspace-languages.md), [0014](adr/0014-time-zones-and-regional-display.md); shared workspace design, shipped de/en packs, personal inheritance and exact regional/DST-aware inputs. |
| Dashboard, tables and navigation | ADRs [0004](adr/0004-first-web-interface.md), [0016](adr/0016-dashboard-and-shared-table-navigation.md), [0017](adr/0017-record-pages-and-local-demo-data.md); shared tables/pagination and real authorized metrics. Statistic/chart content remains exploratory; the Dashboard table is part of the normal UI. |
| Relationships and linked creation | ADRs [0018](adr/0018-relationship-type-definitions.md), [0019](adr/0019-record-relationships.md), [0021](adr/0021-relationship-scope-and-projects-module.md), [0024](adr/0024-primary-levels-and-relationship-conditions.md); original scope refined by later decisions. General is core, Primary Projects-owned, custom types have one pair. Single targets are fields; multiple targets are tables. |
| Tree and Dossier | [ADR 0020](adr/0020-relationship-tree.md) and ADR 0019; Primary-only tree while Projects is active, all authorized connections in the Dossier. Required ancestor-chain sections remain open. |
| Journals and applicability | [ADR 0023](adr/0023-record-journal-and-conditional-fields.md); shared Journal tables/details, historic formatting, final-state applicability and protected controllers. Definition results page/filter locally; record and instance queries page/filter on the server. Current-rights projection follows ADRs 0026 and 0027. |
| Modules and forms | [ADR 0025](adr/0025-modules-and-form-views.md); the current three-entry prototype catalog is visible; Projects base objects and Contacts/Distribution-list base provisioning are implemented locally. Contacts and Distribution lists are locally accepted. The PRD specifies the expanded two-module V1 catalog; remaining Projects profiles/templates and release tooling remain open. One common form is used across modules. Documents & Communication is later scope. Form groups/order/relationship placement are configurable for actual objects. |

### Regional record inputs

Integer/Decimal/Money drafts use regional grouping and exact canonical strings; valid values format on blur, invalid/incomplete text stays editable and blocks Save. Date/Date-time uses localized text and the standard lazy Calendar/Popover, effective named zone and explicit DST occurrence. Preference changes reformat valid values and baselines together without changing semantic dirty state; invalid drafts retain the old interpretation until corrected/reset. Never parse exact amounts through floating point or convert currency values because display preferences change. See ADR 0014 for the full rules and regression coverage.

## Fictional test data and browser acceptance

The explicit `dev:seed` command creates the bilingual, English-default ITextreme fixture documented in [Demo data](demo-data.md), using an existing Administrator and an empty business database. It adds Designer/User accounts with random initial passwords and mandatory password changes, nine active object types with 74 records, an inactive lifecycle sample and 54 relationships. All 15 custom field types and ownership/foreign-access scenarios use shared application operations. The CLI writes credentials only to private ignored `.local/demo-accounts` files. Seeding never overwrites a workspace and is separate from normal installation.

Use a separate disposable database and synthetic identities for browser mutations, not the operator's real account/business records. Use a distinct loopback hostname as well as a separate port: cookies are host-scoped across ports. Confirm configured Host/Origin match the fixture. Tear down only the fixture resources you created. Keep recovery dumps and the development volume intact; always distinguish read-only inspection from intentional fixture provisioning.

## Record recycle bin

Open **Recycle bin** in the workspace sidebar (`/w/<code>/recycle-bin`). Clean active record forms offer **Move to recycle bin** with Delete access. The bin retains readable fields/history and offers **Restore record** with Full access and an active object type. Both actions use the record version and the common API/MCP operations; the journal can explicitly inspect recycled records. Contents and edges are retained, cardinality slots remain reserved, and unavailable Primary parents are shown generically. See [ADR 0029](adr/0029-record-recycle-bin.md). Permanent deletion/history erasure is not implemented.

## Field input rules and business numbers

In **Settings → Workspace → Object types**, select an object. Its **Business numbers** section shows a non-reserving example/restart summary; **Number format & counter** expands the configuration. Invalid inputs suppress the example and have associated field errors. Save with the existing object actions; Reset/discard and optimistic conflicts apply. Existing numbers remain unchanged. A smaller starting value never rewinds an issued sequence. Yearly/monthly periods follow the workspace zone and appear automatically in the formatted number.

Open a field to edit **Input rules** and **Descriptions & input hints**. Explanations use the existing per-language editor; defaults use ordinary typed/regional controls. **Clear default value** removes the configuration. Type/Status/Category retain their dedicated defaults; their explanations save with that same dialog. Only supported scalar fields offer uniqueness. Before changing a UI field type, clear its default and disable uniqueness; server-side conversions still independently validate stored data and defaults.

`create_field`/`configure_field` accept `inputRules: {description, helpText, defaultValue, unique}`; omitted configuration preserves the current rules on edit. `configure_classification.fieldInputRules` carries versioned explanations for its fields. `configure_object_settings.numbering` uses `{enabled,prefix,suffix,start,increment,padding,restart}`. Start/increment are positive decimal strings, up to 30 digits; padding is 1–30. No preview or failed creation consumes a number. The protected `business_number` cannot be written through `values`.

Defaults apply only on creation/omission and permitted fields, never updates/backfill or explicit null/false/empty values. Unique scalar indexes include the recycle bin; duplicate feedback does not reveal another record. See [ADR 0030](adr/0030-field-input-rules-and-business-numbers.md) for comparison semantics, limits and retained issuance rules. The current schema adds field-rule metadata and numbering tables; rebuild the disposable local instance using the documented reset/seed workflow, retaining private configuration and backups.

Unique-value API/MCP errors include a field ID and record/definition context, with no conflicting record or value; web forms mark/focus the field or uniqueness control.

## Permission administration

Administrators set object ceilings, separate Create and field exceptions in **Settings → Workspace → Members & roles / User groups → Content permissions**. Missing user Create inherits active group Create grants; Edit does not implicitly grant Create. An explicit user denial overrides groups. Disabling sensitivity requires an explicit confirmation in the object settings and `confirmWidening` through API/MCP; stored security policies remain retained. Group object grants without Create do not allow creation. The same section's **Foreign access** button edits the selected principal's requester/owner rules, default/per-object levels, Confidential capability and user inheritance/delegation flags. Both direction views edit the same stored edges. A new rule while an object override is selected grants only that object, with None as its general default.

**User groups → group → Group members** edits direct users, nested groups and each grade in the same editor as the name. Save and Reset apply to the complete group draft; group cycles are rejected. Administrator `configure_group` writes may include `members`, with combined name/member changes using one optimistic group version/change ID and atomic validation/journaling. Designers may rename without submitting memberships. The separate user-management table explicitly identifies the instance role. Administrators manage memberships, Designers may name/create empty groups, and regular users can inspect settings. Deactivation retains references without granting access.

Sensitive record forms expose the protected **Access principals** field at its configured Form designer position, with searchable quick selection and tabbed rights details. Designers can change group, order and half/full width using the existing field UUID. Full access allows ownership levels, current-member group expansion, public access, Personal/Confidential privacy, foreign maximum and record-field exceptions within administrative limits. The details dialog applies a local draft; normal record Save persists contents, relationships and policy atomically through `update_record.security`, with one source version and change ID. Stale drafts fail with 409. Reset/discard guards preserve drafts; public widening requires explicit confirmation, and removing the last owner never silently enables public access. Generic `values.access_principals` writes remain rejected. New sensitive records assign their creator. A permitted Create-only operation may return only an identity/version receipt because it does not grant Read.

An Administrator may explicitly allow a user to manage general foreign access on their own records. The user then opens **Members & roles → Foreign access on my records**; responses include only rules targeting that user. They cannot change inheritance/delegation flags, edit another owner's rules or grant above their own object ceiling. Revocation applies in the current session. The Administrator exception never broadens access to another user's personal account/security settings.

Effective-right explanations use the authorization resolver and include the winning ownership/foreign path, bounded by the object ceiling. Per-record field restrictions apply before search/count/paging and to history, relationships and Dashboard projections. Calendar-only levels remain reserved; availability does not expose records, and scheduling grants ordinary Read/Duplicate but no general Edit. No mail is sent.

## Recorded local verification — 2026-11-04

The current installation and permissions passed 99 isolated PostgreSQL integration tests and 57 web tests, root type checking and contracts/server/web builds. Coverage includes empty initialization, absence of business/auth data, repeat initialization, rejection of noncurrent schemas, complete connection cleanup, schema-marker protection and one policy store with deferred integrity. Existing acceptance covers field/lifecycle behavior, journals, optimistic versions, relationships, modules/forms, localization and ownership/foreign-access rules through the shared API/MCP layer.

The local PostgreSQL development instance was recreated from the current installation definition. Administrator provisioning is a separate installation step; no prior accounts, workspaces, contents, policies or test receipts are restored. Application startup and HTTP checks verify the new schema and loopback origin. Chrome verified the built application, first Administrator sign-in and the empty first-workspace screen. Operator provisioning creates no orphan sign-in session. A source build is not physical-device or full accessibility acceptance.

The permissions/UI follow-up passed 23 targeted PostgreSQL integration scenarios, 57 web tests, root type checking and contracts/server/web builds. It covers role separation, object/field ceilings, ownership, foreign inheritance/delegation, current-session revocation, inactive principals, stale versions, deleted-object overrides and journal rollback/removal. Chrome checked the Administrator editors, English User read-only/hidden-field behavior, German Designer own-record delegation, guarded drafts, Escape/focus return 390-pixel responsive layouts and light/dark native scrollbars. A separate current-installation QA instance verified real first-password changes and persisted a narrowed delegated rule; the normal development demo accounts and initial passwords were preserved. This is targeted acceptance, not a repeated complete repository test run.

The Access-principal field follow-up passed 25 targeted backend scenarios and 58 web tests, root type checking and application builds. Combined content/link/security edits use one source version/change ID and roll back on invalid policy, insufficient Full, stale versions or journal failure. Chrome verified quick selection, keyboard opening, tabbed rights drafts, Apply without persistence (database readback unchanged), full-form Reset, empty-owner Save blocking and explicit workspace-public confirmation.

The Form-designer follow-up passed four targeted PostgreSQL scenarios and 59 web tests, root type checking and contracts/server/web builds. It verifies placement through the existing field identity, protected security semantics, half/full widths, retained unavailable entries and Unassigned behavior. Chrome saved Access principals into Details at half width between Expected result and Sample amount and verified the rendered record. The normal disposable instance was recreated with the current seed; readback found ITextreme / itx, English default, three role accounts, eight active plus one inactive object, 74 total records, seven relationship types and complete German/English metadata. This follows the separate provisioning/seed workflow; it is not restoration of an obsolete installation.

The record recycle-bin slice passed 16 targeted PostgreSQL integration scenarios covering lifecycle, relationships/Primary/tree, Dashboard, journal, current installation and runtime roles. A subsequent seven-scenario rights/lifecycle follow-up and the direct-route regression passed. The latest web run passed 60 tests; root type checking and application builds passed. Chrome verified recycling, normal-list exclusion, read-only contents/history, translated lifecycle details, `/` search focus, the direct bin URL, restoration with its retained Dossier edge, and a 390-pixel dialog with visible actions and no horizontal page overflow. The temporary viewport was reset and the tested demo record restored. The disposable database was rebuilt from the new registry schema and current seed; credentials/backups remain private. Permanent deletion/history erasure is not part of this slice.

The UI-review follow-up passed 62 web tests, three targeted PostgreSQL scenarios (atomic security context and recycle-bin projections/rights), root type checking and application builds. Chrome verified automatic invalid-sort URL recovery, the non-sortable Access principals display column, workspace-public labels, protected-field inspection without false alerts, readable record-security history and original technical snapshots, Command-K bin navigation, grouped read-only previews and restoration. The 390-pixel preview had reachable footer actions and no horizontal page overflow; light/dark Journal details were checked. The temporary viewport/theme/column selection were reset and the temporarily recycled demo record restored.

The field-input/numbering follow-up passed 16 targeted PostgreSQL scenarios and 64 web tests, root type checking and application builds. Coverage includes every custom default type, explicit empties, conditions/creation rights, uniqueness races and recycled slots, safe conversions, classification/language metadata, numbering concurrency/restarts/search and transactional rollback. Chrome verified real creation with `VEH-00004`, duplicate-value rejection without a misleading version-reload action, immutable number display, field-rule save/reset with normalized decimal drafts, numbering validation/period preview, classification explanations and 390-pixel forms. Temporary drafts and the viewport were reset; the extra QA vehicle remains recoverably recycled. The current schema/fixture was rebuilt, retaining private configuration/backups; normal readback found three role accounts, eight active objects plus one inactive object, 74 non-recycled records and complete bilingual definition metadata.

The seven-point UI follow-up passed nine targeted PostgreSQL scenarios, 64 web tests, root type checking and application builds. It verifies atomic combined group name/graded-membership edits with one version/change ID, Designer denial, cycles/stale versions and rollback on journal failure; field/context-only uniqueness feedback; and business-number search projections under field restrictions. Chrome verified direct hint associations and label placement, invalid-field marking/focus and both uniqueness contexts, standard number columns/global search, compact counter validation with suppressed invalid examples, the four-section field editor, instance-role labels, combined group Reset, 390-pixel membership/translation layouts and dark mode. No browser errors were recorded. All temporary drafts, viewport and appearance were restored; no real group permissions or demo contents were changed by browser QA.

Closeout reconciliation reused these successful checks. The misleading protected-field API message was corrected; the numbering integration scenario and server build passed again, followed by a local server restart. Final HTTP readback returned 200 and the unchanged normal fixture inventory. Documentation validation checked 41 documents, 187 local links/anchors, 47 requirements, 30 ADRs and 71 documented operations. Publication/CI/OpenProject writes remain separate authorized actions; version stays 0.0.0 / Unreleased.

This is local development evidence, not publication, remote CI, a release or deployment. Calendar-only functionality, notification delivery, external API/MCP credential issuance and complete domain modules remain separate work. Login/sign-out and the experimental Administrator CLI lifecycle are not yet journaled.

## Structured Contacts and UI closeout — 2026-11-04

This block follows the field-input/numbering closeout. The target catalog and lean start profiles cover 22 objects across Contacts & Relations and Projects & Tasks; Documents & Communication and synchronization remain later scope. ADR 0032 selects the structured-domain architecture. Its nine contact codecs and base Contacts/Distribution-list provisioning are implemented locally; edge attributes, temporal/recurrence codecs, complete module delivery and standards exchange remain pending.

The current installation has typed JSONB name, email, phone, address, URL and partial-birthday fields, finite codec metadata, stable entry/option identities, translated input aids, whole-field rights and per-field typed history. Current-rights projection protects derived names in records, search, Dossier and history. Supplied Organization membership allows at most one Organization per Contact person; Identities remains a symmetric direct list for personal Contact kinds. Both modules reuse the same supplied Contacts identity. Structured conversions, stale writes, inactive options and induced journal failures retain the common validation and transaction guarantees.

Contact creation selects Organization, Contact person or Individual contact first; normal UI/API/MCP writes cannot convert the kind. Fixed kind-specific core forms omit the derived Keyword/controller inputs and leave additional fields/custom relationships to the designer. Name & organization and Further details share a responsive row; Contact details and Addresses share another. Personal names use plain text inputs with retained structured identities, separate configurable Salutation and Academic title, and optional Gender. Birthday supports a known or unknown year through regional text/calendar controls without persisting an anchor year. The link menus omit only supplied Organization membership, retaining General, Identities and other applicable links.

Telephone Usage and Phone type are independent optional single selections in the UI; email/web/address contexts use the same optional-label convention. Ordered collections derive consecutive preferences, retain entry identities and show errors only on invalid entries. Configurable API-supplied context combinations survive unrelated edits. Wider number inputs, direct reorder controls, compact preference help, unframed address separators and Region before Country make the controls consistent. Formatted address is not a manual input.

Editable starter forms place maximum-one custom connections in General, a separate Primary association before Classification, multi-target lists in Relationships and existing multiline Notes last. Authored layouts and Contact core boundaries are preserved. Supplied/demo long-text notes use Markdown with one safe shared preview renderer for headings, lists, quotations, code, links and line breaks; raw HTML, images and unsafe links are omitted. A rich editor remains deferred. Insert timestamp uses the current user's display name and effective regional time zone/format, inserts one line and newline at the selection, restores input focus/caret and refuses overflow without saving. Reset clears its overflow error. Textareas grow only to 320 pixels, then scroll internally.

Distribution lists use Keyword and a short plain-text Description in General, membership relationships and separate final Markdown Notes. Their initial template/fixture installs no Business number or numbering. Fictional contents remain English and translatable metadata is bilingual. Optional Contact position/function/department, nickname, communication languages, messaging, contact time zone, Wedding anniversary, Date of death and Photo/Logo preparation are documented as pending; this closeout does not claim their implementation or upload support.

Shared record/Dossier/Journal/recycle-bin tables explain current-page selection and offer Copy selected IDs and Clear selection. They do not imply bulk writes. The browser caches only the last resolved interface language to avoid switching language during reload; authenticated workspace/user policy remains authoritative and unavailable storage is tolerated.

Validation evidence is scoped and overlapping. Earlier implementation runs passed the complete affected server suite (123 tests at the salutation slice) and web suite (72 at the birthday/menu slice), application type checks and contracts/server/web builds. Subsequent changes were checked with focused scenarios. The final closeout reran eight PostgreSQL integration scenarios for fixtures, forms, structured fields, Contacts provisioning, permissions/cardinality, salutation/title, telephone groups and order-derived preferences, two codec tests and 27 affected web tests; all passed. The selected integration command additionally reported a filtered file wrapper as passed; it is not counted as another feature scenario. The latest web production build includes TypeScript checking and passed. No unrelated website or full-repository audit build was repeated.

Chrome acceptance covered all nine object lists and representative record forms, the three Contact creation forms, settings and nested field/user/foreign-access/journal dialogs, search/Command-K, sort/pagination/selection, link picking, Dossier/Journal/tree, dirty guards, timestamps, Markdown and collection drafts. The final fixes were verified by overflowing/resetting a 10,000-character note, checking the 320-pixel bound, copying nine unique selected IDs, clearing selection, changing pages, English reload loading text and the Journal's shared actions. The latest broad review ran as Administrator; it is not a full multi-role/production/accessibility acceptance. The 390-pixel checks had no horizontal page overflow; temporary viewport overrides, clipboard and unsaved drafts were restored. No application console errors appeared in the final checks.

Final local readback: HTTP 200, healthy development PostgreSQL, ITextreme / itx, English default, three role accounts, nine active object types with 74 normal records, one inactive object with one retained record, eight relationship types, 54 edges and no missing English/German object/field labels. The last implementation reset recreated the disposable installation from current schema/catalog; this closeout performed no reset or restart. All 16 ignored private receipt/recovery files (602,785 bytes, including two dumps) remain protected. Runtime builds are required. One older isolated test container has no running test process and is a possibly orphaned cleanup candidate; it and its volume remain untouched. The closeout's own temporary PostgreSQL container was removed by the test harness.

Documentation validation checked 43 Markdown documents, 229 local links/anchors, 47 unique requirement IDs and 32 ADRs. The roadmap/appendix/ADR status now distinguishes implemented Contact foundations from remaining domain contracts; fixture counts, form groups and absent Distribution-list numbering match source/current readback. Version remains 0.0.0 / Unreleased. The external closeout is authorized; OpenProject records the final commit, remote, PR/CI and merge evidence as those steps finish. This local validation does not by itself establish publication, a release or production/website deployment.

The first PR CI run found insufficient TypeScript narrowing in the demo fixture assertions (multiline values and optional numbering metadata). Explicit string/presence assertions retain the runtime checks while allowing the full server test typecheck. This correction changes only the test, not application/runtime behavior; the affected fixture scenario and root typecheck passed again.

## Additional Contact details — 2026-11-05

The next independent Contact-field slice installs optional Nickname, communication languages, messenger addresses, Contact time zone, Wedding anniversary and Date of death. Personal name/date additions apply only to Individual contacts and Contact persons; communications and named zone apply to every Contact kind. Position, Function and Department remain pending the relationship-owned attribute architecture; no competing flat fields are installed. Fixed-core Photo/Logo presentation is prepared with disabled upload controls, without stored media, URLs or a transport endpoint. Media storage and its field-level rights remain future work.

Three additional finite codecs reuse the existing structured-field engine: canonical communication language tags, ordered messaging URIs and a named zone object. Entry identity/order, whole-field permissions, optimistic record versions and per-field typed history remain shared by web/API/MCP. Personal dates reuse the optional-year codec, now with generic date wording. Language inputs display readable localized language names, and invalid drafts mark only the offending row. These fields do not change interface languages, display zones, status, notification subscriptions or initiate remote requests.

Root typechecking and contracts/server/web builds passed. Four focused PostgreSQL integration scenarios verify fixture creation, existing structured permissions/history, module provisioning and the new fields through API/MCP, including kind applicability, invalid-input rollback, stale versions, hidden field/history and independence from workspace zones. Three codec tests and eight affected web tests passed. The finite schema-inventory expectation was updated from six to nine; no historical schema/API fallback was added.

Chrome verified Nickname save and its per-field journal, followed by a normal saved restoration of the original fictional value; invalid Date of death blocks Save; a yearless anniversary remains supported. Zone changes and malformed language drafts reset correctly; only the invalid language row is marked. Language reordering works with keyboard activation. The 390-pixel form had no horizontal page overflow; viewport and all drafts were restored. The installed autofill extension logged its own DOM errors; no application runtime errors were observed. This is a focused local check, not full product/interoperability acceptance.

The disposable development installation was recreated from the current catalog after creating and verifying a private custom-format database backup and copying three existing account/relationship receipts. The existing private John Doe installation credential was reused; Jane/James demo receipts were regenerated normally. Runtime serves the rebuilt assets and nine-codec model. No commit, push, remote CI, OpenProject write, production deployment or release was performed for this slice.

The Contact-layout follow-up puts Name & organization next to Photo/Logo, followed by Further details alongside a separate Language & time zone section. Communication language collections and the independent contact zone move together; telephone/email/web/messenger remain in Contact details alongside Addresses. Classification, Relationships and Notes retain their order. The loading composition uses the same media slot and section structure. These fixed-core presentation changes do not change stored values or authored extension layouts, and require no database reset.

The Messenger consistency follow-up shares Telephone's codec-owned option-group descriptor, configuration validation and responsive row composition. Messenger entries show Usage / Type / URI, with optional single selection in each dimension, editable bilingual initial choices, retained inactive/API-supplied labels, immutable group identities and order-derived preference. Type is metadata and does not rewrite the URI or open a connection. The ordinary field editor has separate Usage and Type sections and a group selector for new options.

Application builds and root typechecking passed; three targeted PostgreSQL scenarios cover existing Telephone groups, the fictional fixture and configurable Messenger API/MCP groups/history. Four codec tests and five affected web tests passed. Chrome confirmed desktop row alignment with Telephone, independent Usage/Type edits without changing URI, Reset, editable grouped input aids, new-option group selection and 390-pixel layout without horizontal page overflow. The blocking autofill popup was dismissed in the dedicated test tab through native Chrome controls; the normal login flow was used. Temporary viewport and drafts were restored.

The current catalog/fixture was recreated after a verified private database dump and three receipt copies; the existing private John Doe credential was reused and standard demo receipts regenerated. The test server serves the new model. No commits, pushes or external publication were performed for this follow-up.

The postal-address follow-up shares component limits between contracts and controls, adds a localized complete preview and preserves PO box, additional address, street lines and Region in read-only/history formatting. Errors target individual inputs; clearing the first street line retains additional lines as an invalid draft instead of shifting them. The stored formatted label remains untouched.

Validation: application build and root typecheck passed, alongside seven affected web tests, five codec tests and two PostgreSQL API/MCP scenarios, including unchanged record versions after rejected writes and per-field component history. Chrome verified full previews, exact limits/error targeting, invalid-save gating, Reset and a 390-pixel layout without horizontal overflow; no console errors were captured. Drafts and the temporary viewport were reset. The local server was restarted from the new build; no development database reset was needed.

Country controls now use the standard shadcn Combobox and the i18n-iso-countries catalog, with German/English labels, alphabetical localized sorting and search across both languages and two-letter codes. New selections store English country-name text; opening, searching or changing interface language never rewrites an existing value. Unmatched existing text remains a selectable current value. Clearing is explicit; abandoned searches restore the selected label. The existing address codec, API/MCP and journal continue to use country text without a schema change. Workspace menu appearance also applies to the combobox popup.

Country validation: application build, root typecheck and five focused country/address tests passed. Chrome verified German-name search in the English UI, keyboard selection, explicit clearing, Reset, empty results, abandoned-search retention and a 390-pixel popup without horizontal overflow. No console errors were captured; test drafts and viewport were restored.

## CRM roles, shared module contributions and acceptance — 2026-11-05

Relationship field definitions now use the common field namespace with an exclusive object/relationship owner. Typed values live on the edge JSONB map and share field configuration, whole-field rights, versions and journals. Job title/Department/Function are direct Contact fields for Contact persons and Individual contacts; the supplied Organization-membership relationship has no attributes. Record forms edit them in the normal draft and use one Save/Reset. Relationship types exposes the same field editor for input aids and extensions; user/group ceilings and sensitive-record exceptions include incident relationship fields. Both endpoints bound read/edit rights and historical projections. Generic edge reassignment does not carry old attribute values; recycling/restoration retains the edge and values. Direct Contact professional roles remain unchanged by Organization reassignment.

Object/field module contributions record shared identities, field selections and template versions. Modules retain definitions, contents and views while disabled; another enabled contributor keeps a shared object available. Projects supplies the shared complete Contact core; Distribution lists follows Contacts activation. Primary links still block Projects deactivation until removed. Additive template updates preserve customized fields/input aids/forms and reject structural conflicts atomically. Form designer and record forms offer independent Shared/Contacts/Projects views for actual contributing modules, with draft guards and common values/rights. The Contact core remains fixed; extensions use the selected view. Address details/preview actions align side by side and their disclosures use the full width.

The current schema adds relationship ownership, positive edge versions/change metadata, UUID-keyed edge values with scope validation, module template versions and composite-scoped contributions. The disposable local installation was recreated, preserving the existing Administrator credentials and retaining a verified pre-change backup plus prior private fixture receipts. Fictional ITextreme data now demonstrates different professional roles on Contact records with bilingual choices; account roles and English default/content remain unchanged. Released application migrations, non-additive template transformations and standards exchange remain separate delivery work.

Acceptance evidence: 17 focused PostgreSQL API/MCP scenarios cover Contact kinds/derived names, Organization cardinality, Identities/Distribution lists, field projections, collection preferences, module activation/order/conflicts, retained forms/identities, additive template updates, both-endpoint attribute rights (including record exceptions), stale edge versions, reassignment, recycle/restore, configuration roles and induced-journal rollback. All passed; the five new attribute/module-evolution scenarios were rerun after their final refinements. Thirty-three affected web tests passed, including module field selection with required-field retention, link reselection without attribute loss, regional numeric attribute drafts and historical field labels. Application build and root typecheck passed.

Chrome verified the organizational fields and role choices, saving/restoring a title and its typed per-field Journal, relationship input-aid settings, module-view selection and designer draft Reset. Address actions share one baseline; at 390 pixels both remain visible side by side and neither the contact form nor the disclosures cause horizontal page overflow. The last compiled UI was reloaded and checked for clean Save/Reset state without application console errors. Test drafts and viewport overrides were restored. The current local server is running with the rebuilt fictional installation and John Doe signed in. This establishes the requested local CRM slice, not standards-exchange or full-product release acceptance.

## Direct Contact professional details — 2026-11-05

Job title/Department/Function now belong to the Contact object for Contact persons and Individual contacts. Applicability depends only on Contact kind, not on company name or an Organization link. The fixed Professional details section sits in the right-hand column beneath Photo and stacks with it on narrow screens. Organization changes/removal retain these values and use the ordinary Contact field rights/record Journal. Generic relationship fields remain implemented independently; their tests create explicit user-defined attributes rather than relying on supplied membership attributes. The demo configures the object-owned Function dictionary and supplies examples for both personal Contact kinds. The catalog change requires the current disposable installation to be recreated; no previous development schema or attribute-to-Contact fallback is kept.


Validation of the direct-Contact refinement: application build and root typecheck passed; nine focused PostgreSQL scenarios and 34 affected web tests passed. The disposable installation was recreated from the current catalog after a verified backup, retaining the Administrator credentials. Runtime schema validation passed with nine active objects, 74 active records and no supplied membership attributes. Chrome verified the populated Professional details section beneath Photo on a Contact person, its presence for an Individual contact with an empty company name, its absence for Organizations, and a 390-pixel view without horizontal page overflow. No application console errors were captured. The viewport was restored, and John Doe remains signed in on the running local server.


## One common object form — 2026-11-05

Each object now uses one common form in both record editing and the Form designer. Module contributions retain their definition ownership and template versions; they do not filter or select forms. API/MCP configuration accepts only the common layout, and database metadata is restricted to its default key. The disposable demo was rebuilt from the current installation after a verified backup, preserving the existing Administrator credentials.

Validation: application build and root typecheck passed; four focused PostgreSQL layout/module-lifecycle tests, the fictional-demo scenario and 12 affected form/contact tests passed. Current-schema readback confirmed nine active objects and 74 records. Chrome verified the record page and designer without a form-view selector, retained Professional details and a clean application console. John Doe remains signed in, with the local server running.


## Contact presentation polish — 2026-11-05

Record actions remain direct desktop buttons and become a compact menu on narrow screens, retaining confirmation, permission and unsaved-draft checks. Contact Function uses a multi-selection checkbox menu with normal Save/Reset; date-format help opens beside the field label, time-zone help is optional, media placeholders use a short note, and phone/messenger type selectors have more room. Contact loading uses known controller values and readable field metadata, or a neutral frame when Contact kind is not yet known.

Validation: application build, root typecheck and 11 focused loading/contact/date/entry-validation tests passed. Chrome verified desktop actions, the mobile menu and cancelled recycle confirmation, multiple Function choices with Reset, date/time-zone help, an untruncated Voice calls label, no page overflow at 390 pixels and no application console errors. No records were deleted or duplicated. Drafts and viewport override were restored; the local server remains running.


## CRM functional acceptance and batch review — 2026-11-05

Contacts & Relations V1 is locally accepted for Contacts and Distribution lists. The accepted scope uses one common form per object, with a fixed Contact core and configurable extensions. The evidence is limited to this functional scope; product release, scale and comprehensive accessibility acceptance remain separate.

| Acceptance area | Result and evidence |
| --- | --- |
| Three Contact kinds | UI selects the immutable kind before creation; normal API/MCP kind changes and incompatible fields are rejected. Derived Keyword is absent as an input. Organization, Individual contact and Contact person requirements and names are validated. |
| Organization and professional details | At most one Organization per Contact person. Replacement/removal updates names and retains direct Job title/Department/Function. Individual contacts always expose these fields; Organizations reject them. |
| Identities | Direct symmetric links retain separate Contact records and independent professional values; editing an Individual contact does not change its linked Contact person. No transitive merging or permission grant is implied. |
| Contact collections | Typed name/contact/address values, order-derived preferences, grouped usage/type choices, partial dates, exact component limits and per-field journal snapshots are verified through API/MCP. |
| Distribution lists | Empty lists and mixed Contact kinds, plain-text Description, final Markdown Notes, no supplied business numbering, duplicate rejection and membership removal without Contact deletion are verified. Restricted members are hidden and retained; their relationship field is read-only, while scalar edits remain possible. Unauthorized writes preserve the source version and contents. |
| Rights and history | Source-field redaction protects derived names, search, dossier and history. Generic relationship fields require both endpoints' rights, use version checks and roll back with journal failures; lifecycle tests retain typed values. |
| Modules and forms | Shared identities, common layout, configured input aids and contents survive activation/deactivation and additive template updates; structural conflicts fail atomically. |
| Browser | Contact creation, fixed-core boundaries, existing-record fields, Distribution-list membership draft/Reset, German labels and English restoration checked. Earlier current desktop/mobile checks include action confirmation, multi-select Reset, contextual help and 390-pixel overflow. No application console errors observed. |

Final scoped evidence: 17 distinct PostgreSQL API/MCP scenarios passed, with the final professional/Identities and Distribution-rights cases rerun successfully after acceptance-test refinements; five structured-codec tests and 38 affected web tests passed. Current root typecheck and application builds passed; no unrelated website audit/build was run. Documentation checks cover 43 documents, 228 relative links/anchors, 47 unique requirement IDs and 32 ADRs. Whitespace checks pass.

This batch begins after the last completed closeout at main `97d729d` (PR 24). It includes the additional Contact profile, postal/country controls, generic relationship fields, module contributions/lifecycle/template updates, common-form simplification, responsive record actions and CRM acceptance/documentation refinement. Runtime readback confirms the current installation, nine active objects and 74 normal records; HTTP returns 200 and the development database is healthy. Reused earlier instance rebuilds preserved Administrator credentials and verified backups; this review itself did not reset the database. Private fixture receipts, dumps and active volumes are retained. One older isolated test container remains a possible cleanup candidate and was not removed.

Later Contact work comprises kind conversion, guided Organization-change workflows, duplicate detection/merge, optional role-validity intervals, media uploads and standards exchange/synchronization. The 11 additional Contacts objects remain next-version scope. The remaining nine Projects profiles, delivery/upgrade tooling and full-product acceptance are separate work. Local acceptance does not publish Git changes or create a software release.

Publication CI refinement: the first complete PR run exposed five pre-existing relationship/tree/permission/recycle fixtures that still created Projects-owned Contacts without a Contact kind or assigned their derived Keyword. They now create regular Organizations through the current Contact contract, retaining the original graph, authorization and lifecycle assertions. All five affected scenarios and the server typecheck passed after this test-only correction; no runtime compatibility or permission relaxation was introduced.
