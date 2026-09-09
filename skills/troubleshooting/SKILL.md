---
name: troubleshooting
description: Use when the user reports an issue and needs help debugging. Step-by-step playbook for all common problems.
---

# Troubleshooting Guide

## Trigger
Use when the user reports an issue and needs help debugging. Step-by-step playbook for all common problems.

## Prerequisites

Prefer MCP tools (`enneo_ticket_get`, `enneo_ticket_search`, `enneo_profile_me`, `enneo_configure`) for investigation. The curl examples below are fallback references — the MCP server writes credentials to `~/.enneo/env`, so:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

**Read a 403 or 404 before debugging behaviour.** Three unrelated mechanisms produce them, and each
has its own branch below: ticket visibility (§ "Can't See This Ticket"), a missing permission, and a
feature flag switched off for this instance (§ "Endpoint 403/404s for Everyone").

---

## Step-by-Step Debugging

### Step 1: Get Ticket Data
```bash
curl -s "${BASE}/ticket/{ticketId}" -H "${AUTH}" \
  | jq '{id, status, channel, direction, from, subject, contractId, customerId,
         customerLegitimation, customerLegitimationMessage, aiSupportLevel, spamStatus,
         autoExecuteAt, cortexRequestId, tags: [.tags[]?.name], createdAt}'
```

Key fields:
- `aiSupportLevel` — `unprocessed` | `human` | `bot` | `automated`. `unprocessed` means the AI pipeline
  has not completed; `automated` means auto-execution is scheduled or done.
- `contractId` / `customerId` / `customerLegitimation` — was the customer identified, and how well.
- `spamStatus` — `auto_spam` | `auto_programmatic` | `manual_spam` | `auto_clean` | `manual_clean` | null.
- `autoExecuteAt` — non-null means auto-processing is scheduled for that time.
- `cortexRequestId` — the Langfuse/SigNoz trace id for the last AI run.

### Step 2: Get Activity Log
```bash
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"
```

**This is the single most useful endpoint.** Complete processing timeline: customer identification,
tag detection, agent selection, routing, auto-processing decisions, errors. `showTechnicalInformation=true`
additionally requires the `accessTechnicalEvents` permission — without it the call 403s and you must
drop the parameter.

### Step 3: Get AI Agent Results (Intents)
```bash
curl -s "${BASE}/intent/byTicketId/{ticketId}" -H "${AUTH}" \
  | jq '{ticketId, aiOutcome, intentsFound, intents: [.intents[] | {id, aiAgentId, name, status, confidence, data}]}'
```

`aiOutcome` is derived, not stored: `full` (an intent with confidence 1), `agentAssist`,
`customerDetected` (no intents but a contract), `noDetection`.

Note this endpoint is **not** side-effect free: any intent in status `invalidated` is re-processed
before the response is built, which can call Cortex.

### Step 4: Get Conversations
```bash
curl -s "${BASE}/ticket/{ticketId}/conversation" -H "${AUTH}" \
  | jq '.conversations[] | {id, direction, type, from, createdAt, body: (.body[:200])}'
```

### Step 5: Get Customer Data
```bash
curl -s "${BASE}/customer/byTicketId/{ticketId}" -H "${AUTH}"
```

### Step 6: Get Event Traces (Deep Debugging)
```bash
curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["cortexProcessTicket"],"comparator":"in"}]}'
```

`POST /event/search` is read-only. `event.data` is the exact request Mind sent to Cortex;
`event.outcome` is the exact response. See the `events` skill for the jq recipes.

**Traces older than 30 days are deleted and technical events are stripped to a null `data`/`outcome`.**
An empty trace on an old ticket is retention, not a failure.

### Re-run AI Processing **(REQUIRES CONFIRMATION)**
```bash
curl -s "${BASE}/ticket/{ticketId}?refresh=true" -H "${AUTH}"
```

Not a read. It requires the `refreshFull` permission and **wipes** the ticket first: `contractId`,
`customerId` and `customerLegitimation` are cleared, and all intents and ticket tags are deleted
before the pipeline re-runs. A manually assigned customer or contract is lost, and because
`customerLegitimation` is zeroed, the "a confirmed contract survives" guard cannot protect it.
Always confirm with the user, and prefer the narrower alternatives:

- one agent only: `POST /ticket/{ticketId}/autoexecute?executeAgentId={id}` **(REQUIRES CONFIRMATION)**
- one agent, dry run: `POST /aiAgent/{id}/preview` **(REQUIRES CONFIRMATION)**
- one tag, dry run: `POST /tag/{tagId}/detect` **(REQUIRES CONFIRMATION)**

