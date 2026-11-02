# Local demo data

The development fixture is wholly fictional. It exercises the generic object platform; it does not install complete CRM/Project Management modules, Contact-kind validation, automatic Contact Keywords or relationships.

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

Form order is independent of physical storage. Keyword and classification appear under General; business fields follow definition creation order (stable UUIDv7 order), with multiline fields spanning the content width. Technical metadata is separate. Definition management stays alphabetical. A configurable layout/order editor and conditional field visibility remain future work; this fixture uses only existing generic field capabilities.

All Keywords are required. Type and Status remain separate from Contact kind. Categories support multiple selections. Dates, UTC instants, precise decimals/money, booleans and user/group references provide real input/formatting cases. The seed performs a genuine task edit for before/after history. Counts describe the initial 54-record fixture, not a live limit; interactive testing may add records.

## Future relationship scenarios

The seed returns a plan with current UUID identities. The local CLI persists it in ignored `.local/demo-relationships.json`; it is a development aid, not an application relationship table or a permission grant.

- Nordlicht, Bergwald and Klarwasser contacts → their Projects → two Cases per Project → three Tasks per Case.
- A fourth internal Project has no Contact.
- Each Project also has a directly assigned Task, without a Case.
- A contact-maintenance Task belongs directly to Nordlicht; another Task has no planned primary association.
- Two Contact persons have a planned main Organization.
- Three Vehicles have planned secondary links to service work.

The 45 proposed links use at most one primary parent per child. They are deliberately not represented by duplicate text/UUID foreign-key fields. Actual cardinality checks, Primary associations, inheritance, dossiers and tree navigation must use the future relationship implementation. The fixture's descriptions supply human context while those capabilities are absent.

## Seed safely

Run `npm run dev:seed` from the repository root with `ADMIN_EMAIL` identifying an existing active Administrator in the environment. The command accepts only the documented loopback PostgreSQL port 5410/database `xobject_dev` and an empty business database. It refuses existing workspaces and never resets or deletes data. Credentials still come from ignored local environment files; no default account is shipped.

The seed uses multiple normal application transactions. If interrupted, inspect/discard only that explicitly disposable staging database and start fresh; do not run it repeatedly against a partially populated database. An existing database rebuild is a separate maintenance action requiring a verified full backup, stopped writers, a separately migrated/seeded database and verification before cutover. Retain the original database under a recovery name plus a private dump. Keep recovery files in ignored `.local/backups`; they may contain authentication material and must never enter Git.

For recovery, stop local writers, consult `.local/database-rebuild.json`, retain the current test database under a different name, and restore the saved original database name/connection policy before restarting. Alternatively restore a private dump to a separately created database and verify it before changing the application connection. Recovery artifacts are retained intentionally; ordinary seed/migration commands must not delete them.

The relationship-definition baseline now installs Primary association and General relationship plus the demo Contact-person definition. Its allowed object pairs and per-side labels/cardinalities are editable in workspace settings. Rules remain staged drafts; these definitions do not apply the 45 proposed record links. See [ADR 0018](adr/0018-relationship-type-definitions.md).

Future module ownership is explicit: Contact-person / main Organization belongs to CRM, Primary association to Project Management, and General relationship to the core. The current custom Contact-person fixture and protected Primary prototype default prepare these scenarios without activating modules or claiming module-owned definitions.
