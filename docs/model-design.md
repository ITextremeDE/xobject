# Design objects and fields

Configure a workspace's data model in **Settings → Workspace → Object types**. An Administrator or that workspace's Designer can change definitions; ordinary Users can inspect them. Only Administrators change sensitivity and administrative content permissions. Configuration access does not itself grant access to business records.

## Create a custom object

This example creates **Devices** and later connects them to **Service contracts**. Both are custom examples, not additional supplied V1 objects.

1. Choose **Create object type**. Enter a readable name, and use `devices` as the technical name if it is available.
2. Add a German translation such as **Geräte** through the language selector when the workspace permits German definition labels. Save the translations together.
3. Create the object. It starts with an editable General form group and no optional standard fields.
4. Use **Add field → Keyword** to install its readable record name. Make it required only if every retained record can satisfy the rule.

Technical names use lowercase English `snake_case` and are fixed after creation. The workspace code prefixes the physical table name. Prefer a lasting technical identity over abbreviations tied to today's display language. Supplied module object names are reserved even when their module is disabled or planned. Use a distinct custom name; module activation does not adopt a custom object merely because its label matches.

Repeat the same steps for **Service contracts**, technical name `service_contracts`, and add Keyword. The later relationship example uses these two actual custom definitions. The supplied `contracts` name is reserved for a planned module object, so this example deliberately uses a different technical identity.

## Add and configure fields

Choose **Add field → Custom field** while an optional standard field is missing; otherwise **Add field** opens the custom-field dialog directly. For Devices, add:

| Label | Technical name | Kind | Example |
| --- | --- | --- | --- |
| Serial number | `serial_number` | Text | EXAMPLE-1042 |
| Purchase price | `purchase_price` | Money | 1250.00 EUR |
| Purchased on | `purchased_on` | Date | 2026-11-01 |
| Notes | `notes` | Multiline text, Markdown enabled | Working observations |

Choose the kind before entering its type-specific settings. [Field types](field-types.md) explains the alternatives. Save the field, then click its row in the alphabetically sorted field table to edit attributes. The table's Required column is a display of the rule, not an inline editor.

In the field dialog, configure **Input rules** and **Descriptions & input hints**. The language selector retains the multilingual draft; changing the selected language does not save. Descriptions explain purpose; input hints explain the expected entry. Ordinary custom fields cannot reuse protected standard-field technical names or their reserved English/German labels.

A required field must have a valid value in the resulting record. Enabling requiredness or changing type/configuration preflights existing contents, including recycled records where applicable. A rejected change leaves the definition and contents unchanged. Before requesting a type conversion in the UI, clear its default and disable uniqueness. Only supported, lossless conversions can succeed; creating a new field and explicitly reviewing values may be preferable.

## Defaults and unique values

A default proposes a value for a **new record when that field is omitted**. It does not overwrite an explicit empty/false value, update existing records or backfill the database. **Clear default value** removes the configured default.

Supported scalar fields can require unique values. Uniqueness also includes recycled records, so a serial number cannot be reused merely by moving a Device to the bin. Duplicate feedback identifies the field without disclosing another restricted record. Collection fields and arbitrary combinations are not general-purpose unique keys. [Field-type limits](field-types.md#defaults-uniqueness-and-conversion) explain the boundaries.

## Configure Type/Status and Category

Use **Add field → Types & statuses** or **Category** to install the optional standard fields. They are optional initially; each field's requiredness is configurable. Keyword is optional too unless you require it. Type and Status are installed as a pair, but their required flags are independent.

Open the installed classification field from the field table. The Type/Status editor places the selected Type beside its statuses. Add statuses to **Without Type** for records whose Type may remain empty, and add the appropriate statuses for each configured Type. Choose defaults deliberately; changing a Type must leave a valid final Status when saving a record.

Category supports single selection, multiple selection or a selection tree. Add translated choices and use move controls for their order. In tree mode, set each item's parent in its details. Selecting a child includes ancestors; clearing a parent clears descendants. [Using choice pickers](user-guide.md#multiple-choices-and-selection-trees) explains the record interaction.

Deactivate a used choice instead of deleting it. Unused Type/Status choices can be deleted only when no current or historical record references them. Renaming keeps identity and history. Changes that invalidate retained selections fail rather than silently dropping them. Task status completion meanings have the additional [Task rules](projects-and-tasks.md#complete-and-reopen-a-task).

## Configure record numbers

An object may have an automatically assigned **Number**, independent of its record ID and Keyword. In the selected object's **Numbering** section, expand **Number format & counter** and configure:

| Setting | Example | Effect |
| --- | --- | --- |
| Prefix / suffix | `EX-DV-` / empty | Readable framing around the counter |
| Starting value | `1` | Initial counter, without rewinding issued values |
| Increment | `1` | Step between issued numbers |
| Minimum digits | `4` | Padding, such as `0001` |
| Restart | Never | Alternatively annually or monthly |

The preview reserves nothing. Save the object settings, then create a record to see a real issued number. Record creation and number allocation commit together; failed creation consumes no number. Existing issued numbers remain unchanged and are never reused, including after permanent deletion.

Annual/monthly restarts use the workspace time zone and automatically include the period in the formatted number. Prefixes such as `TEAM-DV-` help readers distinguish workspaces, but do not create an installation-wide numbering constraint. UUIDs remain the stable record identities. Start and increment accept positive integers up to 30 digits; minimum digits is 1–30.

### Assign missing numbers (unreleased)

After enabling and saving numbering, Administrators can choose **Assign missing numbers** in the same Numbering section. The preview shows how many records lack a number, how many existing numbers remain unchanged, how many eligible records are in the recycle bin, and the first/last proposed number. Review it, then choose **Assign … numbers**. Assignment follows creation time and ID using the current counter and numbering period; it does not renumber existing values. A changed dataset/configuration requires **Refresh preview** before confirmation. A completed dataset shows that no assignment is needed. At most 10,000 missing numbers are accepted in one atomic operation. Every changed record has a field Journal event; failure rolls back the whole operation.

This action is available in the unreleased source; Community 1.0.2 does not contain it.

## Place fields, link objects and manage lifecycle

New elements remain **Unassigned** until placed. Use the [Form designer](forms.md) to put Keyword and Serial number in General, then [configure a relationship](relationships.md#create-a-device-contract-relationship) to Service contracts. Create a Device with a Keyword, save it and reopen it to verify the result. An Administrator must grant an ordinary user the necessary content rights before that user can test the same workflow.

Used custom fields and object types are deactivated rather than destroyed. Inactive objects retain readable contents under current rights; inactive fields no longer accept writes. Unused definitions can be deleted only after dependency/history checks and confirmation. **Show deleted definitions** reveals definition tombstones, not recycled business records. Definition journals retain configuration history. Reactivation revalidates dependencies; it can fail if the current model no longer permits the retained contents.
