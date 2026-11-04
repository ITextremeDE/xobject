# ADR 0021: Relationship scope and Projects activation

- Status: Accepted for the local prototype
- Date: 2026-11-03
- Updates: [ADR 0018](0018-relationship-type-definitions.md), [ADR 0019](0019-record-relationships.md)

## Scope

General relationship is always available and active for every object type. Primary association belongs to the Projects module and is available on all object types whenever that module is enabled in the workspace, including object types created later. Both system types use unrestricted object scope and have no explicit pair rows. Primary remains directed, optional and limited to one direct parent per record; existing cycle and transactional validation still apply. A globally mandatory parent would be incompatible with a finite acyclic hierarchy, so independently required chain sections remain a separate object-level design.

Each custom relationship has exactly one left and one right object type. It cannot be unrestricted or contain multiple pairs. Store the pair under the existing composite workspace foreign keys, with a unique index on relationship definition identity. The common API/MCP layer requires one pair atomically with definition creation/update. Translated side labels, direction and per-side cardinalities remain configurable. Undirected self-pairs require symmetric labels/cardinalities; disjoint endpoint roles can differ.

Once an edge has used a custom definition, retain its object pair and direction permanently, including after all current edges have been removed. Historical journal snapshots establish usage. The read projection exposes `pairLocked`; the editor disables those structural controls. This gives each definition a stable business meaning for future reporting. Existing edge storage already records definition, workspace and both object identities; no duplicate edge or record is needed.

## Module activation

`sys_workspace_modules` stores workspace-scoped Projects activation and optimistic version. `list_workspace_modules` is available to workspace members; `configure_workspace_module` requires a Designer or Administrator. Activation updates the protected Primary definition's availability in the same model-locked transaction and journals both changes under one change ID. No-op activation changes neither version nor journal. General cannot be disabled. Primary availability cannot be changed through its ordinary definition editor.

New workspaces start with Projects disabled. Its retained inactive system definition is hidden from the relationship editor/list of applicable record fields. Enabling Projects supplies the fixed Contact → Project → Case levels and exposes their eligible parent/child sides without maintaining object-pair lists. Disabling is rejected while any Primary edge remains, preserving data and context. After removing those edges, disabling hides the fields while retaining definition identity and history. Workspace Modules exposes an explicitly immediate Projects & Tasks checkbox; normal Users inspect module state read-only. Primary stays outside ordinary relationship-type administration.

The activation boundary and protected base-object installation are implemented. It does not provision complete Projects/Cases/Tasks templates, activate Contacts, adopt arbitrary custom definitions or implement the complete module update/deactivation lifecycle. Contact-person/main Organization remains assigned to future Contacts provisioning.

## Current installation

The current schema directly enforces the protected General/Primary meanings, one pair per custom definition and workspace-scoped endpoint identities. There is no adoption of earlier relationship schemas. New workspaces start with General available and Projects inactive; module activation supplies its fixed bindings and base objects atomically. Existing application links still prevent unsafe deactivation or incompatible rule changes.

## Validation

Integration tests cover new-workspace defaults, all-object availability including later object types, API/MCP parity, role/version boundaries, blocked deactivation with existing links, journal rollback, fixed historical object pairs, SQL pair uniqueness, current initialization and scoped constraints. Shared record cardinality, Primary cycle and tree tests continue to use the same definitions and data.

## Subsequent refinement

[ADR 0024](0024-primary-levels-and-relationship-conditions.md) adds fixed module-owned object-role bindings and ordering to the global Primary definition. Global availability applies to children of every object type; Primary parents come from the three fixed supplied levels. It also adds generic endpoint conditions, used for the local Contact-person/Organization and Identities definitions. Complete domain templates, cross-module ownership/update/adoption remain separate work; base-object provisioning is implemented as described below.

## Module catalog and base installation

The initial catalog contains the complete database-backed module definitions with the agreed descriptive names and planned/available status. Workspace Modules is the dedicated activation area. Projects & Tasks installs protected base Contacts, Projects, Cases and Tasks and fixed Contact → Project → Case UUID roles atomically. Contacts & Relations and Documents & Communication remain visibly planned; complete domain templates and shared module membership remain later work. Technical names supplied by any catalog module are reserved against custom creation through UI/API/MCP, including disabled and planned modules. Existing conflicting custom definitions are preserved and block activation without implicit adoption.
