# ADR 0026: Object and field content permissions

- Status: Accepted
- Date: 2026-11-04

## Decision

Workspace roles govern configuration; they do not grant business-content access. Active installation-wide Administrators retain all content access, including Personal/Confidential records, while validation, immutable journals and protected-definition rules remain enforced. Personal account security remains owner-scoped.

`sys_content_grants` stores workspace-user/group object ceilings, separate Create flags and field exceptions by stable identities. Active groups contribute additive grants; explicit user settings replace the corresponding group result. Missing user Create inherits group Create. Object Edit never implicitly grants Create. Field levels are None, Read and Edit and remain bounded by object and record rights. [ADR 0027](0027-ownership-and-foreign-access.md) defines sensitive-record ownership, privacy and foreign inheritance.

## Shared enforcement

The common application transaction resolves current actor-bound policies for UI/API/MCP. No policy cache outlives a transaction. Membership, activation and grant changes affect subsequent calls in an existing session. Every content projection uses these policies before search, sorting, filtering, counts and pagination. Hidden field values are omitted; Keyword uses the record identity when hidden. Restricted sort fields are rejected. Dashboard, relationship candidates, Dossier, Primary context/tree and immutable historical values use current rights.

Partial updates retain unreadable fields and unavailable relationships. Explicit writes still require permission even for guessed no-op values. Required input, applicability and safe conversion rules remain enforced. Relationship writes require the source capability and readable changed opposite endpoints/controllers; initial links use Create on the new focus. Relationships and assignment references confer no rights.

Object settings save labels and sensitivity atomically with both expected versions. Only Administrators manage ceilings and sensitivity; disabling sensitivity requires explicit widening confirmation. Security metadata is retained across this valid business setting change. Group/member removal, grant changes and every security property are journaled atomically. Settings use shared Select/Field/table primitives, fixed save/reset actions, keyboard handling and dirty guards.

## Current delivery boundary

The [current installation](0028-current-installation-baseline.md) creates these structures directly. Sensitive Access principals are virtual and come from the single record-security policy, never a second business-table list. Production credentials, representative-volume scaling, record erasure (recycling/restoration is implemented under ADR 0029), notification delivery and calendar projections remain separate work. The dated [development verification](../development.md#recorded-local-verification--2026-11-04) records local evidence without implying release publication.
