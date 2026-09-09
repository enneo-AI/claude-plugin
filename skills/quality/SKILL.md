---
name: quality
description: Use when the user wants to manage scorecards, assessments, the live quality coach, AI quality checks, test runs, or understand automation levels.
---

# Quality Management

## Trigger
Use when the user wants to manage scorecards, assessments, the live quality coach, AI quality checks, test runs, or understand automation levels.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they use the saved profile API key and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

Native tools and curl share the instance and profile API key in `~/.enneo/env`. Reuse the saved key; if setup is missing, follow the `browser-jwt` skill to enter it locally. Source the file without displaying its contents:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

Quality assessments and the live coach sit behind the instance's Quality feature flag. When it is off, the list endpoints answer `[]` / `{"assessments":[],"total":0}` and a single scorecard 404s — that is a switched-off feature, not a missing record.

---

## What is assessed

QA runs on **work sessions** (worklogs where the agent sent a reply), not on the customer side, and not per ticket. One session can produce several assessments — one per scorecard whose assignment matches. A scheduling cron picks up unassessed sessions, Cortex scores the AI-evaluable criteria, and a supervisor reviews and edits the result.

## Scorecards

```bash
# List — defaults to active + draft; pass a comma-separated state filter to widen
curl -s "${BASE}/quality/scorecard" -H "${AUTH}"
curl -s "${BASE}/quality/scorecard?state=active" -H "${AUTH}"

# Get specific revision
curl -s "${BASE}/quality/scorecard/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/quality/scorecard" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "My Scorecard", "state": "draft", "categories": [...], "assignment": {...}, "liveCoach": {"enabled": false, "threshold": 85}}'

# Update (REQUIRES CONFIRMATION) — creates a new revision unless createNewRevision=false
curl -s -X PATCH "${BASE}/quality/scorecard/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "createNewRevision": true}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/quality/scorecard/{id}" -H "${AUTH}"
```

Permissions: reading needs none beyond login; create/update needs `qualityManageScorecards`, delete needs `qualityDeleteScorecard`.

Scorecard states: `draft`, `active`, `retired`, `deleted`.

### Structure

- **categories[]** — `categoryId`, `label`, `order`, `criteria[]`
- **criteria[]** — `id`, `label`, `description`, `maxPoints`, `scoringType` (`metNotMet` | `numericScale`), `autoGenerateByAi`, `assessmentPrompt`, `makeOrBreakForCategory`, `makeOrBreakForAssessment`
- **assignment** — when it is null, the scorecard applies to everything. Otherwise, empty array = no filter on that dimension:
  - `ticketTags`, `teams`, `channels` — inclusion whitelists
  - `excludeTicketTags`, `excludeTeams`, `excludeChannels` — matching **any** excluded value disqualifies the scorecard and **beats** the inclusion lists
  - `responseContexts` — `afterCustomerMessage` (reactive) and/or `withoutCustomerMessage` (proactive/outbound). No exclusion variant
- **liveCoach** — `enabled`, `threshold` (percent, default 85)

**Revisions:** every scorecard has a stable `baseId` and a `revision`. `id` identifies one revision; `baseId` identifies the scorecard across all of them. Reports and the assessments list filter by `baseId` (passed as `scorecardId`); updating an old revision silently retargets the current active one.

**Scorecards also steer the AI's writing.** Cortex fetches active scorecards and injects the AI-evaluable criteria of the first one matching the channel into the response-generation system prompt as a `## Quality Guidelines` section — so a criterion change moves both the score and the drafts.

## Assessments

```bash
# List — window defaults to lastDays=30
curl -s "${BASE}/quality/assessment?lastDays=30&limit=100&offset=0" -H "${AUTH}"
curl -s "${BASE}/quality/assessment?from=2026-08-01&to=2026-08-31&scorecardId={baseId}" -H "${AUTH}"

# Get specific (full scoring data)
curl -s "${BASE}/quality/assessment/{id}" -H "${AUTH}"

# Re-run AI scoring (REQUIRES CONFIRMATION) — optional scorecardId pins a revision of the same scorecard
curl -s -X POST "${BASE}/quality/assessment/{id}/refresh" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/quality/assessment/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"criteria": [{"id": 3, "score": 4, "reason": "Greeting was warm."}], "supervisorAssessment": "...", "state": "reviewedBySupervisor"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/quality/assessment/{id}" -H "${AUTH}"
```

