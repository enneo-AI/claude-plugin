# Enneo API Reference

All Mind API routes are defined in: `/apps/enneo/mind/Mind/Routes/Dispatcher.php`

## Making API Calls

### Authentication
All requests require: `Authorization: Bearer <token>`

### Known Environments
| Environment | URL | Token |
|---|---|---|
| Main | `https://main.enneo.dev` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjF9.Qg1FL8W6guEbGclzk_iTwoXgzzbMuC266RfrRB-VG7w` |
| Customer | Ask customer for URL + token | — |

### Example Request
```bash
curl --location 'https://main.enneo.dev/api/mind/ticket/233?refresh=false' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjF9.Qg1FL8W6guEbGclzk_iTwoXgzzbMuC266RfrRB-VG7w'
```

---

## Ticket Endpoints

| Method | Path | Description | Source |
|---|---|---|---|
| POST | `/api/mind/ticket/search` | Search/list tickets (see filter format below) | `TicketRoute::index()` |
| POST | `/api/mind/ticket/getLatest` | Get latest tickets | `TicketRoute::getLatestTicket()` |
| POST | `/api/mind/ticket` | Create ticket | `TicketRoute::create()` |
| GET | `/api/mind/ticket/{ticketId}` | Get ticket (add `?refresh=true` to re-run AI) | `TicketRoute::get()` |
| PATCH | `/api/mind/ticket/{ticketId}` | Update ticket | `TicketRoute::update()` |
| PATCH | `/api/mind/ticket` | Bulk update tickets | `TicketRoute::bulkUpdate()` |
| GET | `/api/mind/ticket/{ticketId}/variables` | Get ticket variables | `TicketRoute::variables()` |
| GET | `/api/mind/ticket/{ticketId}/activity?showTechnicalInformation=true` | **Activity log with events** (key for debugging!) | `TicketRoute::activity()` |
| POST | `/api/mind/ticket/{ticketId}/forward` | Forward ticket | `TicketRoute::forward()` |
| POST | `/api/mind/ticket/{ticketId}/autoexecute?executeAgentId={id}` | Trigger auto-processing | `TicketRoute::autoprocess()` |
| GET | `/api/mind/ticket/{ticketId}/ping` | Ping/keep-alive | `TicketRoute::ping()` |
| GET | `/api/mind/ticket/detectAutoProcessable` | Check which open tickets can be dark-processed | `TicketRoute::detectAutoProcessable()` |
| GET | `/api/mind/ticket/processAutoProcessable` | Execute dark processing on detected tickets | `TicketRoute::processAutoProcessable()` |
| GET | `/api/mind/ticket/stats` | Ticket statistics | `TicketRoute::stats()` |
| POST | `/api/mind/ticket/textUpdate` | AI text modification | `TicketRoute::textUpdate()` |
| GET | `/api/mind/agents/queue` | Agent queues | `TicketRoute::queue()` |

### Ticket Search Filter Format

`POST /api/mind/ticket/search` accepts a JSON body:

```json
{
  "filters": [
    {"key": "tt.tagId", "values": [1], "comparator": "in"},
    {"key": "t.channel", "values": ["all"], "comparator": "in"},
    {"key": "t.status", "values": ["open"], "comparator": "in"}
  ],
  "limit": 10,
  "offset": 0,
  "orderByField": "t.createdAt",
  "orderByDirection": "desc"
}
```

**Filter keys:** `tt.tagId`, `t.channel`, `t.status`, `t.direction`, `t.createdAt`, `t.priority`, `t.agentId`, `t.responderId`, `t.aiSupportLevel`, `t.spamStatus`
**Channel values:** `"email"`, `"phone"`, `"letter"`, `"chat"`, `"all"` (all = no filter)
**Status values:** `"open"`, `"closed"`, `"pending"`, `"resolved"`
**Comparators:** `"in"`, `"="`, `"between"`, `"like"`
**Response:** `{"tickets": [...], "total": N, "offset": 0, "limit": 10, "success": true}`

## Conversation Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/ticket/{ticketId}/conversation` | List conversations for ticket |
| GET | `/api/mind/ticket/{ticketId}/conversation/{conversationId}` | Get specific conversation |
| POST | `/api/mind/ticket/{ticketId}/conversation/reply` | Reply to ticket |
| POST | `/api/mind/ticket/{ticketId}/conversation/store` | Store internal note |
| PATCH | `/api/mind/ticket/{ticketId}/conversation/{conversationId}` | Update conversation |
| DELETE | `/api/mind/ticket/{ticketId}/conversation/{conversationId}` | Delete conversation |

