# Roadmap

xObject is in early development. A local application prototype and public project-site source exist; no installable application release is available. This is a curated product overview, not a parallel task tracker. OpenProject owns operational priorities, dependencies and completion evidence; the [PRD](docs/PRD.md) owns requirements and the [changelog](CHANGELOG.md) records source changes. No dates are committed.

“Implemented locally” includes verified working-tree changes and does not imply that every change is committed, merged, deployed or accepted as a full product capability. Reserved calendar capabilities and notifications remain outside the implemented local permission slice.

## Implemented locally — Product foundation

- PostgreSQL-backed local accounts, instance Administrators, workspace User/Designer roles and graded user/nested-group memberships; mandatory first password change, reversible user/group activation and own profile/password/session management.
- Metadata-driven object/typed-field creation, optional Keyword/Type/Status/Category, configurable input aids/requiredness, safe field conversion and definition lifecycle, stable UUID identities and atomic per-property journals.
- Object/field ceilings, explicit Create, graded ownership and nested/transitive foreign-access inheritance, record privacy/maxima and field exceptions. Versioned settings, the quick Access-principals field and tabbed rights drafts expose effective rights and optional own-record delegation. Contents, links and security save atomically with one record version/change ID. Shared UI/API/MCP enforcement protects contents, search/counts, relationships, Dashboard and current-rights history; membership alone grants no contents.
- Versioned relationship definitions for one custom object pair, General core links, Projects-owned Primary context/tree, final-state cardinalities, endpoint conditions and activation preflight. Linked creation and existing-record linking share source/version/permission checks and atomic journals. Dossier/Journal use the common data table.
- Complete visible module catalog; Projects & Tasks base-object installation supplies protected Contacts/Projects/Cases/Tasks and fixed Contact → Project → Case roles. Contacts & Relations and Documents & Communication activation remain planned, as do complete domain templates and shared-module ownership/update handling.
- Configurable standard forms for actual objects: editable groups, Unassigned elements, scalar/relationship order/width, protected Access-principals placement and width, optional visibility and initial table state. Module-keyed metadata is retained; module-specific form selection awaits real object/module assignments.
- Consistent shadcn shell, settings, full-width record forms, shared searchable tables/pagination, keyboard navigation, responsive loading/dialogs and account/view-scoped presentation preferences. Dashboard table is regular application UI; real statistics/chart content remains exploratory.
- Shared workspace appearance/fonts, installed German/English interface/definition policies, named zones and per-property personal localization overrides, exact regional numeric/money/date/time editing and DST handling.
- One current installation baseline, schema/catalog fingerprint checks, runtime/operator separation, registry integrity, scoped locks/indexes and isolated validation. Fictional seed/fixture data is separate from installation; initialization creates no test accounts or business contents; explicit local resets discard disposable fixtures.

## Public project introduction

The independent Astro project homepage introduces the product and links canonical Git documentation. Its source, design system and CSP/browser checks are present. Full Starlight documentation, changelog/roadmap pages and version navigation remain future work. Selected public URLs are not proof of deployment of those pages.

## Next — Complete and accept version 1

| Goal | Remaining outcome |
| --- | --- |
| Permissions and identity | Production user-bound API/MCP credentials, session hardening, representative-volume permission/query performance and product acceptance. The local ownership/foreign-access model and current installation are implemented. |
| Configurable object platform | Business-number sequences, remaining helper/default/uniqueness configuration, measured data/query scaling and complete shared-definition evolution. |
| Contacts and Projects | Complete supplied templates, derived Contact Keywords, single-Organization Contact persons, direct Identities lists, domain roles and configurable responsibility/assignment. Existing generic fixtures do not establish full module delivery. |
| Shared modules/forms | Actual cross-module object/field ownership and view selection, protected-definition updates and conflict-safe activation/deactivation without copied records or values. |
| Relationships and lifecycle | Independently required Primary ancestor sections; record recycle bin, restore, confirmed permanent deletion, linked-history erasure and invalid-link handling. |
| Delivery and acceptance | Interactive first-Administrator container setup, prebuilt images, Linux Compose installation, release migration/backup/restore tooling, performance/accessibility targets and PRD end-to-end acceptance. |
| Public documentation | Astro/Starlight at the selected documentation URL, canonical changelog/roadmap reuse, release notes and versioned documentation. |

Every capability must use the same backend authorization, validation and journal rules through web, API and MCP. A passing prototype test is not complete version-1 acceptance. See the [initial acceptance scenarios](docs/PRD.md#11-initial-acceptance-scenarios) and [remaining design decisions](docs/PRD.md#10-remaining-design-decisions).

## Later — Beyond version 1

- Documents & Communication module and email handling; file uploads, attachments and versioning.
- Verified email-address changes and profile-image handling, after their mail/upload dependencies exist.
- Notification delivery, alarms/subscriptions, calendar availability/time-only rights, calendar and Kanban views.
- Import/export, external SSO, desktop clients (Electron or Tauri selection pending), separate mobile clients, offline operation/synchronization and hosted cloud service.
- Creation templates/default-group configuration and other separately specified extensions.

Computed fields and general undo remain candidates requiring separate specification. Community/Premium allocation, pricing, contribution and service terms remain open; the full product including Premium code remains `AGPL-3.0-only`.

## Keeping this roadmap current

Update this overview when accepted scope or verified capabilities materially change. Put detailed operational work and publication evidence in OpenProject, not a duplicate release checklist here. Keep planned targets distinguishable from the current local implementation and deployed releases.
