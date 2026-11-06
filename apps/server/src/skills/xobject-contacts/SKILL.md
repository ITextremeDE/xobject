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
- Identities links records of the same person; it does not merge them or change their access rights. It applies to Individual contacts and Contact persons.
- Distribution membership is explicit. Inspect its current relationship definition and read permissions before adding members.

Discover active module contributions and current fields rather than assuming fixed technical names. Exchange/synchronization is not performed by these workflows.
