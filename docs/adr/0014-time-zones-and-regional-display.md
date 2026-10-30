# ADR 0014: Time zones and regional display

- Status: Accepted
- Date: 2026-10-30

## Decision

Workspace Language & region stores a named IANA time zone in `sys_workspaces.time_zone`. Administrators and Designers configure it together with the language policy in the existing versioned `configure_workspace_languages` transaction. Omitted `timeZone` retains its value for older clients. Personal Language & region stores an optional global `sys_users.time_zone`; null inherits the current workspace. `configure_user_localization` atomically saves the owner's language and time zone with expected previous values. Both paths journal each changed property under one change ID, reject stale writes and produce no journal/version changes for no-ops. Better Auth exposes the saved preference but does not accept direct profile writes to it.

`get_time_zone_catalog` supplies named zones supported by the server's Intl/IANA data, including UTC. Numeric offsets and unknown zones are rejected by shared contracts. New-workspace UI proposes the browser zone and allows changing it before creation; API/MCP defaults to UTC. Existing workspaces migrate additively to UTC and users to null; no server-location inference or record rewriting occurs. Repeated migrations preserve configured values.

The effective personal/workspace zone governs timestamp input, record-list dates, custom timestamp values, record/definition journals and account-session times. PostgreSQL `timestamptz` values remain instants; API/MCP require explicit offsets and return UTC. Date-only fields remain calendar dates and are never shifted by time zones. The Temporal polyfill converts web wall-clock input using the selected named zone, independent of the browser zone. Spring-forward gaps are invalid; autumn overlaps require selecting one of the two UTC instants. Unchanged existing instants retain their occurrence and millisecond precision.

## Other regional preferences

Workspace `regional` JSONB stores locale, date-format override, 12/24-hour override, number-format override and first weekday. The installed regional-format catalog covers German (Germany/Austria/Switzerland) and English (US/UK/Canada/Australia), independently of interface language. Each override initially derives from the selected locale. New workspaces default to de-DE for German or en-US for English; existing workspaces derive this initial locale from their default language once. Repeat migrations preserve configured settings.

Personal `regional_preferences` JSONB contains nullable overrides for each property. Null inherits that workspace property; a selected personal locale affects any inherited automatic format. All-null personal settings normalize to null. Workspace updates share `language_version`; personal changes compare expected prior regional settings. Each changed property gets its own journal event under the common change ID, with rollback/no-op rules shared with language/time-zone configuration. Direct auth profile input cannot write these preferences.

The shared display formatters apply to custom date/time, exact numeric/money values, list metadata, journals and security-session dates. Decimal strings pass to Intl without conversion to floating-point numbers. Date-only values are formatted without zone shifting. The settings form previews dates, time, numbers and first weekday. Week start is stored and previewed for future calendar consumers; no calendar view is introduced. Native date/time input presentation still follows browser/OS settings, and numeric inputs retain their documented canonical decimal-point syntax. Currency belongs to money field defaults and each saved value; preferences never convert or rewrite stored currencies/values.

## Validation

Application tests cover catalog validation, own-user scoping, role checks, optimistic conflicts, no-ops, API/MCP access, retained preferences across migration and rollback on journal failure. Web tests cover workspace/personal fallback, summer/winter offsets, fractional-hour zones, millisecond round trips, gaps and explicit overlapping instants. Chrome acceptance on an isolated disposable fixture verified personal Tokyo override saving, inherited Berlin fallback, workspace UTC/Berlin changes, and matching table/form display. A 10:30 UTC instant displayed as 19:30 in Tokyo; a 20:00 Tokyo edit displayed as 13:00 in Berlin. The Berlin spring gap blocked Save, and both autumn occurrences could be selected, saved and reopened with the correct offset. Settings-section changes preserved separate drafts; the occurrence selector retained focus after selection. The local development schema was migrated and its server restarted; acceptance data remained isolated.