List params: `lastDays` (`0`,`1`,`3`,`7`,`14`,`30`,`90`,`365`) or explicit `from`/`to` (`YYYY-MM-DD`, which override `lastDays`), `limit` (1-500, default 100), `offset`, `scorecardId` (base id), `assessedUserId`, `assessedTeamId`.

Visibility is clamped to `qualityViewAssessmentAll` → everyone, `qualityViewAssessmentTeamMate` → teammates, `qualityViewAssessmentOwn` → self. Asking for a person or team outside that audience returns 403. Deleting needs `qualityDeleteAssessment`.

PATCH body fields: `criteria` (scores + reasons, marks them human-verified and recomputes totals), `aiSummary`, `supervisorAssessment`, `assessmentDate`, `discussionDate`, `state`.

**Assessment states:** `unprocessed` → `aiInProgress` → `aiReady` → `reviewOngoing` → `reviewedBySupervisor` → `discussedWithAssessee`, plus `error` and `deleted`. Refresh is refused once an assessment is `reviewedBySupervisor` or `discussedWithAssessee`.

**Criterion states:** `unscored`, `aiGenerated`, `humanVerified`.

Bulk figures: `GET /report/qualityAssessments` (reports skill) and `GET /export/qualityAssessments` (exports skill).

## Live Quality Coach

Scores an unsent draft against the applicable live-coach scorecards and gates the send on the scorecard's threshold.

```bash
# Is the coach available on this ticket? (cheap pre-flight, no AI call)
curl -s "${BASE}/ticket/{ticketId}/quality/exists" -H "${AUTH}"

# Score a draft
curl -s -X POST "${BASE}/ticket/{ticketId}/quality/check" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"draftText": "Sehr geehrte..."}'
```

Returns `{ scorecards: [{ scorecardId, name, percentage, threshold, passed, categories, aiSummary }] }`, one entry per applicable live-coach scorecard, ordered by id. Scorecards with no AI-evaluable criteria are skipped; if Cortex fails on any scorecard the whole call fails with 502 rather than returning partial results. `draftText` is required. An optional `scorecardId` forces one specific scorecard, ignoring applicability and its `enabled` flag.

## Ticket Worklogs

```bash
curl -s "${BASE}/ticket/{ticketId}/worklog" -H "${AUTH}"
curl -s "${BASE}/ticket/{ticketId}/worklog/exists" -H "${AUTH}"
```

---

## AI Quality Check — Test Cases

Two shapes share the `testCase` path:

**Ticket-based** — replay real tickets through an agent:

```bash
# List test cases per agent (or ?aiAgentId=/&channel=/&q= to filter)
curl -s "${BASE}/aiQualityCheck/testCase" -H "${AUTH}"
curl -s "${BASE}/aiQualityCheck/testCase/{aiAgentId}" -H "${AUTH}"   # 'all' is a valid id

# Add tickets as test cases for an agent (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testCase/{aiAgentId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"ticketIds": [1234, 1235]}'
```

**Conversational** — a simulated customer for chat and voice:

```bash
# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testCase" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"channel": "phone", "instructionPrompt": "...", "description": "...", "expectedCriteria": ["..."], "aiAgentIds": [7], "subchannelId": 3, "direction": "in", "objective": "...", "context": "...", "constraints": "..."}'

# Update / delete (REQUIRES CONFIRMATION)
curl -s -X PATCH  "${BASE}/aiQualityCheck/testCase/{testCaseId}" -H "${AUTH}" -H "Content-Type: application/json" -d '{...}'
curl -s -X DELETE "${BASE}/aiQualityCheck/testCase/{testCaseId}" -H "${AUTH}"
```

