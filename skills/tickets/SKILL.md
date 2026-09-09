---
name: tickets
description: Use when the user wants to investigate, search, create, update, or manage tickets and conversations.
---

# Ticket Management

## Trigger
Use when the user wants to investigate, search, create, update, or manage tickets and conversations.

## MCP Tools (preferred)

| Tool | Purpose |
|------|---------|
| `enneo_ticket_get` | Ticket by ID — body, tags, attachments, reply template, customer and intents. Pass `refresh: true` to re-run AI. |
| `enneo_ticket_search` | Search by filters (status, channel, tags, dates, etc.). Returns compact rows. |

Use these in preference to raw curl. They handle OAuth transparently and return typed JSON.

**Caveat:** `enneo_ticket_get` counts as a human ticket-open — it records `workedOnBy`, starts time
tracking and can trigger an ERP contract refresh, because Mind defaults `viewing` to `true` and the
tool does not override it. When you are only investigating, prefer curl with `?viewing=false`, which
hides nothing and writes nothing. Conversations are not in the result either way; they come from
`/ticket/{id}/conversation`.

## curl Reference

The MCP server writes all credentials (instance + access/refresh tokens) to `~/.enneo/env`. Source it to use curl directly:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Get a Single Ticket

```bash
curl -s "${BASE}/ticket/{ticketId}?viewing=false&includeCustomer=true&includeIntents=true" -H "${AUTH}" \
  | jq '{id, status, channel, direction, priority, subject, from, contractId, customerId, customerLegitimation, aiSupportLevel, spamStatus, languageCode, tags: [.tags[]?.name], createdAt, modifiedAt}'
```

Ticket fields are at the **top level** of the response (plus `success: true`).

Query params:

| Param | Default | Effect |
|---|---|---|
| `viewing` | `true` | `true` records the open: adds you to `workedOnBy`, starts time tracking, embeds NEO sessions. Pass `false` for investigation — it hides nothing. |
| `includeCustomer` | `false` | Full ERP `customer` object. Without it, `customer` holds only `{tagIds, tags}`. |
| `includeIntents` | `false` | `intents` array. Without it the key is stripped. |
| `includeRawData` | `false` | Source payload from the originating system. |
| `includeSessions` | follows `viewing` | NEO sessions on the ticket. |
| `erpCacheOnly` | `false` | Skip external ERP calls (faster for bulk fetches). |
| `refresh` | `false` | Wipe + re-import from ERP and re-run the full AI pipeline. Requires the `refreshFull` permission. |
| `contentTranslationLanguage` | — | Reading language for content translation. |

Always includes: `body`, `bodyPlain`, `bodyClean`, `attachments`, `template`, `contentTranslation`,
`emailSubchannelId`, `replyRecipients`, `tags`, and `workitem` (system-channel tickets only).

For a partial re-run instead of the full `?refresh=true`, use `PATCH` with `refreshMode` (below).

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

Returns `{tickets: [...], total, offset, limit, success}`.

- `limit` default 100, capped at 500. `orderByField` default `t.id`, `orderByDirection` default `desc`.
- `ticketScope`: `all` (default) or `skills` — `skills` is the routing/queue view: it additionally
  drops spam and non-routing-relevant tags.
- Search returns **compact** rows — no `body`, `bodyPlain`, `attachments`, `template`, `workitem`.
  Tags and intents *are* included, plus `callDurationSeconds` for phone tickets. Use
  `GET /ticket/{id}` for the rest.

### Filter keys

Set-valued keys (`in` / `not in`, pass `values: []`) — the same keys also accept a scalar
comparator with `value`:

