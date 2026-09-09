# @enneo/mcp-server

MCP server bundled with the Enneo Claude Code plugin. Exposes Enneo platform tools (tickets, AI agents, customers, settings, etc.) using a saved profile API key.

## Architecture

- **Local stdio MCP server** — Claude Code spawns `node` on the committed bundle, talks to it over stdio (no auth between Claude and the server)
- **API key** — stored in `~/.enneo/env`, a shell-sourceable file (mode 600). Format:
  ```
  export ENNEO_INSTANCE="demo.enneo.ai"
  export ENNEO_TOKEN="..."
  ```

## Setup

Users configure the plugin once, then all tool calls Just Work:

1. Install the plugin (adds `.mcp.json` pointing at `${CLAUDE_PLUGIN_ROOT}/mcp-server/bundle/index.js`)
2. On first tool call, run `enneo_configure` with the instance URL (e.g. `demo.enneo.ai`)
3. Set `ENNEO_TOKEN` locally in `~/.enneo/env` to an existing key from Profile Settings → Login → API keys. Create one only if no usable key is available.
4. All subsequent tool calls reuse this key. There is no OAuth discovery or automatic renewal.

## Tools

Current scaffold exposes three representative tools:
- `enneo_configure` — set the instance URL (first-time setup)
- `enneo_profile_me` — fetch current user profile
- `enneo_ticket_get` — fetch a ticket by ID
- `enneo_ticket_search` — search tickets with filters

More tools will be added, matching the capabilities documented in the plugin's skills.

## Development

```bash
cd mcp-server
npm install          # `prepare` rebuilds the bundle for you
npm run bundle       # tsc -> dist/, then esbuild -> bundle/index.js
npm start            # runs on stdio — for manual testing, use an MCP client
```

`dist/` is a build intermediate and is gitignored. **`bundle/index.js` is the shipped
artifact and must be committed** — commit it whenever `src/` or a dependency changes.
`npm install` regenerates it, so a stale bundle shows up in `git status`.

## Distribution

Shipped inside the plugin as a single self-contained file, not published to npm. A
marketplace install is a plain git checkout with no `npm install` step, so the server
cannot rely on `node_modules/` existing at runtime — everything it imports
(`@modelcontextprotocol/sdk`, `zod`) is inlined into `bundle/index.js` by
esbuild. That is also why `.mcp.json` must never point at `dist/`.
