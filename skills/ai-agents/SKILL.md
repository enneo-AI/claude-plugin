---
name: ai-agents
description: Use when the user wants to create, modify, test, preview, inspect, or develop AI agents — including writing agent code, understanding agent structure, testing with real data, or debugging agent execution.
---

# AI Agent Management & Development

## Trigger
Use when the user wants to create, modify, test, preview, inspect, or develop AI agents — including writing agent code, understanding agent structure, testing with real data, or debugging agent execution.

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

## List & Inspect Agents

`GET /aiAgents` returns `{aiAgents: [...], success: true}` — not a bare array.

```bash
# Full details
curl -s "${BASE}/aiAgents?format=full" -H "${AUTH}" | jq '.aiAgents[] | {id, name, slug, intelligence, channels, tagId}'

# short = {id, name, tagId} · medium = + description, appearance, channels, timestamps · full = everything
curl -s "${BASE}/aiAgents?format=short" -H "${AUTH}"

# Search by name/description (fulltext, ordered by relevance)
curl -s "${BASE}/aiAgents?q=meter+reading&format=medium" -H "${AUTH}"

# Filters: intelligence=rulebased|smart, channel=<channel>, assignmentFilter=aiAutodetect, offset, limit (max 1000)
curl -s "${BASE}/aiAgents?intelligence=rulebased&format=medium" -H "${AUTH}"

# Agent tree grouped by tag — returns {topCandidates, aiAgentsTree}
curl -s "${BASE}/aiAgents/tree?format=medium" -H "${AUTH}"

# Get a specific agent (full config with executor code, response cases, parameters)
curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}"

# Summary only
curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" | jq '{id, name, slug, intelligence, channels, description, settingsKeys: (.settings | keys)}'
```

There is no `typeFilter` / `categoryFilter` — the live OpenAPI spec still lists them, but the
implementation ignores them. Filter client-side on `settings.executor[0].type` instead.

Without an explicit `intelligence` filter the listing hides Neo's internal agent types
(`neo`, `neo-capability`) — platform machinery, not agents the instance operates.

Agents whose `tagId` points at a tag the caller may not see are omitted from every listing. If an
agent seems missing, check the `viewPrivateTags` permission before assuming it was deleted.

## CRUD Operations

```bash
# Create (REQUIRES CONFIRMATION) — returns {aiAgent, success}
curl -s -X POST "${BASE}/aiAgent" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "description": "...", "channels": ["email"], "intelligence": "rulebased"}'

# Update (REQUIRES CONFIRMATION) — deep merge of the partial document onto the stored agent
curl -s -X PATCH "${BASE}/aiAgent/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "description": "Updated description"}'

# Delete (REQUIRES CONFIRMATION) — soft delete
curl -s -X DELETE "${BASE}/aiAgent/{id}" -H "${AUTH}"
```

**PATCH does not understand dot paths.** A key like `"settings.executor[0].code"` is stored as a
literal property name and silently changes nothing. The merge is recursive over objects but
**replaces arrays wholesale**, so updating executor code means sending the complete executor entry:

```bash
# Update just the executor code (REQUIRES CONFIRMATION)
CODE=$(python3 -c "import sys,json; print(json.dumps(open('my_agent.py').read()))")
EXECUTOR=$(curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" | jq -c ".settings.executor[0]")
curl -s -X PATCH "${BASE}/aiAgent/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "{\"settings\": {\"executor\": [$(echo "$EXECUTOR" | jq -c --argjson c "$CODE" '.code = $c')]}}"
```

**Writes are validated before they persist.** Mind asks Cortex to check referential integrity and
rejects the write with **422** and a `violations` array when a response case's condition operand or
`output.parameters[]` names a parameter id that no longer exists. This is the guard against the
`NO_RESPONSE_CASE` failure a partial PATCH used to cause. A Cortex outage fails open (the save goes
through), so a 422 is always a real config error.

## Import / Export & Version History

```bash
# Export a portable document — identity is the slug; ids, timestamps and example tickets are stripped
curl -s "${BASE}/aiAgent/{id}/export" -H "${AUTH}" > agent.json

# Import into another instance (REQUIRES CONFIRMATION) — upsert by slug, returns {aiAgent, action, success}
curl -s -X POST "${BASE}/aiAgent/import" \
  -H "${AUTH}" -H "Content-Type: application/json" -d @agent.json

curl -s "${BASE}/aiAgent/{id}/history" -H "${AUTH}"            # {history, currentVersion}, newest first
curl -s "${BASE}/aiAgent/{id}/history/{version}" -H "${AUTH}"  # one version's full snapshot

# Restore a version (REQUIRES CONFIRMATION) — append-only, writes a new 'restore' history row
curl -s -X POST "${BASE}/aiAgent/{id}/restore/{version}" -H "${AUTH}"
```

