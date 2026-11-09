# Contributing

xObject is maintained by Jürgen Schadek under the ITextreme project brand. Version 1 is entirely Community and licensed under [AGPL-3.0-only](LICENSE).

## Reports and proposals

Use the [public issue forms](https://github.com/ITextremeDE/xobject/issues/new/choose) for reproducible bugs and feature proposals. Maintainers triage feedback and decide delivery scope; an issue or proposal does not imply a delivery commitment. The [roadmap](ROADMAP.md) summarizes planned direction. English is preferred; German reports are welcome.

Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through the [security policy](SECURITY.md).

## Dependency maintenance

Dependabot checks the application workspaces, website, documentation, GitHub Actions and container base image weekly. Minor and patch npm version updates are grouped per project; major updates receive separate review. Security updates are enabled separately and can open pull requests outside the weekly schedule. Maintainers review and validate dependency pull requests before merging; updates are not automatically merged.

## Contribution rights

Submit original work that you have the right to contribute under the project's existing license. Contributions use the same AGPL-3.0-only terms; authors retain their copyright. Preserve third-party notices and identify imported code/assets and their compatible licenses. No copyright assignment or separate contributor license agreement is required.

Sign commits with the [Developer Certificate of Origin 1.1](https://developercertificate.org/) using `git commit -s`. The sign-off certifies your right to submit the contribution and becomes part of the public record. Use your own appropriate Git identity. Do not submit another person's sign-off, private contents, credentials or generated test/recovery artifacts.

## Make a focused change

1. Read [AGENTS.md](AGENTS.md), [the documentation index](docs/README.md) and the relevant requirement/ADR before changing behavior.
2. Keep a clear problem and resulting behavior. Preserve shared web/API/MCP validation, current-user permissions, optimistic versions and atomic journals.
3. Before the first release, update the one current installation and recreate disposable test data when necessary. Released upgrades belong in maintenance tooling, with a complete target model and recovery evidence.
4. Use English Conventional Commit messages, update the canonical requirement/ADR/guide where needed and add a concise user-visible changelog entry. Do not duplicate operational planning in new lists.
5. Run affected tests, root type checking and builds as appropriate. `npm test` starts isolated PostgreSQL containers; never point tests at user databases. Contract changes require `npm run api:generate` and `npm run api:check`.
6. For container/operator changes, build `xobject:local-acceptance` and run `node scripts/test-selfhost.mjs`. For UI changes, verify the actual flow and responsive/keyboard behavior using existing components.
7. Open a focused pull request describing the problem, resulting behavior, verification and material limits. A maintainer reviews it before merge.

See [development](docs/development.md) for local setup and [security reporting](SECURITY.md) for private disclosure. Publication, releases and deployment require the maintainer's separate authorization.
