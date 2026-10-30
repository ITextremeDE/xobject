# Changelog

All notable changes to xObject will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Software releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The project is in early development. No software release is available yet.

### Added

- Workspace Dashboard based on shadcn dashboard-01 with actual record/object statistics, a 7/30/90-day activity chart and a cross-object standard-field table through shared API/MCP operations. Object-filter sections, column visibility, page selection, row actions and complete pagination also serve individual record lists; growing administration tables and the instance Journal share the pagination footer.
- Sidebar search placement based on sidebar-02 and a scrollable command menu combining navigation, object definitions, resources and authorized record search, including Command/Ctrl+K and keyboard selection.
- Administrator-only local user management with initial-password provisioning, mandatory first password change, reversible account activation and session revocation; atomic credential/metadata journals exclude all password material. Instance Journal displays every recorded change with workspace, field/property and entity-kind filters and pagination. Workspace General displays the creator and evidenced creation time.
- Regional display settings independent of interface language: workspace locale, date/time/number formats and first weekday with per-property personal inheritance, live previews, exact decimal formatting and atomic property journals.
- Workspace time zones and optional personal overrides in Language & region, shared API/MCP validation, atomic journals and conflict checks. Timestamp display/input follows the effective named zone, including DST gap validation and explicit overlap selection; date-only values remain unchanged.
- Workspace user-group management with shared create/rename/member/activation API/MCP operations, version checks and atomic property/member journals. Administrators manage memberships and activation; Designers manage names and empty group creation; Users can inspect groups. Deactivation preserves references/history, blocks new assignments and permits reactivation; removing workspace access also removes its group memberships atomically.
- Central installed German/English language catalog and per-workspace interface/default/definition-language settings, shared versioned API/MCP validation and atomic journals. Unavailable user preferences fall back without being overwritten; disabling a definition language preserves translations and history while blocking edits/new translations in that language.
- Shared workspace Appearance settings for Administrators/Designers: separate shadcn base colors, themes and chart palettes, optional primary/secondary colors with calculated text contrast, corner radii, normal/inverted and translucent menu surfaces with subtle/bold accents, and all 26 pinned shadcn font choices for the interface and optional separate headings served locally with their license notices. Interactive light/dark menu and selection previews preserve drafts and portal scope; versioned API/MCP writes journal each changed property atomically, and workspace changes apply the saved design including portalled controls. Personal light/dark/system mode stays separate.
- Prepared Profile picture area with standard Avatar initials and a clearly disabled upload action; image upload/storage and verified email changes remain deferred.
- Personal Profile settings for the own display name, read-only sign-in email and atomic API/MCP profile journals; refreshed user menus/initials, guarded drafts and Profile-first navigation followed by Account & security, Appearance and Language & region.
- Personal Account & security settings with verified password changes, own active-session metadata and confirmed revocation of other sessions through shared API/MCP rules; changes and secret-free security events are atomic, with a bounded failed-password guard and no alternate auth-route bypass.
- Sidebar footer links for Documentation, Changelog and Roadmap under the localized Resources heading directly above the user menu, with standard icons, collapsed-sidebar tooltips and accessible new-tab behavior.
- Field/object definition lifecycle with deactivation, preflighted reactivation and confirmed deletion of never-used storage through UI/API/MCP; protected definitions, current/historical usage and database dependencies are enforced atomically. Tombstones and definition journals preserve historical identities, inactive values remain readable, and Type/Status fields share one lifecycle.
- Instance-wide Administrators and per-workspace User/Designer memberships, with Administrator-managed role assignment, version checks and atomic journals through UI/API/MCP. Users can view workspace settings; Designers can edit configuration within their workspace. Content permissions remain separate and business-content access stays Administrator-only for now.
- Saved manual ordering for Type, Status and Category options, with drag handles, keyboard-accessible move buttons, matching record selection/display order and atomic per-field ordering journals through API/MCP.
- All planned custom field types with precise numeric/money values, date/time handling, Markdown, stable single/multiple choices and scoped user/group references through shared UI/API/MCP validation.
- One field editor for creation and editing, with type-specific settings, atomic conversion preflight, protected standard fields and versioned per-field conversion journals.
- Required/optional configuration for every business field, including Keyword, with read-only field-table indicators and an attribute editor opened from each row, existing-data preflight, shared API/MCP validation and atomic journals.
- Workspace object settings provide an alphabetical standard shadcn Select, editable German/English labels, read-only technical attributes, classification configuration and a field-definition table with an Add field action. Object changes preserve the shared API/MCP journal rules and protect unsaved drafts.
- Configurable Type, Status and Category fields with stable localized options, per-object required flags, defaults, Without Type statuses and single/multiple Category selection.
- Shared API/MCP validation, versioned classification configuration, compatibility preflight and atomic per-field/option journaling, with additive migration of existing data.
- Record rows open details from non-interactive cells, with a keyboard-accessible Keyword link; embedded controls and text selection keep their own behavior.
- Clicking the exact active Sidebar destination refreshes its data while preserving the document, list parameters, history and unsaved-change guard.
- Direct web routes for personal settings, workspace Dashboards, object lists and records, with URL-based search/sort/pagination and guarded Back/Forward navigation.
- Record-table column sorting through shared API/MCP operations, applied before pagination with accessible direction indicators.
- Header actions for the user menu, appearance selection and a disabled placeholder for future notifications.
- Personal settings form in both user menus for account language and browser appearance, with explicit Save/Reset actions, unsaved-change protection and a workspace Breadcrumb link back to the Dashboard.
- Central keyboard shortcuts for focused-form submission and record search, with localized keyboard help, visible key hints and preserved native widget navigation.
- First Administrator web interface using React, Vite, standard shadcn/ui and semantic theme variables, with German/English labels and light/dark/system appearance.
- Browser login/logout, workspace/object/text-field creation, searchable paginated record tables, versioned editing, unsaved-change protection and per-field record journals.
- Shared TypeScript input/output contracts and matching API/MCP operations for listing object types and searching records.
- Shared ITextreme website design system with Tailwind CSS 4, typed Astro/React components, adapted shadcn/ui Base UI primitives, Lucide, schema-validated MDX content, reusable page metadata and generated sitemap.
- Public Astro project website at xobject.org, following the ITextreme Corporate Operating System, with self-hosted fonts, unchanged official logo assets, accessible light/dark/system modes and an explicit early-development status.
- Localized definition labels in JSONB, user/workspace language preferences and shared API/MCP operations with transactional journaling.
- Explicit standard-column order for new object tables and a development migration preserving earlier labels, records, identities and historical journal entries.
- Local backend technical spike using Fastify, Kysely/pg and Better Auth, with workspace-prefixed text-field tables, shared API/MCP operations and atomic per-field journals.
- PostgreSQL integration tests, TypeScript build/check commands, development setup guide and GitHub checks workflow for the spike.
- Workspace codes and readable technical table/field naming rules, documented in the PRD and ADR 0001.
- Initial product requirements with 47 requirements, acceptance criteria, seven end-to-end acceptance scenarios and remaining design decisions.
- Full GNU AGPL version 3 license text and explicit `AGPL-3.0-only` licensing declaration, including Premium code.
- Public roadmap outlining the first implementation slice, remaining version-one goals and later development areas.
- Shared agent instructions in `AGENTS.md`, imported by Claude through `CLAUDE.md`.
- Project README describing the product idea, planned first-version scope, technology and commercial model.

