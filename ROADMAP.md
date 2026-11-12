# Roadmap

This is xObject's public product direction. OpenProject leads operational planning; the [PRD](docs/PRD.md) defines requirements and the [changelog](CHANGELOG.md) records delivered changes. Future targets have no committed dates, and only explicitly assigned versions are shown as such.

## Currently released — Community 1.4.0

- **Connected data:** configurable objects, fields, relationships, forms and journals, with workspace isolation and differentiated user/group permissions.
- **Contacts and projects:** Contacts & Relations supplies Contacts and Distribution lists; Projects & Tasks adds Projects, Cases and Tasks using the same Contacts.
- **Contacts and configuration 1.1.0:** Contact correspondence, Pronouns, family/affiliation links, Other usage choices, confirmed missing-number assignment, Source Serif 4 and single-language module activation.
- **Maintenance 1.0.2:** renewable offline OAuth access, consent-focused security history, bounded container logs, workspace-name sorting and 48 grouped workspace icons.
- **Web, API and AI:** a responsive web application, shared REST/MCP operations, personal credentials, OAuth and supplied agent skills. Live refresh preserves open drafts.
- **Self-hosting:** published Linux/AMD64 and Linux/ARM64 containers, Docker Compose setup, first-Administrator provisioning and backup/restore tooling. Version 1.0.2 adds a supported authorization-journal migration from 1.0.0/1.0.1 while retaining data, credentials and history.

