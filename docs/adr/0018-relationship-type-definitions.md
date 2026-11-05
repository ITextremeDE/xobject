# ADR 0018: Relationship-type definitions

- Status: Accepted
- Date: 2026-11-04

## Decision

The current schema stores workspace-scoped relationship definitions with stable UUIDs, immutable readable technical names, translated definition/side labels, direction, endpoint minima/maxima, availability, draft/active rules and optimistic versions. Custom definitions have exactly one object pair in `sys_relationship_type_pairs`. Composite workspace/object foreign keys and a unique definition index enforce that scope. Used pairs/direction remain fixed; labels and compatible configuration remain editable. Referenced definitions cannot be removed while dependencies remain.

General is an always-active symmetric core relationship for every object type. Primary is directed, owned by Projects and available only while that module is active. Its fixed Contact/Project/Case parents come from module-object bindings. System names and meanings are protected. New workspaces receive the current definitions directly. Contacts activation supplies Organization membership with at most one Organization per Contact person under ADR 0025; generic conditional fixtures remain separate from module delivery.

[ADR 0021](0021-relationship-scope-and-projects-module.md) specifies scope/activation, [ADR 0024](0024-primary-levels-and-relationship-conditions.md) fixed roles and endpoint conditions, [ADR 0019](0019-record-relationships.md) record edges and [ADR 0020](0020-relationship-tree.md) Primary tree/context. The current installation is defined in [ADR 0028](0028-current-installation-baseline.md).

## Authorization and changes

Workspace Users inspect definitions; Designers and installation Administrators configure them. UI/API/MCP share the application transaction, expected versions, scope/state/language checks and structural protection. Journal each changed property under one change ID. A failure rolls back the entire mutation; no-ops create no events or versions. Availability and rule activation are distinct. Activating or tightening rules preflights affected records under the model/workspace barriers; no existing edge may become invalid silently.

## Cardinality and editor

Cardinality counts direct neighbours, not inherited ancestors. A left label describes the connected right records from the left record's perspective, and conversely. Disjoint undirected object roles retain distinct labels/cardinalities; symmetric same-object relationships share side semantics and canonical edge orientation. Reject self-links and reversed duplicates.

The shared editor lives inside the Relationship types settings section, with a guarded Back action and Save/Reset in the common settings footer. Field attributes open one child dialog, retaining dirty/pending guards and focus return. It starts with object pair/direction, then applicable side labels and technical identity. It displays one conventional left:right cardinality (`1:1`, `1:n`, `n:1`, `n:m`) and separate required-link controls. `1:n` means an unlimited left-endpoint neighbour maximum and a right-endpoint maximum of one. Symmetric relationships offer only `1:1` or `n:m` and one required-link setting. Irrelevant controls are hidden; protected values are read-only. Separate mode drafts preserve intentional input without changing persisted rules until Save.

## Verification and boundary

Current PostgreSQL tests exercise pair uniqueness, workspace isolation, system protection, expected versions, activation preflight, journal rollback, final-state cardinalities and identity stability. Editors use shared shadcn fields/selectors/actions with pending/dirty guards and keyboard access. Contacts and Distribution lists are locally accepted under ADR 0025; independently required Primary ancestor sections remain a separate requirement; current record linking and tree navigation are implemented.
