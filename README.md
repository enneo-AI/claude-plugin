# Enneo Claude Code Plugin

A [Claude Code](https://claude.ai/code) plugin that connects Claude to your Enneo customer service platform. Investigate tickets, manage AI agents, debug processing pipelines, query reports, and control your entire Enneo instance through natural language.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Access to an Enneo instance (e.g. `yourcompany.enneo.ai`)
- A browser (for the OAuth login flow)
- `curl`, `jq`, `python3`, `openssl` available in your shell

## Installation

```bash
claude plugin install git@gitlab.com:enneo/ai/claude-plugin.git
```

On first use, Claude will automatically run the OAuth login flow — it opens your browser, you log in, and credentials are saved to `~/.enneo/env`.

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

Just ask Claude: *"Connect to staging.enneo.ai"* — it will re-run the OAuth flow for the new instance.

## Security

- Credentials are stored in `~/.enneo/env` with mode 600 (owner read/write only)
- The OAuth flow uses PKCE (RFC 7636) and loopback redirection (RFC 8252) — no secrets are ever stored in the plugin itself
- Write operations (create, update, delete) always require explicit confirmation before execution
- Your token is never displayed or logged

## License

Proprietary — use is restricted to authorized customers and partners of Enneo GmbH. See [LICENSE](LICENSE) for details.
