# xObject — Product Requirements Document

Status: Draft specification for version 1
Owner: ITextreme
Updated: 2026-10-29

This document specifies the agreed product scope. Requirements below are product decisions, not claims of implementation or acceptance. Unresolved implementation choices are listed in section 10. Version 1 denotes the initial product scope, not a committed release date or an already assigned semantic version.

## 1. Purpose and scope

xObject is an open-source application for defining, managing and connecting structured data objects. Configurable modules provide domain models on a shared object platform. The initial delivery includes CRM, project management and user-defined object types.

Version 1 includes workspaces, local user accounts, configurable data definitions, permissions, relationships, per-field change history, a recycle bin, tables, forms and record detail views with a relationship tree and dossier. All application capabilities must be available through both API and MCP from the outset.

Out of scope for version 1:

- File uploads, attachments and import/export features. API access to individual application operations is not an import/export feature.
- Desktop and mobile applications, SSO, offline operation and synchronization.
- Kanban and calendar views.
- General undo. Computed fields require a separate specification and are not included in this delivery baseline.

A paid cloud service is a later offering. The official initial installation target is self-hosting on Linux with Docker Compose.

## 2. Terms and actors

| Term | Meaning |
| --- | --- |
| Object type | A metadata definition such as Contact, Project or Task. |
| Record | One instance of an object type. |
| Field | An attribute defined for an object type. |
| Type | A record classification that determines its permitted status values; distinct from object type. |
| Contact kind | Organization, Individual contact or Contact person; separate from Type and mutually exclusive per contact record. |
| Workspace | A boundary containing records, relationships, object types, groups, module activations and number sequences. |
| Module | An independently activated domain package supplying protected definitions and configurable input aids. |
| Primary association | The single direct hierarchical relationship used to derive a record's context. |
| Dossier / Akte | A flat list of a record's current accessible relationships. |
| Journal | The centrally stored change history, presented by record or as a system journal. |
| Access principals / Zugriffsberechtigte | Users and groups listed for record-level access on a user-sensitive object type. |

| Role | Responsibility |
| --- | --- |
| Administrator | Installation-wide administration and full access to all workspaces and contents, including restricted fields and user-sensitive records. |
| Designer | Configure user-defined types, fields, relationships and their input aids; configure the intended input aids of module fields while preserving protected definitions. |
| User | Use records according to effective permissions. |
| Agent | Act for an authenticated user with that user's effective rights, never a separate privilege grant. |

Role assignment details for Designers and Users remain to be specified. Administrator scope is installation-wide and is not an open decision.

## 3. Object platform and modules

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-001 | A user can belong to multiple workspaces. Each workspace owns its records, relationships, types, groups, module activations and number sequences. | A non-admin user operating in workspace A cannot use identifiers to read or relate records from workspace B. An Administrator can access both without separate memberships. |
| R-002 | Designers can define object types, fields and relationship types. PostgreSQL is authoritative for definitions and contents, with an individual data table per object type. | Creating a type and scalar field makes the field usable on its records. Invalid or failed definition changes do not leave a usable partial schema or unjournaled changes. |
| R-003 | CRM and Project Management are independently activatable modules supplied from installation-level templates. | Activating one module does not require activating the other unless a dependency is explicitly specified later. Inactive modules do not require duplicate data models. |
| R-004 | An object type can belong to multiple modules. Modules can contribute different fields and field selections. | Editing a shared record from either module preserves the same record ID and shared values. There is one underlying record rather than a copy per module. |
| R-005 | Module-supplied definitions are protected; Designers can add their own fields and configure input aids. | A protected module field cannot be structurally modified through UI, API or MCP. Its intended configurable options can be changed by a Designer without editing code. |
| R-006 | A record must satisfy required fields across its shared object type, including fields absent from the current module form. | Saving incomplete input reveals the missing fields for direct completion. If field permissions prevent completion, saving is refused with an actionable error without revealing restricted values. |
| R-007 | User-defined fields containing data are deactivated rather than deleted in version 1. Field type changes require safe conversion of all existing values. | Deactivation retains stored values. A proposed type change containing even one unconvertible value is rejected without partial conversion or data loss. Protected module fields remain protected. |

