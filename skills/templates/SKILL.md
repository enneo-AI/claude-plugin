---
name: templates
description: Use when the user wants to manage email/response templates, preview template rendering, or understand template variables.
---

# Template Management

## Trigger
Use when the user wants to manage email/response templates, preview template rendering, or understand template variables.

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

## List & Get

```bash
# List — paginated, wrapped in `templates`. Returns HTTP 404 (not an empty list) when nothing matches.
curl -s "${BASE}/template?limit=100&offset=0" -H "${AUTH}" | jq '.templates[] | {id, description, subject, tagId}'

# Full-text search over description + message
curl -s "${BASE}/template?q=Zaehlerstand" -H "${AUTH}"

# Filter by the linked tag (query param is named aiAgentId, filters on tagId)
curl -s "${BASE}/template?aiAgentId={tagId}" -H "${AUTH}"

# Get one — adds `template` (the wrapper) and `mergedTemplate` (wrapper with %MESSAGE% substituted)
curl -s "${BASE}/template/{id}" -H "${AUTH}"

# Id 0 is not a template: it returns the generic wrapper configured for that subchannel
curl -s "${BASE}/template/0?subchannelId={subchannelId}" -H "${AUTH}"
```

## Fields

| Field | Meaning |
|---|---|
| `description` | Human-readable name shown in the picker (there is **no** `name` field) |
| `message` | The customer-facing body, HTML + Handlebars (there is **no** `body` field) |
| `subject` | Only used for templates not sent as a ticket reply |
| `emailTemplateId` | Wrapper template supplying greeting/signature around `%MESSAGE%`. Defaults to the `genericTemplateId` setting |
| `tagId` | Optional tag categorising the template |
| `exampleTicketIds` | Ticket IDs showcasing the template; filtered to existing tickets on read |
| `attachments` | `[{name, url}]` or `[{name, base64}]` — attached when the template is inserted |

## CRUD Operations

All three require the `manageTemplates` permission.

```bash
# Create (REQUIRES CONFIRMATION)
curl -s -X POST "${BASE}/template" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "description": "Meter reading received",
    "message": "<p>We recorded {{intent.data.reading}} kWh for {{formatDateEN intent.data.date}}.</p>",
    "subject": "Your meter reading",
    "tagId": 42,
    "exampleTicketIds": [9001]
  }'

# Update (REQUIRES CONFIRMATION)
curl -s -X PATCH "${BASE}/template/{id}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"description": "Updated name", "message": "<p>Updated body</p>"}'

# Delete — soft delete (REQUIRES CONFIRMATION)
curl -s -X DELETE "${BASE}/template/{id}" -H "${AUTH}"
```

Delete is refused while the template is the configured generic template, is used by a live subchannel, or is another template's `emailTemplateId`. Invalid Handlebars in `message` fails the write with HTTP 400.

## Preview

Renders a piece of template **text** — not a stored template id — against real data:

```bash
curl -s -X POST "${BASE}/template/preview" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"templateText": "<p>Hello {{customer.firstName}}</p>", "ticketId": {ticketId}}'
```

- `templateText` is required. `ticketId` hydrates contract/customer/intent data; `contractId` is the alternative when no ticket exists; both omitted renders with static data only.
- Returns `{success, preview, variables}` — `preview` is HTML exactly as the send path produces it (no extra `<br>` insertion), `variables` is the replacement data used.
- To render a stored template, fetch it first and pass its `message` (or `mergedTemplate`) as `templateText`.

## Variable Catalogue

Ask the instance rather than guessing — this returns the whole replacement object for a real ticket:

```bash
curl -s "${BASE}/ticket/{ticketId}/variables" -H "${AUTH}" | jq '.variables | keys'
```

Top-level namespaces:

| Namespace | Contents |
|---|---|
| `in.*` | The ticket itself: `ticketId`, `direction`, `channel`, `subchannelId`, `subject`, `message`, `summary`, `date`, `sender`, `tagIds`, `metadata` |
| `contract.*` | Contract record from the ERP (empty when the ticket has no contract) |
| `customer.*` | Customer record from the ERP |
| `profile.*` | The public profile of the agent rendering the template |
| `intent.context`, `intent.data.*` | AI agent result attached to the ticket |
| custom | Every key of the `templateData` setting is merged in at top level, including the tenant-specific block |

Inside an AI agent's response case, the agent's extracted **parameters are merged at top level** — a parameter named `newIBAN` is `{{newIBAN}}`, not `{{intent.data.newIBAN}}`.

---

## Template Syntax

Templates are **Handlebars** (rendered server-side by LightnCandy), embedded in HTML.

### Placeholders
- `%MESSAGE%` — literal marker in a *wrapper* template; the reply body is `str_replace`d into it. Not Handlebars, and not usable in an ordinary template body.
- `{{path.to.value}}` — any path from the variable catalogue above.
- An unknown path renders as the literal `{{path}}` rather than blank — that is the built-in `undefined` helper. It stops applying as soon as the template contains `{{#if}}` / `{{else}}` control structures, which are compiled unguarded.

### Helpers
Beyond stock Handlebars: `contains`, `compare`, `gt`, `lt`, `and`, `or`, `not`, `formatDateDE`, `formatDateEN`, `addDays`, `extractFirstName`, `extractLastName`, `last4digits`.

`contains`, `compare`, `gt` and `lt` compare as **strings** — quote numeric ids:

```handlebars
{{#if (contains in.tagIds "22")}}…{{/if}}   {{! correct }}
{{#if (contains in.tagIds 22)}}…{{/if}}     {{! never matches }}
```

`formatDateDE`, `formatDateEN` and `addDays` accept the literal `"today"`.

### Wrapper vs. body
Two levels: the **wrapper** (greeting + `%MESSAGE%` + signature) and the **body** (`message`). The wrapper comes from the `genericTemplateId` setting, overridden per subchannel when that subchannel has a custom template enabled. `GET /template/{id}` returns both plus the merged result.

### Usage in AI Agents
A response case with `output.type` of `textTemplate` (or `textTemplateAndClose`) produces a customer reply from a template:

```json
{ "output": { "type": "textTemplate", "templateId": 12, "text": "", "parameters": [1, 2] } }
```

`templateId` selects a stored template; leave it empty and `output.text` is used as an inline Handlebars template instead. Either way the wrapper is applied around it and the agent's parameters are available as top-level variables.

### Translation
When a template is shown to an agent in another language, the configured wording is translated *before* substitution and `{{…}}` tokens and `%MESSAGE%` are masked out of the model call, so placeholders survive verbatim. A translated template that no longer compiles is discarded in favour of the original.
