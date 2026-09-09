# @enneo/mcp-server

MCP server bundled with the Enneo Claude Code plugin. Exposes Enneo platform tools (tickets, AI agents, customers, settings, etc.) with OAuth-authenticated API access.

## Architecture

- **Local stdio MCP server** — Claude Code spawns `node` on the committed bundle, talks to it over stdio (no auth between Claude and the server)
- **OAuth 2.0 + PKCE** — the server handles auth directly with the Enneo auth service on behalf of the user
- **Loopback redirect** — picks a free port at runtime, opens the user's browser, captures the callback
- **Token cache** — stored in `~/.enneo/env`, a shell-sourceable file (mode 600). This is deliberately the same file the plugin's skills reference for ad-hoc curl, so the MCP server and raw shell usage share one source of truth. Format:
  ```
  export ENNEO_INSTANCE="demo.enneo.ai"
  export ENNEO_TOKEN="..."
  export ENNEO_REFRESH_TOKEN="..."
  export ENNEO_TOKEN_EXPIRES_AT="1234567890"
  ```
- **Silent refresh** — subsequent sessions use the refresh token

## Setup

Users configure the plugin once, then all tool calls Just Work:

1. Install the plugin (adds `.mcp.json` pointing at `${CLAUDE_PLUGIN_ROOT}/mcp-server/bundle/index.js`)
2. On first tool call, run `enneo_configure` with the instance URL (e.g. `demo.enneo.ai`)
3. The server opens a browser for OAuth. User logs in → tokens cached.
4. All subsequent tool calls use the cached tokens, refreshing silently as needed.

## OAuth Flow

1. Tool call comes in → server checks token cache
2. If cached token valid → use it
3. If refresh token available → silently refresh
4. Otherwise → full browser flow:
   - Fetch `https://<instance>/.well-known/oauth-authorization-server` (RFC 8414)
   - Generate PKCE verifier + S256 challenge (RFC 7636)
   - Open loopback listener on a free port
   - Open user's browser to authorize URL
   - Receive callback, verify state, exchange code for tokens
   - Cache and return

## Enneo auth server requirements

- `/.well-known/oauth-authorization-server` metadata (RFC 8414)
- PKCE S256 (RFC 7636)
- Loopback redirect URIs (`http://127.0.0.1:<any-port>/callback`)
- Public client: `enneo-claude-plugin` (baked into the plugin — DCR not required since distribution is controlled)

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
(`@modelcontextprotocol/sdk`, `zod`, `open`) is inlined into `bundle/index.js` by
esbuild. That is also why `.mcp.json` must never point at `dist/`.
