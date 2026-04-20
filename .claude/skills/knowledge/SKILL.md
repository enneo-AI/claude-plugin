# Knowledge Base Management

## Trigger
Use when the user wants to manage wiki/knowledge base articles — search, create, update, organize, or understand how knowledge is used by AI.

## Quick Reference

```bash
. ~/.enneo/env   # loads ENNEO_INSTANCE + ENNEO_TOKEN from OAuth-persisted credentials
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## List & Search

```bash
# Root level
curl -s "${BASE}/knowledgeSource" -H "${AUTH}" | jq '.items[] | {id, name, title, type}'

# Children of a parent
curl -s "${BASE}/knowledgeSource?parent={parentId}" -H "${AUTH}"

# Filter by modification date
curl -s "${BASE}/knowledgeSource?modifiedAfter=2026-01-01+00:00:00" -H "${AUTH}"

# Search (returns AI-generated answer + matching items)
curl -s "${BASE}/knowledgeSource?q=How+do+I+cancel" -H "${AUTH}" | jq '{answer, items: [.items[] | {id, name, title}]}'
```

## CRUD Operations

```bash
# Get specific article
curl -s "${BASE}/knowledgeSource/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Article Name", "title": "Article Title", "body": "<p>Content in HTML</p>", "parent": {parentId}}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/knowledgeSource/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"title": "Updated Title", "body": "<p>Updated content</p>"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/knowledgeSource/{id}" -H "${AUTH}"

# Archived articles
curl -s "${BASE}/knowledgeSource/archived" -H "${AUTH}"
```

## Categories (Structure)

```bash
# List categories
curl -s "${BASE}/knowledgeSourceStructure" -H "${AUTH}"

# Get category
curl -s "${BASE}/knowledgeSourceStructure/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSourceStructure" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Category Name"}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PUT "${BASE}/knowledgeSourceStructure/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/knowledgeSourceStructure/{id}" -H "${AUTH}"
```

## Website Connector (Auto-Crawl)

```bash
# List connectors
curl -s "${BASE}/knowledgeSource/websiteConnector" -H "${AUTH}"

# Get specific
curl -s "${BASE}/knowledgeSource/websiteConnector/{id}" -H "${AUTH}"

# Start crawl (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/websiteConnector/{id}/crawl" -H "${AUTH}"

# Stop crawl
curl -s -X POST "${BASE}/knowledgeSource/websiteConnector/{id}/stop" -H "${AUTH}"
```

## Export Knowledge Sources

```bash
# All as PDF
curl -s "${BASE}/export/knowledgeSources/all" -H "${AUTH}" -o knowledge.pdf

# FAQ only
curl -s "${BASE}/export/knowledgeSources/faq" -H "${AUTH}" -o faq.pdf
```

---

## How Knowledge Base Works

- Wiki articles are the primary training data for the **Basis-Agent** response suggestions
- AI uses **vector search** (Weaviate) to find relevant articles for each ticket
- Articles can be:
  - **Internal** — only visible to agents
  - **Public** — also shown to customers in chat/portal
- Category-based access control limits which agents/teams see which articles
- **Ask Neo** (AI assistant in UI) queries wiki for real-time answers
- Articles continuously improve response quality as they're updated
