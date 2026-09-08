---
name: settings-config
description: Use when the user wants to view or modify instance settings, subchannels, UDFs, event hooks, feature flags, or understand configuration options.
---

# Settings & Configuration

## Trigger
Use when the user wants to view or modify instance settings, subchannels, UDFs, event hooks, feature flags, or understand configuration options.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they handle OAuth transparently and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

The MCP server writes all credentials (instance + access/refresh tokens) to `~/.enneo/env`. Source it to use curl directly:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN, ENNEO_REFRESH_TOKEN, ENNEO_TOKEN_EXPIRES_AT
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

Every request body is parsed as JSON — send `Content-Type: application/json`; form-urlencoded is ignored.

---

## Get Settings

```bash
# All settings
curl -s "${BASE}/settings" -H "${AUTH}" | jq '[.[] | {name, value, category}]'

# Compact (key-value)
curl -s "${BASE}/settings/compact" -H "${AUTH}"

# One setting, full object (404 if the name is unknown)
curl -s "${BASE}/settings/enableAiAgents" -H "${AUTH}"

# Filter by name
curl -s "${BASE}/settings?filterByName=enableAiAgents" -H "${AUTH}"

# Filter by category
curl -s "${BASE}/settings?filterByCategory=email" -H "${AUTH}"

# Filter by consuming service: fe, mind, cortex, acd, ioProxy, auth
curl -s "${BASE}/settings?filterByUsedBy=cortex" -H "${AUTH}"

# Show secrets
curl -s "${BASE}/settings?showSecrets=true" -H "${AUTH}"

# By category, grouped exactly as the settings UI renders it
curl -s "${BASE}/settings/category/{category}" -H "${AUTH}" \
  | jq '.groups[] | {group: .name, settings: [.settings[].name]}'

# The settings dashboard: sections, tiles, and which tiles are locked
curl -s "${BASE}/settings/uiOverview" -H "${AUTH}"

# Search
curl -s "${BASE}/settings/search?q=routing" -H "${AUTH}"
```

`showSecrets=true` is honoured only for a caller holding `readSecretSettings`; otherwise credential
fields come back masked. It works on `/settings`, `/settings/compact`, `/settings/{name}` and
`/settings/category/{category}`.

**`/settings` lists definitions; `/settings/category/{category}` lists what is actually visible.**
The category path runs the read handlers, so a setting present in `/settings` can be absent there —
hidden by a visibility handler, by `readPermissions`, or by a feature flag. When a user says "the
setting isn't in the UI", ask the category path, not the flat list.

Dynamic per-object categories take an id suffix:
`mailbox_{id}`, `chatbot_{id}`, `phonebot_{id}`, `letter_{id}`, `tag_{id}`,
`user-defined-function_{id}`, `event-hook_{id}`.

## Update Settings (REQUIRES CONFIRMATION)

```bash
# Single setting — the body is the raw JSON value, not {"value": ...}
curl -s -X PUT "${BASE}/settings/{settingName}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '"new-value"'

# JSON setting
curl -s -X PUT "${BASE}/settings/{settingName}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"key1": "value1", "key2": "value2"}'

# Multiple settings at once
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"locale": "de", "timeZone": "Europe/Berlin"}'

# Nested keys — tag, subchannel, UDF and event-hook properties
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_tag[123].name": "New Name", "_tag[123].visibility": "private"}'
```

Permissions are checked per setting, so a batch can partially apply. `{"success":true}` only means
the request was accepted — read the value back to confirm it stored.

### Nested key syntax

| Key | Writes |
|-----|--------|
| `_tag[{id}].{property}` | a tag property — `name`, `visibility` (`public`/`private`/`disabled`), `type`, `color`, `sla`, `priority`, `complexity`, `routingRelevance`, `channels`, `subchannels` |
| `_subchannel[{id}].{property}` | a mailbox / chatbot / phonebot / letter / portal subchannel property |
| `_user-defined-function[{id}].{property}` | a UDF's `name`, `slug`, `description`, `parameters`, `udfExecutor`, `isPrivate`, `async` |
| `_event-hook[{id}].{property}` | an event hook's `events`, `description`, `eventHookExecutor` |

Brackets pass through unencoded on `POST /settings`. On `PUT /settings/{name}` they are part of the
URL and must be encoded (`%5B` / `%5D`) — prefer the batch endpoint.

### Executor-typed settings are code

A setting of type `executor` **is** its code. Its value must be a whole object carrying `code`,
`type` and `language` together — a partial object is rejected. Read the current value, replace
`code`, put the whole thing back:

```bash
curl -s "${BASE}/settings?filterByName=searchContractByFieldsExecutor" -H "${AUTH}" \
  | jq '.[0].value | .code = "<?php echo \"null\";"' > /tmp/executor.json

curl -s -X PUT "${BASE}/settings/searchContractByFieldsExecutor" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  --data-binary @/tmp/executor.json   # (REQUIRES CONFIRMATION)
```