Every create, update, import and restore records a history row, so an accidental overwrite is
always recoverable — check `history` before rebuilding an agent by hand.

## Preview & Test

`ticketId` goes in the **body**, not the query string, and the body is the agent definition being
tested — so you can preview an unsaved change.

```bash
# Preview agent on a ticket (dry run — forced synchronous, never mutates the ticket)
BODY=$(curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" | jq -c '. + {ticketId: {ticketId}}')
curl -s -X POST "${BASE}/aiAgent/{id}/preview" \
  -H "${AUTH}" -H "Content-Type: application/json" -d "$BODY"
# Returns: success, error, dataOutcome, dataOutcomeInfo (timing), customerOutcome,
#          customerOutcomeType, detectedInputParameters, executorOutput, curlRequests

# Similar tickets for an agent
curl -s "${BASE}/aiAgent/{id}/similarTickets" -H "${AUTH}" | jq '[.[] | {id, subject, status, channel}]'

# Get local execution command (for testing locally with real data)
curl -s -X POST "${BASE}/executor/localExecutionCommand" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"id": {agentId}, "ticketId": {ticketId}}'
```

Do **not** pass a `previewType` query parameter — it re-points the call at a Cortex route that does
not exist and the request 404s. `preview` needs `updateAiAgent` and `localExecutionCommand` needs
`previewExecutors`: both accept executable code, so they are gated as code deployment, not as reads.

## Default & Sample Agents

```bash
# Available defaults — {availableAiAgents, success}
curl -s "${BASE}/aiAgents/availableDefaults" -H "${AUTH}" | jq '.availableAiAgents[] | {name, slug, description, intelligence}'

# Load defaults (REQUIRES CONFIRMATION) — OVERWRITES existing agents with the same slug
curl -s -X POST "${BASE}/aiAgents/loadDefaults" -H "${AUTH}"

# List sample agents (bare array, each with category + includedInSeeds)
curl -s "${BASE}/aiAgents/samples" -H "${AUTH}" | jq '[.[] | {id, name, description, category}]'

# Get specific sample (full definition with code)
curl -s "${BASE}/aiAgents/samples/{id}" -H "${AUTH}"
```

`loadDefaults` is a deliberate admin reset and replaces local edits to the seeded agents — export
first if the instance has customised any of them.

Samples worth reading: Contract Termination (Python — full two-phase flow, contract API calls, date
validation), Change Bank Data (PHP — IBAN validation, ERP integration), Auto Reply (Python —
minimal auto-executable template).

---

## Agent Intelligence Types

| Value | Description |
|-------|-------------|
| `rulebased` | Deterministic: parameters + executor + response cases |
| `smart` | LLM-powered: prompt + tools + wiki. No coding needed |
| `neo`, `neo-capability` | Reserved for Neo platform machinery — not client-authored agents |

`apiCall` and `visualEditor` are **executor types**, not intelligence values — see
`settings.executor[].type` below.

---

