---
name: troubleshooting
description: Use when the user reports an issue and needs help debugging. Step-by-step playbook for all common problems.
---

# Troubleshooting Guide

## Trigger
Use when the user reports an issue and needs help debugging. Step-by-step playbook for all common problems.

## Prerequisites

Prefer MCP tools (`enneo_ticket_get`, `enneo_profile_me`, etc.) for investigation. The curl examples below are fallback references — the MCP server writes credentials to `~/.enneo/env`, so:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Step-by-Step Debugging

### Step 1: Get Ticket Data
```bash
curl -s "${BASE}/ticket/{ticketId}" -H "${AUTH}" | jq '{id, status, channel, direction, from, subject, contractId, customerId, aiSupportLevel, tags: [.tags[]?.name], createdAt}'
```

Key fields: status, contractId/customerId (customer identified?), tags, aiSupportLevel (L0-L5).

### Step 2: Get Activity Log
```bash
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"
```

**This is the single most useful endpoint.** Shows complete processing timeline: customer identification, tag detection, agent selection, routing, dark processing decisions, errors.

### Step 3: Get AI Agent Results (Intents)
```bash
curl -s "${BASE}/intent/byTicketId/{ticketId}" -H "${AUTH}" | jq '{aiOutcome, intentsFound, intents: [.intents[] | {id, aiAgentId, aiAgentName, status, data}]}'
```

### Step 4: Get Conversations
```bash
curl -s "${BASE}/ticket/{ticketId}/conversation" -H "${AUTH}" | jq '.conversations[] | {id, direction, from, createdAt, body: (.body[:200])}'
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

See the `events` skill for jq commands to extract key sections from large traces.

### Re-run AI Processing
```bash
curl -s "${BASE}/ticket/{ticketId}?refresh=true" -H "${AUTH}"
```

---

## Common Issues

### 1. Customer Not Identified

**Investigation:**
- `GET /customer/byTicketId/{ticketId}` — any match?
- Check activity log for customer identification events
- Check legitimation level

**Common causes:**
- Sender email doesn't match ERP data
- Customer data not in ERP system
- Legitimation criteria not met (needs >= 20 for dark processing)

**Legitimation levels:** 0 (none), 10-19 (recognized, not legitimated), 20 (identified + matched), 30 (manually confirmed)

---

### 2. Wrong Tags / Only "Allgemein"

This is the **most common issue**. Deep investigation:

**A. Check tags in DB:**
```bash
curl -s "${BASE}/internal/query?q=SELECT+*+FROM+ticket_tag+WHERE+ticketId={ticketId}" -H "${AUTH}"
```

**B. Check if tag is hidden:**
```bash
curl -s "${BASE}/internal/query?q=SELECT+id,name,fullName,visibility,deletedAt+FROM+tag_description+WHERE+id={tagId}" -H "${AUTH}"
```

**C. Check event traces for tag detection:**
Look for `validate_tags` in traces — shows: `"Default tags: [], Condition tags: [], AI detected tags: [xxx]"`

**D. Check what Mind sent to Cortex:**
```bash
curl -s "${BASE}/experimental/cortex/ticket/{ticketId}/request" -H "${AUTH}"
```
Key fields: `message`, `body`, `history`, `subject`

**Understanding the tag detection pipeline:**
1. All active tags with AI detection are collected
2. If tag count > 15, a **reranker pre-filter** runs (small model, top 15 only)
3. Top 15 tags passed to LLM for classification
4. Tags scored >= 0.8 are assigned; below 0.8 rejected
5. No tags detected → fallback to "Allgemein" (tag 1)

**Root causes:**
1. **Tag `visibility: disabled`** — AI detects it but hidden in UI
2. **Reranker filters out correct tag** — with 15+ tags, top-15 pre-filter may exclude it
3. **Empty/too-short message** — after body cleaning (footer/quote removal), message too generic
4. **Missing conversation history** — email threading failure, `history: []`
5. **Tag has no `ai_detection` configured** in `detection_details`

**Text preprocessing:** Enneo strips footers, signatures, quoted text before AI. Uses `body_clean` + subject + history for detection.

---

### 3. Wrong AI Agent Selected

- Check activity log → agent detection events
- `GET /intent/byTicketId/{ticketId}` — which agents detected?
- `GET /aiAgent/{agentId}` — check detection config
- Common: tag mismatch, detection prompt too broad/narrow, condition detection wrong

---

### 4. AI Agent Gave Wrong Answer

- Check intent data → extracted parameters, interaction result
- **Rule-based:** Check parameters, business logic, response cases
- **Smart:** Check prompt, tools, wiki articles
- Preview the agent: `POST /aiAgent/{id}/preview?ticketId={ticketId}`
- Check event traces for `sourceCode` type (executor output/errors)
- Check for `extract_ticket_parameters_with_ai_*` traces (parameter extraction)

---

### 5. Dark Processing Didn't Trigger

**Auto-processing evaluation chain** — ALL must pass:

1. `enableAiAutoProcessing` setting enabled
2. Ticket status = `open`, not spam
3. Channel not `chat` or `phone`
4. At least one intent with status `ready`
5. Response case has `autoExecute: true` matching `_actionNext`
6. That option is `recommended: true`
7. Only 1 auto-executable intent (multiple = skipped)
8. No inbound customer reply in conversations
9. Customer legitimation >= 20 (if contract associated)

**Check auto-processing traces:**
```bash
curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}' \
  | jq '[.events[0].traces[] | select(.type == "autoProcessing")]'
```

**"Auto-processing possible, triggered manually":** Agent ID not in `immediateAiAgents` setting.
- Fix: Add agent ID to `immediateAiAgents` setting
- Check: `GET /settings?filterByName=immediateAiAgents`

**Scheduling:** If `autoProcessingDelayEnabled` is true, there's a delay of `autoProcessingDelay` hours.

---

### 6. Ticket Not Routed Correctly

- Check activity log → `ticketRouted` events
- Check user/team skill assignments vs ticket tags
- Check autopilot settings (ALL tags vs AT LEAST ONE)
- Check last-agent-routing / last-team-routing settings
- Check user availability (online status, absence)

**Double routing** (two agents get same ticket):
- No persistent lock on tickets
- User A opens ticket, stops pinging → ticket served to User B
- Check `user_timetracking` for overlapping sessions

---

### 7. "Cortex Did Not Return Any Data"

Async/sync mismatch: Cortex returned `"Message scheduled for processing"` instead of inline results.

- Check event traces for `cortexProcessTicket` events
- Look for callback traces with valid data
- May indicate Cortex overload causing async fallback

---

### 8. OCR Issues

- Check if attachment was properly uploaded
- Common: image quality, unusual meter displays, handwritten text

---

## Bulk Diagnostics

```bash
# Settings
curl -s "${BASE}/settings/compact" -H "${AUTH}"

# AI agents
curl -s "${BASE}/aiAgents?format=short" -H "${AUTH}"

# Tags
curl -s "${BASE}/tag?format=compact" -H "${AUTH}"

# Health
curl -s "${BASE}/health" -H "${AUTH}"

# Cron health
curl -s "${BASE}/health/cron" -H "${AUTH}"

# Version
curl -s "${BASE}/version" -H "${AUTH}"
```
