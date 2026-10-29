# ADR 0002: Evaluate the backend through a PostgreSQL technical spike

- Status: Accepted for the technical spike; production design remains open
- Date: 2026-10-29

## Context

Before committing to the full application foundation, verify that local authentication, dynamic PostgreSQL definitions, shared API/MCP behavior and atomic per-field journal writes work together. The full version-1 PRD is larger than this experiment.

## Decision

Use Fastify, Kysely with `pg`, Better Auth and the official TypeScript MCP SDK for the experiment. Pin the evaluated package versions in the package manifest and lockfile. Use npm workspaces and keep application code in `apps/server`; do not create an empty web application or shared package solely to match a target layout.

Better Auth stores users, credential hashes, sessions, accounts and verifications in the installation's PostgreSQL database under readable `sys_` table names. Account identity is installation-wide. A separate xObject administrator table grants the installation-wide Administrator role. Public account signup is disabled; a local CLI provisions administrators. No external identity service is required.

The experiment permits application operations only for authenticated Administrators. Other users are denied; workspace memberships, Designer/User rights and record/field permissions are not approximated by a permissive fallback.

Use a single application layer for the HTTP API and MCP tools. Both resolve the user's current Better Auth session. The MCP transport uses session cookies for this local test, not a completed OAuth integration for external MCP clients. Object definitions, scalar text columns and data writes use Kysely's schema/SQL builders. Dynamic identifiers come from validated definitions and are quoted as identifiers; record values use bound parameters.

Schema changes, definition changes and their journal entries execute in one PostgreSQL transaction. Record changes use the same transaction boundary. Use UUIDv7 identities and one journal row per changed content field with a common change ID. A transaction-scoped global advisory lock serializes the experiment's model/data operations, and an expected record version rejects stale edits.

Run schema initialization explicitly, using Better Auth's migration API and idempotent system-table creation. This validates the combination, but is not the versioned release migration strategy. The HTTP service never automatically migrates its database.

## Consequences and limits

- The stack can be evaluated without a browser interface, CRM modules or a production deployment.
- Dynamic object schemas require runtime validation; TypeScript cannot statically know user-created columns.
- A global lock is simple for this test but limits throughput. Finer locking remains a design task.
- The experiment implements Keyword, creation/update metadata and versioning. Type/Status, Category and other shared fields remain product requirements, not delivered features.
- Schema initialization, local account provisioning and cookie-based MCP access need further design before production use. Auth-account/session changes are not yet covered by xObject's system journal.
- Collections/references, full permissions, journal pagination/retention, a stable REST/OpenAPI contract, production migration history and deployment remain open.
- The server is intended for loopback-only development with disposable data. Passing tests does not establish release readiness or completion of PRD acceptance scenario 1.

## Verification

The integration suite uses a temporary official PostgreSQL container and the real MCP client/HTTP transport against Fastify's HTTP injection. It checks database-backed login, API/MCP parity, names and conflicts, denied access, concurrent writes, and induced journal failures that must roll back both DDL and data. See the [development guide](../development.md) for commands and current limitations.

## References

- [Better Auth: Fastify integration](https://better-auth.com/docs/integrations/fastify)
- [Better Auth: database and custom table names](https://better-auth.com/docs/concepts/database)
- [Kysely: migrations](https://kysely.dev/docs/migrations)
- [MCP: build a server](https://modelcontextprotocol.io/docs/develop/build-server)