### Changed

- Muted table headers and example-aligned user-menu profile spacing; resource links sit above the separate sidebar user footer.
- Consistent shadcn form disabled/validation states and inline account/profile errors, standard pending-action spinners, matching empty journal views and keyboard-accessible collapsible definition details.
- Dialog action footers consistently place Close/Cancel left and Reset then Save/Create right, with shared neutral/primary styling, read-only dismissal, invalid-draft reset and pending guards; destructive confirmations use a destructive action.
- Definition journal entries use localized attribute/value labels, aligned Before/After columns, compact actor/time metadata and expandable structured values.
- Settings dialog offers a larger 960 × 640 px desktop layout while remaining constrained to the viewport; the deleted-definition toggle appears below the object selector.
- Unused Type/Status choices can be deleted with atomic journals; current/historical record references and retained Status mappings prevent deletion, and deleted identities cannot be reused. Standard-field technical names and German/English labels are reserved across custom-field creation and renaming.
- New object types start without Keyword, Type/Status or Category; Add field offers missing standard fields through a dropdown and creates them atomically via UI/API/MCP. Existing definitions are preserved, absent fields stay absent across migrations, and records without Keyword use their ID. Status entries have separators.
- Type, Status and Category input aids live in their field dialogs; a shared Type/Status view places each type beside its statuses, including Without Type, with required flags, defaults and unsaved-change protection.
- Installation-wide Administrator status uses the protected `sys_users.is_admin` flag; migration preserves previous assignments and removes `sys_administrators`.
- Object-definition creation is available in workspace settings; record-list toolbars keep only record creation, with field and classification configuration in settings.
- Object, field and choice labels use one shared input with a language selector and translation status instead of separate language fields; switching language retains all drafts until Save.
- Settings use the shadcn Sidebar 13 dialog layout, with Personal sections for Appearance and Language & region, plus Workspace sections for General (editable name, read-only code), Language & region (default language), and Object types (alphabetical standard shadcn Select, editable translated labels, read-only technical names, classification configuration and a field-definition table). Workspace name changes share API/MCP validation and atomic journaling. Save/Reset apply to the current page; the close guard covers all unsaved drafts.
- Project website footer matches ITextreme with adapted product copy, nine social brand icons, developer/technology credit and the complete copyright line.
- Project website header matches ITextreme with Base UI theme/mobile icon menus, neutral Button variants and compact single-row navigation, retaining the restrictive CSP and stored theme preference.
- Removed the public project website `/licenses/NOTICE.txt` index; individual upstream license files remain distributed with their assets.
- Aligned the project website with ITextreme’s page structure: compact sticky header, compact section navigation, accessible mobile navigation, shared container rhythm and grouped footer; remove visible license notices from the footer while retaining distributed attribution files.

