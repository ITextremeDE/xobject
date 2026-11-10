# Changelog

All notable changes to xObject are documented here, using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Align the bilingual website FAQ with the five agreed V2 themes and send documentation references from project pages to the rendered Docs with their section anchors.
- Place Privacy before Legal notice in the website footer and keep desktop section navigation visible while scrolling, including on short screens.
- Give the website Changelog and Roadmap a shared editorial layout with a clear introduction, section navigation, readable typography and responsive light/dark surfaces.
- Order website resource links as Documentation, Changelog, Roadmap, Requirements and Source code; link current documentation directly to the website Changelog/Roadmap and redirect former documentation routes, while retaining historical snapshot pages.
- Reconcile current release/install/update guidance with published 1.0.1, distinguish pending 1.0.2 OAuth behavior, add dated installation/live-update decision follow-ups and make released documentation versions directly navigable.
- Align the PRD, module/domain guidance, README and project instructions with the agreed V2 scope while retaining historical decisions and explicit specification gaps.
- Set V2 roadmap scope to personal column order/widths, Documents & Communication, guided Contact-kind changes, Contact maintenance including duplicate detection/merging and Previous/Next record navigation; defer additional Contacts objects and other extensions without a release assignment.
- Reorganize the public roadmap around the released version, the next maintenance release, explicitly assigned V2 work and thematically grouped later goals.
- Consolidate the historical release notes around delivered behavior, remove obsolete development states and duplicate entries, and separate release changes from verification details and future plans.

### Fixed

- Keep explicit links to separately published documentation snapshots usable without treating them as missing files in the current build; retain internal link and version-isolation checks.
- Keep delegated MCP offline access renewable after natural browser-session expiry or cleanup, with a new seven-day lifetime on each successful refresh. Explicit sign-out and session revocation invalidate the user's OAuth connections alongside password changes, account deactivation and application revocation.

## [1.0.1] - 2026-11-09

Community maintenance release with the same database schema as 1.0.0. Website and documentation changes were also published independently and are included in this release's source.

### Added

- Contributor Covenant Code of Conduct, public bug/feature issue forms, a pull request template and Dependabot configuration for the application, website, documentation, GitHub Actions and container base image.
- Flag-based language controls and a keyboard-accessible screenshot dialog with close, Escape and focus-return behavior; screenshot links remain usable without JavaScript.
- English and German product pages with automatic browser-language selection, remembered manual choice, a feature overview, self-hosting guidance, FAQ and screenshots captured in the fictional ITextreme demo in both interface languages and light/dark modes.

### Changed

- Verify native updates from the published 1.0.0 images with preserved records, versions and journal, and clarify same-schema update and mismatched-schema recovery guidance.
- Update paired GitHub artifact upload/download actions and verify exact architecture-digest transfer in CI.
- Update application and website dependencies, including Fastify, Kysely, TanStack Query, i18next, Tailwind, Vite, Astro and Playwright, together with pinned GitHub checkout/setup-node actions. Retain the supported TypeScript 6 Astro-checker and Node 24 LTS container baselines with explicit dependency constraints.
- Give public documentation self-hosted ITextreme fonts, matching icons and consistent semantic light/dark colors while retaining standard Starlight navigation and search. Clarify the published application baseline and independently delivered website/documentation.

### Fixed

- Bind generated release-documentation source links to the exact reviewed commit.
- Include the Code of Conduct in checksummed public source archives.
- Wait for recycle-bin restoration and table controls to finish updating before browser accessibility checks, preventing checks against a transient disabled state.

## [1.0.0] - 2026-11-09

First Community release under `AGPL-3.0-only`, maintained by Jürgen Schadek under ITextreme. The complete V1 feature set is available without Premium gates. Entries describe the delivered baseline; [verification scope](docs/quality-acceptance.md) and [future plans](ROADMAP.md) are maintained separately.

### Added

#### Data and relationships

