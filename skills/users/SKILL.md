---
name: users
description: Use when the user wants to manage human-agent profiles, teams, roles, permissions, routing status, or time-tracking/absence status.
---

# User, Team & Role Management

## Trigger
Use when the user wants to manage human-agent profiles, teams, roles, permissions, routing status, or time-tracking/absence status.

**"Agent" here always means a human operator** — the client employee who works tickets and calls.
The LLM-driven kind is an *AI agent*, configured through the `ai-agents` skill; nothing on this page
touches them. Likewise a "skill" on a profile or team is a **tag**, not a piece of AI configuration.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they use the saved profile API key and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

## curl Reference

Native tools and curl share the instance and profile API key in `~/.enneo/env`. Reuse the saved key; if setup is missing, follow the `browser-jwt` skill to enter it locally. Source the file without displaying its contents:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Profiles

```bash
# List (format=short|full, default short; limit default 1000, offset default 0)
curl -s "${BASE}/profiles?format=full&limit=100" -H "${AUTH}" \
  | jq '[.[] | {id, email, firstName, lastName}]'

# Who is online right now
curl -s "${BASE}/profiles/onlineSummary" -H "${AUTH}"

# Current user — id, permissions, settings, open tickets
curl -s "${BASE}/profile" -H "${AUTH}" | jq '{id, permissions, settings}'

# Specific user
curl -s "${BASE}/profile/{id}" -H "${AUTH}"

# What this user would be routed, and why (?ticketId=, ?q=, ?limit=, ?offset=)
curl -s "${BASE}/profile/{id}/routing" -H "${AUTH}"

# Analytics (Superset) roles available for this user
curl -s "${BASE}/profile/{id}/supersetRoles" -H "${AUTH}"

# The client's configured time-tracking statuses
curl -s "${BASE}/profile/timeTrackingStatusOptions" -H "${AUTH}"

# The caller's own API access token
curl -s "${BASE}/profile/showAccessToken" -H "${AUTH}"

# API keys issued to a user, and revoking one
curl -s "${BASE}/jwt/{id}/keys" -H "${AUTH}"
curl -s -X DELETE "${BASE}/jwt/{id}/keys/{keyId}" -H "${AUTH}"   # (REQUIRES CONFIRMATION)
```

There is no `GET /profile/{id}/routingStatus`. Read a user's current call/chat routing status from
`GET /profile/{id}` or `GET /profiles/onlineSummary`.

## Create / Update / Delete Profile (REQUIRES CONFIRMATION)

```bash
# Update — identity fields at the top level, everything else under `settings`
curl -s -X PATCH "${BASE}/profile/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"firstName": "New Name", "settings": {"teamIds": [3], "status": "active"}}'

# Bulk update several profiles
curl -s -X PATCH "${BASE}/profiles" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"profiles": [{"id": 5, "settings": {"roleId": 2}}]}'

# Create
curl -s -X POST "${BASE}/profile" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"email": "a@b.com", "firstName": "A", "lastName": "B", "settings": {"roleId": 2}}'

# Delete
curl -s -X DELETE "${BASE}/profile/{id}" -H "${AUTH}"
```

Top-level fields: `email`, `firstName`, `lastName`, `nameAlias`, `externalId`, `password`,
`isSsoOnly`. Under `settings`: `roleId`, `teamIds`, `inheritTeamSettings`, `skills` (tag ids plus
`skillPriorities`), `tagsOnRoute`, `tagsOnEdit`, `excludedTagIds`, `limitTicketBacklogAccess`,
`ticketBacklogRequiredTagIds`, `status`, `supersetRole`, `lang`, `phone`, `translateTicketContent`,
`translationLanguages`.

**Each `settings` field is gated by its own permission**, named `updateUserProfile` + the capitalised
field (`updateUserProfileTeamIds`, `updateUserProfileSkills`, …); the three tag fields all map to
`updateUserProfileSkills`. A 403 naming one field means that field's permission is missing, not the
whole call. Creating needs `createSpecificProfile`, deleting `deleteSpecificProfile`, updating
someone else's profile `updateSpecificProfile`.

Nobody can grant a role carrying more permissions than their own — the check counts permissions
ignoring feature flags, so a switched-off flag cannot be used to make a higher role look smaller.

