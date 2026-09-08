---
name: events
description: Use when the user wants to search events, analyze processing traces, debug the AI pipeline, or understand what happened during ticket processing.
---

# Event Trace Analysis & Debugging

## Trigger
Use when the user wants to search events, analyze processing traces, debug the AI pipeline, or understand what happened during ticket processing.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they handle OAuth transparently and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

The MCP server writes all credentials (instance + access/refresh tokens) to `~/.enneo/env`. Source it to use curl directly:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

All event endpoints require the `events` permission. Reading an event or a trace that belongs to a
ticket also re-checks that ticket's required-skill tags — a 403 here is a visibility answer, not a
missing event (see the `troubleshooting` skill, "Can't see a ticket").

---

## Search Events

`POST /event/search` is **read-only** despite the verb.

```bash
curl -s -X POST "${BASE}/event/search?limit=10&includeTraces=true&format=raw&orderByField=e.createdAt&orderByDirection=desc" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}'
```

- `limit` — default 20, capped at 500.
- `includeTraces` — default **false**; you almost always want `true`.
- Sorting on a non-indexed combination silently falls back to `e.createdAt` once the filtered set
  exceeds 10 000 rows. The response then carries `warnings[].type = "sort-field-changed"` — check it
  before trusting the order.

### Filter combinations

```bash
# Events for a ticket in a date range
'{"filters":[
  {"key":"e.ticketId","value":"123","comparator":"="},
  {"key":"e.createdAt","comparator":"between","from":"2026-09-01","to":"2026-09-08"}
]}'

# Events by type
'{"filters":[
  {"key":"e.type","values":["cortexProcessTicket","ticketUpdated","ticketRouted"],"comparator":"in"},
  {"key":"e.ticketId","value":"123","comparator":"="}
]}'

# Relative dates work in `from`/`to` and in `value`: "-7 DAY", "-2 HOUR", "CURRENT_DATE"
'{"filters":[
  {"key":"e.type","values":["cortexProcessTicket"],"comparator":"in"},
  {"key":"e.createdAt","comparator":"between","from":"-1 DAY","to":"CURRENT_DATE"}
]}'

# Full-text search across the data/outcome/hookOutcome JSON columns
'{"filters":[
  {"key":"e.ticketId","value":"123","comparator":"="},
  {"key":"q","comparator":"equal","value":"search term"}
]}'
```

### Filter keys
`e.id`, `e.type`, `e.subType`, `e.contractId`, `e.ticketId`, `e.status`, `e.createdAt`, `e.createdBy`, `q`

Two rules the API enforces:
- `e.subType` is only accepted **together with** `e.type` (index shape).
- `q` is a `LIKE` over `data`/`outcome`/`hookOutcome` and requires **at least one other** filter.

Conditions repeat with OR inside one key, AND between keys. Comparators: `=`, `!=`, `>`, `<`, `>=`,
`<=`, `in` (uses `values`), `between` / `not between` (use `from`/`to`).

### Status values
`open`, `processing`, `closed`, `error`, `deleted`

### Format options
- `formatted` (default) — human-readable activity descriptions and typed detail labels
- `raw` — database rows; `data`, `outcome` and `hookOutcome` are JSON-decoded, everything else is
  left as stored (notably `aiPhases`, which stays a JSON **string** — pipe it through `fromjson`)

---

## Event Types

`GET /event/getEventTypes` is the authoritative list for the instance you are on (it also reports
which types a client event hook may subscribe to):

```bash
curl -s "${BASE}/event/getEventTypes" -H "${AUTH}" | jq '.[] | {name, triggerableBy}'
```

