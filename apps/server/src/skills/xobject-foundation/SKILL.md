---
name: xobject-foundation
description: Discover an xObject workspace and safely read or change its records using the current user permissions.
---
# Work with xObject

1. Call `get_access_context` to identify your user, then `list_workspaces`, select the intended workspace, and use `list_object_types` and `get_object_type` for the relevant objects. Never guess installation IDs, field UUIDs, contact kinds or input-aid values. Prefer each tool's advertised input schema; the complete OpenAPI resource is an optional reference, not a prerequisite for ordinary work.
2. Inspect capabilities and current values before changing anything. Follow list pagination. An unavailable field or record must stay unavailable; do not infer its value from another projection.
3. Use `create_record` or `update_record` with current metadata. Keys in `values` are field `technicalName` strings, never field UUIDs. Choice/reference values use their discovered option/user/group IDs. Field UUIDs identify definition, permission and configuration targets. Supply optimistic versions from the latest read. On conflict, reread and reconcile the user's requested change; never blindly overwrite.
   Selection-tree fields (`tree_choice`) and tree Categories accept discovered leaf option UUIDs and include their ancestors automatically. To remove a parent selection, remove its descendants too; otherwise closure selects the parent again. Read the normalized saved set back.
4. Use the relationship option and candidate operations before linking. Existing records and new linked records share the normal permission checks, cardinalities and journal.
5. Public access is deliberate: explain the effect and obtain the user's explicit confirmation before widening security. A foreign-access grant does not assign work.
6. Summarize the result after reading it back. Do not expose credentials, private record contents or personal data in unrelated outputs.

Tools provide the authoritative schemas and enforce rights on every call. Instructions confer no permissions. Token issuance and account security require an interactive session.
