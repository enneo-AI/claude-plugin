# Ticket Management

## Trigger
Use when the user wants to investigate, search, create, update, or manage tickets and conversations.

## Quick Reference

```bash
. ~/.enneo/env   # loads ENNEO_INSTANCE + ENNEO_TOKEN from OAuth-persisted credentials
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Get a Single Ticket (Full Data)

```bash
curl -s "${BASE}/ticket/{ticketId}" -H "${AUTH}" | jq '{id, status, channel, direction, priority, subject, from, contractId, customerId, aiSupportLevel, tags: [.tags[]?.name], createdAt, modifiedAt}'
```

- `?refresh=true` — re-run AI processing (analyze, tags, agents, parameters)
- `?erpCacheOnly=true` — skip external ERP calls (faster for bulk fetches)

Full data includes: body, bodyPlain, bodyClean, attachments, intents, template, customer object.

## Search Tickets

```bash
curl -s -X POST "${BASE}/ticket/search" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "filters": [
      {"key": "t.status", "values": ["open"], "comparator": "in"},
      {"key": "t.channel", "values": ["email"], "comparator": "in"}
    ],
    "limit": 20, "offset": 0,
    "orderByField": "t.createdAt",
    "orderByDirection": "desc"
  }'
```

**Note:** Search returns COMPACT data — excludes body, attachments, template, workitem. Use `GET /ticket/{id}` for full data.

### Filter keys

| Key | Values | Notes |
|-----|--------|-------|
| `t.status` | open, closed, pending, resolved, waitingOnCustomer, waitingOnThirdParty | |
| `t.channel` | email, phone, chat, letter, portal, system, walkIn | `all` = no filter |
| `t.direction` | in, out, internal | |
| `t.priority` | low, medium, high, urgent | |
| `t.createdAt` | dates | `between` with `from`/`to` |
| `t.modifiedAt` | dates | |
| `t.lastMessageAt` | dates | |
| `t.lastCustomerMessageAt` | dates | |
| `t.agentId` | user ID | assigned agent |
| `t.contractId` | contract ID | |
| `t.customerId` | customer ID | |
| `t.aiSupportLevel` | unprocessed, noDetection, customerDetected, agentAssist, automated, full | |
| `tt.tagId` | tag IDs | `in` with array |
| `i.aiAgentId` | agent ID | filter by AI agent |
| `t.sentiment` | | |
| `t.language` / `t.languageCode` | | |
| `t.from` | email address | |

### Comparators
`=`, `!=`, `>`, `<`, `>=`, `<=`, `in` (with `values` array), `between` (with `from`/`to`), `like`

---

## Conversations

```bash
# List all conversations for a ticket
curl -s "${BASE}/ticket/{ticketId}/conversation" -H "${AUTH}" | jq '.conversations[] | {id, direction, from, createdAt, private, body: (.body[:200])}'

# Include raw data
curl -s "${BASE}/ticket/{ticketId}/conversation?includeRawData=true" -H "${AUTH}"

# Get specific conversation
curl -s "${BASE}/ticket/{ticketId}/conversation/{conversationId}" -H "${AUTH}"
```

### Reply to Ticket (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/conversation/reply" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "content": {"message": "Reply text here"},
    "type": "text",
    "direction": "out"
  }'
```

- `"private": true` for internal notes
- `"isDraft": true` for drafts requiring supervisor approval
- `"to": ["email@example.com"]` to override recipients
- `"cc"`, `"bcc"` for carbon copy
- `"attachments"` for file attachments

### Store Conversation (REQUIRES CONFIRMATION)

Store without sending (e.g., receiving an external reply):

```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/conversation/store?process=batch" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "direction": "in",
    "from": "customer@example.com",
    "body": "Customer reply",
    "subject": "RE: Original subject"
  }'
```

Process modes: `realtime`, `batch`, `false`

---

## Activity Log (Key for Debugging)

```bash
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"
```

**This is the single most useful endpoint.** Shows complete processing timeline: customer identification, tag detection, agent selection, routing, dark processing decisions, errors.

## Ticket Variables

```bash
curl -s "${BASE}/ticket/{ticketId}/variables" -H "${AUTH}"
```

## Ticket History (Customer Timeline)

```bash
curl -s "${BASE}/ticket/{ticketId}/history" -H "${AUTH}"
```

Returns all interactions for the customer/contract: tickets, grid messages, deliveries, payments.

## Intents (AI Agent Results)

```bash
curl -s "${BASE}/intent/byTicketId/{ticketId}" -H "${AUTH}" | jq '{aiOutcome, intentsFound, intents: [.intents[] | {id, aiAgentId, aiAgentName, status, data}]}'
```

`aiOutcome` values: `noDetection`, `customerDetected`, `agentAssist`, `full`

---

## Create a Ticket (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/ticket?process=batch" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "from": "customer@example.com",
    "subject": "Subject line",
    "body": "<p>Email body HTML</p>",
    "status": "open",
    "priority": "low"
  }'
```

Optional fields: `to`, `cc`, `bcc`, `subchannelId`, `tags` (array of IDs), `contractId`, `externalTicketId`, `rawData`, `attachments`, `templateId`, `templateData`, `createdAt`, `firstResponseDueBy`, `dueBy`.

Process modes: `realtime` (sync AI), `batch` (async AI), `false` (no AI).

## Update a Ticket (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/ticket/{ticketId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"status": "closed"}'
```

Updatable: `status`, `priority`, `contractId`, `workedOnBy`, `dueBy`, `firstResponseDueBy`, `tagIds` (replace all), `addTagIds`/`removeTagIds` (modify).

Add `?includeInWorklog=false` to exclude from time tracking (e.g., spam).

## Bulk Update (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/ticket" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '[{"id": 1, "status": "closed"}, {"id": 2, "status": "closed"}]'
```

## Forward (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/forward" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"body": "Please handle this", "toEmail": "external@example.com", "subject": "Custom subject"}'
```

## Auto-Execute (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/autoprocess?executeAgentId={aiAgentId}" -H "${AUTH}"
```

## Stats

```bash
curl -s "${BASE}/ticket/stats" -H "${AUTH}"
```

Returns: total open tickets, breakdown by intents, groups, and tags.

---

## Ticket Lifecycle

```
Incoming message → Ticket created (status: open)
  → AI processing (tags, agent detection, parameters)
  → Routing (skill-based, SLA-based)
  → Agent works ticket → Reply/Close
  → Customer replies → Ticket reopened → Re-process
```

### Statuses
- `open` — active, awaiting action
- `pending` / `waitingOnCustomer` / `waitingOnThirdParty` — waiting states
- `closed` — resolved
- `resolved` — resolved (alternative)

### AI Support Levels
- `unprocessed` — not yet analyzed
- `noDetection` — AI found nothing useful (L0)
- `customerDetected` — customer identified only (L1)
- `agentAssist` — AI suggests but needs human (L2/L3)
- `automated` — auto-processable (L4/L5)
- `full` — fully resolved by AI
