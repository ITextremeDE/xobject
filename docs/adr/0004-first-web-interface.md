# ADR 0004: First web interface and shared contracts

- Status: Accepted for the local experiment
- Date: 2026-10-29

## Context

The backend experiment needs a browser interface that exercises real PostgreSQL records and the same operations available to API and MCP clients. The complete version-1 permissions and domain modules are still outstanding.

## Decision

Use React and Vite with TypeScript, TanStack Query for server state and i18next for interface strings. Compose standard Radix-based shadcn/ui components with Tailwind and centralized semantic CSS variables. Keep business data on the server; only the appearance preference is stored locally.

Serve the built browser assets through Fastify on the same origin as Better Auth, API and MCP. Local iteration uses Vite build watch and browser refresh. Preserve existing Host/Origin checks rather than introducing a cross-origin development exception.

Move canonical operation input schemas and wire types into `packages/contracts`. Add object listing and bounded, literal Keyword search to the existing Application so UI, HTTP and MCP share authorization and behavior. Retain the Administrator-only restriction and scalar-text scope.

## Consequences

The first interface supports authentication, workspace/object/text-field creation, paginated record tables, editing and record journals. Version checks remain authoritative in the backend; the client guards unsaved edits. German/English labels use the existing stored preferences and definition-language fallback.

The server can run without built browser assets for backend-only development. Full version-1 acceptance, production packaging, domain modules, complete permissions and production agent authorization remain separate work. UI assets have to be built before browser use; no independent Vite development origin or live reload is provided by this experiment.
