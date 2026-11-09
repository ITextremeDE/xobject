# Public documentation source

The independent **Astro + Starlight** application in `apps/docs` builds the selected `https://docs.xobject.org` site. It uses the standard Starlight shell, navigation, theme control and Pagefind search, with an ITextreme brand stylesheet. Self-hosted Inter, Orbitron for the page title/brand, and JetBrains Mono for code match the product website. Semantic Starlight roles map light/dark backgrounds, navigation/sidebar surfaces, text, borders, actions and focus to the shared Corporate Design palette. Standard layouts, callout meaning, navigation, theme persistence and Pagefind interactions remain intact. A header link returns to the product website. Reference content remains English. The favicon uses the same unchanged official ITextreme asset as the product website; font copyright/license notices ship under `/licenses/`. A narrow Search wrapper composes the standard component and includes its visible key hint in the accessible button name, correcting the pinned Starlight 0.42.9 WCAG 2.5.3 mismatch without changing the layout. This source/local build does not publish the site or change DNS/Caddy on any host.

## Canonical content

Repository Markdown remains authoritative. `scripts/prepare-content.mjs` generates ignored Starlight content from root README/CHANGELOG/ROADMAP/CONTRIBUTING/SECURITY/LICENSE and `docs/**/*.md`. It derives titles, links edits to the original source, rewrites document links to rendered routes and links code references to GitHub. It refuses private local/outside-repository paths. Generated pages are build artifacts; edit the canonical source instead.

The documentation build renders the root Changelog and Roadmap at `/changelog/` and `/roadmap/` on the documentation origin. The [product website](website.md#content-and-languages) generates those same canonical sources at the selected public entry points `https://xobject.org/changelog/` and `https://xobject.org/roadmap/`. User guidance, self-hosting, API/MCP, product references and ADRs remain available through the sidebar/search. Technical acceptance history stays in its canonical development guide.

## Build and check

From `apps/docs`:

```sh
npm ci
npm run check
npm run build
npm test
npm run preview
```

The build checks every generated HTML link/asset and anchor, rejects incomplete output and creates the Pagefind search index. The content test verifies canonical-source hashes. The independent package uses the TypeScript version supported by Astro's checker; this does not change the application compiler.

To prepare a versioned snapshot from its matching reviewed source:

```sh
XOBJECT_DOCS_VERSION=0.0.0-unreleased npm run build
```

The example exercises an unreleased snapshot. Actual released versions use `/versions/<version>/`, with internal links kept in that base. [Documentation versions](versions.md) defines the publication boundary. Build/retain archives before deployment; publication requires separate authorization and live verification.
