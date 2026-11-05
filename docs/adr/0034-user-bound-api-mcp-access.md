# ADR 0034: User-bound API/MCP access and versioned contracts

- Status: Accepted for the local implementation
- Date: 2026-11-05
- Extends: [ADR 0002](0002-backend-technical-spike.md), [ADR 0010](0010-account-security.md) and [ADR 0027](0027-ownership-and-foreign-access.md)

## Decision

Use user-owned opaque personal access tokens for external REST/MCP clients. Store only a hash of a cryptographically random 256-bit secret in `sys_api_credentials`, with immutable owner/name/channel/read-only/expiry metadata, creation/last-use timestamps and access state through explicit token revocation. Revoking a token cannot restore that token; replacement creates a new identity/secret. Secrets are returned exactly once on successful creation. No passwords, bearer secrets or hashes enter journals, list responses or logs.

Creation requires the owner's real unexpired interactive session and current local password. An ordinary user lists/revokes only their own credentials; installation Administrators can inspect/revoke other users' credentials. Bearer credentials cannot create/manage credentials or manage password/sessions. They execute all other permitted operations under the owner's current rights, optionally further restricted to read-only and selected transports. Password changes and user deactivation revoke outstanding tokens. Global model barriers serialize revocation/account changes against operations; each operation validates token state/expiry after acquiring its normal locks. Journal SQL defaults take trusted transaction-local channel/credential/name values, so field/relationship/security helpers share provenance without accepting an actor from request inputs.

REST remains JSON POST operations at `/api/v1/<operation>` and MCP remains stateless Streamable HTTP at `/mcp`, exposing those same operations and a read-only contract resource. API version `1.0.0`, explicit major pinning and machine-readable errors are independent of the application and MCP protocol versions. Derive a portable OpenAPI 3.1 input/output contract from shared Zod schemas and TypeScript response types; check generated-source drift and validate successful integration-test responses against those schemas. Package a small typed bearer client with HTTPS/loopback enforcement, no cookie mixing, no redirect following, no secret persistence and no automatic mutation retry. The public how-to/reference is [API and MCP access](../api.md).

The contract generator is pinned as development tooling. Its glob dependency is constrained to the patched upstream package; the HTTP static-file package uses its patched upstream release. No custom dependency fork or alternate authentication framework is introduced. The current unreleased installation is recreated under ADR 0028; released update tooling remains separate.

Token management uses a two-column mobile table with access/state/expiry below the token name and an accessible named revoke action. Confirmation identifies the credential and account. Token journal events have dedicated creation/revocation labels, named account context, channel/read-only details and regional expiry formatting; raw IDs/values remain in Technical details.

## Verification boundaries

Integration scenarios cover one-time secrets, owner isolation, password confirmation, channels/read-only restrictions, expiry, revocation/revoke-all/password rotation, current rights, API/MCP parity, audit provenance, transaction rollback and contract reference/response validation. Browser acceptance covers account/user management, creation drafts, lifecycle controls and retained-history views; real token generation is additionally exercised through isolated backend sessions. The [development guide](../development.md) records actual results. This decision is not a release, OAuth/SSO service or distributed-rate-limiting claim.
