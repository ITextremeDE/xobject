# ADR 0013: Workspace user groups

- Status: Accepted
- Date: 2026-10-30

## Context

The prototype could create a named workspace group and use its identity in reference fields, but had no group-management UI or direct memberships. Future content permissions depend on group identities; this slice must not grant content access prematurely.

## Later refinement

[ADR 0027](0027-ownership-and-foreign-access.md) adds graded user/nested-group memberships and explicit foreign-access paths. Direct user memberships described below remain supported; group membership alone never grants coworker access.

## Decision

Extend `sys_groups` with `active` and positive `version`. Store direct user memberships in `sys_group_members` with group/user foreign keys and unique pairs. Groups remain workspace-scoped; nested groups are outside this slice. Users may belong to multiple groups.

Administrators can create/rename groups, change memberships and deactivate/reactivate them. Designers can create empty groups and rename them, but cannot submit membership changes or activation operations. Regular users may inspect groups in their own workspace. Every operation resolves current server-side roles and checks the stored group's workspace. Eligible members are installation Administrators or currently assigned workspace users.

`create_group`, `configure_group`, `configure_group_inheritance`, `set_group_active` and `list_groups` share the common API/MCP application transaction. Updates require the expected group version. The group editor includes the graded membership table directly, with one Save/Reset for name and memberships. `configure_group` accepts optional graded `members`; only Administrators may supply them. The shared membership writer validates the complete graph and commits combined name/member edits with one version increment and change ID. Inactive groups retain read-only membership inspection. Names and each added/removed membership get individual journal entries under one change ID; related name/member changes are atomic. No-op changes retain the version. Existing per-workspace name uniqueness remains enforced.

Removing workspace membership removes that user's direct memberships in the same workspace, increments affected group versions and journals cleanup under the same change ID as the workspace removal. A failure preserves both workspace and group memberships.

Use reversible deactivation instead of hard deletion. Retain group identity, name, memberships, record references and journal values. Inactive groups are shown in management and retained reference values. New reference assignments and membership edits are rejected while inactive; existing reference values remain valid when editing other record fields or safely converting definitions. Reactivation preserves the same identity. Renaming remains a metadata operation even while inactive.

Successful create/save closes the editor and returns focus to its originating button; validation/conflict failures retain the draft. Activation controls remain explicit reversible actions. The shared settings editor supports name/member drafts, Save/Reset, pending and unsaved-close guards, read-only roles, and Administrator-only activation controls. It uses the standard shadcn table, fields, checkboxes and dialog actions. Removing workspace access refreshes group views as well.

This slice defines group identity/lifecycle and direct memberships. [ADR 0026](0026-content-permissions.md) subsequently adds explicit group content grants; [PRD section 4](../PRD.md#4-permissions) specifies graded/nested memberships and foreign inheritance as the next target, not current behavior. Membership and ordinary assignment alone are not content grants.

## Validation

Tests exercise current-role boundaries, workspace/user scoping, combined changes, API/MCP parity, expected versions, atomic journal failure, workspace-removal cleanup and rollback, inactive-reference retention/rejection and reactivation.

Chrome acceptance on 2026-10-30 used an isolated disposable database and synthetic users. Creating a group, saving its renamed label and two members, and deactivating/reactivating it succeeded; members remained selected throughout activation changes. Member editing was disabled while inactive. Closing the edit/create dialogs returned keyboard focus to the group button or create button respectively. Role boundaries are covered by application tests, not this Administrator browser session.
