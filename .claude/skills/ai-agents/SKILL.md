# AI Agent Management & Development

## Trigger
Use when the user wants to create, modify, test, preview, inspect, or develop AI agents — including writing agent code, understanding agent structure, testing with real data, or debugging agent execution.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## List & Inspect Agents

```bash
# Full details
curl -s "${BASE}/aiAgents?format=full" -H "${AUTH}" | jq '[.[] | {id, name, intelligence, channels, category, enabled: .enabled}]'

# Short (names/IDs only)
curl -s "${BASE}/aiAgents?format=short" -H "${AUTH}"

# Search by name/description
curl -s "${BASE}/aiAgents?q=meter+reading&format=medium" -H "${AUTH}"

# Filter by executor type: sourceCode, apiCall, visualEditor
curl -s "${BASE}/aiAgents?typeFilter=sourceCode&format=medium" -H "${AUTH}"

# Agent tree (grouped by tag)
curl -s "${BASE}/aiAgents/tree?format=medium" -H "${AUTH}"

# Get a specific agent (full config with executor code, response cases, parameters)
curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}"

# Summary only
curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" | jq '{id, name, intelligence, channels, description, settingsKeys: (.settings | keys)}'
```

## CRUD Operations

```bash
# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiAgent" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "description": "...", "channels": ["email"], "intelligence": "rulebased"}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiAgent/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "description": "Updated description"}'

# Update just the executor code (REQUIRES CONFIRMATION)
CODE=$(cat my_agent.py | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
curl -s -X PATCH "${BASE}/aiAgent/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "{\"settings.executor[0].code\": ${CODE}}"

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/aiAgent/{id}" -H "${AUTH}"
```

## Preview & Test

```bash
# Preview agent on a ticket (dry run — no side effects)
curl -s -X POST "${BASE}/aiAgent/{id}/preview?ticketId={ticketId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "$(curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}")"
# Returns: dataOutcome, customerOutcome, curlRequests

# Similar tickets for an agent
curl -s "${BASE}/aiAgent/{id}/similarTickets" -H "${AUTH}" | jq '[.[] | {id, subject, status, channel}]'

# Get local execution command (for testing locally with real data)
curl -s -X POST "${BASE}/executor/localExecutionCommand" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"id": {agentId}, "ticketId": {ticketId}}'
```

## Default & Sample Agents

```bash
# Available defaults
curl -s "${BASE}/aiAgents/availableDefaults" -H "${AUTH}" | jq '.availableAiAgents[] | {name, slug, description, intelligence}'

# Load defaults (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiAgents/loadDefaults" -H "${AUTH}"

# List sample agents (from admin portal)
curl -s "${BASE}/aiAgents/samples" -H "${AUTH}" | jq '[.[] | {id, name, description}]'

# Get specific sample (full definition with code)
curl -s "${BASE}/aiAgents/samples/{id}" -H "${AUTH}"
```

Key samples to study:
- **Contract Termination** (Python) — full two-phase flow with contract API calls, date validation
- **Change Bank Data** (PHP) — IBAN validation, ERP integration
- **Auto Reply** (Python) — minimal auto-executable agent template

---

## Agent Intelligence Types

| Type | Description |
|------|-------------|
| `rulebased` | Deterministic: parameters + code executor (Python/Node/PHP) + response cases |
| `smart` | LLM-powered: prompt + tools + wiki. No coding needed. |
| `apiCall` | Simple HTTP call executor |
| `visualEditor` | Visual flow editor |

---

## Rule-Based Agent JSON Structure

A complete agent JSON:

```json
{
  "id": 4,
  "name": "Kündigungs-Agent",
  "slug": "cancel_contract",
  "tagId": 35,
  "channels": ["email", "letter"],
  "description": "Hilft bei Vertragskündigungen.",
  "intelligence": "rulebased",
  "settings": {
    "executor": [...],
    "parameters": [...],
    "responseCases": [...],
    "detectionDetails": {...},
    "personality": { "style": 2, "formality": 2 }
  }
}
```

### `settings.parameters[]` — Input Parameters

