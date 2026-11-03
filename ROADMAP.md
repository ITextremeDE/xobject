# Roadmap

xObject is in early development. A local backend and first web interface exist; a software release is not available yet.

This roadmap summarizes product goals from the [Product Requirements Document](docs/PRD.md). Operational tasks, dependencies and priorities are managed in OpenProject; this file is a curated public overview, not a duplicate task list or a live implementation-status report. Local delivery descriptions reflect verified prototype behavior; publication and full product acceptance remain separate.

No delivery dates are committed. An item here is not evidence that its requirements have been implemented or accepted.

## Delivered — Public project introduction

- Static Astro project homepage, separate from the application, linking to the canonical requirements and roadmap. Full Starlight documentation and release/version navigation remain later work.

## Delivered — Local Administrator prototype

- Explicit Primary-level bindings by object UUID, Address → Project → Case fields with inherited context, versioned preflight and role-filtered parents. Generic relationship endpoint conditions restrict candidates and complete record writes; the local Contact configuration supplies Organization/Contact-person links and a direct Identities list for Contact persons/Individual contacts. Complete CRM provisioning/ownership and automatic Contact Keywords remain outstanding.
- Record form refinement: shared filtered/paginated Journal data table with historical value formatting and detail dialogs, persistent draft notices, a separate Primary chain, one table per custom relationship and a top-level General-link action with its overview in the Dossier and staged searchable/filterable selection dialogs and configurable conditional field applicability. Fictional Contact rules are configured; full CRM templates and derived Contact names remain future work.
- PostgreSQL-backed local login, workspace/object/typed-field creation, versioned record editing and atomic per-field journals through shared API/MCP rules.
- Optional Keyword, Type/Status and Category fields can be configured in the shared field editors before installation, with atomic API/MCP creation and existing-data preflight. Classification supports independent required flags, localized stable choices/defaults, per-Type Status mappings and single/multiple Category selection.
- React web interface with direct routes, mixed-object and individual record tables, shared search/action toolbars, complete pagination, selection, column controls, sidebar command search and keyboard navigation. Closing record details preserves the originating list or Dashboard filters and focus. Dashboard statistics/activity use real local data; their metric selection and chart remain exploratory.
- Personal profile, verified password changes and own-session management; Administrator user provisioning with mandatory initial-password change and reversible activation. Instance and definition journals share structured history cards with current readable names, before/after values and technical details; definition history excludes record events.
- Dedicated responsive record pages for creation and editing, one centered two-column form, persistent save/reset actions and required-field feedback, optional preview/inactive-field disclosures, retained tab drafts, formatted field history and guarded return navigation. A fictional local five-object dataset includes actual relationships for testing; complete domain modules remain future work.
- Responsive personal/instance/workspace settings and nested editors with guarded drafts, consistent actions, alphabetical field administration and explicit required flags. Workspace groups and User/Designer memberships, independent interface/definition-language policies for the installed German/English packs, named time zones and regional formats with personal inheritance previews.
- Shared workspace shadcn appearance with base/theme/chart colors, primary/secondary overrides, fonts, heading fonts, radius and menu previews; light/dark/system mode remains personal.
- Instance-wide Administrators, explicit workspace User/Designer memberships and role-appropriate configuration views; business-content access remains Administrator-only.
- Field/object definition deactivation, validated reactivation and confirmed deletion of never-used storage, with retained metadata/journals and read-only inactive values. The record recycle bin remains pending.
- Workspace relationship-type configuration: protected system types and custom directed/undirected definitions for one object pair, per-side names/cardinalities, versions and journals. General is always available; minimal Projects activation enables Primary association for every object type. Definitions activate after preflight. Atomic record linking, cardinality-based selection/list controls, a shared searchable/sortable dossier data table with endpoint Type/Status/Category and shared endpoint history are implemented locally; lazy tree navigation and derived Primary context are also implemented locally. Independently required chain levels remain future work.
- This is a local typed-field/classification experiment; complete permissions, the remaining shared fields and version-1 acceptance remain open.
- Relationship-definition forms put the object pair first, reveal the appropriate separate/shared side settings without losing drafts, show object-specific descriptions and reuse consistent technical-name help; fixed values use read-only presentation, creation/availability are explained separately, and responsive layout/draft protection remain intact.
- Database integrity and concurrency: versioned field/object-label drafts, protected module structures, deferred row/registry checks, shared reads/workspace writes, targeted relationship checks, query indexes and a numbered migration ledger with a distinct restricted runtime role.

## In progress — Product definition and technical foundation

- Refine the initial requirements and acceptance criteria for the object platform, CRM and project management.
- Resolve the technical foundation decisions needed for the first implementation slice: release migration/restore packaging, measured scaling beyond workspace-level write serialization, authentication hardening and controlled schema changes.
- Build on the verified local login, workspace-prefixed dynamic tables, common API/MCP operations and atomic per-field journals. Keep complete shared fields and content permissions as the remaining foundation work; UI refinement does not constitute version-1 acceptance.

## Next — First end-to-end object slice

The Administrator-only prototype already exercises the basic flow below. Complete the shared-field and content-permission baseline, then verify it against the PRD before treating this as the first accepted product slice:

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
| **CRM and project management** | CRM supplies Contact-person/Organization relationships; Projects activation supplies Primary association for every object type, while General relationship stays core. Complete module templates remain future work. Contacts with distinct contact kinds, at most one Organization per Contact person and an Identities relationship list directly on Contact person/Individual contact records; Projects, Cases and Tasks with responsibility and assignment. |
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
