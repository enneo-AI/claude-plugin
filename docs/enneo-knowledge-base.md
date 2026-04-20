# Enneo Knowledge Base

## What is Enneo?

Enneo is an AI platform for customer service automation (KI-Plattform für Kundenservice). It provides:
- **Ticketing** for email, letter, chat, and voice channels
- **AI Agents** that automate customer service processes
- **Skill-based routing** to direct tickets to the right agents
- **Analytics & BI** (Apache Superset integration)
- **Quality management** and test automation

**Website:** https://www.enneo.ai  
**Docs:** https://docs.enneo.ai  (no need to search this page, as it's a copy of /apps/enneo/docs)

---

## Architecture

Three main services:
1. **Mind** — PHP backend (coordinating backend, routing, ticket processing, API, DB)
2. **Cortex** — Python AI backend (LLM/AI processing, embeddings, OCR, chat/voice bots)
3. **ops-fe** — Next.js frontend (agent UI, settings, dashboards)

### Cortex Service
- **Language:** Python (FastAPI), Poetry for deps
- **Location:** `/apps/enneo/cortex/`
- **Key modules:**
  - `src/ai/` — LLM integration (models, presets, purposes, resolver), smart AI agent, tool management, embeddings (Weaviate), Langfuse observability
  - `src/services/ticket/` — Ticket processing pipeline: agent detection, AI agent handler, tag processor, ticket analyzer, parameter extraction, response case handling, conditions, quick mode
  - `src/services/chat_voice/` — Chat/voice bot processing (phonebot + VAPI webhooks)
  - `src/services/customer_identification/` — Customer recognition service
  - `src/services/execution/` — Tool execution (builtin, channel, custom tools)
  - `src/services/` — OCR (meter reading + general), knowledge base, quality assessment, text updates, voicebot, system prompts, message samples, model config
  - `src/external_services/` — Redis cache, MySQL DB, Weaviate vector DB, Mind API client, LiteLLM proxy, code executors (source code + API call)
  - `src/schemas/` — Pydantic models for ai_agent, ticket, contract, customer, interaction, tags, voicebot, VAPI webhooks, etc.
  - `src/prompts/` — Prompt fragments/templates
- **External services:** Weaviate (vector search), Redis (caching/locks), MySQL, LiteLLM proxy, Langfuse (observability), GCP OCR
- **API endpoints:** admin, channels, devops, message_broker, models, prompts, services, voicebot

### Mind Service
- **Language:** PHP 8.5, Propel ORM
- **Database:** MySQL (via Propel schema.xml)
- **Key tables:** ticket, conversation, customer, contract, ai_agent, intent, tag_description, teams, users, roles, settings, knowledge_sources, templates, survey, event_trace, queue, reporting_*, test_cases, test_runs, test_tickets
- **API Routes:** ~41 route files covering tickets, conversations, AI agents, quality, contracts, events, exports, settings, telephony, knowledge sources, webhooks, etc.
- **Key Services:** Cortex (AI), IntentDetection, IntentRecommendation, Acd (routing), Auth, Cache, Quality, LLM, ContractRecognition, ContractLegitimation, EmailService*, FileManager, Export, TimeTracking
- **ERP integrations:** Powercloud, Lynqtech, Custom
- **Dependencies:** Weaviate (vector DB), Redis, Google Cloud Storage, AWS SDK, SendGrid, OpenAI, IMAP, SMTP