| Key | Notes |
|-----|-------|
| `t.id` | ticket id |
| `t.status` | `open`, `pending`, `closed` — **that is the whole enum** |
| `t.channel` | `email`, `phone`, `chat`, `letter`, `portal`, `system`, `walkIn`. `all` = no filter |
| `t.channelId` / `t.subchannelId` | |
| `t.direction` | `in`, `out`, `internal` |
| `t.priority` | `low`, `medium`, `high`, `urgent` |
| `t.agentId` | assigned agent. Also accepts `["unassigned"]` and `["team"]`. Filtering on anyone but yourself needs `filterTicketsOfColleagues` |
| `t.customerId` / `t.contractId` / `t.partnerId` | |
| `t.isCustomerActive` | chat presence |
| `t.aiSupportLevel` | `unprocessed`, `human`, `bot`, `automated` |
| `t.spamStatus` | `auto_spam`, `auto_programmatic`, `manual_spam`, `auto_clean`, `manual_clean` |
| `t.sentiment` | e.g. `positive`, `neutral`, `negative` |
| `t.language` / `t.languageCode` | `"English"` vs `"en"` — both columns exist |
| `t.from` | sender email address |
| `t.externalTicketId` | id in the source ticketing system |
| `t.modelRunAt` | when Cortex last ran |
| `i.aiAgentId` | AI agent behind an intent |
| `tt.tagId` | tag ids |
| `w.id` | workitem id |

Date keys (`=`, `!=`, `>`, `<`, `>=`, `<=` with `value`; or `between` / `not between` with `from`+`to`):
`t.createdAt`, `t.modifiedAt`, `t.firstResponseDueBy`, `t.dueBy`, `t.lastMessageAt`,
`t.lastCustomerMessageAt`, `t.closedAt`. Values may be `CURRENT_DATE`, `CURRENT_TIME`, `-7 DAY`,
`-4 HOUR`, or `YYYY-MM-DD[ HH:MM:SS]`.

Special keys:

| Key | Shape |
|-----|-------|
| `q` | `{"key":"q","value":"search text"}` — full-text over subject/summary/bodyPlain/history. Numeric input also matches ticket/contract/customer id. Terms under 4 non-numeric chars return nothing, and terms matching a colleague's name are suppressed |
| `tt_matchAll.tagId` | ticket carries **all** listed tags |
| `tt_matchAny.tagId` | ticket carries **at least one** |
| `tt_matchExact.tagId` | ticket carries exactly this set |
| `tt_allowed.tagId` / `tt_excluded.tagId` | routing-tag scoping |
| `qa.state` | quality assessments — `values`, plus optional `assessedUserIds`, `assessedTeamId`, `lastDays` |

### Comparators
- Set keys: `in`, `not in` only (with `values`).
- Scalar form on the same keys: `=`, `!=`, `>`, `<`, `>=`, `<=` (with `value`).
- Date keys: the scalar six, plus `between` / `not between` (with `from` / `to`).
- There is no `like`.

`orderByField` is whitelisted: `t.id`, `t.channel`, `t.channelId`, `t.subchannelId`, `t.direction`,
`t.status`, `t.priority`, `t.agentId`, `t.customerId`, `t.contractId`, `t.partnerId`,
`t.isCustomerActive`, `t.aiSupportLevel`, `t.sentiment`, `t.language`, `t.languageCode`, `t.from`,
`t.createdAt`, `t.modifiedAt`, `t.firstResponseDueBy`, `t.dueBy`, `t.lastMessageAt`,
`t.lastCustomerMessageAt`, `i.aiAgentId`, `tt.tagId`, `relevance`. Anything else is a 400.

---

## Conversations

```bash
# List all conversations for a ticket
curl -s "${BASE}/ticket/{ticketId}/conversation" -H "${AUTH}" | jq '.conversations[] | {id, type, direction, from, createdAt, private, body: (.body[:200])}'

# Filter — each accepts one value or an array; AND across axes, OR within one
curl -s "${BASE}/ticket/{ticketId}/conversation?direction=in&private=false" -H "${AUTH}"

# Get specific conversation
curl -s "${BASE}/ticket/{ticketId}/conversation/{conversationId}" -H "${AUTH}"
```

