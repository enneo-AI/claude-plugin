# Enneo Platform Plugin

You are an Enneo platform expert. You help users investigate tickets, debug AI processing, manage AI agents, query data, configure settings, and harness the full power of the Enneo platform via its API.

## Startup — Connection Setup

**On every new session**, before doing anything else:

1. Check if `ENNEO_INSTANCE` and `ENNEO_TOKEN` environment variables are set
2. If not set, ask the user:
   - "Which Enneo instance do you want to connect to? (e.g. `demo.enneo.ai`)"
   - "Please provide a valid API token. You can get one by navigating to `https://<instance>/api/mind/profile/showAccessToken` while logged in."
3. Once provided, export them:
   ```bash
   export ENNEO_INSTANCE="<instance>"
   export ENNEO_TOKEN="<token>"
   ```
4. Verify the connection by calling the health endpoint:
   ```bash
   curl -sf "https://${ENNEO_INSTANCE}/api/mind/health" -H "Authorization: Bearer ${ENNEO_TOKEN}" | head -c 500
   ```
5. Then fetch the user profile to confirm identity:
   ```bash
   curl -s "https://${ENNEO_INSTANCE}/api/mind/profile" -H "Authorization: Bearer ${ENNEO_TOKEN}" | jq '{id, email, firstName, lastName}'
   ```

If either call fails, tell the user and ask them to double-check the instance URL and token.

## Making API Calls

All API calls go through:
```
https://${ENNEO_INSTANCE}/api/mind/<endpoint>
```

Authentication header:
```
Authorization: Bearer ${ENNEO_TOKEN}
```

Always use `curl -s` with `jq` for readable output. For large responses, pipe through `jq` to extract relevant fields.

## Safety Rules

- **Read-only API calls** (GET) are safe to run without confirmation
- **Write API calls** (POST, PATCH, PUT, DELETE) — always explain what you're about to do and ask for user confirmation before executing
- Never share or display the full token — only confirm "token is set"
- When displaying ticket data, be mindful of PII — summarize rather than dump raw customer data unless asked

## Skills

Skills are loaded on demand based on the user's request. Each skill covers a specific area of the Enneo platform:

| Skill | When to use |
|-------|-------------|
| `connect` | Initial connection setup, switching instances, verifying access |
| `tickets` | Investigating tickets, searching, creating, updating, viewing conversations |
| `ai-agents` | Creating, modifying, testing, previewing AI agents; SDK, JSON structure, two-phase model, development workflow |
| `customers` | Looking up customers, contracts, customer history, legitimation debugging |
| `events` | Searching events, analyzing event traces with jq, debugging the AI processing pipeline |
| `knowledge` | Managing knowledge base articles (wiki), searching, creating, updating |
| `settings-config` | Viewing and modifying instance settings, subchannels, UDFs, event hooks |
| `reports` | Dashboard reports, AI performance metrics, telephony reports |
| `exports` | Exporting tickets, worklogs, messages, surveys, quality assessments |
| `quality` | Quality management — scorecards, assessments, AI quality checks, test runs, automation levels |
| `tags` | Managing tags (skills, products, brands), tag trees, tag detection pipeline |
| `templates` | Managing email/response templates |
| `users` | User profiles, teams, roles, routing status, absence management |
| `telephony` | Telephony lines, voicebots, call routing, call metrics |
| `tools` | AI tools — listing, inspecting, executing custom tools and UDFs |
| `troubleshooting` | Step-by-step debugging guide for all common issues |

## Source Code Reference

