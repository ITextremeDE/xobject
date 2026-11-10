# Prepare the optional OpenAI plugin

The optional package distributes the four canonical xObject workflows with a connection to one installation. The live MCP server remains the authority for data, module availability, permissions and journals.

## Build locally

Use a source checkout and the Node.js version from [Development](development.md#requirements). Run `npm ci` from the repository root first, then prepare a new ignored output directory:

```sh
npm run plugin:prepare -- --url https://your-installation.example/mcp --output .local/my-xobject-plugin
```

The generator writes the portable manifests and includes their canonical workflow sources. Maintainers can validate packaging with `npm run test:packaging`; that broader suite requires Docker and creates isolated test resources. Preparing a plugin does not require running the xObject development database.

Use the actual installation endpoint. HTTP is allowed only for loopback development. The output directory must be new. The package includes root `plugin.json` and `mcp.json`, canonical `skills/*/SKILL.md`, OpenAI dependency descriptors, license/notice and source hashes. Credentials never belong in these files.

Both manifests have been validated against the official Agent Plugins 1.0.0 schemas. The portable MCP configuration declares Streamable HTTP and relies on standard OAuth discovery. It omits vendor authentication extensions because the currently published portable MCP JSON Schema rejects those additional server properties; the OpenAI authoring guide currently describes them. Keep the portable format valid and test host support before distributing an installation-specific package.

## Connect and accept

Review the [OpenAI plugin packaging guide](https://developers.openai.com/plugins/build/plugins) for the actual client surface. Import/installation, registered server mapping and marketplace availability depend on the client/workspace. This generator installs nothing and modifies no user or project agent configuration.

For an ordinary remote connection, first follow [Connect a client](api.md#connect-a-client); plugin packaging is optional. A readable workflow resource, an installed plugin instruction and native Skills activation are separate capabilities. Keep any unavailable path explicit rather than treating plugin preparation as a successful client connection.

In an available OpenAI client, connect to the installation, authorize the current user and complete the [PRD interoperability scenarios](PRD.md#92-mcp-interoperability-and-v1-acceptance). Check workflow discovery/loading as well as reads, writes, conflicts, lifecycle confirmation and revocation. Record client/model/protocol and actual results.

Static packaged skills are instructions, not capabilities. The server's Skills extension filters live discovery and reads by current module/object/role access; the optional package also directs each workflow to check those conditions. Installing a skill grants no data access.

Local packaging and SDK/OAuth tests are complete. The [live Codex exercise](quality-acceptance.md#provider-acceptance) additionally installed the portable package, loaded its Foundation/Projects instruction files and used them with MCP/OAuth data access. Installed files matched the canonical source hashes. That exercise used the host's ordinary file-reading mechanism for packaged instructions; it did not activate the native MCP Skills extension. The temporary plugin/marketplace and test authorization were removed after verification. Public-directory submission additionally requires a reachable reviewed HTTPS service and its required publisher/privacy information; no service or plugin has been published.