Filters: `type` (e.g. `text`, `html`, `note`, `neo`, `agent_request`, `agent_response`),
`direction`, `private`, `senderId`, `toId`. Plus `includeRawData`, `contentTranslationLanguage`.

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

- `"private": true` — internal note (also implied by `direction: "internal"`)
- `"isDraft": true` — draft; sending a non-draft needs the `allowedToSendReplies` permission
- `"to"`, `"cc"`, `"bcc"` — recipients (strings or arrays)
- `"subject"`, `"subchannelId"`, `"attachments"`, `"intentIds"`
- `?includeQuotedHistory=false` — omit the quoted thread from the outgoing email (default `true`)
- `?process=realtime|batch|false` (default `batch`)

### Store Conversation (REQUIRES CONFIRMATION)

Store without sending (e.g. recording an externally received reply):

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

Needs `createConversation`. Recipient fields here are `to` / `ccEmails` / `bccEmails` (not `cc`/`bcc`).
Also accepts `type`, `private`, `status`, `priority`, `createdAt`, `externalConversationId`,
`attachments`. Process modes: `realtime`, `batch`, `false`.

### Update / Delete Conversation (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH  "${BASE}/ticket/{ticketId}/conversation/{conversationId}" -H "${AUTH}" -H "Content-Type: application/json" -d '{"content":{"message":"..."}}'
curl -s -X DELETE "${BASE}/ticket/{ticketId}/conversation/{conversationId}" -H "${AUTH}"
```

Only internal notes and drafts can be updated; setting `isDraft: false` publishes a draft.

---

## Activity Log (Key for Debugging)

```bash
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"
```

**This is the single most useful endpoint.** Shows the complete processing timeline: customer
identification, tag detection, agent selection, routing, auto-processing decisions, errors.
`showTechnicalInformation=true` requires the `accessTechnicalEvents` permission.

## Ticket Variables

```bash
curl -s "${BASE}/ticket/{ticketId}/variables" -H "${AUTH}"
```

## Customer Timeline

`GET /ticket/{ticketId}/history` still works but is **deprecated**. Prefer:

```bash
curl -s "${BASE}/contract/{contractId}/history?offset=0&limit=30" -H "${AUTH}"
```

Returns every interaction for the customer/contract: tickets, grid messages, deliveries, payments.

## Intents (AI Agent Results)

```bash
curl -s "${BASE}/intent/byTicketId/{ticketId}" -H "${AUTH}" | jq '{aiOutcome, intentsFound, intents: [.intents[] | {id, aiAgentId, name, status, data}]}'
```

`aiOutcome` is derived per request, not stored: `full` (an intent has confidence 1), `agentAssist`
(intents exist, none fully confident), `customerDetected` (no intents but a `contractId`),
`noDetection` (neither).

Intent `status`: `preview`, `ready`, `executed`, `invalidated`, `deleted`, `archived`.

Other intent routes: `GET /intent/{intentId}`, `PUT /intent/{intentId}` (needs `updateIntent`),
`DELETE /intent/{intentId}`, `POST /intent/{intentId}/execute` (needs `executeIntent`; body accepts
`data`, `contractId`, `dryRun`), `GET /intent/list`, `GET /intent/preview/{aiAgentId}`.

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

`channel` is the only required field. Defaults: `direction: in`, `status: open`, `priority: low`,
`interface: internal`, `createdAt: now`, `aiSupportLevel: unprocessed`.

Optional: `fromName`, `to`, `cc`, `bcc`, `agentId`, `subchannelId`, `tags` (array of ids),
`contractId`, `externalTicketId`, `rawData`, `attachments`, `templateId`, `templateData`,
`firstResponseDueBy`, `dueBy`.

Process modes: `realtime` (sync AI), `batch` (async AI), `false` (no AI — the ticket lands as
`aiSupportLevel: human`).

Letters need exactly one attachment (PDF/PNG/JPG/TIFF); incoming letters get subject and body from OCR.

## Update a Ticket (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/ticket/{ticketId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"status": "closed"}'
```

