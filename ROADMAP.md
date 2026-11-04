# Roadmap

xObject is in early development. A local application prototype and public project-site source exist; no installable application release is available. This is a curated product overview, not a parallel task tracker. OpenProject owns operational priorities, dependencies and completion evidence; the [PRD](docs/PRD.md) owns requirements and the [changelog](CHANGELOG.md) records source changes. No dates are committed.

“Implemented locally” includes verified working-tree changes and does not imply that every change is committed, merged, deployed or accepted as a full product capability. Reserved calendar capabilities and notifications remain outside the implemented local permission slice.

## Implemented locally — Product foundation

- PostgreSQL-backed local accounts, instance Administrators, workspace User/Designer roles and graded user/nested-group memberships; mandatory first password change, reversible user/group activation and own profile/password/session management.
- Metadata-driven object/typed-field creation, optional Keyword/Type/Status/Category, translated field descriptions/hints, typed creation defaults, supported scalar uniqueness/requiredness, safe field conversion and definition lifecycle, stable UUID identities and atomic per-property journals.
- Object/field ceilings, explicit Create, graded ownership and nested/transitive foreign-access inheritance, record privacy/maxima and field exceptions. Versioned settings, the quick Access-principals field and tabbed rights drafts expose effective rights and optional own-record delegation. Contents, links and security save atomically with one record version/change ID. Shared UI/API/MCP enforcement protects contents, search/counts, relationships, Dashboard and current-rights history; membership alone grants no contents.
- Transactional business numbers with prefix/suffix, exact start/increment, padding and never/yearly/monthly counters; immutable issued values, workspace-zone periods and rollback with failed record/journal writes.
- Versioned relationship definitions for one custom object pair, General core links, Projects-owned Primary context/tree, final-state cardinalities, endpoint conditions and activation preflight. Linked creation and existing-record linking share source/version/permission checks and atomic journals. Dossier/Journal use the common data table.
- Current three-entry module catalog; Projects & Tasks supplies base objects and fixed Primary levels. Structured contact fields support ordered name parts, multiple emails/phones/addresses/websites and birthdays with an optional year, shared whole-field permissions, conditional Contact-name requirements, immutable Contact kinds, fixed contact cores with designer extensions and typed atomic per-field history. Contacts activation supplies protected Contacts and Distribution lists, fixed Contact kinds, permission-aware derived names, Organization membership, direct Identities and explicit distribution membership. Existing Projects bindings reuse the same Contacts identity. Relationship-role attributes and the remaining domain/temporal templates are still pending; this is base provisioning, not complete Contacts or standards-conformance acceptance. Documents & Communication activation remains planned.
- Configurable standard forms for actual objects: editable groups, Unassigned elements, scalar/relationship order/width, protected Access-principals placement and width, optional visibility and initial table state. Module-keyed metadata is retained; module-specific form selection awaits real object/module assignments.
- Consistent shadcn shell, settings, full-width record forms, shared searchable tables/pagination, keyboard navigation, responsive loading/dialogs, bounded long-text inputs, timestamp insertion, page-selection copy/clear actions and account/view-scoped presentation preferences. Dashboard table is regular application UI; real statistics/chart content remains exploratory.
- Shared workspace appearance/fonts, installed German/English interface/definition policies, named zones and per-property personal localization overrides, exact regional numeric/money/date/time editing and DST handling.
- One current installation baseline, schema/catalog fingerprint checks, runtime/operator separation, registry integrity, scoped locks/indexes and isolated validation. Fictional seed/fixture data is separate from installation; initialization creates no test accounts or business contents; explicit local resets discard disposable fixtures.
- Workspace recycle bin with current-rights read-only inspection, confirmed Delete-level recycling and Full-level restoration, optimistic versions and atomic lifecycle history. Contents/edges remain retained, cardinality slots reserved, and unavailable Primary context stays private. Permanent deletion/history erasure remain pending.

Field/numbering administration now uses clearer sections, compact previews, direct accessible hints and field-aware validation. Group name and graded memberships share one editor and atomic Save. These are locally verified refinements of the existing capabilities.

