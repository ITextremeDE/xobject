# Local demo data

The explicit development seed creates a wholly fictional **ITextreme** workspace (`itx`). The default language is **English**, both English and German are available for the interface and definition labels, and the time zone is `Europe/Berlin`. Regional display initially uses the normal `en-US` default; personal or workspace settings can exercise German numeric, date and currency display. Business contents have one language: English.

Demo data is optional and separate from installation. It exercises the currently implemented generic platform, not future complete domain modules. Nothing is seeded by normal startup or `db:init`.

## Accounts and groups

Provision John Doe (`john.doe@example.test`) as the installation Administrator first. `dev:seed` uses that existing Administrator and creates one additional account for each workspace role:

| Account | Role | Purpose |
| --- | --- | --- |
| John Doe | Installation Administrator | All contents and instance administration |
| Jane Doe | Workspace Designer | Definitions, forms and workspace configuration, with explicitly granted content rights |
| James Doe | Workspace User | Ordinary content editing and permission checks; no definition changes |

Jane and James receive random initial passwords and must change them at first sign-in. Passwords are never fixed in source, printed to the console or stored in journals. The local CLI writes the account receipt to ignored `.local/demo-accounts.json` and `.local/demo-accounts.md`, with directory mode `0700` and files `0600`. It includes John's password only when the matching private installation receipt exists; otherwise use his separately provisioned password. Group names and account/profile names are ordinary single-language content.

**Project team** contains James with Full membership. **Management** contains Jane with Full and Project team with Read membership, demonstrating nested graded membership without elevating James's inherited membership. Membership does not by itself open coworkers' records. Explicit object ceilings, ownership and foreign rules remain authoritative.

## Objects and contents

The initial fixture has **8 active object types with 73 records**, plus one inactive object type with one retained record. Every translatable object, field, choice, relationship-side label and form-group label has English and German text. Technical names stay stable and untranslated.

| Object / table | Records | Main scenarios |
| --- | --- | --- |
| Contacts / `itx_contacts` | 9 | Six Organizations, two Contact persons and one Individual contact; addresses, email, phone, URL, conditional fields and same-person Identities |
| Projects / `itx_projects` | 4 | Objectives, dates, money, decimal progress, user/group references; one internal Project without a Contact |
| Cases / `itx_cases` | 8 | Work packages/service requests, dates, responsibility and estimated effort |
| Tasks / `itx_tasks` | 30 | Instants, user assignment, mixed multiple user/group references, booleans, decimal effort and sensitive ownership |
| Vehicles / `itx_vehicles` | 3 | License plates, integer mileage, dates, money, booleans and service links |
| Contracts / `itx_contracts` | 3 | Validity, precise EUR fees, multiple-choice services, renewal, hidden internal notes and linked Devices |
| Devices / `itx_devices` | 4 | Serial numbers, USD prices, integers including zero, three-decimal weights, multiple group references, formatted instructions and an inactive field with retained content |
| Access checks / `itx_access_checks` | 12 | Named, explained ownership/foreign-access/privacy/field-exception scenarios |
| Retired equipment / `itx_retired_equipment` | 1 (inactive) | A retained read-only object and its record, visible through inactive-definition administration |

Together these exercise all **14 custom field types**: text, multiline, integer, decimal, money, boolean, date, datetime, single choice, multiple choice, email, phone, URL and user/group reference. Reference fields include user-only, group-only and mixed targets, with single and multiple values. Numeric examples include zero, negatives, precise fractions and large grouped amounts. Single-line and formatted multiline contents have meaningful English examples.

Active objects have required Keyword, optional Type/Status with per-Type and no-Type statuses, and multiple Category choices. Types are varied across records. Contact kind is a separate required choice. Each active object has bilingual General, Details and, where applicable, Relationships form groups. Contacts also store a Projects-specific form override that omits two optional fields. This exercises metadata retention; the current designer/record UI selects only the standard form, pending actual module membership and view selection. The inactive object deliberately has only Keyword, illustrating optional standard-field installation.

Physical columns begin with system metadata; optional standards and custom fields append when installed. The seed initially installs classification before custom fields and enables business numbering later, so its number columns are physically appended after those custom fields. Form order/widths and alphabetical definition administration remain independent. A real task effort edit from `1` to `2.5`, relationship changes, ownership changes, configuration changes and definition deactivation populate actual journals through shared operations.

Sensitive demo objects place Access principals in General at full width, using the same field UUID layout entries as ordinary fields. Its group, order and half/full width can be changed in the Form designer; record security remains protected.

