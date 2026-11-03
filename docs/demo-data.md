# Local demo data

The development fixture is wholly fictional. It exercises the generic object platform; it does not install complete Contacts/Projects templates, conditional company/name requirements or automatic Contact Keywords. Contact-field applicability and relationship endpoint rules are configured through the regular API/MCP. Generic relationships are implemented independently of those modules.

## Model and field order

One workspace, **ITextreme** (`itx`), uses German by default, German/English definition labels and `Europe/Berlin`. The existing Administrator and its password can be retained during an explicitly authorized local rebuild. The fixture itself creates no accounts/passwords. A Project team group supports testing user/group reference fields.

Each table starts with `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. The seed installs `keyword`, `type`, `status`, `category` next, then creates business fields in the order below. It uses the common API/MCP application layer for definitions, input aids, records and journals.

| Object / table | Business fields in creation order | Initial records |
| --- | --- | --- |
| Contacts / `itx_contacts` | Contact kind; company, last/first name; email, phone, website; street, postal code, city, country; commercial register, birthday, notes | 9: six Organizations, two Contact persons, one Individual contact |
| Projects / `itx_projects` | Objective; start/target date; budget, progress; owner, team | 4 |
| Cases / `itx_cases` | Description; opened/due date; responsible user; estimated hours | 8 |
| Tasks / `itx_tasks` | Description; due instant; assigned user; estimated hours; completed flag | 30 |
| Vehicles / `itx_vehicles` | License plate; manufacturer, model; first registration; mileage, purchase price; electric drive, notes | 3 |

Form order is independent of physical storage. Keyword and classification appear under General; business fields follow definition creation order (stable UUIDv7 order), with multiline fields spanning the content width. Technical metadata is separate. Definition management stays alphabetical. A configurable layout/order editor remains future work; field visibility and relationship eligibility use the regular conditional-definition capabilities.

All Keywords are required. Type and Status remain separate from Contact kind. Categories support multiple selections. Dates, UTC instants, precise decimals/money, booleans and user/group references provide real input/formatting cases. The seed performs a genuine task edit for before/after history. Counts describe the initial 54-record fixture, not a live limit; interactive testing may add records.

## Relationship scenarios

The seed returns a plan with current UUID identities. The local CLI persists it in ignored `.local/demo-relationships.json`; it is a development aid, not an application relationship table or a permission grant.

- Nordlicht, Bergwald and Klarwasser contacts → their Projects → two Cases per Project → three Tasks per Case.
- A fourth internal Project has no Contact.
- Each Project also has a directly assigned Task, without a Case.
- A contact-maintenance Task belongs directly to Nordlicht; another Task has no planned primary association.
- Two Contact persons each link to one Organization.
- Three Vehicles have planned secondary links to service work.

The 45 proposed links use at most one primary parent per child. They are deliberately not represented by duplicate text/UUID foreign-key fields. The seed applies these links through the normal relationship operations. Cardinality checks, Primary cycle prevention, selection/list controls, a dossier and endpoint journals are implemented; derived ancestor display and tree navigation use the same persisted edges under [ADR 0020](adr/0020-relationship-tree.md).

## Seed safely

Run `npm run dev:seed` from the repository root with `ADMIN_EMAIL` identifying an existing active Administrator in the environment. The command accepts only the documented loopback PostgreSQL port 5410/database `xobject_dev` and an empty business database. It refuses existing workspaces and never resets or deletes data. Credentials still come from ignored local environment files; no default account is shipped.

The seed uses multiple normal application transactions. If interrupted, inspect/discard only that explicitly disposable staging database and start fresh; do not run it repeatedly against a partially populated database. An existing database rebuild is a separate maintenance action requiring a verified full backup, stopped writers, a separately migrated/seeded database and verification before cutover. Retain the original database under a recovery name plus a private dump. Keep recovery files in ignored `.local/backups`; they may contain authentication material and must never enter Git.

For recovery, stop local writers, consult `.local/database-rebuild.json`, retain the current test database under a different name, and restore the saved original database name/connection policy before restarting. Alternatively restore a private dump to a separately created database and verify it before changing the application connection. Recovery artifacts are retained intentionally; ordinary seed/migration commands must not delete them.

The relationship-definition baseline now installs Primary association and General relationship plus the demo Contact-person definition. Custom definitions have one object pair and editable side labels/cardinalities; system scope is protected and unrestricted. The seed enables Projects for Primary association and activates custom definitions after preflight, adds a Case/Vehicle definition and applies the 45 planned record links. Reapplying the plan retains existing links and adds no duplicates. See [ADR 0018](adr/0018-relationship-type-definitions.md).

Complete Contacts provisioning/ownership remains future work. The fixture configures Contact-person/Organization and Identities with regular conditional relationship definitions. The minimal Projects activation provides Primary association for all object types; General relationship belongs to the core. This activation boundary does not install complete domain templates. See [ADR 0021](adr/0021-relationship-scope-and-projects-module.md).

## Conditional Contact fields

The fictional fixture configures generic field-applicability rules using its actual field and choice UUIDs. First name, Last name and Date of birth apply to Individual contact and Contact person; Commercial register applies to Organization and Individual contact. Other Contact fields remain available. Existing nonempty values prevent an incompatible Contact-kind change; values are never silently removed. This is demonstration configuration, not complete Contacts provisioning or derived Contact names. See [ADR 0023](adr/0023-record-journal-and-conditional-fields.md).

## Primary roles and Contact relationships

The seed activates Projects & Tasks first and enriches its supplied object definitions with fictional fields and content. The fixed Contact → Project → Case UUID roles come from module installation, with no reassignment operation. Primary fields inherit context; existing links still use one direct parent.

Contact-person/Organization is directed, with an optional maximum of one Organization per Contact person and multiple Contact persons per Organization. Endpoint conditions reference the Contact-kind field and Organization/Contact-person option UUIDs. Identities is an undirected, symmetric multiple relationship limited to Contact persons and Individual contacts on both sides. It adds a Contact list, not an object type or records. The same definition editor and shared API/MCP rules apply to custom definitions. Complete Contacts provisioning/ownership and derived Keywords remain outstanding.

The 2026-11-03 development upgrade was checked on a restored copy before application. The existing 55 records, 45 edges and 658 record/relationship journal entries were retained. Configuration changes add definition/workspace journal entries. Private dumps remain under ignored `.local/backups`; no reset or content-history rewrite is part of this upgrade.