## Customer / Contract Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/customer/search?q=<text>` | Free-text customer search |
| GET | `/api/mind/customer/byCustomerId/{customerId}` | Get customer by customer ID |
| GET | `/api/mind/customer/byContractId/{contractId}` | Get customer by contract ID |
| GET | `/api/mind/customer/byTicketId/{ticketId}` | Get customer linked to ticket |
| POST | `/api/mind/customer/invalidateCache` | Invalidate customer cache |
| PATCH | `/api/mind/customer/{customerId}` | Update customer |
| GET | `/api/mind/contract/search` | Search contracts |
| GET | `/api/mind/contract/{contractId}` | Get contract |
| GET | `/api/mind/contract/{contractId}/history` | Contract ticket history |

## AI Agent Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/aiAgents` | List all AI agents |
| GET | `/api/mind/aiAgents/tree` | Get agents as tree |
| GET | `/api/mind/aiAgents/availableDefaults` | Available default agents |
| POST | `/api/mind/aiAgents/loadDefaults` | Load default agents |
| POST | `/api/mind/aiAgent` | Create agent |
| GET | `/api/mind/aiAgent/{id}` | Get agent |
| PATCH | `/api/mind/aiAgent/{id}` | Update agent |
| DELETE | `/api/mind/aiAgent/{id}` | Delete agent |
| GET | `/api/mind/aiAgent/{id}/similarTickets` | Find similar tickets |
| POST | `/api/mind/aiAgent/{id}/preview` | Preview agent |
| POST | `/api/mind/aiAgent/outcome` | Submit agent outcome |

## Intent Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/intent/{intentId}` | Get intent by ID |
| PUT | `/api/mind/intent/{intentId}` | Update intent |
| DELETE | `/api/mind/intent/{intentId}` | Delete intent |
| GET | `/api/mind/intent/byTicketId/{ticketId}` | Get intents for ticket |
| POST | `/api/mind/intent/{intentId}/execute` | Execute intent |
| GET | `/api/mind/intent/list` | List intents |
| GET | `/api/mind/intent/preview/{aiAgentId}` | Preview intent |

## Tag Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/tag` | List all tags |
| GET | `/api/mind/tag/tree` | Get tag tree |
| POST | `/api/mind/tag` | Create tag |
| GET | `/api/mind/tag/{id}` | Get tag |
| DELETE | `/api/mind/tag/{id}` | Delete tag |
| POST | `/api/mind/tag/{id}/detect` | Test tag detection on a ticket |

## AI Quality Check Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/mind/aiQualityCheck/testRun` | Schedule test run |
| GET | `/api/mind/aiQualityCheck/testRun` | List test runs |
| GET | `/api/mind/aiQualityCheck/testRun/{testRunId}` | Get test run |
| DELETE | `/api/mind/aiQualityCheck/testRun/{testRunId}` | Delete test run |
| POST | `/api/mind/aiQualityCheck/testRun/{testRunId}/rerun` | Re-run test |
| PATCH | `/api/mind/aiQualityCheck/testRun/{testRunId}/cancel` | Cancel test run |
| PATCH | `/api/mind/aiQualityCheck/testRun/{id}/updateExpectedResult/{ticketId}` | Update expected result |
| PATCH | `/api/mind/aiQualityCheck/testRun/{id}/acceptExpectedResult/{ticketId}` | Accept result |
| GET | `/api/mind/aiQualityCheck/testCase` | List test cases |
| POST | `/api/mind/aiQualityCheck/testCase` | Create test case |
| GET | `/api/mind/aiQualityCheck/testCase/{aiAgentId}` | Get test cases for agent |
| POST | `/api/mind/aiQualityCheck/testCase/{aiAgentId}` | Add test cases |
| DELETE | `/api/mind/aiQualityCheck/testCase/{testCaseId}` | Delete test case |