## Rule-Based Agent JSON Structure

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
    "responseCaseFormatVersion": 1,
    "personality": { "style": 2, "formality": 2 }
  }
}
```

Valid `channels`: `email`, `letter`, `chat`, `phone`, `portal`, `system`, `walkIn`. `["all"]` is
expanded to the full list on save.

### `settings.parameters[]` — Input Parameters

| Field | Description |
|-------|-------------|
| `id` | Unique numeric ID (use timestamp-based for new params) |
| `key` | Variable name in code (e.g. `newIBAN`, `date`) |
| `name` | Display name in UI |
| `type` | `str`, `int`, `float`, `bool`, `date`, `datetime`, `enum`, `list`, `dict` |
| `source` | Where the value comes from — see the table below |
| `sourceKey` | Field path, resolved against the object named by `source` |
| `description` | For `source: message` — the AI extraction prompt |
| `visibility` | `visible`, `hidden`, `readonly` |
| `required` | Whether the parameter must have a value |
| `value` | Default value (for `source: manual`) |
| `options` | For `type: enum` — array of `{id, label, value}` objects |

`type: object` is not valid — use `dict`.

| `source` | Resolved against | Available from |
|---|---|---|
| `ticket` | the Cortex ticket payload — `subject`, `sender`, `channel`, `message`, `tagIds`, … | always |
| `customer` | `customer.data` | after customer identification |
| `contract` | `contract.data`, fetched by `ticket.contractId` at evaluation time | after customer identification |
| `tag` | the ticket's tag ids (`sourceKey` ignored) | after tag detection |
| `message` | LLM extraction from the conversation | extraction step — never usable in detection conditions |
| `manual` | the literal `value` on the parameter | always |
| `executor` | a field of the executor's result | after the executor ran |
| `executorResult`, `executorNextAction`, `aiSmartAgent` | output-side sources, not executor input | — |

Pitfalls that reliably break detection conditions:

- **Contract attributes use `source: "contract"`.** `metadata.contract.*` does not exist, and
  `metadata.ticket.contract.*` is still `null` on a ticket's first processing run.
- **`sender`, not `from`** — Mind maps the ticket's `from` to `sender`.
- **`ticket.body` is one-shot** — Mind sends either the raw `body` or the cleaned `message`, never
  both, so `body` is populated only until the ticket has a `bodyClean`. Use `message` or `subject`.
- **An empty operand is evaluated, not skipped**, and a `sourceKey` that resolves against nothing
  looks identical to an empty value. Asserting operators (`Equal`, `Like`, `In`, comparisons,
  `RegEx`) fail; negating ones (`NotEqual`, `NotLike`, `NotIn`) **match** — so a mistyped path
  silently holds for every ticket. Only `IsNull` / `IsNotNull` test presence; `NotEqual "null"` does
  not. (`source: executor` is the exception: a missing field is a failed call and satisfies nothing.)

`GET /ticket/{ticketId}/variables` shows what each source actually resolves to for a given ticket —
use it before guessing a `sourceKey`.

**The `_action` parameter is mandatory.** Every agent must include one, and it is what the
orchestrator uses to track the phase:
`{"id": 1698862629088, "key": "_action", "name": "_action", "type": "str", "value": "null", "source": "manual", "visibility": "hidden"}`

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

- `type`: `sourceCode` or `apiCall`. (`visualEditor` exists in the enum but Cortex has no handler
  for it — anything but `apiCall` is treated as `sourceCode`.)
- `language`: `python311`, `node20`, `php82`
- `packages`: pip/npm packages (comma-separated)
- `parameters`: array of parameter IDs passed to the executor

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
  "output": { "type": "llm", "parameters": [2], "text": "" },
  "autoExecute": false,
  "description": "Customer needs to provide confirmation document."
}
```

**Output types:**

| Type | What happens | Auto-executable? |
|------|-------------|------------------|
| `interaction` | Shows infos/options to the human agent | No |
| `textTemplate` | Sends static template (Handlebars) | Yes |
| `llm` | AI generates customer reply from description | Yes |
| `textTemplateAndClose` | Template + close ticket | Yes |
| `closeTicket` | Closes ticket without reply | Yes |

**Condition operators:** `Equal`, `NotEqual`, `Like`, `NotLike`, `In`, `NotIn`, `GreaterThan`,
`GreaterThanEqual`, `LessThan`, `LessThanEqual`, `IsNull`, `IsNotNull`, `RegEx`, `Executor`.
Group operators: `And`, `Or`.

**`autoExecute: true` alone is not enough.** Mind derives the set of auto-executable `_action`
values by scanning response cases with `autoExecute: true` whose condition operands *all* reference
the `_action` parameter using **`Equal` or `In`**. A case that mixes in another parameter, or uses
any other operator on `_action`, is silently excluded from auto-processing.

### `settings.detectionDetails` — When to Trigger

```json
{
  "type": "aiDetection",
  "customerNeeded": true,
  "aiDetection": { "detectionPrompt": "The customer wants to terminate their contract" },
  "conditions": { "id": 1, "operands": [], "operator": "And" },
  "parameters": []
}
```

| Detection type | Description |
|----------------|-------------|
| `aiDetection` | LLM decides based on message content |
| `conditionDetection` | Triggers on field values (sender, tag, contract status, …) |
| `aiAndConditionDetection` | Both must match |
| `aiOrConditionDetection` | Either matches |
| `manualAssignment` | Only when manually assigned |
| `customLogic` | Declared but **not implemented** — never fires |

`customerNeeded: true` (default) requires customer identification before running. Set to `false` if
the agent doesn't need contract/customer data.

---

## Two-Phase Execution Model

Every rulebased agent runs in exactly **two phases**, and **there is no Phase 3** — the orchestrator
does not loop after Phase 2.