---

## Common Issues

### 1. "Can't See This Ticket" — 403 / 404 / missing from the list

Check this **before** anything else when a ticket is reported as missing or unopenable. Three
independent mechanisms, and they answer different questions:

| Mechanism | Decides | Symptom |
|---|---|---|
| `actualTicketBacklogRequiredTagIds` (required tags) | routing **and** direct access | 403 on `GET /ticket/{id}` and on every child id (intent, event, trace, assessment). Free-text search still lists the title, and the click then fails |
| `actualExcludedTagIds` (excluded tags) | routing only | Absent from the backlog list and from autopilot; opens fine by id; found by free-text search |
| tag `visibility: private` + `viewPrivateTags` | the tag catalogue | The ticket opens, but the tag's **name** is missing from the card and from `GET /tag`. `ticket.tagIds` still carries the id |

Rules that decide which one you hit:
- The required-tag check runs on **every** route that reaches a ticket by its id or by a child id.
  The excluded list runs only in routing contexts.
- A free-text `POST /ticket/search` with `q` steps aside for **both** lists — that is why a ticket can
  be findable and unopenable at once. (`q` under 4 characters matches nothing at all.)
- A ticket **assigned to the caller** bypasses the filters in routing contexts.
- `selectTicketOutsideRequiredSkills` waives the required-tag check entirely.
- `limitTicketBacklogAccess = false` empties both lists — but leaves skill-based routing untouched.
- A `disabled` or deleted tag is dropped from routing relevance but **not** from the required-tag
  check. So a ticket whose only tag was later disabled gets offered by autopilot and then 403s on
  open. That mismatch is real, not a misconfiguration on the viewer's side.

```bash
# What the viewer's own settings resolve to (or use the enneo_profile_me MCP tool)
curl -s "${BASE}/profile" -H "${AUTH}" \
  | jq '{skills: .settings.actualSkills, required: .settings.actualTicketBacklogRequiredTagIds,
         excluded: .settings.actualExcludedTagIds, limit: .settings.actualLimitTicketBacklogAccess}'
```

### 2. Endpoint 403/404s for Everyone — check the feature flags

Whole functional areas are switched on or off per instance via the `featureFlags` setting. When one
is off, its settings tiles disappear or lock, its permissions are stripped from every role, and its
routes refuse writes (403) or serve empty data. Everything is **on by default**, and a key missing
from the map counts as **on** — so only an explicitly-`false` key can be the cause.

```bash
curl -s "${BASE}/settings/featureFlags" -H "${AUTH}" | jq '.value'
```

Flags: `security`, `rbac`, `quality`, `marketpartner`, `analytics`, `apps`, `acd`, `email`, `chat`,
`letter`, `portal`, `system`, `walkIn`.

What deliberately keeps working while a flag is off — do not report these as bugs:
- `security` off: a configured IP whitelist is **still enforced**, and attachment-security values are
  kept, even though both settings are hidden. Existing service-worker accounts keep working.
- `rbac` off: existing custom roles stay assigned and keep working; only creating/editing/deleting is refused.
- `acd` off: **live telephony is untouched** — calls, SIP trunks and phone tickets keep working. Only
  settings surfaces and channel pickers change.
- `email` / `chat` / `letter` / `portal` / `system` / `walkIn` off: nothing behind the channel stops.
  The channel is only removed from the pickers.
- `quality`, `marketpartner`, `apps` off: stored data is untouched; it is simply not served.

Turning `security` back on does not restore previously configured SSO providers — they must be re-selected.

### 3. Customer Not Identified

**Investigation:**
- `GET /customer/byTicketId/{ticketId}` — any match?
- `ticket.customerLegitimationMessage` — the explanation for a level below 20.
- Activity log → the `contractDetection` event trace. It is written even when detection was **skipped**
  or found nothing, so its absence means detection never ran at all:

```bash
curl -s -X POST "${BASE}/event/search?limit=5&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}' \
  | jq '[.events[].traces[]? | select(.type == "contractDetection")
        | {contractIds: .data.contractIds, previous: .data.previousContractId,
           legitimation: .data.customerLegitimation, scanned: .data.scannedSources,
           details: .outcome.details, log: .outcome.detectionLog}]'
```

**Legitimation scale** (`ticket.customerLegitimation`):