### 3.1 Workspace codes and technical names

Each workspace has a freely editable display name and an installation-wide unique technical code chosen at creation. xObject proposes a code; the creator can edit it before saving. Codes begin with a lowercase ASCII letter and contain only lowercase ASCII letters and digits. The code `sys` is reserved for system tables. Workspace codes cannot be changed in version 1.

Object types and fields have immutable UUID identities, readable technical names and separately editable/translatable display labels. xObject proposes English `snake_case` technical names that the Designer can edit before creation. Technical names begin with a lowercase ASCII letter and contain only lowercase ASCII letters, digits and underscores. They are fixed after creation in version 1. Object technical names are unique within their workspace; field technical names are unique within their object type. Supplied module definitions use fixed technical names. Activation must check for conflicting definitions before applying changes; a matching name alone does not identify a shared object type.

An object type's data table is named `<workspace_code>_<object_name>`, for example `itx_contacts`, `itx_projects` or `itx_vehicles` for the workspace **ITextreme** with code `itx`. This uses table prefixes rather than a separate database schema for each workspace. Installation-wide system tables use the reserved `sys_` prefix. Column names remain readable, for example `birth_date` and `commercial_register`.

Creation rejects reserved/conflicting names and names exceeding PostgreSQL identifier limits, including the complete generated table name. System-managed field names are reserved within object types. Display-label changes never rename tables or columns. UUIDs remain the references for definition identity, relationships and journal entries; authorization uses workspace/type identities and permissions rather than table-name prefixes. The backend applies the same naming validation through UI, API and MCP.

See [ADR 0001](adr/0001-readable-workspace-table-names.md) for the naming decision and its consequences. Physical access isolation, schema-change execution and collection/reference storage still require technical design.

### 3.2 Shared fields

| Field | Definition and default |
| --- | --- |
| `id` | Immutable UUIDv7, stored as PostgreSQL `uuid`. Relationships and journal entries use technical identities rather than business numbers. |
| `created_at`, `created_by` | System-managed creation metadata. |
| `updated_at`, `updated_by` | System-managed last-change metadata. |
| `version` | System-managed increasing version for detecting concurrent edits. |
| Keyword | Required display name. German label: Stichwort; English label: Keyword. Free input except on Contacts. |
| Type | Required single choice, with a configured default for the object type. |
| Status | Required single choice from the selected Type's permitted values, with an initial status for each Type. |
| Category | Optional configurable options, using either single or multiple selection per object type. |
| Business number | Optional configurable number sequence per object type and workspace. |
| Access principals | Present for user-sensitive object types; rules are specified in section 4. |

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-008 | Shared fields and system metadata apply to both supplied and user-defined object types. | New types receive the shared baseline. Clients cannot replace system-managed IDs or bypass version checks. Two edits based on the same previous version cannot silently overwrite each other. |
| R-009 | Designers configure all input aids: options, Type/Status mappings, categories, priorities, defaults, helper text and supported validation aids. | A changed configuration applies through UI, API and MCP without a code change. Existing option identities survive renaming and deactivation. |
| R-010 | Type determines available Status values using a simple mapping, not an implied workflow engine. | A Type change retains a still-valid Status; otherwise the caller must supply a valid replacement. Invalid combinations cannot be persisted through any access channel. |
| R-011 | Number sequences support prefix, suffix, starting value, increment, padding and configurable restart rules. | Concurrent creations cannot obtain the same business number within the configured sequence. IDs do not change when number-format configuration changes. Detailed restart and migration behavior requires specification before implementation. |
| R-012 | Field configuration supports German/English labels, helper text, ordering, required/default values, applicable validation and uniqueness within type/workspace. | Invalid input is rejected by backend validation. Duplicate values in an enabled uniqueness rule cannot be accepted through concurrent writes. |

Supported field types: Text, Multiline text with optional formatting, Integer, Decimal with configurable scale, Money with currency, Boolean, Date, Date/time with timezone handling, Single choice, Multiple choice, Email, Telephone with international formatting, URL, and User/Group references with single or multiple selection.