`channel` must be `chat` or `phone`. `direction` defaults to inbound; `out` is accepted on `phone` only — that is the outbound voice test case, where the bot calls the simulated customer.

`GET /aiQualityCheck/testAiAgent` is an alias of the test-case listing.

## AI Quality Check — Test Runs

Test runs execute test cases **without write actions** (dry run) and compare expected vs actual results.

```bash
# Schedule a run (REQUIRES CONFIRMATION) — every field optional; no aiAgentId means all agents
curl -s -X POST "${BASE}/aiQualityCheck/testRun" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"aiAgentId": 7, "description": "...", "testCaseIds": [1,2], "channel": "chat", "config": {"limit": 20, "reRunModels": true}}'

# List / get
curl -s "${BASE}/aiQualityCheck/testRun" -H "${AUTH}"
curl -s "${BASE}/aiQualityCheck/testRun/{testRunId}" -H "${AUTH}"

# Cancel a running test (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiQualityCheck/testRun/{testRunId}/cancel" -H "${AUTH}"

# Re-run (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testRun/{testRunId}/rerun" -H "${AUTH}"

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/aiQualityCheck/testRun/{testRunId}" -H "${AUTH}"

# Update expected result (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiQualityCheck/testRun/{testRunId}/updateExpectedResult/{ticketId}" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{...}'

# Accept one / all results (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiQualityCheck/testRun/{testRunId}/acceptExpectedResult/{ticketId}" -H "${AUTH}"
curl -s -X POST  "${BASE}/aiQualityCheck/testRun/{testRunId}/acceptAllExpectedResults" -H "${AUTH}"
```

`config` accepts only `limit` and `reRunModels` — any other key is a 400.

Permissions: `aiQualityCheckView` to read (the per-agent test-case listing `GET /aiQualityCheck/testCase/{aiAgentId}` uses `readAiQualityCheck` instead), `aiQualityCheckRun` to schedule or re-run, `aiQualityCheckEdit` to create, update, cancel, delete or accept results.

### AI quality check vs quality assessment

| | AI quality check | Quality assessment |
|--|--|--|
| Subject | An AI agent | A human agent's work session |
| Trigger | A test run you schedule | Scheduling cron on unassessed worklogs |
| Basis | Test cases (replayed tickets, or a simulated conversation) | The real reply the agent sent |
| Yardstick | Expected result per test case | Scorecard criteria |
| Effects | None — write actions are suppressed | None — scoring only |

---

## Automation Levels

| Level | Name | Description |
|-------|------|-------------|
| L0 | No AI | No AI involvement in the session |
| L1 | Text assistance | AI used for rephrasing / text editing only |
| L2 | Base agent | Base agent suggestion accepted by a human |
| L3 | Specialized or smart agent | Rule-based specialized agent, or smart (LLM) agent, accepted by a human |
| L4 | Dark processing with approval | Auto-processed; human approves with one click |
| L5 | Dark processing without approval | Fully autonomous, no human involvement |

The level recorded on a work session is the **maximum** reached during it.

### Customer legitimation

Dark processing depends on how confidently the customer was identified. `customerLegitimation` on the ticket:

| Score | Meaning |
|-------|---------|
| 0 | No customer identified or no contract associated |
| 10 | Default confidence, nothing else matched |
| 12 | Email not found in the ERP |
| 13 | Contract/customer ID plus lastname found in the message |
| 15 | Contract and customer ID found in the message |
| 20 | High confidence — sender email matches the contract/customer, letter address matches, or a system/outgoing message |
| 30 | Manually confirmed by an agent or by the AI during a chat |
| 40+ | Custom, stricter verification set by an agent or chatbot |

### Quality check workflow
1. Define test cases (real tickets per agent, or simulated chat/voice conversations)
2. Schedule a test run — it executes without write actions
3. Compare expected vs actual results
4. Accept results, or feed the deviations back into detection, business logic or output handling
5. Iterate until results are stable
6. Raise the automation level (L4, then L5)