Every active object has protected automatic business numbers: Contacts `CON-`, Projects `PRJ-`, Cases `CAS-`, Tasks `TSK-`, Vehicles `VEH-`, Contracts `CTR-`, Devices `DEV-`, Access checks `CHK-`, each with five minimum digits and no restart. Registration, serial and contract numbers demonstrate uniqueness. Country, mileage and completion fields demonstrate typed defaults; selected fields have translated descriptions and input hints.

## Relationships

The initial fixture applies **51 persisted edges** through normal application operations:

- 40 Primary links: Contacts → Projects → Cases → Tasks, plus directly assigned Project and Contact Tasks. There is a Project without a Contact and a standalone Task without any Primary parent.
- Two Organization → Contact-person links; each Contact person can belong to at most one Organization.
- One symmetric Identities link between the Contact-person and Individual-contact representations of Emily Example. Identities is a Contact relationship, not another object type.
- Three undirected n:m Case/Vehicle links.
- Three directed Device/Contract links: a Device has at most one covering Contract; a Contract covers multiple Devices.
- One directed optional 1:1 Vehicle/Device assignment.
- One General Project/Contract link, displayed in the Dossier.

These cover single-target controls, multi-target tables, endpoint conditions, derived context, the Projects-owned tree, Dossier and journals. The returned UUID plan is saved in ignored `.local/demo-relationships.json`. Reapplying that exact plan through `connectDemoRelationships` keeps existing edges and adds no duplicates. It is a test aid, not another relationship store.

Projects activation supplies protected Contacts, Projects, Cases and Tasks and fixed Primary roles. Complete Contacts/Projects business templates remain V1 implementation work; Documents & Communication is deferred beyond V1. See the [PRD catalog](PRD.md#6-supplied-domain-models) for the agreed target. The fixture enriches existing definitions through ordinary configuration. Contacts limit first/last name and birthday to Individual contacts/Contact persons, and commercial register to Organizations/Individual contacts. Incompatible nonempty values must be cleared explicitly before changing Contact kind. Derived Contact Keywords are not implemented; fixture Keywords are supplied explicitly.

## Permission checks

Explicit object grants give Jane and James the content ceilings required by the scenarios; Designer is not a content-right shortcut. James inherits Create through Project team. On Contracts, Internal notes is hidden from James; on Devices, Purchase price is read-only for him. The inactive equipment object is retained for Administrator lifecycle inspection, without an implicit regular-user grant.

Tasks and Contracts are sensitive. Existing seeded rows receive explicit workspace-public policies when sensitivity is enabled; selected rows then demonstrate direct James ownership, Project-team ownership, Jane's Personal/Confidential records and ordinary foreign access. Assigned to is independent of these permissions. Tasks not individually restricted remain workspace-public within their object ceilings.

James has foreign Full access to Jane's normally shared records, without Confidential permission. Jane has foreign Read access to Project team's records, with Confidential permission. Her own-record delegation is enabled. Graded and nested group memberships remain visible for editing and inheritance tests.

Use **Access checks** to inspect the following as James:

| Keyword | Expected result |
| --- | --- |
| Foreign access – none / availability | No record contents; calendar-only projection is not implemented |
| Foreign access – read | Read |
| Foreign access – duplicate | Read and Duplicate, subject to Create and required fields |
| Foreign access – schedule | Read and Duplicate; calendar scheduling remains future work |
| Foreign access – edit / delete / full | Corresponding graded content capabilities, bounded by the record's foreign maximum |
| Privacy – personal / confidential | No foreign access through the configured rule |
| Workspace-public – read | Read with no named owners, within object ceilings |
| Direct ownership – field exception | Full direct ownership; Sample amount is hidden by a record field exception |

Jane owns the foreign/privacy samples with Full. John retains installation-wide Administrator access. The integration test performs the real initial-password change before evaluating these rights and verifies denial of definition edits for James.

## Run and rebuild

Run `ADMIN_EMAIL=john.doe@example.test npm run dev:seed` after Administrator provisioning. The CLI requires explicit local-demo confirmation (included by the npm script), loopback PostgreSQL port `5410`, database `xobject_dev`, and no existing workspaces. The seed refuses overwrite/repeated seeding; it does not reset the database. Tests use separate disposable PostgreSQL instances and a distinct workspace code.

For an explicitly authorized clean test rebuild, stop writers, run the guarded `npm run db:reset`, provision the first Administrator, then run this seed. There is one current unreleased schema; no development-version upgrades or old-rights adoption occur. Existing offline recovery artifacts remain outside application state in ignored `.local/backups` and are never imported automatically.

The seed uses several normal application transactions. If interrupted, it refuses to continue against the partially populated workspace; rebuild the disposable development database explicitly before starting again. This is not a production import/export facility. Uploads, attachments, email delivery, SSO, calendar actions and notification delivery are not implemented by this fixture.