| Field | Description |
|-------|-------------|
| `id` | Unique numeric ID (use timestamp-based for new params) |
| `key` | Variable name in code (e.g. `newIBAN`, `date`) |
| `name` | Display name in UI |
| `type` | `str`, `int`, `float`, `bool`, `date`, `enum`, `list`, `object` |
| `source` | `message` (AI extraction), `contract`, `ticket`, `customer`, `manual` |
| `sourceKey` | Field path for contract/ticket/customer sources (e.g. `iban`, `id`) |
| `description` | For `source: message` — AI extraction prompt |
| `visibility` | `visible`, `hidden`, `readonly` |
| `required` | Whether parameter must have a value |
| `value` | Default value (for `source: manual`) |
| `options` | For `type: enum` — array of `{id, label, value}` objects |

**The `_action` parameter is mandatory.** Every agent must include:

```json
{
  "id": 1698862629088,
  "key": "_action",
  "name": "_action",
  "type": "str",
  "value": "null",
  "source": "manual",
  "visibility": "hidden"
}
```

### `settings.executor[]` — Business Logic

```json
{
  "id": "1",
  "type": "sourceCode",
  "language": "python311",
  "code": "...the full source code...",
  "packages": "python-dateutil",
  "parameters": [1698862629088, 1, 2]
}
```

- `language`: `python311`, `node20`, `php82`
- `packages`: pip/npm packages (comma-separated)
- `parameters`: array of parameter IDs passed to executor

### `settings.responseCases[]` — Output Handling

```json
{
  "id": 1698862853625,
  "condition": {
    "operands": [{
      "id": 1698862856291,
      "value": "need_confirmation",
      "operand": 1698862629088,
      "operator": "Equal"
    }],
    "operator": "And"
  },
  "output": {
    "type": "llm",
    "parameters": [2],
    "text": ""
  },
  "autoExecute": false,
  "description": "Customer needs to provide confirmation document."
}
```

**Output types:**

| Type | What happens | Auto-executable? |
|------|-------------|------------------|
| `interaction` | Shows infos/options to human agent | No |
| `textTemplate` | Sends static template (Handlebars) | Yes |
| `llm` | AI generates customer reply from description | Yes |
| `textTemplateAndClose` | Template + close ticket | Yes |
| `closeTicket` | Closes ticket without reply | Yes |

**`autoExecute: true`** — enables dark processing for this response case. Only works with `textTemplate`, `llm`, `textTemplateAndClose`, or `closeTicket`.

**Condition operators:** `Equal`, `Like`, `IsNull`, `IsNotNull`

### `settings.detectionDetails` — When to Trigger

```json
{
  "type": "aiDetection",
  "customerNeeded": true,
  "aiDetection": {
    "detectionPrompt": "The customer wants to terminate their contract"
  },
  "conditions": { "id": 1, "operands": [], "operator": "And" },
  "parameters": []
}
```

| Detection type | Description |
|----------------|-------------|
| `aiDetection` | LLM decides based on message content |
| `conditionDetection` | Triggers on field values (sender, tag, etc.) |
| `aiAndConditionDetection` | Both must match |
| `manualAssignment` | Only when manually assigned |

`customerNeeded: true` (default) requires customer identification before running. Set to `false` if agent doesn't need contract/customer data.

---

## Two-Phase Execution Model

Every rulebased agent runs in exactly **two phases**:

### Phase 1: `_action = null` — Display & Offer Options
- Extract and display data
- Show `infos` (success/warning/danger/neutral messages)
- Return `options` (buttons for agent or auto-processing)
- **Must return at least one option with `recommended=True`** — required for auto-processing
- **No side effects!** Phase 1 runs on every preview/refresh/initial load

### Phase 2: `_action = "<ACTION_NAME>"` — Execute Business Logic
- Validate data, call external APIs
- Return final result
- On error: use `sys.exit(1)` for `textTemplate`/`llm` response cases

**There is no Phase 3.** The orchestrator does NOT loop after Phase 2.

---

## Writing Agent Code (Python SDK)

### Boilerplate

```python
import importlib.util
import os
import json
import sys

# Load SDK
file_path = os.getenv('SDK', 'sdk.py')
spec = importlib.util.spec_from_file_location('sdk', file_path)
sdk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdk)

# Load input data
input_data = sdk.load_input_data()
interaction = sdk.Interaction(data=input_data)
action = input_data.get('_action')


def stop(interaction):
    """Output the interaction object and exit."""
    print(json.dumps(interaction.model_dump()))
    sys.exit()


# Phase 1
if action is None:
    interaction.options.append(
        sdk.IntentOption(type='PROCESS_REQUEST', name='Anfrage bearbeiten', recommended=True)
    )
    stop(interaction)

# Phase 2
if action == 'PROCESS_REQUEST':
    # Business logic here
    stop(interaction)

stop(interaction)
```