- Create custom object types and typed fields with translated names, descriptions and input hints. Supported values include text/Markdown, numbers, money, dates/times, choices, email, telephone, URL and user/group references; requiredness, defaults, scalar uniqueness and safe conversions share the same validation across interfaces.
- Configure Type-dependent Status choices and single/multiple Category values. Selection tree fields and tree categories automatically include ancestors, support searchable keyboard-operated pickers and preserve valid selections when their hierarchy changes.
- Assign immutable record numbers with prefix/suffix, start, increment, padding and optional yearly/monthly resets in the workspace time zone. Issued numbers are never reused and participate in authorized display and search.
- Design one common form per object with translated groups, ordered fields/relationships and half/full widths. Protected Contact cores, required fields and inactive definitions remain guarded; removing a group leaves its elements Unassigned and keeps their data.
- Define directed or undirected relationships for one object pair, with translated side labels, cardinalities, endpoint requirements and conditional applicability. Activation checks existing data; established pairs/direction and protected system meanings remain guarded.
- Use General links independently of modules. Projects adds the fixed Contact → Project → Case Primary hierarchy, one direct parent per record and inherited ancestor context; configurable context requirements also check descendants and recycled records.
- Link existing records or create an already-linked record from the record header. Single-target relationships appear as fields, multi-target relationships as tables; relationship attributes have typed values and permissions checked at both endpoints. Primary pickers filter by the selected ancestor, and changing a level clears following selections.
- Inspect linked records in the searchable, filterable Dossier. The Projects Explorer provides lazy paginated Primary descendants, ancestor context, keyboard navigation, cycle/depth guards and Expand all/Collapse all.
- Follow immutable record, definition and instance journals with one entry per changed field/property and related entries grouped by change ID. Relationship events appear at both endpoints; structured historical values retain their original definitions and current access checks.
- Recycle and restore records with versioned, permission-aware operations. Recycling retains history and cardinality reservations; permanent deletion retains full Administrator history and content-free deletion notices for other entitled readers. Definition deactivation/reactivation and unused-definition deletion preserve protected definitions and historical identities.

#### Contacts and project management

- Contacts & Relations supplies Contacts and Distribution lists. Contacts are Organizations, Individual contacts or Contact persons, chosen before creation; each Contact person belongs to at most one Organization. Identities connect records of the same person without merging their contents or permissions.
- Contact-kind-specific forms derive Keywords from permitted name fields and offer structured names, separate Salutation/Academic title, professional details, Nickname, Gender, communication languages/time zone and partial-year Birthday, Wedding anniversary and Date of death where applicable. Additional fields and custom relationships remain configurable.
- Maintain ordered telephone, email, website, messenger and postal-address entries with individual validation feedback. Phone/messenger Usage and Type are separate, order determines preference, and address entry includes country selection, PO boxes, additional street/address lines and regional previews. Whole-field rights and per-field history apply; vCard mappings are documented, while exchange/synchronization remain later scope.
- Projects & Tasks supplies shared Contacts, Projects, Cases and Tasks with editable starter forms. Projects/Cases have start and target dates; Tasks include Priority, Progress, configurable completion statuses and consistent completion/reopening times. Shared date-only, instant and named-zone values handle daylight-saving gaps and overlaps explicitly.
- Activate/deactivate module contributions without duplicating shared records or losing customized forms and retained contents. Additive template updates reuse object/field identities; collisions with custom definitions fail. Planned module catalog entries remain distinct from available modules.

#### Users and permissions

- Separate installation-wide Administrators from workspace Users and Designers. Administrators manage accounts, memberships and content rights; Designers configure permitted definitions and input aids. User management supports start passwords, mandatory first password changes, versioned edits and reversible activation.
- Set object/field ceilings, separate Create rights, graded ownership, nested/graded groups and bounded foreign-access rules with effective-right explanations. User overrides, Personal/Confidential privacy and delegated own-record rules remain within their ceilings; group membership or links alone do not grant content access.
- Assign sensitive records through searchable Access principals with quick selection and detailed rights. Projects, Cases and Tasks are always sensitive activities: Access principals define assignment/ownership, while Responsible coordinates. Public access requires confirmation; contents, links and security save atomically with one record version/change ID.
- Manage personal profile, password and active sessions in Account & security. Account, membership and security changes use current authorization and atomic journals; sign-in email stays read-only and media-upload controls are preparation only.

#### Interface and interaction

- Work in dedicated responsive record pages with grouped forms, sticky save/reset actions, localized validation and protected drafts across tabs. Created/changed metadata appears above Journal; formatted previews and inactive values remain inspectable.
- Search, filter, sort and page shared record, workspace, Dashboard and Dossier tables. Standard initial columns, column visibility and current-page selection/actions are consistent; Type/Status/Category filters include empty values, OR/AND rules and tree-ancestor matching. URLs retain supported list state, and every count/result respects current rights.
- Navigate through configurable module sections, repeated shared-object destinations, Contact-kind sublists and an optional Resources block. Workspace defaults and personal ordering/visibility support keyboard alternatives to dragging; Command search combines permitted navigation and record search.
- Duplicate into an editable unsaved draft and allocate records/numbers/history only on Save. Shared row/header actions include linking, Duplicate, Recycle and Copy ID; short results use toasts, while errors, security guidance and unsaved changes stay inline.
- Receive authorized live updates after committed web/API/MCP changes, with reconnect/focus recovery. Clean views refresh automatically; dirty records require conflict review and settings drafts are protected. Application updates offer an explicit guarded reload.
- Use German/English interfaces and translated definitions with workspace language policies and optional personal regional overrides. Time zones, precise numeric/money editing, dates/times, currency placement and week starts remain consistent across forms, tables and journals.
- Customize workspace palettes, separate light/dark primary/secondary colors, menus, radii, shipped interface/heading fonts and workspace icons, with interactive previews. Tokens also apply to portals and workspace switching; personal light/dark/system preference stays independent. Fonts/licenses are local, and custom-logo/photo/avatar uploads are presentation-only preparation.
- Use direct browser routes, centralized shortcuts/help, accessible shadcn/Base UI controls and draft-aware navigation. Markdown previews provide explicit typography and line breaks without raw HTML/images; multiline fields can insert a localized user/time stamp. The installable online shell includes favicons, Apple/maskable icons, contextual/neutral titles, generic private link previews and record-link copying/native sharing.