See [release notes](CHANGELOG.md#140---2026-11-12), [downloadable releases](https://github.com/ITextremeDE/xobject/releases) and the [quality report](docs/quality-acceptance.md) for details and verified coverage. The English/German product website and English documentation are also published independently; [versioned documentation snapshots](docs/versions.md) retain each released baseline.

### Contact workflows in 1.2.0–1.3.0

- **Guided Contact-kind changes:** form or join an Organization, continue one Contact person independently or continue all Contact persons as Individuals. Preserve identities, numbers, rights, compatible contents and atomic history (R-065).
- **Organization context:** inherit Organization name and separate central Telephone/Fax, Email and address collections, with per-field own exceptions and field permissions (R-064). Commercial register belongs only to Organizations and Individuals.
- **Combined relationship lists:** arrange supplied/custom to-many sides in a searchable, sortable designer group such as Family. Keep each relationship's rules and permissions. Linked Contact persons show permitted Position, Department and translated Function.
- **List consistency:** readable phone numbers, Keyword-based Contact defaults and common shadcn tooltips.

ADR 0038 defines these V1 extensions. Dedicated maintenance tooling upgrades supported released 1.0.0–1.3.0 installations. Contact maintenance and duplicate detection/merging remain in V2.

### Reliability and interface in 1.4.0

- **Reliable access and creation:** transaction-local permission queries, targeted policy reads and safe user-scoped creation retries through web/API/MCP.
- **Contact reading and list consistency:** compact Contact overviews, shared relationship tables, editable supplied Family lists, configurable object columns and Contact-person affiliations.
- **Maintainability and mobile behavior:** separate definition/module/record services, stable error codes and safe-area handling.

The [changelog](CHANGELOG.md#unreleased) records the source changes; the [quality report](docs/quality-acceptance.md) records acceptance and remaining platform limits. Community 1.4.0 delivers these additions; acceptance and retained platform limits are recorded separately.

## Implemented in source — awaiting the next release

Contact UI corrections add readable classification and inheritance details, a searchable category-tree filter, direct relationship drafts from the overview, configurable mixed Contact lists and professional columns, and complete collection values in journal details. Existing authored forms are preserved. This source work does not change the published 1.4.0 baseline; release and deployment remain separate steps.

## Planned — Version 2

- **Personal table layouts:** remember column order and widths in addition to the column visibility already available in V1 (R-030).
- **Documents & Communication:** supplied Documents, Emails and Phone calls, together with email handling, uploads, attachments and file versioning.
- **Contact maintenance:** guided reassignment, duplicate detection and merging, with explicit identity and permission rules.
- **Previous/Next record:** browse the originating list's complete filtered and sorted result, including across pages, while preserving return context and protecting unsaved changes (R-063).

## Later — Version not assigned

### Contacts and relationships

- **Additional supplied objects:** Vouchers, External services, Campaigns, Contact reports, Line items, Products, Product usages, Product groups, Expenses, Opportunities and Contracts. These remain later scope without a release assignment; the [domain catalog](docs/PRD.md#6-supplied-domain-models) describes the proposed objects.

### Projects and tasks

- **Additional supplied objects:** Appointments, Vacations, Resource plans, Risks, Time entries and Goals, with lean initial fields and meaningful relationships.
- **Scheduling extensions:** recurrence, calendar parties, invitations, notifications, alarms/subscriptions and calendar/availability rights. The existing shared temporal model is their foundation.
- **Nested work:** evaluate Subprojects, Subcases and Subtasks as records of the existing object types. Their interaction with Primary association, cycles, lifecycle and any progress/date aggregation must be defined first (R-062).

### Forms and navigation

- **Conditional forms:** show fields or groups according to Type/Status, retain hidden values and define conditional requiredness. [Display conditions](docs/PRD.md#34-planned-conditional-field-visibility) remain separate from permissions and semantic applicability.
- **Additional work views:** calendar and Kanban views. Extend bulk actions only after their behavior is specified.
- **Creation defaults and configuration help:** define creation templates/default groups and explain module-related required-field dependencies when a concrete module combination needs them.

### Further modules

- **Other planned domains:** Operations & Finance, IT Service Management, Configuration Management Database, Events & Registrations and Knowledge & Insights. Sharing an existing object does not deliver the rest of a module.
- **ITSM exploration:** evaluate Cases with Type “Ticket” and conditional forms as an alternative to a separate Incidents object. The [ticket-model idea](docs/PRD.md#planned-itsm-ticket-model) is not yet an approved catalog replacement.

### Connected knowledge and AI workflows

- **Connected context and knowledge:** link work to its sources, improve exact/semantic/relationship discovery and expose freshness, changes and knowledge/review states (R-049–R-051).
- **Configurable agents and resumable work:** versioned agent definitions, rules and user-maintained skills; bounded delegation; jobs with separate execution attempts; recurring automations and authenticated runners (R-052–R-057). Current permissions and protection against duplicate effects apply throughout.
- **Data portability and model processing:** specify full-fidelity export and controlled external model processing (R-058). The [connected-work target](docs/PRD.md#94-later-target--connected-context-knowledge-and-agent-work) owns these requirements; V1's supplied MCP skills remain a separate delivered capability.

### Interoperability, accounts and clients

- **Standards-based exchange:** complete versioned vCard/iCalendar profiles and CardDAV/CalDAV synchronization, with explicit peer capabilities, conflict/deletion handling and preservation of unmapped values. Import/export remains planned.
- **Account integrations:** external SSO, verified email-address changes and profile/media uploads, with their mail/storage dependencies.
- **Additional clients:** desktop applications, separate mobile clients and offline operation/synchronization. Electron or Tauri has not been selected.
- **Explicit public viewing:** selected anonymous/public workspace content and record-specific link previews, with defined permissions, indexing and cache/revocation rules (R-061). Current private sharing grants no additional access.

### Hosting and commercial offerings

- **Hosted service:** offer a cloud-hosted deployment alongside self-hosting.
- **Future Premium scope:** decide features, pricing and service terms separately. V1 is entirely Community; the product, including future Premium code, remains `AGPL-3.0-only` under Jürgen Schadek/ITextreme.

Computed fields and general undo remain ideas requiring their own specification and release decision.

## Keeping this roadmap current

Update this overview when agreed scope, release assignment or delivery status changes. Keep detailed tasks, dependencies and completion evidence in OpenProject, technical decisions in the PRD/ADRs and test evidence in the quality report. Do not turn this page into a second task tracker or a record of individual development steps.
