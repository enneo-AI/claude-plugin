# Tag Management

## Trigger
Use when the user wants to manage tags, view tag trees, test tag detection, or debug tag-related issues.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## List & Search

```bash
# All tags
curl -s "${BASE}/tag" -H "${AUTH}" | jq '.tags[] | {id, name, fullName, type, visibility}'

# Filter by type: skill, product, brand, customerProperty, contractProperty, other
curl -s "${BASE}/tag?type=skill" -H "${AUTH}"

# Search
curl -s "${BASE}/tag?q=billing" -H "${AUTH}"

# Include disabled
curl -s "${BASE}/tag?includeDisabled=true" -H "${AUTH}"

# Hierarchical tree
curl -s "${BASE}/tag/tree" -H "${AUTH}"

# Specific tag
curl -s "${BASE}/tag/{id}" -H "${AUTH}"
```

## CRUD Operations

```bash
# Create (REQUIRES CONFIRMATION) — required: name, reference, type
curl -s -X POST "${BASE}/tag" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "New Tag", "type": "skill", "reference": "new_tag"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/tag/{id}" -H "${AUTH}"

# Update tag properties via settings API (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/settings" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"_tag[{id}].name": "New Name", "_tag[{id}].visibility": "enabled"}'
```

## Test Tag Detection

```bash
curl -s -X POST "${BASE}/tag/{id}/detect" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"ticketId": {ticketId}}'
```

Returns: `{match: true/false, dataOutcome: {...}}`

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

| Method | Description |
|--------|-------------|
| AI Detection | ML-based, learns from historical data. Uses detection prompt. |
| Condition Detection | Rule-based: match on customer/ticket/contract attributes |
| AI AND Condition | Both AI and condition must match |
| AI OR Condition | Either AI or condition matches |
| Channel-based | Assigned based on contact channel |
| Sub-channel-based | Assigned based on specific mailbox/chat |
| Manual only | Only assignable by humans |

## Tag Visibility

| Value | Meaning |
|-------|---------|
| `enabled` / `visible` | Tag visible in UI and assigned by AI |
| `disabled` | AI can detect it (stays in DB), but hidden from UI |
| `private` | Only visible to specific roles |

---

## Tag Detection Pipeline (How It Works)

When a ticket is processed, Cortex detects tags in this pipeline:

1. All active tags with AI detection are collected from the environment
2. If tag count > **15**, a **reranker pre-filter** runs:
   - Uses small model (`QWEN3_RERANKER_0_6B`)
   - Compares ticket content against tag detection prompts
   - Returns only top 15 tags
3. Top 15 tags passed to LLM for classification
4. Tags scored >= **0.8** are assigned; below 0.8 rejected
5. If no tags detected → fallback to "Allgemein" (tag 1)

**Text preprocessing:** Enneo strips footers, signatures, quoted text before AI processing. Uses `body_clean` + subject + conversation history.

**Condition tags:** Evaluated independently of AI detection — can assign tags based on sender, channel, contract attributes, etc.

## Debugging Tag Issues

### "Only Allgemein tag" or wrong tags

1. **Check DB:** `curl -s "${BASE}/internal/query?q=SELECT+*+FROM+ticket_tag+WHERE+ticketId={ID}" -H "${AUTH}"`
2. **Check visibility:** `curl -s "${BASE}/internal/query?q=SELECT+id,name,visibility,deletedAt+FROM+tag_description+WHERE+id={tagId}" -H "${AUTH}"`
3. **Check traces:** Look for `validate_tags` in event traces
4. **Check what Cortex received:** `curl -s "${BASE}/experimental/cortex/ticket/{ticketId}/request" -H "${AUTH}"`

### Root causes
- Tag has `visibility: disabled` — detected but hidden
- Reranker filtered out correct tag (15+ tags)
- Empty message after body cleaning
- Missing conversation history
- Tag lacks `ai_detection` config

## Source Code Reference

| Component | Location |
|-----------|----------|
| Tag detection | `cortex/src/services/ticket/tag_processor.py` |
| Body cleaning | `cortex/src/services/ticket/ticket_analyzer.py` |
| Reranker config | `cortex/src/config/constants.py` → `TAG_RERANKER_TOP_N=15` |
| Tag model | `mind/Mind/Db/schema.xml` → `tag_description` table |