#### API and AI integration

- Access the same operations through versioned REST API v1 and MCP, using generated OpenAPI request/response schemas, a typed bearer client and an authenticated contract resource. Agents act with their user's current rights; validation and trusted journal provenance are shared with the web interface.
- Issue user-owned API/MCP credentials with one-time secrets, hashed storage, mandatory expiry, read-only/transport restrictions and usage metadata. Interactive revocation, password changes and account deactivation terminate access; bearer clients cannot manage credentials or account security.
- Authorize MCP applications with Authorization Code/S256 PKCE, signed consent, HTTPS Client ID Metadata Documents and resource-bound opaque tokens with rotating refresh. Better Auth 1.7.18 checks current user, session, scope and revocation; authorized applications are managed interactively.
- Use official MCP SDK 2.4.0, MCP 2026-07-28 structured results and supported stateless 2025 clients. Four permission-filtered supplied skills cover the foundation, Contacts, Projects and model design. Agents can discover their own user identity; [OpenAI Codex acceptance and client-specific limits](docs/quality-acceptance.md#provider-acceptance) remain explicit.

#### Installation and operation

- Install published Linux/AMD64 or Linux/ARM64 containers through Docker Compose, with checksummed installation/source/documentation packages, interactive first-Administrator setup, health checks and HTTPS reverse-proxy guidance.
- Back up and restore with private checksummed files and transactional recovery. Maintenance stops writers, checks the target schema and verifies integrity before restart; failures retain recovery material and keep inconsistent applications stopped.
- Store definitions and contents in PostgreSQL with UUIDv7 identities, readable workspace-prefixed tables, optimistic versions and atomic writes. Fastify/Kysely/Better Auth separate runtime/operator credentials and enforce schema/workspace barriers and registry integrity. Fresh initialization and disposable development reset use one current model; supported released updates require target verification.
- Explore three optional fictional demos: a feature laboratory, an IT-service company and a family household. They demonstrate bilingual definitions, English contents, permissions/assignment, field types, numbering, Primary links, relationship attributes, Markdown descriptions, timestamped Notes and lifecycle history. Normal installation creates no demo workspaces/accounts.

#### Website and documentation

- Read public Astro/Starlight documentation with canonical repository content, Pagefind search, checked links/assets/anchors and a release-specific 1.0.0 snapshot. The ITextreme-branded Astro website includes responsive navigation, local fonts, metadata/sitemap and light/dark/system controls under a restrictive content security policy.
- Follow the product requirements, architecture decisions and public roadmap alongside the [documented verification scope](docs/quality-acceptance.md). The full V1 feature set is Community under `AGPL-3.0-only`; future plans are separate from delivered capabilities.

### Removed

- The obsolete public website `/licenses/NOTICE.txt` index; individual upstream license files remain distributed with their assets.

### Fixed

#### Interface and interaction

- Preserve readable fields when an addon action is disabled, provide meaningful accessible titles/selection names and explain authentication throttling. Loading views match their finished pages and retain cached drafts during transient background failures.
- Apply workspace palettes, color schemes and fonts consistently, including sidebars and portalled previews. Subscription renewal no longer shifts normal navigation; regional parsing preserves numeric/date/time values.
- Align collapsed-sidebar Search, retain list filters/focus on return, distinguish missing routes from connection failures and preserve guarded dialog focus/close behavior. Narrow settings/forms stay usable; clickable rows respect embedded controls and selection without custom link underlines or pointer cursors.

#### Permissions and data integrity

- Recheck cookie sessions after transaction-lock acquisition so queued revoked/expired requests cannot commit. History distinguishes reused technical names; relationship changes are journaled only after final-state validation, and hidden retained links/inactive policy entries remain protected.

#### Installation and operation

- Exclude private backup/recovery environment files from Git, build contexts and commit-bound public source archives. Resume unchanged containers after backups with supported Compose v2 commands, reserve the proxy address outside the dynamic pool and keep diagnostics bounded and free of private payloads.

[Unreleased]: https://github.com/ITextremeDE/xobject/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/ITextremeDE/xobject/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ITextremeDE/xobject/releases/tag/v1.0.0