| Score | Meaning |
|---|---|
| 0 | No customer identified, or no contract associated |
| 10 | Default confidence for email/portal/chat when nothing else matched |
| 12 | Sender email not found in the ERP |
| 13 | Matching contract/customer id **and** last name found in the message |
| 15 | Matching contract **and** customer id found in the message |
| 20 | High confidence — system channel or outbound/internal message, sender email matches the contract/customer email, or (letters) the address matches |
| 30 | Manually confirmed by an agent, or by the AI during chat |
| 40+ | Stricter verification set by an agent or chatbot |

Two different bars use this number, and confusing them is the usual dead end:
- **`customerLegitimationThreshold`** (default 30; 40 when `customerLegitimationEnabled` is on) is the
  "somebody confirmed this" bar. At or above it, contract re-detection returns early and a confirmed
  contract survives a customer reply.
- **Auto-processing uses a hardcoded `>= 20`**, and only when the ticket has a `contractId`.

**Common causes:** sender email not in the ERP; the customer is not in the ERP at all; two candidates
scored equally (detection then returns nothing on purpose and leaves the decision to Cortex).

**Dry-run the criteria without touching a ticket:**
```bash
curl -s -X POST "${BASE}/contract/legitimation/preview" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"channel":"email","from":"customer@example.com","subject":"...","bodyPlain":"...","contractId":"..."}'
```

### 4. Wrong Tags / Only the Default Tag

This is the **most common issue**.

**A. Check the tags actually on the ticket:**
```bash
curl -s "${BASE}/ticket/{ticketId}" -H "${AUTH}" | jq '{tagIds, tags: [.tags[]?|{id,name}]}'
```
`tagIds` is never filtered, but tag **names** are — an id present in `tagIds` with no matching entry in
`tags` is a hidden (disabled or private) tag, not data loss.

**B. Check the tag's configuration:**
```bash
curl -s "${BASE}/tag/{tagId}" -H "${AUTH}" | jq '{id, name, visibility, routingRelevance, detectionDetails}'
```
`GET /tag/{id}` answers **404, not 403**, for a tag you may not see — an id you cannot see reads like an
id that does not exist. `visibility` is `public` | `private` | `disabled`. Detection config lives in
`detectionDetails` (camelCase); its `type` is one of `manualAssignment`, `aiDetection`,
`conditionDetection`, `aiAndConditionDetection`, `aiOrConditionDetection`, `customLogic`
(`customLogic` is not implemented and only raises an alert).

**C. Check the tag-detection log in the traces:**
```bash
curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["cortexProcessTicket"],"comparator":"in"}]}' \
  | jq '[.events[0].traces[] | select(.type=="aiProcessing") | .data.msg]
        | map(select(test("tags";"i")))'
```
Look for the line `Default tags: [...], Condition tags: [...], AI detected tags: [...]`, and for
`TAG_*` alerts in `.events[0].outcome.alerts`.

**D. Check what Mind sent to Cortex** — the request is the event's own `data`:
```bash
… | jq '.events[0].data | {message, subject, body, history: (.history|length)}'
```

**The tag detection pipeline:**
1. Every active tag is evaluated: default assignment, condition detection, and AI detection.
2. If **more than 15** AI-candidate tags remain, a reranker pre-filter cuts them to the top 15.
3. Those go to the LLM classifier (`validate_ticket_ai_tags`).
4. A tag scoring **below 0.6** is rejected, with a `TAG_*` alert saying so.
5. If a ticket would end up with no tags at all, Mind assigns the **default skill tag** — the tag
   flagged `defaultSkill` in `tag_description.properties`, not a hardcoded id. Conversely, if the
   default tag ends up alongside others, it is removed.

**Root causes, in order of likelihood:**
1. **Score below 0.6** — the classifier saw the tag and rejected it. The alert names the score.
2. **Reranker filtered it out** — with more than 15 AI-detectable tags, the correct one never reached the LLM.
3. **Tag `visibility: disabled`** — it cannot be assigned at all, and a disabled tag is also dropped
   from routing relevance.
4. **Empty or too-short message** after body cleaning (footers, signatures and quoted text are stripped).
5. **Missing conversation history** — email threading failed and `history` is `[]`.
6. **Detection type is not an AI variant** — with `manualAssignment` or plain `conditionDetection`
   the tag was never an AI candidate at all.

**Test a tag against a real ticket without changing it** — runs a live Cortex call, so
**(REQUIRES CONFIRMATION)**:
```bash
curl -s -X POST "${BASE}/tag/{tagId}/detect" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"ticketId":123,"data":{},"testTags":{"_tag[{tagId}].name":"...","_tag[{tagId}].detectionDetails":{...}}}'
```
Returns `{match, alerts}`. It needs the `updateAiAgent` permission (the payload can carry detection code).

