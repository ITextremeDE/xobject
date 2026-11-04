# ADR 0031: Standards-aligned groupware domain models

- Status: Accepted design direction; domain profiles and synchronization not implemented
- Date: 2026-11-04
- Complements: [ADR 0014](0014-time-zones-and-regional-display.md), [ADR 0025](0025-modules-and-form-views.md) and [ADR 0027](0027-ownership-and-foreign-access.md)

## Context

The V1 catalog includes Contacts, Distribution lists, Appointments, Vacations and Tasks. Later exchange with contact, calendar and task applications must not require replacing their domain meaning. The existing generic fields and prototype fixtures do not establish interoperable domain profiles.

## Decision

[PRD section 6.4](../PRD.md#64-standards-aligned-contacts-calendars-and-tasks) owns the required semantics and delivery boundaries. Use vCard 4.0 and iCalendar VEVENT/VTODO as the primary exchange references. Consider JSContact and JSCalendar as complementary JSON models. Select exact supported versions, applicable extensions and mappings in testable profiles before implementation; do not claim complete standards support from field-name similarity.

Keep domain meaning independent of presentation, storage and peers. Standard property mappings refer to supplied semantic identities, not editable labels or coincident custom field names. Repeated structured values and recurrence identities require explicit domain storage/contracts, not concatenated text or a JSON blob treated as an unvalidated custom field. Preserve the common metadata-driven application architecture, structural protection, configurable input aids, rights and journals. This decision does not select concrete tables or add new generic field kinds.

Later connectors use CardDAV/CalDAV with capability discovery and a declared profile. Separate transport metadata from business contents: remote collection/resource identity, exchange UID, remote version and synchronization baseline must not replace the record UUID or optimistic version. Define conflict/deletion rules and safe round trips before bidirectional synchronization. Unsupported peer behavior must be reported without silent data loss or changes to xObject's model. Vendor-specific contact-group/category conventions are not domain rules. Nextcloud may be a test peer without becoming a dependency or specification authority; no product-specific adapter is introduced here.

The connector's acting user remains subject to the same current application authorization, validation, atomic journaling and lifecycle rules as web/API/MCP. Scheduling participants, contact groups and external privacy/sharing properties are distinct from xObject security principals and grants. External data never implicitly authorizes fetching links, sending invitations or delivering notifications.

## Consequences and delivery

Complete the five domain profiles and their acceptance mappings before building the affected fields and forms. Basic scalar timestamp storage remains unchanged until the domain contracts define richer temporal semantics. Retain V1's exclusion of import/export, synchronization, calendar views, uploads and notification delivery. Approval/entitlement workflows, invitation scheduling and advanced task automation are not added merely because a standard can describe them.

Validate the defined supported subset with representative round-trip fixtures and explicit unsupported cases. Future peer tests must cover preservation, conflicts, deletions, identity and permissions. No such interoperability tests or runtime changes are delivered by this documentation decision.

## Standards references

- [vCard 4.0 — RFC 6350](https://www.rfc-editor.org/rfc/rfc6350), including applicable [extensions — RFC 9554](https://www.rfc-editor.org/rfc/rfc9554).
- [JSContact — RFC 9553](https://www.rfc-editor.org/rfc/rfc9553), [version 2.0 — RFC 9982](https://www.rfc-editor.org/rfc/rfc9982) and [vCard conversion — RFC 9555](https://www.rfc-editor.org/rfc/rfc9555).
- [iCalendar — RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) and [task extensions — RFC 10051](https://www.rfc-editor.org/rfc/rfc10051).
- [JSCalendar — RFC 8984](https://www.rfc-editor.org/rfc/rfc8984).
- [CardDAV — RFC 6352](https://www.rfc-editor.org/rfc/rfc6352) and [CalDAV — RFC 4791](https://www.rfc-editor.org/rfc/rfc4791).
