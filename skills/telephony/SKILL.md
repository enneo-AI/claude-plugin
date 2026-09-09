---
name: telephony
description: Use when the user wants to manage telephony lines, voicebots, call routing, view call metrics, or debug telephony issues.
---

# Telephony & Voice

## Trigger
Use when the user wants to manage telephony lines, voicebots, call routing, view call metrics, or debug telephony issues.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they use the saved profile API key and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

Native tools and curl share the instance and profile API key in `~/.enneo/env`. Reuse the saved key; if setup is missing, follow the `browser-jwt` skill to enter it locally. Source the file without displaying its contents:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

ACD (`/api/acd`) is **not** reachable with this token: every ACD route requires the internal
communication token and is not published on the customer ingress. Everything below is Mind.

---

## Live Status

```bash
# All phone lines — one row per phone subchannel: live calls, in queue, max wait, status
curl -s "${BASE}/report/telephonyLines" -H "${AUTH}"

# Human agent metrics (calls today, talk time, ACW, missed). Filters: teamIds, lineIds, status, q, limit, offset
curl -s "${BASE}/report/telephonyAgents" -H "${AUTH}"

# Voicebot metrics, one row per AI agent on a phone line. Filter: lineIds
curl -s "${BASE}/report/telephonyAiAgents" -H "${AUTH}"

# Instance-wide live counters (currentLiveCalls, currentInQueue) next to online users
curl -s "${BASE}/profiles/onlineSummary" -H "${AUTH}"
```

## Performance Reports

`lastDays` ∈ 0,1,3,7,14,30,90,365 · `granularity` ∈ hour,day,week,month · `lineId` and `direction` (`in`|`out`) optional.

```bash
# Line performance over time (answered, missed, reachability, ASA, AHT, SLA)
curl -s "${BASE}/report/telephonyPerformance?lastDays=7&lineId={lineId}&granularity=day" -H "${AUTH}"

# Call insights (AI autonomy ratio, handover categories, calls answered by hour)
curl -s "${BASE}/report/telephonyCallInsights?lastDays=7&direction=in" -H "${AUTH}"

# Top performers on one line — lineId is required here
curl -s "${BASE}/report/telephonyLineTopPerformers?lineId={lineId}&lastDays=7&agentsType=all" -H "${AUTH}"
# agentsType: all, ai, human
```

## Drill-downs

```bash
curl -s "${BASE}/report/telephonyLine/{lineId}" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAgent/{agentId}" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgent/{aiAgentId}" -H "${AUTH}"
# per-agent / per-voicebot time series, same lastDays + granularity filters
curl -s "${BASE}/report/telephonyAgentPerformance/{agentId}?lastDays=7" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAgentCallInsights/{agentId}?lastDays=7" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgentPerformance/{aiAgentId}?lastDays=7" -H "${AUTH}"
curl -s "${BASE}/report/telephonyAiAgentCallInsights/{aiAgentId}?lastDays=7" -H "${AUTH}"
```

## Per-call log

One row per queued call — the raw source behind every telephony report.

```bash
curl -s "${BASE}/export/callLog?from=2026-01-01&to=2026-01-31&format=json" -H "${AUTH}"
# optional filters: status, subchannelId, primaryTagId, assignedUserId, category
```

Carries `botDurationSeconds`, `queueDurationSeconds`, `humanDurationSeconds`, `callDurationSeconds`,
`cost`/`currency`, `category`, `forwardedToNumber`, `declineReasonCode`, plus `createdAt` (call
arrival — the only trustworthy "day of the call"), `routedAt`, `callStartedAt` (NULL for every
bot-only and unanswered call), `callEndedAt`, `acwCompletedAt`.

## Lines & call flows

A **line** is a phone subchannel: its call flow, voicebot stages, ring time and ACW live in its settings.

```bash
# List phone lines with their configuration
curl -s "${BASE}/settings/subchannel?channels[]=phone" -H "${AUTH}"

# Phone numbers and SIP trunks (instance settings, category `phone`)
curl -s "${BASE}/settings/category/phone" -H "${AUTH}"

# Compiled config ACD consumes — numbers, workflows, SIP trunks, ICE servers (enneoAdmin only)
curl -s "${BASE}/telephony/acd/config" -H "${AUTH}"
```

