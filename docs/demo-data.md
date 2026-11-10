# Local demo scenarios

The optional seed creates three distinct fictional workspaces. English is the default interface/content language; every translatable definition, input aid and form group has English/German labels. Each workspace uses `Europe/Berlin` and the normal `en-US` display format. All available modules are enabled; unavailable Documents & Communication remains disabled. Installation and `db:init` create no demo accounts or business contents.

| Workspace | Code | Purpose | Active records | Number example |
| --- | --- | --- | --- | --- |
| Demo | `demo` | Explicit feature/permission laboratory | 74 | `CHK-00001` |
| ITextreme | `itx` | Managed IT services, customer delivery and commercial separation | 74 | `ITx-CHK-1001` |
| Jürgen Schadek | `js` | A small fictional family and household | 47 | `JS-CHK-1` |

Each workspace also has one recycled Task and one retained record in an inactive lifecycle object. A development installation may contain manually created examples in addition to these canonical counts.

## Accounts and workspace boundaries

Provision John Doe (`john.doe@example.test`) as installation Administrator before seeding. The seed adds seven fictional users, for **eight installation accounts in total**. There is one Administrator, not an Administrator per workspace. Membership and content rights are independent for each workspace.

| Account | Demo | ITextreme | Jürgen Schadek |
| --- | --- | --- | --- |
| John Doe | Installation Administrator | Installation Administrator | Installation Administrator |
| Jane Doe | Designer / reviewer | Designer / Management | Designer / parent |
| James Doe | User / test operator | User / Service Desk | No membership |
| Alex Doe | No membership | User / service lead, Management | User / parent |
| Casey Doe | No membership | User / Field Service and Service Desk | No membership |
| Morgan Doe | No membership | User / Sales | No membership |
| Taylor Doe | No membership | User / read-only Audit | No membership |
| Jamie Doe | No membership | No membership | User / child |

Jane’s Designer role permits model/form changes, not arbitrary access to contents. Alex’s service-lead rights come from groups and content policies, not an additional application role. Administrators retain installation-wide content access. Ordinary users cannot use another workspace merely because the same object types exist there.

New users receive random initial passwords and must change them at first sign-in. Private ignored `.local/demo-accounts.json` and `.local/demo-accounts.md` contain the account receipts, with directory mode `0700` and file mode `0600`. Passwords never enter source or journals. A local fixture refresh may retain existing test-account credentials; the ordinary installation seed does not bypass the first-password-change rule.

## Demo — feature laboratory

Test Organizations Alpha–Zeta and explicitly named Projects cover complete Contact → Project → Case → Task chains, direct Project/Contact assignments and internal contexts. Custom Mobile workshops, Support packages, Workshop tools and Access checks retain deliberately recognizable test data, including zero/negative/precise values, optional dates and an unassigned diagnostic kit.

Test operators contains James with Full membership. Reviewers contains Jane with Full and Test operators with Read membership. The twelve Access checks explain the effective outcome for James: foreign maxima from None through Full, Personal/Confidential exclusions, explicit workspace-public Read and a direct-owner field exception. Calendar-only meanings remain reserved rather than producing implemented calendar behavior.

James inherits Create through the test group, cannot see Support-package Internal notes and can only read Tool Purchase price. Jane can design fields but must have content grants. These are intentional acceptance fixtures rather than realistic customer records.

## ITextreme — managed IT services

Six customer/supplier/partner Organizations include Northlight Architecture, Blue Harbour Logistics and Cedar Health. Contact persons and an Individual contact demonstrate one Organization per Contact person and direct Identities. Four Projects have distinct working stories:

- Northlight: workstation inventory, MFA pilot and firewall cutover for a 24-seat architecture office.
- Blue Harbour: mailbox/calendar discovery, pilot migration and dispatch-team handover.
- Cedar Health: isolated backup restoration, measured recovery time and acceptance evidence.
- Internal: service-laptop preparation, rights review and a supervised first support shift.

