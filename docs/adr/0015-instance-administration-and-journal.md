# ADR 0015: Instance administration and journal visibility

- Status: Accepted
- Date: 2026-10-30

## Decision

The Settings sidebar has an Administrator-only Instance group containing Users and Journal. Workspace role assignment remains under Members & roles. Every operation resolves the current installation-wide Administrator flag; workspace Designers cannot manage accounts or read the global journal.

`create_user` provisions a local account from name, email and an initial password. Use Better Auth password crypto, lowercase email, no verified-email claim and an atomic credential/user/journal transaction. Return only user metadata. New accounts are regular active users with `must_change_password = true`, no workspace memberships and no implicit content grants. Direct public signup and alternate auth-management endpoints remain disabled.

Before the first password change, the common application layer permits only own account-security inspection and password change. The web client presents that screen before rendering workspace content. Successful change clears the flag atomically and revokes every other initial-password session regardless of the caller's optional revocation preference. Verification/crypto/journal failures preserve the flag and original credential. Do not store initial/new passwords, hashes or session bearer values in journals, logs or user-management responses.

`list_managed_users` and `configure_user` manage names, active state and Administrator status with optimistic versions. Editors open through the row or its keyboard-accessible name button and expose Command/Ctrl+Enter. Keep the baseline version while a draft is dirty, even when the list refetches; conflict errors preserve that draft until Reset adopts the refreshed state. The authenticated Administrator cannot remove their own active Administrator access. Retain at least one active Administrator. Disabling an account revokes its sessions atomically, prevents new session issuance and denies common application operations from current database state. Reactivation preserves the same identity, references, memberships and history. No hard deletion, credential reset or email-change flow is introduced. E-mail verification/change and mail delivery remain deferred. Own profile/first-password changes advance the management version to prevent overwriting concurrent edits.

`list_system_journal` is read-only and Administrator-only. It paginates all existing journal rows, optionally filtered by workspace, field-key substring and exact entity kind. The UI shows actor, scope, object identity, old/new values, event time and shared change ID; historical values remain as stored. Existing record/definition journals remain available in their contexts. This provides visibility of already recorded events, not a claim that unimplemented features already generate journal entries.

Workspace General shows the existing `created_by` identity/name and a `created_at` timestamp. New workspaces set the timestamp on creation. Migration backfills older timestamps only from their retained original workspace-code journal event; otherwise it leaves null and displays Unknown. Changing workspace names does not change creation metadata.

`is_protected` on object/field definitions continues to enforce definition lifecycle protection under ADR 0009. It is not an access grant or blanket immutable flag for every configurable attribute. Group lifecycle remains reversible activation/deactivation under ADR 0013; no hard group deletion is introduced.

## Validation

API/MCP tests cover Administrator boundaries, initial-password restriction, credential changes, current-session preservation/other-session revocation, inactive sign-in, optimistic conflicts, own-Administrator safeguards, journal filtering/pagination and secret exclusion. Failure injection verifies atomic user provisioning and initial-password flag/credential rollback. Regional tests cover inheritance, exact decimal display and zone-independent date-only formatting. Chrome acceptance used a disposable fixture: workspace/personal regional saves and live previews succeeded; General displayed creator/time; successful group save closed its modal and returned focus; editing a user name updated the list; the global journal showed those changes and applied its property filter. A provisioned account opened the mandatory initial-password screen instead of workspace content. Password submission itself was verified through API tests. No real user accounts were provisioned or edited during acceptance.
