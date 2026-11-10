# Set up users and content access

Use this guide to give a team the intended access without confusing workspace roles, assignment and ownership. It describes V1; calendar availability/time-only operations and notification delivery are later work. The [permission specification](PRD.md#4-permissions) owns exact precedence and the complete acceptance cases.

## Know which setting does what

| Setting | What it controls | Who changes it |
| --- | --- | --- |
| Installation Administrator | Accounts, base security and all contents across workspaces | Administrator |
| Workspace User / Designer | Read-only configuration / permission to configure models and forms | Administrator |
| Object permission and Create | Allowed content capabilities and separate record creation | Administrator |
| Field exceptions | None, Read or Edit within the object/record limit | Administrator; record exceptions require record Full |
| Group membership level | Maximum inherited ownership/foreign level along that membership path | Administrator |
| Access principals | Record owners; also participants/assignees on activities | Effective Full, within administrative limits |
| Foreign access | Permission to use another owner's records without becoming an owner/assignee | Administrator, or explicitly delegated own-record management |

A Designer may create empty groups and rename groups, but does not gain membership/security administration. Full access to a record does not grant model or account administration. Agents use their authenticated user's same live rights.

## Add accounts and workspace members

As an Administrator, open **Settings → Instance → User management → Create user**. Enter name, email and a start password. Share it securely; the ordinary user must change it on first sign-in. User management also controls account activation and installation-wide Administrator status. Assign Administrator only when installation-wide content access is intended.

In **Workspace → Members & roles**, add the user and choose User or Designer. Membership and role changes save immediately. This does not yet grant business contents. Removing membership also removes the workspace's group memberships and direct object/field grants; adding the user again does not restore those assignments. Account and history remain.

## Give a group object access

The following fictional example uses a test workspace, ordinary Users **Jane Doe** and **John Doe**, and the supplied Tasks object.

1. Add both users to the workspace. In **User groups**, create **Service team**.
2. Open the group, add Jane and John in **Group members**, and give each Full membership rights. Save the complete group draft.
3. In the group's **Content permissions**, select Tasks. Set Object permission to Full access and allow Create. Save.
4. Leave the users' corresponding object/Create settings at Inherit unless you intend a direct restriction.

Both users may now create Tasks. Each new Task initially belongs to its creator. Because Tasks are sensitive, membership in Service team alone does **not** let John read a Task assigned only to Jane.

Create is separate: Edit or Full on existing records does not itself permit creating or duplicating. Active group grants combine; an explicit user setting replaces the corresponding group result, including an explicit No access/denied Create. Inherit is not the same as deny.

Group members can also be nested groups. Each path is bounded by its weakest membership; cycles are rejected. Deactivated users/groups and removed memberships stop contributing rights. A retained group reference does not silently become public.

## Ownership and foreign access

Suppose Jane creates **Review service agreement**, assigned only to Jane. To let John help without assigning him that Task:

1. As Administrator, select Service team under **User groups → Content permissions** and open **Foreign access**.
2. Configure Service team as requester and Jane as owner, with Edit for Tasks. To limit the rule to Tasks, use an explicit Tasks override and leave its general/default level at No access.
3. Save. John inherits the requester group's grant, subject to his object/field limits and the record's policy.

John can edit Jane's permitted Task fields. Jane remains its participant; John receives no assignment or notification. The inverse owner-oriented view edits the same rule, not another grant.

If the team should instead **perform** the activity, put Service team in the Task's Access principals with an appropriate ownership level and save. A group entry follows current membership; **Expand group** replaces it with the currently eligible individual entries. Later group membership changes then no longer update those individual assignments. Review whether the original creator should remain; creation history provides no permanent access after ownership is removed.

Foreign access can inherit on requester and owner sides, including nested groups and permitted multi-hop paths. For example, a rule targeting Service team may cover Jane-owned records through her membership. Every path is capped by its weakest grant/membership and the record's foreign maximum. The winning path explanation helps diagnose the result. Direct ownership takes precedence over group ownership, and ownership takes precedence over foreign access even when lower.

An explicitly configured Service team → Service team foreign rule can allow members to use coworkers' individually owned records; membership by itself cannot. If an Administrator delegates own-record foreign management, that user finds **Foreign access on my records** under **Members & roles**. They may manage only incoming rules on their own records, within their object ceiling, and cannot change the administrative inheritance/delegation flags.

## Understand content levels

| UI level | Additional capability |
| --- | --- |
| Read | Open permitted records and fields |
| Read and duplicate | Prepare a duplicate, with separate Create and validation |
| Change times | Includes Read/duplicate; its additional time-only editing is reserved for later calendar support |
| Edit | Change permitted contents |
| Delete | Also move records to the recycle bin |
| Full access | Also manage record security, restore and confirm permanent deletion |

Calendar availability is a reserved foreign-access capability and exposes no V1 records or busy intervals. These levels do not bypass object/field ceilings, required input, protected definitions or lifecycle checks. The installation Administrator exception remains broader than record Full.

## Restrict fields and record visibility

In a selected user's/group's **Content permissions**, use **Field exceptions** to set a field to No access, Read or Edit. For example, give John Read for Task Notes while keeping other permitted fields editable. The effective summary identifies inherited/direct sources. A field allowance never opens an otherwise inaccessible record. Relationship attributes require field access at both endpoints.

On a sensitive record, use the Access principals detail area to inspect ownership, privacy, maximum foreign access and permitted record-field exceptions. Applying the dialog only changes the record draft; **Save the record** commits contents, links and policy together.

- **Normal** permits configured foreign access.
- **Personal** blocks foreign access, retaining ownership and the Administrator exception.
- **Confidential** requires Confidential capability along the complete foreign path.
- **All (workspace)** is explicit public access for authenticated workspace users within their object/field ceilings. It is not anonymous Internet access and does not assign work to everyone.

Clearing the last principal requires Full/delegation checks and an explicit visibility decision. A nonempty list of inactive principals does not become public. Disabling object sensitivity also widens access and requires Administrator confirmation. Projects, Cases and Tasks are always sensitive; that switch cannot be disabled for them.

## Verify the result and investigate denials

Use an ordinary user's own session to check a readable record, an editable field and an intentionally denied action. An Administrator's unrestricted view cannot validate an ordinary user's rights.

If access differs from your intention, check in this order: active account and workspace membership; explicit user overrides and active group object/Create grants; field exceptions; direct/group ownership; foreign paths and membership grades; record privacy/maximum and field exceptions; lifecycle state. A hidden navigation entry is not a denial rule, and a link or Responsible reference is not a grant.

The Journal records security changes without secrets. Previously visible history is still filtered by current rights. Permanent deletion keeps full history for installation Administrators; other eligible readers receive only a content-free deletion notice. [Record recovery](user-guide.md#recycle-and-restore) explains the operational consequences.