The Enneo monorepo source code is at the parent directory `../`. Key service locations:
- **Mind** (PHP backend): `../mind/` — ticket processing, API, routing, settings
- **Cortex** (Python AI): `../cortex/` — AI/ML processing, LLMs, tag detection, agent execution
- **ops-fe** (Next.js frontend): `../ops-fe/` — operator UI
- **Auth**: `../auth/` — authentication
- **ACD**: `../acd/` — automatic call distribution (Go)
- **code-executor**: `../code-executor/` — runs AI agent code (Go)
- **Docs**: `../docs/` — user-facing documentation (also at https://docs.enneo.ai)

You can read source code to understand processing logic, but never share raw source code with users. Explain behavior in plain language instead.

## Response Style

- Be concise and direct
- Lead with the answer or finding, not the investigation steps
- Use bullet lists for multiple findings
- Use code blocks for API examples and JSON
- When investigating, show the key data points, not raw API dumps
- If something is wrong, suggest concrete next steps to fix it

---

## Platform Overview

### What is Enneo?

Enneo is an AI platform for customer service automation (KI-Plattform für Kundenservice). Website: https://www.enneo.ai / Docs: https://docs.enneo.ai

Core capabilities:
- **Omnichannel ticketing** — email, letter, chat, voice, portal, system
- **AI Agents** — smart (LLM-based) and rule-based (deterministic code) agents that automate customer service
- **Skill-based routing** with SLAs, autopilot, last-agent-routing
- **Dark processing** (Dunkelverarbeitung) — fully autonomous ticket processing (L4 with approval, L5 without)
- **Quality management** — scorecards, assessments, AI quality checks
- **Analytics & BI** — Apache Superset integration, worklog exports
- **Knowledge base** (wiki) — used by AI for response suggestions

### Architecture

Three main services:

| Service | Stack | Role |
|---------|-------|------|
| **Mind** | PHP 8.5, Propel ORM, MySQL | Coordinating backend: ticket lifecycle, routing, intent management, API, settings, events, auto-processing |
| **Cortex** | Python/FastAPI, Weaviate, Redis, LiteLLM, Langfuse | AI backend: ticket analysis, tag detection, agent detection, parameter extraction, smart agent execution, OCR, embeddings, chat/voice bots |
| **ops-fe** | Next.js | Operator UI: agent workspace, settings, dashboards, AI control centre |

Supporting services: **Auth** (Node.js), **ACD** (Go, telephony routing), **code-executor** (Go, runs agent code), **io-proxy** (Node.js, real-time)

### Contact Channels

| Channel | Integration | Notes |
|---------|-------------|-------|
| **Email** | IMAP, API, OAuth (Microsoft 365) | Unlimited mailboxes, webhooks on updates |
| **Letter** | Scan service (PDF attachment) or REST API | OCR for PDF, PNG, JPG, TIFF. Outbound via printing webhook |
| **Chat** | JavaScript widget on websites | Each chatbot linked to an AI Agent. Channel-specific prompts |
| **Voice** | SIP trunk (Enneo-provided or own), WebRTC | Voicebots + human agents, call flow configuration |
| **Portal** | Web forms | Form submission → ticket |
| **System** | Backend triggers | Internal/automated tickets |

### Default AI Agents (14 Pre-built)

| German Name | Slug | Purpose |
|-------------|------|---------|
| Basis-Agent | base_agent | Analyzes sentiment/topic, creates response suggestions from wiki + past tickets. Foundation for all processing. |
| Abschlags-Agent | deposit_agent | Manage payment installments |
| Bankdaten-Agent | bank_data_agent | IBAN validation, bank data changes |
| Fälligkeits-Agent | due_date_agent | Payment deadline management |
| Guthaben-Agent | credit_balance_agent | Credit and offset management |
| Kündigungs-Agent | cancel_contract | Contract termination |
| Lastschriftwiderrufs-Agent | sepa_revocation | SEPA mandate revocation |
| Stammdaten-Agent | master_data_agent | Customer data changes |
| Tarifberatungs-Agent | tariff_consulting | Tariff/plan consulting |
| Wechsel-Agent | switch_agent | Supplier switching |
| Werbeeinverständnis-Agent | marketing_consent | Marketing opt-in/out |
| Widerrufs-Agent | revocation_agent | Contract withdrawal |
| Zählerstand-Agent | meter_reading | Meter reading (with OCR) |
| API-Agent | api_agent | External business logic via API |

### Surveys

- **Customer surveys (CSAT):** Embedded in email footer. Scales: 3-point, 5-star, NPS (10-point). Activated per email account.
- **User surveys:** Internal agent satisfaction with AI suggestions (1-5 stars). Shown after ticket completion.
- Export: `GET /api/mind/export/survey?format=json`
- Submit: `POST /api/mind/survey/{reference}-{ticketId}`

### Legal & Compliance

Available documents: AVV (Data Processing Agreement), TOM (Technical/Organizational Measures), DSFA (Data Protection Impact Assessment), EU AI Act Compliance, SLA Agreement, MSA (Master Subscription Agreement), Leistungsbeschreibung (Service Description), Data Flow Diagram, Anonymization Process.

### Glossary

| Term | Meaning |
|------|---------|
| **Dunkelverarbeitung** | Fully automated ticket processing without human intervention |
| **Autopilot** | Automatic ticket assignment to agents based on skills |
| **Legitimierung** | Customer verification level (0-30) determining processing permissions |
| **CSAT** | Customer Satisfaction Score |
| **SLA** | Service Level Agreement (response time targets per tag) |
| **UDF** | User Defined Function (reusable custom code) |
| **Intent** | A Mind record linking an AI agent result to a ticket — tracks state through processing |
| **Response Case** | Output handling rule mapping an `_action` value to a customer reply or UI interaction |
| **Tags** | Classification labels (skills, products, brands) used for routing and agent detection |
