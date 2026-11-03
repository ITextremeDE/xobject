# ADR 0022: Database integrity, definition versions and scoped concurrency

- Status: Accepted; implemented for the local prototype
- Date: 2026-11-03
- Extends: [ADR 0019](0019-record-relationships.md) and [ADR 0007](0007-custom-field-types.md)

## Definition edits

Object and field metadata expose a positive `version`. `configure_field`, `set_field_required` and `set_labels` require the version of the opened draft. Check it inside the shared API/MCP transaction after authorization and locking; stale input returns 409 without changes. Successful metadata changes advance the corresponding version, while no-ops retain it. Classification retains its own configuration version and advances affected field versions when input aids change. Lifecycle changes also advance definition versions. Generated version increments are not separate business-field journal events.

Web editors keep their draft version through background refetches. A conflict retains the draft, refreshes the definition and lets an explicit Reset load current attributes/version. The same rules apply to API/MCP; an omitted version is invalid.

Protected fields cannot change kind, structural configuration or definition labels. Requiredness and choice-option input aids remain configurable, with existing validation and journal rules. Protected object labels and lifecycle remain protected. This supplies the structural guard needed before future module provisioning; complete module ownership/update logic remains separate work.

## Registry integrity

Keep the per-object tables and central `sys_record_identities` registry. Deferred constraint triggers require a matching business row and registration at transaction commit, including the workspace and object identities. A row and its registration may be inserted in either order within one transaction. Unpaired insertion, deletion and identity changes fail. Migration checks existing registry contents and fails on inconsistencies rather than silently repairing or discarding records.

Content deletion is still not an application feature. Future recycle-bin/permanent-deletion work must coordinate business storage, registry, relationships and retained journals. These triggers protect ordinary row operations; a privileged operator or a role owning dynamic tables can still alter/drop their schema. Direct SQL content changes remain unsupported and do not create application journal events.

## Concurrency and queries

Acquire the global schema barrier first, then the workspace barrier where applicable. Reads share both barriers. Normal writes acquire an exclusive workspace barrier while sharing the global barrier. Schema-changing operations and cross-workspace account/membership changes acquire the exclusive global barrier. This permits parallel readers and independent workspace writes without racing DDL or permission revocation. It does not yet provide concurrent writers within one workspace.

Normal record saves check cardinalities at changed endpoints, required relationships on new records and Primary ancestor cycles through a bounded-by-data recursive query with duplicate termination. Scalar-only saves skip graph validation. Activation and rule changes retain complete preflight. Existing database state is assumed to have passed preflight and to be modified through the application; a scalar save is not a repair/audit of unrelated direct SQL changes.

New/existing business tables gain an `(updated_at DESC, id DESC)` pagination index. The journal gains global/workspace chronological indexes, a definition-history index and a partial relationship-type history index. Index identifiers include a stable definition-ID suffix to avoid truncation/name collisions. Further search/custom-field indexes require measured query needs; no production load claim is made.

## Versioned migrations and roles

`sys_schema_migrations` records numbered upgrades and application times. Migration 1 adopts the previous prototype schema; migration 2 adds definition versions, integrity triggers and indexes. Completed upgrades are skipped; a failed application-schema step rolls back with its ledger row, and newer unknown versions are refused. Better Auth adoption precedes migration 1's application transaction and is not represented as a fictitious cross-library atomic transaction. Retain a restorable backup before upgrades. Future schema changes require subsequent numbered steps rather than editing completed upgrades.

`MIGRATION_DATABASE_URL` is an operator-only connection. `DATABASE_URL` is the runtime connection using a distinct non-superuser role without database/role creation, replication or RLS-bypass rights. The operator provisions grants with the migration command; existing credentials are verified and never implicitly rotated. Runtime can manage business tables because object/field creation requires DDL, but does not own system tables. It may select/append journal events and endpoint projections, not update/delete them; the migration ledger is read-only. DBA/migration credentials are omitted from the deployed application environment. The local `.env` is an operator convenience, not a production secret-isolation mechanism.

The current development container's bootstrap role remains available for migrations and database-client maintenance. This does not make the bootstrap role suitable for application traffic. A production installer and release upgrade/rollback package remain future work.

## Validation

Disposable PostgreSQL scenarios cover stale API/MCP drafts, protected structures/configurable input aids, deferred integrity failures and rollback, shared readers and workspace/schema lock conflicts, scalar saves with an unrelated content table locked, repeat migration history and runtime DDL/DML with rejected journal/ledger/system-schema mutations. Development adoption is verified on a full restored copy before changing the local database, with existing business contents, identities, relationship edges, journals and accounts preserved.
