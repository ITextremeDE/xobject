# ADR 0008: Instance Administrators and workspace Designers

Status: Accepted

## Decision

Keep the protected `sys_users.is_admin` flag as the installation-wide Administrator role. Administrators implicitly access every workspace, administer memberships and configure definitions. Do not store a workspace-specific Administrator role or accept administrative flags from session/profile input.

Store explicit workspace memberships in `sys_workspace_members`, keyed by workspace and user, with role `user` or `designer`. Only an Administrator may assign, change or remove these memberships. Assignment uses an expected previous role to reject stale updates and journals each change atomically. Administrators appear in membership lists as implicit instance-wide administrators and need no membership row.

A User can view all settings and definitions of an assigned workspace, including field attributes, input aids and memberships. A Designer can additionally edit workspace settings, object/field definitions and input aids in that workspace. Personal language and appearance remain independently editable. The membership-management exception is explicit: only Administrators change roles, including in a workspace whose configuration a Designer can edit.

The common API/MCP application layer resolves the current administrator flag and membership inside the model transaction on every call. Workspace IDs are resolved from object or field IDs when needed; a supplied or guessed foreign definition ID does not bypass membership checks. Reusing the same session after role revocation cannot retain the former permissions. The UI uses derived effective roles to show editable or read-only forms, while the server remains authoritative.

## Content boundary

Workspace membership and Designer status do not grant business-content permissions. Object/field/record rights, user-sensitive records and group grants are implemented under ADR 0026. Content queries use those grants; workspace metadata/configuration remains available under the separate roles.

The current empty installation creates no accounts or memberships under [ADR 0028](0028-current-installation-baseline.md). Normal provisioning and application operations create them explicitly; account creation does not automatically assign workspace membership. Unreleased development instances use the current model without an older-role adoption path.

## Validation

Disposable PostgreSQL integration tests cover role assignment, read-only User access, workspace-scoped Designer writes, foreign object/field rejection, absence of implied content access, immediate revocation with an existing session, stale assignment rejection, administrator bypass and journal-failure rollback through API/MCP. UI checks separately verify the editable and read-only presentations.
