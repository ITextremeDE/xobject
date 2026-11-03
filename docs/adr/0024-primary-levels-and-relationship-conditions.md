# ADR 0024: Primary levels and relationship endpoint conditions

- Status: Accepted for the local implementation
- Date: 2026-11-03
- Extends: [ADR 0019](0019-record-relationships.md), [ADR 0021](0021-relationship-scope-and-projects-module.md) and [ADR 0023](0023-record-journal-and-conditional-fields.md)

## Decision

Bind Address/Contact, Project and Case roles to three different active object UUIDs in the workspace. `sys_primary_chain_levels` stores these roles with composite workspace foreign keys; the Projects module version guards updates. `configure_primary_chain` uses the common configuration authorization, workspace lock, graph preflight and atomic per-role journal entries. A changed assignment also advances the Primary definition version so stale record drafts cannot silently use a new model. Bound object types cannot be deactivated/deleted before their assignment changes.

Primary is globally available for child records. With configured levels, an Address is a root, a Project may belong to an Address, a Case may belong to an Address or Project, and any other object may belong to one of the three levels. Levels in individual record paths may be absent. The existing direct-parent uniqueness and cycle checks remain authoritative. Candidate filtering applies the role rules before counts/pagination; all writes use the same rule. Configuring levels rejects existing edges that violate this order. Existing unconfigured workspaces keep their generic graph data until explicit role assignment; the form requests configuration rather than guessing roles or displaying invented levels.

Record Details shows the available levels as a single chain of single-value InputGroups. Earlier levels are inherited and read-only; only the direct relationship is persisted. A level-specific selection dialog can replace the direct association with a more specific level. To move to an earlier direct level, clear the current direct association first. `get_primary_chain_context` resolves persisted or proposed direct parents through the shared content authorization and real graph. It does not write journals or copy ancestor values. Explicit custom relationships use one table per applicable definition under ADR 0019. General links are edited from the record-header action; General links and subordinate Primary records are listed in the Dossier.

Custom relationship definitions may constrain each endpoint using the same unconditional single-choice controller/option identities as field applicability. Conditions belong to the corresponding object pair; symmetric endpoints require equivalent conditions. The common API/MCP validates definitions, preflights existing edges and filters candidates before pagination. Final record writes validate retained edges even when only a discriminator field changes. Incompatible links must be explicitly removed; values and connections are never silently cleared. Controller fields/options cannot be removed or converted incompatibly while referenced.

The definition editor reuses one applicability component for fields and relationship endpoints, with unique control IDs. The Contact fixture configures Organization → Contact person with a maximum of one Organization per Contact person. Identities is a symmetric multiple relationship among Contact persons and Individual contacts. It is a direct list on Contacts, with no Identity object type and no inferred transitive grouping. These are regular configured rules, not runtime branches based on object names. Full CRM module templates, supplied-definition ownership, derived Keywords and dependent company/name requirements remain separate work.

## Migration and identity handling

Migration 4 is additive. Preserve business rows, edges, authentication and original history; apply existing development configuration through normal operations after verifying a restored copy and the fixture manifest UUIDs. Keep the original numbered migration behavior independent of newer read projections. Normal operator/runtime-role separation applies to the new table. Shared UUID schemas canonicalize identity spelling at channel boundaries, keeping technical/display names and arbitrary content separate.

## Verification

Integration tests cover API/MCP context parity, inherited and skipped levels, identity spelling, candidate restrictions, stale versions, foreign/duplicate roles, preflight rollback, object lifecycle and content access. Endpoint tests cover conditional candidates, incompatible target rejection, scalar-change rollback, controller protection and symmetric Identities links. Browser acceptance covers derived drafts, Reset, correct Contact-kind visibility, selection restrictions, configuration guards, keyboard interaction and narrow layouts. Local development migration retains the existing business records, edges and original content journals; no publication or release is implied.