## Routing Status (REQUIRES CONFIRMATION)

Call and chat routing are tracked separately.

```bash
curl -s -X PATCH "${BASE}/profile/{id}/routingStatus" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"callRoutingStatus": "idle", "chatRoutingStatus": "idle"}'

# Bulk
curl -s -X PATCH "${BASE}/profiles/routingStatus" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"profiles": [{"id": 5, "callRoutingStatus": "unavailable"}]}'
```

| Value | Meaning |
|-------|---------|
| `idle` | Available, waiting for a contact |
| `beingConnected` | Being offered / connected to a contact |
| `interacting` | On a call or in a chat |
| `acw` | After-contact work (wrap-up). Set on call completion, cleared on the return to `idle`. Calls only |
| `notResponding` | Offered a contact and did not answer |
| `unavailable` | Logged in but not taking contacts |
| `offline` | Not connected |

A user may always change their own; changing someone else's needs `updateSpecificProfile` or
`updateSpecificProfileStatus`. Pass `ifCurrent` (requires `callRoutingStatus`) to make the change
conditional — a mismatch answers **409** instead of overwriting. A move to `idle` is silently
downgraded to `unavailable` when the user's time-tracking status is not channel-eligible, and a
transition out of `offline` is validated against the user's actual socket connection.

---

## Time-Tracking Status & Absence

A user's `settings.status` is a **time-tracking status**, and the list is per client — defined by
the `timeTrackingStatusOptions` setting, not by a fixed enum. Read the live list before assuming an
id exists:

```bash
curl -s "${BASE}/profile/timeTrackingStatusOptions" -H "${AUTH}"
```

Shipped defaults:

| id | Label | Behaviour flags |
|----|-------|-----------------|
| `active` | Ticket Processing | `autoActiveMode`, `includeInHandlingTime`, `availableForChats`, `availableForCalls` |
| `busy` | Support Mode | `supportMode`, `blockWriteActions` — helping colleagues, no ticket editing |
| `offwork` | Break | `interactionsBlocked` |
| `away` | Away | `autoAwayMode`, `hidden` — set automatically on inactivity |
| `absent` | Long Absent | `allowTicketDelegation`, `interactionsBlocked` — vacation/illness; the user's own tickets are delegated to colleagues |

Delegation of a long-absent user's tickets happens only for a status whose `allowTicketDelegation`
flag is set. If tickets are not being re-routed during an absence, check that flag on the status the
user actually selected. An invalid status id is rejected with 400.

---

## Teams

```bash
# Hierarchical tree, filtered to what the caller may see
curl -s "${BASE}/team/tree" -H "${AUTH}"

# Flat list (?q= search, ?roleId=, ?ids[]=)
curl -s "${BASE}/team/list" -H "${AUTH}"

# One team, with inherited settings resolved (?forceInheritance=true|false)
curl -s "${BASE}/team/{id}" -H "${AUTH}"

# Create / update / delete (REQUIRES CONFIRMATION) — all need `manageTeams`
curl -s -X POST "${BASE}/team" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Support DE", "parent": null, "settings": {"roleId": 2}}'
curl -s -X PATCH "${BASE}/team/{id}" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Team Name"}'
curl -s -X DELETE "${BASE}/team/{id}" -H "${AUTH}"
```

A team carries: skills (routing tags, with per-tag priorities), channels, backlog access
restrictions, routing settings, a `roleId`, a Superset role, and `inheritParentalSettings`. Members
who inherit team settings take the team's; a user in several teams gets skills and channels
cumulated and the **strongest** role.

Deletion is a soft delete and is refused with 400 while the team has child teams or assigned users.
Without `viewAllTeams`, a user who belongs to teams sees only their own subtree — `GET /team/{id}`
outside it answers 403.

---

## Roles

