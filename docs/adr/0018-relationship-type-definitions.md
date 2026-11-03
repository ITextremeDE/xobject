# ADR 0018: Relationship type definitions

- Status: Accepted for configuration in the local prototype
- Date: 2026-11-02

## Original decision

[ADR 0021](0021-relationship-scope-and-projects-module.md) supersedes the original multi-pair/unrestricted custom scope and independent Primary provisioning below. General is now always active; Primary is unrestricted and gated by Projects activation; custom definitions have one pair. The following records the initial configuration design.

Keep workspace-owned relationship definitions in `sys_relationship_types`. Store permitted ordered object pairs in `sys_relationship_type_pairs`; composite foreign keys include workspace identity for both endpoint objects and the owning relationship type. An allowed pair is schema metadata, not a connection between records. Object definitions referenced by pairs cannot be deleted; removing a pair does not delete records or history. Inactive objects remain readable in retained pairs, but cannot be newly assigned to a definition.

For the current prototype, supply two system definitions per workspace independently of future module activation. Creation/migration installs them idempotently with journal evidence. The reserved technical names and system meanings cannot be changed through API/MCP:

- `primary_association`: directed, parent on the left / child on the right, `0..n` children per parent and at most one direct parent per child. Parent optionality (`0..1`/`1..1`) and explicit allowed object pairs can be configured. No pair initially means no eligible target pairing; it never means unrestricted.
- `general_relation`: undirected, `0..n` on both sides, for all object types. Side labels are symmetric.

Custom definitions have an immutable readable technical name, translated definition/side labels, directed/undirected flag, independent per-side minima (`0` or `1`) and maxima (`1` or unlimited), explicit allowed pairs or an unrestricted flag, availability and optimistic version. Cardinality counts direct neighbours on each side, not inherited ancestors. Left-side labels describe what the left record calls its connected right records, and conversely. With non-overlapping endpoint object types, undirected relationships may retain distinct roles/cardinalities. With overlapping endpoint sets, including unrestricted undirected relationships, require identical side labels and cardinalities so record orientation cannot arbitrarily determine meaning. Reject reversed duplicate undirected object pairs.

Use one shared API/MCP application layer under the existing model lock. Workspace Users read definitions; Designers and installation Administrators configure them. Version checks, structural protection, workspace/state/language validation, pair updates and one journal event per changed property share a transaction. No-op writes add no events or version increments. Own definitions may be deactivated; no hard-delete operation is introduced. System defaults remain available. Retain unavailable translations read-only under the existing language policy.

## Future module ownership

General relationship remains in the application core. The Contact-person / main Organization relationship belongs to the future Contacts module; Primary association belongs to the future Projects module. The local `contact_person` fixture is currently a custom prototype definition, not an installed protected Contacts definition. Primary association is currently a protected prototype default, not evidence of an active Projects module.

Implement provisioning, supplied-definition protection, updates/deactivation and conflict-safe adoption when module management is introduced. Preserve existing definition identities, record links and journals during that transition; never claim ownership from a matching technical name alone. No module activation or ownership flag is introduced by this slice.

## Original staging boundary

The following describes the initial definition-only slice. [ADR 0019](0019-record-relationships.md) extends it with explicit activation, record edges, count checks, journal projections and record controls. Tree navigation and derived ancestor display remain outstanding.

### Initial scope

These definitions are explicitly stored/exposed as `rulesState: draft` (`rules_state` in PostgreSQL). Availability is independent of constraint activation. This slice configures future relationships; it introduces no record-edge table, record linking API, Primary selector, permissions inheritance, dossier or tree. Existing record writes remain unchanged. Minimum-one configurations are therefore saved drafts, not silently activated constraints over the current data.

Before activation, the relationship engine must specify record identity/foreign-key storage, direct edge uniqueness and self/cycle rules, global Primary uniqueness across all permitted object pairs, transactional minimum/maximum checks, concurrency-safe preflight of all affected existing records (R-023), endpoint deletion/lifecycle policy, journalled edge operations and object-specific required-chain rules. A configured `1..1` applies to the right-side scope of the definition; it does not yet implement independently required ancestor levels.

## UI and validation

Workspace Settings has an alphabetical searchable/paginated Relationship types table and one responsive create/edit dialog. Side labels/cardinalities are adjacent on desktop and stacked on mobile. Symmetric values mirror from the left; immutable system controls are read-only. The same draft/pending/conflict guards and action placement as existing definition editors apply.

Isolated PostgreSQL tests cover API/MCP parity, system defaults/protection, workspace User/Designer boundaries, direct composite foreign-key checks, duplicate/symmetric pairing rules, reserved names, optimistic/no-op behavior, rollback on journal failure, translation policy and repeat migration. Existing content access remains Administrator-only. Local fixture pairs prepare Contacts → Projects → Cases → Tasks, plus direct Contact/Project Tasks and a directed Contact-person relationship; they do not apply the separately stored record-link plan.

## Cardinality presentation

The settings list and editor display one conventional left:right cardinality (`1:1`, `1:n`, `n:1`, `n:m`) following the selected object-pair order. The left endpoint maximum counts right records, so `1:n` maps to `leftMax = null` and `rightMax = 1`. Each endpoint minimum remains a separate required-link setting with the object name; symmetric undirected relationships share one minimum and offer only `1:1` or `n:m`. Existing normalization, permissions, applicability, rule activation and protected system limits remain authoritative. This is a UI projection of the existing contract, with no schema migration or stored-data rewrite.
