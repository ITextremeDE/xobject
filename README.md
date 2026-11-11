# xObject

A metadata-driven, API-first platform for connected business data.

xObject is developed by **ITextreme** to bring contacts, projects, cases, tasks and custom data objects into one configurable application. Define object types and fields, connect records, and work with them through domain modules, the web interface, an API or AI assistants using MCP.

## Project status

**Version 1.1.0 — Community.** The PostgreSQL-backed application supports configurable typed objects, classification, workspace roles/groups, shared API/MCP operations and atomic journals. Its React/Vite interface includes searchable tables, full-page record forms, Settings, a Form designer, relationship controls, Dossier and a Projects-owned Primary tree. Dashboard statistics/chart content remains exploratory; its record table is normal application UI.

The permission model combines user/group object and field ceilings, separate Create rights, graded ownership and nested-group/foreign-access inheritance. Sensitive records configure Access principals, public access, Personal/Confidential privacy, foreign maxima and field exceptions. Membership and Designer status grant no content by themselves; Administrators retain installation-wide content access. See [PRD section 4](docs/PRD.md#4-permissions) and [ADR 0027](docs/adr/0027-ownership-and-foreign-access.md). Calendar-only operations and notification delivery remain later work.

Contacts & Relations supplies Contacts and Distribution lists. Projects & Tasks reuses the same Contacts and adds Projects, Cases and Tasks, including the fixed Contact → Project → Case Primary association. These five supplied object types, user-defined models, record lifecycle, shared forms and workspace settings are part of the released V1 baseline. See the [user guide](docs/user-guide.md) for behavior and the [quality report](docs/quality-acceptance.md) for acceptance evidence and its limits.

Version 1.1.0 adds Contact correspondence and language-specific Pronouns, family/affiliation relationships, Other usage choices and Administrator-confirmed assignment of missing record numbers. Its supported additive upgrade preserves existing definitions, data and history. See the [release changelog](CHANGELOG.md#110---2026-11-11) and [scoped validation evidence](docs/quality-acceptance.md#contact-correspondence-and-missing-number-assignment--2026-11-11-unreleased).

Documents & Communication and the other four agreed V2 themes remain planned; additional Contacts/Projects objects and further modules have no release assignment. The [roadmap](ROADMAP.md) owns that public overview.

External clients use user-bound, expiring and revocable API/MCP tokens under their current permissions. The versioned input/output contract, OpenAPI download and typed bearer client are described in [API and MCP access](docs/api.md).

Disposable development instances use the current installation definition and can be rebuilt explicitly. Released installations follow the supported backup/upgrade/verification path; development resets do not replace released upgrades. See [ADR 0028](docs/adr/0028-current-installation-baseline.md).

Use the [release downloads](https://github.com/ITextremeDE/xobject/releases) and the [self-hosting guide](docs/self-hosting.md) for installation. The [PRD](docs/PRD.md) defines stable requirements, later product targets and acceptance scenarios; it describes intended behavior, not a declaration that all requirements are delivered. Local verification, Git publication, CI and deployment are separate states.

## The idea

Start with a shared object platform and activate the modules you need. An object type can belong to multiple modules, each contributing its own fields to the common form while using the same records and shared values.

Fields support translated descriptions and input hints, typed defaults and scalar uniqueness. Per-object automatic record numbers support prefixes, suffixes and never/yearly/monthly sequences.

Workspaces keep data and configuration separate. The Projects module supplies a fixed primary chain connecting **Contact → Project → Case**, with tasks and other records attached at the appropriate level. Associations are optional by default; required context can be configured per object type.

## Version 1 scope

| Area | Scope |
| --- | --- |
| **Contacts & Relations** | Contacts with separate Organization/Individual-contact/Contact-person kinds and Distribution lists. Eleven additional object memberships remain later scope without a release assignment. |
| **Projects & Tasks** | Shared Contacts, Projects, Cases and Tasks; a coordinating Responsible reference and task assignment through Access principals, editable starter forms and shared temporal values. The six other Projects objects are later scope. |
| **Custom data models** | User-defined object types, typed fields including general selection trees, and relationship types alongside protected module definitions. |
| **Classification** | Configurable types, type-dependent statuses and single-, multiple- or tree-choice categories. |
| **Access control** | Object/field ceilings, graded ownership, foreign access and group inheritance on sensitive records. Administrators have installation-wide access. Calendar and notifications remain separate. |
| **Views** | Searchable tables, configurable object forms and record details with a relationship tree, dossier and journal. |
| **History and lifecycle** | One journal entry per field change, relationship history and a recycle bin with controlled permanent deletion. |
| **API and MCP** | Every application capability available through shared backend rules; agents act with their user's rights. |

Uploads, attachments, import/export, SSO, desktop and mobile clients, offline synchronization, Kanban and calendar views are outside the first-version scope.

Documents & Communication is planned for V2, including supplied Emails, Documents and Phone calls. No email handling or uploads are implemented. Modules may contribute different fields to one shared object and record. Each object has one common form that combines its applicable contributions. The catalog can grow. See [the module catalog](docs/PRD.md#module-catalog-and-shared-forms).

The agreed V2 scope also includes personal column order/widths, guided Contact-kind changes, Contact maintenance with duplicate detection/merging and Previous/Next record navigation. These are planned targets; [delivery boundaries](docs/PRD.md#13-agreed-v2-scope) distinguish them from the released features.

## Technology

| Layer | Choice |
| --- | --- |
| Database | PostgreSQL |
| Backend, API and MCP | TypeScript on Node.js; modular monolith |
| Web client | React, TypeScript and Vite |
| Interface | Tailwind CSS and shadcn/ui, favoring standard components and minimal custom CSS |
| Self-hosting | Prebuilt container images and Docker Compose on Linux |

PostgreSQL holds application definitions, records, relationships and history. Git is used for source code and project documentation. Using or self-hosting xObject does not require a Git account or a user-owned repository.

The backend uses Fastify, Kysely with `pg`, Better Auth and the official TypeScript MCP SDK. Dependency versions are recorded in the package manifests and lockfile. The application uses a current fresh-installation baseline, deferred record-registry checks, versioned field edits and separate operator/runtime database roles under [ADR 0022](docs/adr/0022-database-integrity-and-concurrency.md). Installation and maintenance are described in the [self-hosting guide](docs/self-hosting.md). The [quality report](docs/quality-acceptance.md) records the accepted scope and remaining coverage limits. The supported same-schema 1.0.0 → 1.0.1 upgrade verifies the target fingerprint and integrity. Future schema-changing released upgrades require dedicated migrations and acceptance.

## Documentation and development

- [Public documentation](https://docs.xobject.org/)
- [First steps](docs/first-steps.md)
- [Using xObject](docs/user-guide.md)
- [How xObject fits together](docs/concepts.md)
- [Workspace configuration](docs/workspace-settings.md), [model design](docs/model-design.md) and [team permissions](docs/access-administration.md)
- [Documentation and architecture index](docs/README.md)
- [Product requirements](docs/PRD.md)
- [Domain starter profiles](docs/domain-profiles.md)
- [Development guide](docs/development.md)
- [Self-hosting, backup and recovery](docs/self-hosting.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Remaining design decisions](docs/PRD.md#10-remaining-design-decisions)
- [Initial acceptance scenarios](docs/PRD.md#11-initial-acceptance-scenarios)

Development uses small changes, pull requests, review and checks against acceptance criteria. The backend, shared contracts, web workspace and GitHub checks are defined; see [Contributing](CONTRIBUTING.md) for contribution rights and [Security](SECURITY.md) for private reporting; release publication remains separate.

## Licensing and commercial model

**xObject is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`).** You may redistribute and modify it under version 3 of that license. See [LICENSE](LICENSE) for the full terms. xObject is provided without any warranty, including the implied warranties of merchantability or fitness for a particular purpose.

The project is maintained and licensed by **Jürgen Schadek personally, under the ITextreme brand**. Contributors retain their copyrights and submit under the same license with a Developer Certificate of Origin sign-off; see [Contributing](CONTRIBUTING.md) and [NOTICE](NOTICE). This declaration also applies to future Premium code.

**Version 1 is entirely Community, with its complete agreed V1 functionality and no Premium feature gates.** Future Premium activation, support/maintenance and a hosted cloud offering may follow separately. Future feature tiers, pricing and service terms remain undecided; Premium code will also remain open source under the same license.

## Public project website

The project introduction is available at [xobject.org](https://xobject.org).
Its static Astro/TypeScript source lives in `apps/site`, with Tailwind CSS 4,
ITextreme design tokens and selective shadcn/ui Base UI components. See the
[website guide](docs/website.md) for design provenance, development and release checks. The project website is
separate from the xObject application; install the application using the release package.

Delivery and acceptance: [self-hosting](docs/self-hosting.md), [quality evidence](docs/quality-acceptance.md), [release preparation](docs/releasing.md), [public documentation](docs/public-documentation.md) and the [optional agent plugin](docs/agent-plugin.md). The quality report records the accepted OpenAI Codex, browser, VoiceOver and native Linux paths with their explicit coverage limits.
