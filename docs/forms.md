# Arrange record forms

Use **Settings → Workspace → Form designer** as an Administrator or workspace Designer. The designer arranges existing fields and relationships; create their definitions first in Object types or Relationship types. Ordinary Users can inspect the designer read-only.

## Build a readable layout

Select an existing object type. For the custom Devices example from [object design](model-design.md):

1. Keep the initial **General** group or rename it using the translation editor.
2. Assign Keyword and Serial number to General with each element's **Group** selector.
3. Add a group for Purchase details; assign Purchase price and Purchased on to it.
4. Set group/field widths, and move groups or elements using their up/down controls.
5. Place Notes in a final full-width group. Save, then open a Device record to inspect the actual layout.

Half-width groups can sit side by side on a wide screen; narrow screens stack them. A field can be half or full width where supported. Lists/tables and the complete Primary chain use full width. Group names and order have no domain meaning: there is no mandatory Business details or Relationships group.

Saving changes the common form for the object, including its appearances in different module sections. Personal navigation arrangements do not create personal forms. Reset discards the pending layout changes; switching objects with a dirty draft asks for a decision.

## Place relationships and access controls

Custom one-target relationships render as fields and can sit beside suitable scalar fields, such as a Device's service contract in General. Multi-target relationships render as tables; give them enough room in an appropriate group. The cardinality is defined by the relationship, not by choosing a narrower form width.

Relationship controls offer visibility and, for tables, initial expansion settings. A hidden optional relationship can be revealed temporarily from the record. Hiding a control grants no confidentiality: current backend rights still govern the relationship and its values. Required Primary/relationship elements remain visible. The Primary chain is a single form element; you cannot redefine Contact → Project → Case in the designer.

On sensitive objects, the protected **Access principals** field can be positioned, ordered and given a supported width using its existing identity. This changes its placement, not its ownership or activity-assignment behavior. [Access administration](access-administration.md) explains its rights details.

## Unassigned and removed groups

Newly added elements remain Unassigned until you place them. They remain available; adding or deleting a group never deletes field definitions or data. Removing a group moves its elements to Unassigned. Required inputs must remain reachable. Do not use form placement as a permission boundary or as a substitute for [definition lifecycle](model-design.md#place-fields-link-objects-and-manage-lifecycle).

## Supplied Contact forms

Organizations, Contact persons and Individual contacts have fixed kind-specific core forms. Their name, professional, channel/address, language/time and applicable personal/company sections are provided by the module. The designer arranges **extensions**: user-defined fields and custom relationships outside that core.

The core's intended input aids, labels and supported field rules remain configurable in Object types, subject to protection and existing-data validation. You cannot move/remove protected core components or turn a Contact person into an Organization by rearranging the form.

Projects, Cases and Tasks instead have editable supplied starter layouts. They keep protected field/domain semantics even when their groups move. One shared Contacts object has one common extension layout across modules; there is no module-specific form selector.

Conditional visibility by Type/Status is [planned](PRD.md#34-planned-conditional-field-visibility). Current semantic applicability is different: it determines whether a value is valid, not merely whether its control is visible.
