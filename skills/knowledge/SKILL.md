---
name: knowledge
description: Use when the user wants to manage wiki/knowledge base articles, files or website connectors — search, create, update, organize, or understand how knowledge is used by AI.
---

# Knowledge Base Management

## Trigger
Use when the user wants to manage wiki/knowledge base articles, files or website connectors — search, create, update, organize, or understand how knowledge is used by AI.

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

## Model

The product calls this the **AI Wiki**. One entry is a **knowledge source** (`knowledgeSource`); folders/groups are **structure** nodes (`knowledgeSourceStructure`). A knowledge source arrives one of three ways, and `type` says which:

| `type` | Origin | Writable through `/knowledgeSource`? |
|---|---|---|
| `faq`, `work-instruction`, `document`, `news`, `other` | Manually authored article | yes |
| `website` | Crawled by a website connector | no — create/edit/delete are rejected 422 |
| `file` | Uploaded through the files connector | only `name`, `status`, `text` |

Other fields: `status` (`active` / `archived` / `deleted`), `name`, `title`, `text` (the body — there is **no** `body` field), `source` (URL), `parent` (structure node id), `tags` (tag ids), `teams` (team ids restricting visibility), `confidential` (true = agents only, never shown to customers), `views`, `modifiedAt`.

Permissions: `readKnowledge`, `createKnowledge`, `updateKnowledge`, `deleteKnowledge`, `archiveKnowledge`, `viewArchivedKnowledge`.

## List & Search

```bash
# Root level / global list
curl -s "${BASE}/knowledgeSource" -H "${AUTH}" | jq '.items[] | {id, name, title, type}'

# Children of a folder — paginated, adds total/offset/limit (limit defaults to 50, max 500)
curl -s "${BASE}/knowledgeSource?parent={parentId}&limit=50&offset=0" -H "${AUTH}"

# Sorting — orderByField is one of name|views|modifiedAt|createdAt
curl -s "${BASE}/knowledgeSource?orderByField=modifiedAt&orderByDirection=desc" -H "${AUTH}"

# Filter by modification date — MySQL datetime, exactly Y-m-d H:i:s
curl -s --get "${BASE}/knowledgeSource" --data-urlencode "modifiedAfter=2026-01-01 00:00:00" -H "${AUTH}"

# Plain search — MySQL fulltext/LIKE over name, title, text. No AI, no `answer`.
curl -s --get "${BASE}/knowledgeSource" --data-urlencode "q=How do I cancel" -H "${AUTH}"

# "Ask Neo" — isAi=1 routes the question through Cortex and returns a generated answer
curl -s --get "${BASE}/knowledgeSource" --data-urlencode "q=How do I cancel" -d isAi=1 -H "${AUTH}" \
  | jq '{answer, items: [.items[] | {id, name, title}]}'
```

`q` needs at least 2 characters and overrides the other filters. Without `isAi=1` the `answer` field is absent — that flag is the difference between the dropdown suggestion list and Ask Neo.

```bash
# Dashboard (news + most-read overview)
curl -s "${BASE}/knowledgeSource/dashboard" -H "${AUTH}"

# Archived — paginated, needs viewArchivedKnowledge
curl -s "${BASE}/knowledgeSource/archived?limit=50&offset=0" -H "${AUTH}"
```

## CRUD Operations

```bash
# Get one article. Counts as a view. 404 for excluded website pages and for anything the
# caller's team ACL hides.
curl -s "${BASE}/knowledgeSource/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Opening hours", "title": "Opening hours", "text": "<p>Mon-Fri 8-17</p>", "type": "faq", "parent": {structureId}, "confidential": false}'

# Update (REQUIRES CONFIRMATION) — sending `teams` replaces the whole set; omitting it leaves it alone
curl -s -X PATCH "${BASE}/knowledgeSource/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"title": "Updated title", "text": "<p>Updated content</p>"}'

# Archive rather than delete (REQUIRES CONFIRMATION) — needs archiveKnowledge
curl -s -X PATCH "${BASE}/knowledgeSource/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{"status": "archived"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/knowledgeSource/{id}" -H "${AUTH}"
```

Creating with an existing `name` updates that article instead of adding a second one. Articles inside a Neo space are managed through their home space and return 403 here.

## Groups (Structure)

```bash
# Full folder tree
curl -s "${BASE}/knowledgeSourceStructure" -H "${AUTH}"

# Include website pages excluded by the connector's excludePaths
curl -s "${BASE}/knowledgeSourceStructure?withExcluded=true" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSourceStructure" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Billing", "parent": 0, "description": "", "type": "other"}'

# Update (REQUIRES CONFIRMATION)
curl -s -X PUT "${BASE}/knowledgeSourceStructure/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated name", "parent": 0, "description": ""}'

# Restrict a folder (and everything under it) to teams (REQUIRES CONFIRMATION)
# An empty array removes the restriction. Re-syncs the RAG index for the whole subtree.
curl -s -X PUT "${BASE}/knowledgeSourceStructure/{id}/teams" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{"teams": [1, 2]}'

# Delete — recursive; contained articles are marked deleted (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/knowledgeSourceStructure/{id}" -H "${AUTH}"
```

Folders of type `website` or `file` belong to their connector and cannot be created or edited here.

## Files Connector

