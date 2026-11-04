# ADR 0029: Record recycle bin and restoration

- Status: Accepted; recycle/restore implemented in the local prototype
- Date: 2026-11-04
- Complements: [ADR 0019](0019-record-relationships.md), [ADR 0027](0027-ownership-and-foreign-access.md) and [ADR 0028](0028-current-installation-baseline.md)

## Decision

Store nullable `recycled_at` and `recycled_by` together on the existing composite record registry identity. Do not add business columns, copy contents or move records into another table. The original row, UUID, fields, security policy, edges and immutable journal remain intact. There is no automatic expiration or purge.

`recycle_record` requires current Delete access; `restore_record` requires current Full access. Both require an active object type and the opened record version. They increment that record's version once, update last-change metadata and write one `lifecycle` event in the same transaction. Linked records are neither recycled nor versioned. Concurrent/stale writes cannot silently succeed, and journal failure rolls back the complete action.

Normal policy predicates exclude recycled identities before search, counts, sorting and pagination, including Administrator queries. Normal record opening, modification, security changes, duplication, linked creation and relationship selection reject recycled records. Workspace recycle-bin reads use the same current object/record/field permissions and workspace isolation. They include inactive object types so retained records cannot become stranded by deactivation; restoring requires reactivating the object first.

`list_recycled_records` provides a paginated, searchable, sortable standard-column view. `get_recycled_record` inspects retained values without permitting edits. Explicit `list_record_journal.includeRecycled` allows authorized retained-history inspection; it does not bypass current field or endpoint rights. The web bin has its own workspace route, search shortcut, object filter, shared table/selection/pagination and read-only Details/Journal dialog. The bin is also available in Command-K navigation. Its read-only preview reuses the standard form group surfaces, translated headings, configured order/widths and Unassigned section. Current applicability and field visibility apply; inactive retained fields are disclosed separately. The dialog uses the shared action footer and blocks navigation while restoration is pending. Normal record forms offer confirmed recycling only while clean; the bin offers confirmed restoration only with Full access and an active type.

## Relationships and validation

Retained edges continue reserving their cardinality slots. They count in definition activation/preflight and lifecycle dependency checks; disappearing from UI must not make the slot available for a conflicting new connection. Normal Dossier/tree projections omit unavailable endpoints. Primary fields retain their restricted marker and show a generic unavailable association without exposing the recycled/restricted parent's identity. Children remain active and retain the same version.

Restoration validates current active fields, requiredness, classification and applicability without changing their stored values, then validates the record's retained relationship pairs, conditions, cardinalities and Primary rules. Invalid restoration fails atomically; no edges or values are silently removed or remapped. Other recycled endpoints remain unavailable until independently restored. Whole-workspace unrelated relationship scans are not required for this operation; existing write/definition validation continues enforcing the retained graph.

## Boundaries and verification

R-038 is implemented locally; the restore portion of R-039 is implemented. Confirmed permanent deletion and R-040 content-history erasure remain separate design/implementation work. No permanent-delete endpoint, journal rewriting or background cleanup is introduced here. Ordinary journal immutability and the runtime database role remain unchanged.

Isolated PostgreSQL tests cover normal-query exclusion, API/MCP parity, retained contents/edges/history, Primary children, reserved one-to-one slots, field redaction, current Delete/Full access, revocation, workspace isolation, inactive definitions, invalid restoration, optimistic races and journal-failure rollback. Dated current validation evidence is in the [development guide](../development.md#recorded-local-verification--2026-11-04). This is local prototype acceptance, not release or physical-device acceptance.