Eight Cases and thirty Tasks carry concrete results instead of repeated placeholder checklists. Custom Field-service vehicles, Managed service plans, Service assets and Access reviews connect service vans, a technician laptop, a network diagnostic kit, a dispatch spare and customer service cover. Commercial Internal notes differ from the customer-facing description and Notes.

The five groups are Service Desk, Field Service, Management, Sales and Audit. Management contains the service groups at lower membership grades as well as Jane/Alex directly; transitive paths remain bounded by their weakest edge.

| Persona | Examples to verify |
| --- | --- |
| James / Service Desk | Work from the shared queue; commercial Internal notes stay hidden and purchase prices read-only |
| Casey / technician | Edit eligible service contents and assigned work; prices/internal commercial notes are hidden; no Delete/Full |
| Alex / service lead | Full foreign access to Service Desk/Field Service ownership within object ceilings; review internal Cases |
| Morgan / Sales | Create/edit Contacts, Projects and service plans; read permitted delivery context; Access reviews and restricted financial fields stay hidden |
| Taylor / Audit | Read permitted normal Management/Service Desk context; no Create/Edit; Confidential/Personal records remain restricted |
| Jane / Designer | Maintain model/forms and own delegated policies; Personal review records remain private |

Group foreign access grants rights without assigning Tasks. Task Access principals identify the actual individual/group doing the work. Responsible coordinates and grants no rights. Access-review records describe their actual policy, including deliberately restricted examples; they are operational audit material, not a second copy of the test laboratory.

## Jürgen Schadek — family and household

This workspace contains fictional family data, not information about the real person’s family. Jane and Alex are the parents; Jamie is the child. Six Organizations represent a school, dentist, insurer, cycling club, energy service and campsite. Eleven Contacts include the parents’ separate Organization-linked/private identities and Jamie’s Individual contact.

Two Projects keep the workspace small: lowering household heating costs and planning a summer cycling holiday. Four Cases and sixteen Tasks cover quotes, installation, campsite booking, route planning, bicycle checks and packing. Family vehicles include an electric car, cargo bicycle and trailer. Household cover and Household items connect insurance/care plans, a navigation tablet, drill, tent and unassigned camera.

Family, Parents and Children are the only groups. Family membership gives Jamie Read on common ownership; a direct assignment or Children assignment allows editing eligible Tasks within the child’s Edit ceiling. Create is explicitly disabled for Jamie, so duplication cannot create a new record. Purchase prices, commercial/internal notes and the Amount of private working records are hidden from Jamie.

Parents can review ordinary child-owned work. Children can read normal parent-owned context, bounded by object/field ceilings, but have no Confidential exception. Three Private records make the distinction tangible:

- Shared household costs: Family-owned; Jamie sees the context but not Amount.
- Heating reserve: Parents-owned and Confidential; Jamie cannot read it.
- Birthday surprise: Jane-owned and Personal; neither Alex’s foreign access nor Jamie’s group rights open it.

## Object names and record numbers

The five supplied objects remain Contacts, Distribution lists, Projects, Cases and Tasks. Their supplied forms remain canonical. Only custom objects demonstrate authored groups, widths, scalar/reference fields and explicit custom relationships.

| Logical custom example | Demo technical name / code | ITextreme technical name / code | Family technical name / code |
| --- | --- | --- | --- |
| Vehicle | `mobile_workshops` / `MWK` | `field_service_vehicles` / `VEH` | `family_vehicles` / `VEH` |
| Cover/service plan | `support_packages` / `SUP` | `managed_service_plans` / `MSP` | `household_cover` / `COV` |
| Equipment | `workshop_tools` / `TOOL` | `service_assets` / `AST` | `household_items` / `ITEM` |
| Rights/private working records | `access_checks` / `CHK` | `access_reviews` / `CHK` | `private_records` / `CHK` |