Writing one of these deploys code, so it is gated by a code-deployment permission regardless of
what the permission is named after: `customerSearch` for the contract/customer search executors,
`manageTemplates` for `emailAutoResponderCustomExecutor`, `eventHooks` for `eventHookExecutor`,
`updateAiAgent` for `udfExecutor`, `sendEmailExecutor`, `sendLetterExecutor` and the mailbox/letter
webhooks.

**Gotcha:** `number` settings round-trip through the UI as strings — normalise before arithmetic.

---

## Feature Flags

`featureFlags` (a key→boolean map, category `advanced-general`) switches whole functional areas off
per instance.

```bash
curl -s "${BASE}/settings/featureFlags" -H "${AUTH}" | jq '.value'
```

Two rules that govern every read of it:

- **Everything is on by default**, and **a missing key counts as on** — a flag absent from the
  stored map is enabled, not disabled.
- Writing `featureFlags` requires `enneoAdmin`. A client admin can read the map but not change it;
  the answer to "how do I turn X back on" is Enneo support, not an API call.

| Key | Off means |
|-----|-----------|
| `security` | SSO and service-worker tiles gone; login reduced to Microsoft + password. A configured IP whitelist is still enforced, and attachment-security values are kept, just hidden |
| `rbac` | Roles tile locked; creating/editing/deleting custom roles is refused with 403. Existing custom roles keep working and stay assigned; the role list is still readable |
| `quality` | Quality scorecards tile locked, all quality permissions stripped from every role, scorecard/assessment data no longer served. Stored data is untouched |
| `marketpartner` | Partners menu gone, partner data not served, no partner auto-match on incoming email |
| `analytics` | Analytics page unreachable, statistics-portal options gone from reporting settings. Data exports unaffected |
| `apps` | Apps icon, tile and URLs gone; apps cannot run, import or install. Definitions untouched |
| `acd` | Telephony settings tile locked, outgoing-call entry gone, phone greyed out in channel pickers. **Live telephony keeps working** — calls, SIP trunks and phone tickets are untouched |
| `email`, `chat`, `letter`, `portal`, `system`, `walkIn` | That channel's settings tile is locked and the channel is greyed out in pickers. Nothing behind the channel is switched off — existing tickets and routing are unaffected |

Effects to expect while a flag is off: settings vanish from `/settings/category/...`, tiles come
back from `/settings/uiOverview` with `disabled: true`, and permissions disappear from `GET
/roles/{id}`. A locked tile is still searchable; a hidden one is not. Turning `security` back on
does **not** restore previously configured SSO providers — they must be re-selected.

---

## Key Settings Reference

### AI & processing

| Setting | Description |
|---------|-------------|
| `enableAiAgents` | Master switch for AI functionality. While off, `POST /ticket/textUpdate` answers 403 |
| `enableAiAutoProcessing` | Dark processing on/off (pause/resume) |
| `_manualAiAgents` | AI agent ids auto-processed **with** human approval (multiselect) |
| `immediateAiAgents` | AI agent ids auto-processed **without** approval (multiselect) |
| `autoProcessingDelayEnabled` | Whether to delay auto-execution |
| `autoProcessingDelay` | Hours to delay (respects business hours) |
| `aiBotName` | Display name of the AI bot |
| `summaryOptions` | How ticket titles are generated |

### Routing (category `routing`)

| Setting | Values |
|---------|--------|
| `lastAgentRouting` | on/off — assign a follow-up back to the human agent who last handled it |
| `autopilotTagMatchingMode` | `matchAll` \| `matchAny` — must an agent hold every ticket tag, or at least one |
| `autopilotOrderingSequence` | Routing priority ordering |
| `flexibleAutopilotOrderingSequence` | Custom routing-priority sequence |

### Customer search & legitimation (category `customersearch-settings`)

| Setting | Description |
|---------|-------------|
| `customerIdentificationParams` | Which fields identify a customer |
| `customerLegitimationRuleAsyncChannels` | Legitimation rules for email and letter |
| `customerLegitimationRuleSyncChannels` | Legitimation rules for chatbot and voicebot |
| `customerLegitimationEnabled` | Master switch for legitimation |

### Reporting, export & general

| Setting | Values |
|---------|--------|
| `reportingPrivacyLevel` | `full`, `pseudonymized`, `partiallyPseudonymized`, `none` — applied nightly |
| `defaultDateExportFormat` | `xlsx`, `csv`, `json` |
| `timeTrackingStatusOptions` | The client's own time-tracking status list (see the `users` skill) |
| `locale` | Instance language |

---

## Subchannels (mailboxes / chat channels / phone lines)

