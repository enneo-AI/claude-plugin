---
name: reports
description: Use when the user wants dashboard reports, AI performance metrics, quality reports, telephony reports, or analytics data.
---

# Reports & Analytics

## Trigger
Use when the user wants dashboard reports, AI performance metrics, quality reports, telephony reports, or analytics data.

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

Each code is gated by the permission `report` + the capitalised code (`openTickets` → `reportOpenTickets`). Missing it → 403.

### Available report codes

| Code | Description | Params |
|------|-------------|--------|
| `openTickets` | Open tickets by due-date bucket | `ticketScope` (all/skills) |
| `channelMix` | Ticket count by channel | `channel`, `status` (open/closed/pending), `lastDays`, `ticketScope` |
| `solvedTicketsByTeam` | Solved tickets over time | `lastDays`, `agent`, `ticketScope`, `granularity` (day/week/month) |
| `solvedTicketsByResolution` | Solved tickets by resolution type | `lastDays`, `agent`, `granularity` |
| `incomingVolume` | Incoming ticket volume over time | `lastDays`, `channel`, `granularity` (hour/day/week/month) |
| `customerSurveys` | CSAT rating distribution | `lastDays`, `agent`, `ticketScope` |
| `qualityAssessments` | Quality scorecard results | see below |
| `telephonyLines` | Live line status, queue, calls | — (real time) |
| `telephonyAgents` | Agent telephony metrics | `teamIds`, `lineIds`, `status`, `show`, `q`, `limit`, `offset` |
| `telephonyAiAgents` | AI agent telephony metrics | `lineIds` |
| `telephonyPerformance` | Telephony KPIs over time | `lastDays`, `lineId`, `direction` (in/out), `granularity` |
| `telephonyCallInsights` | AI vs human, intents, hourly split | `lastDays`, `lineId`, `direction`, `granularity` |
| `telephonyLineTopPerformers` | Top performers on one line | `lineId` (required), `lastDays`, `agentsType` (all/ai/human) |

### Common filter values
- `lastDays`: `0` (today), `1`, `3`, `7`, `14`, `30`, `90`, `365`
- `agent`: `own` (caller), `team`, `all` — the options actually offered depend on `reportViewTeamSolvedTickets` / `reportViewAllSolvedTickets`
- `granularity`: `hour` (short ranges only), `day`, `week`, `month`
- `ticketScope`: `all` or `skills` (tickets matching the caller's skill tags)

Response per report: `data`, `description`, `filters`, plus `summary` / `total` / `links` when present.

---

## Quality Assessments Report

```bash
curl -s "${BASE}/report/qualityAssessments?lastDays=30&granularity=week" -H "${AUTH}"
```

Params: `lastDays` **or** `dateFrom`/`dateTo` (free-form range wins), `granularity`, `channel`, `scorecardId` (the scorecard's stable `baseId`), `agent` (own/team/all), `assessedUserId`, `assessedTeamId`. An explicit user/team overrides `agent` and is clamped to what the caller may see — outside it, 403.

Metrics returned: `overallScore`, `scoreOverTime`, `assessmentTypeSplit` (AI vs human-verified), `assessmentsByState`, `scoreDistribution`, `teamBreakdown`, `memberBreakdown`, `scorecardBreakdown`, `channelBreakdown`, `closureSla`.

---

## AI Performance (Overall)

```bash
curl -s "${BASE}/report/aiPerformance?lastDays=14" -H "${AUTH}" | jq 'to_entries[] | {metric: .key, summary: .value.summary, description: .value.description}'
```

Permission: `reportAiPerformance`. Params: `lastDays`.

| Metric | Description |
|--------|-------------|
| `autoProcessableAwaitingApproval` | Open tickets waiting for human approval |
| `requireManualProcessing` | Open tickets needing manual work despite an agent match |
| `customerCorrectlyIdentified` | Customer identification accuracy over time |
| `correctlyCategorizedWithTags` | Tag assignment accuracy over time |
| `textAssistantAccuracy` | Text suggestion accuracy |
| `autoProcessing` | Auto-processed count: L4 (with approval) + L5 (autonomous) |
| `automationLevel` | Daily distribution across L0-L5 |
| `aiAgentsForManualProcessing` | Ids of the non-base agents counted in the manual-processing figure |

## Top AI Agents

```bash
curl -s "${BASE}/report/topAiAgentsPerformance?lastDays=14" -H "${AUTH}"
```

Own endpoint (it is **not** part of `aiPerformance`). Returns `{ data: [...] }`, the 15 busiest agents by processed sessions, each with `aiAgentData` (`agentId`, `name`, `appearance`, `intelligence`, `outputHandlingCases` — populated for rule-based agents only), `processed`, `awaitingApproval`, and the six per-agent metrics below.

## AI Agent Performance (Specific Agent)

```bash
curl -s "${BASE}/report/aiAgentPerformance/{aiAgentId}?lastDays=14" -H "${AUTH}"
```

Params: `lastDays`, `outputHandlingCase` (filter to one response case of a rule-based agent).

| Metric | Description |
|--------|-------------|
| `avgHandlingTimeHuman` | Average handling time for human cases (L2+L3) |
| `autoProcessingShare` | Share of auto-processed (L4+L5) out of all cases worked |
| `autoProcessingApprovalRate` | Approved vs (approved + sent to manual) |
| `autoProcessingSuccessRate` | Attempts that finished without a backend or agent-code error |
| `approvalTimeL4` | Average time to approve an L4 case |
| `autoProcessingErrorRate` | Share of cases with errors |

Each carries a `summary` with the current window plus the `previous*` values for the immediately preceding window of the same length.

---

## Telephony Detail Reports

Per-entity drill-downs, each with its own `reportTelephony*` permission:

```bash
curl -s "${BASE}/report/telephonyLine/{lineId}" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAgent/{agentId}" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAgentPerformance/{agentId}?lastDays=30" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAgentCallInsights/{agentId}?lastDays=30" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgent/{aiAgentId}" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgentPerformance/{aiAgentId}?lastDays=30" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgentCallInsights/{aiAgentId}?lastDays=30" -H "${AUTH}"
```

`telephonyPerformance` (and its per-agent variants) return `answeredCalls`, `missedCalls`, `reachability`, `asa`, `aht`, `sla`.
`telephonyCallInsights` returns `aiHandledVsHuman`, `detectedIntents`, `callsAnsweredByHour`.

Per-call raw data (durations, stages, cost, decline reasons) is not a report — use `GET /export/callLog`.

## Report Structure

```bash
curl -s "${BASE}/report/structure" -H "${AUTH}"
```

Returns the dashboard widget layout the caller is allowed to see: one entry per widget with its `filterOptions` / `filterDefaults`. Read this first to learn which report codes and filter values are actually available for this user.

---

## Worklog Fields Behind the Numbers

Every AI and handling-time metric is aggregated from work sessions. To rebuild them, pull the rows via `GET /export/reporting_worklog` or `GET /export/aiAgentPerformance` (see the `exports` skill).

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
| `skippedTicket` | Whether the ticket was skipped |
| `netSecondsClosedAfterSLA` | Negative = closed before the SLA deadline |
