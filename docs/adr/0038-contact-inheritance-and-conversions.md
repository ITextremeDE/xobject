# ADR 0038: Contact inheritance and guided kind conversions

- Status: Accepted; delivered in Community 1.2.0
- Date: 2026-11-11
- Requirements: PRD R-024, R-064, R-065

## Context

Contact persons have one main Organization. Its shared business identity must stay current without copying source values into every Contact. Normal updates keep Contact kind immutable; four deliberate business workflows change it while preserving identity, authorization and history.

## Decision

### Effective fields and exceptions

The module binds `organization_name` and `organization_commercial_register` as Contact-person-only effective fields. They read the main Organization's `company_name` and `commercial_register`. These are separate from an Individual/Organization's owned fields and have independent administrative field ceilings. Names, professional details, correspondence and communication/address collections remain owned by the Contact.

`sys_contact_field_overrides` stores sparse exceptions by workspace, object, record and field UUID. No row means Inherit. A row contains an own text or JSON null; own null stays empty. Scoped foreign keys retain record/definition integrity. There are no copied inherited shadows or installation-version branches in runtime readers.

`get_record` exposes permitted effective values plus `contactInheritance` mode, inherited proposal, edit capability and readable source identity/version. The ordinary record writer accepts a separate `contactInheritance` draft; assigning derived fields through `values` remains forbidden. Changes use the record version, one record save and one journal entry per affected field. A journal value describes `{mode, value?}`; switching to inherit discards an own value only with explicit confirmation. Switching all fields to own is the same collection of field edits, not a second policy. The form shows the combined draft before normal Save. This first supplied pair is optional; derived definitions keep their protected requiredness.

Each read enforces the Contact field ceiling and the source Organization record/field rights. Own values need only their Contact field rights. Missing or unreadable sources yield no inherited value. Reassignment keeps own exceptions; unlinking removes inherited values immediately. Source changes remain journaled at the Organization, never as artificial Contact writes. Search/sort use the same SQL effective-value resolver. Workspace live-refresh hints re-read derived fields without overwriting a local draft.

Keyword continues to identify the actual Organization relationship under current source rights. An own Organization-name exception changes the effective field, not the linked Organization, its name or the Keyword suffix. No name exception grants source access.

### Conversion contract

`get_contact_conversion_preview` is read-only. `convert_contact` requires its current opaque preview token and explicit confirmation. The token binds actor, input, source/model versions, current relationships, affected Contacts and effective mapping inputs. A fresh transaction checks current rights again under the existing workspace/model barriers; stale plans or concurrent membership changes fail as a whole.

The preview includes both the current and resulting permission-aware Keyword, calculated by the same projection as saved Contacts. Organization removal is explained explicitly. Before snapshots for removed relationships are captured before any combined field changes, including multi-Contact conversions; added edges retain their final-state context. Existing immutable history is not rewritten.

Every affected existing Contact requires Full access, plus Read/Edit on fields being read/changed. Creating an Organization additionally requires Create and creation field rights. An existing target Organization needs Read; its contents are never overwritten by joining it. New Organization security copies the original Contact's policy when the object is sensitive, avoiding a wider default policy. The preview/confirmation covers that retained policy. The source Contact policy never changes.

| Workflow | Mapping |
| --- | --- |
| Individual → new Organization + Contact person | Keep the existing Contact UUID/number and personal fields. Create a separately numbered Organization from company name/register, with an explicit Organization-name input. Clear those owned company fields on the Contact after preserving their meaning. If a nonempty source differs from the new Organization value, preserve it as an own Contact-person exception. |
| Individual → Contact person of existing Organization | Keep personal values and identity. Clear the incompatible owned company fields; inherit matching Organization values, preserve differing nonempty source company/register values as own exceptions. Never overwrite the target Organization. |
| Contact person → Individual | Materialize currently readable effective Organization name/register into owned company/register fields, remove the membership and obsolete exception rows. Explicit own empty remains empty. The preview shows the resulting fields. |
| Organization → all its Contact persons as Individuals | Apply the preceding mapping to every current member in one transaction. Keep the Organization. A hidden/inaccessible/recycled member blocks the operation rather than producing a partial conversion. This is a current-state business operation, not historical undo. |

Additional editable target-kind required fields can be supplied in `contactValues`; supplied forms collect these before preview. A new Organization has its own `organizationValues` and `organizationClassification` inputs, including applicable custom required fields. Classification uses configured defaults or explicit choices; it is not silently copied from the source Contact. The same installed-field classification resolver validates preview and creation. Custom values and compatible links remain. Incompatible populated custom fields or endpoint conditions block conversion and must be resolved through ordinary authorized edits first. There is no inferred transfer of custom data and no silent removal. Existing Organization values, personal communication collections, Identities and Distribution-list memberships are not copied or merged.

The application delegates writes to the ordinary typed record/relationship writers with a private conversion context, never a public kind-change flag. All changed fields, memberships and new-Organization contents share one change ID. Validation or journal failure rolls back contents, numbering and links together. The normal writer still rejects Contact-kind changes. API and MCP expose the same operations and portable output schemas as the web client.

### Installation and upgrades

Fresh installations include the sparse table and additive protected module field. Dedicated stopped-writer upgrade tooling accepts exact released 1.0.0/1.0.1, 1.0.2 and 1.1.0 fingerprints and fully migrates to the current target. The obsolete released `contact_type` profile binding is removed while its workspace classification options/values remain intact. Existing Contacts begin in Inherit mode; owned personal data and authored configuration stay unchanged. Structural collisions abort the migration. Repeated target upgrades are no-ops. Permanently deleting a Contact removes its live exceptions while retaining the restricted immutable journal.

## Consequences

The model remains two explicit fields rather than a general formula engine. Conversion previews can block on custom definitions and require separate user resolution; they never guess how specialist data should move. Existing client record saves remain valid, while consumers that change inheritance or Contact kind must use the dedicated typed inputs. Contact maintenance, matching and merging stay separate V2 work.