## Settings & Configuration

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/settings` | Get all settings |
| POST | `/api/mind/settings` | Update settings batch |
| GET | `/api/mind/settings/compact` | Compact settings |
| GET | `/api/mind/settings/category/{category}` | Settings by category |
| PUT | `/api/mind/settings/{name}` | Update specific setting |
| GET | `/api/mind/settings/subchannel` | List subchannels |
| POST | `/api/mind/settings/subchannel` | Add subchannel |
| DELETE | `/api/mind/settings/subchannel/{id}` | Delete subchannel |
| GET | `/api/mind/settings/user-defined-function` | List UDFs |
| POST | `/api/mind/settings/user-defined-function` | Add UDF |
| DELETE | `/api/mind/settings/user-defined-function/{id}` | Delete UDF |
| GET | `/api/mind/settings/event-hook` | List event hooks |
| POST | `/api/mind/settings/event-hook` | Add event hook |
| DELETE | `/api/mind/settings/event-hook/{id}` | Delete event hook |

## Profile / User Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/profiles` | List all profiles |
| GET | `/api/mind/profile` | Get current user profile |
| POST | `/api/mind/profile` | Create profile |
| GET | `/api/mind/profile/{id}` | Get specific profile |
| PATCH | `/api/mind/profile/{id}` | Update profile |
| DELETE | `/api/mind/profile/{id}` | Delete profile |
| GET | `/api/mind/profile/{id}/routing` | Get routing info for user |
| PATCH | `/api/mind/profile/{id}/routingStatus` | Update routing status |
| POST | `/api/mind/jwt/{id}` | Get JWT for user |

## Team Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/team/tree` | Get team tree |
| GET | `/api/mind/team/list` | List teams |
| GET | `/api/mind/team/{id}` | Get team |
| POST | `/api/mind/team` | Create team |
| PATCH | `/api/mind/team/{id}` | Update team |
| DELETE | `/api/mind/team/{id}` | Delete team |

## Role Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/roles` | List roles |
| POST | `/api/mind/roles` | Create role |
| GET | `/api/mind/roles/{id}` | Get role |
| PATCH | `/api/mind/roles/{id}` | Update role |
| DELETE | `/api/mind/roles/{id}` | Delete role |

## Template Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/template` | List templates |
| POST | `/api/mind/template` | Create template |
| GET | `/api/mind/template/{id}` | Get template |
| PATCH | `/api/mind/template/{id}` | Update template |
| DELETE | `/api/mind/template/{id}` | Delete template |
| POST | `/api/mind/template/preview` | Preview template |

## Knowledge Source Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/knowledgeSource` | List knowledge sources (wiki) |
| GET | `/api/mind/knowledgeSource/dashboard` | Knowledge source dashboard |
| POST | `/api/mind/knowledgeSource` | Create knowledge source |
| GET | `/api/mind/knowledgeSource/{id}` | Get knowledge source |
| PATCH | `/api/mind/knowledgeSource/{id}` | Update knowledge source |
| DELETE | `/api/mind/knowledgeSource/{id}` | Delete knowledge source |
| GET | `/api/mind/knowledgeSourceStructure` | List categories |
| POST | `/api/mind/knowledgeSourceStructure` | Create category |
| PUT | `/api/mind/knowledgeSourceStructure/{id}` | Update category |
| DELETE | `/api/mind/knowledgeSourceStructure/{id}` | Delete category |

## Event & Event Trace Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/event/{id}` | Get event |
| PATCH | `/api/mind/event/{id}` | Update event |
| GET | `/api/mind/event/getEventTypes` | List event types |
| POST | `/api/mind/event/search` | Search events |
| POST | `/api/mind/event` | Create event |
| GET | `/api/mind/eventTrace/{id}` | Get event trace |
| PATCH | `/api/mind/eventTrace/{id}` | Update event trace |
| POST | `/api/mind/eventTrace` | Create event trace |
| POST | `/api/mind/eventTrace/batch` | Batch create traces |

## Export Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/export/conversations` | Export conversations |
| GET | `/api/mind/export/messageSamples` | Export message samples |
| GET | `/api/mind/export/customData` | Export custom data |
| GET | `/api/mind/export/users` | Export users |
| GET | `/api/mind/export/gdprPrivateData` | Export GDPR data |
| GET | `/api/mind/export/aiAgentPerformance` | Export AI agent performance |
| GET | `/api/mind/export/qualityAssessments` | Export quality assessments |
| GET | `/api/mind/export/{key}` | Generic export |
| GET | `/api/mind/export/knowledgeSources/{type}` | Export knowledge sources |