Scalar storage, collections and references must be mapped explicitly in the technical design; a multi-valued field must not be assumed to be one scalar column. Date-only values such as birthdays must retain their date meaning, while timestamps are displayed in the appropriate timezone.

## 4. Permissions

Permissions on each object type and optional field overrides are configured for users and groups. User sensitivity is configured on the object type, not on each individual record.

| Object permission | Meaning |
| --- | --- |
| Read | View accessible records and permitted fields. |
| Edit | Additionally create and change records. |
| Delete | Move records to the recycle bin. |
| Full access | All content actions, including restore, permanent deletion and changing Access principals. |

Object-level Full access does not override field restrictions, workspace boundaries or record access lists. It is distinct from the Administrator role. Field permissions cover Read and Edit.

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-013 | A non-sensitive type exposes all its records to users authorized for that type within the workspace. | Users without type access remain excluded; field restrictions still apply. There is no per-record access list for a non-sensitive type. |
| R-014 | A sensitive record with a nonempty Access principals list is restricted to listed users or members of listed groups, subject to object and field rights. | A user with type access but no matching principal cannot access the restricted record. Only users/groups authorized for that type in the workspace can be selected. |
| R-015 | An empty Access principals list means public within the workspace for users authorized for that type. On creation the creator is initially entered; deliberate clearing is permitted. | Clearing the list broadens record visibility only to authorized workspace users, not anonymous visitors or other workspaces. |
| R-016 | Grants from multiple groups add together, including field grants. Explicit user settings override the corresponding group-derived setting. | A field grant in one group is not canceled by an absent grant in another. An explicit user restriction wins over a group grant for that setting; without a user override, the combined group result is used. |
| R-017 | Administrators have full installation-wide content access regardless of membership, object rights, field overrides and Access principals. | An Administrator can access every workspace and record through UI/API/MCP. Validation, journal recording, module-definition protection and permanent-deletion confirmation still apply. |
| R-018 | Primary association and assignment do not grant record access. Rights apply throughout all views and interfaces. | A Task assignee or parent-record viewer receives no implicit child-record access. Restricted values do not leak through search, sorting, filters, tree, dossier or historical journal values. |

## 5. Relationships and primary association

General relationship types support 1:1, 1:n, n:1 and n:m. Each side's maximum cardinality controls display: at most one partner uses a selection field; multiple possible partners use a list. Minimum cardinality determines whether a relationship is required.

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-019 | Relationship cardinalities are enforced on every mutation. | A second partner cannot be added on a side whose maximum is one, including through concurrent writes. For Organization-to-Projects, the Organization displays a project list and the Project a single Organization selector. |
| R-020 | A record has at most one direct Primary association. The contextual chain is Contact → Project → Case. | A record directly assigned to a Case derives that Case's Project and Contact where present. Moving the Case updates derived context without independently editing child records. |
| R-021 | Primary association is stored as a relationship and displayed as a selector. Other relationships can coexist. | Changing the selector changes the underlying relationship. Extra general relationships do not create a second Primary association. |
| R-022 | Optional/required association, allowed targets and required ancestor levels are configurable per object type/workspace. All start optional. | A standalone Task and an internal Project without Contact are accepted with default settings. Enabling a full-chain rule requires all specified ancestors on future writes. |
| R-023 | Stricter relationship rules require a preflight over existing affected records and cannot activate while any violate the new rule. | Tightening n:m to a maximum of one or requiring a Project reports affected records and leaves the old rule active until violations are resolved. Activation must also account for concurrent changes. |

Tasks can attach directly to a Contact, Project or Case, or remain standalone under the configured rules. Document, appointment and phone-call records illustrate future or user-defined types; they are not additional supplied version-1 modules.

## 6. Supplied domain models

### 6.1 CRM

Contacts share one contact basis. Contact kind is separate from Type and is exactly one of Organization, Individual contact or Contact person.

