# @enneo/claude-mcp-server

The local stdio MCP server bundled with the Enneo Claude Code plugin. `.mcp.json` starts the committed `bundle/index.js` with Node.js.

## Authentication

Native tools read the same `~/.enneo/env` file used by the skills' curl examples:

```bash
export ENNEO_INSTANCE="demo.enneo.ai"
export ENNEO_TOKEN="<profile API key>"
```

Enter the key locally in an editor and keep the file at mode 600; do not send it to Claude. Reuse a saved key for that instance. If none is available, create one under **Profile Settings → Login → API keys**. See the [plugin setup](../README.md) and [legacy cache migration](../skills/browser-jwt/SKILL.md#reuse-a-legacy-browser-cache).

Each request reads the instance/key pair once and sends the key as a Bearer token to that instance's Mind API. Missing credentials fail before any network call. JWT expiry metadata is not required; Enneo validates the key. A 401 is returned as an error without retrying or renewing the key. There is no OAuth discovery, browser callback, refresh token, or separate MCP credential store.

`enneo_configure` saves the active hostname. Configuring the same instance retains its key; switching instances or requesting `reset: true` clears the local key. Enter a matching key before the next API call. Reset does not revoke the key in Enneo.

## Tools

- `enneo_configure` — configure the active instance or clear its saved key
- `enneo_profile_me` — fetch the current profile and confirm the connection
- `enneo_ticket_get` — fetch a ticket by ID
- `enneo_ticket_search` — search tickets with filters

Other operations are documented as curl examples in the plugin's skills.

## Development

```bash
cd mcp-server
npm ci               # prepare rebuilds the bundle
npm run bundle       # tsc -> dist/, then esbuild -> bundle/index.js
npm test             # rebuild and test the shipped bundle over stdio
npm start            # runs on stdio; use an MCP client
```

`npm test` launches a copy of the shipped bundle without `node_modules`, with temporary credentials and a fake API transport. It uses no real Enneo credentials, network services, or listener ports.

The build clears `dist/` before compiling so removed source files cannot remain in the build output. `dist/` is a gitignored build intermediate. **Commit `bundle/index.js` whenever `src/` or a dependency changes.** `npm install` regenerates it, so a stale bundle shows up in `git status`.

## Distribution

The plugin ships a single self-contained file and is not published to npm. A marketplace install is a plain git checkout with no `npm install` step, so the server cannot rely on `node_modules/` at runtime. esbuild inlines `@modelcontextprotocol/sdk` and `zod` into `bundle/index.js`. `.mcp.json` must point at that bundle, never at `dist/`.
