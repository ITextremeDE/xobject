# Documentation and architecture

The [PRD](PRD.md) is the product authority: requirements, terminology, agreed behavior and remaining design decisions. It distinguishes target behavior from implemented slices. [Local development](development.md) owns setup, current commands/contracts, safe database operations and the dated validation snapshot. [Demo data](demo-data.md) describes the versioned fictional seed, not the contents of every development database. [Website](website.md) describes the independent Astro site.

The root [changelog](../CHANGELOG.md) records notable source changes; the [roadmap](../ROADMAP.md) is a curated product overview. OpenProject owns detailed work, priorities and publication evidence. Release or deployment status must not be inferred from a local ADR or passing source build.

## Architecture decisions

ADRs record decisions and their evolution. A later refinement supersedes only the explicitly affected part, preserving unrelated earlier decisions. “Accepted” is a decision status; it does not by itself mean release delivery or passing current acceptance. Validation paragraphs record the slice's checks, not a promise that the present working tree is green.

| ADR | Subject | Current reading |
| --- | --- | --- |
| [0001](adr/0001-readable-workspace-table-names.md) | Readable physical names | Implemented naming; installation/concurrency specified in 0022. |
| [0002](adr/0002-backend-technical-spike.md) | Backend evaluation | Stack/auth/application boundary; later ADRs extend the initial slice. |
| [0003](adr/0003-localized-labels-and-column-order.md) | Labels and physical order | Language policy refined by 0012; optional standards by 0006. |
| [0004](adr/0004-first-web-interface.md) | First frontend and routes | Typed fields, roles, content grants and page behavior refined later. |
| [0005](adr/0005-public-website-design-system.md) | Astro site design | Independent from application/release delivery. |
| [0006](adr/0006-record-classification.md) | Keyword/Type/Status/Category | Optional installation, dictionaries, requiredness and ordering. |
| [0007](adr/0007-custom-field-types.md) | Typed fields/conversion | Regional handling refined by 0014; applicability by 0023. |
| [0008](adr/0008-workspace-roles.md) | Administrator/User/Designer | Configuration roles; content rights remain separate. |
| [0009](adr/0009-definition-lifecycle.md) | Definition lifecycle | Implemented; record recycling/restoration is separate under ADR 0029. |
| [0010](adr/0010-account-security.md) | Own password/sessions | Instance provisioning refined by 0015. |
| [0011](adr/0011-workspace-appearance.md) | Shared appearance | Workspace tokens/previews; browser mode remains personal. |
| [0012](adr/0012-workspace-languages.md) | Installed/available languages | Interface and definition policy, retained preferences. |
| [0013](adr/0013-workspace-groups.md) | Direct group membership/lifecycle | Graded/nested membership extends this in 0027. |
| [0014](adr/0014-time-zones-and-regional-display.md) | Time zones/regions/input | Exact values and guarded format transitions. |
| [0015](adr/0015-instance-administration-and-journal.md) | Instance users/system journal | Shared Journal presentation refined by 0023. |
| [0016](adr/0016-dashboard-and-shared-table-navigation.md) | Dashboard/tables/command menu | Current content policy from 0027 applies to all projections. |
| [0017](adr/0017-record-pages-and-local-demo-data.md) | Record pages and seed | Groups/order refined by 0025; linked source return by 0019. |
| [0018](adr/0018-relationship-type-definitions.md) | Initial definition-only slice | Historical scope refined by 0019, 0021 and 0024; not current module/edge limitations. |
| [0019](adr/0019-record-relationships.md) | Record edges and linked creation | One custom pair, cardinality fields/tables and atomic creation. |
| [0020](adr/0020-relationship-tree.md) | Primary tree/context | Projects-only read model; General/custom links stay in Dossier. |
| [0021](adr/0021-relationship-scope-and-projects-module.md) | Scope and activation | Fixed roles refined by 0024, catalog/base installation by 0025. |
| [0022](adr/0022-database-integrity-and-concurrency.md) | Versions/locks/installation/roles | Local storage safeguards; release packaging remains open. |
| [0023](adr/0023-record-journal-and-conditional-fields.md) | Journal/applicability | Current-rights projections refined by 0026 and 0027. |
| [0024](adr/0024-primary-levels-and-relationship-conditions.md) | Fixed Primary roles/conditions | Protected supplied UUID roles, conditional endpoints. |
| [0025](adr/0025-modules-and-form-views.md) | Module catalog and forms | Standard forms/base installation implemented; full domain/shared-module views remain open. |
| [0026](adr/0026-content-permissions.md) | Object/field ceilings | Current object/field grants; record policy in 0027. |
| [0027](adr/0027-ownership-and-foreign-access.md) | Ownership and foreign access | Local graded ownership/membership, privacy, foreign paths, Create and record security UI; calendar/notifications later. |
| [0028](adr/0028-current-installation-baseline.md) | Current unreleased installation | One empty installation definition, explicit local reset, schema fingerprint and current contracts without compatibility paths. |
| [0029](adr/0029-record-recycle-bin.md) | Record recycle bin | Versioned recycling/restoration, retained edges and current-rights inspection; permanent erasure remains pending. |
| [0030](adr/0030-field-input-rules-and-business-numbers.md) | Input rules and numbering | Translated field explanations, typed creation defaults, scalar uniqueness and transactional business numbers. |

## Ownership of repeated information

Requirements and permission precedence belong in the PRD, concrete implemented architecture in the applicable ADR, operation schemas/types in [shared contracts](../packages/contracts/src/index.ts), and operator commands in the development/website guides. Summaries should link those authorities rather than introduce competing rules. Tests and their code are evidence for behavior; source changes are not proof of a production release.

The full application, including Premium code, remains `AGPL-3.0-only`; [licensing](../README.md#licensing-and-commercial-model) and [LICENSE](../LICENSE) govern that statement. Planned documents, release images, external credentials, email/upload facilities and hosted/native clients must not be presented as already delivered.
