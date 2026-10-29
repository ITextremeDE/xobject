# Changelog

All notable changes to xObject will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Software releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The project is in early development. No software release is available yet.

### Added

- Record-table column sorting through shared API/MCP operations, applied before pagination with accessible direction indicators.
- Command/Ctrl+K toggles workspace search, with visible shortcut hints and keyboard-help documentation.
- Settings form with language explanations, appearance choices, explicit Save/Reset actions and unsaved-change protection.
- Workspace search in the header alongside Breadcrumb navigation, with object/record results, keyboard selection and a shared API/MCP search operation.
- Header actions for the user menu, appearance selection and a disabled placeholder for future notifications.
- Personal settings page in the user menu for account language and browser appearance, with a workspace Breadcrumb link back to the Dashboard.
- Dashboard as the first navigation entry and workspace landing page, showing available object types with direct access and creation.
- Central keyboard shortcuts for focused-form submission and record search, with localized keyboard help, visible key hints and preserved native widget navigation.
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
- First Administrator web interface using React, Vite, standard shadcn/ui and semantic theme variables, with German/English labels and light/dark/system appearance.
- Browser login/logout, workspace/object/text-field creation, searchable paginated record tables, versioned editing, unsaved-change protection and per-field record journals.
- Shared TypeScript input/output contracts and matching API/MCP operations for listing object types and searching records.

### Fixed

- Record keywords retain keyboard focus styling without a hover underline; standard table-row hover highlighting remains.
- Field and record creation buttons include standard Lucide icons, including the empty-table action.
- Personal settings use an unboxed page form with language/appearance sections and a separate action row.
- Header search uses muted placeholder text and the compact standard-width Command dialog layout.
- Appearance dropdown closes after selecting a theme with mouse or keyboard.
- Desktop record panels leave the surrounding navigation clickable; mobile panels retain their modal backdrop.
- Use the official Base UI Nova components consistently, including menu activation, dialog composition and unsaved-edit protection.
- Web workspace layout follows the official shadcn Sidebar 07 and Tasks references, with workspace/user menus, icon collapse, Breadcrumb navigation and a content-sized record table.
- Database readiness checks use PostgreSQL TCP connections in integration tests and development Compose, avoiding premature success during container initialization.