**Phase 1 (`_action = null`) — display and offer options.** Extract and display data, add `infos`
(success/warning/danger/neutral), return `options`. It must return at least one option with
`recommended=True` or auto-processing cannot proceed, and it must have **no side effects**: it runs
again on every preview, refresh and initial load.

**Phase 2 (`_action = "<ACTION_NAME>"`) — execute business logic.** Validate, call external APIs,
return the final result. On error, `sys.exit(1)` for `textTemplate`/`llm` response cases.

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
- `sdk.load_input_data(include_metadata=True)` → dict with `_action`, `_metadata`, form fields
- `sdk.Interaction(data=input_data)` → result object with `infos`, `options`, `data`, `form`
- `sdk.IntentInfo(type, message, extra_info, code)` — type: `success`, `warning`, `danger`, `neutral`
- `sdk.IntentOption(type, name, recommended, icon, order)` — action button
- `sdk.Form.from_input(input_data)` / `sdk.FormField` — build the agent-facing form from `_metadata.inputParameters`
- `sdk.is_bot_conversation()` → True in chatbot/voicebot runs, False for email or human-assisted
- `sdk.get_sdk_version()`

**Enneo API access** (`sdk.ApiEnneo`):
- `get_contract(contract_id)` → dict (`id`, `firstname`, `lastname`, `status`, `startDate`, `endDate`, `iban`, `monthlyDeposit`, `consumption`, `productName`, `rawData`, …)
- `get_ticket(ticket_id)` → dict (`id`, `subject`, `bodyClean`, `channel`, `status`, `customerId`, `contractId`, …)
- `get` / `post` / `patch` / `put` / `delete(endpoint, …, authorizeAs='user')` — generic calls
- `executeUdf(name, params, authorizeAs='user')` — run a user-defined function
- `getSecret(key)` — resolve a value from the `executorSecrets` setting (never hardcode credentials)
- `get_file_from_storage(path)` → bytes

**Other:** `sdk.Api.call(method, url, headers={}, params=False, verify=True, timeout=None)` → dict
and `sdk.Api.call_raw(...)` → Response for external HTTP; `sdk.Setting.get/set(name, …)` for
instance settings; `sdk.Helpers.format_date`, `parse_date_to_ymd`, `boolval`, `format_iban`,
`validate_iban_formatting`.

**Authorization modes** (`authorizeAs`):
- `'user'` (default) — the human agent's token. Work is booked to that user.
- `'serviceWorker'` — the sandbox's machine account. Required where no human session exists
  (auto-processing) and for elevated writes, but it also books the worklog to the machine account,
  which reporting counts as fully automated. Keep user-triggered actions on `'user'`.

### Input Data Structure

```json
{
  "_action": null,
  "_metadata": {
    "ticketId": "123",
    "contractId": "715559",
    "channel": "email",
    "aiSupportLevel": "human",
    "userIdOfRequester": "42",
    "inputParameters": [{ "id": 1, "key": "newIBAN", "type": "str", "visibility": "visible" }]
  },
  "date": "2024-04-01",
  "newIBAN": "DE68500105178297336485"
}
```

`_metadata` carries exactly those six keys. It has no `from` and no `customerLegitimation` — read
the sender from the ticket (`sdk.ApiEnneo.get_ticket`) if you need it.

### Error Handling

**For `textTemplate`/`llm` response cases** (danger infos are lost):
```python
sys.stderr.write(f'Error: {error_details}')
sys.exit(1)
```

**For `interaction` response cases** (danger infos visible to the agent):
```python
interaction.infos.append(sdk.IntentInfo(type='danger', message='Error description'))
stop(interaction)
```

### Timeouts

The whole executor run is bounded by Cortex at **45 s** by default
(`sourceCodeExecutorTimeout` setting). SDK calls have **no timeout of their own** — an unresponsive
backend consumes the entire budget, so pass `timeout=` explicitly on `sdk.Api.call` /
`call_raw` for anything external, and prefer batch endpoints over many round trips.

---

## Testing

### Local Testing (Offline)

```bash
mkdir -p agents && cd agents
ln -sf ../code-executor/sdk/python311.py sdk.py           # SDK from code-executor
python3 -m venv .venv && .venv/bin/pip install pydantic requests python-dateutil

# Extract code from an agent (or a sample)
curl -s "${BASE}/aiAgent/{id}" -H "${AUTH}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['settings']['executor'][0]['code'])" > my_agent.py

# Run — phase 1 then phase 2
export SDK=sdk.py
echo '{"_action": null, "_metadata": {"contractId": "715559"}}' | .venv/bin/python my_agent.py
echo '{"_action": "PROCESS_REQUEST", "_metadata": {"contractId": "715559"}}' | .venv/bin/python my_agent.py
```

