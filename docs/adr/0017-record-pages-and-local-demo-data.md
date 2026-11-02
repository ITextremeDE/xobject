# ADR 0017: Record pages and local demo data

- Status: Accepted for the local prototype
- Date: 2026-11-02

## Decision

Use a dedicated page for record creation and editing at the existing record URLs. Keep the application sidebar and Breadcrumb visible and reuse one form for both flows. Group Keyword/classification, business fields and technical metadata; use responsive columns and full-width multiline controls. General form order follows definition creation order; administrative field lists remain alphabetical. No schema rebuild is needed for display order.

Place Back to overview and Save/Create actions above the form. Editing supports Reset; creation supports returning/cancelling without writes. Existing version/validation/pending guards and Command/Ctrl+Enter remain authoritative. New-record Save replaces `new` with its UUID. Return to the originating same-workspace list or Dashboard with URL filters/pages and focus preserved; direct links fall back to the object's list. Details and Journal tabs share the page; switching tabs must retain unsaved form state. Show Created at/by and Updated at/by above the journal entries. Keep only identity, object technical name and version in Technical details. Use the common journal card and formatted record values. Akte/relationship tabs remain absent until the relationship feature exists. A future quick-edit Sheet may reuse the form; it is not part of this change.

Supply an explicit fictional local fixture through the existing application layer. Use separate Contacts, Projects, Cases, Tasks and Vehicles with meaningful data, precise typed fields and a private UUID-based plan for later relationships. Do not manufacture relationship fields or claim domain modules are implemented. See [Local demo data](../demo-data.md).

An authorized development reset first backs up/restores the old database for verification, builds the replacement separately and retains both the original database and a private dump for recovery. Preserve the existing Administrator's authentication identity/password rather than silently changing credentials. This operator maintenance action does not run on HTTP startup, normal migration or production installation.

## Consequences

Records have room for later dossier/tree views without duplicating forms. Form drafts remain local and unsaved across tab switches. Existing API/MCP content permissions are unchanged. The demo seed refuses to overwrite workspaces; tests use isolated PostgreSQL and cover data, column order, history, duplicate-seed refusal and unique planned primary parents.
