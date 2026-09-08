---
name: exports
description: Use when the user wants to export tickets, worklogs, messages, surveys, call logs, AI insights, quality assessments, or other data.
---

# Data Exports

## Trigger
Use when the user wants to export tickets, worklogs, messages, surveys, call logs, AI insights, quality assessments, or other data.

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

## Two ways to read an export

| Call | Returns |
|------|---------|
| `GET /export/<key>` (or a dedicated path below) | The **file** — a download stream in `format`, or an async confirmation |
| `GET /export/<key>/preview` | **JSON page** — `{ data, total, columns, availableFilters }` |

Preview is the one to use when you want data in the conversation. `limit` defaults to 30 and is capped at 500; `offset` pages. Preview applies the same permission and privacy gating as the download.

Preview is available for: `reporting_tickets`, `reporting_messages`, `reporting_worklog`, `survey`, `aiAgentPerformance`, `qualityAssessments`, `aiInsights`, `callLog`. Any other key → 400.

## Generic export keys

`GET /export/{key}` accepts only `reporting_tickets`, `reporting_messages`, `reporting_worklog`, `survey` (raw reporting tables) and `ticket` (the backlog query with its filter syntax). Anything else returns **400 Unknown export key** — the other datasets have their own paths.

```bash
# Preview (JSON, recommended)
curl -s "${BASE}/export/reporting_tickets/preview?limit=50&offset=0" -H "${AUTH}"

# Download
curl -s "${BASE}/export/reporting_tickets?format=json&limit=100&offset=0" -H "${AUTH}"

# With filters
curl -s "${BASE}/export/reporting_tickets?format=json&limit=100&filters[0][key]=createdAt&filters[0][comparator]=between&filters[0][from]=2026-01-01&filters[0][to]=2026-04-20&filters[1][key]=status&filters[1][comparator]=in&filters[1][values][]=closed" -H "${AUTH}"
```

### `reporting_tickets` fields
`id`, `channel`, `direction`, `status`, `spamStatus`, `priority`, `agentId`, `contractId`, `customerId`, `customerLegitimation`, `topic`, `subTopic`, `allTags`, `incomingMessages`, `outgoingMessages`, `internalMessages`, `manualWorkEntries`, `createdAt`, `closedAt`, `modifiedAt`, `dueBy`, `lastMessageAt`, `lastCustomerMessageAt`, `secondsSinceLastCustomerMessage`, `secondsToClose`, `secondsClosedAfterSLA`, `email`, `rawData`

### `reporting_messages` fields
`id`, `ticketId`, `conversationId`, `channel`, `direction`, `rawData`, `createdAt`

### `reporting_worklog` fields
`date`, `name`, `ticketId`, `conversationId`, `userId`, `action` (closeAction/readAction/statusAction/writeAction/autoProcessAction), `duration`, `durationAfterWork`, `reOpened`, `reopenedAt`, `status`, `aiAgent`, `topic`, `subTopic`, `allTags`, `tags`, `channel`, `department`, `teams`, `email`, `rawData`, `aiAutomationLevel` (0-5), `customerIdentifiedCorrectly`, `tagsIdentifiedCorrectly`, `textAssistanceAccuracy`, `aiAgentsUsed`, `skippedTicket`, `netSecondsClosedAfterSLA`, `closingDateForSLA`, `statusActionDetail`, `pendingDueBy`, `pendingSeconds`, `netPendingSeconds`, `firstPendingAt`, `timesSetToOpen`, `userWorklogId`

`orderByField` on this export accepts **only** `date` or `userWorklogId` — anything else is refused with 400, because only those are index-backed. Other raw exports accept any column name.

### `survey` fields
`id`, `audience`, `scale`, `ticketId`, `conversationId`, `answerStars`, `answerText`, `agentId`, `createdAt`, `submittedAt` — plus `customerId`, `contractId`, `externalTicketId` (correlated from the rated ticket, so a satisfaction report is joinable to the case; omitted under pseudonymization).

Only **submitted** surveys are exported — an unanswered invitation is not a result.

## Dedicated export endpoints

