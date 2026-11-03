# ADR 0017: Record pages and local demo data

- Status: Accepted for the local prototype
- Date: 2026-11-02

## Decision

Use a dedicated page for record creation and editing at the existing record URLs. Keep the application sidebar and Breadcrumb visible and reuse one form for both flows. Group Keyword/classification, business fields and technical metadata; use a centered, width-limited form with at most two responsive columns and full-width Keyword/multiline controls. Header, tabs, form, tables and action bar share the same width-limited page edges. Multiple Category choices wrap horizontally rather than leaving a large blank grid cell. General form order follows definition creation order; administrative field lists remain alphabetical. No schema rebuild is needed for display order.

Place Back to overview and the object-type badge on the same row, followed by the record title and short section explanation. Save/Create and Reset use one sticky bottom action bar on Details so long forms keep their actions reachable. The bar names up to three missing required fields (with a remaining count), otherwise indicating an unsaved or unchanged draft. Editing supports Reset; creation supports returning/cancelling without writes. Existing version/validation/pending guards and Command/Ctrl+Enter remain authoritative. New-record Save replaces `new` with its UUID. Return to the originating same-workspace list or Dashboard with URL filters/pages and focus preserved; direct links fall back to the object's list. Existing records offer Details, Tree, Dossier and Journal tabs; new records offer Details with an explanation that the other views become available after creation. All tabs share the page; switching tabs must retain unsaved form state. Show Created at/by and Updated at/by above the journal entries. Keep only identity, object technical name and version in Technical details. Use the shared Journal data table and formatted record values under ADR 0023. Formatted multiline previews and inactive field values are separate standard Collapsible sections, closed initially. Technical details use the same disclosure composition. New-record help explains required-field markers, empty custom choices say No selection and the record Journal labels its change-kind filter Changes. A future quick-edit Sheet may reuse the form; it is not part of this change.

Supply an explicit fictional local fixture through the existing application layer. Use separate Contacts, Projects, Cases, Tasks and Vehicles with meaningful data, precise typed fields and a private UUID-based plan for later relationships. Do not manufacture relationship fields or claim domain modules are implemented. See [Local demo data](../demo-data.md).

An authorized development reset first backs up/restores the old database for verification, builds the replacement separately and retains both the original database and a private dump for recovery. Preserve the existing Administrator's authentication identity/password rather than silently changing credentials. This operator maintenance action does not run on HTTP startup, normal migration or production installation.

## Consequences

Records have room for later dossier/tree views without duplicating forms. Form drafts remain local and unsaved across tab switches. Existing API/MCP content permissions are unchanged. The demo seed refuses to overwrite workspaces; tests use isolated PostgreSQL and cover data, column order, history, duplicate-seed refusal and unique planned primary parents.
