# ADR 0040: Bounded journal and relationship readers

- Status: Accepted; delivered in Community 1.6.0
- Date: 2026-11-13
- Extends: [ADR 0019](0019-record-relationships.md), [ADR 0039](0039-bounded-permission-queries-and-creation-retries.md)

## Context

A ten-row Journal or relationship table must not hydrate the entire history or all linked records. Previously, application-side filtering and complete relationship drafts caused work and response size to grow with the number of events and targets. Existing current/frozen historical rights, shared writers, optimistic versions and immutable events remain requirements.

## Decision

Use focused read services inside the existing application transaction. The Journal SQL reader applies current record/field rights, frozen deletion eligibility and deletion-notice projection before distinct counting and paging. Only the requested page reaches the canonical historical redactor and value-context projector. Stored journal values are unchanged.

`get_record_relationships` retains its complete default result for released clients. Its optional `view: summary` returns definitions, authorized counts and maximum-one targets. Saved to-many fields are marked `paged: true`; an empty target array in that response is not a replacement draft. Primary context remains separate.

`get_record_relationship_page` exposes permission-filtered search, sort, count and page through REST and MCP. Target records are authorized before counting; only page-local references and attributes are hydrated. Its object-filter choices describe permitted incident target types independently of the selected page, search or object filter. Field-level restrictions also apply to search/sort and professional summaries.

Sparse relationship edits use `mode: patch`, new `targets` and explicit `remove` references. The shared writer merges them with current retained edges, then applies existing permissions, applicability, final cardinalities, optimistic versions and atomic journals. It captures before-snapshots only for removed edges. Complete replacement remains available. A stale source/definition version is a conflict; removal of an already absent link is a no-op after the client has reviewed the new source version.

The web client keeps saved pages separate from local additions, removals and attribute drafts. Pending additions appear first until Save. Reading pages never adds them to the complete replacement baseline. Relationship details use the common attribute editor and remain part of the record draft. Discard and reviewed remote adoption retain their explicit meanings.

A small draft-pair reducer groups each value with its baseline and makes remote adoption explicit. Settings section, workspace and selected object are URL-addressable; known-section and Administrator guards remain in the UI, with backend authorization unchanged.

The Vite build and browser acceptance harness share a source fingerprint. Browser acceptance refuses missing or stale assets before starting test infrastructure. Current installation instructions are checked against the newest Changelog release when preparing public documentation and release artifacts; historical upgrade examples remain independent.

## Consequences

Page hydration/query counts and network payloads are bounded by page size and participating metadata, rather than total linked records/events. SQL count/filter/sort still processes eligible database rows; this is not a constant-time database or production-capacity claim. Larger installations may need measured indexing or query-plan improvements.

The additional API operation is additive under API 1.0.0. No schema migration, replacement permissions engine, new frontend framework or database technology is required. Native accessibility behavior supplied by Base UI is retained unless a reproduced native failure justifies an upstream-compatible correction.