```bash
# List all
curl -s "${BASE}/settings/subchannel" -H "${AUTH}" | jq '.subchannels[] | {id, name, channel, status}'

# Filter by channel (repeatable) or by id
curl -s "${BASE}/settings/subchannel?channels[]=email&channels[]=chat" -H "${AUTH}"
curl -s "${BASE}/settings/subchannel?id={id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings/subchannel" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "support@company.com", "channel": "email", "status": "active"}'

# Delete (REQUIRES CONFIRMATION) — also deletes the subchannel's email template
curl -s -X DELETE "${BASE}/settings/subchannel/{id}" -H "${AUTH}"
```

Only `email`, `chat`, `phone`, `letter` and `portal` support subchannels — `system` and `walkIn` are
rejected with 400. `voice` is accepted as an alias for `phone`. Create and delete need
`updateClientSettings`; credential fields are masked without `readSecretSettings`, and a phone
subchannel's `callFlow` blob is dropped entirely for callers who may not edit it.

Configure a subchannel after creating it with `_subchannel[{id}].{property}` through `POST
/settings`, or read its form with `GET /settings/category/mailbox_{id}` (also `chatbot_`,
`phonebot_`, `letter_`).

Mailbox OAuth:
```bash
curl -s "${BASE}/settings/mailbox/microsoft/authorization" -H "${AUTH}"        # IMAP-style
curl -s "${BASE}/settings/mailbox/microsoft/graph/authorization" -H "${AUTH}"  # Graph receiving
curl -s "${BASE}/settings/mailbox/microsoft/connections/test" -H "${AUTH}"
curl -s "${BASE}/settings/mailbox/google/authorization" -H "${AUTH}"

# Fetch a mailbox on demand to see why receiving fails
curl -s "${BASE}/settings/mailbox/{subchannelId}/test/receive" -H "${AUTH}"
```

---

## User-Defined Functions (UDFs)

Custom code fragments callable from AI agents, event hooks, webhooks, or external requests.

```bash
# List (?filter=tool for UDFs exposed as AI tools, ?filter=udf for plain ones)
curl -s "${BASE}/settings/user-defined-function" -H "${AUTH}" \
  | jq '.userDefinedFunctions[] | {id, name, slug, udfType}'

# Create (REQUIRES CONFIRMATION) — creation takes the name only; the id is generated
curl -s -X POST "${BASE}/settings/user-defined-function" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "myFunction", "udfType": "udf"}'

# Then attach the code (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_user-defined-function[{id}].udfExecutor": {"type": "sourceCode", "language": "python311", "code": "..."}}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/settings/user-defined-function/{id}" -H "${AUTH}"
```

Executor languages: `python311`, `node20`, `php82`. Executor types: `sourceCode`, `apiCall`,
`visualEditor`.

Create, delete and code changes all require `updateAiAgent` — and without it the listing endpoint
strips `udfExecutor` from every entry, so the function is still named but its source is withheld.
A new UDF defaults to `isPrivate: 1`, which restricts running it to admins; a non-private one is
callable by anyone holding `runExecutors`, which the default Agent role has.

Set `udfType: "tool"` to expose the function to smart AI agents — see the `tools` skill.

---

## Event Hooks

Async triggers that run an executor when an event occurs.

```bash
# List
curl -s "${BASE}/settings/event-hook" -H "${AUTH}" | jq '.eventHooks[] | {id, name, description}'

# Create (REQUIRES CONFIRMATION) — `name` is the event type; a sample executor is generated
curl -s -X POST "${BASE}/settings/event-hook" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "TicketCreated"}'

# Then replace the generated code (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_event-hook[{id}].eventHookExecutor": {"type": "sourceCode", "language": "php82", "code": "..."}}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/settings/event-hook/{id}" -H "${AUTH}"
```

All three calls require the `eventHooks` permission. An unknown event name is rejected with 400.

### Available event types

`AgentRoutingStatusChanged`, `AiAgentChanged`, `AiInsightProcess`, `AiInsightQuestionChanged`,
`ArchiveOldFiles`, `AutoProcessIntent`, `CallCompleted`, `CallStarted`, `ContentTranslationPrewarm`,
`ConversationCreated`, `CronDay`, `CronHour`, `CronMinute` (every 5 minutes), `CronWeek`,
`EmailAutoresponder`, `KnowledgeSourceChanged`, `NonAiTicketCreated`, `NotifySurroundingSystems`,
`OcrScanCompleted`, `ProfileCreated`, `ProfileDeleted`, `ProfileUpdated`, `QualityAssessment`,
`RoleManagement`, `ScorecardChanged`, `SendEmail`, `SendLetter`, `SettingChanged`,
`StaticTranslationPrewarm`, `SurveySubmitted`, `TestTicketAiQuality`, `TicketClosedDueToInactivity`,
`TicketCreated`, `TicketDeleted`, `TicketDueByOverdue`, `TicketForwarded`, `TicketResponse`,
`TicketRouted`, `TicketUpdated`.
