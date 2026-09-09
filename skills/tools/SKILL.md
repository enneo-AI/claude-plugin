---
name: tools
description: Use when the user wants to list, inspect, or execute AI tools, UDFs, or code executors.
---

# AI Tools Management

## Trigger
Use when the user wants to list, inspect, or execute AI tools, UDFs, or code executors.

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

## List Tools

```bash
curl -s "${BASE}/tools" -H "${AUTH}" | jq '.tools[] | {id, name, type, slug}'
```

Returns `{success, tools: [...]}`. Each entry has `id`, `name`, `description`, `type` and `slug`.
`type` is `builtin` (platform tools) or `custom` (a UDF marked as a tool).

## Get Tool Details

```bash
curl -s "${BASE}/tools/{identifier}" -H "${AUTH}"
```

Identifier: numeric id or slug. Returns `id`, `type`, `name`, `description`, `parameters`, `async`,
`slug` and the `executor` object.

**Custom tools only.** A builtin id here answers 404 `Tool not found` — builtins have no stored
executor, so `/tools` is the only place they appear. A UDF that exists but is not marked as a tool,
or has no executor, also answers 404 with a message saying which.

## Execute a Tool (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/tools/{identifier}/run" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"param1": "value1", "param2": "value2"}'
```

Needs `runExecutors`, plus the executor's own read permission. Parameters are validated before
execution and a violation answers 400 listing every problem at once: a missing required parameter,
or a value whose type is not `int`, `float`, `str`, `bool` or `enum`. An `enum` value is matched
against the option **labels**, not the option values. A non-zero exit code from the code comes back
as 400 with the output.

---

## Code Executor

```bash
# Preview (runs the posted code without saving it)
curl -s -X POST "${BASE}/executor/preview?name={executorName}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"code": "print(\"hello\")", "type": "sourceCode", "language": "python311",
       "parameterDefinitions": [{"id": 1, "key": "foo", "value": "bar"}]}'

# Execute a saved executor by name
curl -s -X POST "${BASE}/executor/execute/_user-defined-function[3]" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"param1": "value1"}'

# Get a local execution command (for testing rule-based AI agent code locally)
curl -s -X POST "${BASE}/executor/localExecutionCommand" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"id": {aiAgentId}, "ticketId": {ticketId}, "settings": {...}}'
```

**Preview is a deployment, and is gated like one.** `previewExecutors` alone is not enough: when the
posted `code` differs from what is stored, the caller also needs the stored executor's *write*
permission (`updateAiAgent`, `eventHooks`, `customerSearch`, … — see the `settings-config` skill).
For an executor that does not exist yet, the fallback is `eventHooks` for a name starting with
`_event-hook` and `updateAiAgent` for everything else. Unchanged code only needs the read
permission. `language` defaults to `php82` when omitted; a non-zero exit answers 400.

`localExecutionCommand` returns `{unix, windows}` — a shell command that downloads the SDK, pipes the
real ticket's parameters in and runs the code with a valid token. It requires `previewExecutors`,
works only for a rule-based AI agent whose executor is `type: sourceCode`, and answers 501 otherwise.
The result is cached for a day per user and payload.

---

## Builtin Tools

Platform tools every smart AI agent can call. They are not configurable and have no executor:

| Tool id | Slug | What it does |
|---------|------|--------------|
| `GetKnowledgeBaseEntries` | `get_knowledge_base_entries` | Retrieve entries from the knowledge base (wiki) |
| `GetCustomerAndContractData` | `get_customer_and_contract_data` | Retrieve the customer and contract data |
| `GetResponseExamples` | `get_response_examples` | Look up responses used in the past for similar customer requests |
| `GetCustomerTicketHistory` | `get_customer_ticket_history` | Retrieve the customer's ticket history |

## Custom Tools (UDFs)

A user-defined function with `udfType: "tool"` becomes available to smart AI agents during
processing. Its `slug` is generated on first listing if absent, and is what the AI agent calls it by.

```bash
# List only the UDFs exposed as tools
curl -s "${BASE}/settings/user-defined-function?filter=tool" -H "${AUTH}" \
  | jq '.userDefinedFunctions[] | {id, name, slug}'

# Create (REQUIRES CONFIRMATION) — creation takes the name and type only
curl -s -X POST "${BASE}/settings/user-defined-function" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "myTool", "udfType": "tool"}'

# Then attach code, description and parameters (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_user-defined-function[{id}].description": "What the tool does",
       "_user-defined-function[{id}].udfExecutor": {"type": "sourceCode", "language": "python311", "code": "..."}}'
```

Managing a tool's code needs `updateAiAgent`; without it the listing endpoint withholds
`udfExecutor` entirely. Full UDF lifecycle: the `settings-config` skill.

Languages: `python311`, `node20`, `php82`. Executor types: `sourceCode`, `apiCall`, `visualEditor`.

### SDK available in tools

Tools and UDFs get the same SDK as rule-based AI agents. It is loaded from the path in the `SDK`
environment variable, so the namespace differs by language — `sdk.` in Python, the top-level class in
Node, `EnneoSDK\` in PHP:

```python
file_path = os.getenv('SDK', 'sdk.py')
spec = importlib.util.spec_from_file_location('sdk', file_path)
sdk = importlib.util.module_from_spec(spec); spec.loader.exec_module(sdk)
contract = sdk.ApiEnneo.get_contract(123)
```
```php
use EnneoSDK\ApiEnneo;
require(getenv()['SDK'] ?? 'sdk.php');
$contract = ApiEnneo::getContract(contractId: 123);
```

| Class | Surface |
|-------|---------|
| `ApiEnneo` | `get`, `post`, `patch`, `put`, `delete` against the Enneo API (each takes `authorizeAs`, default `user`), plus `getContract`, `getTicket`, `executeUdf`, `getSecret`, `getFileFromStorage` |
| `Api` | `call` / `call_raw` — arbitrary external HTTP, with an optional per-call `timeout` |
| `Setting` | `get` / `set` — persistent instance settings |
| `Input` | `load()` — the parameters Enneo extracted from the ticket. In PHP already bound as `$in` |
| `Helpers` | `formatDate`, `parseDateToYMD`, `boolval`, `formatIban`, `validateIbanFormatting` |
| `AppStorage` / `AppInfo` | Key-value storage and identity for Apps |

Python and Node spell the methods in their own conventions (`get_contract` / `getContract`).

### Timeouts

- **Total execution: 50 seconds**, hard-coded per run. The process group is killed on expiry, so
  spawned children die with it.
- **Package installation: 120 seconds**, separate from the execution budget.
- **Per API call:** no platform-wide cap. The PHP SDK defaults to 60s (`$SDK_API_TIMEOUT`, and every
  call takes a `$timeout` override); the Python and Node SDKs wait indefinitely unless the call
  passes a `timeout`. A slow external API therefore burns the 50-second execution budget silently —
  pass an explicit timeout in Python and Node.