### SDK Reference

**Input/Output:**
- `sdk.load_input_data()` → dict with `_action`, `_metadata`, form fields
- `sdk.Interaction(data=input_data)` → result object with `infos`, `options`, `data`
- `sdk.IntentInfo(type, message)` — type: `success`, `warning`, `danger`, `neutral`
- `sdk.IntentOption(type, name, recommended, icon, order)` — action button

**API Access:**
- `sdk.ApiEnneo.get_contract(contract_id)` → dict (`id`, `firstname`, `lastname`, `status`, `startDate`, `endDate`, `iban`, `monthlyDeposit`, `consumption`, `productName`, `rawData`, etc.)
- `sdk.ApiEnneo.get_ticket(ticket_id)` → dict (`id`, `subject`, `bodyClean`, `channel`, `status`, `customerId`, `contractId`, etc.)
- `sdk.ApiEnneo.get(endpoint, params={}, authorizeAs='user')` — generic GET
- `sdk.ApiEnneo.post(endpoint, body, authorizeAs='user')` — generic POST
- `sdk.ApiEnneo.patch(endpoint, body, authorizeAs='user')` — generic PATCH
- `sdk.ApiEnneo.executeUdf(name, params)` — execute user-defined function
- `sdk.Api.call(method, url, headers={}, params=False)` → dict (external HTTP)
- `sdk.Api.call_raw(method, url, headers={}, params=False)` → Response object

**Helpers:**
- `sdk.Helpers.format_date(date_str, format='de')` → `DD.MM.YYYY`

**Authorization modes** (`authorizeAs`):
- `'user'` (default) — human agent's auth token
- `'serviceWorker'` — system token (required for auto-processing)

### Input Data Structure

```json
{
  "_action": null,
  "_metadata": {
    "ticketId": 123,
    "contractId": "715559",
    "from": "customer@example.com",
    "customerLegitimation": 20,
    "channel": "email",
    "aiSupportLevel": "human"
  },
  "date": "2024-04-01",
  "newIBAN": "DE68500105178297336485"
}
```

### Error Handling

**For `textTemplate`/`llm` response cases** (danger infos are lost):
```python
sys.stderr.write(f'Error: {error_details}')
sys.exit(1)
```

**For `interaction` response cases** (danger infos visible to agent):
```python
interaction.infos.append(sdk.IntentInfo(type='danger', message='Error description'))
stop(interaction)
```

### Timeouts
- SDK per-API-call timeout: **30s**
- Cortex total code-executor timeout: **45s**

---

## Testing

### Local Testing (Offline)

```bash
mkdir -p agents && cd agents
# Symlink SDK from code-executor
ln -sf ../code-executor/sdk/python311.py sdk.py

# Python venv with dependencies
python3 -m venv .venv && .venv/bin/pip install pydantic requests python-dateutil

# Extract code from a sample
curl -s "${BASE}/aiAgents/samples/4" -H "${AUTH}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['settings']['executor'][0]['code'])" > my_agent.py

# Create test input
cat > input.json << 'EOF'
{"_action": null, "_metadata": {"contractId": 715559}}
EOF

# Run
export SDK=sdk.py
.venv/bin/python my_agent.py
```

### Testing via `localExecutionCommand` (Real Data)

```bash
curl -s -X POST "${BASE}/executor/localExecutionCommand" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"id": {AGENT_ID}, "ticketId": {TICKET_ID}}'
```

Returns a shell command that downloads the SDK, pipes real parameters, and executes with a valid session token.

### End-to-End Verification via API

```bash
# 1. Create test ticket
TICKET_ID=$(curl -s -X POST "${BASE}/ticket" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"channel":"email","direction":"in","subject":"Test","body":"<p>Test message</p>","from":"test@example.com","process":"false"}' | jq -r '.id')

# 2. Trigger AI processing
curl -s "${BASE}/ticket/$TICKET_ID?refresh=true" -H "${AUTH}" > /dev/null

# 3. Check intents
curl -s "${BASE}/intent/byTicketId/$TICKET_ID" -H "${AUTH}" | jq '.intents[] | {id, aiAgentId, status}'

# 4. Execute intent (Phase 2)
curl -s -X POST "${BASE}/intent/{intentId}/execute" -H "${AUTH}" -H "Content-Type: application/json" -d '{}'

# 5. Verify execution
curl -s "${BASE}/intent/byTicketId/$TICKET_ID" -H "${AUTH}" | jq '.intents[] | {id, aiAgentId, status}'
```

