# Quality Management

## Trigger
Use when the user wants to manage scorecards, assessments, AI quality checks, test runs, or understand automation levels.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Scorecards

```bash
# List
curl -s "${BASE}/quality/scorecard" -H "${AUTH}"

# Get specific
curl -s "${BASE}/quality/scorecard/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/quality/scorecard" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "My Scorecard", "criteria": [...]}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/quality/scorecard/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/quality/scorecard/{id}" -H "${AUTH}"
```

## Assessments

```bash
# List
curl -s "${BASE}/quality/assessment" -H "${AUTH}"

# Get specific
curl -s "${BASE}/quality/assessment/{id}" -H "${AUTH}"

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/quality/assessment/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"scores": {...}}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/quality/assessment/{id}" -H "${AUTH}"
```

Assessment states: `unprocessed` → `aiInProgress` → `readyForReview` → `reviewInProgress` → `reviewed` → `discussedWithAgent`

## Ticket Worklogs

```bash
curl -s "${BASE}/ticket/{ticketId}/worklog" -H "${AUTH}"
```

---

## AI Quality Check — Test Cases

Test cases define expected behavior for AI agents on specific tickets.

```bash
# List all test cases
curl -s "${BASE}/aiQualityCheck/testCase" -H "${AUTH}"

# Create test case (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testCase/{aiAgentId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{...}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/aiQualityCheck/testCase/{testCaseId}" -H "${AUTH}"
```

## AI Quality Check — Test Runs

Test runs execute test cases **without write actions** (safe/dry-run mode) and compare expected vs actual results.

```bash
# Create a test run (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testRun" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"aiAgentId": {agentId}}'

# List test runs
curl -s "${BASE}/aiQualityCheck/testRun" -H "${AUTH}"

# Get test run results
curl -s "${BASE}/aiQualityCheck/testRun/{testRunId}" -H "${AUTH}"

# Stop a running test
curl -s -X POST "${BASE}/aiQualityCheck/testRun/{testRunId}/stop" -H "${AUTH}"

# Update expected result (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiQualityCheck/testRun/{testRunId}/updateExpectedResult/{ticketId}" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{...}'

# Accept a result (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/aiQualityCheck/testRun/{testRunId}/acceptExpectedResult/{ticketId}" -H "${AUTH}"

# Accept all (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/aiQualityCheck/testRun/{testRunId}/acceptAllExpectedResults" -H "${AUTH}"
```

## Test a Specific Agent on a Ticket

```bash
curl -s -X POST "${BASE}/aiQualityCheck/testAiAgent" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"aiAgentId": {agentId}, "ticketId": {ticketId}}'
```

---

## Automation Levels

| Level | Name | Description |
|-------|------|-------------|
| L0 | No AI | No AI involvement (except customer identification) |
| L1 | Text assistance | AI for text editing only |
| L2 | Base agent | Base agent suggestion accepted by human |
| L3 | Specialized agent | Specialized agent suggestion accepted by human |
| L4 | Dark processing (approval) | Auto-processed, human approves with one click |
| L5 | Fully autonomous | Fully autonomous, no human involvement |

### Dark Processing Confidence Levels
- **Maximal:** Email match (sender = ERP email)
- **Very high:** Customer ID + contract ID provided
- **High:** Customer ID + lastname (recommended minimum)
- **Medium:** Partial match
- **None:** No customer identified

### Quality Check Workflow
1. Define test cases (specific tickets per agent)
2. Run test — executes without write actions
3. Compare expected vs actual results
4. Accept results or identify adjustments needed
5. Iterate until quality meets threshold
6. Enable auto-processing (L4/L5)