### ops-fe (Frontend)
- **Framework:** Next.js (port 8001), ~2921 TS/TSX files
- **Key pages:** /dashboard, /tickets, /ticket/[ticketId], /ai-control-centre, /analytics, /wiki, /settings/*, /chat, /auth
- **Settings pages:** ai-agents, ai-qa, category, events, partners, phone, profiles, quality-scorecards, roles, teams, templates, text-template

---

## Contact Channels

### Email
- **Connection:** IMAP, API, or OAuth (Microsoft 365)
- **Config:** Settings → E-Mail-Konten
- Supports unlimited mailboxes, webhooks on ticket updates and new emails

### Letter (Brief)
- Import via scan service (email with PDF attachment) or REST API
- Set `channel: "letter"` in API
- Supports PDF, PNG, JPG, TIFF via OCR
- Outbound: webhook to printing service
- Address validation for postal codes (international formats supported)

### Chat
- Chat widget embedded on websites via JavaScript snippet
- Each chatbot linked to a KI-Agent (default: Basis-Agent)
- Channel-specific prompts supported
- Config: Settings → Chat

### Voice
- Voicebots + agent telephony
- Call-flow configuration: voicebots, agent routing, external forwarding, time-based switches, announcements
- SIP trunk: Enneo-provided or own (e.g. Sipgate)
- WebRTC for browser-based calling
- Firewall: TURN server at turn1.enneo.ai (91.99.219.69)

---

## Tickets

- A ticket groups all messages about one topic from one customer (like a Gmail thread)
- **Statuses:** open, closed, waiting
- **Directions:** in (incoming), out (outgoing), internal (notes)
- Three central data tables: tickets, messages, worklogs (bearbeitungen)

---

## Routing & Tags

### Tags
- **Types:** Skill tags, general tags, brand tags, product tags, customer tags, contract tags
- **Detection methods:** AI detection (ML), condition-based, AI+condition (AND/OR), channel-based, subchannel-based, manual only
- **Properties:** visibility (visible/hidden/private), complexity, priority, SLAs, test cases
- Config: Settings → Skills & Routing

### Routing
- Skill-based routing (agents get tickets matching their skills)
- SLA-based (by deadline), priority-based, channel-based
- Last-Agent-Routing, Last-Team-Routing
- Tag matching: ALL tags required vs. AT LEAST ONE
- Backlog access restriction by tags (per team/user)

### Autopilot
- Automatically assigns open tickets matching agent's skills
- Configurable: by SLA deadline or priority-first
- Respects Last-Agent-Routing and absence settings

### SLAs & Working Hours
- Defined per tag (e.g., 8h for emails, 4h for urgent)
- Working hours and holidays configured globally
- SLA calculation considers business hours only

---

## AI Agents (KI-Agenten)

### Two Types
1. **Smart AI Agents** — Prompt-based, use natural language instructions, tools, and wiki access. No coding needed.
2. **Rule-based AI Agents** — Defined input parameters, business logic (PHP/Python/JS), output handling. Maximum control.

### Default Agents (12 pre-built)
- Abschlags-Agent (deposit/installment)
- Basis-Agent (base/default, creates answer suggestions)
- Bankdaten-Agent (bank data changes, IBAN validation)
- Fälligkeits-Agent (due dates)
- Guthaben-Agent (credit balance)
- Kündigungs-Agent (cancellation)
- Lastschriftwiderrufs-Agent (SEPA mandate revocation)
- Stammdaten-Agent (master data changes)
- Tarifberatungs-Agent (tariff consulting)
- Wechsel-Agent (supplier switch)
- Werbeeinverständnis-Agent (marketing consent)
- Widerrufs-Agent (contract withdrawal)
- API-based Agent (external business logic)
- Zählerstand-Agent (meter reading, with OCR)

### Basis-Agent (Key Role)
- Analyzes incoming requests: sentiment, topic, context
- Foundation for routing and delegation to specialized agents
- Creates answer suggestions based on similar past cases + wiki
- Learns continuously from usage
- Configurable per subchannel (different prompts per brand/mailbox)
- Custom prompts: Settings → KI-Anpassung → Individuelle Prompts

### Smart Agent Configuration
- Prompt defines behavior, tools, actions
- Channel-specific prompts (email, chat, voice)
- Built-in tools + custom tools (KI-Tools)
- Custom tools: defined under Settings → KI-Anpassung → KI-Tools

### Rule-based Agent Configuration
- **Input Parameters:** Source from ticket/customer/contract data, AI extraction, or manual
- **Business Logic:** PHP 8.2 / Python 3.11 / Node.js 20
- **Output Handling:** Text templates, AI-generated responses, interactions (forms/buttons), auto-close
- **SDK:** Interaction objects with infos, form, data, options

---

## AI Control Centre (KI-Kontrollzentrum)

### Dashboard & Metrics
- Customer identification accuracy
- Tag categorization accuracy
- Text assistant accuracy
- Automation levels L0-L5:
  - L0: No AI (except identification)
  - L1: AI for text editing
  - L2: Base agent suggestion accepted
  - L3: Specialized agent suggestion accepted
  - L4: Dark processing with approval
  - L5: Fully autonomous processing
- Per-agent stats: processed, waiting approval, error rate

### Dark Processing / Auto-Processing (Dunkelverarbeitung)
- Fully automatic ticket processing without human interaction
- **With approval (L4):** Agent processes but human approves with one click
- **Without approval (L5):** Fully autonomous
- **Confidence levels:** Maximal (email match), Very high (customer+contract ID), High (ID+lastname, recommended), Medium, None
- **Time delay:** Optional wait before processing (respects business hours)
- **Actions:** Re-run AI on open tickets, refresh all agent tickets, process all marked tickets

#### Auto-Processing Evaluation Chain (`TicketAutoProcessing::check()`)
A ticket is marked as auto-processable (`aiSupportLevel = "automated"`) when ALL of these pass:
1. `enableAiAutoProcessing` client setting is enabled
2. Ticket has intents and status = `open`
3. The intent's AI Agent has a **response case** with `autoExecute: true` matching the current `_action`/`_actionNext`
4. That option must also be `recommended: true` (see `Intent::canBeAutoExecuted()`)
5. Only 1 auto-executable intent (multiple = skipped as too risky)
6. No inbound customer reply in conversations
7. Customer legitimation ≥ 20 (if contract is associated)

#### Auto-Execute Scheduling (`TicketAutoProcessing::getSchedulingDate()`)
Even after passing evaluation, `autoExecuteAt` is only set if:
- The AI Agent ID is listed in the `immediateAiAgents` client setting
- If `autoProcessingDelayEnabled` → delay by `autoProcessingDelay` hours (respects SLA/business hours)
- If NOT in `immediateAiAgents` → `autoExecuteAt` stays null → UI shows "Auto-processing possible, triggered manually" (human must trigger)

#### Response Case `autoExecute` Flag
- Configured per response case in AI Agent settings (`settings.responseCases[].autoExecute`)
- Each response case has a condition (typically matching `_action` parameter) and an `autoExecute` boolean
- API: `GET /api/mind/aiAgent/{id}` → `.settings.responseCases`
- To disable: `PATCH /api/mind/aiAgent/{id}` with updated `settings` where the response case has `autoExecute: false`

### Quality Check
- **Test cases:** Specific tickets assigned to agents for testing
- **Test runs:** Execute test cases (no write actions), compare expected vs received results
- Accept results or identify needed adjustments

---

## Customer Recognition

### 4 API Calls Required
1. **Search by Contract ID** → returns contract data (id, customerId, name, email, address, phone, agentPreview, erpUrls, custom fields)
2. **Search by Customer ID** → returns customer data (id, contractIds, name, email, address)
3. **Search by Attributes** (AI-extracted) → returns contractId + customerId
4. **Free-text Search** → returns list of customer IDs (max 10)

### Legitimation (4 Levels)
- **Level 0:** No customer identified
- **Level 10-19:** Customer recognized but not legitimated (warning shown)
- **Level 20:** Customer recognized AND data matches (dark processing allowed)
- **Level 30:** Manually confirmed by agent
- Chat/Voice: configured via authentication instructions (default: contractId + zip)
- Email/Letter: rule editor for legitimation (matching groups with criteria)

### Standard Criteria for Legitimation
- Sender email matches ERP
- Email in message matches ERP
- Phone matches ERP
- Contract ID mentioned, Customer ID mentioned
- First name, last name mentioned
- Delivery/billing address (exact or ~80% match)
- Custom criteria supported (e.g., meter number, order ID)

---

## User Management

### Users
- Profile: name, email, role, team assignment
- **Statuses:** Active (working), Pause, Support (helping colleague, no ticket editing), Extended absence (sick/vacation)
- Extended absence: tickets auto-routed to colleagues
- Language settings, password management

### Teams
- Skills and channels assigned at team level
- Hierarchical (sub-teams supported)
- Routing settings inherited by team members (if enabled)
- Multiple team membership: skills/channels cumulated, strongest role applies
- Data availability (analytics access) per team
- Backlog restriction by tags

### Roles
- **Base roles:** Admin (full access), Agent (ticket processing)
- **Custom roles:** Teamleiter, KI-Manager, Workforce Manager, Qualitätsmanager, Wissensmanager, Reportingmanager
- Permissions granularly configurable

### Organization Size Best Practices
- **Small (<15):** Simple structure, few roles
- **Medium (15-100):** Differentiated roles, specialized teams
- **Large (>100):** Multiple team types (functional, role-based, organizational), multi-team membership

---

## Surveys (Umfragen)

### Customer Surveys (CSAT)
- Embedded in email footer
- Scales: 3-point (Good/OK/Bad), 5-star, NPS (10-point)
- Custom HTML template
- Activated per email account
- Results exportable as XLSX

### User Surveys
- Internal: "How satisfied with AI suggestion?" (1-5 stars)
- Shown after ticket completion
- Measures AI quality from agent perspective

---

## Wiki
- Integrated knowledge management
- Articles used by Basis-Agent for answer suggestions
- Create, update, archive articles
- Category-based access per agent/subchannel

---

## Events & Webhooks

### Events (Asynchronous)
- AutoProcessIntent, ConversationCreated, CronDay/Hour/Minute/Week
- EmailAutoresponder, ProfileCreated/Updated/Deleted
- SendEmail, TicketCreated, TicketResponse, TicketUpdated, TicketRouted
- TicketForwarded, TicketClosedDueToInactivity, TestTicketAiQuality
- Custom code (PHP/Python/JS) or API call
- Use Enneo SDK in event handlers

### Webhooks (Synchronous)
- Email: on ticket updates, on new emails
- ERP: contract search, customer search, attribute search, free-text search
- Interrupt process flow to load external data in real-time

---

## Analytics & Exports

### Apache Superset Integration
- Access via Analytics menu
- Create custom charts, dashboards, SQL queries
- Data refresh: every 5 minutes
- Access controlled by "Datenverfügbarkeit" setting

### Exports
1. UI ticket list export (with current filters)
2. Settings → Exports (tickets, messages, worklogs)
3. REST API `/api/mind/export/` (JSON recommended, also CSV/XLSX)

### Worklog Fields
- duration, durationAfterWork (handling time)
- action: statusAction, closeAction, writeAction, autoProcessAction
- reOpened (for first-contact-resolution)
- aiAutomationLevel (L0-L5)
- customerIdentifiedCorrectly, tagsIdentifiedCorrectly
- textAssistanceAccuracy
- aiAgentsUsed (JSON array)
- skippedTicket, netSecondsClosedAfterSLA
- teams, tags (JSON arrays)
- topic, subTopic
- Privacy: anonymous, pseudonymous, or real names

---

## SDK

- **Languages:** PHP 8.2, Python 3.11, Node.js 20
- **Key classes:** ApiEnneo (get/post/patch/put/delete, getContract, getTicket, executeUdf), Api (external HTTP calls), Setting (get/set), Input (load), Interaction (infos, form, data, options), IntentInfo, IntentOption
- **URLs:** Available at `https://demo.enneo.ai/api/codeExecutor/sdk/{php82.php|python311.py|node20.js}`

---

## Legal / Compliance Documents
- AVV (Auftragsverarbeitungsvertrag) - Data Processing Agreement
- TOM (Technical and Organizational Measures)
- DSFA (Data Protection Impact Assessment)
- EU AI Act & GDPR Compliance Declaration
- SLA Agreement
- MSA (Master Subscription Agreement)
- Leistungsbeschreibung (Service Description)
- Data Flow Diagram
- Anonymization Process (5-step: LLM analysis → PII detection → null replacement → UI controls → security)

---

## Glossary
- **Dunkelverarbeitung:** Fully automated ticket processing by AI without human intervention
- **Autopilot:** Automatic ticket assignment to agents based on skills
- **CSAT:** Customer Satisfaction Score
- **SLA:** Service Level Agreement (response time targets)
- **Skill-based Routing:** Directing tickets to agents with matching competencies
- **Legitimierung:** Customer verification level determining processing permissions
- **Wiki:** Internal knowledge base used by AI for answer generation
- **Events:** Async triggers for integrations (ticket lifecycle, cron schedules)
- **Webhooks:** Sync triggers that interrupt processes to fetch external data
- **UDF:** User Defined Functions (reusable custom code)
