# ADR 0012: Installed and workspace-available languages

- Status: Accepted
- Date: 2026-10-30

## Context

The initial UI and definition-label editors separately hard-coded German/English choices. Workspaces need an available-language policy without losing saved preferences, definition translations or history. Interface translation packs and business-definition labels are distinct concerns.

## Decision

The shared contracts catalog lists the installed German and English packs. `get_language_catalog` exposes this inventory through API/MCP. It is a read-only inventory of shipped translations; adding another pack is a later code/resource/migration change, not an administrative promise of an untranslated interface.

Store `available_languages`, `label_languages` and positive `language_version` on `sys_workspaces`, alongside `default_language`. Both lists must be unique, supported and nonempty; the default must be in the interface list. Existing and new workspaces initially allow both languages. The migration is additive and preserves configured lists on rerun.

Administrators and the workspace's Designers may atomically configure both lists and the default through `configure_workspace_languages` with an expected version. Users view the settings. Journal one event per changed property using a shared change ID. No-op writes create no events or version increments. A journal failure rolls everything back. The legacy `set_workspace_language` operation preserves its single-property contract, checks current availability and delegates to these same transaction/journal rules with the current version; it is not an expected-version API.

Keep `sys_users.language` as a global optional preference. Use it only where available, otherwise use the workspace default without changing the saved preference. Apply this resolution to UI, metadata reads/search and option sorting. Login uses the installed catalog because no workspace has been selected yet.

Definition languages are independently configurable. Preserve label JSONB and journal data when a language is disabled. The shared translation editor shows active languages plus retained translations from inactive installed languages. Retained inactive translations are read-only; no new/changed translations in an inactive language are accepted through API/MCP. Validate object/field labels and both classification/custom option labels. Other attributes may be changed while preserving inactive labels. Structural definition lifecycle rules remain separate. Read fallback can still use retained translations when an effective-language label is missing.

## Validation

Tests cover independent interface/label choices, minimum/default constraints, unavailable preference fallback without mutation, retained labels, forbidden inactive-language writes, API/MCP parity, roles, versions, no-ops, rollback and repeat migration. Existing metadata, journal and sorting tests remain part of acceptance.

Chrome acceptance on 2026-10-30 used an isolated disposable database and synthetic users. Removing the selected default blocked saving; valid interface/definition-language changes saved successfully. A retained English object label stayed visible and read-only after English definition labels were disabled. No real workspace policy was changed during this check.
