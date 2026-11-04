# ADR 0003: Localized definition labels and physical column order

- Status: Accepted; implemented for the local backend spike
- Date: 2026-10-29

## Context

Users need to see translated names while operators need stable readable SQL identifiers. PostgreSQL column order is also visible in database clients. Neither a language change nor a view preference should require rebuilding a business table.

## Decision

Store definition labels directly in `labels` JSONB columns, starting with `sys_object_types` and `sys_fields`. For example, `{"de":"Fahrzeuge","en":"Vehicles"}` names `itx_vehicles` without changing that table name. Do not maintain a second scalar label as a competing source. Initially accept German and English labels with at least one nonempty value. The built-in Keyword labels remain German `Stichwort` and English `Keyword`.

Store an optional preference in `sys_users.language` and the workspace default in `sys_workspaces.default_language`. A null user preference inherits the workspace default. Resolve labels using the effective available user/workspace language under [ADR 0012](0012-workspace-languages.md), followed by workspace default, English, German, then a preserved unknown-language label. The HTTP/MCP definition response exposes raw `labels` and a derived `label` for the authenticated user. Stored records and technical names do not change with the user's language.

Definition-label and preference changes go through the shared application layer and are journaled transactionally. User-language changes are installation-level journal events, so `sys_journal.workspace_id` permits null for those events. This does not grant access to another workspace or broaden content rights; the current local boundary is ADR 0026. The Better Auth language field is not writable through generic auth-profile input.

Create new object tables with the implemented fixed fields first: `id`, `keyword`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. As the remaining shared fields are implemented, they belong before the audit metadata on newly created tables. Append subsequent custom columns in creation order. Preserve the physical layout of existing tables during routine application operations and upgrades. An explicitly authorized development-data rebuild is separate maintenance, with backup and verification of data/history preservation. Display ordering remains a separate setting.

## Current installation and verification

The [current installation](0028-current-installation-baseline.md) creates translated JSONB definition labels directly. Inputs use supported language maps; there is no scalar-label conversion or undetermined-language representation. Language preferences use the current optimistic workspace/user localization operations. Business contents are never translated automatically. Real historical field values retain the representation they had when changed.

System column order is defined directly in the current schema: identity/scope, attributes/configuration, lifecycle/version and audit metadata. Authentication columns follow Better Auth's schema. Dynamic business tables retain the metadata-first append order above; configured form order and alphabetical administration remain independent. No populated-table reorder or old-schema adoption path is part of initialization.

Integration coverage checks language fallback, preference changes, reserved standard labels, invalid inputs, physical column order, API/MCP parity and journal rollback. Current evidence is in [development](../development.md).
