# Enneo Claude Code Plugin

A [Claude Code](https://claude.ai/code) plugin that connects Claude to your Enneo customer service platform. Investigate tickets, manage AI agents, debug processing pipelines, query reports, and control your entire Enneo instance through natural language.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Access to an Enneo instance (e.g. `yourcompany.enneo.ai`) where you can log in
- A saved profile API key, or permission to create one in Profile Settings → Login → API keys
- `curl`, `jq` available in your shell

## Installation

```bash
# 1. Add the repository as a plugin source
claude plugin marketplace add https://github.com/enneo-AI/claude-plugin

# 2. Install the plugin (use `claude plugin marketplace list` to confirm the marketplace name)
claude plugin install enneo@claude-plugin
```

The native MCP tools and curl examples share one credential file: `~/.enneo/env`. Reuse an existing profile API key for your instance. If you need a new key, create it in **Profile Settings → Login → API keys**; Enneo shows it once. Enter it locally in a text editor, without sending it to Claude:

```bash
mkdir -p ~/.enneo
chmod 700 ~/.enneo
touch ~/.enneo/env
chmod 600 ~/.enneo/env
```

The file contains these two lines, with your hostname and key:

```bash
export ENNEO_INSTANCE="yourcompany.enneo.ai"
export ENNEO_TOKEN="<your profile API key>"
```

Ask Claude to check the connection with `enneo_profile_me`. Subsequent calls reuse the saved key. The plugin does not open a browser or renew keys automatically; missing expiry metadata does not prevent reuse.

If your key is already in `~/.enneo/browser-tokens.json`, follow the [one-time local migration](skills/browser-jwt/SKILL.md#reuse-a-legacy-browser-cache) to copy the matching origin's key into `~/.enneo/env`. You do not need to issue another key.

## Updating

```bash
claude plugin update enneo@claude-plugin
```

Then exit and start a new Claude Code session — the update only takes effect after restart.

## What You Can Do

| Area | Examples |
|------|---------|
| **Tickets** | Search tickets, view conversations, create/update/close, reply to customers |
| **AI Agents** | Create and modify rule-based agents, test agent behavior, debug intent detection |
| **Customers** | Look up customers by email/phone, view contracts, debug legitimation |
| **Events** | Trace the full AI processing pipeline for any ticket event |
| **Knowledge** | Search and manage knowledge base articles |
| **Quality** | Run scorecards, view assessments, test automation levels |
| **Reports** | AI performance metrics, workload KPIs, telephony reports |
| **Exports** | Export tickets, messages, worklogs, surveys, quality assessments |
| **Settings** | View and modify instance config, subchannels, UDFs, event hooks |
| **Tags** | Manage skill/product/brand tags and debug tag detection |
| **Users** | Manage users, teams, roles, routing status, absences |
| **Telephony** | Voicebots, call routing, live queue status |
| **Templates** | Email and response template management |
| **Tools** | AI tools, UDFs, code executor integration |

## Usage Examples

```
Show me all open tickets from the last 24 hours
```
```
Why didn't the AI agent auto-process ticket #12345?
```
```
Create a new rule-based agent that handles return requests
```
```
What's our AI deflection rate for this month?
```
```
Show me the event trace for ticket #12345
```

## Switching Instances

Ask Claude: *"Connect to staging.enneo.ai"*. `enneo_configure` switches the active instance and clears the previous key. Enter a key for the new instance locally in `~/.enneo/env`. Configuring the same instance keeps its key; `reset: true` clears it locally without revoking it in Enneo. There is one active instance/key pair.

## Security

- The instance and key are stored in `~/.enneo/env` with mode 600 (owner read/write only)
- Enter the key locally; the plugin never needs your password or your key in chat
- Write operations (create, update, delete) always require explicit confirmation before execution
- Connection checks display the instance and profile, not the token
- Keys can be listed and withdrawn from the same Profile Settings panel, or over the API; withdrawing one takes effect immediately

## License

Proprietary — use is restricted to authorized customers and partners of Enneo GmbH. See [LICENSE](LICENSE) for details.
