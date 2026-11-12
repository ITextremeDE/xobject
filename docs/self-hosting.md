# Self-hosting and recovery

Install the **Community 1.3.0** on a Linux Docker host, create the first Administrator and keep a verified recovery path. The standard route below uses the supplied Caddy TLS proxy. For an existing proxy, apply [the alternative topology](#use-an-existing-reverse-proxy) before setup. New installation creates no demo accounts, workspaces or business records.

Use the [1.3.0 release](https://github.com/ITextremeDE/xobject/releases/tag/v1.3.0) and its matching installer/image. For an earlier installation, use its [released documentation snapshot](versions.md).

## Prepare an installation

Use a Linux host with Docker Engine, Docker Compose v2.38.2 or newer, Bash, OpenSSL, curl, tar and GNU `sha256sum`. Give xObject a dedicated PostgreSQL service/volume. The supplied installation exposes only Caddy on ports 80/443; the database and application have no public port mappings. Point your chosen DNS name to the host before starting Caddy. Caddy obtains certificates using the supplied TLS contact address.

In a new working directory on that host, download the matching installer, checksum list and image references:

```sh
curl --fail --show-error --location --remote-name https://github.com/ITextremeDE/xobject/releases/download/v1.3.0/xobject-1.3.0-selfhost.tar.gz
curl --fail --show-error --location --remote-name https://github.com/ITextremeDE/xobject/releases/download/v1.3.0/SHA256SUMS
curl --fail --show-error --location --remote-name https://github.com/ITextremeDE/xobject/releases/download/v1.3.0/IMAGE_DIGESTS.txt
sha256sum --check --ignore-missing SHA256SUMS
```

Continue only when the installer reports **OK**. The check ignores other release artifacts that were not downloaded; obtain the checksums from the same trusted release. Inspect `IMAGE_DIGESTS.txt` and use its **Multi-platform** image reference. Extract into a new installation directory:

```sh
mkdir xobject-1.3.0
tar -xzf xobject-1.3.0-selfhost.tar.gz -C xobject-1.3.0
cd xobject-1.3.0
```

Configure the installation, replacing the example origin, digest and TLS contact address:

```sh
./scripts/xobject configure https://xobject.example ghcr.io/itextremede/xobject@sha256:RELEASE_DIGEST admin@example.com
```

The multi-platform reference selects the matching Linux/AMD64 or Linux/ARM64 image. `configure` writes `deploy/selfhost.env` with independent random database/runtime passwords and auth secret, mode `0600`. It refuses to overwrite an existing file. Keep that file with your private recovery material. Never place it in source control. Generated passwords use hex; manually supplied URL passwords must be URL-encoded.

The default private subnet is `172.30.61.0/24`, its dynamic container pool is `172.30.61.128/25`, and Caddy is fixed at `172.30.61.2` outside that pool. If it conflicts with another network, change `BACKEND_SUBNET`, `BACKEND_IP_RANGE` and `PROXY_ADDRESS` together before setup: the dynamic pool and proxy must lie inside the subnet, and the proxy must stay outside the dynamic pool. Only that explicit proxy address is trusted for client IPs. The app can reach public HTTPS client-metadata documents; the database stays on the internal network.

## Initialize and sign in

```sh
./scripts/xobject setup
./scripts/xobject start
./scripts/xobject verify
```

Setup creates the current schema atomically and provisions a separate runtime role. It then asks for the first Administrator's name, email and password in the application container; password entry is masked. The user/account/Administrator flag and first journal entry commit together. Repeating setup cannot claim an existing installation. Subsequent accounts are managed by an Administrator in the app. Initial installation creates no demo accounts, workspaces or business records.

After `verify` succeeds, open your configured HTTPS origin and sign in with the Administrator you just created. Follow [First steps](first-steps.md) to create a workspace and enable modules, then [set up team access](access-administration.md). Schedule regular backups and test recovery before relying on the installation.

For controlled automation, supply all three `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` variables to `setup` through a protected process environment; their values are not command arguments or printed results. Use interactive input for ordinary installation.

The app uses a non-root, read-only container with dropped capabilities. Only the one-off operator container receives owner-level database credentials. Its normal runtime receives the limited runtime credential. The named volumes contain PostgreSQL data and Caddy certificate/configuration state; stopping the services retains them.

`BASE_URL` is the canonical public origin. HTTPS is required outside loopback. App `PORT`/`LISTEN_HOST` describe its internal listener independently. Request Host/Origin checks, secure HttpOnly/SameSite cookies, CSP/frame protection, no-referrer policy and database-backed login limits apply. Sessions have 24-hour sliding validity with hourly renewal and a 15-minute fresh-session interval. Password-confirmed credential operations retain their own bounded guards. Reverse proxies must replace incoming forwarded headers and stay within `TRUSTED_PROXIES`.

## Back up

```sh
./scripts/xobject backup /private/backups/xobject-YYYYMMDD-HHMMSS
```

The new directory receives a consistent PostgreSQL custom-format archive, archive-list verification, private installation configuration, the actual application's image identity, schema fingerprint, image references, creation time and SHA-256 checksums. The script stops the app before dumping and restarts it after successful verification if it was running. A failed operation after stopping leaves it stopped. Existing backup directories are never overwritten or pruned.

A backup contains application contents, account hashes, encrypted/hashed credentials and the installation secret. Store the whole directory privately and copy it off the Docker host. Caddy certificates can be reissued; the database/configuration backup is the application recovery source. Keep the matching application image available. Published digest references can be pulled; an unreleased local image also needs a private `docker image save` copy if its local cache may be lost. Checksums detect corruption, not trustworthiness of a backup supplied by another party.

## Restore

Use the backup's matching image and installation configuration. On a new host, put `install.env` at the configured private path **before** starting the dedicated empty database so credentials match. On the original installation, the operator preserves the current database/configuration as additional recovery artifacts before replacement. The previous configuration is retained with mode `0600` in `${XDG_STATE_HOME:-$HOME/.local/state}/xobject/<project>/recovery`, inside a mode `0700` directory. Set `XOBJECT_RECOVERY_DIR` to select another private recovery directory outside the installation source; its ignored `.local` directory is also accepted for isolated tests. Existing recovery copies are never pruned. Upgrade replacement files use a private `.env.xobject-upgrade.*` name beside the configuration so replacement stays atomic on the same filesystem; Git, Docker context and source packaging exclude that name.

```sh
./scripts/xobject restore /private/backups/xobject-YYYYMMDD-HHMMSS --confirm-restore
./scripts/xobject start
```

Restore verifies every checksum, the archive and matching image before destructive replacement. It stops the app/proxy, replaces only the dedicated `xobject` database, restores in one transaction, reprovisions runtime permissions and verifies the target fingerprint, validated constraints, record registry/business rows and active Administrator. It deliberately remains stopped after success; `start` is the explicit return to service. Failure after maintenance begins leaves the application stopped. No downgrade migration is attempted.

For a private local image, exact image identity is required. A published immutable multi-platform image reference can select its matching host architecture. Actual acceptance platforms are recorded separately; local ARM64 acceptance does not prove AMD64 execution.

## Upgrade

```sh
./scripts/xobject upgrade registry.example/xobject@sha256:REVIEWED_DIGEST /private/backups/xobject-before-update
```

The command requires an immutable target digest, stops writers, makes a verified private backup, selects the target image and runs its maintenance-only upgrade/verification command before starting services. On failure, retain the stopped state and restore the backup with its matching image. Old and new application versions do not serve concurrently.

Versions 1.0.0 and 1.0.1 share a schema/catalog/auth fingerprint. Version 1.0.2 changes authorization journaling. Version 1.1.0 accepts both exact predecessor fingerprints, migrates authorization journaling where needed and adds the current Contact catalog transactionally. Unknown fingerprints remain rejected. Stop all writers and verify a backup before upgrade.
<span id="upgrade-from-100-to-101"></span>
<span id="upgrade-from-100-or-101-to-102"></span>

<span id="upgrade-from-100-101-or-102-to-110"></span>

### Upgrade from 1.0.0–1.2.0 to 1.3.0

Download and verify the 1.3.0 installer, extract it into a new directory and retain the previous installer for recovery. Use the new package's operator with the existing private environment file, Compose project and any proxy override; preserve credentials and volume identities. Do not run first-time configuration or a development reset against the installation.

Run `scripts/xobject upgrade IMMUTABLE_1_3_0_IMAGE NEW_BACKUP_DIRECTORY` using the published 1.3.0 digest. The operator stops writers, preserves a checksummed database/configuration backup and the actual previous image, switches the image and runs dedicated migrations before target/integrity verification and restart.

The migration adds separate central Organization telephone/fax, email and address projections with typed sparse exceptions, and retires the AP-only Commercial-register definition. Its deleted-definition identity and existing Journal rows remain. An unexpected nonempty own register exception aborts the transaction for explicit resolution. Earlier supported released sources migrate directly to this same target, including required authorization-journal and Contact-catalog changes. Existing IDs, numbers, authored fields/forms, input aids, module state, credentials and history remain.

Only exact published 1.0.0/1.0.1, 1.0.2, 1.1.0 and 1.2.0 fingerprints are accepted. Unknown schemas and structural collisions abort the complete upgrade. On failure, keep writers stopped and restore the verified backup with its matching previous image; runtime never falls back to an earlier model.

## Use an existing reverse proxy

Keep the dedicated application/database project and use `XOBJECT_START_SERVICES=app` to leave the supplied proxy stopped. Select a private Compose override with `XOBJECT_COMPOSE_OVERRIDE`: connect `app` to the existing proxy network, assign a unique network alias and override its `TRUSTED_PROXIES` environment variable with the proxy's actual fixed address/CIDR. Avoid broad trust ranges. Keep PostgreSQL unpublished and on its internal network; the app needs no public port mapping.

Configure the existing proxy to serve `BASE_URL` with a valid certificate and forward to the application alias on port 4100. Preserve canonical Host/Origin, replace forwarded client headers and permit the streaming transport described below. The existing proxy's configuration, certificate recovery and access restrictions remain the operator's responsibility. Retain the override and required network configuration with private recovery material; the database backup includes `install.env`, not external proxy configuration or custom Compose overrides. Use distinct project names and nonoverlapping backend subnets for a second recovery installation.

## Local acceptance and diagnostics

Published acceptance includes local Linux/ARM64, the AMD64 application/operator path under emulation and native Ubuntu/AMD64 with publicly trusted HTTPS and an existing reverse proxy. See the scoped [acceptance evidence](quality-acceptance.md#native-linux-host-and-recovery--2026-11-09). This is recorded test coverage, not a capacity or support guarantee. The [Dockerfile](../Dockerfile), [Compose definition](../deploy/compose.selfhost.yaml) and [operator](../scripts/xobject) own implementation; [ADR 0035](adr/0035-container-delivery-and-maintenance.md) owns the delivery decision.

After building `xobject:local-acceptance`, run:

```sh
node scripts/test-selfhost.mjs
node scripts/test-selfhost-proxy.mjs
```

This uses a random Compose project, loopback port, isolated fictional account/data and private artifacts under `.local/selfhost-acceptance/`. It exercises initialization, first Administrator, runtime writes, backup/restore, record versions/history, stopped restore, same-target upgrade, unknown-source rejection and recovery. It removes only its own disposable containers/volumes; backups and diagnostic receipts remain local. It does not start Caddy, request public certificates or publish an image.

`/healthz` checks database availability after startup fingerprint validation. Operator output reports aggregate verification results. Request logs exclude cookies, authorization, query strings and bodies. Authentication diagnostics retain only severity and a bounded SQLSTATE/code, excluding vendor messages/arguments; never paste private configuration, archives or diagnostic payloads into a public issue.

The supported upgrade preserves credentials, consents, records, issued numbers and existing history. Its additive module refresh rolls back completely if a conflicting field name/structure prevents installation. Use the published immutable target image; never edit fingerprints or reset an installed database.

The supplied Compose package bounds each container's `json-file` logs to three files of 10 MB (approximately 30 MB per container). Recreate containers through the normal update procedure to apply logging changes; restarting an old container does not change its logging driver configuration. Existing installations or custom Compose/logging overrides must explicitly adopt an equivalent bound. Routine successful token rotation is absent from the permanent Journal; application consent and explicit application/security changes remain visible. Existing Journal history is retained.

`XOBJECT_ENV_FILE`, `XOBJECT_PROJECT_NAME` and an optional `XOBJECT_COMPOSE_OVERRIDE` explicitly select an installation. `XOBJECT_RECOVERY_DIR` overrides the private pre-restore configuration recovery location. `XOBJECT_START_SERVICES=app` supports isolated loopback acceptance without Caddy. Stop/start/restore/upgrade always act on that selected Compose project. Backups and existing volumes are retained unless an operator deliberately removes them.

The separate proxy acceptance binds only loopback, uses Caddy’s local certificate authority and trusts that CA only inside the test client. It verifies the supplied proxy/backend topology, secure cookies, trusted client-IP replacement, same-origin API checks and HTTPS OAuth discovery. It neither changes the Mac trust store nor uses public DNS or ACME. Run these isolated Compose tests sequentially because the documented default subnet is shared.

When backup temporarily stops a running application, the operator resumes that same container with `up -d --wait --no-recreate`. This preserves its identity/configuration and waits for health on the documented Compose v2 baseline; it does not require the newer `start --wait` option. Failure diagnostics identify the operator line without printing command arguments or private payloads.

## Browser identity and live transport

Optional application environment settings are `APP_NAME` (default `xObject`, 1–80 characters), `APP_DESCRIPTION` (1–300 characters) and `BROWSER_TITLE_MODE=context|neutral` (default `context`). Neutral titles omit workspace/object/record names. These settings configure generic installation metadata; do not put secrets or private record contents in them. Restart the application after changing them. Icons and the generic share image retain the xObject product identity. Browser/OS caches may retain installation names/icons/previews until refreshed by that platform.

The web manifest provides one installation per `BASE_URL` origin, with standalone display and standard/maskable icons. No service worker caches authenticated business data. The application sends noindex/nofollow hints and denies anonymous data access; robots directives are not authorization. Public workspaces/record previews are later scope.

Allow cookie-authenticated POST `/api/events` responses to stream as `text/event-stream`. Disable proxy buffering and retain connections beyond the 15-second heartbeat. The supplied Caddy proxy passes streams through. The app shares one PostgreSQL LISTEN connection and bounds streams per process/user; see ADR 0036 for limits. Reconnect resynchronizes current state instead of replaying events. Preserve the existing Host/Origin and CSRF checks. `/api/client-info` returns only generic name/description/title mode/build identity and `/manifest.webmanifest` is public generic metadata.
