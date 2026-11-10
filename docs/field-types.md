# Field types

Choose a field kind according to the value you need to store. These are the custom kinds available through **Object types → Add field** and relationship-owned fields. Field permissions and requiredness apply independently of kind. [Object and field design](model-design.md) explains configuration and lifecycle.

## Choose a value type

| Field kind | Use it for | Important behavior |
| --- | --- | --- |
| Text | Serial numbers, short labels | Text rather than an integer when leading zeroes or letters matter |
| Multiline text | Descriptions, notes | Optional Markdown and preview; plain text remains available |
| Integer | Whole quantities | Exact whole-number validation |
| Decimal | Measurements, effort | Configured decimal scale; exact decimal values |
| Money | Prices or amounts | Amount plus currency; no automatic exchange-rate conversion |
| Yes/No | A boolean fact, edited as a checkbox | False is a real value, not an absent entry |
| Date | Purchase day or target date | Calendar date without a time zone |
| Date/time | A fixed event instant | Offset-bearing timestamp, displayed using effective region/zone |
| Email | One email address | Validated address, not a distribution list |
| Telephone | One telephone number | Validated/normalized telephone value |
| URL | One web address | HTTP(S) link action opens a new tab; no automatic fetch |
| Single choice | One configured value | Stable option identity with translated label |
| Multiple choice | Several configured values | Searchable checkbox picker; Apply then record Save |
| Selection tree | Hierarchical choices | Selecting a child includes its ancestors |
| User/group reference | Coordinating responsibility or other identity reference | User, group or both; single/multiple configuration; no implicit access or assignment |
| Structured data | Contact collections, partial dates, domain times | Select one installed schema with defined components and validation |

Markdown is a Multiline text setting, not a separate kind. Keyword, Number, Access principals and Type/Status/Category are standard fields with additional system/domain rules; installing an ordinary field with a similar label cannot reproduce them.

## Structured schemas

The schema selector offers these finite shapes; it does not accept arbitrary JSON or executable schemas:

| Schema | Stored meaning |
| --- | --- |
| Name components | Ordered parts of one name component |
| Email addresses / Telephone numbers / Websites | Ordered channel entries with configurable contexts and order-derived preference |
| Postal addresses | Ordered component-based addresses |
| Languages | Communication-language tags, separate from installed UI languages |
| Messenger addresses | Validated messaging URIs and descriptive contexts |
| Time zone | A named IANA zone or UTC |
| Partial date | Month/day with an optional known year |
| Temporal value | Date, fixed instant or named-zone local time with explicit daylight-saving ambiguity handling |

The supplied [Contact form](contacts.md) composes these schemas into its fixed core. Task Start/Due use [temporal values](projects-and-tasks.md#set-dates-and-progress). Recurrence and calendar-party schemas described in the architecture are planned, not additional editable V1 kinds.

Structured collections allow at most 100 entries; name parts allow at most 20 components. A structured field has a 256 KiB canonical value limit and component-specific string limits. A structured field is one field-permission unit, not a set of independently permissioned subfields.

## Choices and trees

Choices have stable identities. Rename or reorder them without recreating them. Deactivated choices remain readable in retained records but cannot be newly selected. A tree has at most 300 dictionary options and 20 ancestor levels. Its selected-value limit is 100, including automatically selected ancestors.

Selecting a parent alone does not select every child. Changing the hierarchy preflights retained contents, adds missing ancestors and journals any resulting value changes atomically. Converting a tree to single choice is rejected if it would discard selections. The [picker guide](user-guide.md#multiple-choices-and-selection-trees) covers record editing.

## Defaults, uniqueness and conversion

Defaults apply to omitted fields at creation, not updates or explicit empty inputs. Use the same typed control as for ordinary values. Type/Status/Category have their own default configuration.

Unique-value rules are available for supported scalar kinds, not multiple choices, references or structured collections. Empty optional values do not become a shared invented value; zero/false remain real values. Recycled records still participate in uniqueness checks. The [precise comparison rules](adr/0030-field-input-rules-and-record-numbers.md) define normalization per kind.

Type conversion is a model change, not a display-format switch. It is checked against active and recycled contents and field configuration before committing. Clear the default and disable uniqueness before requesting a conversion in the UI. An incompatible structured schema change is rejected. Existing values and history are retained rather than truncated to make a conversion succeed.

## Regional entry and external formats

Enter numbers, dates and times using the effective [regional settings](workspace-settings.md#language-region-and-time). Money uses its stored currency and configured precision. Changing display preferences never changes the stored amount, date-only meaning or a domain time zone.

API/MCP clients use the discovered schemas: exact decimal strings, ISO date/offset timestamp representations, stable option identities and the declared structured shape. Localized display text is not the wire format. [API access](api.md) explains discovery and versioned writes; [ADR 0007](adr/0007-custom-field-types.md) is the technical field reference.