Standard numbered objects use `CON`, `PRJ`, `CAS` and `TSK`. Distribution lists intentionally have no record number. Demo starts each sequence at 1 with five minimum digits; ITextreme starts at 1001 with four minimum digits and the case-sensitive `ITx-` workspace prefix; Family starts at 1 with one minimum digit and `JS-`. All use increment 1 and no restart. Examples: `ITx-AST-1001`, `JS-ITEM-1`. The prefixes use ordinary object-numbering configuration, not special application logic. Technical UUID generation is unchanged; record numbers are human-readable identifiers.

The laboratory keeps `expected_result` and `sample_amount` as explicitly named test fields. The IT scenario uses `review_findings` and `amount`; the family scenario uses `context` and `amount`. Their technical field names match their respective domain meaning.

## Shared feature coverage

| Capability | Fixture / manual acceptance |
| --- | --- |
| All 16 custom field kinds | Every scenario’s four custom examples; exact decimal/money, booleans, date/time, choices including selection trees, User/Group references and structured emails |
| CRM cores | Organization, Contact person and Individual; structured channels/addresses, languages, messenger URI, time zone and personal dates; deceased Contact example stays in the laboratory |
| Main assignment | Complete and partial chains, internal contexts, direct Contact/Project parents and an intentionally unassigned equipment record; links grant no permissions |
| Custom relationship cardinalities | One plan per item, multiple covered items; one dedicated device per vehicle and vice versa |
| Relationship attributes | Coverage notes on the actual cover edge, changed once to produce real per-field relationship history |
| Journals | A genuine Task Progress edit, edge-attribute edits, ownership/field policies and definition lifecycle writes; editorial Notes are separate |
| Classification/input aids | Configurable Type-dependent Status, multi-Categories, unique codes, translated descriptions/hints and defaults |
| Scheduling | Date-only, instant and zoned Task values, completion/progress and assignment through Access principals |
| Lifecycle | One recycled Task per workspace for restoration; one inactive field and one inactive object with retained contents |
| User isolation | Laboratory rights matrix, larger IT role/group matrix and small family matrix; same account can have different rights in different workspaces |
| Presentation | Three editable designs, catalog navigation, Contact-kind child lists, Resources enabled, English/German labels and region-aware controls |

Descriptions use varied scenario-specific Markdown with headings, emphasis, lists, quotes, code and links. Notes use distinct timestamped work-history entries without Markdown headings. Distribution-list Description remains a short three-line plain text. The application Journal records actual writes separately. All metadata translations are bilingual; account/group names and business contents have one language, English.

## Appearance

Demo uses unchanged Neutral/Geist defaults. ITextreme uses Gray/Rose, Inter/Orbitron, `#C81E3A` Light and `#F26074` Dark primary colors and the Network icon. Jürgen Schadek uses the existing cool Gray base, Sky/Cyan, Inter/Space Grotesk, primary `#0369A1` / `#7DD3FC`, neutral secondary `#F1F5F9` / `#1E293B`, and the Globe icon. These are editable standard settings, not new component presets. Exact corporate surface effects, arbitrary font/CSS uploads and real logo storage are separate work; own-logo upload remains a disabled placeholder.

## Seed and recovery

Run `ADMIN_EMAIL=john.doe@example.test npm run dev:seed` after provisioning the first Administrator. The CLI requires confirmation, loopback PostgreSQL port `5410`, database `xobject_dev` and no existing workspaces. Each scenario is created through the application’s ordinary validation, permission, version and journal operations. The seed refuses repeat/overwrite; an interrupted seed requires an explicit disposable-instance rebuild, not runtime compatibility or partial-seed adoption.

Private relationship plans are `.local/demo-relationships.json` (ITextreme), `.local/demo-relationships-demo.json` and `.local/demo-relationships-js.json`. `.local/demo-workspaces.json` identifies the workspaces. Reapplying a current relationship plan adds no duplicate edges. Preserve a verified backup and credential receipts before an authorized development rebuild. See [development](development.md#current-database-installation-and-sql-inspection) and [ADR 0028](adr/0028-current-installation-baseline.md).

Uploads, attachments, import/export, synchronization, email/notification delivery, SSO and calendar actions remain later work. Demo content does not turn planned capabilities into implemented features.