| Area | Types |
|------|-------|
| Ticket lifecycle | `ticketCreated`, `ticketUpdated`, `ticketRouted`, `ticketResponse`, `ticketForwarded`, `ticketRefresh`, `ticketClosedDueToInactivity`, `ticketDueByOverdue`, `nonAiTicketCreated`, `ticketDeleted` |
| Conversations | `newReply`, `newNote`, `conversationCreated` |
| AI pipeline | `cortexProcessTicket`, `autoProcessIntent`, `contractDetection`, `ocrScanCompleted`, `aiInsightProcess`, `qualityAssessment`, `testTicketAiQuality` |
| Telephony | `callStarted`, `callCompleted`, `agentRoutingStatusChanged` |
| Outbound | `sendEmail`, `sendEmailAutoresponder`, `sendLetter`, `notifySurroundingSystem` |
| Configuration | `settingChanged`, `aiAgentChanged`, `knowledgeSourceChanged`, `scorecardChanged`, `roleManagement`, `profileCreated`, `profileUpdated`, `profileDeleted`, `cacheCleared`, `invalidateUserSettings` |
| System / cron | `cronMinute`, `cronHour`, `cronDay`, `cronWeek`, `archiveOldFiles`, `exportBigList`, `executor`, `staticTranslationPrewarm`, `contentTranslationPrewarm`, `triggerContractSync`, `powercloud-contract-webhook`, `surveySubmitted`, `runNeoRoutineNow`, `aiInsightQuestionChanged` |

Two GDPR-erasure specifics:
- **`ticketDeleted`** is emitted by the hard-delete purge (`DELETE /ticket/{id}`). It deliberately
  carries **no `ticketId`** (the row is gone by then) and only `data.deletedBy` — so filtering on
  `e.ticketId` will never find it. The same purge deletes every `event` and `event_trace` row for
  that ticket, so "no events at all for a ticket that existed" means it was purged.
- **Attachment erasure** (`DELETE /ticket/{id}/attachment/{attachmentId}`) audits as a plain
  **`ticketUpdated`** with `data.attachmentDeleted = "<attachmentId>"`. There is no
  `ticketAttachmentDeleted` type.

---

## Analyzing Large Traces with jq

Event traces can be 250KB+. Extract key sections:

```bash
# Store the response
TRACE=$(curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["cortexProcessTicket"],"comparator":"in"}]}')

# A) Event overview
echo "$TRACE" | jq '.events[] | {id, type, status, duration, ticketId, contractId, traceIdCreation}'

# B) Exactly what Mind sent to Cortex — event.data IS the Cortex request
echo "$TRACE" | jq '.events[0].data | {message, subject, body, channel, history: (.history | length)}'

# C) All trace types (table of contents)
echo "$TRACE" | jq '[.events[0].traces[] | {type, activity, duration}]'

# D) Which cortex pipeline phases ran (aiPhases is a JSON string in raw format)
echo "$TRACE" | jq -r '.events[0].aiPhases' | jq '[.[] | {name, skipped, langfuseObservationId}]'

# E) Contract detection & legitimation
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "contractDetection")
      | {activity, contractIds: .data.contractIds, previous: .data.previousContractId,
         legitimation: .data.customerLegitimation, scanned: .data.scannedSources,
         details: .outcome.details, detectionLog: .outcome.detectionLog}]'

# F) User-defined code executions
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "sourceCode")
      | {activity, name: .data.name, params: .data.params,
         output: .outcome.output, exitCode: .outcome.exitCode, stderr: .outcome.stderr}]'

# G) AI processing log (read chronologically)
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "aiProcessing") | .data.msg]'

# H) Outbound HTTP calls made during processing
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "apiCall") | {activity, duration, outcome}]'

# I) Auto-processing evaluation
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "autoProcessing")
      | {success: .data.success, reasons: .data.message,
         autoExecutable: .data.autoExecutable, candidates: .data.candidates}]'

# J) Outcome alerts (warnings, overrides) — outcome IS the Cortex response
echo "$TRACE" | jq '[.events[0].outcome.alerts[]? | {code, severity, refType, refId, message}]'

# K) Detected intents & results
echo "$TRACE" | jq '[.events[0].outcome.detectedIntents[]? | {aiAgentId, responses: [.responses[]? | {type, options: .content.options, data: .content.data}]}]'

# L) Final ticket state as Cortex returned it
echo "$TRACE" | jq '.events[0].outcome.ticket | {summary, tagIds, isSpam, language, sentiment, traceId}'

# M) Client event-hook input/output, when a hook is configured for this type
echo "$TRACE" | jq '.events[0].hookOutcome'
```

`event.outcome` for a `cortexProcessTicket` event **is** the Cortex response body. A failed run
instead holds `{success:false, message}` — check `.events[0].status == "error"` first.

