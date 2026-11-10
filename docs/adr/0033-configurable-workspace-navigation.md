# ADR 0033: Configurable workspace navigation

- Status: Implemented locally; release acceptance remains separate
- Date: 2026-11-05
- Refines: [ADR 0004](0004-first-web-interface.md), [ADR 0025](0025-modules-and-form-views.md) and PRD R-048

## Current reading — 2026-11-10

The local/release-acceptance wording records this decision's original phase. Configurable workspace/personal navigation is part of the published Community baseline; the [workspace guide](../workspace-settings.md#arrange-navigation) owns current usage. This note does not extend the original scoped tests or change their evidence.

## Decision

Compose the application sidebar from the installed shadcn Base UI primitives: Sidebar 07 for workspace/user controls and object submenus, Sidebar 02 for the header search field and collapsible sections, Sidebar 08 for the secondary Resources links above the user menu. Reuse the existing command dialog for search/navigation and its Command/Ctrl+K shortcut. Native text entry or activation of the search field opens that dialog; focus restoration must not reopen it. Whole-sidebar icon collapse and the mobile drawer remain supported.

Navigation has three semantic levels: section, object entry and filtered child entry. Each active module gets a translated section using its catalog name. Its object entries follow descending `navigationPriority` from the module catalog; equal priorities retain catalog order. Current Projects defaults are Projects, Cases, Tasks, Contacts; Contacts defaults are Contacts, Distribution lists. A shared object gets a separate navigation-entry identity per module while preserving one object/record identity and common form. Custom objects appear in their own section. Disabled modules and inactive/deleted definitions are retained in the inventory/configuration but do not appear as active menu destinations.

Supplied Contacts get Organizations, Contact persons and Individual contacts child entries in each module location. These reference the protected Contact-kind UUID bindings, independently of labels or technical names. Parent activation opens all Contacts; the separate arrow expands the children. Filtered entries open ordinary record lists with the selected kind. API/MCP `list_records.contactKindId` validates the binding and applies field-read/record-read predicates before search, counts and pagination. A hidden kind cannot be used as a filtering oracle.

## Persistence and editing

`sys_navigation_preferences` stores a nullable layout and optimistic version for each workspace/scope: a null `user_id` identifies the workspace default, otherwise it identifies that user's personal arrangement. A null layout inherits module defaults for workspace scope or the workspace layout for personal scope. Reads create no preference rows. Null user identities are unique within the workspace. First writes require version zero; subsequent writes require the current positive version, including when resetting to inheritance.

Layouts store entry-order IDs, hidden-entry IDs and the whole Resources-block visibility flag. Sorting affects siblings at each of the three levels; module/object/filter relationships remain explicit. Hidden parents hide descendants while retaining their individual settings. Configured identities survive disabled/deleted destinations, and newly available entries append within their default sibling group. Personal arrangements are complete overrides of the workspace arrangement; later shared changes do not overwrite them. New inventory entries still appear automatically. Hiding navigation never grants or revokes content access.

Administrators and workspace Designers edit shared defaults. Every workspace member can edit only their own personal layout; the transport user determines ownership, with no target-user parameter. `get_workspace_navigation` and `configure_navigation` share the same API/MCP authorization and current permission inventory. The editor lives in both user menus as Customize navigation, independently of Resources visibility. It provides pointer/touch handles, keyboard-accessible up/down buttons, visibility controls, a Resources toggle, Save/Reset and explicit inheritance restoration. Unsaved/pending guards and focus restoration follow the existing dialog conventions. Dashboard, Recycle bin, search/workspace controls and the user menu remain fixed utility navigation.

Configuration and per-property journals commit atomically. Ordering/visibility journal values retain entry IDs with translated path snapshots so later label changes do not rewrite history. Navigation preferences have independent versions from language, appearance and business contents. Concurrent first writes and stale updates are rejected, and journal failure rolls back preference/version changes. Schema/catalog changes follow ADR 0028's current-installation policy.

## Validation

Focused integration coverage checks module priority and duplicate Contact entries, inheritance/reset, Administrator/Designer/User boundaries, personal isolation, optimistic races, deleted definitions, journal snapshots/rollback and Contact-kind filters before paging, including object/record field restrictions. Web tests cover sibling moves, retained/new nodes, hidden/unavailable ancestors and navigation/filter URLs. Runtime/browser evidence belongs in the development guide.
