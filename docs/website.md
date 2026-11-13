# Public product website

The independent Astro application in `apps/site` introduces xObject at
<https://xobject.org>. It presents released capabilities, actual application
screenshots and links to installation, documentation and source code. It has
no application login, business-data access, analytics or external font service.

## Content and languages

English and German product pages live at `/en/` and `/de/`. They explain connected
records, Contacts & Relations, Projects & Tasks, custom objects/forms, permissions,
journals, workspaces, API/MCP and Community self-hosting. The 1.2.0 content adds a
Contact-workflows section, inheritance/conversion screenshots and automatic refresh
with protected drafts. Later capabilities are identified as planned in the FAQ. The primary action opens the self-hosting guide;
GitHub is the secondary action. The workflow example is explanatory text, not a
live AI integration or a public application demo.

Only `/` negotiates language: a saved explicit selection wins, otherwise the
browser's first preferred language selects German or falls back to English.
Direct localized URLs are never redirected by that preference. The language
switch uses local flag images (United Kingdom for English, Germany for German),
with native-language accessible names/tooltips and the current-language state. It
preserves section anchors and uses normal links even without JavaScript.
With JavaScript disabled, `/` provides the complete English page. Language and
color-mode preferences are independent browser settings. Localized pages expose
canonical, `hreflang` and `x-default` metadata, Open Graph metadata and a share image.

The canonical English Changelog and Roadmap remain at `/changelog/` and `/roadmap/`. Resource links are ordered Documentation, Changelog, Roadmap, Requirements, Source code in both languages. Legal footer links place Privacy before Legal notice. Current documentation links to the website pages; released documentation snapshots retain their historical copies.
The build generates them from the root Markdown files; edit those originals,
not the ignored generated content. Documentation links in these pages resolve to the rendered public Docs, retaining section anchors; code references continue to point to GitHub. The website explains Contact inheritance and guided conversions as product capabilities; the FAQ reserves V2 for its four agreed themes and distinguishes unassigned later goals. The reference documentation currently remains
English at <https://docs.xobject.org/>; both product languages state this clearly.

## Design and components

The implementation follows ITextreme's Corporate Design and public website.
Shared brand roles, rather than application-specific overrides, define the frame:

- Inter Variable for body text and controls, Orbitron Variable for concise
  headings, JetBrains Mono Variable for technical accents. All fonts are self-hosted.
- Brand red `#E53145`, light action `#C81E3A`, dark action `#F26074`, light
  background `#F9FAFB` and dark background `#030712`, with semantic surface,
  text, border and focus roles.
- A 72 px header, a 90 rem container and responsive gutters; clear section
  surfaces, generous spacing, visible focus and reduced-motion support.
- Official ITextreme SVG assets are used unchanged, including their original
  tagline, proportions and minimum 240 px horizontal width.

`components.json` uses `base-nova`, Base UI, Lucide and `rsc: false`.
[ADR 0005](adr/0005-public-website-design-system.md) records the component strategy.
Use existing shadcn primitives and built-in variants first. Keep primitive styling
in their source and map it to semantic roles. Base UI owns menu focus, radio
semantics, Escape and dismissal. Native links and disclosure elements keep static
content usable without hydration. The header menus hydrate; a separate small React root mounts the shared screenshot
dialog. Product content and action links render at build time. Component/font notices ship under `/licenses/`.

`SiteLayout.astro` owns the frame and metadata; `config/content.ts` owns localized
product copy. The parent website remains the magazine; xObject has product-specific
navigation, examples and calls to action. No private planning files are runtime or
build dependencies.

Changelog and Roadmap use a shared editorial page frame: a concise hero, native section-anchor navigation, a readable content surface and the existing site tokens. The shared section-navigation script follows the visible section while scrolling and marks the active link with `aria-current="location"`, on both product and project pages. Mobile section strips reveal the active item horizontally without changing page position or URL history. Section links come from rendered Markdown headings; the root Markdown remains authoritative. Desktop section navigation stays below the sticky header while scrolling and can scroll internally on short screens. Narrow screens place navigation above the article. These pages stay English and use no additional client-side application state.

Astro bundles the section-navigation script with a content-hashed asset URL so
new pages do not reuse a stale script from an earlier deployment.

## Screenshots

`src/assets/screenshots/` contains actual fictional ITextreme demo views in both
interface languages and light/dark modes: a project tree, a record list, a Contact,
a custom service plan, a record journal and the Contact-conversion confirmation
preview. The Contact overview uses the 1.7.0 source and the list views retain their unchanged 1.4.0 captures; the conversion and other
views retain the unchanged earlier workflow captures. No real customer data or credentials
are included. Record contents remain in their original English language.
Capture through a separate browser session and restore temporary account settings.

The screenshot component follows the site's effective color mode, supplies localized
captions and alternative text, and opens a full-resolution shadcn/Base UI Dialog in
the same tab. Escape, the localized close control and outside click dismiss it;
focus returns to the originating image link. Without JavaScript, the original
image opens in the same tab as a normal link. Astro generates
responsive WebP assets; below-fold media loads lazily. Dashboard draft metrics are
not used to illustrate delivered capabilities. Refresh images when relevant forms
or navigation change; never fabricate controls or edit application contents into images.

## Local development and acceptance

From `apps/site`:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm test
```

`dist/` is static output. The Website Quality workflow checks Astro/TypeScript,
builds it, runs isolated Chromium acceptance and audits locked dependencies.
The tests cover language negotiation/manual choice/direct links, both localized
pages, theme persistence/system changes, responsive screenshots, menus, keyboard
focus, FAQ, accessibility, resource pages and console errors under production CSP.

Use `QA_SCREENSHOT_DIR=/absolute/path npm test` to retain browser captures.
For read-only checks of an already deployed matching build, use
`SITE_TEST_URL=https://xobject.org/ npm test`. Review desktop/mobile screenshots
as well as automated findings. Do not infer public deployment from local checks.

## Hosting and security

The existing website host serves static output, owns TLS, apex/`www` redirects,
retained releases and rollback, and also serves the Starlight documentation.
Astro development/preview servers are local tooling. Publication and live readback
remain separate from source changes.

Executable scripts, fonts and media come from the same origin. Asset inlining stays
disabled; no executable inline script, `unsafe-inline`, remote code or broader
hydration is required. The inert JSON-LD block is metadata. Preserve the existing
production CSP. `@astrojs/sitemap` and `robots.txt` provide crawler entry points.

See [Public documentation](public-documentation.md) for Starlight's independent
canonical content generation, versioned snapshots and checks.
