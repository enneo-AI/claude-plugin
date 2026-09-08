---
name: tags
description: Use when the user wants to manage tags, view tag trees, test tag detection, or debug tag-related issues.
---

# Tag Management

## Trigger
Use when the user wants to manage tags, view tag trees, test tag detection, or debug tag-related issues.

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

## List & Search

```bash
# All tags — response is {tags: [...], success: true}
curl -s "${BASE}/tag" -H "${AUTH}" | jq '.tags[] | {id, name, fullName, type, visibility}'

# Filter by type: skill, product, brand, customerProperty, contractProperty, other
curl -s "${BASE}/tag?type=skill" -H "${AUTH}"

# Search (name / fullName)
curl -s "${BASE}/tag?q=billing" -H "${AUTH}"

# Output format: short | medium | full (default full)
curl -s "${BASE}/tag?format=short" -H "${AUTH}"

# Include disabled tags
curl -s "${BASE}/tag?includeDisabled=true" -H "${AUTH}"

# Hierarchical tree (accepts type, includeDisabled) — returns a bare array of roots
curl -s "${BASE}/tag/tree" -H "${AUTH}"

# Specific tag — 404 for any tag the caller may not see (see Tag Visibility below)
curl -s "${BASE}/tag/{id}" -H "${AUTH}"
```

`detectionFilter` is rejected with a 400 — filter client-side on `detectionDetails.type` instead.

## CRUD Operations

```bash
# Create (REQUIRES CONFIRMATION) — required: name, type, detectionDetails
# optional: fullName (defaults to name), parent, visibility (default "public"), sla (default 8)
curl -s -X POST "${BASE}/tag" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "New Tag", "type": "skill", "detectionDetails": {"type": "manualAssignment"}}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/tag/{id}" -H "${AUTH}"

# Update tag properties via the settings API (REQUIRES CONFIRMATION)
# Keys: _tag[{id}].<field> — name, type, parent, visibility, priority, color, complexity,
#       sla, channels, subchannels, routingRelevance, testCase, detectionDetails
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_tag[{id}].name": "New Name", "_tag[{id}].visibility": "public"}'
```

There is no `PATCH /tag/{id}` — the settings API is the only update path.

## Test Tag Detection

Requires the `updateAiAgent` permission (the payload may carry executable detection code). `testTags`
carries the full tag definition to test; Cortex uses it instead of the stored one, so you can try a
changed detection prompt without saving it.

```bash
curl -s -X POST "${BASE}/tag/{id}/detect" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"ticketId": {ticketId}, "testTags": [{...full tag object...}], "data": {}}'
```

Returns `{match: true|false, alerts: [...]}` — `match` is whether the tag id came back in the
ticket's `tagIds`; `alerts` are the tag-scoped alerts from the run (agent/customer alerts are
filtered out). The run is forced synchronous so it cannot mutate a live ticket or push bot replies.

---

## Tag Types

| Type | Purpose |
|------|---------|
| `skill` | Expertise areas for routing (billing, meter reading, etc.) |
| `product` | Product categories |
| `brand` | Organizational units / brands |
| `customerProperty` | VIP status, legal notes |
| `contractProperty` | High receivables, upselling potential |
| `other` | General-purpose |

## Tag Detection Methods

`detectionDetails.type` is one of:

| Value | Description |
|-------|-------------|
| `manualAssignment` | Only assignable by humans |
| `aiDetection` | LLM classifies against the tag's `detectionPrompt` |
| `conditionDetection` | Rule-based: match on ticket/customer/contract attributes |
| `aiAndConditionDetection` | Both the AI and the condition half must match |
| `aiOrConditionDetection` | Either half matches |
| `customLogic` | Declared in the enum but **not implemented** — Cortex logs a warning and assigns nothing |

**Channel and sub-channel are not detection methods.** Every tag can carry `channels` /
`subchannels` lists; they are an orthogonal scoping filter checked *before* the detection type runs,
so a channel mismatch drops the tag whatever its detection method is. The admin UI shows a derived
`assignment` summary (`assignByAI`, `assignByChannel`, `assignBySubchannel`, `assignByTicketProperty`)
alongside the method — that summary is display-only, not a stored detection type.

`detectionDetails.customerNeeded` defaults to `true`: the tag is skipped entirely until a customer
has been identified for the ticket, even for a pure condition tag. Set it to `false` for tags that
must fire before customer identification.

## Tag Visibility

| Value | Meaning |
|-------|---------|
| `public` | Visible to everyone; assignable by AI and humans |
| `private` | Visible only to callers holding the `viewPrivateTags` permission |
| `disabled` | Hidden from every read path and dropped from routing; re-enabling restores it instantly |

There are no `enabled` / `visible` values — those three are the whole enum.

Visibility is **hierarchical**: anything under a hidden parent is hidden too. One predicate
(`Tag::getHiddenTagIds()`) backs every read path — `GET /tag`, `GET /tag/{id}` (404, not 403), the
ticket card, tag labels on ticket-list rows, **the AI agent list** and the intent-candidate tree — so
neither a search nor a report is a way around `viewPrivateTags`. An AI agent whose `tagId` is a
hidden tag disappears from `GET /aiAgents` for callers without the permission.

