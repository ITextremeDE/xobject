# ADR 0023: Record history and conditional fields

- Status: Accepted for the local prototype
- Date: 2026-11-03

## Context

Record details, Tree, Dossier and Journal share a retained edit draft. Relationship journal events belong to an edge and are projected to both records. Formatting a historical value with today's field kind can misrepresent a safe conversion. Contact kinds also require different applicable fields without identifying a module by a technical name.

## Decision

The record Journal uses `list_record_journal`, with server-side field/entity-kind filters and pagination, descending by timestamp and event ID. The Journal reuses the shared RecordDataTable, RecordTableToolbar, ColumnMenu and pagination, with timestamp, actor, field/relationship, before and after columns. It retains fixed newest-first order rather than implying unsupported server-side sorts. Previews truncate long text; row clicks, the field button and the action menu open a read-only detail dialog with complete values and original technical identities. Page selection and column visibility follow other record tables. Narrow screens initially hide actor/before; users may reveal them with the column menu. The four record audit attributes and filters remain above the table. Relationship event IDs and edge identities are never replaced with the viewing record's identity.

The server reconstructs each record event's before/after field kind and configuration from immutable field-definition events, including a conversion's shared change ID. The raw journal is unchanged. Current field labels and current user names remain display context; names are not frozen historical snapshots. Current-rights value projection is implemented by [ADR 0026](0026-content-permissions.md); future permanent-history erasure remains separate. Classification option identities remain stable under ADR 0006.

`sys_fields.applicability` is an optional rule containing one controller field UUID and one or more choice-option UUIDs. The controller must be an active, unconditional single-choice field in the same object. Rules cannot form chains or cycles. Standard fields cannot become conditional; supplied field structure remains protected. Referenced controllers cannot change kind or be deactivated/deleted, and referenced choices cannot be removed while a rule depends on them. Rule changes use definition draft versions, preflight all existing rows and journal atomically.

A field is required only while applicable. UI, API and MCP evaluate the complete resulting record. Nonempty inapplicable values are rejected, including retained values omitted from a partial update; `false` and zero count as values. A discriminator change must explicitly clear incompatible values in the same transaction, or clear an optional value first. The UI refuses a selection that would conceal entered data and names the fields to clear. Nothing silently clears stored values.

The shared field editor configures these rules. Record forms render only applicable active fields. An unsaved-change notice remains above every record tab; Tree, Dossier and Journal continue showing persisted data. Relationship controls use the separate Primary chain and labeled single-target custom fields and per-custom-relationship collapsible tables for multi-target definitions, with a dialog-based picker under ADR 0019. Single/multiple choices, search and server-side object filtering remain separate from persisted record data; required or populated connections stay visible.

## Scope

The current initial schema includes the nullable applicability metadata. The fictional Contact fixture explicitly assigns rules by known field/choice identities: First name, Last name and Date of birth apply to Individual contact and Contact person; Commercial register applies to Organization and Individual contact. Fixtures are created through current validated application operations. A custom object named `contacts` receives no inferred behavior.

This delivers field applicability and the demo configuration, not complete Contacts provisioning. ADR 0024 extends these regular rules to relationship endpoints. Module-owned Contact definitions, derived Keyword, conditional company/name requirements and Organization-name derivation remain part of the Contacts delivery requirements R-024–R-027.

## Validation

Integration checks cover API/MCP applicability, requiredness, rejected partial changes with unchanged journals, cross-object rules, controller dependencies, journal filters/pages and conversion context across repeated conversions. Browser acceptance covers draft retention, field visibility, picker keyboard navigation and Journal filters/technical edge identity.

## Shared journal presentation

Definition history and the Administrator instance journal reuse the record Journal data table and detail dialog, preserving raw historical events and each view's pagination contract. Its compact default columns are timestamp, field/relationship and affected object; actor, scope and before/after previews remain selectable. On small screens, the affected object and field remain visible while timestamp defaults to hidden; filter controls start collapsed to leave room for entries. Detail dialogs retain structured scope/actor/endpoint and before/after data. Generic object previews show translated labels or property counts rather than raw JSON. Definition history filters and pages its complete existing result on the client; instance and record journal queries retain their server-side filters/pagination. Form-layout events use structured group/element summaries with historical settings and explicitly current metadata names. Original snapshots and identities remain available in Technical details. Detail titles identify the change without repeating the same heading inside a card. This changes presentation only and does not alter journal permissions, identities or retention.
