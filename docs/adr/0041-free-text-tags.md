# ADR 0041: Free-text Tags

- Status: Accepted
- Date: 2026-11-13
- Requirement: [R-066](../PRD.md#free-text-tags--v1-extension)

## Decision

Add the general `tags` field kind as a nullable PostgreSQL `text[]`, with the optional reserved standard field `tags` in Classification. Tags are record values, not classification option identities. Normalize NFC and whitespace; discard case-insensitive duplicates, retain first spelling/order and bound collections to 100 entries of 200 characters. The ordinary typed writer owns defaults, requiredness, field access, optimistic versions and atomic per-field journal events. Nonempty cross-kind conversions reject semantic loss.

Reuse the installed shadcn/Base UI multiple Combobox and chips for entry and the common searchable selection dialog for filtering. `list_field_tags` returns at most 100 distinct visible values plus `hasMore`, supports search and applies current record/field policy before enumeration. `list_records.tagFilters` uses field UUIDs and values: OR within a field, AND between fields and existing criteria; null explicitly selects no tags. Field access predicates also guard empty-value filters. Lists preserve criteria in URLs.

Supplied module catalog versions advance additively. Dedicated maintenance tooling accepts exact supported released fingerprints, updates the field-kind constraint/catalog and adds missing module Tags using the ordinary definition writer. Existing form groups remain; Tags join the group containing classification fields or a new Classification group. Conflicting reserved technical definitions cause a full rollback. Runtime startup accepts only the current schema/catalog.

## Consequences

Tags need no separate dictionary or translation tables. Suggestions reflect current readable active contents rather than a persistent vocabulary, so unused/recycled-only values disappear. Requiredness/defaults remain configurable. Custom tag fields can move in the designer. Bounded query parameters and policy-first SQL protect disclosure and counts; very large datasets may later justify measured indexing, without introducing an unneeded search service now.
