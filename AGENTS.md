# xObject project instructions

## Purpose and sources

xObject is ITextreme's planned metadata-driven, API-first application for connected business data. Version 1 combines CRM, project management and user-defined object types.

Read [README.md](README.md) for orientation and [docs/PRD.md](docs/PRD.md) for requirements, acceptance criteria and open design decisions. Preserve requirement IDs when refining the PRD. Do not treat a specification or proposed acceptance scenario as an implemented feature or a passed test.

OpenProject is the source for operational tasks, priorities and dependencies. The repository owns requirements, architecture decisions, code and versioned documentation. Keep private planning details, credentials and internal infrastructure information out of this public repository.

## Current state and commands

The repository contains a local backend technical spike in `apps/server`, with npm workspaces, a lockfile and a GitHub checks workflow. There is no web client, installation package or software release. The experiment is restricted to authenticated Administrators and scalar text fields; it does not satisfy the complete version-1 scope.

From the repository root, use `npm ci`, `npm run typecheck`, `npm run build` and `npm test`. Tests require Docker and start an isolated disposable PostgreSQL container. See `docs/development.md` for `npm run db:migrate`, `npm run admin:create` and `npm run dev`; never point experimental initialization at a production database. No lint command is established.

The independent public project website lives in `apps/site`; it is not an application release. Run `npm ci`, `npm run build` and `npm test` in that directory. Browser tests require Chromium (`npx playwright install chromium`). See `docs/website.md`.


For documentation changes, check Markdown structure, relative links and section anchors, requirement references, whitespace and unintended sensitive content. `git diff --check` is an available whitespace check; include newly created files in review because untracked files are not covered by that command.

## Agreed architecture

- PostgreSQL is authoritative for definitions, records, relationships and journal data. Object types use their own data tables; specify collection/reference storage and schema migrations before implementing them.
- Use readable workspace-prefixed data table names (`itx_contacts`) and the reserved `sys_` prefix for system tables, as specified in PRD section 3.1 and ADR 0001. Keep UUID identities separate from technical names and editable display labels. Workspace codes and technical names are fixed after creation in version 1; prefixes do not enforce authorization.
- The backend experiment evaluates Fastify, Kysely/pg, Better Auth and the official MCP SDK; see ADR 0002 for scope and outstanding production decisions.
- Definition labels use JSONB language maps, separate from stable technical names. Follow PRD section 3.3 and ADR 0003 for user/workspace language fallback and physical column order. Preserve existing records and historical journal values during migration; do not automatically rebuild tables solely for ordering. An explicitly authorized development-data rebuild is a separate maintenance operation.
- Backend, API and MCP use TypeScript on Node.js in a modular monolith. Web uses React, TypeScript and Vite.
- UI uses Tailwind CSS and shadcn/ui. Prefer standard components, existing variants and composition, with minimal custom CSS and centralized semantic tokens/CSS variables.
- UI, API and MCP use the same backend rules. Do not implement a capability exclusively in the UI or rely on UI checks for correctness or authorization.
- Git stores application source and project documentation, not live business records. Self-hosting must not require a Git account or a user-owned repository.
- Official self-hosting targets prebuilt images and Docker Compose on Linux. Concrete frameworks, versions, security mechanisms and operational commands remain design decisions until specified.

The intended monorepo layout is `apps/web`, `apps/server`, `packages/contracts`, `deploy` and `docs`. Only create the parts required by the active task; this list is not an instruction to scaffold the application.

## Product invariants

Consult the PRD for complete behavior. In particular:

- Workspaces isolate contents, definitions, groups, module activations and number sequences for regular users. Administrators have installation-wide content access. Keep the explicit Administrator exception distinct from object-level Full access.
- Agents act with their user's effective rights. All access channels must apply the same authorization, validation, feature entitlements and journal rules.
- Contact kind is separate from Type. Each Contact is exactly one of Organization, Individual contact or Contact person. Do not merge these concepts or reintroduce simultaneous contact kinds.
- A shared object type can belong to multiple modules without duplicating records or shared values. Protect supplied definitions while allowing the agreed configuration of input aids and user-defined extensions.
- Each record has at most one direct Primary association. Derive ancestor context from relationships; do not independently store competing context values or infer permissions from the hierarchy.
- Record one journal entry per field change, group related entries by change ID, and persist changes and their journal atomically. Apply historical-value permissions and the specified permanent-deletion behavior.
- Deactivate data-bearing user-defined fields instead of deleting them. Reject unsafe field conversions. Activate stricter relationship rules only after existing affected data satisfies them.

Uploads, attachments, import/export, SSO, native clients, offline synchronization, Kanban and calendar views are outside version 1. Do not add them to the initial scope implicitly. General undo and computed fields are also outside the current delivery baseline.

## Working approach

1. Inspect branch, worktree, relevant instructions and the affected PRD requirements before editing.
2. Preserve unrelated and user-owned work. Make the smallest coherent change for the authorized objective.
3. Resolve the relevant open design decisions before implementing the affected behavior. Record significant decisions as ADRs under `docs/adr/` when that work is in scope.
4. Implement in small, end-to-end slices. Use feature branches, pull requests and review for implementation work in line with the agreed workflow.
5. Validate the affected acceptance criteria with appropriate checks. Run builds when application code or dependencies change; do not run nonexistent or unrelated application builds for documentation-only edits.
6. Report what changed, what was actually verified, and remaining uncertainties. Keep implementation, acceptance, deployment and publication distinct.

## Documentation and licensing

Project documentation is primarily English. Keep domain terms consistent with the PRD and use IREB/CPRE terminology for requirements work.

The established conventions are Markdown, Diataxis, ADRs, Conventional Commits, Semantic Versioning and Keep a Changelog. Create or update the corresponding artifacts when relevant to the authorized work; their mention here does not establish an existing release process or CI setup.

`CHANGELOG.md` is the intended release-change source. `ROADMAP.md` is a curated public view of OpenProject, not a parallel operational task list. Reuse these sources in the planned Astro/Starlight documentation instead of maintaining manual copies.

xObject is licensed under `AGPL-3.0-only`, including Premium code. See `LICENSE` for the unmodified license text and `README.md` for the project licensing declaration. Preserve the version-3-only choice. Contribution terms, legal licensor designation and commercial feature split still require completion. Do not invent those terms or introduce proprietary Premium code.

## Commits, remotes and publication

Follow the active user's authorization for commits, pushes and publication. Stage only reviewed files or hunks, inspect the staged diff, and exclude unrelated changes and secrets. Use Conventional Commit messages in English.

GitHub `origin` is the leading public remote. `forgejo` is the second private remote. When publishing is authorized:

1. Push the intended branches/tags to `origin`.
2. Push the same intended state separately to `forgejo`.
3. Verify both remote references independently and report any partial failure.

Do not substitute an automatic pull mirror or develop divergent histories on the two remotes. Git pushes do not back up issues, reviews, PR discussions or release attachments. Do not force-push, rewrite history, alter protections or deploy unless those actions are covered by the user's authorization.
