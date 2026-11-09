# Self-hosting and recovery

The repository contains an unreleased installation candidate. It has passed local Linux/ARM64 container acceptance and the AMD64 application/operator path under emulation; native Ubuntu/AMD64 acceptance with a publicly trusted HTTPS certificate and an existing reverse proxy has also passed. See the scoped [acceptance evidence](quality-acceptance.md#native-linux-host-and-recovery--2026-11-09). No image or installation archive has been published; use a local source build until a reviewed release exists. The source [Dockerfile](../Dockerfile), [Compose definition](../deploy/compose.selfhost.yaml) and [operator](../scripts/xobject) are authoritative. [ADR 0035](adr/0035-container-delivery-and-maintenance.md) explains the delivery boundary.

## Prepare an installation

Use a Linux host with Docker Engine, Docker Compose v2.38.2 or newer, Bash, OpenSSL and a SHA-256 utility. Give xObject a dedicated PostgreSQL service/volume. The supplied installation exposes only Caddy on ports 80/443; the database and application have no public port mappings. Point your chosen DNS name to the host before starting Caddy. Caddy obtains certificates using the supplied TLS contact address.

Build the current source candidate locally:

```sh
docker build --tag xobject:local-acceptance .
./scripts/xobject configure https://xobject.example xobject:local-acceptance admin@example.com
```

For a released installation, select its reviewed immutable image reference instead of the local tag. `configure` writes `deploy/selfhost.env` with independent random database/runtime passwords and auth secret, mode `0600`. It refuses to overwrite an existing file. Keep that file with your private recovery material. Never place it in source control. The example uses hex passwords; manually supplied URL passwords must be URL-encoded.

The default private subnet is `172.30.61.0/24`, its dynamic container pool is `172.30.61.128/25`, and Caddy is fixed at `172.30.61.2` outside that pool. If it conflicts with another network, change `BACKEND_SUBNET`, `BACKEND_IP_RANGE` and `PROXY_ADDRESS` together before setup: the dynamic pool and proxy must lie inside the subnet, and the proxy must stay outside the dynamic pool. Only that explicit proxy address is trusted for client IPs. The app can reach public HTTPS client-metadata documents; the database stays on the internal network.

## Use an existing reverse proxy

Keep the dedicated application/database project and use `XOBJECT_START_SERVICES=app` to leave the supplied proxy stopped. Select a private Compose override with `XOBJECT_COMPOSE_OVERRIDE`: connect `app` to the existing proxy network, assign a unique network alias and override its `TRUSTED_PROXIES` environment variable with the proxy's actual fixed address/CIDR. Avoid broad trust ranges. Keep PostgreSQL unpublished and on its internal network; the app needs no public port mapping.

Configure the existing proxy to serve `BASE_URL` with a valid certificate and forward to the application alias on port 4100. Preserve canonical Host/Origin, replace forwarded client headers and permit the streaming transport described below. The existing proxy's configuration, certificate recovery and access restrictions remain the operator's responsibility. Retain the override and required network configuration with private recovery material; the database backup includes `install.env`, not external proxy configuration or custom Compose overrides. Use distinct project names and nonoverlapping backend subnets for a second recovery installation.

## Initialize and sign in

```sh
./scripts/xobject setup
./scripts/xobject start
./scripts/xobject verify
```

Setup creates the current schema atomically and provisions a separate runtime role. It then asks for the first Administrator's name, email and password in the application container; password entry is masked. The user/account/Administrator flag and first journal entry commit together. Repeating setup cannot claim an existing installation. Subsequent accounts are managed by an Administrator in the app. Initial installation creates no demo accounts, workspaces or business records.

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

There is no released predecessor yet. The current runner verifies a matching target as a no-op and rejects unknown/unreleased source fingerprints. It does not pretend to migrate historical development installations. From the first release, supported stable V1 predecessors need dedicated, tested migration paths to the one complete target model before restart. A release without the required supported-source tests cannot be published.

## Local acceptance and diagnostics

After building `xobject:local-acceptance`, run:

```sh
node scripts/test-selfhost.mjs
node scripts/test-selfhost-proxy.mjs
```

This uses a random Compose project, loopback port, isolated fictional account/data and private artifacts under `.local/selfhost-acceptance/`. It exercises initialization, first Administrator, runtime writes, backup/restore, record versions/history, stopped restore, same-target upgrade, unknown-source rejection and recovery. It removes only its own disposable containers/volumes; backups and diagnostic receipts remain local. It does not start Caddy, request public certificates or publish an image.

`/healthz` checks database availability after startup fingerprint validation. Operator output reports aggregate verification results. Request logs exclude cookies, authorization, query strings and bodies. Authentication diagnostics retain only severity and a bounded SQLSTATE/code, excluding vendor messages/arguments; never paste private configuration, archives or diagnostic payloads into a public issue.

`XOBJECT_ENV_FILE`, `XOBJECT_PROJECT_NAME` and an optional `XOBJECT_COMPOSE_OVERRIDE` explicitly select an installation. `XOBJECT_RECOVERY_DIR` overrides the private pre-restore configuration recovery location. `XOBJECT_START_SERVICES=app` supports isolated loopback acceptance without Caddy. Stop/start/restore/upgrade always act on that selected Compose project. Backups and existing volumes are retained unless an operator deliberately removes them.

The separate proxy acceptance binds only loopback, uses Caddy’s local certificate authority and trusts that CA only inside the test client. It verifies the supplied proxy/backend topology, secure cookies, trusted client-IP replacement, same-origin API checks and HTTPS OAuth discovery. It neither changes the Mac trust store nor uses public DNS or ACME. Run these isolated Compose tests sequentially because the documented default subnet is shared.

When backup temporarily stops a running application, the operator resumes that same container with `up -d --wait --no-recreate`. This preserves its identity/configuration and waits for health on the documented Compose v2 baseline; it does not require the newer `start --wait` option. Failure diagnostics identify the operator line without printing command arguments or private payloads.

## Browser identity and live transport

Optional application environment settings are `APP_NAME` (default `xObject`, 1–80 characters), `APP_DESCRIPTION` (1–300 characters) and `BROWSER_TITLE_MODE=context|neutral` (default `context`). Neutral titles omit workspace/object/record names. These settings configure generic installation metadata; do not put secrets or private record contents in them. Restart the application after changing them. Icons and the generic share image retain the xObject product identity. Browser/OS caches may retain installation names/icons/previews until refreshed by that platform.

The web manifest provides one installation per `BASE_URL` origin, with standalone display and standard/maskable icons. No service worker caches authenticated business data. The application sends noindex/nofollow hints and denies anonymous data access; robots directives are not authorization. Public workspaces/record previews are later scope.

Allow cookie-authenticated POST `/api/events` responses to stream as `text/event-stream`. Disable proxy buffering and retain connections beyond the 15-second heartbeat. The supplied Caddy proxy passes streams through. The app shares one PostgreSQL LISTEN connection and bounds streams per process/user; see ADR 0036 for limits. Reconnect resynchronizes current state instead of replaying events. Preserve the existing Host/Origin and CSRF checks. `/api/client-info` returns only generic name/description/title mode/build identity and `/manifest.webmanifest` is public generic metadata.
