# xObject

A metadata-driven, API-first platform for connected business data.

xObject is being developed by **ITextreme** to bring contacts, projects, cases, tasks and custom data objects into one configurable application. Define object types and fields, connect records, and work with them through domain modules, the web interface, an API or AI assistants using MCP.

## Project status

**Early development.** The repository includes the product requirements and a local backend technical spike for PostgreSQL-backed authentication, dynamic typed fields, translated definition labels, user/workspace language preferences, API/MCP operations and atomic per-field journaling. A first React web interface supports login, workspace/object/typed-field creation, sortable/searchable record tables, editing and record journals in German and English. Shared Type, Status and Category support configurable required flags, defaults and per-Type Status choices, including Without Type. The interface includes a Dashboard, personal settings, workspace search and keyboard shortcuts. Administrators have instance-wide access; workspace Users can view settings and Designers can edit workspace configuration. Business-content access remains Administrator-only until object/field/record permissions are implemented. Fields and object types support deactivation/reactivation and confirmed deletion when never used, with retained definition journals and historical identities. This does not implement the record recycle bin. There is no installation package or software release yet. See the [development guide](docs/development.md) for the evaluated scope and commands.

The [Product Requirements Document](docs/PRD.md) defines the initial scope, 47 requirements, acceptance criteria and remaining design decisions. It describes intended behavior, not implemented features.

## The idea

Start with a shared object platform and activate the modules you need. An object type can belong to multiple modules, each contributing its own fields and views while using the same records and shared values.

Workspaces keep data and configuration separate. A configurable primary association connects **Contact → Project → Case**, with tasks and other records attached at the appropriate level. Associations are optional by default; required context can be configured per object type.

## Planned first version

| Area | Scope |
| --- | --- |
| **CRM** | Contacts with separate kinds for organizations, individual contacts and contact persons; organization relationships and domain roles. |
| **Project management** | Projects, cases and tasks, including separate responsibility and task assignment. |
| **Custom data models** | User-defined object types, fields and relationship types alongside protected module definitions. |
| **Classification** | Configurable types, type-dependent statuses and single- or multiple-choice categories. |
| **Access control** | User and group permissions, field-level overrides and optional record access lists. Administrators have installation-wide access. |
| **Views** | Searchable tables, module-specific forms and record details with a relationship tree, dossier and journal. |
| **History and lifecycle** | One journal entry per field change, relationship history and a recycle bin with controlled permanent deletion. |
| **API and MCP** | Every application capability available through shared backend rules; agents act with their user's rights. |

Uploads, attachments, import/export, SSO, desktop and mobile clients, offline synchronization, Kanban and calendar views are outside the first-version scope.

## Planned technology

| Layer | Choice |
| --- | --- |
| Database | PostgreSQL |
| Backend, API and MCP | TypeScript on Node.js; modular monolith |
| Web client | React, TypeScript and Vite |
| Interface | Tailwind CSS and shadcn/ui, favoring standard components and minimal custom CSS |
| Self-hosting | Prebuilt container images and Docker Compose on Linux |

PostgreSQL will hold application definitions, records, relationships and history. Git is used for source code and project documentation. Using or self-hosting xObject will not require a Git account or a user-owned repository.

The technical spike evaluates Fastify, Kysely with `pg`, Better Auth and the official TypeScript MCP SDK. Evaluated versions are recorded in the package manifests and lockfile. This does not establish a production migration, authorization or deployment design.

## Documentation and development

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