### 5. Wrong AI Agent Selected

- Activity log → agent-detection entries.
- `GET /intent/byTicketId/{ticketId}` — which agents produced intents?
- `GET /aiAgent/{agentId}` — check the detection config and the bound tag.
- The detection scores themselves are **not** in the event traces; they live in Langfuse under
  `validate_ticket_ai_agent` / `detect_ai_agents` for the trace id in `ticket.cortexRequestId`.
- Common causes: tag mismatch, detection prompt too broad or too narrow, condition detection wrong.
- On **phone and chat** the default ("Basis") agent, id `1`, is dropped from the validated set when a
  specialist was also selected and the default matched only as a fallback. A sole default is **kept**,
  so parameter extraction still runs.

### 6. AI Agent Gave Wrong Answer

- `GET /intent/byTicketId/{ticketId}` → `intents[].data` — the extracted parameters and the interaction result.
- **Rule-based:** check parameters, business logic and response cases. The executor's run is in the
  `sourceCode` traces: `data.params` (input), `outcome.output`, `outcome.exitCode`, `outcome.stderr`.
- **Smart:** check the prompt, tools and wiki articles — the reasoning is in Langfuse, not in the traces.
- Dry run the agent **(REQUIRES CONFIRMATION)** — the body is the agent definition to test (take it
  from `GET /aiAgent/{id}`) plus `ticketId`; `ticketId` is a body field, not a query parameter:
  ```bash
  curl -s -X POST "${BASE}/aiAgent/{id}/preview" -H "${AUTH}" -H "Content-Type: application/json" \
    -d "$(curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" | jq '. + {ticketId: 123}')"
  ```
  It needs `updateAiAgent` (the payload can carry executable code) and runs a live Cortex call.
- A **re-extraction returning `null` for every attribute is expected**, not data loss: Mind sends a
  conversation high-water mark so extraction only reads messages newer than the last one already
  folded into the intent. With no newer customer message the window is empty; the stored values are
  restored before they reach the agent. Only a real `non-null → null` transition in stored
  `intent.data` across runs is a bug.

### 7. Auto-Processing (Dark Processing) Didn't Trigger

The eligibility check evaluates **in this order and stops at the first failure**, and the failure
message is what lands in the `autoProcessing` trace:

1. The ticket has intents loaded at all
2. Status is `open`
3. `spamStatus` is none of `auto_spam` / `auto_programmatic` / `manual_spam`
4. Channel is not `chat` or `phone`
5. Direction is not `out` or `internal`
6. The `enableAiAutoProcessing` setting is enabled
7. Every `ready` intent passes its own auto-execute check — **the first failure aborts the whole
   evaluation**, that intent is not merely skipped
8. Exactly one intent came out auto-executable (more fails unless `allowMultipleIntents`)
9. No conversation with `direction: in` (unless `allowWithReplies`)
10. `customerLegitimation >= 20`, only when the ticket has a `contractId`

Three things the list does not show:
- Gate 7 compares the intent's option `type` against the `_action` values the **agent's configuration**
  marks `autoExecute: true`, together with `recommended: true` — one check, not two. There is no
  `_actionNext` field in Mind; do not look for one.
- `allowMultipleIntents` and `allowWithReplies` are query parameters of the manual
  `POST /ticket/{id}/autoexecute`, not settings. The scheduled path never passes them — so a manual
  repro that works does not prove the timer will.
- The `20` is hardcoded and is **not** `customerLegitimationThreshold` (30/40).

**Read the trace:**
```bash
curl -s -X POST "${BASE}/event/search?limit=5&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}' \
  | jq '[.events[].traces[]? | select(.type == "autoProcessing")
        | {success: .data.success, reasons: .data.message,
           autoExecutable: .data.autoExecutable, candidates: .data.candidates}]'
```

**"Auto-processing possible, triggered manually"** — passing the check only *marks* the ticket.
Scheduling additionally requires that **every** agent among the ticket's intents is listed in
`immediateAiAgents`; one non-immediate agent on a mixed ticket leaves `autoExecuteAt` null.

```bash
curl -s "${BASE}/settings?filterByName=immediateAiAgents" -H "${AUTH}"
```

With that satisfied: `autoProcessingDelayEnabled` off → now; on → `autoProcessingDelay` hours after
the last message, by SLA.

**Trigger it manually (REQUIRES CONFIRMATION):**
```bash
curl -s -X POST "${BASE}/ticket/{ticketId}/autoexecute?executeAgentId={agentId}" -H "${AUTH}"
```

