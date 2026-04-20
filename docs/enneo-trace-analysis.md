# Enneo Ticket Processing Trace — Analysis Prompt

Use this prompt (with the jq pre-processing commands below) to give an LLM the key facts from a ticket processing trace without overwhelming it with the full ~500KB JSON.

---

## Step 1: Pre-extract the data using jq

Assuming the trace JSON is stored in `$FILE`, run these commands and feed their output to the LLM as labeled sections.

```bash
# --- A) Event overview (status, duration, ticket ID) ---
cat "$FILE" | jq '.events[] | {id, type, status, duration, ticketId, contractId}'

# --- B) Input ticket (what the customer sent) ---
cat "$FILE" | jq '.events[0].data | {sender, subject, channel, date, body}'

# --- C) All trace types and activities (table of contents) ---
cat "$FILE" | jq '[.events[0].traces[] | {type, activity}]'

# --- D) LLM calls — models used, what they returned ---
cat "$FILE" | jq '[.events[0].traces[] | select(.type == "llm") | {activity, model: .data.model, generationName: .data.generationName, duration, response: .outcome.message}]'

# --- E) Contract detection — how the contract was identified and legitimation checked ---
cat "$FILE" | jq '[.events[0].traces[] | select(.type == "contractDetection") | {activity, data, detectionLog: .outcome.detectionLog}]'

# --- F) Source code / business logic executions — user-defined code that ran ---
cat "$FILE" | jq '[.events[0].traces[] | select(.type == "sourceCode") | {activity, name: .data.name, definitionSource: .data.definitionSource, outcome: .outcome}]'

# --- G) AI processing log messages (compact — only the msg field matters) ---
cat "$FILE" | jq '[.events[0].traces[] | select(.type == "aiProcessing") | .data.msg]'

# --- H) Auto-processing results — could the ticket be handled automatically? ---
cat "$FILE" | jq '[.events[0].traces[] | select(.type == "autoProcessing") | {activity, success: .data.success, candidates: .data.candidates, message: .data.message}]'

# --- I) Outcome alerts — warnings, overrides, and issues ---
cat "$FILE" | jq '[.events[0].outcome.alerts[] | {code, severity, message}]'

# --- J) Final detected intents — what AI agents were triggered and their results ---
cat "$FILE" | jq '[.events[0].outcome.detectedIntents[] | {aiAgentId, responses: [.responses[] | {type, options: .content.options, infos: .content.infos, data: .content.data}]}]'

# --- K) Outcome summary — final ticket state ---
cat "$FILE" | jq '.events[0].outcome.ticket | {summary, action, aiSupportLevel, closeTicket, direction}'
```

---

## Step 2: LLM Prompt

Paste the outputs from above (labeled A through K) and then use this prompt:

---

You are analyzing an Enneo ticket processing trace. The data below was extracted from a single ticket processing event. Your job is to understand what happened and report on it clearly.

### Data structure guide

The trace is a single event of type `cortexProcessTicket` containing an array of ***traces*** — each trace represents one step in the processing pipeline. The key trace types are:

| Trace type | What it tells you |
|---|---|
| **`llm`** | An LLM call that was made during processing. Key fields: `model` (which model was used), `generationName` (the purpose — e.g. `analyze_ticket`, `validate_ticket_ai_tags`, `validate_ticket_ai_agent`, `extract_ticket_parameters_with_ai_*`), `response` (the LLM's JSON output), `duration` (seconds). |
| **`contractDetection`** | How the system identified which customer contract this ticket belongs to. Look at `detectionLog` for the step-by-step legitimation check (which criteria passed/failed). |
| **`sourceCode`** | User-defined business logic (JavaScript/TypeScript) that executed. The `name` identifies the function, `outcome.output` has its return value, `outcome.exitCode` / `outcome.stderr` indicate errors. |
| **`aiProcessing`** | Internal processing log entries. Each entry's `.data.msg` field contains the log message — this is the only relevant field (ignore the rest of the data object). Read these chronologically to follow the processing flow. |
| **`autoProcessing`** | Whether the ticket could be auto-processed without human intervention. `success: false` means a human agent needs to review. `candidates` lists which AI agents were considered. `message` explains why auto-processing was blocked. |

### The event outcome

The event's `outcome` object contains the final results:

- **`alerts`**: Warnings and overrides that occurred (e.g. executor overriding extracted parameters, missing values). Each has a `code`, `severity`, and `message`.
- **`detectedIntents`**: The AI agents that were triggered, each with `responses` containing `options` (actions the human agent can take), `infos` (contextual information/warnings), and `data` (extracted parameters).
- **`ticket`**: Final ticket state including `summary`, `aiSupportLevel`, and `closeTicket`.
