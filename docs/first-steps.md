# First steps with xObject

Create your first workspace and connect a Contact, a Project and a Task. This walkthrough starts with an empty installation and uses fictional example data. Button and field names below use the English interface.

## 1. Sign in

An installation Administrator must first follow [Initialize and sign in](self-hosting.md#initialize-and-sign-in). Use that account for the initial workspace setup. Later, an Administrator can create ordinary accounts in Settings; new accounts must change their initial password when prompted.

A fresh installation contains no workspaces or demo records. Ordinary users need an Administrator to create a workspace and assign their membership and content permissions.

## 2. Create your first workspace

Select **Create workspace** on the empty welcome page. If another workspace already exists, open the workspace menu at the top of the sidebar and select **Create workspace** there.

Enter a name such as **Example team**, a lowercase code such as `team`, the default language and the time zone. Save the workspace. Its code is fixed after creation and forms part of its technical table names; choose it deliberately.

The new workspace is selected in the sidebar. Keep using the Administrator account for this walkthrough. Workspace Designers can later configure permitted models/forms; only Administrators manage accounts and base security policy.

## 3. Enable the supplied modules

Open the user menu, choose **Settings**, then open **Modules** in the workspace settings. Enable **Contacts & Relations** and **Projects & Tasks** for this workspace. Module activation saves immediately.

Contacts & Relations supplies Contacts and Distribution lists. Projects & Tasks supplies Projects, Cases and Tasks and reuses the same Contacts; enabling both does not duplicate contacts. It also enables the fixed Contact → Project → Case Primary association and the associated tree. Close Settings to return to the workspace.

Documents & Communication is planned, not an available V1 module. See the [roadmap](../ROADMAP.md) for version assignments.

## 4. Create an Organization

Open **Contacts** in the sidebar. Choose **Create record → Organization** and enter a fictional company name, for example **Example Studio**. Save the record.

The Contact's Keyword is derived from its permitted name fields, so you do not enter a separate Keyword. Contact kind is selected before creation and cannot be changed through ordinary editing. See [Contacts and distribution lists](user-guide.md#contacts-and-distribution-lists) for the other kinds and structured contact details.

## 5. Create and connect a Project

Open **Projects**, choose **Create record** and give it a Keyword such as **Website refresh**. In **Primary association**, select Example Studio as the Contact and save the Project.

The Project now has one direct parent Contact. Opening its Dossier lets you inspect the permitted linked records. On the Contact, the Projects tree shows the Project. Relationships provide context; they do not grant permission to read their other endpoint.

## 6. Add a Task to the Project

Open **Tasks**, choose **Create record** and enter **Draft the homepage** as its Keyword. In Primary association, select Example Studio, then Website refresh. Project candidates follow the selected Contact. A Case is optional unless the object definition requires it.

Inspect **Access principals** before saving. For activities, this is the participation/work-assignment list; it is separate from the coordinating Responsible reference. The creator is assigned on a new sensitive record. Select other permitted users/groups only when appropriate. Actual visibility and editing remain bounded by object/field permissions, privacy and foreign-access policy; see [Understand access](user-guide.md#understand-access).

Save. xObject stores the deepest direct Primary parent and derives its ancestors. Open the Project to inspect the Task in its tree or Dossier, and inspect the Task's Journal to see its recorded creation/changes.

## 7. Continue with your own work

- Use [lists, filters and normal record editing](user-guide.md) for daily work.
- Add users, workspace memberships and content rights before handing the workspace to a team. Membership alone does not grant business contents.
- As an Administrator or permitted Designer, follow [object design](model-design.md), [relationship configuration](relationships.md) and the [Form designer](forms.md) to extend your workspace.
- Use [Contacts](contacts.md) and [Projects, Cases and Tasks](projects-and-tasks.md) for the supplied domain workflows; [Users and access](access-administration.md) walks through the team setup.
- Connect an external tool through [API and MCP access](api.md).
- Set up regular [backups](self-hosting.md#back-up) and retain the matching release documentation before changing a real installation.

This guide describes the normal application flow. No sample account, preloaded workspace, import or demo seed is required.