### 8. Ticket Wrongly Marked (or Not Marked) as Spam

A ticket counts as spam when **either** an explicit `spamStatus` ∈ {`auto_spam`, `auto_programmatic`,
`manual_spam`} is set, **or** it carries a tag from the `spamDetectionTagIds` setting. Routing and
backlog SQL use the **column only** — a legacy tag-only row reads as spam at runtime but still routes.

The most common false report: *"editing tags marked my ticket as spam."* It does not. The generic
ticket-update endpoint stamps `manual_spam` only when the update carries an explicit `spamStatus`;
a plain tag/priority/assignee/status edit never derives it from a tag overlap, in any
`spamDetection` mode. Tag-based marking happens only on the automatic Cortex fast path and at
read/unmark time.

**Unmarking:** removing the last marker sets `manual_clean` and strips the spam tags. It does **not**
auto-reopen the ticket. A full re-run is queued only when the ticket has **no** `ready` or `executed`
intent — so unmark first, delete intents afterwards, and nothing re-runs.

```bash
curl -s "${BASE}/settings?filterByName=spamDetection" -H "${AUTH}"
curl -s "${BASE}/settings?filterByName=spamDetectionTagIds" -H "${AUTH}"
```

### 9. Ticket Not Routed Correctly

- Activity log → `ticketRouted` events.
- Compare the ticket's routing-relevant tags against the user's / team's `actualSkills.tagIds`.
- `autopilotTagMatchingMode`: `matchAny` (default — at least one skill tag) vs `matchAll` (the
  ticket's routing-relevant tags must be a **subset** of the agent's skills).
- **Non-routing-relevant tags are stripped** before routing SQL is built, so a ticket carrying only
  NRR tags reads as untagged and passes every skill filter. Disabled and deleted tags never count.
- `actualExcludedTagIds` removes a ticket from the queue; `actualTicketBacklogRequiredTagIds` gates
  both the queue and direct access (§ 1).
- Check user availability (routing status, absence).
- **Push routing for live phone and chat is a separate path.** It matches on `actualSkills` only and
  reads **neither** the excluded nor the required list — so a "do not route this to first line" rule
  has no effect on a pushed call or chat, only on the pull queue and the backlog list.

**Double routing** (two agents get the same ticket): there is no persistent lock. User A opens the
ticket and stops pinging, so it is served to User B. Check `ticket_agent` / `user_timetracking` for
overlapping sessions.

### 10. "Cortex Did Not Return Any Data"

Async/sync mismatch: Cortex answered `{"status":"Message scheduled for processing"}` instead of
inline results, and Mind returned an empty response object.

- Search `cortexProcessTicket` events; the event `status` will be `error` or the outcome will carry
  `success:false`.
- The real result arrives later on the Cortex → Mind callback, so look for a **second, later** event
  on the same ticket.
- Other outcomes that look the same: `empty response body from Cortex (possible DNS/network issue)`,
  and the 100KB guard — a request whose body plus history exceeds 100KB is refused before the call
  with "The message is too large to be processed by AI".

### 11. OCR Issues

- Look for an `ocrScanCompleted` event on the ticket.
- Check the attachment actually uploaded (it must be present in `ticket.attachments`).
- Common causes: image quality, unusual meter displays, handwritten text.

---

## Bulk Diagnostics

```bash
# Settings (compact; add ?filterByName= or ?filterByCategory= to narrow)
curl -s "${BASE}/settings/compact" -H "${AUTH}"

# Feature flags
curl -s "${BASE}/settings/featureFlags" -H "${AUTH}"

# AI agents
curl -s "${BASE}/aiAgents?format=short" -H "${AUTH}"

# Tags (format: full (default) | compact; add ?includeDisabled=true to see disabled ones)
curl -s "${BASE}/tag?format=compact&includeDisabled=true" -H "${AUTH}"

# Event types available on this instance
curl -s "${BASE}/event/getEventTypes" -H "${AUTH}"

# Health
curl -s "${BASE}/health" -H "${AUTH}"

# Cron health
curl -s "${BASE}/health/cron" -H "${AUTH}"

# Version
curl -s "${BASE}/version" -H "${AUTH}"
```

### Direct SQL — usually not available to you

`GET /internal/query?q=SELECT+…` accepts only `SELECT`, `DESCRIBE` and `EXPLAIN`, and needs **both**
the `enneoAdmin` permission **and** a request originating from a private IP. Over the public
internet it 403s regardless of the token, so it only works from inside the cluster. Use the API
endpoints above instead; note the table is `ticket_tags` (plural), not `ticket_tag`.
