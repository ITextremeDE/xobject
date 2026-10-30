# ADR 0007: Typed custom fields and one field editor

Date: 2026-10-30
Status: Accepted

## Decision

Use one create/edit dialog for custom fields. Definitions contain a stable ID and technical name, translated labels, kind, required flag and kind-specific JSONB configuration. Shared Keyword/Type/Status/Category keep their protected kinds and existing rules.

Map short/multiline text, email, international phone and HTTP(S) URL to PostgreSQL text; integers to bigint; exact decimals to numeric(38, configured scale); Boolean to boolean; date to date; timestamp to timestamptz; single choice to uuid; multiple choice to uuid[]. Money uses JSONB `{amount, currency}` with an exact decimal string and ISO currency code. User/group references use JSONB objects `{kind, id}` or arrays of these objects. JSONB collections are validated by the application; they do not imply relational foreign keys. Groups belong to a workspace; referenced users must exist. Reference assignment grants no access rights or group membership.

Integer/decimal amounts cross API/MCP as strings to preserve precision. Missing values are null, false and zero are present values. Date-only values retain their ISO date. Timestamps support millisecond precision and require an explicit offset at the API boundary and are returned in UTC; the web form uses the browser timezone. Multiline formatting is optional Markdown, without raw HTML execution.

Choice options retain stable IDs and translated labels and may be deactivated. Existing inactive selections may remain; new assignments are rejected. Supported references can target users, groups or both, with single/multiple selection. Currency and decimal scale are explicit field settings.

Definition changes and schema/value conversion run under the existing model lock in one transaction, with preflight of all current values. Conversion must preserve values on a round trip; incompatible or lossy conversion fails atomically. Collection/reference/choice family changes are restricted to compatible mappings. Changed record representations increment record versions and get per-field journal entries under the same change ID as the definition change. Historic journals remain untouched.

## Consequences

Field rendering, requiredness, validation and display use shared kind definitions. Business-content access remains Administrator-only. ADR 0008 permits workspace Designers to configure fields and Users to inspect their definitions. Workspace groups support reference dictionaries, not a completed membership/permissions administration feature. Production migration and scalability remain separate work.
