# ADR 0020: Relationship tree and derived context

- Status: Accepted for the local prototype
- Date: 2026-11-02
- Extends: [ADR 0019](0019-record-relationships.md)

## Read model

`get_relationship_tree_branch` returns the requested record, its real Primary ancestors and one paginated level of connected records. UI, API and MCP use the same Administrator-only content authorization and workspace/endpoint checks. Reading a tree changes neither records nor journals and requires no schema migration.

Primary associations expand only from parent to child. An incoming Primary edge appears in the separate context path above the tree, never as an invented child. Other directed relationships appear in either direction with their side label and incoming/outgoing designation; undirected relationships appear from both ends. Primary children sort first, followed by cross references, with Keyword ordering under the effective workspace language and stable identity/edge tie-breakers. Parallel relationships remain separate, identifiable references to the same record.

The tree starts at the opened record. A Contact can show directly assigned Tasks beside its Projects; Projects show their Cases and direct Tasks; Cases show their own children. Missing levels are not synthesized. Other object types start at themselves and follow their actual relationships. Context derives from Primary edges rather than duplicated fields; general relationships and context do not grant rights. Inactive records/objects retain their readable identity and an explicit inactive indicator under existing permissions.

## Expansion, limits and accessibility

Load branches on demand, 25 edges at a time, with an explicit Load more control and server total/offset/limit. The API accepts up to 100 edges per page. It never recursively walks general relationship cycles. In the UI, an endpoint already in the current path is a terminal marked reference with a navigation link. The same record can appear on another path without being copied or silently removed. At 32 descendant levels, offer opening that record to continue. Context returns at most the nearest 32 ancestors and explicitly indicates when further ancestors exist.

Compose the tree from the existing shadcn Collapsible, Button, Badge and Breadcrumb primitives. Tree items use one roving Tab stop, Arrow Up/Down, Arrow Right/Left, Home/End, Space to toggle and Enter to open. Mouse users expand with the disclosure button and open a record through its Keyword. Preserve normal link actions and the application's unsaved/pending navigation guard. Branch loading, errors/retry, pagination and empty states remain visible. Branch caches are invalidated after record/relationship/definition saves and separated by interface language.

The Tree tab displays persisted data; drafts in Details appear after saving. The Dossier remains the flat list and the Journal remains immutable history. Module activation, independently required chain levels and production scaling of the prototype's workspace graph scans remain separate work.

## Validation

Integration coverage verifies real ancestor order, optional/missing levels, Primary descent, marked directed/undirected cross references, repeated identities, pagination, API/MCP parity, access denial, endpoint mismatch, retained inactive ancestors and absence of write/journal side effects. Browser checks validate expansion, path termination, navigation, keyboard focus and responsive rendering.
