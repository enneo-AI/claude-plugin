# Telephony & Voice

## Trigger
Use when the user wants to manage telephony lines, voicebots, call routing, view call metrics, or debug telephony issues.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Live Status

```bash
# All lines (status, queue, live calls)
curl -s "${BASE}/report/telephonyLines" -H "${AUTH}"

# Agent metrics (calls today, talk time, ACW, missed)
curl -s "${BASE}/report/telephonyAgents" -H "${AUTH}"

# AI agent metrics
curl -s "${BASE}/report/telephonyAiAgents" -H "${AUTH}"
```

## Performance Reports

```bash
# Line performance over time (ASA, AHT, SLA, reachability)
curl -s "${BASE}/report/telephonyPerformance?lastDays=7&lineId={lineId}" -H "${AUTH}"

# Call insights (AI vs human, intents, hourly breakdown)
curl -s "${BASE}/report/telephonyCallInsights?lastDays=7&lineId={lineId}" -H "${AUTH}"

# Top performers by line
curl -s "${BASE}/report/telephonyLineTopPerformers?lineId={lineId}&lastDays=7&agentsType=all" -H "${AUTH}"
# agentsType: all, ai, human
```

## Routing & Config

```bash
# Current routing config
curl -s "${BASE}/telephony/getRouting" -H "${AUTH}"

# Check agent availability
curl -s "${BASE}/telephony/routingAvailability" -H "${AUTH}"

# ACD configuration
curl -s "${BASE}/telephony/acd/config" -H "${AUTH}"

# Get telephony token
curl -s "${BASE}/telephony/getToken" -H "${AUTH}"
```

## Test Outbound Call (REQUIRES CONFIRMATION)

```bash
curl -s -X POST "${BASE}/telephony/testOutboundCall" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+49123456789"}'
```

## Call Lifecycle (REQUIRES CONFIRMATION)

```bash
# Call received (inbound)
curl -s -X POST "${BASE}/telephony/callReceived" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callId": "...", "from": "+49123456789", "to": "+49987654321"}'

# Agent connected
curl -s -X POST "${BASE}/telephony/agentConnected" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callId": "...", "agentId": 1}'

# Call completed
curl -s -X POST "${BASE}/telephony/callCompleted" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callId": "..."}'
```

---

## Key Telephony Metrics

| Metric | Description |
|--------|-------------|
| ASA | Average Speed of Answer (seconds) |
| AHT | Average Handling Time (seconds) |
| ACW | After Call Work time (seconds) |
| SLA | Service Level Agreement compliance (%) |
| Reachability | Answer rate (%) |
| Live calls | Current active calls (human + bot) |
| In queue | Calls waiting to be answered |

## Call Routing Types

| Type | Description |
|------|-------------|
| `none` | No routing — voicebot only |
| `external` | Forward to external number |
| `native` | Route to Enneo agents via ACD |

## Voice Architecture

- **SIP trunk:** Enneo-provided or customer's own (e.g., Sipgate)
- **WebRTC:** Browser-based calling for agents
- **Voicebots:** AI agents linked to telephony lines
- **TURN server:** `turn1.enneo.ai` (91.99.219.69)
- **Call flow:** Voicebot → agent routing → external forwarding → announcements → time-based switches