---

## Trace Type Reference

Valid `event_trace.type` values, in the order the UI tabs them:

| Type | What it tells you | Key fields |
|------|-------------------|------------|
| `contractDetection` | Customer identification, including runs that were skipped or found nothing | `data.contractIds`, `data.previousContractId`, `data.customerLegitimation`, `data.scannedSources`, `outcome.details`, `outcome.detectionLog` |
| `autoProcessing` | Auto-processing feasibility | `data.success`, `data.message` (array of check results, last = blocking reason), `data.autoExecutable`, `data.candidates` |
| `aiProcessing` | Cortex's internal processing log | `data.msg` (read chronologically) |
| `apiCall` | Outbound HTTP call made during processing | `data`, `outcome`, `duration` |
| `sourceCode` | User-defined / agent business-logic execution | `data.name`, `data.params`, `outcome.output`, `outcome.exitCode`, `outcome.stderr` |
| `message` | Plain log line attached to the event | `data` |
| `root` | Container node for nested traces | — |

**There is no `llm` trace type.** Per-LLM-call traces (prompt, model, token counts, `generationName`)
were removed from `event_trace`; that detail now lives only in Langfuse. What Mind keeps instead:

- `event.aiPhases` — the phases the Cortex pipeline ran, each with `name`, `skipped` and
  `langfuseObservationId`. Phase names: `summary_and_text`, `customer_identification`,
  `tag_detection`, `agent_detection`, `agent_execution`, `briefing`.
- `event.traceIdCreation` — the Langfuse/SigNoz trace id for the whole run. The activity log renders
  it as a single **Langfuse** link, but only for Enneo-internal profiles; the field itself is in
  `format=raw` for everyone with the `events` permission.
- `ticket.cortexRequestId` — the same trace id, persisted on the ticket.

The set of phases also drives the human-readable activity label ("triggered a full AI processing",
"refreshed tags", "refreshed individual AI agent", …), so the label tells you the refresh scope.

---

## Retention — 30 days, and then it's gone

- **Technical events** older than 30 days keep their row but have `data` and `outcome` set to `NULL`
  and the separate `archived` column flipped to `archived`. User-visible activity events keep their
  payload.
- **`event_trace` rows** older than 30 days are **deleted outright**.

So an old event with a null `outcome` and no traces is expected, not a bug. Neither events nor
traces are storage — anything that had to survive a month lives in a real table.

One more caveat when reading an outcome: an event can occasionally be processed twice, and the
losing pass overwrites the recorded `outcome` while the row keeps the **first** pass's trace id. A
null or failed `outcome` on an event whose side effects clearly succeeded is that symptom — check
the traces rather than the outcome.

---

## Event Hooks

Client-configured executors that run on a chosen event type. They live in the `eventHooks` setting
and need the `eventHooks` permission (not `events`):

```bash
curl -s "${BASE}/settings/event-hook" -H "${AUTH}" | jq '.eventHooks[] | {id, name, description}'
```

Add — `POST /settings/event-hook` with `{"name":"<EventClassName>"}` **(REQUIRES CONFIRMATION)** —
and delete — `DELETE /settings/event-hook/{id}` **(REQUIRES CONFIRMATION)**. The `name` must be one
of the class names returned by `GET /event/getEventTypes` whose `triggerableBy` is non-empty.

A hook's input is the event's `data` verbatim; its result lands in `event.hookOutcome` and is
searchable via the `q` filter.

---

## Direct SQL Queries (Read-Only)

```bash
curl -s "${BASE}/internal/query?q=SELECT+id,type,status,duration,createdAt+FROM+event+WHERE+ticketId={ticketId}+ORDER+BY+id+DESC+LIMIT+10" -H "${AUTH}"
```

Only `SELECT`, `DESCRIBE` and `EXPLAIN` are accepted. **Two hard gates:** the caller needs the
`enneoAdmin` permission, *and* the request must originate from a private IP — from the public
internet it answers 403 regardless of the token. In practice this means running it from inside the
cluster (e.g. via supportbot), not from a laptop.

Key tables: `event`, `event_trace`, `ticket`, `ticket_tags`, `conversation`, `intent`, `ai_agent`,
`tag_description`, `settings`.