| Field | Organization | Individual contact | Contact person |
| --- | --- | --- | --- |
| Organization/company name | Required; includes associations and other organization forms. | Available. If empty, Last name is required. | Derived from the main Organization relationship. |
| First name, Last name | Not applicable. | Available; Last name required when company name is empty. | Available; Last name required. |
| Email, Telephone | Available. | Available. | Available. |
| Street, House number, Postal code, City, Country | Available. | Available. | Available. |
| Commercial register | Available. | Available. | Not applicable. |
| Date of birth | Not applicable. | Available. | Available. |

Individual contacts may represent people or sole businesses and can use all available Contact fields. Contact persons may relate to multiple Organizations but have exactly one main Organization. Domain roles belong to the person–Organization relationship: the same Contact person may be a board member at one Organization and a regular member at another. These roles are distinct from application roles.

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-024 | Contact kind controls applicable fields and is mutually exclusive per record. | Organization cannot persist a Date of birth, and Contact person cannot persist a Commercial register value, through UI/API/MCP. Applicable fields remain subject to field permissions. |
| R-025 | Contact Keyword is derived from source fields. | Organization: company name. Individual contact: company name if populated, otherwise Last name, First name. Contact person: Last name, First name (main Organization name). Updating source data updates the derived Keyword. |
| R-026 | Contact persons use a marked main Organization relationship rather than a duplicated company-name field. | Secondary Organization relationships do not change the Keyword suffix; changing the main Organization does. An Organization can have multiple Contact persons. |
| R-027 | Domain roles are attached to the particular person–Organization relationship. | Adding a role at Organization B does not replace the person's role at Organization A. |

The main Organization is a CRM relationship designation, not a requirement to enable the generic full Primary association chain. Additional addresses and repeated communication fields are later elaborations.

### 6.2 Project Management

The common fields apply to every supplied type. Additional fields are:

| Object type | Meaning | Additional fields |
| --- | --- | --- |
| Project | A larger undertaking. | Description, Responsible person, Start date, Target date. |
| Case / Vorgang | A coherent matter such as an inquiry or complaint. | Description, Responsible person. |
| Task | An actionable activity. | Description, Responsible person, Assigned to, Due date, Priority. |

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-028 | Responsible person and Assigned to are distinct; Assigned to is a user reference identifying who should perform the Task. | A Task can have different responsible and assigned users. Both are optional initially and neither assignment changes permissions. |
| R-029 | Project-management input aids remain configurable by Designers. | Supplied status suggestions Open, In progress, Done and Canceled can be configured via Type/Status mappings. Priorities are editable options rather than hard-coded behavior. |

## 7. User experience

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-030 | Every type provides a searchable, sortable table with Type/Status/Category filters and personal column settings. | Column visibility, order and width persist for the respective user. Filtering and sorting do not expose restricted records or values. |
| R-031 | Record details provide a form, Primary association, Journal, Dossier and an expandable relationship tree. Module forms select relevant fields. | A user opens the same record from two modules without changing its identity; required missing fields follow R-006. Dossier includes accessible incoming/outgoing links and Primary association. |
| R-032 | The tree starts at the currently opened record and follows real relationships, with Primary association providing the main hierarchy. | A direct Contact Task appears directly under the Contact. A Project view begins at that Project, a Case view at that Case. Missing levels are not invented. |
| R-033 | General links in the tree are distinguishable from hierarchical links, and repeated nodes cannot produce infinite traversal. | A cyclic general relationship terminates expansion along that path. A repeated record remains a reference to the same record, with permissions checked at every node. Exact relationship selection/direction requires UI specification. |

