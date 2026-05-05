# Enneo Claude Code Plugin

A [Claude Code](https://claude.ai/code) plugin that connects Claude to your Enneo customer service platform. Investigate tickets, manage AI agents, debug processing pipelines, query reports, and control your entire Enneo instance through natural language.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Access to an Enneo instance (e.g. `yourcompany.enneo.ai`) where you can log in
- A browser, signed in to your Enneo instance
- `curl`, `jq` available in your shell

## Installation

```bash
# 1. Add the repository as a plugin source
claude plugin marketplace add https://github.com/enneo-AI/claude-plugin

# 2. Install the plugin (use `claude plugin marketplace list` to confirm the marketplace name)
claude plugin install enneo@claude-plugin
```

On first use, when you ask Claude about an Enneo instance, the `browser-jwt` skill asks you to copy the JWT from your Profile Settings page (Login → API key) and saves it to `~/.enneo/browser-tokens.json` (mode 600, keyed by origin). After that, every skill works directly.

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

Just ask Claude: *"Connect to staging.enneo.ai"* — it runs `browser-jwt` for the new instance (you need to be signed in to it in your browser). Tokens for multiple instances coexist in `~/.enneo/browser-tokens.json`, keyed by origin.

## Security

- Tokens are stored in `~/.enneo/browser-tokens.json` with mode 600 (owner read/write only)
- The plugin never asks for your password — it just shows you where to find the JWT in your already-authenticated Profile Settings page
- Write operations (create, update, delete) always require explicit confirmation before execution
- Tokens are never displayed in full — masked as `eyJ…<last-8>` when shown

## License

Proprietary — use is restricted to authorized customers and partners of Enneo GmbH. See [LICENSE](LICENSE) for details.
