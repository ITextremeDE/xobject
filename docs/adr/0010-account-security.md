# ADR 0010: Personal password and session management

Status: Accepted for the local experiment

## Decision

Personal settings expose Account & security for every signed-in user, including Users without workspace membership. The page changes the current user's local password and lists/revokes their own active sessions. Workspace roles and Administrator status confer no authority over another user's credentials or sessions. SSO linking and email changes remain outside this slice. The adjacent Profile page changes only the own display name through `set_user_profile`, with an atomic user-name journal; email and administrative flags are not accepted as profile input.

The shared `get_account_security`, `change_password`, `revoke_session` and `revoke_other_sessions` API/MCP operations run in the common model transaction. The transport supplies the authenticated session ID; it is not an impersonation parameter. Security operations recheck its ownership and expiry inside the transaction, including after waiting for the model lock. Session lists expose IDs and descriptive metadata, never bearer tokens or account credentials. Expired sessions are omitted. End the current session through the existing sign-out action; the new revoke operations target other own sessions only.

Reuse Better Auth's public password hash/verification functions, explicitly configured for both authentication and the security service. Local passwords contain 12–128 characters, without trimming; changing one requires the correct current password and a different new password. The UI repeats the new password to catch typing errors. For ordinary password changes, other sessions are revoked by default, with an explicit opt-out; the current session remains valid, avoiding transmission of replacement credentials to API/MCP clients. A later production review must assess session rotation and freshness requirements together with the production authentication design.

Credential writes, revocation and journal events commit or roll back together. Journal only a `password_changed` Boolean event and one `revoked` Boolean event per ended session, grouped by change ID; never log passwords, password hashes, bearer tokens or copied session metadata. These are security-event indicators rather than historic credential values. In-application account provisioning through `create_user` and mandatory initial-password changes are journaled under [ADR 0015](0015-instance-administration-and-journal.md). The initial-password flow always revokes other sessions, without opt-out. Login/sign-out and the separate experimental `admin:create` CLI lifecycle journaling remain pending.

A per-account, per-process guard permits at most five incorrect current-password attempts per minute and is bounded to 10,000 entries, with expired entries removed. It is shared by the HTTP and MCP adapters. It is not a durable or distributed production rate limiter. Hashing occurs under the experiment's global lock; production throughput remains a separate design concern.

Keep the Better Auth HTTP adapter restricted to the currently used sign-in, sign-out, session lookup routes. Generic profile update, alternative password/session-management routes and raw account/session listing are unavailable, so they cannot bypass the common journal or expose other session tokens. Future auth features require an explicit adapter review.

## Presentation and validation

The page uses the existing settings navigation, standard shadcn fields, shared close/pending/unsaved-draft guards, Reset then Change password actions and explicit confirmations for session revocation. Password drafts stay in component memory only and clear on success, reset or closing settings. A session's update timestamp is a periodic auth refresh, not proof of its last request. Display devices as browser/OS hints; the current session is identified separately.

Disposable PostgreSQL tests exercise User/Admin ownership, current-session protection, expiry, denied password guesses, login after password change, optional other-session revocation, secret-free outputs/journals, blocked alternative auth routes and rollback after induced journal failures through the common API/MCP layer. Browser checks cover the rendered settings and session actions without changing the operator's real credentials.

## Deferred identity setup and profile features

The [PRD setup/profile plan](../PRD.md#planned-installation-setup-and-deferred-profile-features) records the agreed future interactive container command for the first Administrator and the verified email-change flow. Email changes depend on outgoing mail and remain unavailable. The profile-picture area currently shows initials and a disabled upload action; image loading/upload/storage remains deferred.