## 8. Journal and lifecycle

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-034 | Each changed field produces a separate journal entry with a stable field reference, old/new value and common change ID for the save operation. | A save changing Status and Assigned to yields two entries with different field references and the same change ID. Renaming a field does not prevent filtering its historical entries. |
| R-035 | Relationship changes and lifecycle actions produce their own entries. A relationship event is accessible from both participating records' journals. | Adding/removing/changing a relationship produces one centrally identifiable event displayed from both authorized record contexts. |
| R-036 | Journal metadata records timestamp, responsible user, access channel, optional agent, affected object and action. Changes and journal entries are atomic. | A transaction failure leaves neither changed content without its journal nor a committed journal describing an uncommitted change. Agent actions identify both user and agent context. |
| R-037 | The journal is system-written, not manually editable even by Administrators. Record views show newest first and load older entries as needed; configuration/permission changes appear in a system journal. | Manual update of a journal event is unavailable through UI/API/MCP. Administrators can read the entire journal; other users' access follows their effective permissions. |
| R-038 | Recycled records retain fields, relationships and journal history but leave normal lists and selectors. Other records are not cascaded into the bin or deleted. | Recycling a Project leaves its Cases and Tasks intact and marks the unavailable Primary association without leaking protected parent data. |
| R-039 | Restore requires Full access and reuses still-valid relationships. Permanent deletion requires Full access and confirmation. | An unconfirmed permanent-delete request changes no data. Restore does not silently create invalid relationships. No automatic permanent deletion is enabled in version 1. |
| R-040 | Permanent deletion removes the deleted record's content values from history while retaining a reduced deletion record. No automatic journal cleanup is enabled initially. | Deleted field values cannot be retrieved from the record or linked records' journal presentations. The reduced event contains no deleted content. Recycled records retain full history. The precise erasure mechanism requires design before implementation. |

## 9. Architecture, delivery and quality

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R-041 | The architecture is API-first and metadata-driven with one shared backend application layer. Every application capability is exposed through API and MCP. | Definition changes, record changes, configuration and lifecycle actions can be exercised without UI-only privileges. The same validation, permissions, confirmations and journal rules apply in all channels. |
| R-042 | Agents act with their user's effective rights. Local accounts are supported initially; SSO is later. | An agent for a restricted user cannot gain access by changing the access channel. An agent for an Administrator has the corresponding Administrator rights. |
| R-043 | Use PostgreSQL, TypeScript/Node.js, React/TypeScript/Vite, Tailwind CSS and shadcn/ui in a modular monolith. Git stores source and project documentation, not live application records. | The installed product operates without a Git account or user-owned repository. Concrete framework/package versions must be selected and tested before delivery. |
| R-044 | Prefer standard shadcn components and variants, minimal custom CSS and semantic design tokens/CSS variables for light/dark theming. | Forms are composed from reusable components. Theme changes preserve readable contrast and visible focus. A runtime theme editor is not presumed to be supplied by shadcn. |
| R-045 | Official self-hosting uses versioned prebuilt images and Docker Compose with xObject and PostgreSQL services. | A clean supported Linux host can install the published package, configure HTTPS, start services and create the first Administrator without building source or installing Node.js. |
| R-046 | Release updates include controlled database migrations and consistent database/configuration backup with a tested restore procedure. | An acceptance run restores the release's data/configuration into an isolated installation. Failed migrations do not produce a falsely successful upgrade result. |
| R-047 | The full product, including Premium code, is open source under GNU AGPL version 3 only (`AGPL-3.0-only`). Community is independently usable; official Premium activation accompanies support/maintenance offerings. | The release declares its license and includes the corresponding source availability. UI/API/MCP apply the same official feature entitlements. The exact feature split and commercial terms are unresolved. |

### 9.1 Delivery conventions

- Local development uses a monorepo with `apps/web`, `apps/server`, `packages/contracts`, `deploy` and `docs`; this is a target layout, not a claim that application code already exists.
- GitHub is the leading public remote. The second Forgejo remote is private. Push intended branches/tags separately to both and verify them independently; do not maintain divergent development histories or assume Git transfers platform metadata.
- OpenProject owns operational planning. Git owns this PRD, glossary, ADRs, source, configuration, documentation, changelog and public roadmap. Detailed task status does not belong in this PRD.
- Use Conventional Commits, Semantic Versioning, Keep a Changelog, ADRs and Diátaxis as established project conventions. Use IREB/CPRE terminology and a product glossary.
- Public product website: Astro. Public documentation: Astro/Starlight. Both are static sites delivered with Caddy. `CHANGELOG.md` and `ROADMAP.md` are reused rather than maintained as duplicate copies. The public roadmap is curated from OpenProject.
- Releases have explicit tags, reviewed release notes, tested images, Compose configuration and upgrade/restore instructions. Supported documentation versions remain accessible under versioned paths. GitHub platform metadata needs a separate backup mechanism.
- Work in small end-to-end changes, review through pull requests and validate relevant acceptance criteria. No performance target, supported-host matrix or scalability claim is established until measured and specified.