Per-line keys: `inboundPhoneNumbers`, `outboundPhoneNumberId`, `callFlowVersion`, `callFlow` (v2 DAG)
or `stages` (v1 linear), `acdRingTimeSeconds`, `acdAcwSeconds`, `acdAcwExtendSeconds`, `callRecording`,
`goesDirectlyToHuman`, `waitingAgentSound`, `ttsVoiceId`, `acdGlobalErrorHandling*`.
Instance keys: `clientManagedSipTrunks`, `enneoManagedSipTrunks`, `clientManagedPhoneNumbers`,
`enneoManagedPhoneNumbers`, `telephoneIntegrationEnabled`, `agentToAgentCallsEnabled`.

## Agent availability

```bash
# Every agent's call/chat routing status, skills, current + queued tickets
curl -s "${BASE}/telephony/routingAvailability" -H "${AUTH}"   # optional ?userId=

# Set an agent's call routing status, e.g. finish ACW (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/profile/{userId}/routingStatus" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callRoutingStatus": "idle"}'
```

## Test Outbound Call (REQUIRES CONFIRMATION)

Dials a real number and runs the line's voicebot against whoever answers.

```bash
curl -s -X POST "${BASE}/telephony/testOutboundCall" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+49123456789", "subchannelId": 5}'
# both fields optional — falls back to settings testOutboundPhoneNumber / testOutboundPhoneSubchannel
```

---

## Not callable with a user token

`POST /telephony/callReceived`, `/telephony/agentConnected`, `/telephony/callCompleted` and
`GET /telephony/getRouting` are the ACD→Mind lifecycle hooks: they answer 403 to anything but
`x-internal-communication-token`, so they cannot be used to simulate a call.
`GET /internal/usage/telephony` (partner billing aggregates) needs the maintenance access token.

## Key Telephony Metrics

| Metric | Description |
|--------|-------------|
| ASA | Average Speed of Answer (seconds) |
| AHT | Average Handling Time (seconds) |
| ACW | After Call Work — wrap-up time after the call ends |
| SLA | Calls answered within the target time (%) |
| Reachability | Answer rate (%) |
| AI autonomy | Calls the voicebot finished with no human leg (%) |

## Statuses

**Agent `callRoutingStatus`:** `idle` → `beingConnected` (reserved while ringing) → `interacting`
(leg confirmed) → `acw` → `idle`. `notResponding` = did not answer in the ring window,
`unavailable` = break/pause, `offline` = no socket. Only `idle` is routable; `acw` is excluded.

**Call queue status:** `preProcessing`, `waitingForAgent`, `assigned`, `currentlyProcessed`,
`completed`, `declined`, `unknown`.

**Call log category:** `handledByBot`, `transferredToHuman`, `transferToExternalNumber`,
`handledByHuman`, `forwardedToExternalNumber`, `declined`, `short`, `other`.

## Call flow steps (v2 DAG)

`start`, `bot` (voicebot), `humanRouting`, `forwardToPhoneNumber`, `branchTimeOfDay`, `dtmfInput`,
`playTTS`, `playAudioFile`, `hangup`. A node's output handle picks the next edge — `bot` emits
`needsHuman` / `completeNoHuman` / `error`, `humanRouting` emits `humanCallComplete` / `noAgents` /
`queueTooLong` / `error`. Per-number global error handling plays a message or forwards to a fallback.

## Voice Architecture

- **SIP trunk:** Enneo-managed (Sipgate) or the customer's own; numbers are then assigned to lines.
- **WebRTC:** browser calling for agents, inbound and outbound; TURN at `turn1.enneo.ai` (3478 UDP, 5349 TCP/TLS).
- **Voicebot:** ACD speaks to **OpenAI Realtime** directly (also via Azure or a LiteLLM proxy) — audio,
  transcription and turn detection all in the model, no separate STT for bot stages. ACD owns the
  provider credentials; Mind never sends them. Built-in tools `hangup_call`,
  `transfer_to_human_agent`, `set_call_recording`, `set_next_response_uninterruptible` run inside ACD;
  every other tool goes to Cortex, which writes the `agent_request`/`agent_response` pair onto the
  ticket and materialises the intent in realtime.
- **Transfers:** cold transfer to a colleague or an external number mid-call; the target is reserved
  in Mind before it rings, one attempt at a time.
- **Keypad (DTMF):** caller presses show as `dtmf` messages; a `dtmfInput` menu step's branch shows
  as a `dtmf_routing` line; an agent can dial tones out on an active outbound call.
- **Recording:** each leg is recorded separately, mixed to one MP3 and attached to the ticket at call end.
