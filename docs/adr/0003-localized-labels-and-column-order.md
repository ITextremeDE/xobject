# ADR 0003: Localized definition labels and physical column order

- Status: Accepted; implemented for the local backend spike
- Date: 2026-10-29

## Context

Users need to see translated names while operators need stable readable SQL identifiers. PostgreSQL column order is also visible in database clients. Neither a language change nor a view preference should require rebuilding a business table.

## Decision

Store definition labels directly in `labels` JSONB columns, starting with `sys_object_types` and `sys_fields`. For example, `{"de":"Fahrzeuge","en":"Vehicles"}` names `itx_vehicles` without changing that table name. Do not maintain a second scalar label as a competing source. Initially accept German and English labels with at least one nonempty value. The built-in Keyword labels remain German `Stichwort` and English `Keyword`.

Store an optional preference in `sys_users.language` and the workspace default in `sys_workspaces.default_language`. A null user preference inherits the workspace default. Resolve labels by trying the user preference, workspace default, English, German, then a preserved unknown-language label. The HTTP/MCP definition response exposes raw `labels` and a derived `label` for the authenticated user. Stored records and technical names do not change with the user's language.

Definition-label and preference changes go through the shared application layer and are journaled transactionally. User-language changes are installation-level journal events, so `sys_journal.workspace_id` permits null for those events. This does not grant access to another workspace or broaden the spike's Administrator-only policy. The Better Auth language field is not writable through generic auth-profile input.

Create new object tables with the implemented fixed fields first: `id`, `keyword`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. As the remaining shared fields are implemented, they belong before the audit metadata on newly created tables. Append subsequent custom columns in creation order. Preserve the physical layout of existing tables during routine application operations and upgrades. An explicitly authorized development-data rebuild is separate maintenance, with backup and verification of data/history preservation. Display ordering remains a separate setting.

## Migration and compatibility

The explicit development migration converts the earlier scalar `label` column to `labels` without changing definition IDs. Since the old model did not record the label language, preserve those values under `und` (undetermined); do not infer a language from their text. The known built-in `Keyword` default can be replaced with its fixed German/English translations. Known local sample labels are explicitly translated through the application afterward.

Old journal entries stay unchanged, including their historical scalar-label representation. Record data and physical record-column order stay unchanged. Repeating the migration must be safe. Initialization remains experimental; a versioned production migration strategy is still open.

The spike API now accepts `labels` objects instead of scalar `label` input for new object types and fields. This is a deliberate change to an unreleased experimental interface. Further definition categories and the frontend are outside this implementation.

## Verification

Integration tests cover API/MCP parity, label fallback, preference changes, fixed Keyword labels, invalid language/label input, append-only physical column order, journal rollback and a legacy-schema upgrade preserving records, IDs and historical journal rows. The existing field-conflict and denied-access tests remain applicable.
