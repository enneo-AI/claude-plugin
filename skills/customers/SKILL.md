---
name: customers
description: Use when the user wants to look up customers, contracts, customer history, or debug customer identification.
---

# Customer & Contract Management

## Trigger
Use when the user wants to look up customers, contracts, customer history, or debug customer identification.

## Preferred: MCP tools
Use the plugin's `enneo_*` MCP tools whenever one exists for the operation — they use the saved profile API key and return typed results. The curl examples below document the underlying REST API and serve as a fallback for operations not yet wrapped by an MCP tool.

No MCP tool covers customers or contracts today (`enneo_configure`, `enneo_profile_me`,
`enneo_ticket_get`, `enneo_ticket_search` are the whole set), so everything here is curl.

**Terminology.** *Customer* = the end caller, the client's own customer — that is what these
endpoints return. *Client* = the tenant company running this Enneo instance. *Agent* = the client's
human operator (or an AI agent). Product specs often say "customer" when they mean *client*.

## curl Reference

Native tools and curl share the instance and profile API key in `~/.enneo/env`. Reuse the saved key; if setup is missing, follow the `browser-jwt` skill to enter it locally. Source the file without displaying its contents:

```bash
. ~/.enneo/env   # exports ENNEO_INSTANCE, ENNEO_TOKEN
BASE="https://${ENNEO_INSTANCE}/api/mind"
AUTH="Authorization: Bearer ${ENNEO_TOKEN}"
```

---

## Search & Lookup

```bash
# Free-text customer search (name, email, contract/customer id). limit defaults to 10
curl -s "${BASE}/customer/search?q={searchTerm}&limit=10&offset=0" -H "${AUTH}" \
  | jq '[.[] | {id, firstname, lastname, email, phone, address, contractIds}]'

# By customer ID  (?includeContracts=true to embed contracts — can be slow on custom ERPs)
curl -s "${BASE}/customer/byCustomerId/{customerId}" -H "${AUTH}"

# By contract ID  (always embeds the customer's contracts)
curl -s "${BASE}/customer/byContractId/{contractId}" -H "${AUTH}"

# By ticket ID (which customer is linked to this ticket)
curl -s "${BASE}/customer/byTicketId/{ticketId}" -H "${AUTH}"

# Contract details  (?refresh=true re-fetches from the ERP first)
curl -s "${BASE}/contract/{contractId}" -H "${AUTH}"
```

All four `customer/*` reads accept `?includeRawData=true` (the raw ERP payload) and the
`by*Id` routes accept `?includeAgentPreview=true` (the operator-facing preview labels on each
contract).

`GET /contract/{contractId}` answers **HTTP 200 with `{"success":true,"code":"contract_not_found"}`**
when the ERP does not know the id — check `code`, not the status.

### Contract search — structured, not free-text

```bash
curl -s -G "${BASE}/contract/search" -H "${AUTH}" \
  --data-urlencode "lastname=Smith" --data-urlencode "postalCode=20249"
```

There is **no `q` parameter here.** Accepted fields: `contractId`, `customerId`, `firstname`,
`lastname`, `fullname`, `birthday`, `company`, `email`, `meterNumber`, `address` (e.g.
`Musterstr. 32, 20249 Hamburg`), `postalCode`, `city`, plus `includeRawData` and `ticketId`
(records the search as an event trace on that ticket).

Returns an array holding the single best match, or `[]`:
`{id, similarity, customerLegitimation, customerLegitimationMessage, contract, customer, cached, cacheDate}`.
`similarity` is 1.0 for an exact `contractId` hit.

Rate-limited: per operator for a human caller, and per ticket for a bot identification — ten failed
identification attempts on one ticket exhaust the budget, which is what stops contract-number
guessing through a chat bot.

## Update Customer (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/customer/{customerId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"tagIds": [4, 17]}'
```

Needs `updateCustomer`. **`tagIds` is the only writable field** — it replaces the whole set. Private
tags the caller cannot see are preserved automatically. This does not write back to the ERP.

## Invalidate Cache (REQUIRES CONFIRMATION)

Force re-fetch from the ERP on the next read:

```bash
curl -s -X POST "${BASE}/customer/invalidateCache" \
  -H "${AUTH}" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "contractId={contractId}&customerId={customerId}"
