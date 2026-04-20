# User, Team & Role Management

## Trigger
Use when the user wants to manage profiles, teams, roles, routing status, or understand user/team configuration.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Profiles

```bash
# List all
curl -s "${BASE}/profiles" -H "${AUTH}" | jq '[.[] | {id, email, firstName, lastName, type, status}]'

# Current user
curl -s "${BASE}/profile" -H "${AUTH}"

# Specific user
curl -s "${BASE}/profile/{id}" -H "${AUTH}"

# User routing info
curl -s "${BASE}/profile/{id}/routing" -H "${AUTH}"

# Routing status
curl -s "${BASE}/profile/{id}/routingStatus" -H "${AUTH}"

# Superset roles
curl -s "${BASE}/profile/{id}/supersetRoles" -H "${AUTH}"
```

## Update Profile (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/profile/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"firstName": "New Name"}'
```

## Update Routing Status (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/profile/{id}/routingStatus" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callRoutingStatus": "idle", "chatRoutingStatus": "idle"}'
```

---

## Teams

```bash
# Team tree (hierarchical)
curl -s "${BASE}/team/tree" -H "${AUTH}"

# List all teams
curl -s "${BASE}/team/list" -H "${AUTH}"

# Specific team
curl -s "${BASE}/team/{id}" -H "${AUTH}"

# Update team (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/team/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Team Name"}'
```

Teams define:
- Skills (tags) — which tickets the team handles
- Channels — email, phone, chat, etc.
- Backlog access restriction by tags
- Routing settings (inherited by members if enabled)
- Data availability (analytics access scope)

Multiple team membership: skills/channels cumulated, strongest role applies.

---

## Roles

```bash
# List
curl -s "${BASE}/roles" -H "${AUTH}"

# Get specific
curl -s "${BASE}/roles/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/roles" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "New Role"}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/roles/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Role"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/roles/{id}" -H "${AUTH}"
```

### Base roles
- **Admin** — Full access: users, teams, AI, wiki, reports, settings
- **Agent** — Process tickets, execute intents, forward, view own time tracking

### Common custom roles
- **Teamleiter** (Team Leader) — manage team, view performance, no ticket processing
- **KI-Manager** — AI agent configuration, quality checks, automation settings
- **Workforce Manager** — scheduling, time tracking, team management
- **Qualitätsmanager** — scorecards, assessments, quality reports
- **Wissensmanager** (Knowledge Manager) — wiki, knowledge base, templates
- **Reportingmanager** — analytics, exports, dashboards

---

## User Statuses

| Status | Description |
|--------|-------------|
| `active` | Processing tickets (time tracking active) |
| `pause` | On break |
| `support` | Helping colleague, no ticket editing |
| `longTermAbsence` | Vacation/sick (autopilot re-routes tickets to team) |

### Long-term Absence
- Tickets auto-routed to colleagues via autopilot
- Time tracking disabled
- Visible status for team
- **UI prerequisite:** At least one time tracking status option must have "Ticket-Delegation erlauben" enabled (Settings -> General -> Time Tracking)

---

## Export Users

```bash
curl -s "${BASE}/export/users?format=json" -H "${AUTH}"
```

## Agent Queues

```bash
curl -s "${BASE}/agents/queue" -H "${AUTH}"
```

## Routing Debugging

For routing issues (double routing, wrong assignment):

```bash
# Activity log shows ticketRouted events
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"

# Event search for routing events
curl -s -X POST "${BASE}/event/search?format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["ticketRouted"],"comparator":"in"}]}'
```

Key routing tables (via internal query): `user_timetracking` (sessions), `user_timetracking_tmp` (real-time pings)
