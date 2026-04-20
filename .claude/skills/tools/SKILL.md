# AI Tools Management

## Trigger
Use when the user wants to list, inspect, or execute AI tools, UDFs, or code executors.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## List Tools

```bash
curl -s "${BASE}/tools" -H "${AUTH}" | jq '.tools[] | {name, type}'
```

Types: `builtin` (system tools) and `custom` (UDFs marked as tools).

## Get Tool Details

```bash
curl -s "${BASE}/tools/{identifier}" -H "${AUTH}"
```

Identifier: numeric ID or slug. Returns: name, description, parameters, executor config.

## Execute a Tool (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/tools/{identifier}/run" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"param1": "value1", "param2": "value2"}'
```

Required parameters are validated before execution.

---

## Code Executor

```bash
# Preview (dry run)
curl -s -X POST "${BASE}/executor/preview" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"code": "print(\"hello\")", "language": "python"}'

# Execute a named UDF
curl -s -X POST "${BASE}/executor/execute/{name}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"param1": "value1"}'

# Get local execution command (for testing agent code locally)
curl -s -X POST "${BASE}/executor/localExecutionCommand" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"id": {agentId}, "ticketId": {ticketId}}'
```

The `localExecutionCommand` returns a shell command that downloads the SDK, pipes real ticket parameters, and executes with a valid token — useful for local agent development.

---

## Builtin Tools

System tools available to smart agents:
- `GetKnowledgeBaseEntries` — Search wiki articles
- Other platform-specific tools

## Custom Tools (UDFs)

User-defined functions marked as tools become available to smart agents during processing.

Create/manage via Settings API:
```bash
# List UDFs
curl -s "${BASE}/settings/user-defined-function" -H "${AUTH}"

# Create UDF (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings/user-defined-function" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "myTool", "code": "...", "language": "python311", "isTool": true}'
```

Languages: `python311`, `node20`, `php82`

### SDK Available in Tools

Tools/UDFs have access to the same SDK as AI agents:
- `sdk.ApiEnneo.get/post/patch()` — Enneo API access
- `sdk.Api.call()` — External HTTP calls
- `sdk.Setting.get/set()` — Persistent storage

### Timeouts
- Per API call: **30s**
- Total execution: **45s**
