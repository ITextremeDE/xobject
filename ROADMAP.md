# Roadmap

xObject is in early development. A local backend and first web interface exist; a software release is not available yet.

This roadmap summarizes product goals from the [Product Requirements Document](docs/PRD.md). Operational tasks, dependencies and priorities are managed in OpenProject; this file is a curated public overview, not a duplicate task list or a live implementation-status report. Goals will be reconciled with that planning as implementation is organized.

No delivery dates are committed. An item here is not evidence that its requirements have been implemented or accepted.

## Delivered — Public project introduction

- Static Astro project homepage, separate from the application, linking to the canonical requirements and roadmap. Full Starlight documentation and release/version navigation remain later work.

## Delivered — Local Administrator prototype

- PostgreSQL-backed local login, workspace/object/typed-field creation, versioned record editing and atomic per-field journals through shared API/MCP rules.
- Shared Type/Status/Category configuration with independent required flags, localized stable choices, defaults, per-Type Status mappings and single/multiple Category selection in the local experiment.
- React web interface with direct routes, Dashboard, personal/workspace settings, workspace search, sortable paginated record lists, German/English labels and keyboard support.
- Instance-wide Administrators, explicit workspace User/Designer memberships and role-appropriate configuration views; business-content access remains Administrator-only.
- Field/object definition deactivation, validated reactivation and confirmed deletion of never-used storage, with retained metadata/journals and read-only inactive values. The record recycle bin remains pending.
- This is a local typed-field/classification experiment; complete permissions, the remaining shared fields and version-1 acceptance remain open.

## In progress — Product definition and technical foundation

- Refine the initial requirements and acceptance criteria for the object platform, CRM and project management.
- Resolve the technical foundation decisions needed for the first implementation slice: backend framework, data access, workspace isolation, authentication and controlled schema changes.
- Evaluate local login, workspace-prefixed dynamic tables, shared API/MCP operations and atomic per-field journals in the backend technical spike. The web interface now exercises workspace/object/typed-field creation, record search/editing and journals. Complete shared fields and permissions remain necessary for the first slice below.

## Next — First end-to-end object slice

Deliver a small, working foundation before building the full domain modules:

1. Create a workspace and initial Administrator account.
2. Define a custom object type and a field.
3. Create and edit a record with the shared fields and backend validation.
4. Record each field change in the journal, atomically with the content change.
5. Exercise the same capabilities through the web interface, API and MCP with the applicable authorization rules.

The outcome is a verified vertical slice, not a completed version-1 release. See the [initial acceptance scenarios](docs/PRD.md#11-initial-acceptance-scenarios).

## Next — Complete the version-1 scope

The following goals build on that foundation. Their detailed sequencing and work packages belong in OpenProject.

| Goal | Intended outcome |
| --- | --- |
| **Permissions and identity** | Local accounts, installation-wide Administrators, Designers and Users; user/group object and field rights; optional record access lists; user-bound agent access. |
| **Configurable object platform** | Supported field types, input aids, Type/Status mappings, categories and number sequences; shared types across modules; protected module definitions and safe model changes. |
| **Relationships and context** | All agreed cardinalities, one direct Primary association, derived ancestor context and configurable required chains. |
| **CRM and project management** | Contacts with distinct contact kinds and main Organization relationships; Projects, Cases and Tasks with responsibility and assignment. |
| **Daily work and lifecycle** | Searchable tables, module forms, record details, dossier and relationship tree; per-field journal, recycle bin, restoration and controlled permanent deletion. |
| **Self-hosting and acceptance** | Versioned container images, Docker Compose installation, controlled migrations, backup/restore instructions and checks against the version-1 acceptance criteria. |
| **Public documentation** | Extend the published Astro project homepage with Astro/Starlight documentation, release notes and versioned documentation. |

All version-1 capabilities must remain available through the API and MCP. Security, validation and journal behavior are part of each affected implementation slice, not a final add-on.

## Later — Beyond version 1

These areas are outside the first-version scope. Their detailed requirements and ordering remain open.

- File uploads, attachments and file versioning.
- Import and export features.
- SSO with an external identity provider.
- Kanban, calendar and additional views.
- Desktop applications for Windows, macOS and Linux; Electron or Tauri remains to be selected.
- Separate mobile clients for iOS and Android.
- Offline operation and synchronization.
- A hosted cloud offering.

Computed fields and general undo are candidates for separate specification, not committed delivery milestones. Premium feature allocation, pricing and service terms also remain to be defined; Premium code will stay open source.

## Keeping this roadmap current

Update this overview when accepted requirements, internal priorities or delivered capabilities materially change. Keep detailed operational status in OpenProject, the requirement baseline in the PRD and actual release changes in the [changelog](CHANGELOG.md). Do not mark a product goal delivered before its acceptance criteria have been verified.
