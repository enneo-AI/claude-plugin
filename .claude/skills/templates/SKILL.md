# Template Management

## Trigger
Use when the user wants to manage email/response templates, preview template rendering, or understand template variables.

## Quick Reference

```bash
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## List & Get

```bash
# List all
curl -s "${BASE}/template" -H "${AUTH}" | jq '[.[] | {id, name, subject}]'

# Get specific
curl -s "${BASE}/template/{id}" -H "${AUTH}"
```

## CRUD Operations

```bash
# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/template" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "name": "Template Name",
    "subject": "Email Subject",
    "body": "<p>Hello {{customer.firstName}},</p><p>%MESSAGE%</p><p>Best regards</p>"
  }'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/template/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "body": "<p>Updated body</p>"}'

# Delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/template/{id}" -H "${AUTH}"
```

## Preview

Render a template with actual ticket data:

```bash
curl -s -X POST "${BASE}/template/preview" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"templateId": {id}, "ticketId": {ticketId}}'
```

---

## Template Syntax

Templates support **Handlebars** syntax for dynamic content.

### Placeholders
- `%MESSAGE%` — the agent's reply text (inserted by the UI)
- `{{customer.firstName}}`, `{{customer.lastName}}` — customer data
- `{{contract.number}}` — contract data
- `{{ticket.id}}`, `{{ticket.subject}}` — ticket data

### Template Types
- **Fixed text templates** — static content, no variables
- **Dynamic templates** — Handlebars with variables and functions
- Templates are organized hierarchically by skill tags

### Usage in AI Agents
Response cases with `output.type: "textTemplate"` use templates to generate customer replies. The `output.text` field contains the Handlebars template.

### Default Template
The `genericTemplateId` setting defines the fallback template used when no specific template is configured.
