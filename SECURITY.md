# Security policy

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/ITextremeDE/xobject/security/advisories/new) when available. Otherwise contact the maintainer at **hi@itextreme.de**, also published in the [ITextreme legal notice](https://itextreme.de/impressum). Include the affected revision, prerequisites, a minimal reproduction with fictional data and the expected security boundary.

Keep credentials, personal/business contents, database dumps and private logs out of public issues. Arrange a suitable private exchange before sending sensitive evidence. Reports are handled on a best-effort basis; no response-time or support SLA is offered.

## Supported versions

The latest stable 1.x release receives security corrections on a best-effort basis. Install the current stable release; older patch versions and unreleased development schemas are not maintained in parallel. Released updates include their supported-source upgrade and recovery guidance.

## Boundaries to preserve

- An active authenticated account, current workspace/object/record/field rights and administrative ceilings are required on web/API/MCP paths.
- User-bound tokens and OAuth consent never grant rights the user lacks. Secrets stay out of journals and logs; expiry/revocation and session/account state are checked on current operations.
- Definitions and record writes preserve optimistic versions, scoped relationships, validation and atomic history.
- Self-hosted operators control their database, secrets, proxy, backups and updates. Use the [operator guide](docs/self-hosting.md) and trusted, verified recovery artifacts.

Do not test against another person's installation or disclose a vulnerability publicly before coordinating with the maintainer.
