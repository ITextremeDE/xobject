# ADR 0035: Container delivery and maintenance

- Status: Accepted
- Date: 2026-11-05

## Decision

Deliver one non-root Node.js application image containing the compiled shared contracts, server, canonical agent skills and static React client. Use unchanged official, digest-pinned Node/PostgreSQL/Caddy base images. A Linux Compose installation separates the internal database, runtime app, public TLS proxy and one-off privileged operator. Only Caddy publishes ports. Explicit proxy addresses bound forwarded-client trust; the app has public HTTPS egress for validated MCP client metadata.

Use an atomic current-schema initializer and one-time interactive first-Administrator setup. No default account or public installation-claim endpoint is shipped. PostgreSQL owner credentials are available only to the operator service; the runtime retains its distinct constrained role. Store private installation secrets outside Git and preserve them with recovery artifacts.

The operator creates verified, checksummed database/configuration backups with the actual running image identity. Stop writers before upgrade/restore. Restore uses a matching image and one transactional database load, reprovisions runtime permissions and validates the target schema, constraints, registry/business identity and Administrator. Leave the app stopped after restore or a failed maintenance operation. Retain pre-restore/current-state recovery artifacts rather than discarding them.

Upgrade tooling is separate from the application runtime under ADR 0028. There is no released source version yet: a current-target no-op is valid, an unknown source fails closed. Future supported stable V1 versions require reviewed migration paths and upgrade/restore acceptance before publication; the target runtime serves only its complete current model. A backup/image rollback replaces downgrade migrations initially.

## Validation and limits

The local source image and disposable Compose acceptance cover Linux/ARM64 installation, first login, runtime writes, consistent data/version/history restoration, a same-target upgrade, unknown-source refusal with writers stopped and subsequent recovery. The acceptance script retains private receipts and removes only its random test project's disposable resources. It does not exercise public DNS/ACME, an external server or registry publication. The same acceptance also passes for the AMD64 application/operator image under emulation on the ARM64 host with native PostgreSQL 18. The complete Caddy path additionally passes loopback HTTPS with its local CA, secure cookies, trusted proxy IP replacement and OAuth discovery. The fixed Caddy address is outside the dynamic IP pool, preventing database-first allocation collisions. Native target-host validation and supported released-version migrations require separate receipts.

The [operator guide](../self-hosting.md) owns commands, configuration and recovery instructions. This decision establishes source/local packaging, not a published application release.

## Release follow-up — 2026-11-09

Community 1.0.0 is released; maintenance version 1.0.1 retains its exact schema/catalog/auth fingerprint. The existing stopped-writer, verified-backup and target-integrity path supports this same-schema upgrade without SQL conversion. The native AMD64/ARM64 release workflow checks both a fresh target installation and the immutable 1.0.0 predecessor, retaining values, record versions and journal. Unknown fingerprints still fail closed. Dedicated migrations remain required for future schema-changing released updates.
