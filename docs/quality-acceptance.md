# Local quality acceptance

This report describes the current unreleased candidate. Local evidence does not establish a published release, a production SLA or client/model compatibility.

## Permission and query performance

Run `npm run measure:permissions` from the repository root. The command creates and removes its own isolated PostgreSQL 18 container; it never loads the development database. Its local result is written under `.local/permission-performance.json`.

The measured profile contains 10,250 records across ten objects, including five custom sensitive objects, 20 nested groups, a foreign-owner group and 3,000 relationships. Sensitive records mix direct ownership, group ownership, foreign access, public access and denied Personal records; 80% are readable. Field exceptions remain applied. Each read scenario uses 48 requests with concurrency eight after three warmups; writes use 24 sequential optimistic-version updates with journals.

Initial targets were set before measurement. The accepted local run used Node.js 26.9.0 on macOS ARM64 and PostgreSQL 18 in Docker. Fastify HTTP injection includes session/authentication, database and application work; it excludes TLS and network latency.

| Scenario | p95 target | Measured p95 |
| --- | ---: | ---: |
| Object list | 750 ms | 140.4 ms |
| Workspace list | 750 ms | 301.4 ms |
| Global search | 750 ms | 231.7 ms |
| Dashboard | 1,500 ms | 281.0 ms |
| Record | 750 ms | 47.6 ms |
| Incident relationships | 1,000 ms | 247.7 ms |
| Versioned update and journal | 1,000 ms | 40.5 ms |

Equivalent record-level access explanations are reused only within the current object/transaction. Each row retains its own field policy; no cross-request authorization cache exists. Relationship inspection queries incident edges through existing endpoint indexes. All 163 backend tests passed after these changes. Production sizing still requires the actual host, latency, distribution and concurrency profile.

## Accessibility and responsive use

Use the existing shared shadcn primitives, associated form labels, visible keyboard focus, guarded dialogs, keyboard table navigation and command menu. The acceptance target is WCAG 2.2 AA for the supported workflows; an automated result is only one part of that assessment.

Local Playwright Chromium checks cover desktop 1440 × 1000 and mobile 390 × 844. OAuth consent/application revocation and documentation navigation/search were exercised without console errors or horizontal page overflow. Axe reported no serious/critical findings in the tested consent and documentation views. Documentation search corrects a pinned upstream accessible-name mismatch through Starlight's supported composition hook. Whole-product manual and assistive-technology acceptance remains a release gate, rather than being inferred from those focused checks.

## Installation and recovery

The [self-hosting guide](self-hosting.md) defines the current operator path. Isolated Linux/ARM64 container acceptance covers first setup, HTTP content/history, private checksummed backup, content mutation, stopped-writer restore, integrity verification, current-target maintenance and refusal/recovery for an unsupported source fingerprint. Node.js 24 is the image runtime. The same procedure also passes with the Linux/AMD64 application/operator image under emulation on the ARM64 Docker host, using native PostgreSQL 18. This is architecture/emulation evidence, not native AMD64-host acceptance. The separate Caddy loopback-HTTPS test passes with its local CA, canonical Host, secure cookies, spoofed-IP replacement, Origin rejection and HTTPS OAuth metadata. It reserves the fixed proxy address outside Docker’s dynamic pool. Live public TLS, the actual supported host and released-predecessor migrations remain separate delivery gates.

## Provider acceptance

The official MCP client/server SDK verifies protocol negotiation, shared output schemas, structured results, errors, current permissions, revocation and Skills digests. OAuth tests cover PKCE, signed consent, resource binding, scopes and refresh. The optional plugin is locally packaged from canonical skills. Actual OpenAI host/model discovery, authorization and skill loading remain unverified until connected in an available OpenAI client; other providers are untested. See [API and MCP](api.md).
