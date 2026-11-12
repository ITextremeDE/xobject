# Documentation and architecture

The [PRD](PRD.md) is the product authority: requirements, terminology, agreed behavior and remaining design decisions. It distinguishes target behavior from implemented slices. [Local development](development.md) owns setup, current commands/contracts, safe database operations, reproducible verification and public CI evidence. [Demo data](demo-data.md) describes the versioned fictional seed, not the contents of every development database. [Website](website.md) describes the independent Astro site.

The [domain-profile appendix](domain-profiles.md) owns detailed proposed starting fields, relationship pairs and per-profile acceptance for the PRD catalog. It distinguishes agreed product rules, new starter proposals and unresolved implementation contracts; it is not a second roadmap or a claim of delivered templates.

The root [changelog](../CHANGELOG.md) records notable source changes; the [roadmap](../ROADMAP.md) is a curated product overview. OpenProject owns detailed work, priorities and publication evidence. Release or deployment status must not be inferred from a local ADR or passing source build.

[How xObject fits together](concepts.md) introduces the model and vocabulary. [Using xObject](user-guide.md), [Contacts](contacts.md) and [Projects and Tasks](projects-and-tasks.md) own daily UI workflows. [Workspace settings](workspace-settings.md), [object and field design](model-design.md), [field types](field-types.md), [relationships](relationships.md), [forms](forms.md) and [access administration](access-administration.md) own configuration guidance. [Self-hosting and recovery](self-hosting.md) owns installation/maintenance commands. [Public documentation](public-documentation.md) describes the generated Starlight source and checks.

