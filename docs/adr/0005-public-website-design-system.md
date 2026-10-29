# ADR 0005: Share the ITextreme design system in the Astro website

- Status: Accepted
- Date: 2026-10-29

## Context

The first public project introduction uses a static Astro build and the
ITextreme Corporate Operating System. The full product website should use the
same design vocabulary and component rules as the public ITextreme website.
The application and its experimental backend have independent delivery paths.

## Decision

Use Astro with strict TypeScript, Tailwind CSS 4, locally hosted Inter,
Orbitron and JetBrains Mono, and Lucide. Map only required COS roles into the
website's CSS custom properties and Tailwind theme; there is no build-time
or runtime dependency on a personal knowledge vault.

Adopt only needed primitives from the official shadcn/ui registry through its
CLI. Use `base-nova`, Base UI, Lucide and CSS variables, matching ITextreme's
component strategy. Astro does not use React Server Components: `rsc` is false.
Static actions are rendered at build time. The header uses the same real Base UI
Dropdown Menu and icon-button patterns as ITx for theme and mobile navigation.
Only this small header root is hydrated. A Vite-bundled same-origin entry calls
React `hydrateRoot` on markup generated with `renderToString` and the same
identifier prefix. This preserves the existing CSP without executable inline
bootstrap code or a broader page/client boundary. The early external theme
initializer remains the single owner of color-mode application; controls
publish changes and subscribe to it.

Keep content, primitives, layouts and pages separate. Markdown/MDX content is
validated through Astro content collections. Canonical/OG metadata and inert
WebSite JSON-LD belong to the shared layout; the sitemap derives from built
routes. New image content should use Astro's image pipeline where appropriate.
The existing SVG brand assets remain unchanged.

## Consequences

- The current static Caddy runtime and signed deployment contract still apply.
- Component source is owned and maintained here. Record CLI provenance and
  upstream licenses; review upstream diffs before updates.
- Callers choose component variants and compose layouts; they do not override
  primitive colors/typography with local classes.
- Strict typing, CSP/browser checks, system/light/dark accessibility and mobile
  acceptance are release gates. No application build is required for site-only
  changes.
- OpenSiteStack remains a Next.js platform dependency and is not added to Astro.
- The website foundation is delivered independently of full product pages,
  Starlight documentation or installable application releases.