`POST /executor/localExecutionCommand` (above) returns a shell command that does the same against
**real** ticket data — it downloads the SDK, pipes the extracted parameters and supplies a session
token. `"Cortex did not execute the code executor"` almost always means `customerNeeded: true` with
no customer identified on that ticket.

### End-to-End Verification via API

```bash
# 1. Create test ticket (REQUIRES CONFIRMATION)
TICKET_ID=$(curl -s -X POST "${BASE}/ticket" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"channel":"email","direction":"in","subject":"Test","body":"<p>Test message</p>","from":"test@example.com","process":"false"}' | jq -r '.id')

# 2. Trigger AI processing
curl -s "${BASE}/ticket/$TICKET_ID?refresh=true" -H "${AUTH}" > /dev/null

# 3. Check intents
curl -s "${BASE}/intent/byTicketId/$TICKET_ID" -H "${AUTH}" | jq '.intents[] | {id, aiAgentId, status}'

# 4. Execute intent (Phase 2) (REQUIRES CONFIRMATION) — body may carry data, _action, informCustomer, dryRun
curl -s -X POST "${BASE}/intent/{intentId}/execute" -H "${AUTH}" -H "Content-Type: application/json" -d '{}'

# 5. Verify execution
curl -s "${BASE}/intent/byTicketId/$TICKET_ID" -H "${AUTH}" | jq '.intents[] | {id, aiAgentId, status}'
```

`"dryRun": true` in step 4 simulates the execution without any write calls to backend systems —
use it before running a destructive action against production data.

Other intent endpoints: `GET /intent/{id}`, `PUT /intent/{id}` (operator edit),
`DELETE /intent/{id}`, `GET /intent/list`, `GET /intent/preview/{aiAgentId}`.

### Syntax Check

```bash
python3 -m py_compile my_agent.py   # Python
node --check my_agent.js             # Node.js
php -l my_agent.php                  # PHP
```

---

## Smart Agent Structure

A smart agent has:
- **instructions** — `settings.smartIntelligenceInstruction`, with channel overrides
  `smartIntelligenceInstructionChat` and `smartIntelligenceInstructionPhone`
- **`smartIntelligenceSystemPrompt`** (bool, defaults to true) — whether Enneo's own system prompt
  guidelines wrap the instructions
- **tools** — builtin + custom KI-Tools (Settings → KI-Anpassung → KI-Tools)
- **channels** — which channels this agent handles
- No explicit parameters or code — the LLM handles it

Instructions support placeholders resolved at run time: `CURRENT_DATE`, `CURRENT_TIME`, `CHANNEL`,
`CUSTOMER_MESSAGE_DATE`, `SYSTEM_LANGUAGE`. An unknown placeholder name does not abort processing —
it is recorded as an invalid-prompt-config alert and the default template is used instead, so a
typo shows up as "the agent ignored my prompt" rather than as an error.

**Quality scorecard criteria are injected into the system prompt.** Cortex fetches the instance's
active scorecards and takes the AI-evaluable criteria from the first card whose assignment matches
the channel, rendering them as a `## Quality Guidelines` section between the instructions and the
guardrails. Changing a scorecard therefore changes smart-agent behaviour — if replies suddenly shift
tone or start covering extra points, check the scorecards before the agent prompt. No matching
scorecard means no section is added.

```bash
# Assemble and inspect the full system prompt an agent will run with
curl -s -X POST "https://${ENNEO_INSTANCE}/api/cortex/system-prompt" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"aiAgentId": "{id}", "channel": "email"}'
```

---

## AI Processing Pipeline

When a customer message arrives:

```
Customer message → Mind → Cortex
  1. Analyze (language, sentiment, summary, spam check, body cleaning)
  2. Detect tags (condition tags directly; AI tags via reranker pre-filter → LLM)
  3. Detect AI agents (LLM scores agents → top match; condition-matched agents always run)
  4. Extract parameters (agent-specific via LLM + executors)
  5. Run the executor (Phase 1) and evaluate response cases → recommended action
  6. Return to Mind → create intent → optionally auto-execute
```

