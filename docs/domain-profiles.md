# Domain start profiles

Status: Five V1 object templates implemented locally; later profiles remain proposals, full product/interoperability acceptance pending
Updated: 2026-11-05

This is the detailed appendix to [PRD section 6](PRD.md#6-supplied-domain-models). The PRD owns scope, requirements, Contact rules, permissions and lifecycle; this appendix supplies the proposed initial fields, relationships and acceptance cases. The target catalog has 22 objects; the PRD Delivery column separates five V1 objects, 11 additional Contacts & Relations objects deferred to the next version and six additional Projects objects deferred beyond V1. Their profiles remain design proposals for that version, including relationships involving a deferred endpoint. Standards/lean-template principles apply to both release scopes. Newly specified field names, initial values and optional relationships below are implementation proposals within those boundaries, not additional confirmed business workflows. The prototype fixture is not the specification. [ADR 0031](adr/0031-standards-aligned-groupware-models.md) owns the vendor-neutral interoperability direction.

The current implementation installs nine contact codecs and base Contacts/Distribution lists under [ADR 0032](adr/0032-structured-fields-temporal-values-and-edge-attributes.md). Generic relationship attributes, lean Projects/Cases/Tasks templates and the common temporal codec are implemented. Recurrence/calendar-party contracts and the other object profiles remain later proposals. Nickname, communication languages, messenger addresses, named contact time zone, Wedding anniversary and Date of death are implemented locally. Photo/Logo has presentation-only preparation. Position/Function/Department are direct Contact fields for Contact persons and Individual contacts. No exchange support is implied.

## Shared template rules

- Reuse system metadata, Journal, Dossier and the optional standard definitions from PRD section 3.2. All proposed templates initially install Keyword, Type/Status and multiple Category; initial requiredness is false, except the derived Contact Keyword. Dictionaries initially stay empty unless a suggestion is explicitly listed here. No business numbering is enabled automatically. Numbering remains an object setting.
- The Contacts profile has one shared identity across both V1 modules. Its fields/values and permissions are shared; a module's layout never creates another contact. Other memberships are exactly those in the PRD catalog. Relationships never force activation of the other V1 module. General is always available; Primary remains the optional fixed Projects-owned Contact → Project → Case context on eligible types.
- Every additional scalar field is initially optional/null unless its profile says otherwise. Collection defaults are empty, not dummy entries. Requiredness and supported defaults/options remain configurable through the normal rules, with preflight and system semantic constraints. No guessed dates, current-user assignment or ownership changes are introduced through these defaults.
- Custom object forms start with one editable General / Allgemein group. Supplied Contacts use a fixed kind-specific core under ADR 0025; only additional fields and custom relationships are arranged in the designer. For other starter forms: General holds Keyword and description; Project/Case/Task details pair Business number, Responsible and Access principals beside Schedule. Schedule holds temporal/progress fields; Primary immediately precedes Classification; list Relationships and final Notes follow; long text/structured collections use full width, short scalars use half width. Other sensitive objects initially place Access principals in General; Primary and applicable explicit relationships follow in catalog order. Layout changes remain editable. Shared-module forms start from this proposal rather than speculative extra views.
- Supplied structures are protected. Designers/Administrators may add fields/relationships, edit intended input aids/requiredness and arrange forms; ordinary Users retain read-only configuration. Activities are always user-sensitive: Projects, Cases and Tasks in V1. Their Access principals field is supplied automatically and sensitivity cannot be disabled. Other object types allow Administrator-controlled sensitivity. Access principals confer ownership within the ceilings in PRD section 4. Responsible and ordinary reference fields grant no implicit content access.
- English/German field labels below are the initial translations. Business contents have one language. Object labels/technical names and membership remain canonical in the PRD catalog; field keys are local to their object. Common keys below share a definition recipe, not cross-object storage or identities. Scalar types use the existing kinds; each structured profile distinguishes implemented codecs from pending domain extensions.

## Reusable scalar field recipes

The profiles reference these keys in display order. Each installed occurrence receives its own stable field UUID. No field is installed merely because it appears in this recipe table.

| Technical name | English / German label | Kind and initial configuration |
| --- | --- | --- |
| `description` | Description / Beschreibung | Multiline Markdown in supplied profiles. |
| `notes` | Notes / Notizen | Multiline Markdown in supplied profiles. |
| `responsible` | Responsible person / Verantwortlich | Single User/Group reference; no default. |
| `access_principals` | Access principals / Zugriffsberechtigte | Protected virtual ownership field; its users/groups are the activity assignees. Edit through the shared security writer, not ordinary field values. |
| `start_date` | Start date / Beginn | Date. |
| `end_date` | End date / Ende | Date; inclusive business date unless a temporal profile explicitly uses an exclusive boundary. |
| `target_date` | Target date / Zieldatum | Date. |
| `occurred_at` | Occurred at / Stattgefunden am | Date/time with explicit instant. |
| `recorded_on` | Recorded on / Erfasst am | Date, a business date distinct from system creation time. |
| `amount` | Amount / Betrag | Money, scale 2; initial currency choice EUR, overridable per value; no amount default or conversion. |
| `expected_value` | Expected value / Erwarteter Wert | Money, scale 2; same currency rules as Amount. |
| `unit_price` | Unit price / Einzelpreis | Money, scale 4; same currency rules as Amount. |
| `quantity` | Quantity / Menge | Decimal scale 4; no default. |
| `unit` | Unit / Einheit | Text; no fixed unit dictionary or conversion. |
| `reference_number` | Reference number / Referenznummer | Text; not the generated Business number and not unique by default. |
| `product_code` | Product code / Produktcode | Text; no uniqueness rule by default. |
| `duration_hours` | Duration (hours) / Dauer (Stunden) | Exact Decimal scale 4. |
| `capacity_hours` | Planned effort (hours) / Geplanter Aufwand (Stunden) | Exact Decimal scale 4. |
| `progress` | Progress (%) / Fortschritt (%) | Integer; profile rule 0–100. |
| `probability` | Probability (%) / Wahrscheinlichkeit (%) | Integer; profile rule 0–100. |
| `impact` | Impact / Auswirkung | Single choice; suggestions Low / Niedrig, Medium / Mittel, High / Hoch; no default. |
| `mitigation` | Response / Maßnahme | Multiline. |
| `priority` | Priority / Priorität | Single choice; suggestions High / Hoch, Normal / Normal, Low / Niedrig; no default. |
| `resource` | Resource / Ressource | Single User/Group reference; no automatic assignment/rights. |
| `paid_by` | Paid by / Bezahlt von | Single User reference. |
| `person` | Person / Person | Single User reference; not a Contact or external calendar attendee. |
| `location` | Location / Ort | Text. |

These recipes do not establish a generic expression/validation engine. Numeric ranges and cross-field rules below need explicit supplied semantic validation in the common application layer. Null is not zero; negative quantities and effort are rejected in these starter proposals. Monetary values retain signed exact amounts without inferring a document kind or accounting operation. Tax calculations, scheduling engines and automatic totals are not implied. Equal dates are valid for inclusive date ranges; an end/target before its corresponding start is rejected when both exist. Cross-currency amounts are never silently aggregated.

## Structured domain value contracts

These logical shapes are covered by the `structured` field codec registry selected in [ADR 0032](adr/0032-structured-fields-temporal-values-and-edge-attributes.md), with typed JSONB, stable field/entry identities, whole-field rights, per-field journals and optimistic writes. Nine Contact codecs and the shared temporal codec are implemented through the structured runtime field kind. Recurrence/party codecs and exchange wire profiles remain pending. Do not hide them in unvalidated free-form JSON or expose them as separate user-managed object types.

| Logical value | Proposed components | Invariants and editing |
| --- | --- | --- |
| Personal name components | Ordered text components for given/additional/family names and prefixes/suffixes. | Single-component entry is the normal simple form; preserve additional components without delimiter-based flattening. These are structured values, not comma-separated scalar lists. |
| Repeated contact values | Per-entry UUID, value, label/context set, optional preference rank (1–100) and preserved supported parameters. | Add/edit/remove entries in one field; stable entry identity survives reordering. Telephone, email, URL and address use their own typed validation; preference is derived from collection order as consecutive ranks; callers may omit it. |
| Postal address | PO box, extended address, street lines, house number, postal code, locality, region, country; optional formatted address. | Preserve street-line ordering; house-number splitting is optional. Country text is retained without inferring it from interface language. A readable preview includes all populated components, including PO box, extended address and Region, without replacing components or writing a formatted label. Country is selected from a searchable DE/EN country catalog; selected values remain English country-name text. Existing country text is retained without automatic rewriting. This generic preview is not country-specific postal validation. Shared component limits produce input-specific errors. |
| Partial birthday | Month/day and optional year. | Validate the supplied precision, including yearless February 29; never fabricate a year or time zone. Other partial date forms outside this starting profile are retained only by the later safe exchange layer or explicitly rejected. |
| Temporal value | Tagged date-only, zoned local date/time with named zone and resolved instant, or explicit UTC instant. | Date-only has no zone. Zoned edits reuse gap/overlap handling. Floating values are outside the initial editable profile and must be reported/preserved or rejected explicitly at future exchange boundaries. |
| Recurrence | Series identity, rule, added/excluded occurrence identities and per-occurrence overrides. | Occurrence identity survives moving its start; never replace a series by unrelated copies. Initial editable proposal: daily/weekly/monthly/yearly intervals anchored to the start, optional count or until, optional weekly weekdays, additions/exclusions and single-instance changes. Other recurrence constructs remain unsupported until a versioned profile specifies them. |
| Calendar party | Per-entry UUID, calendar-address URI, display name, optional Contact link, role and participation response. | External parties need no local account. A party is neither an xObject security principal nor proof of consent or delivery. Per-party values/roles are independent of record status. |

Internal component names and UI labels need the same English/German metadata policy as scalar fields. Canonical nested-key identities and stable entry IDs must be journal-filterable; replacing/reordering a collection must not manufacture unrelated value changes. Storage must enforce scope and stable identities, while API/MCP expose the same typed validation as the UI. Import/export and retained unknown external-property storage remain later tooling, not current runtime compatibility paths.

## Standards-aligned profiles

### Contacts — `contacts`

The three mutually exclusive Contact kinds, name requirements, single-Organization limit, Identities and direct Contact professional roles are governed by PRD section 6.1. They remain mandatory product rules. Proposed additional definitions, in initial display order:

| Technical name | English / German label | Value and applicability |
| --- | --- | --- |
| `contact_kind` | Contact kind / Kontaktart | Required single choice: Organization / Organisation, Individual contact / Einzelkontakt, Contact person / Ansprechpartner; no default. |
| `company_name` | Company name / Firmenname | Text; Organization required; Individual contact optional; Contact person displays the linked Organization name read-only. |
| `first_name`, `additional_names`, `last_name` | First name / Vorname; Additional given names / Weitere Vornamen; Last name / Nachname | Structured name storage with one plain text input per field; Individual contact and Contact person only. Last-name conditional rules follow the PRD. |
| `salutation` | Salutation / Anrede | Optional configurable single choice; initially Mr / Herr, Ms / Frau and Mx. Correspondence metadata, separate from the personal name and title; Individual contact and Contact person only. |
| `name_prefix` | Academic title / Titel | Optional configurable single choice; common starting titles such as Dr., Prof. and Prof. Dr. Used as the name prefix in formatted names, not as a salutation. |
| `name_suffix` | Name suffix / Namenszusatz | Structured name storage with one plain text input, e.g. Jr. or III; Individual contact and Contact person only. |
| `formatted_name` | Formatted name / Formatierter Name | Derived readable name; never independently competing with the source fields. Contact Keyword follows the PRD's CRM display rule. |
| `emails`, `phones`, `addresses`, `websites` | Email addresses / E-Mail-Adressen; Telephone numbers / Telefonnummern; Addresses / Anschriften; Websites / Webseiten | Separate structured repeated values for every Contact kind; start empty. |
| `birthday` | Date of birth / Geburtsdatum | Partial birthday; Individual contact and Contact person only. |
| `gender` | Gender / Geschlecht | Optional configurable single choice for Individual contacts and Contact persons. Initially Female / Weiblich, Male / Männlich, Other / Divers and Not specified / Keine Angabe; no default or inference from Salutation. Shown in Further details. |
| `commercial_register` | Commercial register / Handelsregister | Text; Organization and Individual contact only. |
| `notes` | Notes / Notizen | Reusable recipe. |

Accepted Contact additions — selected product scope and local delivery status (2026-11-05):

| Field / addition | English / German label | Standard meaning and boundary |
| --- | --- | --- |
| `job_title` | Job title / Position | vCard `TITLE`: professional position, distinct from the existing academic name prefix. Applies to personal/organizational work context. |
| `function` | Function / Funktion | vCard `ROLE`; direct optional multiple-choice Contact field for Contact persons and Individual contacts, distinct from application roles. Its configurable options start empty. |
| `department` | Department / Abteilung | Organizational units carried after the organization name in vCard `ORG`. The exchange mapping must retain supported unit hierarchy. |
| `nickname` | Nickname / Spitzname | vCard `NICKNAME`, separate from the derived CRM Keyword and legal name fields. |
| `languages` | Communication languages / Kommunikationssprachen | vCard `LANG`: language tags for contacting the person/entity, independently of the app's available interface languages. |
| `messenger_addresses` | Messenger addresses / Messenger-Adressen | vCard `IMPP`: ordered Usage / Type / URI entries, with configurable labels and optional single selection per group, consistent with Telephone. Type does not rewrite the URI; never fetch or contact an endpoint merely because it is stored. |
| `contact_time_zone` | Contact time zone / Zeitzone des Kontakts | vCard `TZ`; separate from the current viewer's personal/workspace display time zone. |
| `anniversary` | Wedding anniversary / Hochzeitstag | vCard `ANNIVERSARY`: marriage or equivalent; optional for Individual contacts and Contact persons, with month/day and an optional year. |
| `death_date` | Date of death / Todestag | vCard extension `DEATHDATE` (RFC 6474); optional for Individual contacts and Contact persons, with month/day and an optional year, displayed with Date of birth in Further details. |
| Photo/Logo preparation | Photo / Foto; Logo / Logo | vCard `PHOTO`/`LOGO`; disabled presentation only, without media values or URLs in the database. Upload, storage, field-level media rights, remote fetching and exchange remain pending. |

Title/Function/Department describe an organizational context. Since a Contact person belongs to at most one Organization, these are direct fields on that Contact record. Individual contacts always show them, including without a company name. Professional details appears beneath Photo on large screens; narrow layouts stack it after Photo. Changing/removing Organization retains the fields and uses ordinary Contact field rights/history. This addition does not introduce a second Organization per Contact person or merge Identity records.

Date of death is implemented in the local Contact profile. [RFC 6474 section 2.3](https://www.rfc-editor.org/rfc/rfc6474.html#section-2.3) defines `DEATHDATE` as an optional date-and-or-time or text property, including yearless examples. The initial xObject field `death_date` (Date of death / Todestag) is optional for Individual contacts and Contact persons and appears in Further details beside Date of birth. The initial editable profile uses month/day with an optional year, like Date of birth and Wedding anniversary; it does not fabricate a year, time or time zone. Absence makes no statement about whether a person is alive. Broader external date/time/text representations require a declared future exchange policy and are not silently coerced into this editable subset.

Suggested contexts are Work / Geschäftlich and Home / Privat, with telephone labels Mobile / Mobil and Fax / Fax where relevant; they are configurable labels, not rights or fixed single-value slots. Anrede/Salutation and academic-title choices are independently configurable through normal field input aids. Their optional empty state is not a gender statement. All personal name fields are always visible in Name & organization: Salutation, Academic title, First name, Additional given names, Last name, Name suffix, then Organization when applicable. Name & organization appears alongside the Photo/Logo preparation on large screens. Further details follows on the next row alongside Language & time zone, containing Business number, birthday, Date of death, Wedding anniversary, Gender and applicable commercial-register information. Within Language & time zone, Contact time zone comes before Communication languages. Contact details and Addresses follow side by side. The paired groups stack on smaller screens. Organizations retain company-name-only personal identification. The salutation is not included in the formatted personal name; the selected title label uses the workspace default label language. Formatted name is the Organization/company name for an Organization or sole-business representation; for a personal representation, join populated prefix, given/additional/family names and suffix in that order. Name formatting is an initial proposal, not an international personal-name sorting algorithm. Multiple components must not be lost by a future mapping. When First name is empty, omit the separator in personal Keywords; for a Contact person without an Organization, omit the parenthesized suffix. Linking/renaming an Organization refreshes authorized derived projections without copying its name into editable Contact-person data. Hidden Organization names must not leak through derived Keywords/history/search.

Relationships: `contact_person`, `contact_identity`. The supplied Organization-membership relationship has no attributes. Multiple Function choices are stored independently on each personal Contact record. Generic user-defined relationship fields remain available under ADR 0032 with their own both-endpoint rights and history. Validity periods and automatic role inference are not in the lean initial proposal.

Acceptance: select each Contact kind before creation, retain it without an in-form selector, reject normal API/MCP kind changes, omit derived-name inputs and keep the fixed core separate from configurable additions; reject incompatible values and a second Organization; preserve multiple addresses/emails/phones and a yearless birthday; change Organization/name and verify formatted/CRM names; unlink with appropriate requiredness and verify the suffix; link Identities without merging values/rights; change one Contact's roles without affecting an Identity-linked Contact, and change/remove Organization without clearing professional details. No derived label may bypass field/endpoint permissions. These Contact cases are locally accepted on 2026-11-05; the development guide records the evidence. The four later Contact-kind conversion workflows and their preservation/transaction rules are specified once in the [PRD](PRD.md#planned-contact-kind-conversion-workflows); their implementation and acceptance remain pending.

### Distribution lists — `distribution_lists`

General contains the standard Keyword (the list's readable name) and a short multiline plain-text `description`. A separate Markdown `notes` field is placed in the final Notes section. The supplied template starts without business numbering; the demo description has three short English lines. The member relationship `distribution_members` follows the ordinary list-only Relationships section. Membership is explicit and manually maintained; no dynamic query list, subscription engine or mail sending is included. Contacts can belong to multiple lists. Linking a member uses its record identity, not its current email. An email preference change never changes membership. Empty lists are valid; restricted members remain protected rather than silently removed. A user who cannot read all members sees only permitted members and cannot edit that relationship field; scalar edits retain the complete membership. An authorized user can maintain the full list.

Accepted locally (2026-11-05): create an empty list, add several Contact kinds, reject a duplicate membership, remove one member without deleting the Contact and verify independent Category values. A future exchange profile must expose unsupported member kinds instead of silently flattening them into mailing addresses.

### Appointments — `appointments`

Fields: `description`, `start`, `end`, `location`, `organizer`, `attendees`, `busy`, `recurrence`, in that order. Start / Beginn and End / Ende use temporal values; Organizer / Organisator is an optional single calendar party and Attendees / Beteiligte is a collection. Busy / Belegt is Boolean, initially true; Recurrence / Wiederholung is optional. Start is required for a valid Appointment. Start/end must have matching date/timed semantics; this initial profile uses one event zone for zoned boundaries. End is optional; when present it is later than Start and exclusive. The form can display a single-day or inclusive leave-style selection while preserving the canonical boundary. A missing timed end means no supplied duration; no default one-hour event is invented.

Use optional Type/Status for business classification; empty Status remains empty internally. Initial status suggestions Tentative / Vorläufig, Confirmed / Bestätigt and Canceled / Abgesagt carry explicit exchange mappings, independent of their labels. Without Type has these suggestions initially; no extra Type is fabricated. Organizer/attendee responses remain separate. External invitations and reminders are not sent.

Acceptance: save a single-day all-day Appointment and a multi-day interval with the correct boundary; validate timed and date-only variants, gaps/overlaps, explicit zone and no-end handling; change viewer zone without changing stored intent; move one recurring occurrence without changing its identity or the series; keep attendee response independent of event status and xObject access.

### Vacations — `vacations`

Fields: `person`, `description`, `start`, `end`, `busy`, in that order. Start / Beginn and End / Ende are required temporal values and share Appointment interval semantics; the UI starts in date-only mode and supports timed absence without rounding it to whole days. Busy / Belegt starts true; Person is optional until the workspace requires it. No current-user default is inferred. Keep Vacation identity distinct from Appointment identity; a future calendar projection must not create an additional user-visible xObject Appointment record. Series support reuses the temporal contract if later exposed, without inventing recurrence for existing leave.

No leave balance, payroll, half-day accounting, approval workflow or legal absence policy is implied. Type/Status can be configured normally, but a business approval status is not automatically mapped to calendar confirmation. The proposed initial dictionary remains empty; future projection policy must explicitly say which business statuses expose an absence interval.

Acceptance: enter a date-only leave range including its final selected day and a timed absence; reject invalid/mixed intervals; preserve Person and original identity while projecting; verify no duplicate calendar copy and no implied approval, access grant or entitlement calculation.

### Tasks — `tasks`

Fields: `description`, `responsible`, `start`, `due`, `priority`, `progress`, `completed_at`, `notes`, in that order. Organizer, attendees and recurrence are later extensions. Start / Beginn and Due / Fällig am use temporal values and are independently optional. When both exist, this standards-oriented starting profile requires matching temporal forms and Due strictly after Start; date-only equality is not silently rewritten during exchange. Completed at / Erledigt am is a UTC instant, independently recorded rather than reconstructed from `updated_at`. Progress is optional 0–100. Task work assignment uses Access principals; there is no additional assignment field. Future Organizer/Attendees may add standards-specific roles and responses without a second assignee list. No separate editable Completed Boolean duplicates completion state. Recurrence needs an anchor and the shared series contract; until its domain implementation exists, a plain Task remains nonrecurring.

Initial Without Type statuses are Open / Offen, In progress / In Arbeit, Done / Erledigt and Canceled / Abgebrochen; no default. Explicit status meanings remain configurable independently of labels. The three Priority suggestions remain configurable. Status meanings are explicit metadata, independent of labels/position; module priority options retain purpose UUID bindings for future exchange. Exact incoming exchange priorities are later work. Entering a completion state must submit a consistent completion/progress change atomically; no silent current-time timestamp is invented. The visible completion/reopening proposals and final-state rules are specified in PRD section 6.2. Series completion remains later work. Selecting Responsible changes neither ownership nor participation; changing Access principals changes both activity assignment and ownership.

Acceptance for the implemented Task core: create an undated Task, a date-only due Task and a zoned timed Task; reject incompatible start/due types/order; preserve explicit completion time across unrelated edits; validate progress bounds; rename mapped statuses/priorities without changing their mappings; verify that activity assignees are the Access principals and foreign access does not add participants. Exchange values and attendee response require later acceptance.

## Lean profiles

Each row is one object profile, in catalog order. Field keys refer to the recipes above; the order is the initial form order. Relationships refer to the next section and are optional initially. Primary context is provided by Projects, not duplicated by extra per-object Project/Case scalar IDs.

| Object key | Ordered additional fields | Initial explicit relationships | Profile rule and observable acceptance |
| --- | --- | --- | --- |
| `vouchers` | `description`, `recorded_on`, `reference_number`, `amount` | `voucher_contacts`, inverse `voucher_lines`, inverse `contract_vouchers` | Generic voucher metadata only. Save a reference/date/amount, associate parties and lines; retain deliberately entered amount without generating totals, taxes or an invoice document. |
| `external_services` | `description`, `start_date`, `end_date`, `amount` | Inverse `service_supplier` | Record a service and optional supplier; validate date range and nonnegative amount. No procurement, billing or supplier-status workflow. |
| `campaigns` | `description`, `responsible`, `start_date`, `end_date` | `campaign_lists` | Link multiple existing lists and change dates; no mail is sent and lists are not copied. |
| `contact_reports` | `description`, `occurred_at`, `responsible` | `report_contacts` | Retain the interaction's business instant separately from creation time; link several Contacts without changing their values/rights. |
| `line_items` | `description`, `quantity`, `unit`, `unit_price` | `voucher_lines`, `line_product` | A line may have one Voucher and one Product, independently optional. Reject a second parent without explicit replacement; preserve exact quantity/price and entered units without calculated totals or currency conversion. |
| `products` | `description`, `product_code`, `unit`, `unit_price` | Inverse `line_product`, inverse `usage_product`, inverse `group_products` | Create goods/services without mandatory identifiers; link a product to several groups, preserving its identity. No stock, tax or price-list engine. |
| `product_usages` | `description`, `start_date`, `end_date`, `quantity` | `usage_product`, `usage_contact` | At most one Product and beneficiary Contact per usage; validate interval/quantity and keep two usages of the same Product distinct. No installed-base automation. |
| `product_groups` | `description` | `group_products` | Group several Products; a Product may be in several groups. No mandatory hierarchy or external classification catalog. |
| `expenses` | `description`, `recorded_on`, `amount`, `paid_by` | `expense_voucher` | Enter an amount/business date and optional Voucher; changing payer grants no rights. No reimbursement, tax, receipt upload or approval automation. |
| `opportunities` | `description`, `responsible`, `expected_value`, `probability`, `target_date` | `opportunity_contacts` | Validate probability without automatic weighting; preserve currency and target date; link several business Contacts without a mandatory sales pipeline. |
| `contracts` | `description`, `reference_number`, `start_date`, `end_date`, `responsible` | `contract_contacts`, `contract_vouchers` | Record metadata/parties and validate dates. No renewal/notice calculation, signatures, uploaded contract or automatic obligations. |
| `projects` | `description`, `responsible`, `start_date`, `target_date`, `notes` | Primary only initially | Preserve the already agreed fields. Accept an internal Project without Contact; validate dates and keep derived child context consistent. |
| `resource_plans` | `description`, `resource`, `start_date`, `end_date`, `capacity_hours` | Primary only initially | Record an optional user/group resource and exact planned effort. Reject negative effort and reversed dates; no capacity availability, calendar reservation or conflict solver. |
| `risks` | `description`, `responsible`, `probability`, `impact`, `mitigation` | Primary only initially | Record probability and configurable impact; validate range without calculating a risk score or prescribing a risk methodology. |
| `cases` | `description`, `responsible`, `start_date`, `target_date`, `notes` | Primary only initially | Validate the inclusive date range; accept a standalone Case or an optional Contact/Project parent without mandatory ticketing/SLA workflow. |
| `time_entries` | `description`, `person`, `recorded_on`, `duration_hours` | Primary only initially | Enter exact nonnegative hours for a business date; no timer, inferred interval, billing or multiplication by hourly rates. Empty duration stays empty rather than zero. |
| `goals` | `description`, `responsible`, `target_date`, `progress` | Primary only initially | Record an objective and optional percentage; validate 0–100 without inferred completion, KPI formulas or automatic aggregation. |

All lean dictionaries are initially empty except the explicit Impact suggestions. Project, Case and Task status suggestions can reuse R-029 as editable input aids; these are not enforced workflows. User/group references target eligible active workspace identities with normal retained-reference rules. Repeated creation of the same business text remains allowed unless a Designer explicitly enables a supported uniqueness rule.

## Supplied relationship proposals

Every row defines one directed object pair, except the symmetric Identities row. Cardinality is conventional left:right: `1:n` lets one left record have many right records and each right record at most one left record; `n:1` is the inverse. All endpoint minima initially zero; the single-Organization maximum and endpoint conditions remain mandatory. Side labels describe the opposite records as in ADR 0018. Definitions/configuration remain versioned and atomic; labels below are English / German. General and Primary are not duplicated here.

| Technical name | Left object → right object | Cardinality | Left-side label | Right-side label |
| --- | --- | --- | --- | --- |
| `contact_person` | `contacts` (Organization) → `contacts` (Contact person) | 1:n | Contact persons / Ansprechpartner | Organization / Organisation |
| `contact_identity` | `contacts` (Individual contact or Contact person) ↔ same kind set | n:m, undirected symmetric | Identities / Identitäten | Identities / Identitäten |
| `distribution_members` | `distribution_lists` → `contacts` | n:m | Members / Mitglieder | Distribution lists / Verteiler |
| `voucher_contacts` | `vouchers` → `contacts` | n:m | Parties / Beteiligte Kontakte | Vouchers / Belege |
| `voucher_lines` | `vouchers` → `line_items` | 1:n | Line items / Positionen | Voucher / Beleg |
| `service_supplier` | `contacts` → `external_services` | 1:n | External services / Fremdleistungen | Supplier / Lieferant |
| `campaign_lists` | `campaigns` → `distribution_lists` | n:m | Distribution lists / Verteiler | Campaigns / Kampagnen |
| `report_contacts` | `contact_reports` → `contacts` | n:m | Contacts / Kontakte | Contact reports / Kontaktberichte |
| `line_product` | `line_items` → `products` | n:1 | Product / Produkt | Line items / Positionen |
| `usage_product` | `product_usages` → `products` | n:1 | Product / Produkt | Product usages / Produkteinsätze |
| `usage_contact` | `product_usages` → `contacts` | n:1 | Beneficiary / Nutzer | Product usages / Produkteinsätze |
| `group_products` | `product_groups` → `products` | n:m | Products / Produkte | Product groups / Produktgruppen |
| `expense_voucher` | `expenses` → `vouchers` | n:1 | Voucher / Beleg | Expenses / Spesen |
| `opportunity_contacts` | `opportunities` → `contacts` | n:m | Contacts / Kontakte | Opportunities / Verkaufschancen |
| `contract_contacts` | `contracts` → `contacts` | n:m | Contract parties / Vertragsparteien | Contracts / Verträge |
| `contract_vouchers` | `contracts` → `vouchers` | n:m | Vouchers / Belege | Contracts / Verträge |

The supplier/beneficiary/party names express business association, not permission grants. Create these definitions only when their object dependencies are installed; deactivation retains identities/edges/history and obeys PRD shared-module rules. No relationship points at a later-module object. The proposed technical names identify templates, not a requirement to adopt fixture definitions by name. Configure both endpoint labels in the supplied template. Existing records and restricted/inactive endpoints retain normal lifecycle behavior; no cascade or silent unlink is introduced.

## Exchange mapping proposal

These are selected semantic mappings, not implemented serializers. Proposed first exchange baseline: vCard 4.0 (RFC 6350) and iCalendar 2.0 (RFC 5545), restricted to the field/recurrence subset below. Complementary JSON design references are JSContact 2.0 (RFCs 9553/9982) and JSCalendar (RFC 8984); no JSON exchange endpoint is proposed initially. Extensions such as RFC 10051 remain a separate declared capability. Required wire-envelope and validation rules must be included before claiming an implemented serializer. Sources: [vCard](https://www.rfc-editor.org/rfc/rfc6350), [JSContact](https://www.rfc-editor.org/rfc/rfc9553), [JSContact 2.0](https://www.rfc-editor.org/rfc/rfc9982), [conversion guidance](https://www.rfc-editor.org/rfc/rfc9555), [iCalendar](https://www.rfc-editor.org/rfc/rfc5545) and [JSCalendar](https://www.rfc-editor.org/rfc/rfc8984).

| xObject meaning | Proposed exchange mapping | xObject-specific boundary |
| --- | --- | --- |
| Exchange identity | vCard/iCalendar `UID`; series exceptions add occurrence identity | Separate per-connection resource/version metadata; never identify a Contact by email. |
| Name and communications | `FN`, `N`, `EMAIL`, `TEL`, `ADR`, `URL`, `BDAY` | Project typed values/components without replacing CRM Keyword or merging Identities. |
| Contact kind and Organization | Organization → `KIND:org`; Contact person → `KIND:individual` plus organization context | An Individual contact may be a person or sole business; mapping its kind needs an explicit discriminator, not a guessed name. |
| Distribution list | `KIND:group` with `MEMBER` references | Category remains an independent classification. Unsupported member references block destructive round trips. |
| Appointment and Vacation interval | `VEVENT` dates/times, end, zone, recurrence and exceptions | Vacation approval has no implicit calendar-status meaning. |
| Task timing and completion | `VTODO` start/due, percentage and completion instant | No synthetic due date or completion time; assigned user and calendar attendee remain distinct. |
| Task status suggestions | Open → `NEEDS-ACTION`; In progress → `IN-PROCESS`; Done → `COMPLETED`; Canceled → `CANCELLED` | Option identity stores the mapping. An unmapped custom Status cannot be silently guessed. |
| Priority suggestions | High → 1; Normal → 5; Low → 9; no selection → 0 | These are chosen outgoing representatives; incoming 1–9 retain their exact exchange value rather than losing precision through three labels. |
| Categories/description | Independent categories and plain description | No HTML execution, category-to-distribution conversion or implied external rights. |

The mapping table's status/priority choices are xObject proposals using the standard vocabulary. Standard capability levels, privacy and scheduling semantics never override xObject permissions. Appointment confirmation maps separately from Task status. A configured empty or unmapped classification needs a declared omission/rejection rule in the exchange profile; no empty business Status is silently populated by a connector.

## Common acceptance and implementation prerequisites

For every profile, execute its row/scenario plus create/read/edit through UI/API/MCP, requiredness/choice changes, stale version rejection, exact field/edge journaling and induced-failure rollback, permission filtering, recycling/restoration and module deactivation/re-activation without identity/value loss. Verify labels in English/German, editability of forms/input aids, stable standard-field identities and protected structure. Execution evidence belongs to the implemented slice and is recorded in the development guide; these proposed scenarios do not imply blanket acceptance.

Resolve these before the affected implementation:

1. Nine contact codecs and the common temporal codec are implemented with typed storage/editor/history. Extend these with calendar parties and bounded sparse recurrence overrides later. Validate each new codec against its acceptance gates. Existing generic Date/Date-time contracts stay unchanged; no fallback DTOs.
2. Shared field ownership for edge attributes, both-endpoint permissions and shared-module contributions and one common object form are implemented. Complete released template-migration tooling remains open. Derived Contact-name redaction and UUID-purpose bindings are already implemented locally. No hard-coded technical-name inference.
3. Exact standard-profile versions/property coverage, floating/unknown temporal forms, completion/series state rules, incoming unrepresentable priorities/statuses and loss-aware retention. No RFC extension is claimed merely because it exists.
4. Business clarification only where it changes the baseline: whether an Individual contact needs an explicit person/sole-business discriminator for exchange, whether Vouchers should later distinguish offers/orders/invoices, whether resources extend beyond users/groups, and whether leave needs approval/entitlement. The current proposals keep these generic and do not block a lean metadata implementation.

This appendix introduces no release, database change, new credentials, external connection, synchronization job or operational task list. OpenProject remains the planning authority. Future interoperability acceptance needs real adapters and peer fixtures; a documentation link is not proof of compatibility.