## Report Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/report/structure` | Report structure |
| GET | `/api/mind/report/aiPerformance` | AI performance report |
| GET | `/api/mind/report/aiAgentPerformance/{aiAgentId}` | Specific agent performance |
| GET | `/api/mind/report/telephonyLine/{lineId}` | Telephony line details |
| GET | `/api/mind/report/telephonyAgent/{agentId}` | Telephony agent details |
| GET | `/api/mind/report/{reportCode}` | Generic report |

## Quality Management (Scorecards)

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/quality/scorecard` | List scorecards |
| POST | `/api/mind/quality/scorecard` | Create scorecard |
| GET | `/api/mind/quality/scorecard/{id}` | Get scorecard |
| PATCH | `/api/mind/quality/scorecard/{id}` | Update scorecard |
| DELETE | `/api/mind/quality/scorecard/{id}` | Delete scorecard |
| GET | `/api/mind/quality/assessment` | List assessments |
| GET | `/api/mind/quality/assessment/{id}` | Get assessment |
| PATCH | `/api/mind/quality/assessment/{id}` | Update assessment |
| DELETE | `/api/mind/quality/assessment/{id}` | Delete assessment |
| GET | `/api/mind/ticket/{ticketId}/worklog` | Get ticket worklogs |

## Partner Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/partner/list` | List partners |
| GET | `/api/mind/partner/{id}` | Get partner |
| POST | `/api/mind/partner` | Create partner |
| PATCH | `/api/mind/partner/{id}` | Update partner |
| DELETE | `/api/mind/partner/{id}` | Delete partner |

## Telephony Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/mind/telephony/callReceived` | Call received |
| POST | `/api/mind/telephony/agentConnected` | Agent connected to call |
| POST | `/api/mind/telephony/callCompleted` | Call completed |
| GET | `/api/mind/telephony/getRouting` | Get telephony routing |
| GET | `/api/mind/telephony/routingAvailability` | Check routing availability |

## Code Executor Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/mind/executor/preview` | Preview code execution |
| POST | `/api/mind/executor/execute/{name}` | Execute UDF by name |
| POST | `/api/mind/executor/localExecutionCommand` | Local execution command |

## Tools Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/tools` | List AI tools |
| GET | `/api/mind/tools/{identifier}` | Get tool |
| POST | `/api/mind/tools/{identifier}/run` | Execute tool |

## Webhook Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/mind/webhook/powercloud` | Powercloud webhook |
| POST | `/api/mind/webhook/lynqtech` | Lynqtech webhook |
| POST | `/api/mind/webhook/authSync` | Auth sync webhook |
| POST | `/api/mind/webhook/fetchEmails[/{subchannelId}]` | Trigger email fetch |

## Survey Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/mind/survey/{reference}-{ticketId}` | Submit user survey |
| GET | `/api/mind/survey/{id}` | Show customer survey |
| POST | `/api/mind/survey/{id}` | Submit customer survey |

## Storage / File Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/storage/{path}` | Get file from storage |
| POST | `/api/mind/storage` | Upload file |
| GET | `/api/mind/files/manager/list` | List managed files |
| POST | `/api/mind/files/manager/file` | Create file |
| PATCH | `/api/mind/files/manager/file` | Update file |
| DELETE | `/api/mind/files/manager/file` | Delete file |

## Other

| Method | Path | Description |
|---|---|---|
| GET | `/api/mind/health` | Health check |
| GET | `/api/mind/version` | Version info |
| GET | `/api/mind/docs/open-api` | OpenAPI spec |
| GET | `/api/mind/docs[/{path}]` | API docs |
| POST | `/api/mind/validation/{type}` | Validate data |
| POST | `/api/mind/reminder` | Create reminder |

## Cortex API (Internal Only — NOT accessible to customers)

Cortex endpoints are internal and called by Mind. Customers never interact with them directly.
Key internal endpoints (for my own understanding of the processing pipeline):
- `POST /api/cortex/channels/processTicket` — Main AI ticket processing
- `POST /api/cortex/ocrMeter` — OCR meter reading
- `POST /api/cortex/ocrLetter` — OCR letter processing
- `POST /api/cortex/queryKnowledgeBase` — Vector search for wiki/knowledge base
- `POST /api/cortex/qualityAssessment` — AI quality assessment

These are never used in customer-facing API calls. All customer investigation uses Mind endpoints only.