```bash
# List (?q= search, ?baseRoleId= to list derivatives of one base role)
curl -s "${BASE}/roles" -H "${AUTH}" | jq '.roles[] | {id, name, baseRoleId, membersCount}'

# One role, with the full permission matrix as the role editor renders it
curl -s "${BASE}/roles/{id}" -H "${AUTH}" \
  | jq '.role.permissionSectionsRenderConfig[] | {group: .label, granted: [.permissions[] | select(.value) | .name]}'

# Create / update / delete (REQUIRES CONFIRMATION) — all need `manageRoles`
curl -s -X POST "${BASE}/roles" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Team Lead", "baseRoleId": 2, "permissions": {"analytics": true}}'
curl -s -X PATCH "${BASE}/roles/{id}" -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Role"}'

# Delete — ?assignRoleId= moves the role's members to another role
curl -s -X DELETE "${BASE}/roles/{id}?assignRoleId={otherId}" -H "${AUTH}"
```

Two **base roles** ship with every instance and have no `baseRoleId`:

- **1 — Administrator**: everything.
- **2 — Agent**: work tickets, execute intents, forward, reply, run executors, most read-only reports.

Every other role is a **custom role** deriving from a base role. Only the *difference* from the base
is stored, so a permission later added to the base propagates to its derivatives.

**Custom roles are gated by the `rbac` feature flag.** With it off, create, update and delete answer
403 ("The RBAC feature is not enabled"); listing and reading roles keep working, and existing custom
roles stay assigned and fully functional. See the feature-flag table in the `settings-config` skill.
Permissions belonging to a switched-off flag are stripped from `GET /roles/{id}` entirely, so a
missing checkbox may mean a flag, not a bug.

### Permission groups

`GET /roles/{id}` returns them grouped: Tickets, Conversations, Application of AI, Template
Management, Knowledge Base (Wiki) Management, Data and reports, Tag Management, User Management,
Team and Role Management, AI Agent Management, AI Quality Control, Automatic ticket processing,
Settings, Quality Management, Apps, Partner Management, Neo Workbench, Other technical permissions.

Ones worth knowing when something is unexpectedly invisible or refused:

| Permission | Controls |
|------------|----------|
| `viewPrivateTags` | See and manage tags with `private` visibility. Broadly enforced — private tags are stripped from tag lists and trees, ticket payloads, profile and team skill lists, search and reports; **removing a private tag from a ticket without it is silently ignored**, not rejected. Expect a user without it to see a different tag set from an admin |
| `readSecretSettings` | Read unmasked credentials (`showSecrets=true`, subchannel passwords) |
| `updateAiAgent` | Change AI agent, tool and UDF code — a code-deployment permission |
| `previewExecutors` | Run posted code without saving it |
| `runExecutors` | Execute a saved UDF or tool. Held by the default Agent role |
| `eventHooks` | Manage event hooks and their code |
| `updateClientSettings` | Change instance settings and subchannels |
| `settingsUiOverview` | See the settings dashboard at all |
| `manageTeams`, `manageRoles`, `viewAllTeams` | Team and role administration |
| `updateSpecificProfileStatus` | Change another user's status/routing status **only** |
| `selectTicketOutsideRequiredSkills`, `allowTicketCherryPicking` | Pick tickets outside one's own skills |
| `readUserNamesOfNonTeamMates`, `readUserStatus`, `readUserLastSeenDate` | Visibility of colleagues |

---

## Export Users

```bash
curl -s "${BASE}/export/users?format=json" -H "${AUTH}"   # needs exportUserProfiles
```

## Agent Queues

```bash
curl -s "${BASE}/agents/queue" -H "${AUTH}"
```

## Routing Debugging

For routing issues (double routing, wrong assignment):

```bash
# What the routing engine would give this user, with the reasoning
curl -s "${BASE}/profile/{id}/routing?ticketId={ticketId}" -H "${AUTH}"

# Activity log shows ticketRouted events
curl -s "${BASE}/ticket/{ticketId}/activity?showTechnicalInformation=true" -H "${AUTH}"

# Event search for routing events
curl -s -X POST "${BASE}/event/search?format=raw" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="},{"key":"e.type","values":["ticketRouted"],"comparator":"in"}]}'
```

Common causes worth checking before anything else: the user's time-tracking status is not
channel-eligible; the ticket's tags do not match the user's skills under `autopilotTagMatchingMode`
(`matchAll` vs `matchAny`); a tag involved is disabled or private; or `lastAgentRouting` pinned the
ticket back to whoever handled it last.
