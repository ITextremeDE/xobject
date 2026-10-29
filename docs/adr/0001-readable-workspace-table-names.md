# ADR 0001: Readable workspace-prefixed table names

- Status: Accepted design; not implemented
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
- The complete generated identifier must fit PostgreSQL's identifier limit. Constraints and indexes also need a collision-safe naming strategy during implementation.

## Alternatives considered

- **UUID-derived physical names:** stable, but rejected because they are difficult to read.
- **A schema per workspace:** provides a separate namespace, but readable table prefixes were selected instead. Additional database-level isolation remains a separate design decision.

## Unresolved implementation details

The schema-change execution mechanism, concurrency/locking behavior, physical access isolation and storage for collections and references remain open. This decision does not select a backend framework, database library or authentication library.
