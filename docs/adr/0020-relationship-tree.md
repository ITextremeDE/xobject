# ADR 0020: Relationship tree and derived context

- Status: Accepted for the local prototype
- Date: 2026-11-02
- Extends: [ADR 0019](0019-record-relationships.md)

## Read model

`get_relationship_tree_branch` returns the requested record, its real Primary ancestors and one paginated level of Primary descendants. The tree belongs to the Projects module; the operation rejects calls while Projects is disabled, consistently through API and MCP. UI, API and MCP use the same object/field/record authorization under ADR 0027 and workspace/endpoint checks. Inaccessible branches and ancestor links are excluded before counts/pagination. Reading a tree changes neither records nor journals and requires no schema migration.

Primary associations expand only from parent to child. An incoming Primary edge appears in the separate context path above the tree, never as an invented child. General and custom relationships remain in the Dossier and never generate tree branches, ancestor context or expandable-child indicators. Children sort by Keyword under the effective workspace language, with stable identity/edge tie-breakers. A parallel General/custom edge does not duplicate a Primary child.

The tree starts at the opened record. A Contact can show directly assigned Tasks beside its Projects; Projects show their Cases and direct Tasks; Cases show their own children. Missing levels are not synthesized. Other object types start at themselves and show only actual Primary descendants; as terminal children they can still display their Primary ancestor context. Context derives from Primary edges rather than duplicated fields; general relationships and context do not grant rights. Inactive records/objects retain their readable identity and an explicit inactive indicator under existing permissions.

## Expansion, limits and accessibility

Load branches on demand, 25 edges at a time, with an explicit Load more control and server total/offset/limit. The API accepts up to 100 edges per page. It never traverses general/custom relationships. In the UI, an endpoint already in the current path is a terminal marked reference with a navigation link. The same record can appear on another path without being copied or silently removed. At 32 descendant levels, offer opening that record to continue. Context returns at most the nearest 32 ancestors and explicitly indicates when further ancestors exist.

Compose the tree from the existing shadcn Collapsible, Button, Badge and Breadcrumb primitives. Tree items use one roving Tab stop, Arrow Up/Down, Arrow Right/Left, Home/End, Space to toggle and Enter to open. Mouse users expand with the disclosure button and open a record through its Keyword. Preserve normal link actions and the application's unsaved/pending navigation guard. Branch loading, errors/retry, pagination and empty states remain visible. Branch caches are invalidated after record/relationship/definition saves and separated by interface language.

The Tree tab is shown only while Projects supplies the fixed Primary chain. Disabling Projects removes it and returns an open tree view to Details. The Tree tab displays persisted data; drafts in Details appear after saving. The Dossier remains the flat list and the Journal remains immutable history. Independently required chain levels and production scaling of the prototype's workspace graph scans remain separate work.

## Compact presentation and bulk expansion

Use a compact Explorer row with aligned disclosure/icon/Keyword, a muted object label and a right-aligned status caption. The status is projected through the same batched field-right resolver as the Dossier, including record-level ceilings; hidden status values and option labels are omitted. Ancestor context remains a compact Breadcrumb. Repeated Primary badges are unnecessary in this Primary-only view. Initial and branch placeholders match the compact row layout.

The toolbar has Expand all, Collapse all and keyboard help. Expand all sequentially loads remaining pages and reachable Primary branches into the existing language-scoped query cache, preserving immutable cache pages. It follows the viewer's depth/path boundaries, exposes pending/cancel and reports retryable errors. Cancellation or navigation ignores late responses; already loaded branches remain available. Manual branch toggling also stops bulk expansion. Collapse all cancels pending expansion, closes branches and returns the roving focus to the root. Ordinary context responses stay independent of Tree status presentation.

## Validation

Integration coverage verifies real ancestor order, optional/missing levels, Primary descent, exclusion of directed/undirected/general cross references, exclusion of duplicate parallel edges, pagination, module activation/deactivation gating, API/MCP parity, access denial, endpoint mismatch, retained inactive ancestors and absence of write/journal side effects. Browser checks validate expansion, path termination, navigation, keyboard focus and responsive rendering.