| Endpoint | Permission | Notes |
|----------|-----------|-------|
| `GET /export/callLog` | `exportData` | Per-call telephony log with stages. `from`/`to` (default last 7 days), `status`, `subchannelId`, `primaryTagId`, `assignedUserId`, `category` |
| `GET /export/qualityAssessments` | `qualityViewAssessmentAll` | See below |
| `GET /export/aiInsights` | `exportData` | Wide: one row per ticket, one value + one confidence column per active question. `from`/`to` (on `closedAt`), `subchannelId` |
| `GET /export/aiAgentPerformance` | `reportAiPerformance` | Worklog-level source rows behind the AI performance report. `from`/`to` or `lastDays`, `aiAgentId` / `aiAgentIds[]` |
| `GET /export/users` | `exportUserProfiles` | User profiles and permissions |
| `GET /export/conversations` | `exportConversation` | Ticket + conversation training data. `limit`, `offset`, `minTicketId`, `channel` (comma-separated) |
| `GET /export/messageSamples` | `exportTickets` | AI training samples from Cortex, ticket ids hashed |
| `GET /export/customData` | `exportData` | Pre-configured SQL exports — `exportId` plus that export's own `{placeholder}` parameters |
| `GET /export/gdprPrivateData` | `exportData` | GDPR Art. 15 disclosure. `contractId` / `customerId` / `email`; `format=markdown` (default) or `html` |
| `GET /export/knowledgeSources/{type}` | `exportData` | PDF; `{type}` = `all` or a knowledge-source type |

```bash
curl -s "${BASE}/export/callLog?format=json&from=2026-08-01&to=2026-08-31" -H "${AUTH}"
curl -s "${BASE}/export/aiInsights/preview?from=2026-08-01&to=2026-08-31&limit=50" -H "${AUTH}"
curl -s "${BASE}/export/customData?exportId=0&format=json&customerId=12345&limit=100" -H "${AUTH}"
curl -s "${BASE}/export/knowledgeSources/all" -H "${AUTH}" -o knowledge.pdf
```

## Quality assessments export

```bash
curl -s "${BASE}/export/qualityAssessments?format=json&from=2026-01-01&to=2026-04-20" -H "${AUTH}"
curl -s "${BASE}/export/qualityAssessments?format=xlsx&scorecardId=1" -H "${AUTH}" -o qa.xlsx
```

- Params: `scorecardId`, `from`, `to`, `reviewedUserId`, `reviewerUserId`, `limit`, `offset`, `orderByField`, `orderByDirection`.
- `scorecardId` resolves to the scorecard's `baseId`, so **all revisions** of that scorecard land in one sheet, with a `Scorecard Revision` column.
- `format=xlsx` without `scorecardId` → multi-sheet workbook, one sheet per scorecard.
- Columns: Date, Assessment Date, Scorecard Revision, Assessment ID, Reviewed Agent, Reviewer (`AI` when never human-reviewed), State, State ID, Ticket ID, Total Score, Total Score (%) — then one column per criterion, then one `<category> - Total Score (%)` per category. Conversation ID / user IDs need a non-pseudonymized instance; the email columns need `viewSensitiveDataInExport`.
- Assessments in `unprocessed`, `aiInProgress`, `error` and `deleted` states are excluded.
- `filters[]` here only accepts key `createdAt` (or the column labels `Datum` / `Date`) with comparator `between`, `>=` or `<=`; `orderByField` only `createdAt`/`id` (or their labels). Anything else → 400, never silently dropped.

---

## Formats
- `json` — JSON array (recommended for API consumption)
- `csv` — CSV file
- `xlsx` — Excel spreadsheet

Omitting `format` uses the instance's `defaultDateExportFormat` setting. The legacy `specification` value is rejected with 400 — use `json`.

## Async exports
Large exports are queued and the file is **emailed** to the calling user: over 1,000 rows for `xlsx`, or over 300,000 rows for `csv`/`json`. The HTTP response is a confirmation message, not a file. Prefer `/preview` or a `limit` when you just want to look at data.

## Filter reference (raw-table exports)

- `filters[N][key]` — column name (validated against `[a-zA-Z0-9_.]`)
- `filters[N][comparator]` — `=`, `!=`, `>`, `<`, `>=`, `<=`, `between`, `in`
- `filters[N][value]` — single value
- `filters[N][from]` / `filters[N][to]` — for `between`
- `filters[N][values][]` — for `in`

A date-only bound (`YYYY-MM-DD`) on `between`'s `to` or on `<=` is extended to `23:59:59`, so it stays inclusive on datetime columns.

Ordering: `orderByField` + `orderByDirection` (`asc`/`desc`). When a page (`limit`/`offset`) is requested, `id` is always appended as a tiebreaker, and a request with no `orderByField` is served in `id ASC` order so paging is reproducible.

## Privacy gating

The `reportingPrivacyLevel` setting decides which columns an export may contain:

| Level | Effect |
|-------|--------|
| `full` | All columns |
| `partiallyPseudonymized` | `email` hidden unless the caller has `viewSensitiveDataInExport` |
| `pseudonymized` / `none` | `email` and `rawData` dropped; ticket/conversation/user ids dropped from worklog; worklog `date` truncated to day |

Free-form AI text (LLM reasoning, summaries quoting a conversation) is deliberately **not** in any bulk export — for example the AI insights export ships values and confidence scores but never the `reasoning`. Read that per ticket instead (`GET /ticket/{ticketId}/aiInsight`).
