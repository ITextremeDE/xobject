# Configure relationship types

Define a custom relationship in **Settings → Workspace → Relationship types** as an Administrator or Designer. Ordinary Users can inspect definitions. This configures the model; [Link with… and New linked record](user-guide.md#connect-records) create actual links between records under their content permissions.

## Choose the relationship model

**General** is always available. **Primary association** belongs to Projects & Tasks and has the fixed Contact → Project → Case meaning. Its roles cannot be reassigned. Custom relationships each describe one object pair; add separate types for different pairs rather than making one ambiguous catch-all definition.

Use **directed** when the sides have distinct roles, such as Device covered by Contract. Use **undirected** when the relationship is reciprocal, such as identities of the same person. Direction describes meaning, not a permission grant. A directed link is still visible from both readable endpoints using the opposite-side label.

## Create a device-contract relationship

First create the custom **Devices** and **Service contracts** objects from the [model example](model-design.md). The supplied Contracts object is later scope; this example uses a separately named custom object.

1. Choose **Add relationship type** and select the two object types first: Devices on the left, Service contracts on the right.
2. Choose directed and a lasting technical name such as `device_service_cover`.
3. Give the left side the label **Service contract**: on a Device it names the opposite record. Give the right side **Covered devices**: on a Contract it names the Devices.
4. Choose cardinality `n:1`: many Devices may share a Contract; each Device may have at most one Contract of this type. Leave endpoint required-link rules optional for this example.
5. Review the definition and activate it when existing records satisfy its rules.
6. In the [Form designer](forms.md#place-relationships-and-access-controls), place Service contract in the Device's General group and Covered devices in a suitable Contract group.

Create or open a Device, link a readable Contract and save. Open the Contract to inspect its Covered devices. A second Contract cannot be added to that Device through the same relationship type without a valid replacement. Other relationship types remain independent.

## Cardinality and required links

The UI shows **one left:right cardinality**, not two separate ratios:

| Cardinality | Meaning |
| --- | --- |
| `1:1` | Each record has at most one opposite record |
| `1:n` | One left record may have many right records; each right has at most one left |
| `n:1` | One right record may have many left records; each left has at most one right |
| `n:m` | Both sides may have several opposite records |

The same maxima matter for undirected relationships. Symmetric same-object relationships use compatible sides. Required-link rules define whether a side must have a link; choosing a maximum of one does not itself make the link mandatory. The relevant controls depend on direction, pair and symmetry, so the form hides inputs that have no meaning for the selected model.

Recycled records retain links and cardinality slots. Stricter activation/configuration preflights existing data; it cannot silently discard links. An established used pair/direction cannot simply be repurposed. Keep the identity and translated labels for the original meaning, or create a distinct relationship type.

## Conditional endpoints and attributes

When applicability controls are offered, they restrict eligible endpoint records using supported single-choice controller identities. Supplied Contact membership, for example, permits one Organization per Contact person. This is a data-validity rule, independent of display layout and permissions. Candidate pickers apply relevant constraints before paging. A record edit cannot leave retained relationships invalid.

Relationship-owned fields store information about a particular link, such as **Coverage notes**, using the normal field kinds and editor. Add them to the relationship definition, then enter their values while editing that link. They are not copies of an endpoint's field. Reassigning a link creates a new edge; old attribute values are not automatically transferred.

Attribute reads require access to both endpoints and the attribute in both contexts. Attribute editing requires both endpoints and the attribute editable. This is stricter than an attribute-free link from one editable endpoint to a readable target. General and Primary do not expose custom attributes. Professional fields on Contacts are direct Contact fields, not attributes of Organization membership.

## Primary requirements and lifecycle

With Projects & Tasks active, configure required Primary context per object in **Object types**. The chain is fixed; choose required levels rather than redefining their roles. Requirements preflight retained records and affected descendants, including recycled data, before committing. Disabling the module requires removing Primary edges and clearing Primary requiredness first. [Workspace modules](workspace-settings.md#modules-and-shared-objects) explains retained/shared definitions.

Definitions and changes are versioned and journaled. Deactivation retains identities/history; protected system and module structure cannot be deleted or reinterpreted. Link and attribute changes appear in both endpoint journals under current permissions. Definition settings are separate from the record recycle bin and from permanent record deletion.
