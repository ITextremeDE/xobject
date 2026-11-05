# Local demo data

The optional development seed creates the fictional **ITextreme** workspace (`itx`). English is the default; English/German interface and definition labels are available. Business contents are English. The workspace uses `Europe/Berlin` and the normal `en-US` regional format. Startup and `db:init` create no demo accounts or contents.

## Accounts and groups

Provision John Doe (`john.doe@example.test`) as installation Administrator before seeding. The seed uses this account and creates Jane Doe as workspace Designer and James Doe as workspace User. Jane and James receive random initial passwords and must change them at first sign-in. The CLI writes private receipts to ignored `.local/demo-accounts.json` and `.local/demo-accounts.md`, with directory mode `0700` and file mode `0600`; no passwords enter source or journals.

Project team contains James with Full membership. Management contains Jane with Full and Project team with Read membership. Nested membership never elevates a weaker path or independently opens coworkers' records. Designer controls definitions/forms; content access still needs explicit rights. John retains installation-wide Administrator access.

## Modules, navigation and forms

Every available module is enabled. Contacts & Relations and Projects & Tasks supply five distinct shared objects; Contacts appears in both module sections. Planned unavailable Documents & Communication remains disabled. Workspace/personal navigation inherits catalog defaults, including the Contact-kind child lists and visible Resources block.

Supplied objects use the common starter forms. Contacts have a fixed kind-specific core and editable extensions. Projects, Cases and Tasks show General, a Details group (Number, Responsible, Access principals) beside Schedule, then Primary association, Classification, relationship lists and final Notes as applicable. Project/Case Schedule has optional Start date and Target date. Task Schedule & progress has Start, Due, Progress and Completed at; Priority is in Classification. Administrators/Designers can edit these common layouts. Distribution lists keep Keyword/plain-text Description and final Notes, with no business number.

Custom objects demonstrate additional authored groups, group/field widths, input aids, all 15 custom field kinds, unique identifiers and reference cardinalities. Their identities are separate from planned module objects such as Contracts. They are examples rather than previews of future module templates.

## Objects and contents

The fixture contains **9 active objects with 74 records**, plus one inactive lifecycle object with one retained record. All translatable metadata has English/German labels; account/group names and business contents have one language.

| Object / table | Records | Scenarios |
| --- | --- | --- |
| Contacts / `itx_contacts` | 9 | Six Organizations, two Contact persons, one Individual contact; structured names/contact details/addresses, partial personal dates, Identities and professional details |
| Distribution lists / `itx_distribution_lists` | 1 | Three explicit members, plain three-line Description and independent Notes |
| Projects / `itx_projects` | 4 | Objectives, dates, responsibility and Access principals; one internal Project without Contact |
| Cases / `itx_cases` | 8 | Discovery/implementation context, dates, responsibility and Access principals |
| Tasks / `itx_tasks` | 30 | Date/instant/zoned scheduling, completion/progress, user/group assignees through Access principals and privacy examples |
| Mobile workshops / `itx_mobile_workshops` | 3 | Workshop profile, mileage/defaults, license plates, dates, money, booleans and equipment |
| Support packages / `itx_support_packages` | 3 | Package codes, duration, precise EUR fees, multiple services, renewal, public Notes and restricted internal history |
| Workshop tools / `itx_workshop_tools` | 4 | Inventory, USD prices, integers/decimals, support channels, group references, inspection timestamp/result/inspector, rich instructions and an inactive retained field |
| Access checks / `itx_access_checks` | 12 | Explained ownership, foreign-access, privacy and field-exception scenarios |
| Retired equipment / `itx_retired_fixture_tools` | 1 (inactive) | Read-only lifecycle fixture with a retained record |

Descriptions demonstrate supported Markdown: headings, emphasis, ordered/unordered lists, quotes, links, inline/fenced code and separators. Notes are separate chronological work entries with timestamps and no headings. Operating instructions have their own content. These authored sample entries are business contents; the Journal records actual application writes independently. Distribution-list Description remains plain text according to its standard field definition.

Active objects have required Keyword, configurable optional Type/Status, per-Type/no-Type statuses and multiple Categories. Contact kind is separate, selected before creation and immutable in normal updates. Derived Contact names are virtual and respect source-field rights. Communication languages, example Messenger URIs, time zones and optional-year dates exercise Contact controls; Photo/Logo remains preparation without uploads.

