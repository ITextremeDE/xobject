# Contacts and distribution lists

Use Contacts & Relations to maintain organizations and people, connect separate records for the same person, and build explicit distribution lists. You need content access to the objects; creating records additionally requires Create permission. Enable the module first if it is not available in your workspace.

## Choose the contact kind before creation

Open **Contacts → Create record** and choose one kind:

| Kind | Use it for | Readable name |
| --- | --- | --- |
| Organization | A company, association or other organization | Company name |
| Contact person | A person in the context of one organization | Derived personal/organization name |
| Individual contact | A person or sole business maintained independently | Company name when filled, otherwise Last name, First name |

Contact kind is separate from configurable **Type**. An organization might have Type Supplier; that does not make Supplier another contact kind. Normal editing cannot change the kind. Guided conversions are [planned for V2](../ROADMAP.md#planned--version-2).

The form shows the applicable fixed core. Keyword is derived, so there is no separate editable Keyword input. Additional fields and custom relationships can be arranged in the [Form designer](forms.md#supplied-contact-forms).

## Create an organization and its contact person

1. Create an Organization called **Example Studio** and save it.
2. Create a Contact person called **Alex Morgan**.
3. In its Organization relationship, choose the saved Example Studio record. Save the Contact person.
4. Open the Organization's linked records to inspect its Contact persons, subject to your rights.

A Contact person can have **at most one Organization**. Changing this relationship does not delete either record. Job title, Department and Function belong to the Contact person itself and remain unchanged when the Organization changes. Check them after a move. Individual contacts also expose these professional fields; Organizations show their applicable company fields instead.

## Maintain names and personal details

Salutation is correspondence metadata. Academic title, First name, Further names, Last name and Name suffix describe the person's name. Salutation does not contribute to the derived formatted name. Choose configured suggestions where offered; a Designer can configure supported input aids without changing the protected Contact structure.

Birthday, Wedding anniversary and Date of death accept a known month/day without inventing a year. Clear the year explicitly when it is unknown. A Contact's time zone and communication languages describe that Contact; they do not change your own interface language or display zone. Photo/Logo is a preparation placeholder; uploading is not available in V1.

## Telephone, email, messenger and postal details

Add separate entries for different telephone numbers, email addresses, websites, messenger URIs and postal addresses. Telephone and messenger entries offer Usage and Type. The ordinary form selects at most one value in each dimension, for example Work + Mobile. These labels describe an entry; they do not send messages or alter a URI.

Use the move controls to put the preferred entry first. Order determines preference, starting at 1; deleting or moving an entry updates that order. Collections support up to 100 entries each. The website arrow opens a valid HTTP(S) address in a new tab while preserving your draft.

Messenger addresses use a URI such as `xmpp:alex@example.test`. Here `xmpp:` identifies the messaging protocol; a Type label is descriptive and does not add the prefix automatically. Enter the URI required by the service, not a password or credential.

For postal addresses, enter the available components, including Region before Country. Search the Country picker by its localized name. The preview uses entered components; you do not need to type a second formatted address. It is a readable preview, not a guarantee of a postal carrier's country-specific layout.

Save the whole Contact after editing. Entry additions, reordering and corrections remain a local draft until then. Validation identifies the affected input; the Journal records changes per field, including structured-entry context.

## Link identities without merging records

Use **Identities** when an Individual contact and/or Contact person records represent the same human in different contexts. For example, link Alex's independent contact to Alex at Example Studio.

Choose **Link with…**, select Contacts and the Identities relationship, then choose the permitted existing record. Organizations are not eligible. Identities is symmetric and direct: linking Alex A to Alex B and Alex B to Alex C does not automatically create every other link. Names, professional details and rights remain separate. This is not account linking or duplicate merging.

## Build a distribution list

1. Open **Distribution lists**, create a record and give it a Keyword such as **Workshop attendees**.
2. Add an optional short Description and save.
3. Use the Members relationship to link permitted existing Contacts. You can also use **Link with…** and the appropriate relationship label.
4. Inspect Members or the Dossier to verify the actual linked records.

Membership is explicit; no organization, category or group automatically adds all its contacts. Removing a membership keeps the Contact. A distribution list is a business record, not a login group and not a permission grant. V1 stores the list; it does not send mail or invitations.

Use Notes for working observations and the Journal for recorded changes. [Record actions and recovery](user-guide.md) apply to Contacts and Distribution lists as to other records. Standards-oriented storage is a foundation for later exchange; vCard import/export and CardDAV synchronization are not available in V1.