[API and MCP access](api.md) describes user-owned tokens, management, transport/version/error contracts, the typed client and retained-history access.

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
| [0011](adr/0011-workspace-appearance.md) | Shared appearance | Workspace tokens/previews; browser mode remains personal; live-refresh refinement in 0036. |
| [0012](adr/0012-workspace-languages.md) | Installed/available languages | Interface and definition policy, retained preferences. |
| [0013](adr/0013-workspace-groups.md) | Direct group membership/lifecycle | Graded/nested membership extends this in 0027. |
| [0014](adr/0014-time-zones-and-regional-display.md) | Time zones/regions/input | Exact values and guarded format transitions. |
| [0015](adr/0015-instance-administration-and-journal.md) | Instance users/system journal | Shared Journal presentation refined by 0023. |
| [0016](adr/0016-dashboard-and-shared-table-navigation.md) | Dashboard/tables/command menu | Current content policy from 0027 applies to all projections. |
| [0017](adr/0017-record-pages-and-local-demo-data.md) | Record pages and seed | Groups/order refined by 0025; linked source return by 0019. |
| [0018](adr/0018-relationship-type-definitions.md) | Relationship definitions | Current pairs, cardinalities and editor; record edges in 0019, module scope in 0021 and conditions in 0024. |
| [0019](adr/0019-record-relationships.md) | Record edges and linked creation | One custom pair, cardinality fields/tables and atomic creation. |
| [0020](adr/0020-relationship-tree.md) | Primary tree/context | Projects-only read model; General/custom links stay in Dossier. |
| [0021](adr/0021-relationship-scope-and-projects-module.md) | Scope and activation | Fixed roles refined by 0024, catalog/base installation by 0025. |
| [0022](adr/0022-database-integrity-and-concurrency.md) | Versions/locks/installation/roles | Storage safeguards; released container delivery and maintenance are covered by 0035. |
| [0023](adr/0023-record-journal-and-conditional-fields.md) | Journal/applicability | Current-rights projections refined by 0026 and 0027. |
| [0024](adr/0024-primary-levels-and-relationship-conditions.md) | Fixed Primary roles/conditions | Protected supplied UUID roles, conditional endpoints. |
| [0025](adr/0025-modules-and-form-views.md) | Module catalog and forms | Five V1 objects, shared contributions, retained lifecycle and one common object form implemented; PRD sections 1.3/1.4 assign V2 and released V1 extension scope. Released installation updates follow 0035; future schema/template migrations need dedicated acceptance. |
| [0026](adr/0026-content-permissions.md) | Object/field ceilings | Current object/field grants; record policy in 0027. |
| [0027](adr/0027-ownership-and-foreign-access.md) | Ownership and foreign access | Local graded ownership/membership, privacy, foreign paths, Create and record security UI; calendar/notifications later. |
| [0028](adr/0028-current-installation-baseline.md) | Current installation and development resets | One runtime model, explicit disposable development resets and schema fingerprint; released upgrades use dedicated maintenance tooling under 0035. |
| [0029](adr/0029-record-recycle-bin.md) | Record recycle bin | Versioned recycling/restoration, retained edges and current-rights inspection; controlled permanent deletion retains Administrator-only history. |
| [0030](adr/0030-field-input-rules-and-record-numbers.md) | Input rules and numbering | Translated field explanations, typed creation defaults, scalar uniqueness and transactional record numbers. |
| [0031](adr/0031-standards-aligned-groupware-models.md) | Standards-aligned groupware models | Vendor-neutral profile direction; implemented Contact/Task storage in 0032. Final exchange profiles, import/export and DAV synchronization remain planned. |
| [0032](adr/0032-structured-fields-temporal-values-and-edge-attributes.md) | Structured fields, time/series and edge attributes | Ten Contact codecs including Pronouns, relationship attributes with both-endpoint rights/history, and the shared temporal codec are implemented. Recurrence/occurrence exceptions and calendar parties remain planned; Contact inheritance exceptions are the separate 1.2.0 feature under ADR 0038. |
| [0033](adr/0033-configurable-workspace-navigation.md) | Configurable navigation | Module sections, repeated object entries, Contact filters, shared defaults/personal layouts and optional Resources; versioned API/MCP persistence. |
| [0034](adr/0034-user-bound-api-mcp-access.md) | User-bound API/MCP access | Released tokens/OAuth, current-rights enforcement and generated contracts; offline-lifetime and authorization-journal refinements in 1.0.2. |
| [0035](adr/0035-container-delivery-and-maintenance.md) | Container delivery and maintenance | Published Linux containers, atomic first setup, verified backup/restore and exact released upgrade paths; target-version acceptance is evidenced separately. |
| [0036](adr/0036-browser-presence-and-live-updates.md) | Browser identity/PWA/live updates | Private previews, authorized commit signals, reconnect and draft reconciliation; public reading later. |
| [0037](adr/0037-selection-trees-and-choice-dialogs.md) | Selection trees and choice dialogs | General hierarchical fields, Category modes, ancestor closure, atomic history and shared picker UI. |
| [0038](adr/0038-contact-inheritance-and-conversions.md) | Contact inheritance and kind conversions | 1.2.0 effective fields, sparse exceptions, atomic preview/confirmation workflows and released upgrade paths. |
| [0039](adr/0039-bounded-permission-queries-and-creation-retries.md) | Bounded permissions and safe creation retries | Transaction-local SQL predicates, targeted policy reads, stable errors and atomic user-scoped retry receipts. |

## Ownership of repeated information

Requirements and permission precedence belong in the PRD, concrete implemented architecture in the applicable ADR, operation schemas/types in [shared contracts](../packages/contracts/src/index.ts), and operator commands in the [self-hosting](self-hosting.md), development and website guides. Summaries should link those authorities rather than introduce competing rules. Tests and their code are evidence for behavior; source changes are not proof of a production release.

The full application, including Premium code, remains `AGPL-3.0-only`; [licensing](../README.md#licensing-and-commercial-model) and [LICENSE](../LICENSE) govern that statement. Release images are published. Documents, email/upload facilities and hosted/native clients remain planned; see the [roadmap](../ROADMAP.md) for assigned and unassigned scope.

- [Local quality acceptance](quality-acceptance.md): measured profile, targets, accessibility and remaining release gates.
- [Optional agent plugin](agent-plugin.md): canonical workflows, packaging and actual-client acceptance.
- [Releasing](releasing.md): local artifacts, publication gates and recovery.
