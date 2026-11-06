# Using xObject

xObject connects Contacts, Projects, Cases, Tasks and your own object types in workspaces. Version 1 is entirely Community. This guide describes the current local implementation; published releases and their documentation will identify the exact accepted version.

## Sign in and choose a workspace

Your installation Administrator creates accounts. A new ordinary account must change its initial password before using the app. The first Administrator is created by the [installation operator](self-hosting.md#initialize-and-sign-in).

Choose a workspace in the sidebar. Search combines permitted navigation and record results. Use **Cmd/Ctrl + K** to open it; keyboard help is available in the user menus. In supported forms, **Cmd/Ctrl + Enter** submits Save. Native Tab, arrow-key and menu navigation remain available.

Lists show the object's icon and standard fields. Search, filters, sorting, column visibility, row counts and paging are shared across views. Selection applies to the current page; it does not authorize a bulk operation. Open a row to inspect its record, or use its action menu to duplicate/recycle when permitted.

The Dashboard starts with **All records**, **Contacts**, **Projects**, **Cases**, **Tasks** and **Distribution lists** filters for the available object types. Use **Add filter** to add a custom object type; selecting it filters the shared record table.

## Create or edit a record

Choose **Create record**, fill the available fields and save. The object definition determines types, choices, requiredness and initial values. The optional **Number** (German: **Nummer**) is a configurable record number stored as `record_number` and assigned transactionally; record IDs identify records independently of display names/numbers.

Record groups are arranged in the Form designer where the supplied module permits customization. Required fields remain reachable. Markdown-enabled fields provide a preview; timestamp insertion uses your current display zone/region and name, then starts the next line. Unsaved changes remain a draft until Save.

**Duplicate** opens an unsaved creation draft. Edit it before saving normally. Unique/system values, ownership and relationships are not blindly copied. Cancel leaves no new record. The normal record actions also include an ID-copy menu.

## Contacts and distribution lists

Select **Organization**, **Contact person** or **Individual contact** when creating a Contact. Normal editing retains that kind. The fixed core form shows the applicable personal/company fields; additional custom fields can be arranged separately by a Designer.

Contact Keyword is calculated. An Individual contact uses Company name when filled, otherwise Last name and First name. Organizations use Company name. A Contact person can have at most one Organization. Job title, Department and Function describe that Contact record and remain when its Organization changes.

Telephone numbers, email addresses, websites, messenger addresses and postal addresses are ordered structured entries. Choose Usage/Type where provided, add/remove entries and reorder them to change preference. Postal previews derive from components. Personal dates can omit the year; a Contact's zone/languages are independent of your own display settings.

**Identities** links Individual-contact/Contact-person records belonging to the same person. It preserves separate records and permissions. Distribution-list membership is explicit; inspect the Members relationship rather than assuming every Contact is included. Photo/Logo currently has presentation preparation; uploading is later scope.

## Projects, Cases and Tasks

Activate **Projects & Tasks** to use its supplied objects and Primary association. Responsible coordinates work. **Access principals** is the single participation/work-assignment list for activities, including Task assignees. Foreign access lets other people use permitted contents without assigning them that work or sending notifications.

Use dates and scheduling/progress controls according to their field labels. Date-only values remain dates; instants use the effective time zone. Ambiguous daylight-saving times require an explicit occurrence; nonexistent local times are rejected.

Administrators configure Type/Status options and their task-completion meaning. Selecting the configured completion status proposes 100% and a completion time, saved with the record. Reopening clears completion consistently. The application uses the configured semantic meaning rather than a particular translated status name.

## Connect records

**Link with…** selects existing records; **New linked record** creates a new record with an atomic link to the source. The menus use the object pair and available relationship labels. A one-target relationship is a field; multi-target relationships are lists/tables.

Primary association follows **Contact → Project → Case**. Selecting ancestors filters descendants. Changing or clearing an earlier level clears later draft selections; the records themselves remain. Save persists the deepest direct parent and derives the other levels. Required levels are configured per object type.

The Projects-owned tree follows Primary descendants. **Dossier** lists the permitted linked records, including General/system relationships, and supports object filtering. Relationships do not grant access to their other endpoints. The **Journal** shows individual field and relationship changes under your current rights.

## Understand access

An Administrator has installation-wide access. Workspace Designers configure models/forms, while ordinary Users read those settings. Designer status and group membership do not themselves grant business contents. Administrative object/field ceilings, ownership and foreign access determine the actual record capabilities.

Sensitive records use **Access principals**. An empty owner list with confirmed public access makes the record available to workspace users within their existing object/field ceilings. Personal and Confidential modes impose additional restrictions. The detail area shows the applicable rights and permitted exceptions. See [the permission specification](PRD.md#4-permissions) for exact precedence.

Only explicitly authorized changes to security can widen visibility. Hidden fields, retained links and history stay protected across search, counts, lists, APIs and agent operations.

## Recycle and restore

A permitted Delete action moves a record to the workspace recycle bin. Its contents, links and history remain retained. Full access is required for restoration, which revalidates current definitions/dependencies. Permanent deletion requires confirmation and Full access; Administrators retain the complete immutable history, while other eligible users receive only content-free deletion notices. [Installation backups](self-hosting.md#back-up) provide separate recovery for the whole system.

## Personal and workspace settings

Personal settings contain Profile, Account & security, Appearance and Language & region. Language, time zone and regional formats can inherit workspace defaults. Light/dark/system selection is personal. Account security manages password/sessions, personal API/MCP tokens and OAuth-authorized applications.

Workspace settings contain shared appearance, language/region, modules, object/field definitions, relationships, forms, members and groups according to your role. A module can contribute to the same object identity as another module; it does not create a duplicate Contacts table. The [API guide](api.md) describes the same application capabilities for integrations and agents.
