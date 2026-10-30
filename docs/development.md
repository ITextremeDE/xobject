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

The React/Vite client uses standard Base UI-based shadcn/ui components (`base-nova`) and Tailwind semantic tokens in `apps/web/src/index.css`. Adjust appearance through those variables and existing component variants. Shared workspace design is stored in `sys_workspaces.appearance` and `appearance_version`; see [ADR 0011](adr/0011-workspace-appearance.md). The application shell follows the official [Sidebar 07 block](https://ui.shadcn.com/blocks/sidebar#sidebar-07): workspace switcher, icon-collapsible inset sidebar, user menu and Breadcrumb header. The record list follows the compact filter/table structure of the [Tasks example](https://ui.shadcn.com/examples/tasks), with only supported xObject actions. Keep these references when changing the layout; the installed official Nova components and theme remain the visual baseline. UI strings live in `apps/web/src/lib/i18n.ts`; definition labels come from PostgreSQL. Record contents are never translated.

The server serves `apps/web/dist` and API/auth/MCP from one origin. For frontend iteration, leave `npm run dev` running and run `npm run dev:web` in a second terminal. Vite rebuilds on changes; refresh the browser afterwards. Local builds retain content-hashed assets so an already-open client can still load its original lazy chunks. CI (`CI=true`) and explicit `XOBJECT_CLEAN_BUILD=1 npm run build --workspace @xobject/web` builds clear the output first; use explicit clean builds with the local HTTP process stopped. Retained build files are generated artifacts, not a release or source backup. There is deliberately no cross-origin development proxy or relaxed auth origin check. Restart the backend after server changes.

The Dashboard is the first navigation entry and workspace landing page. Its dashboard-01 composition displays actual workspace record/object statistics, daily activity and a mixed-object standard-field table for Administrators. Other members retain permitted definition navigation without business-content metrics. See ADR 0016. Navigation to it preserves the unsaved-record confirmation. The workspace name in the Breadcrumb links to this Dashboard. The shared user menu at the top right and in the sidebar footer opens the Settings dialog based on shadcn Sidebar 13. Its Personal group contains Profile (own name, read-only email and prepared avatar), Account & security (own password and sessions), Appearance (browser theme) and Language & region (user language, optional time zone and regional-format overrides); the Workspace group contains General (editable name and read-only code), Appearance (separate base/Theme/chart palettes, menu surfaces/accents, locally served interface/heading fonts and interactive light/dark preview), Language & region (available interface languages, default, independent definition languages, named time zone and regional display defaults), User groups (names, direct memberships and activation), and Object types (alphabetical standard shadcn Select, editable translated labels, read-only technical names, classification configuration and a field-definition table). An Administrator-only Instance group contains Users and the global Journal; workspace membership/role assignment remains in Members & roles. These group labels do not change preference scope: the theme remains browser-local and the language remains a user preference. On small screens a section selector keeps settings pages accessible. Each settings page stages changes until Save; Save and Reset apply to the current page, while the shared close guard covers unsaved drafts across all pages. Workspace name changes use the shared API/MCP operation and journal atomically. Command/Ctrl+Enter saves the focused form. The object selector confirms before discarding a changed object; switching settings pages retains the object draft. Object labels use `set_labels`; the shared classification dialog edits Type/Status/Category rules. The field table shows the current metadata-backed fields with their translated and technical names and field kinds. The header appearance dropdown remains immediate; these controls no longer occupy the sidebar footer. Header buttons use the standard `outline` / `icon-lg` variants. Header actions run left to right: disabled notification placeholder, appearance dropdown, user menu. Search sits below the workspace chooser in the sidebar and also opens with Command/Ctrl+K. No notification backend, counts or read status are implemented. Theme application remains mounted globally so system appearance changes also work away from Settings.

The client covers login/logout, workspace selection/creation, object and typed-field creation, Type/Status/Category configuration, Keyword search with configurable pagination, record creation/editing and record journals. Conflicting versions are rejected by the backend; unsaved record edits prompt before navigation. Language follows the user preference or workspace default. Theme is local to the browser; authentication uses the server session cookie. Business data and credentials are not persisted in browser local storage.

Record-list sorting runs on the server before pagination, with nulls last and record ID as a stable tie-breaker. Column headers toggle ascending/descending order and reset to the first page; the initial order is Last changed descending. Only defined record fields and Last changed are accepted as sort columns. Text ordering follows the database collation.

Shared operation schemas and wire types live in `packages/contracts`; all three workspaces build from the root. Browser validation supplements the same backend rules used by HTTP and MCP. Business-content operations still require an Administrator account. Other signed-in users can manage their own profile/security/preferences and inspect permitted workspace configuration; Designers can edit configuration. This is not the complete permissions model or version-1 acceptance.

## URLs and navigation

React Router uses browser history, with the current URL as the source for the selected page and list state:

| URL | View |
| --- | --- |
| `/` | Redirect to the first available workspace, or initial workspace creation |
| `/settings` | Settings dialog; navigation retains the originating workspace/view in history state and closing returns there; direct links open over the default workspace Dashboard |
| `/w/itx` | ITextreme workspace Dashboard |
| `/w/itx/objects/vehicles` | Vehicles list |
| `/w/itx/objects/vehicles/new` | Unsaved new record form |
| `/w/itx/objects/vehicles/<UUID>` | Existing record details |

Workspace codes and object technical names are fixed identifiers, independent of translated labels. A new record replaces `new` with its returned UUID after successful saving. Invalid workspaces/object types display a not-found state rather than silently switching context. Authentication is still required for data; signing in retains the requested URL.

Record lists use `q`, `sort`, `direction` (`asc`/`desc`) and one-based `page` query parameters, for example `/w/itx/objects/vehicles?q=Service&sort=keyword&direction=asc&page=2`. Search edits replace the current history entry; sort/page changes create history entries. Search/sort reset the page, and opening/closing details retains list parameters. Invalid values fall back to supported defaults; the server remains authoritative for validation and access.

Back/Forward and internal navigation use the same unsaved-change confirmation as mouse actions. Pending saves block navigation. Reload/closing the tab uses the browser's native before-unload prompt for dirty forms. The server falls back to the application shell only for known document URL patterns requested as HTML; missing API/MCP endpoints and assets keep their original error responses. This also supports direct links and refresh without a separate proxy.

Clicking the exact active Dashboard or object-list destination in the Sidebar re-fetches the current view’s workspace/type metadata and, for object lists, definition and record queries. It preserves the document, URL parameters and history entry. Other Sidebar targets navigate normally, including returning from record details to their list. Busy writes and unsaved-change confirmation remain in effect; the Breadcrumb has no special refresh action.

Record-table rows open details when a non-interactive cell is clicked. They retain the standard cursor without an application override. The Keyword remains a real link for keyboard access and native link actions. Interactive child controls, modified clicks and selected text do not trigger row navigation. The application retains shadcn’s existing cursor styles elsewhere; there is no global pointer override.

## Sidebar search and command navigation

The sidebar search opens a scrollable command menu with permitted local navigation, object definitions and resource links. Navigation has no minimum query length. Administrator record search uses the current workspace's localized object names/technical names and record Keywords through `search_workspace`, exposed through the same API/MCP application layer; remote searches require two characters and debounce requests. Other workspace members receive permitted navigation without content searches. Native Command navigation supports arrow keys, Enter and Escape; navigating to a result retains the unsaved-record confirmation.

The backend returns bounded groups with explicit overflow flags, shown as a request to refine the query. Text is literal, case-insensitive substring matching; custom field values and journal history are not searched. This experiment scans the workspace's metadata-derived tables under its existing Administrator guard/model lock; production full-text indexing and the complete permissions model remain outside this slice.

## Keyboard interaction

Keep application shortcuts in `apps/web/src/lib/keyboard.ts`; native focus, menu and tab navigation belongs to Base UI. Both user menus open the localized keyboard help alongside Settings. Closing it returns focus to its originating user button; the mobile sidebar falls back to the header user button. Standard `Kbd` hints accompany search and form actions.

- Tab / Shift+Tab move focus; arrow keys navigate menus, choices and tabs; Enter/Space activate the focused control.
- Escape closes menus/dialogs. Leaving an edited record retains the existing discard confirmation.
- Command+Enter (macOS) or Ctrl+Enter submits the focused, explicitly opted-in form. Native validation and the normal backend path still apply; disabled/pending submit buttons and key repeats do not submit. Forms include record editing, model/workspace creation and login.
- Command+K / Ctrl+K opens or closes the sidebar command search, including from text inputs; other modal dialogs and menus retain focus. The shortcut is displayed in the sidebar trigger/tooltip and keyboard help.
- `/` focuses Keyword search only outside editable controls, menus and dialogs. It does not insert a slash into the newly focused search field.
- Preserve visible focus styles and return focus to the originating control when closing a popup. Browser tab shortcuts Command/Ctrl+1–9 remain untouched. The upstream sidebar Command/Ctrl+B handler is disabled to keep browser shortcuts and application shortcut ownership explicit.

When adding a shortcut, update the central definition, visible hint, localized help and affected browser checks together. Do not bind an action solely in a keyboard handler; mouse, keyboard and API must retain the same validation and authorization.

## HTTP and MCP interface

Sign in by sending a JSON `POST` request to `/api/auth/sign-in/email` with `email` and `password`. Preserve the returned session cookie. Better Auth also provides session lookup and sign-out under `/api/auth/`.

For this experiment, each application operation is a JSON `POST` to `/api/v1/<operation>`. This operation-oriented adapter is not the final REST/OpenAPI contract. The identical operation names are MCP tools at `/mcp`:

| Operation | Input |
| --- | --- |
| `create_workspace` | `name`, `code`, optional `defaultLanguage` (`en` by default) and `timeZone` (`UTC` by default) |
| `list_workspaces` | Empty object |
| `create_object_type` | `workspaceId`, `technicalName`, `labels`, optional `standardFields` (`keyword`, `type_status`, `category`; empty by default) |
| `search_workspace` | `workspaceId`, `query` (2–200 characters), optional `limit` (1–50, default 20 per result group); localized object matches and record Keyword matches with explicit overflow flags |
| `list_object_types` | `workspaceId`; returns localized object names |
| `list_records` | `objectTypeId`, optional literal Keyword `query`, `limit` (1–100, default 25), `offset`, `sortBy` (`id`, Keyword, active defined field technical name or `updated_at`, default), `sortDirection` (`asc`/`desc`, default `desc`) |
| `configure_classification` | `objectTypeId`, expected configuration `version`, complete `config` (rules and stable options); returns the localized object definition |
| `create_group` | `workspaceId`, `name`; creates a reference dictionary group without granting permissions or memberships |
| `list_field_principals` | `workspaceId`; existing users and groups in this workspace, without credentials or email addresses |
| `create_field` | `objectTypeId`, `technicalName`, `labels`, optional custom `kind`, `config` and `required` |
| `get_object_type` | `objectTypeId`; returns labels, resolved names, fields and physical column names |
| `configure_field` | `fieldId`, `required`, optional `labels`, `kind`, `config`; preflights typed conversion and saves field attributes atomically, with one journal entry per changed attribute and a shared change ID |
| `set_field_required` | `fieldId`, `required`; preflights existing values and journals atomically. Shared classification fields use their existing configuration as the source of truth. |
| `set_labels` | `kind` (`object_type` or `field`), definition `id`, complete replacement `labels` map |
| `set_workspace_name` | `workspaceId`, `name` (trimmed, 1–200 characters); immutable code and physical tables remain unchanged |
| `set_workspace_language` | `workspaceId`, `language` (`de` or `en`) |
| `set_user_language` | Own preference `language` (`de`, `en` or null to inherit) |
| `create_record` | `objectTypeId`, optional installed `keyword`, typed `values` map and `classification` (`type`, `status`, `category`) |
| `update_record` | `objectTypeId`, `recordId`, expected `version`, optional installed `keyword`, typed `values` and partial `classification` |
| `get_record` | `objectTypeId`, `recordId` |
| `get_journal` | `objectTypeId`, `recordId` |

Send `Content-Type: application/json`, the current session cookie and `X-XObject-Request: 1`. Requests with an Origin must match `BASE_URL`; Host must match its configured host/port. No cross-origin web access is enabled. An agent cannot provide a user ID to impersonate a different account. Non-administrators see only their assigned workspaces; Users read workspace settings and Designers edit configuration. Business-content operations remain Administrator-only pending object/field/record rights.

The MCP endpoint supports stateless Streamable HTTP POST requests with JSON responses. GET/DELETE return 405. For local evaluation, configure the MCP client's request headers with the current session cookie and `X-XObject-Request: 1`; do not store these credentials in a committed configuration. This proves the MCP/application integration without claiming a production OAuth/token flow.

Example operation bodies, sent in order using the IDs returned by earlier calls:

```json
{"name":"ITextreme","code":"itx","defaultLanguage":"de"}
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

This creates the physical table `itx_vehicles` and its `registration` text column. Table prefixes are readable names, not an authorization mechanism.

## Labels, language preferences and column order

Definition names use `labels` JSONB maps; they accept at least one of `de` and `en`. Technical table and field names stay English and stable. `get_object_type` returns both the raw maps and a derived `label`, resolved using the current user's preference and workspace default. The stored Keyword and other contents are never translated. The Keyword definition itself has fixed `de: Stichwort` / `en: Keyword` labels.

`set_labels` replaces a custom definition's complete labels map. Preference and label changes are journaled; assigning an unchanged value does not add a change entry. Users may update their own language preference. Workspace configuration follows User/Designer membership and the instance-wide Administrator role described in ADR 0008. A user-language journal event has no workspace ID because the account is installation-wide.

Stop the development HTTP process before applying schema changes, then restart it after `npm run db:migrate`. For earlier local databases, this command preserves scalar labels under the undetermined-language key `und`. Explicitly replace known labels through `set_labels` when their languages are known. Existing business records, definition IDs, journal rows and physical column order are retained. Newly created tables start with system metadata. Optional standard fields and custom columns are appended when installed; existing physical column order is preserved. The pre-classification legacy upgrade adds classification fields once; subsequent migrations do not add absent optional fields. No table rebuild is performed for ordering. See [ADR 0003](adr/0003-localized-labels-and-column-order.md).

## What the experiment establishes

The tests exercise persisted credential hashes and sessions, identical API/MCP behavior, stable UUIDv7 identities, per-field journal entries, rejected invalid names and writes, two workspaces with the same object name, stale/concurrent edit rejection and full rollback on journal failure, including table/column creation.

It does not deliver the remaining shared fields, references to other business objects, general collections beyond choices/principals, relationships, CRM/PM modules, complete object/field/record permissions, complete authentication-event journaling, production migrations, production MCP authorization or a release package. No product requirement or complete acceptance scenario is marked fulfilled solely by this test.

## Type, Status and Category

Open the relevant field in Settings → Workspace → Object types to configure localized options, required flags, defaults and single/multiple Category mode. Users can view these attributes; workspace Designers and Administrators can edit them. Each field is optional initially, with empty dictionaries and no defaults. Existing records receive null Type/Status and an empty Category array without changing IDs, versions, earlier values or historical journal entries. Run the explicit migration command before restarting the updated server.

`configure_classification` replaces the configuration at its expected version. Retained option IDs and kinds remain fixed. Unused Type/Status options may be removed when no current records or record journal entries reference them; a Type must have no remaining Status options. Category options remain retained and can be deactivated. Deletion is atomic and journaled, and deleted option identities cannot be reused. Active defaults must match their field and, for Status, their Type. Required Status needs available choices for each active Type and for Without Type when Type is optional. A stricter configuration is rejected if any existing record would become invalid; existing records are never rewritten by the configuration operation.

Record writes take separate `classification` values: `type` and `status` are UUID/null, `category` is a unique UUID array (zero/one element in single mode). On creation, omitted values receive configured defaults; explicit null/empty choices override defaults. Updates preserve omitted values. A Type change must retain a valid Status, explicitly clear an optional one or supply a compatible replacement. The form offers the configured initial Status when changing to a different Type. Without Type only permits its own statuses. Inactive choices can remain on records that already use them; new assignments are rejected. Category order is not meaningful and is normalized before change detection.

Each changed record field has a stable field reference and its own old/new journal entry; related entries share a change ID. Settings and option attribute changes are journaled in the same transaction as the configuration. Tables and record journals display current localized option names while retaining technical IDs in history; option-renaming history remains in configuration journal entries. Classification sorting uses localized names before pagination.

Storage and migration trade-offs are documented in [ADR 0006](adr/0006-record-classification.md). The guarded full-table compatibility scan, JSON option dictionaries and current global model lock are local-experiment choices, not a production scalability claim.

Custom-field requiredness is stored in `sys_fields.required`; Type/Status/Category requiredness remains in the classification configuration and is exposed through the same `FieldDefinition.required` property. New object types start with system metadata only. Keyword, Type/Status together, and Category are opt-in standard fields, initially not required. Add them atomically through `add_standard_field` (or explicitly request `standardFields` in `create_object_type`); existing records and versions are retained. Absent fields have no physical business columns and reject incoming values. Without Keyword, record lists and search use the record ID. Installed but empty Keyword values remain empty strings. Enabling a required field rejects existing null, empty or whitespace-only values; create/update validate the complete resulting record. Object and field configuration lives in Settings → Workspace → Object types. Add object is available there, including when the workspace has no objects; successful creation selects the new definition. Record-list toolbars only expose record creation. When standard fields are missing, Add field opens a dropdown containing the missing standard fields and Custom field; when all are present it opens the custom-field dialog directly. The field table offers custom fields through the shared creation dialog, including the translation editor and unsaved-change guard; successful creation refreshes the table. It displays requiredness as Yes/No. Clicking a row or its keyboard-accessible name opens a field-attributes dialog with staged Save/Reset and discard protection. Custom-field labels, type, configuration and requiredness save atomically via `configure_field`; standard field labels and kinds, and existing technical names remain read-only. Migration preserves existing data and journals, initializes earlier Keywords as required once, and does not reset later choices or install absent optional fields on subsequent runs.

Definition names use the shared `TranslatedLabelInput`: one label input with a standard shadcn language Select, initially using the interface language. Each language shows Translated/Missing in the menu, and editing a missing translation starts blank rather than copying a fallback. Switching language only changes the editor view; all unsaved translations remain in the parent draft and are saved together. At least one supported-language label is required. Empty translations are omitted on save. The same editor is used for creating and editing object types, fields and classification options; fixed shared field names remain read-only. German and English remain the supported languages, and JSONB storage/fallback behavior is unchanged.

## Typed fields

See ADR 0007 for storage and conversion guarantees. The unified field dialog creates and edits Text, Multiline text (optional Markdown), Integer, Decimal, Money, Boolean, Date, Date/time, Single choice, Multiple choice, Email, Telephone, URL and User/group references. `create_field` accepts `kind` (default `text`) and kind-specific `config`; `configure_field` updates these atomically with labels and requiredness. New inputs are optional unless explicitly required. Kind changes on protected shared fields are rejected.

Decimal and Money configure `scale` (0–12); Money also configures a default ISO `currency`. Amounts/integers cross API/MCP as exact strings. Decimal input uses a dot and rejects exponent notation or excess nonzero decimal places. Money sorting groups by currency and then exact amount; it does not convert currencies. Choice sorting uses translated labels, and reference sorting uses principal names. Telephone input requires a valid international number and is canonicalized to E.164. Date is an ISO calendar date; Date/time requires an explicit offset with at most millisecond precision and is returned in UTC, with the web form displaying the effective personal/workspace named time zone under ADR 0014. Markdown previews disable raw HTML and images.

Choice configuration uses `options: [{id, labels, active}]`; assigned inactive choices remain displayable but cannot be newly assigned. IDs cannot be removed or reused across fields. Reference configuration uses `referenceTarget: user|group|both` and `multiple`. Values are `{kind, id}` or arrays thereof. Users must exist; groups must belong to the workspace. `create_group`/`list_field_principals` support reference dictionaries; group memberships follow ADR 0013; content authorization remains separate.

Type/config changes preflight all current records under the model lock and reject invalid or lossy conversions. Compatible single/multiple choices and references can convert when cardinality permits; scalar conversions must round-trip. Populated converted representations increment record versions, rejecting stale edits. Their field journals share the definition change ID; earlier historical entries stay unchanged. SQL DDL, data, metadata and journal writes roll back together.

Administrator assignments are stored in `sys_users.is_admin` (NOT NULL, default false). Better Auth maps its internal `isAdmin` attribute to this column with `input: false` and `returned: false`; it is not a writable profile field. The local administrator provisioning CLI sets the flag through trusted server-side SQL. Application/API/MCP authorization reads the flag directly from the database on every operation, so revocation also applies to existing sessions. The explicit migration transfers earlier `sys_administrators` assignments atomically and removes the mapping table. Repeating the migration does not reset existing flags.

Custom field creation and label updates reject the reserved names Keyword/Stichwort, Type/Typ, Status and Category/Kategorie, using Unicode compatibility normalization, trimming and case folding. Both technical names and every supplied translation are checked, even when the corresponding standard field is absent. Existing custom definitions are preserved; the reserved-name check applies to new/updated labels.

## Workspace roles

See [ADR 0008](adr/0008-workspace-roles.md). `get_access_context` returns the caller's current `isAdmin` capability; `list_workspaces` returns accessible workspaces with effective `role` (`administrator`, `designer`, `user`). Users and Designers see only explicit memberships; Administrators see all workspaces. Current flags and memberships are resolved on every API/MCP operation. Field/object IDs are resolved back to their workspace before authorization.

Settings → Workspace → Members & roles shows assigned members and implicit instance Administrators. An Administrator can add an existing non-administrator account, choose User or Designer, change a member's role or remove membership. Accounts are provisioned separately; this screen neither creates accounts nor changes instance administrator flags. Designers and Users can view this list but cannot change memberships.

`list_workspace_members` takes `workspaceId`. `list_users` is an Administrator-only account directory. `set_workspace_member` takes `workspaceId`, `userId`, `role` (`user`, `designer`, or null to remove) and `expectedRole` (the prior role or null for a new membership). Stale assignments return 409. Each membership change is journaled atomically; no-op assignments produce no event. Business-content operations and search remain Administrator-only until their separate permission model is implemented. The local migration adds no memberships automatically and preserves all existing administrator assignments.

## Definition lifecycle

Settings → Workspace → Object types exposes availability, Deactivate/Reactivate, Delete for unused definitions and the Definition journal. Field dialogs expose the same lifecycle actions. Type/Status changes affect both fields. Lifecycle actions are disabled while there are unsaved attribute changes. The deleted-definition toggle sits below the object selector and is disabled while definition drafts are unsaved. It permits historical inspection; deleted metadata is read-only and its physical storage is gone. Inactive object types have an explicit read-only record-view link for callers with content access. Inactive fields appear in a separate read-only record section.

`set_definition_state` takes `kind` (`field` or `object_type`), `id`, `expectedState` (`active`/`inactive`), target `state` and `confirm: true` for deletion. `get_definition_journal` takes `objectTypeId`, including a deleted object's ID. `list_object_types` omits inactive/deleted definitions by default; settings request `includeInactive` and optionally `includeDeleted`. Definitions return state, protection and deletion eligibility; deleted fields are retained in `historicalFields` for stable history labels.

Run the explicit migration with the development HTTP process stopped. It adds definition state/protection columns and replaces the old live-name constraints with partial unique indexes while preserving all existing rows. Existing definitions start active. See [ADR 0009](adr/0009-definition-lifecycle.md) for usage checks, reactivation and tombstones. This does not implement record recycling or permanent record-content deletion.

## Dialog actions and history presentation

Normal dialogs expose the localized top-right X and a shared action footer: neutral Close/Cancel on the left, Reset then primary Save/Create on the right. Read-only views offer dismissal only. Creation uses Cancel/Create; editing supports Reset/Save when applicable. Reset remains available for invalid drafts. All dismissal paths retain unsaved-change checks and pending-operation guards. Destructive confirmations use explicit Cancel and destructive decision actions without an X.

The settings dialog provides a 960 × 640 px desktop layout, constrained to the viewport, with a section selector on small screens. Definition journal entries separate Before/After, localize attribute labels and Boolean/state values, combine actor/time metadata and expand structured values on demand. Deleted classification fields display their retained field attributes rather than the current replacement field's input aids.

Record creation with no journaled business-field values still writes one `created` event atomically. This preserves object usage history even when all installed classification fields are empty; it is distinct from a field-value change. No-op record updates add no event.

## Public resource links

The application sidebar footer links to Documentation (`https://docs.xobject.org/`), Changelog (`https://xobject.org/changelog/`) and Roadmap (`https://xobject.org/roadmap/`), under the localized Resources heading directly above the user menu. Standard sidebar buttons render native links, open a new tab with `noopener noreferrer`, and retain localized accessible names/tooltips when collapsed. Opening a resource keeps the current application draft. These agreed destinations do not imply that the separate public documentation/pages have been deployed.

## Personal account security

Personal → Account & security provides local password changes and management of the signed-in user's own active sessions. Password changes require the current password, 12–128 characters for the new password and a matching repeat in the UI. Other sessions are signed out by default; this may be disabled explicitly. The current session stays signed in. Its regular user-menu sign-out action remains available.

`get_account_security` returns `hasPassword` and safe active-session metadata (`id`, `current`, creation/update/expiry timestamps, IP address and user agent). It never returns tokens, hashes or passwords. `change_password` takes `currentPassword`, `newPassword`, optional `revokeOtherSessions` (default true). `revoke_session` takes an own non-current `sessionId`; `revoke_other_sessions` takes an empty object. All are shared API/MCP operations. The transport derives the current session; no user ID can override the subject. Journaled password/revocation events contain Boolean indicators only and roll back atomically with the changes. A per-process, per-account failed-password guard returns 429 after five incorrect attempts within one minute.

No schema migration is required for this slice. It uses Better Auth's existing account/session tables and public password crypto. Alternative Better Auth password/session-management and raw listing endpoints are blocked; sign-in, sign-out and session lookup remain available. Profile changes use the common journaled operation instead of generic auth-profile updates. See [ADR 0010](adr/0010-account-security.md) for the current-session, auth-route and prototype rate-limiting choices. SSO linking, production authentication/rotation/rate-limiting design and complete account-lifecycle journals remain separate work.

The Personal navigation order is Profile → Account & security → Appearance → Language & region. Settings initially opens Profile. Its display name is editable; the sign-in email is read-only. `set_user_profile` accepts only `name` (trimmed, 1–200 characters), always addresses the authenticated user and journals changes atomically. Unchanged names produce no event. Saving refreshes the session, user menus/initials and user-reference dictionaries. Email verification/change and profile images remain later work.

The Profile picture area is presentation-only: standard Avatar initials and a disabled Upload picture action. No file picker, image URL editing, image requests, storage or upload endpoint is enabled. The existing `sys_users.image` value remains unused by the application. Profile-image functionality and verified email changes are deferred; the latter depends on outgoing mail. See the [agreed setup/profile plan](PRD.md#planned-installation-setup-and-deferred-profile-features) for the future interactive container setup command and email-change flow. The current local administrator command remains unchanged.

Workspace language and group configuration use the common transaction in `apps/server/src/domain.ts`, with service helpers in `workspace-configuration.ts`. See [ADR 0012](adr/0012-workspace-languages.md) and [ADR 0013](adr/0013-workspace-groups.md). Language inventories come from the shared contracts catalog; installed UI text remains in repository resources. New language packs are outside this change.

## Time zones

See [ADR 0014](adr/0014-time-zones-and-regional-display.md). Workspace Language & region saves `timeZone` alongside the language draft and `language_version`; the existing `configure_workspace_languages` operation accepts it optionally for compatibility. `get_time_zone_catalog` lists server-supported named zones. `configure_user_localization` takes `language`, `timeZone` (each nullable to inherit) and `expectedLanguage`/`expectedTimeZone` for atomic own-account changes. Better Auth session responses include `timeZone`; direct profile input cannot change it. Browser location only proposes a zone during workspace creation. Existing workspaces migrate to UTC and existing users inherit it until explicitly configured. No timestamp or date-only records are rewritten.

## Regional display and instance administration

[ADR 0014](adr/0014-time-zones-and-regional-display.md) specifies workspace `regional` and optional own `regional_preferences`, both saved with Language & region drafts. Automatic formats derive from the selected regional locale, independently of UI language. The first weekday is stored/previewed; calendar views remain deferred. Native input formatting stays browser-controlled and stored numeric/date/time values remain canonical.

[ADR 0015](adr/0015-instance-administration-and-journal.md) specifies Administrator-only Users and Journal settings. API/MCP operations are `list_managed_users`, `create_user` (`name`, `email`, `initialPassword`), `configure_user` (`userId`, expected `version`, `name`, `active`, `isAdmin`) and paginated `list_system_journal` (optional `workspaceId`, `fieldKey`, `entityKind`, `limit`, `offset`). Initial-password users can only inspect own account security or change that password; all other application operations are denied until change completes. Password changes use the existing shared operation. Deactivation revokes sessions and blocks sign-in; email changes, reset emails and hard account deletion remain deferred. Workspace General exposes immutable creator identity and evidenced creation time. Group Save closes its editor; deactivation preserves groups and history.

## Dashboard and table navigation

[ADR 0016](adr/0016-dashboard-and-shared-table-navigation.md) defines the dashboard-01/sidebar-02 adaptations. `get_workspace_dashboard` takes `workspaceId` and optional `days` (7/30/90). `list_workspace_records` takes `workspaceId`, optional `objectTypeId`, `query`, allow-listed `sortBy`, `sortDirection`, `limit` (1–100), and `offset`. Both retain the current Administrator-only business-content policy through API/MCP. Installed standard fields are projected consistently across heterogeneous tables; missing fields stay empty.

`RecordDataTable` and `TablePagination` unify record selection, column controls, row actions, counts, page size and first/previous/next/last navigation. Administrative tables share the footer without inventing bulk writes. Dashboard object sections are filter tabs encoded in the `sections`/`object` URL parameters. Column choices are view-local; search, sorting and paging are URL state. Resources have one source in `resource-links.ts`. The scrollable command dialog combines permitted local destinations with debounced authorized record search; no content API is called for regular users.

Dashboard local search and individual record search share the visible `data-record-search` target and `/` shortcut. Editable controls and open dialogs/menus keep their normal key handling. Dashboard cards use dashboard-01's semantic primary-to-card gradient; chart areas use instance-unique SVG gradient IDs with the example's opacity stops and the configured chart palettes. Groups, membership/roles and installation users have distinct navigation icons. User editors open from the row or the keyboard-accessible name button, support Command/Ctrl+Enter, and retain their baseline version while dirty; conflicting writes preserve drafts and Reset adopts the refreshed server state.

## Local validation snapshot — 2026-10-30

The account/security, workspace configuration and Dashboard batch passed 54 disposable-PostgreSQL application tests and 11 web tests. The full application build passed; after the final frontend corrections the web build and all 11 web tests passed again. A strengthened Dashboard classification/category projection test also passed independently. These checks exercise the common API/MCP path, transaction rollback, authorization boundaries, optimistic conflicts, language/region/time-zone behavior and heterogeneous Dashboard data.

Chrome acceptance used isolated synthetic accounts and records for password/session presentation, workspace settings, groups, user administration, mandatory initial-password presentation, command navigation, table selection/pagination, draft conflicts and light/dark Dashboard gradients. Password mutation and role boundaries were verified through application tests. The operator's real account credentials were not changed. ADRs 0010–0016 contain the feature-specific evidence and limits.

This is local validation, not CI evidence for an unpublished worktree, a software release or a complete version-1 acceptance. The separate public website was unchanged in this batch. Content permissions, record lifecycle, domain modules, relationships, production migration/authentication and the installation package remain outstanding. Login/sign-out and the experimental `admin:create` CLI are not yet journaled. Public resource destinations are planned links, not evidence of published documentation pages.
