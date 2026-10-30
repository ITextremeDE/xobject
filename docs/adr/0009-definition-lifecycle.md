# ADR 0009: Field and object-type lifecycle

Status: Accepted

## States and permissions

Definition state is `active`, `inactive` or `deleted`. Administrators and the workspace's Designers manage the lifecycle through the shared API/MCP application layer; ordinary workspace members can inspect definitions and their configuration journal. Module-protected definitions cannot be deactivated or deleted. Type and Status fields form one lifecycle unit.

`set_definition_state` takes definition kind/ID, expected prior state, desired state and an explicit confirmation flag for deletion. The expected state rejects stale actions. Usage checks, physical schema changes, metadata updates and journal entries run under the common model lock in one transaction. PostgreSQL `RESTRICT` rejects dependencies; no cascade is used.

## Deactivation and reactivation

Inactive object types disappear from ordinary navigation/search. Their records remain readable with existing permissions, while writes and new records are rejected. Settings retain the definition and offer an explicit route to view its records.

Inactive fields leave ordinary record columns and input controls. Existing values remain available in a separate read-only section and in record history. New records receive no application-supplied values or defaults for inactive fields; existing values are preserved when other fields change. Required flags remain in the definition but do not constrain inactive inputs. Reactivation preflights current records, required flags and classification rules. If new records lack a formerly required value, adjust the inactive field's requiredness before reactivating it. Inactive parent object types must be reactivated before their fields/configuration can change.

## Deleting unused definitions

A field is used if a current or historical record has a nonempty value for it. Zero and false count as values. Legacy journal entries without field IDs are conservatively matched by their technical field key. A Type/Status lifecycle action checks both fields. An object type is used if any current record or any record-journal event exists, including records whose current rows are gone.

Used definitions can only be deactivated. Explicitly confirmed deletion of unused fields drops their empty columns; an unused object type drops its empty table. The metadata rows remain as deleted tombstones, preserving journal foreign keys, names, IDs and configuration evidence. IDs are never reused. Recreating an available technical name creates a new UUID; partial unique indexes reserve names for active/inactive definitions while permitting a fresh definition after deletion. Deleted definitions cannot be reactivated.

Deleting standard fields also removes their unused classification dictionaries/defaults under the same change ID. Type and Status are removed together; adding them later creates fresh field IDs. Deleted option identities remain reserved through their configuration journals.

## History and presentation

Each lifecycle transition receives a journal entry. Deleted fields also retain a definition snapshot. Original record journals are neither rewritten nor removed by a definition lifecycle action. `get_definition_journal` exposes configuration/lifecycle history separately from business-record values, including for deleted object types. Settings can explicitly show deleted definitions for historical inspection; normal lists omit them. Record-journal labels resolve active, inactive and deleted field identities separately, even when a technical name has been reused.

This decision implements definition lifecycle only. The separately specified record recycle bin and permanent record-content/history erasure are still pending; deleting a definition never substitutes for those operations.
