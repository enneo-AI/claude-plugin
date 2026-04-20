# Settings & Configuration

## Trigger
Use when the user wants to view or modify instance settings, subchannels, UDFs, event hooks, or understand configuration options.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Get Settings

```bash
# All settings
curl -s "${BASE}/settings" -H "${AUTH}" | jq '[.[] | {name, value, category}]'

# Compact (key-value)
curl -s "${BASE}/settings/compact" -H "${AUTH}"

# Filter by name
curl -s "${BASE}/settings?filterByName=enableAi" -H "${AUTH}"

# Filter by category
curl -s "${BASE}/settings?filterByCategory=email" -H "${AUTH}"

# Filter by module
curl -s "${BASE}/settings?filterByUsedBy=cortex" -H "${AUTH}"

# Show secrets
curl -s "${BASE}/settings?showSecrets=true" -H "${AUTH}"

# By category (grouped)
curl -s "${BASE}/settings/category/{category}" -H "${AUTH}"

# Search
curl -s "${BASE}/settings/search?q=last+agent+routing" -H "${AUTH}"
```

## Update Settings (REQUIRES CONFIRMATION)

```bash
# Single setting
curl -s -X PUT "${BASE}/settings/{settingName}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '"new-value"'

# JSON setting
curl -s -X PUT "${BASE}/settings/{settingName}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"key1": "value1", "key2": "value2"}'

# Multiple settings
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"setting1": "value1", "setting2": 42}'

# Tag properties via settings
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_tag[123].name": "New Name", "_tag[123].visibility": "enabled"}'
```

---

## Key Settings Reference

### AI & Processing

| Setting | Description |
|---------|-------------|
| `enableAiAgents` | Master switch for AI agent processing |
| `enableAiAutoProcessing` | Enable dark processing / auto-execution |
| `immediateAiAgents` | Agent IDs that auto-execute immediately (JSON array) |
| `autoProcessingDelayEnabled` | Whether to delay auto-execution |
| `autoProcessingDelay` | Hours to delay (respects business hours) |

### Routing

| Setting | Description |
|---------|-------------|
| `lastAgentRouting` | Route follow-ups to previous agent |
| `lastTeamRouting` | Route follow-ups to previous team |
| `autopilotMode` | Autopilot tag matching: ALL vs AT_LEAST_ONE |

### Email & Communication

| Setting | Description |
|---------|-------------|
| `genericTemplateId` | Default email template ID |
| `reportingPrivacyLevel` | Privacy for exports: pseudonymized, partiallyPseudonymized, none |
| `defaultDateExportFormat` | Default export format (xlsx, csv, json) |

### Customer Recognition

| Setting | Description |
|---------|-------------|
| `contractRecognitionCriteria` | Legitimation matching rules |
| `customerNeededDefault` | Whether agents need customer by default |

---

## Subchannels (Mailboxes / Chat Channels)

```bash
# List
curl -s "${BASE}/settings/subchannel" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings/subchannel" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "support@company.com", "channel": "email"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/settings/subchannel/{id}" -H "${AUTH}"
```

Microsoft 365 OAuth:
```bash
# Start OAuth flow
curl -s "${BASE}/settings/mailbox/microsoft/authorization" -H "${AUTH}"
```

---

## User-Defined Functions (UDFs)

Custom code fragments callable from agents, events, webhooks, or external requests.

```bash
# List
curl -s "${BASE}/settings/user-defined-function" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings/user-defined-function" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "myFunction", "code": "...", "language": "python311"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/settings/user-defined-function/{id}" -H "${AUTH}"
```

Languages: `python311`, `node20`, `php82`

UDFs marked as tools become available to smart agents for execution.

---

## Event Hooks

Async triggers that run code when events occur.

```bash
# List
curl -s "${BASE}/settings/event-hook" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings/event-hook" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"event": "TicketCreated", "handler": "myFunction"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/settings/event-hook/{id}" -H "${AUTH}"
```

### Available event types
`TicketCreated`, `TicketUpdated`, `TicketResponse`, `TicketRouted`, `TicketForwarded`, `TicketClosedDueToInactivity`, `ConversationCreated`, `AutoProcessIntent`, `ProfileCreated`, `ProfileUpdated`, `ProfileDeleted`, `EmailAutoresponder`, `SendEmail`, `CronMinute` (5m), `CronHour`, `CronDay`, `CronWeek`, `TestTicketAiQuality`
