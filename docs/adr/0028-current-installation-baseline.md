# ADR 0028: One current unreleased installation

- Status: Accepted
- Date: 2026-11-04

## Decision

Before the first application release, maintain one current installation and no compatibility contract for intermediate development states. `schema.sql` owns the complete application DDL, ordered columns, constraints, indexes and integrity triggers/functions. Better Auth creates its pinned authentication schema through its official schema API. `module-catalog.json` owns initial module definitions. Server builds copy these resources and clear generated output.

`db:init` requires an empty database or an identical current installation. A single `sys_schema_version` row records the current baseline and a hash of the schema/catalog resources and pinned authentication-schema revision. Repeating initialization is a no-op; a mismatched/unrecognized schema is rejected without adaptation. Startup verifies the same marker. Changes during unreleased development update this baseline and recreate disposable instances whenever schema or fixture changes require it. Rebuild affected generated assets as well. Reapply the current optional demo seed after a test reset; do not preserve obsolete fixtures or add tests for historical development installations. This is the standing development workflow, not a new approval step for each disposable rebuild. No application development-version migration ledger or data-adoption routines exist.

The first state contains only system schema, the installation marker and three module definitions. Accounts, workspaces, business definitions/contents and policies are created through separate normal provisioning/application operations. `db:reset` explicitly rebuilds only the documented loopback development database. No shipped account, restored fixture or user Git repository is required.

Ownership/field/privacy settings live once in the record policy; Access principals are a virtual projection. Supplied object UUIDs live once in module bindings; the fixed Primary chain reads its three roles there. Group memberships have grades and one writer. Record journal reads have one paginated operation. Optimistic language/localization and field-configuration operations replace parallel shortcuts.

## Product invariants

Real business history, deleted-definition identities, retained unavailable translations/references, current-rights projections, safe field conversions and optimistic versions remain product behavior. They are not compatibility with a previous application. Relationships never confer permissions. Schema replacement does not relax runtime/operator isolation, workspace scope, validation or atomic journaling.

## Verification and future releases

Tests begin with the current empty installation, exercise the normal application API/MCP, reject a noncurrent schema and verify that initialization closes connections. Both empty initialization and explicit development reset are checked. UI and source builds use current contracts without default-allow permission fallbacks. See [development](../development.md) for commands and current validation.

From the first supported release onward, updates must completely migrate supported source schemas, configuration and stored data into the target version before the application serves them. The target application supports one current model only. Keep source-version interpretation and transformations in dedicated, tested upgrade tooling; remove obsolete structures after successful conversion rather than retaining parallel tables, DTOs, dual writes or runtime compatibility branches. Migration code necessarily knows the supported source versions; application code does not need to operate against them. Preserve business contents, identifiers, relationships, effective rights and journals during released upgrades, with backup, explicit failure handling and a tested restore path. Test supported released-version upgrades separately from current-model application behavior.

Initially, release updates use a maintenance window with all application processes and other writers stopped. Take a consistent database/configuration backup before migration, run the dedicated upgrade tooling, and verify the target schema and data integrity before restarting the target application. Old and new application versions do not serve concurrently. On failure, keep the application stopped and restore the consistent backup with the matching previous application version; do not start either version against a partially migrated database. Downgrade migrations and rolling or zero-downtime upgrades are outside the initial update scope.

The local container operator now implements verified backup/restore, maintenance guards and current-target verification under [ADR 0035](0035-container-delivery-and-maintenance.md). With no released predecessor, the upgrade runner accepts only a matching current target and rejects unknown sources. Future supported stable V1 sources require dedicated migration paths and acceptance before publication. The unreleased reset workflow establishes no upgrade contract for intermediate development states.

## Release follow-up — 2026-11-10

Community 1.0.0 and 1.0.1 are published. The pre-release reset policy above applies only to disposable development instances; it does not authorize resetting released installations. Both releases share the schema/catalog/auth fingerprint. The [operator guide](../self-hosting.md#upgrade-from-100-to-101) and [ADR 0035 release follow-up](0035-container-delivery-and-maintenance.md#release-follow-up--2026-11-09) define the supported stopped-writer, verified-backup and target-integrity upgrade path. Future released schema changes require dedicated migration and upgrade acceptance. The application continues to serve one target model.