## Public project introduction

The independent Astro project homepage introduces the product and links canonical Git documentation. Its source, design system and CSP/browser checks are present. Full Starlight documentation, changelog/roadmap pages and version navigation remain future work. Selected public URLs are not proof of deployment of those pages.

## Next — Complete and accept version 1

| Goal | Remaining outcome |
| --- | --- |
| Permissions and identity | Production user-bound API/MCP credentials, session hardening, representative-volume permission/query performance and product acceptance. The local ownership/foreign-access model and current installation are implemented. |
| Configurable object platform | Measured data/query scaling and complete shared-definition evolution. Field input rules and business numbers are implemented locally under ADR 0030. |
| Contacts & Relations and Projects & Tasks | Deliver the [22-object V1 catalog](docs/PRD.md#6-supplied-domain-models): implement and accept supplied templates from the [22 proposed start profiles](docs/domain-profiles.md), keeping the lean-template boundary and resolving the identified domain contracts; retain the implemented derived Contact Keywords, single-Organization Contact persons and direct Identities lists while completing domain roles and responsibility/assignment. Existing generic fixtures do not establish module delivery. |
| Standards-aligned domain profiles | The appendix proposes fields, mappings and acceptance cases for Contacts, Distribution lists, Appointments, Vacations and Tasks. ADR 0032 specifies typed JSONB fields, semantic bindings, edge attributes and sparse recurrence overrides with shared authorization/history; the six contact codecs and base Contacts/Distribution lists are implemented locally. Relationship attributes, temporal/recurrence codecs and complete versioned exchange-profile coverage remain open. Synchronization is later scope. |
| Shared modules/forms | Actual cross-module object/field ownership and view selection, protected-definition updates and conflict-safe activation/deactivation without copied records or values. |
| Personal table layout | Persist column order and widths as required by R-030; the local prototype currently retains column visibility, not these additional layout preferences. |
| Relationships and lifecycle | Independently required Primary ancestor sections; confirmed permanent deletion, linked-history erasure and invalid-link handling. |
| Delivery and acceptance | Interactive first-Administrator container setup, prebuilt images, Linux Compose installation, release migration/backup/restore tooling, performance/accessibility targets and PRD end-to-end acceptance. |
| Public documentation | Astro/Starlight at the selected documentation URL, canonical changelog/roadmap reuse, release notes and versioned documentation. |

Every capability must use the same backend authorization, validation and journal rules through web, API and MCP. A passing prototype test is not complete version-1 acceptance. See the [initial acceptance scenarios](docs/PRD.md#11-initial-acceptance-scenarios) and [remaining design decisions](docs/PRD.md#10-remaining-design-decisions).

## Later — Beyond version 1

- Documents & Communication (including supplied Documents, Emails and Phone calls), Operations & Finance, IT Service Management, Configuration Management Database, Events & Registrations and Knowledge & Insights. Their shared V1 objects remain in the V1 catalog; later module membership adds no present delivery claim.
- Email handling, file uploads, attachments and versioning.
- Verified email-address changes and profile-image handling, after their mail/upload dependencies exist.
- Notification delivery, alarms/subscriptions, calendar availability/time-only rights, calendar and Kanban views.
- Standards-based CardDAV/CalDAV synchronization with explicit peer capabilities, conflict/deletion handling and preservation of unmapped data; no product-specific domain model.
- Import/export, external SSO, desktop clients (Electron or Tauri selection pending), separate mobile clients, offline operation/synchronization and hosted cloud service.
- Creation templates/default-group configuration and other separately specified extensions.

Computed fields and general undo remain candidates requiring separate specification. Community/Premium allocation, pricing, contribution and service terms remain open; the full product including Premium code remains `AGPL-3.0-only`.

## Keeping this roadmap current

Update this overview when accepted scope or verified capabilities materially change. Put detailed operational work and publication evidence in OpenProject, not a duplicate release checklist here. Keep planned targets distinguishable from the current local implementation and deployed releases.