Returns `{success, ticket}` — the ticket is **nested** here, unlike `GET`.

Fields any agent may write: `status`, `priority`, `agentId`, `assignedAgentIds`, `workedOnBy`,
`dueBy`, `firstResponseDueBy`, `tagIds` (replace all), `addTagIds` / `removeTagIds` (modify —
cannot be combined with `tagIds`), `contractId`, `customerId`, `customerLegitimation`,
`aiSupportLevel`, `spamStatus`, `refreshMode`, `intentId`, `isSync`. **Anything else** (`subject`,
`body`, `summary`, `attachments`, `externalTicketId`, …) requires `updateTechnicalTicketFields`.

- `status: "pending"` is rejected unless `dueBy` is set and in the future.
- `direction` cannot be changed — create a new ticket instead.
- `refreshMode` re-runs part of the AI pipeline: `full`, `summaryAndText`, `customer`, `tags`,
  `agents`. Each needs its own permission (`refreshFull`, `refreshText`, `refreshCustomer`,
  `refreshAiAgents`). `intentId` narrows `refreshMode: agents` to one intent.
- `?includeInWorklog=false` keeps the change out of time tracking (e.g. closing spam).
- `?forceAgentReassignment=true` overrides the reassignment guard.

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

Needs `forwardTicket`. `toEmail`, `cc`, `bcc` take a string or an array; `subchannelId` picks the
sending mailbox.

## Auto-Execute (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/autoexecute?executeAgentId={aiAgentId}" -H "${AUTH}"
```

The path is `autoexecute`. Needs `executeAutoProcessing`. Optional `?allowMultipleIntents=true`,
`?allowWithReplies=true`. Returns HTTP 207 when the run reports failure.

## Delete — GDPR erasure (REQUIRES CONFIRMATION, IRREVERSIBLE)

```bash
curl -s -X DELETE "${BASE}/ticket/{ticketId}/attachment/{attachmentId}" -H "${AUTH}"   # needs updateTechnicalTicketFields
curl -s -X DELETE "${BASE}/ticket/{ticketId}" -H "${AUTH}"                             # needs deleteTicket
```

Hard deletion — S3 objects, conversations, intents, events, worklogs, reporting rows. No undo.
`attachmentId` is the alphanumeric attachment `id`, not a number.

## Stats

```bash
curl -s "${BASE}/ticket/stats" -H "${AUTH}"
```

Returns the count of open tickets plus breakdowns by AI agent (`intents`) and by tag (`tags`).

---

## Ticket Lifecycle

```
Incoming message → Ticket created (status: open)
  → AI processing (analysis, tags, agent detection, parameters)
  → Routing (skill-based, SLA-based)
  → Agent works ticket → Reply/Close
  → Customer replies → Ticket reopened → Re-process
```

### Statuses
`open`, `pending` (snoozed — requires a future `dueBy`), `closed`. There is no `resolved`,
`waitingOnCustomer` or `waitingOnThirdParty`.

### AI Support Levels (`aiSupportLevel`)
- `unprocessed` — Cortex has not analysed it yet
- `human` — analysed, a human works it (also what `?process=false` produces)
- `bot` — a chat or voice bot currently holds the conversation
- `automated` — eligible for / handled by auto-processing (Dunkelverarbeitung)

### Spam
`spamStatus` ∈ `auto_spam`, `auto_programmatic`, `manual_spam` marks a ticket as spam; `auto_clean`,
`manual_clean` and `null` do not. A ticket is *also* treated as spam at runtime when it carries a tag
from the `spamDetectionTagIds` setting — but routing and backlog SQL look at the column only.
A plain tag edit never sets `manual_spam`; only an explicit `{"spamStatus": "manual_spam"}` does,
and that force-closes the ticket.
