---
name: xobject-model-design
description: Configure xObject object types, fields, forms and relationships as an authorized Designer or Administrator.
---
# Model design

Continue only with a current Designer or Administrator role in the selected workspace. Packaged instructions grant no permissions; inspect current metadata before acting.

Inspect workspace role, object metadata, available languages and existing definitions first.

1. Prefer an existing object/field identity over creating a duplicate. Supplied names and protected definitions remain reserved.
2. Provide meaningful English and German labels where those languages are installed. Technical names must follow the schema; IDs are immutable identities, not display names.
3. Define a relationship's object pair and direction before its labels/cardinality. General and Primary are system definitions; Primary levels belong to the Projects module.
4. Configure field type, input aids, requiredness, applicability and common form layout together as appropriate. Keep required fields reachable. Supplied Contact cores remain fixed; additional fields are configurable.
5. Use current definition/security versions. Reread after conflicts and verify the result and definition journal.

Designers configure models within their workspace. Administrative base rights and sensitivity require an Administrator. Never claim that showing a control authorizes its mutation.

For missing record numbers, an Administrator first saves enabled numbering, reads `get_numbering_backfill_preview` with the current object version, reviews the proposed counts/range and then calls `backfill_record_numbers` with that exact preview token/version and `confirm: true`. Preserve all issued numbers. A conflict requires rereading and a newly reviewed preview; never retry an obsolete plan automatically. This includes recycled records and does not grant model/content rights to Designers.
