# Configure a workspace

Open Settings from either user menu. Personal settings affect your account or local browser; Workspace settings affect the selected workspace; Instance settings are installation administration. Administrators and workspace Designers configure the workspace model and appearance. Only Administrators manage accounts, memberships and base content security.

## General and workspace identity

In **Workspace → General**, change the readable name. The code is fixed after creation and forms part of the technical table names; it is not an access-control mechanism. Creator and creation time are shown when recorded by the original event, rather than inferred from a later edit.

To create a workspace, use the empty welcome page or **Create workspace** in the workspace selector as an Administrator. A new installation starts without workspaces. [First steps](first-steps.md) walks through creation and initial records.

## Modules and shared objects

In **Workspace → Modules**, enable Contacts & Relations and/or Projects & Tasks. Activation saves immediately and supplies protected definitions with editable supported configuration. Both modules can use the same Contacts records; there is no duplicate data table or module-specific record form.

Projects & Tasks enables Primary association and its tree throughout the workspace. The chain is always Contact → Project → Case. It is absent without the active module. Removing it requires clearing Primary requiredness and removing Primary links; activation/deactivation checks dependencies rather than dropping business data. Shared contributions are retained appropriately when another module still needs the object.

The catalog also shows planned modules. Documents & Communication is planned for V2, not an additional available V1 activation. A catalog entry is not proof that its domain features are delivered. Follow the [roadmap](../ROADMAP.md) for version scope.

## Language, region and time

In **Workspace → Language & region**, choose available interface languages and definition-label languages independently. V1 installs English and German. Choose an available default; at least one language must remain available. Definition translations are labels, descriptions and hints. Business contents remain the language their author entered; switching the UI does not translate a record's Notes.

Set the workspace time zone and regional defaults for number/date/time display and calendar first weekday. Users can inherit or override supported properties in **Personal → Language & region**. Removing an available language retains translations and preferences for history; it does not delete or machine-translate contents.

Date-only values stay dates. Instants display in the effective viewer zone. Contact time zones and zoned Task values are domain information, separate from display preferences. A different display zone never changes the stored amount, date or business zone. Yearly/monthly record numbers use the workspace zone, not each viewer's override.

## Shared appearance and personal theme

Use **Workspace → Appearance** to choose the supplied palette/font settings and review their preview before saving. Base Color controls neutral surfaces; Theme and Primary/Secondary choices configure accent roles. Light and dark Primary/Secondary overrides are independent. Chart colors, heading/body fonts and menu/accent settings use the supplied catalogs rather than arbitrary CSS or font uploads.

Choose a workspace icon from 48 Lucide symbols in six translated groups, including Skull. The same icon appears in the workspace switcher and design preview. Own-logo upload is a disabled preparation placeholder; the same is true of Contact photo/logo uploading. The shared style/component preset is not a workspace-editable template system.

**Personal → Appearance** and the header theme menu choose Light, Dark or System for that browser. They do not replace shared workspace design. Switching workspaces applies the destination's tokens and fonts. Preview changes remain a draft until Save; Reset returns to the saved values.

## Arrange navigation

Open **Customize navigation** from a user menu, also discoverable through search. An Administrator/Designer can edit shared workspace defaults; a workspace member can edit their own arrangement. Choose the intended scope before saving.

Move sibling sections, object entries and Contact-kind children using drag handles or keyboard-accessible move buttons. Shared Contacts may appear in both module sections while opening the same records. Hide optional entries or the whole Resources block; Resources starts enabled. Fixed Dashboard, Recycle bin and utility controls remain outside the configurable content layout.

A personal arrangement overrides the shared arrangement. Resetting to inheritance follows its parent configuration again; later shared changes do not overwrite an explicit personal layout. Newly available destinations appear automatically; unavailable destinations retain configuration identities without becoming active links. Hiding navigation does not revoke permissions.

## Continue configuration

- [Objects and fields](model-design.md): definitions, input aids, classification, numbering and lifecycle.
- [Relationship types](relationships.md): pairs, direction, labels, cardinalities and link attributes.
- [Form designer](forms.md): common layouts and Contact extension boundaries.
- [Users and access](access-administration.md): accounts, groups, content rights, ownership and foreign access.

Workspace/definition changes appear in the relevant journals. Installation Administrators can inspect the global **Instance → Journal**; record journals show the individual record's permitted content/relationship/security history. [Account and security](user-guide.md#personal-and-workspace-settings) links to personal tokens, sessions and authorized applications.
