# Public project website

The Astro site in `apps/site` introduces xObject at <https://xobject.org>.
It describes intended functionality and explicitly identifies the project as
early development. It is separate from the application: no login, database,
uploads, analytics, remote fonts or mail service is provided.

## Local development

```sh
cd apps/site
npm ci
npm run dev
npm run build
```

`dist/` is static build output. The `Website Quality` workflow builds that
output and audits its locked dependencies. Production serves the generated
files through Caddy; Astro's development/preview server is not a production
service. The existing website host owns deployment, TLS, canonical apex/`www`
redirects and retained releases.

## Design provenance

The design implements ITextreme's Corporate Operating System (Corporate Design
and Corporate Tokens, reviewed 2026-08-22), aligned with the current public
ITextreme website. There is no runtime dependency on personal planning files.

- Orbitron Variable: short project headings; Inter Variable: body and controls;
  JetBrains Mono Variable: object identifiers. Fonts are self-hosted under OFL.
- Brand red `#E53145`; accessible light action `#C81E3A`; background `#F9FAFB`.
  Dark roles use `#030712`, `#F9FAFB` and the action color `#F26074`.
- Semantic CSS roles define all component colors. System, light and dark modes
  share one layout. Theme selection is local to the browser.
- The conceptual object diagram implements the brand's connected-order
  principle; it is not a screenshot of an existing application.
- Official SVG brand assets are copied unchanged from the public ITextreme
  website source. The horizontal logo is displayed at least 240 px wide and
  retains its original tagline and proportions. Do not redraw or typeset it.
- Product requirements, roadmap and changelog link to their canonical Git
  sources instead of maintaining separate website copies.

Check desktop/mobile layout, all resource links, keyboard focus, reduced
motion, system/light/dark selection and the absence of overflow before release.

`npm test` exercises the built output in isolated Chromium under the production
Content-Security-Policy. It checks persisted theme selection, accessibility,
navigation, responsive overflow at 390/320 px and browser errors. The CI runs
this check after the static build. Production permits external local scripts
and fonts from the same origin only; build-time asset inlining is disabled to preserve that policy.

The 2026-10-29 design review compared the complete compact concept and rendered
1024 × 1536 view: heading/body/mono roles, semantic palette, section order,
CTA copy, object diagram, open-column rhythm and mobile reflow. The actual
official ITextreme SVG replaces the draft image's invented logo. Font sizes
adapt to the available width using the COS hierarchy; the early-development
statement remains visible. Browser/IAB inspection was completed first; after
the Chrome connection timed out, responsive/CSP acceptance used isolated
Chromium instead of controlling the user's browser through another channel.