## 10. Remaining design decisions

These items require elaboration, not additional feature discovery. They must be resolved before implementing the affected requirement.

| Area | Decision / affected requirements |
| --- | --- |
| Workspace and security | Physical isolation, Designer/User role scope, account/session management, user-bound API/MCP credentials, definition/relationship privileges and changed group memberships or sensitivity settings. R-001, R-013–R-018, R-042. |
| Data representation | Collection/reference mapping, exact field validations, formatted text, safe conversions, disabled-field presentation and unused-definition deletion. R-002, R-007–R-012. |
| Input aids | Supplied defaults, configuration screens and behavior when previously used options are deactivated or changed, particularly structural Contact kind values. R-009, R-010, R-024. |
| Contacts | Contact-kind conversion, change/loss of main Organization, missing-first-name formatting, role dictionaries, multiple roles and validity intervals. R-024–R-027. |
| Relationships and modules | Minimum cardinalities, hierarchy cycle prevention, consistent preflight/activation with concurrent changes, shared-definition ownership, module updates/deactivation and UI for cross-module required fields. R-003–R-007, R-019–R-023. |
| Numbering | Dynamic format tokens, reset scope, gaps, reuse, manual numbers and changed rules with existing records. R-011. |
| Journal and recycle bin | Event schema and additional journal privileges, reduced deletion-event format, history erasure including linked contexts, invalid links on restore and relationship cleanup after permanent deletion. R-034–R-040. |
| Interfaces and UI | API contract/versioning, MCP tools, bulk-action semantics, pagination, routing/query libraries, tree traversal presentation, navigation and configurable theme scope. R-030–R-033, R-041, R-044. |
| Operations | Backend framework/data-access layer/package versions, supported Linux requirements, proxy example, migration/backup tooling, metadata backup and release/site publication processes. R-043–R-046. |
| Commercial | Legal licensor designation, contribution rights, Community/Premium feature split, pricing, activation and support terms. R-047. |
| Quality | Concrete initial user profile, representative data sizes and measurable performance, accessibility and operational acceptance targets. Cross-cutting. |

## 11. Initial acceptance scenarios

These scenarios guide the first implementation slices. They are not a completed test report.

1. **Object core:** Create a workspace, custom type and field; save a record through API/MCP; confirm UI visibility and the journal. Verify a rejected input leaves neither a partial record nor journal entries. R-001, R-002, R-008–R-012, R-034, R-036, R-041.
2. **Permissions:** Combine two group field grants, apply an explicit user override, restrict one sensitive record and leave another public. Repeat through UI/API/MCP and verify the Administrator exception. R-013–R-018, R-042.
3. **Contacts:** Create an Organization, a sole-business Individual contact and a Contact person with main/secondary Organizations and distinct relationship roles. Verify Keyword formation and field applicability. R-024–R-027.
4. **Project context:** Create Contact → Project → Case → Task and direct Tasks at Contact/Project level. Change a parent assignment; inspect derived context, tree, dossier and both sides' relationship history. R-019–R-023, R-028–R-035.
5. **Shared modules and evolution:** Edit one shared record from two module views, complete a hidden required field, reject an unsafe conversion and block a stricter relationship rule until all violations are resolved. R-004–R-007, R-023, R-031.
6. **Lifecycle:** Recycle a Project without cascading to its children, restore valid relationships, reject unconfirmed permanent deletion and verify content erasure from journal views after confirmed deletion. R-038–R-040.
7. **Self-hosting:** Install only the release package and images, create the first Administrator, back up an instance and restore it in isolation. R-043, R-045, R-046.

## 12. References

- [IREB/CPRE glossary](https://cpre.ireb.org/en/downloads-and-resources/glossary)
- [GNU AGPL version 3](../LICENSE), with the version-3-only licensing declaration in the [README](../README.md#licensing-and-commercial-model).
- [UUIDv7, RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7)
- [Diátaxis](https://diataxis.fr/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
