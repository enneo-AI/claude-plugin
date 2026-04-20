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

---

## Search Events

```bash
curl -s -X POST "${BASE}/event/search?limit=10&includeTraces=true&format=raw&orderByField=e.createdAt&orderByDirection=desc" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}'
```

### Filter combinations

```bash
# Events for a ticket in a date range
'{"filters":[
  {"key":"e.ticketId","value":"123","comparator":"="},
  {"key":"e.createdAt","comparator":"between","from":"2026-04-01","to":"2026-04-20"}
]}'

# Events by type
'{"filters":[
  {"key":"e.type","values":["cortexProcessTicket","ticketUpdated","ticketRouted"],"comparator":"in"},
  {"key":"e.ticketId","value":"123","comparator":"="}
]}'

# Full-text search across JSON fields (requires at least one other filter)
'{"filters":[
  {"key":"e.ticketId","value":"123","comparator":"="},
  {"key":"q","comparator":"equal","value":"search term"}
]}'
```

### Filter keys
`e.id`, `e.type`, `e.subType`, `e.contractId`, `e.ticketId`, `e.status`, `e.createdAt`, `e.createdBy`

### Common event types
`cortexProcessTicket`, `ticketCreated`, `ticketUpdated`, `ticketRouted`, `ticketResponse`, `conversationCreated`, `autoProcessIntent`, `sendEmail`, `ticketForwarded`, `ticketClosedDueToInactivity`

### Format options
- `formatted` (default) — human-readable with activity descriptions
- `raw` — raw database objects with decoded JSON fields

---

## Analyzing Large Traces with jq

Event traces can be 250KB+. Extract key sections:

```bash
# Store the response
TRACE=$(curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["cortexProcessTicket"],"comparator":"in"}]}')

# A) Event overview
echo "$TRACE" | jq '.events[] | {id, type, status, duration, ticketId, contractId}'

# B) Input (what the customer sent)
echo "$TRACE" | jq '.events[0].data | {sender, subject, channel, date, body}'

# C) All trace types (table of contents)
echo "$TRACE" | jq '[.events[0].traces[] | {type, activity}]'

# D) LLM calls — models used & responses
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "llm") | {activity, model: .data.model, generationName: .data.generationName, duration, response: .outcome.message}]'

# E) Contract detection & legitimation
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "contractDetection") | {activity, data, detectionLog: .outcome.detectionLog}]'

# F) User-defined code executions
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "sourceCode") | {activity, name: .data.name, outcome: .outcome}]'

# G) AI processing log (read chronologically)
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "aiProcessing") | .data.msg]'

# H) Auto-processing evaluation
echo "$TRACE" | jq '[.events[0].traces[] | select(.type == "autoProcessing") | {activity, success: .data.success, candidates: .data.candidates, message: .data.message}]'

# I) Outcome alerts (warnings, overrides)
echo "$TRACE" | jq '[.events[0].outcome.alerts[] | {code, severity, message}]'

# J) Detected intents & results
echo "$TRACE" | jq '[.events[0].outcome.detectedIntents[] | {aiAgentId, responses: [.responses[] | {type, options: .content.options, data: .content.data}]}]'

# K) Final ticket state
echo "$TRACE" | jq '.events[0].outcome.ticket | {summary, action, aiSupportLevel, closeTicket, direction}'
```

---

## Trace Type Reference

| Type | What it tells you | Key fields |
|------|-------------------|------------|
| `llm` | LLM call during processing | `model`, `generationName` (purpose), `response`, `duration` |
| `contractDetection` | Customer identification | `detectionLog` (step-by-step legitimation) |
| `sourceCode` | User-defined code execution | `name`, `outcome.output`, `outcome.exitCode`, `outcome.stderr` |
| `aiProcessing` | Internal processing log | `.data.msg` (read chronologically) |
| `autoProcessing` | Auto-processing feasibility | `success`, `candidates`, `message` (blocking reason) |

### Key `generationName` values in LLM traces
- `analyze_ticket` — initial ticket analysis (sentiment, language, summary)
- `validate_ticket_ai_tags` — tag detection/classification
- `validate_ticket_ai_agent` — agent detection scores
- `extract_ticket_parameters_with_ai_{id}` — parameter extraction for agent
- `detect_ai_agents` — which agents were candidates

### Event Outcome Structure

```
outcome:
  alerts: [{code, severity, message}]          # Warnings and overrides
  detectedIntents: [{aiAgentId, responses}]    # AI agents triggered
  ticket: {summary, aiSupportLevel, closeTicket} # Final state
```

---

## Preview What Cortex Would Receive

```bash
curl -s "${BASE}/experimental/cortex/ticket/{ticketId}/request" -H "${AUTH}"
```

Read-only — shows the payload Mind would send to Cortex: `message`, `body`, `history`, `subject`.

---

## Direct SQL Queries (Read-Only)

For advanced investigation (may require SSH to supportbot for production):

```bash
curl -s "${BASE}/internal/query?q=SELECT+id,type,status,duration,createdAt+FROM+event+WHERE+ticketId={ticketId}+ORDER+BY+id+DESC+LIMIT+10" -H "${AUTH}"
```

Key tables: `event`, `event_trace`, `ticket`, `conversation`, `intent`, `ai_agent`, `tag_description`, `ticket_tag`, `settings`
