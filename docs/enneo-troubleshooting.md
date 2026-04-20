# Enneo Troubleshooting Guide — Ticket Processing & AI Debugging

## Overview

Most customer questions are about **ticket processing / AI processing** — why something didn't work as expected. This guide covers how to investigate and potentially fix issues.

## Environment Onboarding Flow

When a user asks about a specific environment (not main), follow this flow:

1. **Ask for the environment:**
   > "What environment is your question about? E.g. `my-company.enneo.ai`"

2. **Ask for the access token:**
   > "Please navigate to `https://{environment}/api/mind/profile/showAccessToken` and paste the result here."
   (e.g. for demo.enneo.ai → `https://demo.enneo.ai/api/mind/profile/showAccessToken`)

3. **Then proceed** with the investigation using their environment URL + token.

## Prerequisites

To investigate, I need:
1. **Environment URL** (e.g., `https://main.enneo.dev` or `https://customer.enneo.ai`)
2. **Access token** (from `/api/mind/profile/showAccessToken`)
3. **Ticket ID** of the affected ticket

If the customer says "main", use:
- URL: `https://main.enneo.dev`
- Token: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjF9.Qg1FL8W6guEbGclzk_iTwoXgzzbMuC266RfrRB-VG7w`

---

## Step-by-Step: Debugging a Ticket

### Step 1: Get Ticket Data
```bash
curl -s 'https://{env}/api/mind/ticket/{ticketId}' \
  -H 'Authorization: Bearer {token}'
```

Key fields to check:
- `status` — open, closed, waiting
- `contractId` / `customerId` — was customer identified?
- `tags` — were tags assigned correctly?
- `assignedUserId` — who is it routed to?
- `aiAutomationLevel` — L0-L5
- `additionalData` — custom data (e.g., `markedAsSafe`)

### Step 2: Get Activity Log (Event Log)
```bash
curl -s 'https://{env}/api/mind/ticket/{ticketId}/activity?showTechnicalInformation=true' \
  -H 'Authorization: Bearer {token}'
```

This shows the **complete processing timeline**:
- When ticket was created
- Customer identification result
- Tag detection results
- AI agent selection + execution
- Routing decisions
- Any errors or warnings
- Dark processing decisions

**This is the single most useful endpoint for debugging.**

### Step 3: Get AI Agent Results (Intents)
```bash
curl -s 'https://{env}/api/mind/intent/byTicketId/{ticketId}' \
  -H 'Authorization: Bearer {token}'
```

Shows which AI agent(s) were detected, their parameters, and the interaction result.

### Step 4: Get Conversations
```bash
curl -s 'https://{env}/api/mind/ticket/{ticketId}/conversation' \
  -H 'Authorization: Bearer {token}'
```

Shows all messages (incoming, outgoing, internal notes).

### Step 5: Get Customer Data
```bash
curl -s 'https://{env}/api/mind/customer/byTicketId/{ticketId}' \
  -H 'Authorization: Bearer {token}'
```

Shows customer/contract data and legitimation level.

---

## Re-running AI Processing

If something went wrong and you want to re-process:

```bash
curl -s 'https://{env}/api/mind/ticket/{ticketId}?refresh=true' \
  -H 'Authorization: Bearer {token}'
```

The `?refresh=true` parameter triggers a **complete re-run of AI processing** on the ticket:
- Re-analyzes the ticket content
- Re-detects tags
- Re-runs agent detection
- Re-processes through selected AI agent

### Auto-execute a specific AI agent:
```bash
curl -s -X POST 'https://{env}/api/mind/ticket/{ticketId}/autoexecute?executeAgentId={aiAgentId}' \
  -H 'Authorization: Bearer {token}'
