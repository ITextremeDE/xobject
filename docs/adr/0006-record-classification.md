# ADR 0006: Configurable record classification

- Status: Accepted for the local experiment
- Date: 2026-10-30

## Context

Type, Status and Category are optional shared record fields. Type and Status are installed together; Category is installed separately. Their required flags must be independently configurable per object type. Status choices depend on Type; an empty Type uses its own Status dictionary. Category can permit one or multiple choices. Definitions and record changes must use the shared API/MCP backend and atomic journal rules.

## Decision

Keep a versioned classification configuration as JSONB on `sys_object_types`: three field rules, defaults and bounded option dictionaries. Options have immutable UUID identities/kinds, German/English labels, an active flag and an optional parent Type for Status. The web editor generates UUIDv7 identities. Preserve Category options through renaming/deactivation. Type/Status options may be deleted only when neither current records nor record journals reference their identity. Retained Status options require a valid parent Type; remove or reassign them before deleting their Type. Deleted identities cannot be reused, including across object types. Reject stale configuration writes.

When installed, store record Type and Status as nullable UUID columns and Category as a non-null UUID array. Single-category mode constrains the array to zero/one entry through the common application validation; multiple mode uses the same representation. Arrays are normalized as sets. The field metadata fixes shared labels and kinds while retaining stable IDs; requiredness and input aids remain configurable. Shared kinds are `type`, `status` and `category`; custom fields initially remained scalar text; ADR 0007 extends them with typed custom fields.

Validate choice ownership, activity, cardinality, defaults, required flags and Type/Status compatibility inside the same model-locked transaction used for all write paths. Previously assigned inactive choices can remain; new assignments cannot select them. Reject any configuration that would invalidate existing records. Required Status needs choices in every selectable Type scope, including Without Type when Type is optional. A configuration change never silently changes record selections. Defaults apply to omitted creation values; explicit empty values are still validated against required flags.

Journal each changed record field separately with stable field/option references and a common change ID. Journal changed configuration properties and option attributes in the same transaction. A no-op selection/configuration write does not advance versions or add history. Render current localized option labels in record/table history; the technical identity stays authoritative and option-label changes are retained in the configuration journal.

The additive development migration introduces missing metadata and columns with all fields optional and empty dictionaries/defaults. It preserves old columns in place, record IDs, versions, values and existing history. Technical baseline additions are schema migration work, not fabricated user content changes. When explicitly installed, the three shared columns follow existing columns; new object tables start with system metadata only. The explicit migration and private recovery dump remain operator-managed; HTTP startup does not migrate.

## Consequences

The configuration editor, record form, table, API and MCP use one backend contract. Business-content operations remain Administrator-only; workspace Users/Designers inspect/configure metadata under ADR 0008. This is not completion of the full shared-field set, general collection storage, permissions or version-one acceptance.

JSON option dictionaries do not provide database foreign keys for individual choices. Integrity depends on the shared backend validation and model lock; direct database modifications bypass it. The compatibility scan reads all affected records, and label sorting builds bounded expressions from the option dictionary. Replace these trade-offs with measured production storage/migration/indexing and finer concurrency designs before production-scale use. ADR 0007 defines the implemented custom choice collections and User/Group references; their production storage and scalability still require evaluation.

Type and Status input aids are edited together from either field in workspace object settings. Each Type is displayed beside its associated Status options, including a Without Type scope. Category input aids are edited in its own field dialog. All three retain the shared versioned configuration operation, compatibility preflight and atomic journal rules.

The `options` array order is the canonical manual display order for UI, API and MCP. Type and Category options can be reordered within their field; Status options within their Type scope. Without Type remains the first display group. Reordering preserves identities, assignments and defaults and writes one `option_order` journal entry per affected field under the common change ID. The editor offers drag handles and named Move up/down buttons with a live position announcement.

New object types start with system columns only. Keyword, the Type/Status pair and Category can be installed later using the shared `add_standard_field` operation; `create_object_type.standardFields` also allows explicit initial selection. Installation creates metadata and business columns and journals them in one transaction, with requiredness initially false. Existing objects retain their definitions and requiredness. The legacy migration adds classification fields only when upgrading the pre-classification schema; repeated migrations never install absent optional fields. Record DTOs retain empty Keyword/null Type/Status/empty Category compatibility defaults when absent, but writes to absent fields are rejected and clients use field metadata for controls. Without Keyword, record identification and search use the UUID.

Deletion is staged in the same versioned configuration editor as other changes. Removing a default clears its default assignment in the draft; required-field and compatibility validation still apply on Save. Configuration reads expose advisory `canDelete` flags; writes always recheck current records and historical record references under the shared model transaction lock. Each deleted option is journaled with its complete previous definition and the common change ID, atomically with the new option order and configuration.