### Syntax Check

```bash
python3 -m py_compile my_agent.py   # Python
node --check my_agent.js             # Node.js
php -l my_agent.php                  # PHP
```

---

## Smart Agent Structure

A smart agent has:
- **prompt** — Natural language instructions defining behavior
- **tools** — Available tools (builtin + custom KI-Tools)
- **channels** — Which channels this agent handles
- Channel-specific prompts (different behavior for email vs chat vs voice)
- No explicit parameters or code — the LLM handles it

Custom tools: Settings -> KI-Anpassung -> KI-Tools

---

## AI Processing Pipeline

When a customer message arrives:

```
Customer message → Mind → Cortex
  1. Analyze (language, sentiment, summary, spam check, body cleaning)
  2. Detect tags (reranker pre-filter → LLM classification, threshold ≥ 0.8)
  3. Detect AI agents (LLM scores agents → top match)
  4. Extract parameters (agent-specific via LLM + executors)
  5. Evaluate response cases (condition matching → recommended action)
  6. Return to Mind → create intent → optionally auto-execute
```

### Intent Lifecycle

```
[Created] → Ready → Executed
                  ↘ Invalidated (data changed)
                  ↘ Deleted (agent removed)
```

Key constraint: One active intent per `ticketId + aiAgentId + contractId`. Multiple executed intents can coexist (e.g., after customer follow-ups).

---

## Auto-Processing Evaluation Chain

A ticket auto-processes when ALL pass:

1. `enableAiAutoProcessing` setting enabled
2. Ticket status = `open`, not spam
3. Channel is not `chat` or `phone`
4. At least one intent with status `ready`
5. Response case has `autoExecute: true` matching `_actionNext`
6. That option is `recommended: true`
7. Only 1 auto-executable intent
8. No inbound customer reply in conversations
9. Customer legitimation >= 20 (if contract associated)

Even after passing, `autoExecuteAt` is only set if the agent ID is in `immediateAiAgents` setting. Otherwise: "Auto-processing possible, triggered manually".

---

## Agent Performance Reports

```bash
# Overall AI performance
curl -s "${BASE}/report/aiPerformance?lastDays=14" -H "${AUTH}"

# Specific agent performance
curl -s "${BASE}/report/aiAgentPerformance/{aiAgentId}?lastDays=14" -H "${AUTH}"
```

---

## Validation Checklist

Before deploying an agent:

- [ ] Flow completes in max 2 phases (`null` → action)
- [ ] Never sets `interaction.data["_action"]` directly
- [ ] Auto-executed response cases use `textTemplate`/`llm` (not `interaction`)
- [ ] Error paths use `sys.exit(1)` for `textTemplate`/`llm` response cases
- [ ] Phase 1 returns at least one option with `recommended=True`
- [ ] Only one option has `recommended=True` per phase
- [ ] Every `IntentOption.type` has a matching response case
- [ ] No orphan response cases without matching executor option
- [ ] Syntax check passes
- [ ] Agent outputs valid JSON to stdout, debug to stderr
- [ ] `_action` parameter included with `source: manual`, `visibility: hidden`
- [ ] `authorizeAs='serviceWorker'` for API calls that must work during auto-processing
- [ ] No side effects in Phase 1 (runs on every preview/refresh)

## Common Pitfalls

- **Side effects in Phase 1**: Guard with flags — Phase 1 runs on every refresh
- **Mutating `interaction.data["_action"]`**: Never do this — use `IntentOption.type` instead
- **Missing `sys.exit()`**: Always exit after printing interaction JSON
- **Auto-execute + `interaction` output**: Always fails — use `textTemplate`/`llm` instead
- **`customerNeeded: true` without customer**: Cortex returns early without running executor

## Source Code Reference

| Component | Location |
|-----------|----------|
| Agent detection | `cortex/src/services/ticket/agent_detection.py` |
| Parameter extraction | `cortex/src/services/ticket/process_parameters.py` |
| Response case handling | `cortex/src/services/ticket/response_case_handler.py` |
| Intent model | `mind/Mind/Models/Intent.php` |
| Auto-processing | `mind/Mind/Models/TicketAutoProcessing.php` |
| Cortex communication | `mind/Mind/Services/Cortex.php` |
| Code executor SDK | `code-executor/sdk/python311.py` |