```

---

## Common Issues & What to Check

### 1. "Customer not identified"
- Check: `GET /customer/byTicketId/{ticketId}` — is there a match?
- Check activity log for customer identification events
- Common cause: sender email doesn't match ERP data
- Check legitimation level (needs ≥20 for dark processing)

### 2. "Wrong tags assigned" / "Only Allgemein tag"
This is one of the most common issues. Here's the deep investigation flow:

**Step A: Check what tags are actually in the DB**
```bash
curl -s 'https://{env}/api/mind/internal/query?q=SELECT+*+FROM+ticket_tags+WHERE+ticketId={ID}' -H 'Authorization: Bearer {token}'
```
Note: A tag might be assigned in DB but hidden because `visibility: disabled`. Check:
```bash
curl -s 'https://{env}/api/mind/internal/query?q=SELECT+id,name,fullName,visibility,deletedAt+FROM+tag_description+WHERE+id={tagId}' -H 'Authorization: Bearer {token}'
```

**Step B: Check event traces for tag detection results**
In the event traces, look for the `validate_tags` log entry:
`"Default tags: [], Condition tags: [], AI detected tags: [xxx]"`
This tells you exactly what the AI detected vs what conditions matched.

**Step C: Understand the tag detection pipeline (Cortex `tag_processor.py`)**
1. All active tags with AI detection are collected from the environment
2. If tag count > `TAG_RERANKER_TOP_N` (currently **15**), a **reranker pre-filter** runs (`_prefilter_tags_by_reranker`)
   - Uses small model `QWEN3_RERANKER_0_6B`
   - Compares ticket query (subject + conversation history) against tag detection prompts
   - Returns only top 15 tags → **relevant tags may be filtered out here**
3. The top 15 tags are passed to the LLM (e.g. mistral/devstral) for classification
4. Tags scored ≥ 0.8 are assigned; below 0.8 are rejected
5. If no tags are detected → fallback to "Allgemein" (tag 1)

**Step D: Check what the reranker/LLM actually received**
Find the tag detection model trace (look for `model: mistral/devstral` or similar) and inspect:
- `traces[N].data.prompt.messages[0]` → the context message (subject + history)
- `traces[N].data.prompt.messages[2]` → the model's response with scores per tag key

**Step E: Check what Mind sent to Cortex**
```bash
# Preview endpoint (read-only, doesn't trigger processing)
curl -s 'https://{env}/api/mind/experimental/cortex/ticket/{ticketId}/request' -H 'Authorization: Bearer {token}'
```
Key fields: `message`, `body`, `history` (array of previous messages), `subject`

**Common root causes for wrong/missing tags:**
1. **Tag has `visibility: disabled`** → AI detects it, but it's hidden in UI. Tag is still in `ticket_tags` DB table.
2. **Reranker filters out the correct tag** → The small reranker model doesn't rank the relevant tag in the top 15 out of 173+ tags.
3. **Empty or too-short customer message** → After body cleaning (footer/quote removal), the message is too generic for classification.
4. **Missing conversation history** → `history: []` because:
   - Customer reply arrived as a **new ticket** instead of being threaded to the original (email threading failure)
   - Mind builds history from `$ticket->conversations` — if no conversations exist, history is empty
   - The quoted/forwarded text in the raw `body` gets stripped during cleaning, losing all context
5. **Tag not in tag detection options** → The tag might exist but not have `ai_detection` configured in its `detection_details`.

**Understanding text preprocessing (important!):**
- Enneo deliberately strips footers, signatures, and quoted/forwarded text from customer messages before AI processing
- This is done by the ticket analyzer (`ticket_analyzer.py`) which produces `body_clean`
- Rationale: Including quoted text confuses the AI more than it helps. Example: customer replies to a billing email with a meter reading → 95% of the email is about the bill, 5% about the meter reading → AI incorrectly classifies as billing
- The reranker and tag detection both use `body_clean` (via `current_message`), not the raw `body`
- Subject IS included in the context
- Previous conversations (if available in `history`) ARE included

### 3. "Wrong AI agent selected"
- Check activity log → agent detection events
- Check: `GET /api/mind/intent/byTicketId/{ticketId}` — which agents were detected?
- Common causes: tag configuration mismatch, agent recognition not configured properly

### 4. "AI agent gave wrong answer"
- Check intent data → look at extracted parameters and interaction result
- For rule-based agents: check business logic, input parameters, output handling
- For smart agents: check the prompt, available tools, wiki articles
- Check: `GET /api/mind/aiAgent/{agentId}` to see agent config

### 5. "Dark processing didn't trigger" / "Auto-processing possible, triggered manually"
- Check activity log → filter for `autoProcessing` event traces to see exact evaluation result
- Check: `enableAiAutoProcessing` setting enabled? (`GET /api/mind/settings`)
- Check: Does the matching response case have `autoExecute: true`? (`GET /api/mind/aiAgent/{id}` → `.settings.responseCases`)
- Check: Is the recommended option's type in the auto-executable response cases?
- Check: Only 1 intent? (multiple auto-executable intents = skipped)
- Check: No inbound customer reply in conversations?
- Check: Customer legitimation ≥ 20? (if contract associated)
- If ticket is `aiSupportLevel: "automated"` but `autoExecuteAt: null` → "triggered manually" means the AI Agent is NOT in `immediateAiAgents` setting
- To fix scheduling: add the AI Agent ID to `immediateAiAgents` client setting
- To disable auto-execute for a response case: `PATCH /api/mind/aiAgent/{id}` with `settings.responseCases[].autoExecute: false`
- Key source files:
  - `mind/Mind/Models/TicketAutoProcessing.php` — evaluation & scheduling logic
  - `mind/Mind/Models/Intent.php` → `canBeAutoExecuted()` — checks response case config
  - `mind/Mind/Models/AiAgent.php` → `getAutoExecutableResponseCases()` — reads `_action` parameter conditions
  - `ops-fe/.../TicketNotification/helpers.ts` → `buildAutoExecutionMessage()` — UI label logic

### 6. "Ticket not routed correctly"
- Check activity log → routing events
- Check user/team skill assignments vs ticket tags
- Check autopilot settings (ALL tags vs AT LEAST ONE)
- Check if Last-Agent-Routing is active
- Check user availability (online status, absence)

### 7. "Cortex did not return any data" / Intent execution fails
This error comes from `Intent::executeOption()` when Cortex returns an async-mode response instead of inline results.

**Root cause:** Async vs sync mismatch in the Cortex communication flow:
1. `Intent::executeOption()` calls `Cortex::submitMessage()` — synchronous POST to `cortex:8006/api/cortex/ticket`
2. Cortex returns `{"status": "Message scheduled for processing"}` (async mode) instead of inline results
3. `Cortex::formatResponse()` (line 612-614) returns an empty `CortexMessageResponse` when it sees that status
4. `getIntentsFromCortexResponse()` gets 0 intents → error "Cortex did not return any data"
5. Meanwhile, Cortex processes the request async and sends valid data back via callbacks to `/api/mind/experimental/cortex/ticket/{ticketId}/callback` — but `executeOption()` has already failed

**Key code locations:**
- Error origin: `mind/Mind/Models/Intent.php` lines 460-464
- Async check: `mind/Mind/Services/Cortex.php` lines 612-614
- Callback endpoint: `mind/Mind/Routes/ExperimentalRoute.php` line 43
- `submitMessage()` POST: `Cortex.php` lines 219-222

**How to investigate:**
- Check event traces for `cortexProcessTicket` events on the ticket to see what Cortex returned synchronously
- Look for callback traces (parent-id matching) — if callbacks contain valid data but the sync response was empty, this confirms the async/sync mismatch
- Check for `context deadline exceeded` errors against Cortex — may indicate Cortex overload causing async fallback

### 8. "OCR didn't read the meter/letter correctly"
- Check cortex OCR endpoints
- Check if attachment was properly sent
- Common: image quality, unusual meter displays, handwritten text

---

## Useful Bulk Operations

### Check all settings:
```bash
curl -s 'https://{env}/api/mind/settings' -H 'Authorization: Bearer {token}'
```

### List all AI agents:
```bash
curl -s 'https://{env}/api/mind/aiAgents' -H 'Authorization: Bearer {token}'
```

### List all tags:
```bash
curl -s 'https://{env}/api/mind/tag' -H 'Authorization: Bearer {token}'
```

### Search tickets:
```bash
curl -s -X POST 'https://{env}/api/mind/ticket/search' \
  -H 'Authorization: Bearer {token}' \
  -H 'Content-Type: application/json' \
  -d '{"status": "open", "limit": 10}'