All active objects except Distribution lists have protected automatic business numbers with five minimum digits and no restart: `CON-`, `PRJ-`, `CAS-`, `TSK-`, `MWK-`, `SUP-`, `TOOL-` and `CHK-`. Physical columns begin with system metadata; standards/custom fields and later business numbering append independently of form order. A genuine Task Progress change from 0 to 25, relationship/security writes and definition deactivations populate actual journals.

## Relationships

There are **54 persisted edges**:

- 40 Primary links across Contact → Project → Case and Tasks, including shortened chains and a standalone Task.
- Two Organization/Contact-person links, with one main Organization per Contact person.
- Three Distribution memberships and one symmetric Contact Identities link.
- Three Tool/Support-package links: each Tool has at most one package; packages support multiple Tools.
- One optional 1:1 Mobile-workshop/Tool equipment assignment.
- Four General links connecting Cases to Mobile workshops and a Project to a Support package.

Single/multiple controls, endpoint conditions, derived context, the Projects-owned tree, Dossier and journals use real application relationships. The UUID plan is saved privately to `.local/demo-relationships.json`. Reapplying that exact plan adds no duplicate edges. Standard module forms have no demo-only relationship definitions.

## Assignment and permission checks

Projects, Cases and Tasks are always sensitive. Support packages and Access checks are additional sensitive custom examples. Access principals is the protected virtual ownership field; in activities it also identifies the users/groups carrying out the work. **Task assignees are exactly these participants.** There is no separate Task assignment field or storage. Responsible coordinates the activity and grants no rights. Foreign access grants permissions without adding participants, assigning work or subscribing people to future notifications.

Demo Tasks are assigned to James through Access principals, with selected records demonstrating Project-team assignment, Jane's Personal/Confidential ownership and the normal foreign-access rules. New ordinary records retain creator ownership until explicitly delegated. Layout changes never alter security.

Explicit object ceilings give Jane/James the rights needed for the examples. James inherits Create through Project team. On Support packages, Internal notes is hidden from James; on Workshop tools, Purchase price is read-only. The inactive object has no implicit ordinary-user grant. James has foreign Full to Jane without Confidential permission; Jane has foreign Read to Project team with Confidential permission and may manage her own delegated rules.

| Access-check Keyword | Expected result for James |
| --- | --- |
| Foreign access – none / availability | No contents; calendar-only projection remains future work |
| Foreign access – read | Read |
| Foreign access – duplicate | Read/Duplicate, bounded by Create and required fields |
| Foreign access – schedule | Read/Duplicate; calendar scheduling remains future work |
| Foreign access – edit / delete / full | Corresponding capabilities, bounded by the record's foreign maximum |
| Privacy – personal / confidential | No access through the configured foreign rule |
| Workspace-public – read | Read without named owners, within object ceilings |
| Direct ownership – field exception | Full direct ownership; Sample amount remains hidden |

Jane owns the foreign/privacy samples. The integration test completes the real initial-password change before assessing user rights, verifies field restrictions and rejects definition edits for James.

## Run and rebuild

Run `ADMIN_EMAIL=john.doe@example.test npm run dev:seed` after Administrator provisioning. The CLI requires local-demo confirmation, loopback PostgreSQL port `5410`, database `xobject_dev` and no existing workspaces. The seed refuses overwriting/repeated seeding. Tests use isolated disposable PostgreSQL instances.

For an authorized clean rebuild: stop writers, preserve a verified backup/private receipts, run guarded `npm run db:reset`, provision the first Administrator and apply the current seed. There is one current unreleased model; old schemas/rights are never adopted. Private recovery artifacts remain outside application state and are never imported automatically. An interrupted seed requires an explicit disposable-instance rebuild rather than resuming a partial fixture. See [development](development.md#current-database-installation-and-sql-inspection) and [ADR 0028](adr/0028-current-installation-baseline.md).

Uploads, attachments, email/notification delivery, SSO and calendar actions remain later work. Contact-person/Individual professional details are direct Contact fields; Organization membership has no supplied attributes. The same Contact identity and common form serve both contributing modules.
