# ADR 0022: Database integrity, concurrency and runtime roles

- Status: Accepted
- Date: 2026-11-04

## Current installation

The current schema is installed into an empty database under [ADR 0028](0028-current-installation-baseline.md). Initialization creates the complete constraints, indexes and integrity functions directly; the HTTP server verifies its fingerprint before accepting traffic. `OPERATOR_DATABASE_URL` provisions this schema and the restricted `DATABASE_URL` role. Runtime can create dynamic business tables but does not own system tables. Journals and relationship journal endpoints allow SELECT/INSERT only; the installation marker allows SELECT only. Runtime has no superuser, role/database-creation, replication or RLS-bypass capability. Operator credentials belong outside a packaged HTTP environment. Existing role credentials are verified, never changed implicitly.

## Versions and locking

Definitions, groups, module configuration, records and security settings use expected versions. Conflicts return 409 and retain the draft. No-op operations do not increment versions or fabricate journals. Changes and per-property events commit atomically. Full/Administrator privileges never bypass validation or protected-definition rules.

Every operation takes the global model advisory barrier first. Schema/security mutations use an exclusive barrier; readers and ordinary workspace writes share it. Workspace reads share the workspace barrier and workspace writes take it exclusively. This preserves read concurrency across workspaces while preventing incompatible model/content changes. Scalar-only record saves avoid unrelated graph scans; affected relationships still validate final-state minima, maxima and cycles.

## Identity and policy integrity

Business rows and `sys_record_identities` must exist together. Deferred constraint triggers support either creation order inside a transaction, reject orphan rows/registrations and guard identity moves. Relationships and security policies reference the composite workspace/object/record identity. Sensitive rows additionally require a security policy. The same deferred checker guards policy removal; missing policy is an integrity error, never reconstructed as implicit Full/public access.

Dynamic tables receive their current integrity triggers and update-order index when created. Shared system indexes support recent record/definition/relationship journals. Stable UUIDs and workspace-aware references enforce scope; readable table prefixes are organization aids.

## Validation and limits

Isolated PostgreSQL tests exercise current empty installation, version conflicts, protected structures, deferred identity/policy failures, rollback, shared readers, model/workspace locks, scalar saves under an unrelated table lock and rejected runtime journal/installation-marker mutations. Future release migration/restore packaging, representative data sizes and measured throughput remain separate delivery requirements.
