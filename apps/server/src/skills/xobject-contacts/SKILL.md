---
name: xobject-contacts
description: Create and maintain Contacts and Distribution lists with their supplied contact-kind rules.
---
# Contacts and relations

Continue only when Contacts & Relations is active and the relevant object is readable in the current workspace. Packaged instructions grant no permissions; inspect current metadata before acting.

Start with the foundation workflow and inspect the Contact profile in `get_object_type`.

- Choose Organization, Individual contact or Contact person before creating a Contact. Normal editing cannot change its kind.
- A Contact person belongs to at most one Organization. Use the supplied relationship identity and current candidates; do not store a company link in an invented field.
- Individual contacts can represent a person or sole business. Their keyword uses company name when present, otherwise family and given names. Contact keywords are derived.
- Names, phones, emails, messenger addresses and postal addresses use the structured field schemas. Read field input aids, preserve order and IDs, and validate usage/type selections. Priority follows the stored order.
- Form of address is separate from Salutation, Gender and Pronouns. Letter salutation stores an optional individual override; null restores the suggestion. Record responses expose suggestedLetterSalutation and effectiveLetterSalutation under current source/target field rights. Use the profile bindings and discovered option IDs, and never infer pronouns or formality.
- Pronouns use language-tagged free-text entries with their own UUIDs. They never choose the Letter salutation. Work/Home/Other usage is separate from telephone or messenger Type.
- Parents/Children, Partners/Siblings and additional Organization affiliations are workspace-local relationships. Inspect endpoint kinds and candidates; retain the Contact person main-Organization rule.
- Identities links records of the same person; it does not merge them or change their access rights. It applies to Individual contacts and Contact persons.
- Distribution membership is explicit. Inspect its current relationship definition and read permissions before adding members.

Discover active module contributions and current fields rather than assuming fixed technical names. Exchange/synchronization is not performed by these workflows.

## Organization inheritance and kind conversions

Discover the profile field UUIDs. Contact persons expose `contactInheritance` alongside their permitted effective values. Update an own exception through `update_record.contactInheritance` with fieldId, mode=own and an explicit value (null means own empty). Use mode=inherit plus confirmReset=true after confirming the own value may be discarded. Never assign a derived field through values. Source rights still apply to inherited values; an own Organization name does not change the relationship or Keyword suffix.

Use `get_contact_conversion_preview` before changing Contact kind. Actions are new_organization, existing_organization, individual and dissolve_organization. Supply required target values using technical names; the preview explains incompatible fields/links. Show the mappings to the user, then call `convert_contact` with the same input, previewToken and confirm=true. Refresh stale previews. Full and relevant field rights apply to every affected Contact; a new Organization additionally needs Create. Preserve identities, numbers, security and compatible relationships; never approximate a blocked specialist mapping or modify Contact kind through normal update_record.

A newly formed Organization uses its own `organizationValues` for applicable required fields and `organizationClassification` for Type/Status/Category. Configured defaults apply; source classification and personal communication are not silently copied. Resolve the preview issues before confirmation.