```

Either id may be omitted. Raw ERP data is kept; the normalised cache is wiped.

## Contract History

```bash
curl -s "${BASE}/contract/{contractId}/history?offset=0&limit=30" -H "${AUTH}"
```

Every interaction on the contract, oldest first: tickets, grid messages, deliveries, payments.
(`GET /ticket/{ticketId}/history` returns the same thing for a ticket's contract but is deprecated.)

---

## Customer Recognition Flow

Enneo identifies customers by calling the connected ERP/CRM through four configurable executors:

| Setting | Pattern |
|---|---|
| `searchContractByIdExecutor` | exact match by contract number |
| `searchCustomerByIdExecutor` | exact match by customer id |
| `searchContractByFieldsExecutor` | attribute match — name, address, email, phone, meter number |
| `searchContractByFreeTextExecutor` | full-text search across customer data |

Only clients on `erpSystem = Custom` with `apiErpCustomerStorage = remote` go out to the free-text
executor; otherwise `/customer/search` reads Mind's local `customer` / `contract` cache.

### Legitimation Levels (`customerLegitimation` on the ticket)

| Level | Meaning |
|-------|---------|
| 0 | Not identified — no customer or no contract linked |
| 10 | Identified, but the rules did not pass. Warning shown to the agent; `customerLegitimationMessage` says why |
| 12 | Identified, but the customer has no email in the ERP |
| 20 | Legitimated by the rules — the bar for auto-processing |
| 30 | Confirmed — an agent (or the bot during chat) picked/confirmed the customer |
| 40 | Legitimated with explicit human verification |

The automatic pipeline only ever produces 0, 10 or 20. Levels 30 and 40 are written by an operator
or a bot via `PATCH /ticket/{id}` with `customerLegitimation`.

**Auto-processing requires ≥ 20**; below that the ticket is held with
"Customer was not identified with sufficient confidence".

Level 20 is granted outright when the ticket is on the `system` channel, or its direction is `out`
or `internal`.

### Legitimation Rules

Configured per channel family as **matching groups** — the customer is legitimated only when
*every* group passes, and a group passes when at least `minimumOccurences` of its criteria match.

| Setting | Applies to |
|---|---|
| `customerLegitimationRuleSyncChannels` | `chat`, `phone` |
| `customerLegitimationRuleAsyncChannels` | everything else (email, letter, portal, …) |

Built-in criteria: `senderEmailMatchesDataInERP`, `emailInMessageMatchesDataInERP`,
`phoneNumberMatchesDataInERP`, `contractIdMentioned`, `customerIdMentioned`, `firstnameMentioned`,
`lastnameMentioned`, `deliveryAddressMentionedExactly`, `billingAddressMentionedExactly`,
`deliveryAddressMentionedSimilarly`, `billingAddressMentionedSimilarly`. Groups may also carry
client-defined custom criteria. Criteria that cannot apply to the channel are skipped, and a group
with no applicable criteria passes.

With no rules configured at all the result is level 10, "No legitimation rules configured".

A subchannel's `assistantAuthenticationInstructions` is a **deprecated** predecessor. It still takes
priority when set and `useCustomAuthenticationInstructions` is not switched off — check it first when
the rules appear to be ignored. `customerLegitimationThreshold` is likewise deprecated.

### Dry-run the rules without a ticket

```bash
curl -s -X POST "${BASE}/contract/legitimation/preview" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{
    "channel": "email",
    "contractId": "{contractId}",
    "from": "customer@example.com",
    "subject": "Question about my contract",
    "bodyPlain": "My contract number is 715559 and I would like to change my address."
  }'
```

Needs `customerSearch`. Writes nothing. Returns `{legitimationLevel, legitimationMessage,
detectionLog}` — `detectionLog` is the per-criterion ✓/✗ trace. `channel` is required; it decides
which of the two rule sets is used. This is the fastest way to test a rule change.

---

## Debugging Customer Identification Issues

### "Customer not identified"

1. Check what the ticket has:
   `GET /ticket/{ticketId}?viewing=false&includeCustomer=true` → `contractId`, `customerId`,
   `customerLegitimation`, `customerLegitimationMessage`
2. Check the activity log: `GET /ticket/{ticketId}/activity?showTechnicalInformation=true`
3. Check event traces of type `contractDetection`:
   ```bash
   curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
     -H "${AUTH}" -H "Content-Type: application/json" \
     -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}' \
     | jq '[.events[0].traces[] | select(.type == "contractDetection") | {activity, detectionLog: .outcome.detectionLog}]'
   ```
   The `detectionLog` shows step by step which criteria passed or failed.
4. Reproduce the rule evaluation in isolation with `POST /contract/legitimation/preview`.

### Common causes
- Sender email doesn't match any ERP record
- ERP API returns an error or times out — the ticket keeps `contractId`/`customerId` but the objects
  come back null, and legitimation falls to 0
- `contractId` points at ERP data no longer in the local cache → "Contract not available in local
  cache, cannot legitimize" (level 0). Invalidate the cache and re-read
- No legitimation rules configured (level 10), or a deprecated
  `assistantAuthenticationInstructions` on the subchannel silently overriding them
- The bot's identification budget for that ticket is exhausted after ten failed attempts
- Ticket from an internal email → no customer match expected
