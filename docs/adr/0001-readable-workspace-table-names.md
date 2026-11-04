# ADR 0001: Readable workspace-prefixed table names

- Status: Accepted; implemented for the local prototype
- Date: 2026-10-29

## Context

Workspaces own independently configurable object types. The same object type name may occur in different workspaces, with different fields. Database names should be understandable when inspecting or operating an installation. UUID-derived table and column names would make this harder.

## Decision

Use the workspace's user-selected technical code as a table prefix, rather than creating a database schema per workspace. For example, the workspace **ITextreme** can use code `itx` and own tables `itx_contacts`, `itx_projects` and `itx_vehicles`. Reserve `sys_` for installation-wide system tables.

Use readable English technical names for object types and fields. Retain immutable UUIDs as the internal identities of workspaces, definitions and records. Display labels can change independently. Workspace codes and technical names remain fixed after creation in version 1.

The normative naming, uniqueness and validation rules are specified in [PRD section 3.1](../PRD.md#31-workspace-codes-and-technical-names).

## Consequences

- Operators can recognize tables and columns without decoding UUIDs.
- Workspace codes prevent object table name collisions between workspaces; forbidding underscores in codes makes the prefix boundary unambiguous.
- Changing a display label does not require a database migration or change journal references.
- Module activation must detect technical name conflicts and must use definition identities to recognize shared types.
- Table prefixes organize names; they do not implement workspace access control.
- A future technical rename needs an explicitly designed migration process. It is outside version 1.
- The complete generated identifier must fit PostgreSQL's identifier limit. ADR 0022 supplies stable identity suffixes for generated pagination indexes to avoid truncation collisions.

## Alternatives considered

- **UUID-derived physical names:** stable, but rejected because they are difficult to read.
- **A schema per workspace:** provides a separate namespace, but readable table prefixes were selected instead. Additional database-level isolation remains a separate design decision.

## Subsequent implementation decisions

Transactional schema changes and the evaluated stack are specified in [ADR 0002](0002-backend-technical-spike.md); typed collections/references in [ADR 0007](0007-custom-field-types.md); current installation, scoped locks and runtime/operator isolation in [ADR 0022](0022-database-integrity-and-concurrency.md). Release packaging and production-scale acceptance remain open. This naming decision does not itself select those mechanisms.