Documents uploaded into the wiki. One singleton connector per instance, auto-created on first read; each file becomes a `type: "file"` knowledge source whose Markdown text is parsed out of the binary and indexed.

```bash
# Connector + its folders + its files. `data` carries allowedExtensions and maxFileSizeMb.
curl -s "${BASE}/knowledgeSource/filesConnector" -H "${AUTH}" | jq '{data, folderCount, fileCount}'

# Upload — multipart, single file per call (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/filesConnector/upload" -H "${AUTH}" \
  -F "file=@./pricing.pdf" -F "folderId={folderStructureId}" -F "relativePath=2026/q1"

# Replace the binary behind an existing file (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/filesConnector/{id}/replace" -H "${AUTH}" -F "file=@./pricing-v2.pdf"

# Re-parse the original binary — discards manual Markdown edits (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/filesConnector/{id}/resetToOriginal" -H "${AUTH}"

# Re-embed the current text without re-parsing — keeps manual edits (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/filesConnector/{id}/refreshIndex" -H "${AUTH}"

# Move a file (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/knowledgeSource/filesConnector/{id}/move" \
  -H "${AUTH}" -H "Content-Type: application/json" -d '{"folderId": {folderStructureId}}'

# Download the original binary — 302 to /api/mind/storage/knowledgeSources/{id}-{hash}/{filename}
curl -sL "${BASE}/knowledgeSource/filesConnector/{id}/original" -H "${AUTH}" -o original.pdf

# Folders (REQUIRES CONFIRMATION on each)
curl -s -X POST   "${BASE}/knowledgeSource/filesConnector/folders" -H "${AUTH}" -H "Content-Type: application/json" -d '{"name": "Contracts", "parentId": {parentStructureId}}'
curl -s -X PATCH  "${BASE}/knowledgeSource/filesConnector/folders/{id}" -H "${AUTH}" -H "Content-Type: application/json" -d '{"name": "Renamed", "parentId": {newParentId}}'
curl -s -X DELETE "${BASE}/knowledgeSource/filesConnector/folders/{id}" -H "${AUTH}"
```

Accepted extensions: `pdf`, `docx`, `doc`, `odt`, `rtf`, `xlsx`, `xls`, `html`, `md`, `txt`, `png`, `jpg`, `jpeg`. Max 50 MB per file; images are described by a vision model rather than parsed. A duplicate name in the target folder is 409, an unsupported or spoofed type is 422, an oversized file is 413.

Editing a file article's `text` through `PATCH /knowledgeSource/{id}` flags it as manually edited — `resetToOriginal` throws those edits away, `refreshIndex` keeps them.

## Website Connector (Auto-Crawl)

```bash
# List / get
curl -s "${BASE}/knowledgeSource/websiteConnector" -H "${AUTH}"
curl -s "${BASE}/knowledgeSource/websiteConnector/{id}" -H "${AUTH}"

# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/websiteConnector" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "name": "Example", "parent": 0, "maxPages": 100, "frequency": "weekly", "includePaths": [], "excludePaths": [], "crawlImages": false}'

# Update (REQUIRES CONFIRMATION). excludePaths replaces the list;
# addExcludePaths / removeExcludePaths edit it atomically and are mutually exclusive with it.
curl -s -X PATCH "${BASE}/knowledgeSource/websiteConnector/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"addExcludePaths": ["/legal/*"], "scheduleEnabled": true, "frequency": "daily"}'

# Crawl control (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/knowledgeSource/websiteConnector/{id}/crawl" -H "${AUTH}"
curl -s -X POST "${BASE}/knowledgeSource/websiteConnector/{id}/stop" -H "${AUTH}"

# Delete the connector and its pages (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/knowledgeSource/websiteConnector/{id}" -H "${AUTH}"
```

Pages matching `excludePaths` stay in the tree but are hidden from `GET /knowledgeSource`, return 404 individually, and are dropped from the AI index.

## Export Knowledge Sources

Renders a PDF. `{type}` is `all` or any knowledge-source type (`faq`, `work-instruction`, `document`, `news`, …). Requires `exportData`.

```bash
curl -s "${BASE}/export/knowledgeSources/all" -H "${AUTH}" -o knowledge.pdf
curl -s "${BASE}/export/knowledgeSources/faq" -H "${AUTH}" -o faq.pdf
```

---

## How Knowledge Base Works

- Wiki content is the primary source for the **Basis-Agent**'s response suggestions, and for chat and voicebot answers.
- Cortex embeds every active article and retrieves by vector similarity plus reranking. There is no vector-search endpoint on the Mind API — `?q=…&isAi=1` is the only exposed path to it.
- AI agents read it through the builtin tool **`GetKnowledgeBaseEntries`** (slug `get_knowledge_base_entries`), listed by `GET /tools`.
- `confidential: true` keeps an article agent-only; it is still used for agent-facing suggestions but never surfaced to customers.
- **Team ACLs** are set on folders (`PUT /knowledgeSourceStructure/{id}/teams`) or per article (`teams` on the article). Anything team-restricted is excluded from the AI index entirely, not merely hidden in the UI. An article whose own teams are blocked by its folder chain comes back with `access: {blocked: true}` — a misconfiguration worth reporting.
- **Ask Neo** is this same search with `isAi=1`; it reads every article regardless of the confidential flag.
- Changes fire `knowledgeSourceChanged` events that push upserts/deletes to the index, so edits take effect without a manual reindex.