### Fixed

- Keep content-hashed assets across local web rebuilds so open clients can still load settings and other lazy views; CI/explicit clean builds remain clean. Module-load failures offer an accurate reload message.
- Open user editing from the whole row, preserve the expected version of unsaved drafts across refetches, and recover conflicts with Reset. Save exposes the common keyboard shortcut.
- Apply the local-search keyboard shortcut and hint on the Dashboard; distinguish group, membership/role and user navigation icons; restore dashboard-01 card and SVG area gradients using workspace colors.
- Close the user-group editor after successful save while retaining drafts on errors and returning keyboard focus to the group.
- Empty classification-only records retain an atomic creation event; historical usage still blocks object deletion after a current row is gone. Definition filters preserve unsaved drafts, and deleted standard fields show their own historical attributes instead of a replacement field’s live classification.
- Normal dialogs consistently offer a localized top-right close button, with room reserved in their headers and existing pending/unsaved-change guards preserved; confirmation dialogs retain explicit decision actions.
- Keyboard help uses the shared dialog layout with a consistent width, fixed header/footer and a scrollable body that preserves rounded corners.
- Long unbroken choice names wrap within their column instead of widening the editor’s inner table on narrow screens.
- Inactive Types disable their initial-Status selector and explain the restriction, matching the shared backend validation.
- Choice names and reorder/delete actions share one compact row in the field settings, while preserving accessible group names and keyboard controls.
- Scrollable Type/Status settings retain rounded corners with a separate scrolling body and fixed actions; dividers separate Status entries, the initial-status control and new Type creation.
- Clickable record rows preserve the standard table cursor without a custom pointer override.
- Not-found views use a Dashboard icon for navigation and distinguish missing records from connection errors.
- Record keywords retain keyboard focus styling without a hover underline; standard table-row hover highlighting remains.
- Field and record creation buttons include standard Lucide icons, including the empty-table action.
- Personal settings use an unboxed page form with language/appearance sections and a separate action row.
- Header search uses muted placeholder text and the compact standard-width Command dialog layout.
- Appearance dropdown closes after selecting a theme with mouse or keyboard.
- Desktop record panels leave the surrounding navigation clickable; mobile panels retain their modal backdrop.
- Use the official Base UI Nova components consistently, including menu activation, dialog composition and unsaved-edit protection.
- Web workspace layout follows the official shadcn Sidebar 07 and Tasks references, with workspace/user menus, icon collapse, Breadcrumb navigation and a content-sized record table.
- Database readiness checks use PostgreSQL TCP connections in integration tests and development Compose, avoiding premature success during container initialization.
