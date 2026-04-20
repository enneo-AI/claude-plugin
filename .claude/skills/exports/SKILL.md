# Data Exports

## Trigger
Use when the user wants to export tickets, worklogs, messages, surveys, quality assessments, or other data.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Export Reporting Tickets

```bash
curl -s "${BASE}/export/reporting_tickets?format=json&limit=100&offset=0&orderByField=createdAt&orderByDirection=desc" -H "${AUTH}"
```

With filters:
```bash
curl -s "${BASE}/export/reporting_tickets?format=json&limit=100&filters[0][key]=createdAt&filters[0][comparator]=between&filters[0][from]=2026-01-01&filters[0][to]=2026-04-20&filters[1][key]=status&filters[1][comparator]=in&filters[1][values][]=closed" -H "${AUTH}"
```

### Reporting ticket fields
`id`, `channel`, `direction`, `status`, `priority`, `contractId`, `customerId`, `customerLegitimation`, `topic`, `subTopic`, `allTags`, `incomingMessages`, `outgoingMessages`, `internalMessages`, `createdAt`, `closedAt`, `modifiedAt`, `dueBy`, `lastMessageAt`, `secondsToClose`, `secondsClosedAfterSLA`, `email`, `rawData`

Privacy: `email` and `rawData` omitted when `reportingPrivacyLevel` is `pseudonymized`.

## Export Messages

```bash
curl -s "${BASE}/export/reporting_messages?format=json&limit=100" -H "${AUTH}"
```

## Export Worklogs

```bash
curl -s "${BASE}/export/reporting_worklog?format=json&limit=100&orderByField=duration&orderByDirection=desc" -H "${AUTH}"
```

### Worklog fields
`date`, `name`, `ticketId`, `conversationId`, `userId`, `action` (closeAction/readAction/statusAction/writeAction/autoProcessAction), `duration`, `durationAfterWork`, `reOpened`, `status`, `aiAgent`, `topic`, `subTopic`, `allTags`, `channel`, `department`, `teams`, `email`, `aiAutomationLevel` (0-5), `customerIdentifiedCorrectly`, `tagsIdentifiedCorrectly`, `textAssistanceAccuracy`, `aiAgentsUsed`, `skippedTicket`, `netSecondsClosedAfterSLA`, `pendingSeconds`, `timesSetToOpen`

## Export Surveys

```bash
curl -s "${BASE}/export/survey?format=json" -H "${AUTH}"
```

Fields: `id`, `audience`, `scale`, `answerStars`, `createdAt`, `submittedAt`

## Export Users

```bash
curl -s "${BASE}/export/users?format=json" -H "${AUTH}"
```

## Export Quality Assessments

```bash
curl -s "${BASE}/export/qualityAssessments?format=json" -H "${AUTH}"

# With filters
curl -s "${BASE}/export/qualityAssessments?format=xlsx&scorecardId=1&from=2026-01-01&to=2026-04-20" -H "${AUTH}"
```

Multi-sheet XLSX: when `scorecardId` omitted, generates one sheet per scorecard.

## Export Knowledge Sources

```bash
curl -s "${BASE}/export/knowledgeSources/all" -H "${AUTH}" -o knowledge.pdf
curl -s "${BASE}/export/knowledgeSources/faq" -H "${AUTH}" -o faq.pdf
```

## Export Message Samples (AI Training Data)

```bash
curl -s "${BASE}/export/messageSamples?format=json" -H "${AUTH}"
```

## Custom Data Export

Pre-configured SQL exports with dynamic parameters:

```bash
curl -s "${BASE}/export/customData?exportId=0&format=json&customerId=12345&limit=100" -H "${AUTH}"
```

---

## Formats
- `json` — JSON array (recommended for API consumption)
- `csv` — CSV file
- `xlsx` — Excel spreadsheet

## Async Exports
Large exports (>1000 rows xlsx, >300000 rows csv/json) are processed **asynchronously** — the file is delivered to the user's email address.

## Filter Reference

All export endpoints support:
- `filters[N][key]` — column name
- `filters[N][comparator]` — `=`, `!=`, `>`, `<`, `>=`, `<=`, `between`, `in`
- `filters[N][value]` — single value
- `filters[N][from]` / `filters[N][to]` — for `between`
- `filters[N][values][]` — for `in`