`ticket.tagIds` is deliberately *not* filtered: ids drive filtering and counting, so a ticket can
carry an id whose label the caller never receives. That is the mechanism working, not data loss.

---

## Tag Detection Pipeline (How It Works)

1. Cortex fetches **all** active tags from Mind (`GET /api/mind/tag?format=detection`) — every
   detection type, not just AI ones — then splits them by `detectionDetails.type`. Deleted and
   `disabled` tags never leave Mind.
2. Channel/subchannel scoping and `customerNeeded` are checked first; tags that fail are dropped
   before any model runs.
3. Condition tags (`conditionDetection`, and the condition half of the OR/AND types) are evaluated
   directly — no tag-classification model. (Filling a condition parameter whose `source` is
   `message` still calls an extraction LLM, so "no classifier" is not the same as "no LLM".)
4. If more than **15** AI-detection candidates remain, a **reranker pre-filter** runs: the small
   `qwen3-reranker-0.6B` model scores a query built from subject + current message + attachment OCR
   + history against each tag's detection prompt, and keeps the top **15**.
5. Those go to the tag-classification LLM. A tag is assigned when its score is **≥ 0.6**. (The
   system prompt frames the decision to the model in terms of 0.8 — the code-side acceptance cutoff
   is 0.6. Both numbers are hardcoded constants, not settings.)
6. If Cortex returns **zero** tags for a non-spam ticket, **Mind** assigns whichever tag currently
   carries the `defaultSkill` property. Cortex itself has no fallback, and the fallback tag is not
   hardcoded to any name or id — it is per-instance configuration.

**Text preprocessing:** a separate analysis step strips HTML artifacts, legal disclaimers, automated
footers and quoted thread replies into `bodyClean`. Detection then reads subject + conversation
history + attachment/OCR text.

### Refresh modes that touch tags

Mind asks for tag work through `refreshMode` on its Cortex ticket request:

| Mode | What runs |
|------|-----------|
| `tags` | customer identification (for filtering) + full tag detection. Replace mode: detected tags plus `preserveTagIds`, old tags cleared |
| `tagsRuleBased` | channel/subchannel + condition tags only — **zero LLM, zero embedding, zero reranker** |
| `full` / omitted | everything, tags included |

`tagsRuleBased` (request flag `ruleBasedTagsOnly`) is the early pass Mind fires the moment a call is
received or on the first inbound chat message, before any transcript exists. It resolves the
customer only from an already-known `contractId`/`customerId`, and suppresses every AI candidate —
so `conditionDetection` and the condition half of `aiOrConditionDetection` can assign, while
`aiAndConditionDetection` never can. Message-sourced condition parameters stay null in this pass, so
a content-dependent condition simply does not match early; the later full refresh is additive and
picks it up.

**`isSync` decides how that pass is delivered.** `isSync: true` runs the rule-based tag pass inline
and returns `tagIds` in the response — used when Mind must know a condition-derived tag *before*
picking a human agent, and it degrades to an empty valid response rather than failing the call
routing. `isSync: false` (the default, since both Mind triggers normally fire in the background)
returns an empty response immediately and delivers the tags through the async callback. Never both.
Before this was honoured the pass always behaved as async regardless of the flag.

**`noAi: true`** (set for instances with AI features off) reduces tag detection to condition-only,
the same way `tagsRuleBased` does, while leaving the rest of the refresh scope working.

## Debugging Tag Issues

### Wrong tags, or only the default skill tag

1. **Actual assignments:** `curl -s "${BASE}/internal/query?q=SELECT+*+FROM+ticket_tag+WHERE+ticketId={ID}" -H "${AUTH}"`
2. **Visibility:** `curl -s "${BASE}/internal/query?q=SELECT+id,name,visibility,deletedAt+FROM+tag_description+WHERE+id={tagId}" -H "${AUTH}"`
3. **What the tag's detection actually does:** `POST /tag/{id}/detect` against the ticket — the
   `alerts` array names the failing operand or missing parameter.
4. **What each condition source resolves against:** `curl -s "${BASE}/ticket/{ticketId}/variables" -H "${AUTH}"`
5. **Traces:** look for `validate_tags` in the ticket's event traces.

### Root causes

- Tag is `disabled`, or `private` and the caller lacks `viewPrivateTags` — assigned but its label never returned
- A hidden **parent** is hiding an otherwise-visible child
- Score landed below the 0.6 acceptance cutoff
- Reranker dropped the tag before classification (only when more than 15 AI candidates exist)
- `customerNeeded: true` and no customer identified — the tag was never evaluated
- Channel/subchannel scoping excluded the tag for this ticket's channel
- Empty message after body cleaning, or missing conversation history
- The run was a `tagsRuleBased` / `noAi` pass, which cannot assign AI tags at all
- Tag has no `aiDetection.detectionPrompt` configured
