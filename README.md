# xObject

A metadata-driven, API-first platform for connected business data.

xObject is being developed by **ITextreme** to bring contacts, projects, cases, tasks and custom data objects into one configurable application. Define object types and fields, connect records, and work with them through domain modules, the web interface, an API or AI assistants using MCP.

## Project status

**Early development.** A local PostgreSQL-backed prototype supports configurable typed objects, classification, workspace roles/groups, shared API/MCP operations and atomic journals. Its React/Vite interface includes searchable tables, full-page record forms, Settings, a Form designer, relationship controls, Dossier and a Projects-owned Primary tree. Dashboard statistics/chart content remains exploratory; its record table is normal application UI.

The initial content ACL supports user/group object grants, field exceptions and sensitive-record Access principals. Membership and Designer status grant no content by themselves; Administrators retain installation-wide content access. The expanded graded ownership/foreign-access model is specified in [PRD section 4](docs/PRD.md#4-permissions) and is not yet implemented. [ADR 0026](docs/adr/0026-content-permissions.md) describes the current local policy.

Projects & Tasks supplies protected base objects and the fixed Contact → Project → Case chain. The complete catalog is visible, but Contacts & Relations and Documents & Communication activation, full domain templates, record recycling and complete version-1 acceptance remain open. Personal/account management, language/region and shared workspace design are implemented locally. See the [documentation index](docs/README.md) for the applicable decisions and the [development guide](docs/development.md) for setup and the recorded validation status.

There is no installable application release. The [PRD](docs/PRD.md) defines 47 requirements and acceptance scenarios; it describes intended behavior, not a declaration that all requirements are delivered. Local verification, Git publication, CI and deployment are separate states.

## The idea

Start with a shared object platform and activate the modules you need. An object type can belong to multiple modules, each contributing its own fields and views while using the same records and shared values.

Workspaces keep data and configuration separate. The Projects module supplies a fixed primary chain connecting **Contact → Project → Case**, with tasks and other records attached at the appropriate level. Associations are optional by default; required context can be configured per object type.

## Planned first version

| Area | Scope |
| --- | --- |
| **Contacts** | Contacts with separate kinds for organizations, individual contacts and contact persons; organization relationships and domain roles. |
| **Projects** | Shared Contacts, projects, cases and tasks, including separate responsibility and task assignment. |
| **Custom data models** | User-defined object types, fields and relationship types alongside protected module definitions. |
| **Classification** | Configurable types, type-dependent statuses and single- or multiple-choice categories. |
| **Access control** | Object/field ceilings, graded ownership, foreign access and group inheritance on sensitive records. Administrators have installation-wide access; the expanded model is specified, not yet implemented. |
| **Views** | Searchable tables, module-specific forms and record details with a relationship tree, dossier and journal. |
| **History and lifecycle** | One journal entry per field change, relationship history and a recycle bin with controlled permanent deletion. |
| **API and MCP** | Every application capability available through shared backend rules; agents act with their user's rights. |

Uploads, attachments, import/export, SSO, desktop and mobile clients, offline synchronization, Kanban and calendar views are outside the first-version scope.

Documents & Communication is a planned additional module for Emails and Documents, beyond the initial Contacts/Projects delivery. No email handling or uploads are implemented. Modules may share one object and record while using different field selections and form layouts. The catalog can grow. See [the module catalog](docs/PRD.md#module-catalog-and-shared-forms).

## Planned technology

| Layer | Choice |
| --- | --- |
| Database | PostgreSQL |
| Backend, API and MCP | TypeScript on Node.js; modular monolith |
| Web client | React, TypeScript and Vite |
| Interface | Tailwind CSS and shadcn/ui, favoring standard components and minimal custom CSS |
| Self-hosting | Prebuilt container images and Docker Compose on Linux |

PostgreSQL will hold application definitions, records, relationships and history. Git is used for source code and project documentation. Using or self-hosting xObject will not require a Git account or a user-owned repository.

The technical spike evaluates Fastify, Kysely with `pg`, Better Auth and the official TypeScript MCP SDK. Evaluated versions are recorded in the package manifests and lockfile. The local prototype now has numbered migrations, deferred record-registry checks, versioned field edits and separate operator/runtime database roles under [ADR 0022](docs/adr/0022-database-integrity-and-concurrency.md). The expanded permission target, production installation/upgrade packaging, external credentials and deployment design remain open.

## Documentation and development

- [Documentation and architecture index](docs/README.md)
- [Product requirements](docs/PRD.md)
- [Local development and technical spike](docs/development.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Remaining design decisions](docs/PRD.md#10-remaining-design-decisions)
- [Initial acceptance scenarios](docs/PRD.md#11-initial-acceptance-scenarios)

Development uses small changes, pull requests, review and checks against acceptance criteria. The backend, shared contracts, web workspace and GitHub checks are defined; a release process and contribution guide remain to be implemented.

## Licensing and commercial model

**xObject is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`).** You may redistribute and modify it under version 3 of that license. See [LICENSE](LICENSE) for the full terms. xObject is provided without any warranty, including the implied warranties of merchantability or fitness for a particular purpose.

This licensing declaration also applies to Premium code. Contribution terms remain to be defined.

The planned model combines an independently usable free Community edition with paid Premium activation, support and maintenance. Premium code will also remain open source. A hosted cloud offering may follow later. Feature tiers, pricing and commercial terms are not yet defined.

## Public project website

The project introduction is available at [xobject.org](https://xobject.org).
Its static Astro/TypeScript source lives in `apps/site`, with Tailwind CSS 4,
ITextreme design tokens and selective shadcn/ui Base UI components. See the
[website guide](docs/website.md) for design provenance, development and release checks. The project website is
separate from the planned xObject application and does not provide an installation.
