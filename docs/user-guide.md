# Using xObject

xObject connects Contacts, Projects, Cases, Tasks and your own object types in workspaces. Version 1 is entirely Community. This guide describes the published Community 1.0.1 baseline. Subsequent unreleased behavior is marked explicitly; [released documentation snapshots](versions.md) retain the exact version context.

For an empty installation, start with [First steps](first-steps.md), including workspace creation and module activation.

## Sign in and choose a workspace

Your installation Administrator creates accounts. A new ordinary account must change its initial password before using the app. The first Administrator is created by the [installation operator](self-hosting.md#initialize-and-sign-in).

Choose a workspace in the sidebar. Search combines permitted navigation and record results. Use **Cmd/Ctrl + K** to open it; keyboard help is available in the user menus. In supported forms, **Cmd/Ctrl + Enter** submits Save. Native Tab, arrow-key and menu navigation remain available.

Lists show the object's icon and standard fields. Search, filters, sorting, column visibility, row counts and paging are shared across views. Selection applies to the current page; it does not authorize a bulk operation. Open a row to inspect its record, or use its action menu to duplicate/recycle when permitted.

Use **Type**, **Status** and **Category** above an object list to select one or more filter values. Values within one filter match any selection; different filters apply together. **Without value** finds unset entries. A Category parent also finds records assigned through its descendants. Type selection scopes the offered Status values. **Clear filters** removes classification filters while retaining the keyword search. Filters, order and page are retained when opening a record and returning to the list.

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

**Unreleased — planned for 1.0.2:** signing out or explicitly revoking a browser session disconnects all OAuth-authorized applications for your account, including offline connections originating in other or expired sessions. Reauthorize those applications to reconnect. Natural browser-session expiry does not disconnect offline access; actively used connections renew automatically, while seven days without successful renewal require authorization again. See [OAuth authorization](api.md#oauth-authorization) for the released baseline and pending correction.

Workspace settings contain shared appearance, language/region, modules, object/field definitions, relationships, forms, members and groups according to your role. A module can contribute to the same object identity as another module; it does not create a duplicate Contacts table. The [API guide](api.md) describes the same application capabilities for integrations and agents.

## Browser installation, links and live changes

Install xObject using the browser's installation action when available. An eligible browser also offers **Install app** in the user menu. On iPhone/iPad, use Safari's Share → Add to Home Screen action. Each installation origin has one app identity; workspaces remain available inside it. Installation requires HTTPS except on loopback and an internet/server connection to load and save business data.

Use **Copy link** or **Share link** in record actions or a record table's action menu. The recipient still needs an account and permission to read that record. Link previews show the application identity, never private record content. Public anonymous reading is planned for later.

Changes made by another user or an agent update open views automatically. Connection loss displays a status message; reconnect or returning to the window refreshes the view. An open record with unsaved edits keeps its draft. **Review changes** combines independent changes and asks which value to retain for each conflict. Apply the review, check the form and Save normally. Settings drafts keep their values; deferred source refresh resumes after Save or Discard. An available application update offers **Reload app** after pending edits have been saved or discarded.

## Multiple choices and selection trees

Multiple-choice and selection-tree fields show selected labels in a summary field. Use the adjacent selection button to open a searchable list or tree. Check one or more items and Apply to the form; Save the record normally. Cancel closes the picker without changing the form. The normal save shortcut applies the picker selection first. A concurrent change keeps your pending selection and offers the usual record conflict review after Apply. Selecting a tree child also selects its ancestors. Clearing a parent clears its descendants; selecting a parent alone does not select every child. Trees support arrow keys, Home/End and Space/Enter. The selected count includes ancestors; the limit is 100.

Designers/Administrators configure a general **Selection tree** field or choose tree mode for **Category**. Expand a choice's details to set its parent. Choices retain their UUIDs when moved or renamed. Inactive parents cannot have active children. Configuration deactivation follows the branch; retained inactive record selections remain readable. Changing the tree adds missing ancestors to stored selections in one journaled transaction. Conversion to a single-choice field is rejected if it would drop selected values.

## Opening URL fields

Use the arrow button beside a URL field to open the current HTTP(S) address in a new browser tab. The same action is available for Contact website entries and when you can read a value without editing it. Empty/invalid values have no active link. Opening a link keeps the current form and its unsaved changes in place.
