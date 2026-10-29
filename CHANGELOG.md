# Changelog

All notable changes to xObject will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Software releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The project is in early development. No software release is available yet.

### Added

- Shared ITextreme website design system with Tailwind CSS 4, typed Astro/React components, adapted shadcn/ui Base UI primitives, Lucide, schema-validated MDX content, reusable page metadata and generated sitemap.
- Public Astro project website at xobject.org, following the ITextreme Corporate Operating System, with self-hosted fonts, unchanged official logo assets, accessible light/dark/system modes and an explicit early-development status.
- Initial product requirements with 47 requirements, acceptance criteria, seven end-to-end acceptance scenarios and remaining design decisions.
- Project README describing the product idea, planned first-version scope, technology and commercial model.
- Shared agent instructions in `AGENTS.md`, imported by Claude through `CLAUDE.md`.
- Public roadmap outlining the first implementation slice, remaining version-one goals and later development areas.
- Full GNU AGPL version 3 license text and explicit `AGPL-3.0-only` licensing declaration, including Premium code.
- Workspace codes and readable technical table/field naming rules, documented in the PRD and ADR 0001.
- Local backend technical spike using Fastify, Kysely/pg and Better Auth, with workspace-prefixed text-field tables, shared API/MCP operations and atomic per-field journals.
- PostgreSQL integration tests, TypeScript build/check commands, development setup guide and GitHub checks workflow for the spike.
- Localized definition labels in JSONB, user/workspace language preferences and shared API/MCP operations with transactional journaling.
- Explicit standard-column order for new object tables and a development migration preserving earlier labels, records, identities and historical journal entries.

### Changed

- Match the ITx footer with adapted product copy, the same nine social brand icons and developer/technology credit.

- Match ITx header controls with real Base UI theme/mobile icon menus, neutral Button variants and compact single-row navigation, retaining the restrictive CSP and stored theme preference.

- Remove the public `/licenses/NOTICE.txt` index; individual upstream license files remain distributed with their assets.
- Align the project website with ITextreme’s page structure: compact sticky header, compact section navigation, accessible mobile navigation, shared container rhythm and grouped footer; remove visible license notices from the footer while retaining distributed attribution files.

### Fixed

- Database readiness checks use PostgreSQL TCP connections in integration tests and development Compose, avoiding premature success during container initialization.
