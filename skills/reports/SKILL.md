---
name: reports
description: Use when the user wants dashboard reports, AI performance metrics, telephony reports, or analytics data.
---

# Reports & Analytics

## Trigger
Use when the user wants dashboard reports, AI performance metrics, telephony reports, or analytics data.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they handle OAuth transparently and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

The MCP server writes all credentials (instance + access/refresh tokens) to `~/.enneo/env`. Source it to use curl directly:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Dashboard Reports

```bash
curl -s "${BASE}/report/{reportCode}?lastDays=14" -H "${AUTH}"
```

### Available reports

| Code | Description | Key params |
|------|-------------|------------|
| `openTickets` | Open tickets by due date buckets (overdue, due soon, etc.) | — |
| `channelMix` | Ticket count by channel | status, channel, lastDays |
| `solvedTicketsByTeam` | Solved tickets by team over time | lastDays, agent (own/team/all) |
| `solvedTicketsByResolution` | Solved tickets by resolution type | lastDays, agent |
| `incomingVolume` | Incoming ticket volume over time | lastDays |
| `customerSurveys` | Customer satisfaction ratings distribution | lastDays, agent |
| `telephonyLines` | Live telephony line status, queue, calls | — |
| `telephonyAgents` | Agent telephony metrics (calls, talk time, ACW) | teamIds, lineIds, show, q, limit, offset |
| `telephonyAiAgents` | AI agent telephony metrics | lineIds |
| `telephonyPerformance` | Telephony KPIs over time (ASA, AHT, SLA) | lastDays, lineId |
| `telephonyCallInsights` | AI vs human, intents, hourly breakdown | lastDays, lineId |
| `telephonyLineTopPerformers` | Top performers by line | lineId (required), lastDays, agentsType |

### `lastDays` values
`0` (today), `1`, `3`, `7`, `14`, `30`, `90`, `365`

### `agent` filter
`own` (current user), `team` (user's team), `all` (everyone)

---

## AI Performance (Overall)

```bash
curl -s "${BASE}/report/aiPerformance?lastDays=14" -H "${AUTH}" | jq 'to_entries[] | {metric: .key, summary: .value.summary, description: .value.description}'
```

### Metrics returned

| Metric | Description |
|--------|-------------|
| `autoProcessableAwaitingApproval` | Open tickets waiting for human approval |
| `requireManualProcessing` | Tickets needing manual work despite agent match |
| `customerCorrectlyIdentified` | Customer identification accuracy (%) |
| `correctlyCategorizedWithTags` | Tag assignment accuracy (%) |
| `textAssistantAccuracy` | Text suggestion accuracy |
| `autoProcessing` | Auto-processed count: L4 (with approval) + L5 (autonomous) |
| `automationLevel` | Daily distribution across L0-L5 |
| `topAiAgents` | Top performing agents with processed/awaiting counts |

Each metric has: `data` (time-series), `summary` (aggregates), `description`, `filters`.

The `topAiAgents` metric also returns `outputHandlingCases` for rule-based agents, allowing filtering by response case.

## AI Agent Performance (Specific Agent)

```bash
curl -s "${BASE}/report/aiAgentPerformance/{aiAgentId}?lastDays=14" -H "${AUTH}"
```

### Agent-specific metrics

| Metric | Description |
|--------|-------------|
| `autoProcessing` | Auto-processed by this agent (daily) |
| `automationLevel` | L0-L5 distribution |
| `avgHandlingTimeHuman` | Average handling time for human cases (L2+L3) |
| `autoProcessingShare` | Share of auto-processed vs total |
| `autoProcessingApprovalRate` | How often auto-processing was approved |
| `autoProcessingSuccessRate` | Success rate of auto-processing |
| `approvalTimeL4` | Average time to approve L4 cases |
| `autoProcessingErrorRate` | Error rate |
| `outputHandlingCases` | Available response case options for filtering |
| `customerSatisfaction` | CSAT for this agent |

Each includes `summary` with current + previous period comparison.

## Report Structure

```bash
curl -s "${BASE}/report/structure" -H "${AUTH}"
```

Returns the dashboard widget layout/configuration schema.

---

## Analytics Integration

Enneo integrates with **Apache Superset** for advanced BI:
- Custom charts, dashboards, SQL queries
- Data refreshes every 5 minutes
- Access controlled by "Datenverfügbarkeit" setting per team

## Worklog Data Fields

When analyzing worklogs (via reports or exports):

| Field | Description |
|-------|-------------|
| `duration` | Handling time (seconds) |
| `durationAfterWork` | After-work time (seconds) |
| `action` | closeAction, readAction, writeAction, statusAction, autoProcessAction |
| `aiAutomationLevel` | L0-L5 |
| `customerIdentifiedCorrectly` | 0 or 1 |
| `tagsIdentifiedCorrectly` | 0 or 1 |
| `textAssistanceAccuracy` | Float, 0-1 |
| `aiAgentsUsed` | JSON array of agent IDs |
| `skippedTicket` | Whether ticket was skipped |
| `netSecondsClosedAfterSLA` | Negative = before SLA deadline |
