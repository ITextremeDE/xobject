# ADR 0036: Browser presence and live updates

- Status: Accepted
- Date: 2026-11-06

## Decision

Provide a single installable web application per installation origin. Its stable manifest ID, start URL and scope are `/`. Supply an original vector application mark, PNG favicons, an Apple touch icon, maskable installation icons and a generic sharing image. The manifest uses standalone display; HTTPS is required outside loopback. Browser installation support varies. Installation does not imply offline data access: no service worker caches business data, sessions or authenticated responses.

`APP_NAME`, `APP_DESCRIPTION` and `BROWSER_TITLE_MODE=context|neutral` configure the installation's generic browser identity. Authenticated context titles include the current workspace/object/record; neutral titles retain only the application name. Until configuration has loaded, use a neutral title. Interface language and the browser theme color follow the effective interface language and rendered theme. Build identity follows application source/assets/contracts and the lockfile. An available build offers an explicit reload after saving or discarding drafts; there is no automatic draft-destroying reload.

All server-rendered application document routes return escaped generic Open Graph metadata, with a root canonical preview URL and a generic sharing image. They never query or embed record contents for unauthenticated crawlers. The application sends `noindex, nofollow` and disallows crawling in robots.txt; these hints supplement normal authorization. Copy/share actions produce a canonical record URL without draft, filter, token or search parameters. Sharing a URL grants no access. Public anonymous viewing, public workspaces and record-specific public previews require a later explicit access model.

## Live transport and authorization

Web/API/MCP continue to use the same application writers. Before an application transaction commits, inspect only its own appended journal rows and relationship endpoints and enqueue minimal PostgreSQL NOTIFY messages. Commit publishes them; rollback publishes nothing. Read requests and no-op operations produce no change notifications. There is no second mutation path, journal watermark or database-schema migration.

Each server process shares one LISTEN connection. The browser opens a cookie-authenticated, same-origin POST `/api/events` fetch stream with the existing CSRF header and a bounded visible-record watch list. Browser events contain only refresh/session signals and the web build identity; record IDs and values stay inside the server. Current workspace and shared content predicates authorize notifications. A visible record's removal/revocation invalidates a retained watch reference once; subsequent hidden activity is silent. Administrator/global account events remain scoped to authorized Administrators or the affected user. Revalidate the session, active user and mandatory-password state on notifications and fixed heartbeats. Authentication loss closes and clears the client session; infrastructure failure reconnects without signing the user out.

Bound the service to 64 streams per process, four per user, 200 watched references per stream, 40 record references per internal message, a 100-message pending queue and 16 KiB output buffering. Watch lists follow active query views; broad cached/unobserved histories are not subscribed. The client reconnects with bounded exponential backoff and jitter, resynchronizes on readiness/focus/online and every four fixed heartbeats (one minute), and cancels on workspace change or unmount. LISTEN failure closes streams so reconnect can recover without replay cursors. Connecting notices appear only after a sustained 1.5-second attempt, so ordinary visible-record subscription renewals do not insert/remove a banner during navigation. Offline feedback is immediate; readiness cancels a pending notice. These signals are refresh hints, not a durable event feed or a notification inbox.

## Drafts and updates

Without local changes, invalidate active queries and adopt the latest record version. With a dirty/busy form, defer settings/list definition reloads while updating current record/relationship/security projections. Settings retain their drafts until save/discard. Transient background data/session failures retain cached editors and show a retry notice; confirmed unauthorized/deleted responses close the affected view. Record forms block stale-version saves and offer a three-way comparison against the original baseline. Combine disjoint edits; require an explicit draft/latest choice for each conflicting value, classification property, relationship field or security policy. Removed/unreadable field keys leave the merged draft. Adopt the new baseline/version, preserve the selected local edits and use normal backend validation and optimistic locking when saving. A later intervening write still produces a normal conflict.

## Consequences

The browser shell is installable without adding offline storage or a separate framework. External agent changes appear through normal authorized queries. Reverse proxies must stream SSE responses without buffering or compression delays and allow idle connections beyond the 15-second heartbeat. In-process stream bounds apply independently to each replica; deployment-wide quotas and durable change delivery are separate future decisions.

Acceptance uses pure metadata/URL/event-framing/merge tests, real PostgreSQL commit/rollback and visibility tests, and desktop/mobile browser checks with concurrent API writes. Actual OS installation, native sharing destinations, external crawler caches and multi-platform browser acceptance remain environment-specific release checks.

## References

- [Web app manifest and installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Open Graph protocol](https://ogp.me/)
- [PostgreSQL NOTIFY transaction behavior](https://www.postgresql.org/docs/current/sql-notify.html)
- [Caddy streaming reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)