```

### Export worklogs (for analysis):
```bash
curl -s 'https://{env}/api/mind/export/{key}?format=json' -H 'Authorization: Bearer {token}'
```

---

## Source Code Deep-Dive Locations

When debugging requires reading the actual processing logic:

### Ticket Processing Pipeline (Cortex)
1. `cortex/src/services/process_ticket.py` — Entry point
2. `cortex/src/services/ticket/ticket_analyzer.py` — Analysis
3. `cortex/src/services/ticket/tag_processor.py` — Tag assignment
4. `cortex/src/services/ticket/agent_detection.py` — Agent selection
5. `cortex/src/services/ticket/ai_agent_handler.py` — Agent execution
6. `cortex/src/services/ticket/process_parameters.py` — Parameter extraction
7. `cortex/src/services/ticket/response_case_handler.py` — Response handling
8. `cortex/src/services/ticket/conditions.py` — Condition checks

### Smart Agent Execution (Cortex)
- `cortex/src/ai/smart_ai_agent.py` — LLM interaction
- `cortex/src/ai/tool_manager.py` — Tool orchestration
- `cortex/src/services/execution/execute_tools.py` — Tool execution
- `cortex/src/prompts/fragments.py` — Prompt building

### Routing Engine (Mind)
- `mind/Mind/Services/Acd.php` — ACD routing engine

### Intent Processing (Mind)
- `mind/Mind/Routes/IntentRoute.php` — Intent API
- `mind/Mind/Models/Intent.php` — Intent model
- `mind/Mind/Services/IntentDetection.php` — Detection
- `mind/Mind/Services/IntentRecommendation.php` — Recommendations
