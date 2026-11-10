# How xObject fits together

xObject stores connected information in configurable workspaces. Start with the supplied Contacts and Projects modules, add your own data objects, and use the same records in the web app or through API/MCP integrations.

## Object types, fields and records

An **object type** defines what you store. A **field** defines one piece of information on that object. A **record** is one actual item.

For example, create an object type called **Devices**, add a text field called **Serial number**, then create a record for a particular laptop. All Device records use that field definition. A relationship can connect the laptop to its service contract without copying the contract into the Device record.

Each record has a stable ID. An optional **Keyword** is its readable name; an optional **Number** is generated from the object's numbering rules. Neither a renamed Keyword nor a changed translation changes the record ID. See [designing objects and fields](model-design.md).

## Workspaces and modules

A workspace contains its own records, definitions, groups, module activations and number sequences. Ordinary users see only workspaces and contents permitted to them. An installation Administrator has access across workspaces, so separate workspaces are not separate administrative trust boundaries.

Modules supply useful starting models:

| Module | Supplied V1 objects |
| --- | --- |
| Contacts & Relations | Contacts and Distribution lists |
| Projects & Tasks | Projects, Cases, Tasks and the same Contacts |

Enabling both modules uses one Contacts object and the same records. Module membership does not create a second copy or a separate form. The common form contains the applicable fields contributed by active modules and your own additions. Supplied structures are protected; supported labels, input aids and extensions remain configurable. [Workspace configuration](workspace-settings.md) explains activation and shared settings.

Documents & Communication and additional supplied objects are planned. The [roadmap](../ROADMAP.md) distinguishes V2 from work without a release assignment.

## Relationships and context

**General** links are available independently of modules. Custom relationship types connect a particular pair of object types, for example Devices and Contracts. Their labels and cardinality explain what each side means and how many records may be connected.

Projects & Tasks additionally supplies the fixed **Primary association** chain **Contact → Project → Case**. A Task can belong directly to a Project, a Case or another permitted Primary level; not every chain must be complete. xObject stores one direct parent and derives its ancestors. The tree follows this hierarchy; the Dossier shows permitted relationships more generally. Linking records grants no access to either endpoint. See [connecting records](user-guide.md#connect-records) and [configuring relationships](relationships.md).

## Configuration roles and content access

An installation **Administrator** manages accounts and base security and can access all contents. A workspace **Designer** configures its model and forms. A workspace **User** uses permitted contents and views configuration read-only. Designer status and workspace membership do not grant business-content access by themselves.

Object and field permissions limit what someone may use. Sensitive records additionally use ownership through **Access principals** and configured **foreign access**. On activities, Access principals also identifies the people/team doing the work; **Responsible** is a separate coordinating reference. Notifications are not delivered in V1. [Access administration](access-administration.md) provides a worked example.

## Notes, Journal and recovery

**Notes** are editable business text. The **Journal** is immutable change history, with individual field and relationship events. A timestamp typed into Notes is not an audit event.

The recycle bin retains records and their links for guarded restoration. Permanent deletion removes operational contents but retains complete history for installation Administrators; other eligible users see only a content-free deletion notice. [Record lifecycle](user-guide.md#recycle-and-restore) and [installation backups](self-hosting.md#back-up) serve different recovery needs.

Continue with [First steps](first-steps.md) for a working example or [Using xObject](user-guide.md) for daily work. The [PRD glossary](PRD.md#2-terms-and-actors) is the full requirements vocabulary, including clearly marked later concepts.