Mind can scope a re-run with `refreshMode`: `full`, `summaryAndText`, `customer`, `tags`,
`tagsRuleBased`, `agents`. `refreshMode: "agents"` with `intentIds=[X]` bypasses agent detection
entirely and re-runs only the named agents — that is what the per-intent refresh button does.

### Intent Lifecycle

Statuses: `preview`, `ready`, `executed`, `invalidated` (source data changed, will re-run),
`deleted`. A unique index enforces one active (`ready`/`preview`/`invalidated`) intent per
`ticketId + aiAgentId + contractId`; executed intents are excluded, so several coexist as audit
history after customer follow-ups. A **terminal** executed intent (a text-type outcome, or an
interaction with no remaining options) is never reused — the next cycle inserts a fresh `ready` row.

### Several agents on one ticket

Agents are detected and executed independently and each produces its own reply text; nothing merges
them during processing. Inserting a second agent's reply into a draft that already holds another's
goes through a reconciliation pass — `POST /ticket/textUpdate` with
`updateTask: "reconcileResponses"`, the pre-insertion draft in `fullText`, the new reply in
`newFragment`. It removes repetition and already-fulfilled requests while preserving successful
outcomes, refusals, unresolved issues, and the existing wording, greeting, signature and HTML
structure. Auto-processing takes a different route: it refuses to run at all when more than one
intent is auto-executable.

---

## Auto-Processing Evaluation Chain

Evaluated in this order; the **first** failure aborts and its message reaches the `autoProcessing`
trace:

1. The ticket has intents loaded at all
2. Ticket status is `open`
3. Not marked spam (`auto_spam` / `auto_programmatic` / `manual_spam`)
4. Channel is not `chat` or `phone`
5. Direction is not `out` or `internal`
6. `enableAiAutoProcessing` setting is enabled
7. **Every** `ready` intent passes `canBeAutoExecuted()` — one failing intent aborts the whole
   evaluation rather than being skipped. An intent passes when it has an option with
   `recommended: true` whose `type` is in the agent's derived auto-executable `_action` set
8. Exactly one intent came out auto-executable
9. No conversation with `direction: in`
10. `customerLegitimation >= 20`, only when the ticket has a `contractId` (hardcoded — not the
    `customerLegitimationThreshold` setting used by contract recognition)

Passing only marks the ticket. `autoExecuteAt` stays null unless **every** agent among the ticket's
intents is listed in `immediateAiAgents` — one non-immediate agent on a mixed ticket is what the UI
shows as "Auto-processing possible, triggered manually". With that satisfied,
`autoProcessingDelayEnabled` off means now; on means `autoProcessingDelay` hours after the last
message, by SLA.

`POST /ticket/{id}/autoexecute` accepts `executeAgentId`, `allowMultipleIntents` and
`allowWithReplies` to relax gates 8 and 9 for a manual repro — the cron path never passes them, so a
successful manual run does not prove the timer will fire.

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

- [ ] Flow completes in max 2 phases (`null` → action); no side effects in Phase 1
- [ ] Phase 1 returns exactly one option with `recommended=True`
- [ ] Every `IntentOption.type` has a matching response case, and vice versa
- [ ] Auto-executed response cases use `textTemplate`/`llm`/`closeTicket`, not `interaction`
- [ ] Every `autoExecute: true` case tests only `_action`, with `Equal` or `In`
- [ ] No response case operand or `output.parameters[]` names a deleted parameter id (a save
      returning 422 with `violations` is exactly this)
- [ ] `_action` parameter present with `source: manual`, `visibility: hidden`
- [ ] Never sets `interaction.data["_action"]` directly — use `IntentOption.type`
- [ ] Error paths use `sys.exit(1)` for `textTemplate`/`llm` response cases
- [ ] Agent outputs valid JSON to stdout and exits; debug goes to stderr
- [ ] `authorizeAs='serviceWorker'` for API calls that must work during auto-processing
- [ ] Explicit `timeout=` on every external HTTP call
- [ ] Syntax check passes

## Common Pitfalls

- **Side effects in Phase 1**: guard with flags — Phase 1 runs on every preview and refresh
- **Dot-path PATCH**: `"settings.executor[0].code"` is not a path; send the nested object, and send
  arrays complete because the merge replaces them
- **Missing `sys.exit()`** after printing: the script keeps running and emits a second JSON document
- **Auto-execute + `interaction` output**: always falls back to human review
- **`customerNeeded: true` without a customer**: Cortex returns early without running the executor
- **Wrong `sourceKey`**: resolves to nothing, which silently satisfies every negating operator —
  check `GET /ticket/{id}/variables` rather than guessing
