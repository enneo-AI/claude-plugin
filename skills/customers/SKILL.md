---
name: customers
description: Use when the user wants to look up customers, contracts, customer history, or debug customer identification.
---

# Customer & Contract Management

## Trigger
Use when the user wants to look up customers, contracts, customer history, or debug customer identification.

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

## Search & Lookup

```bash
# Free-text search (by name, email, contract ID)
curl -s "${BASE}/customer/search?q={searchTerm}" -H "${AUTH}" | jq '[.[] | {id, firstname, lastname, email, address, contractIds}]'

# By customer ID
curl -s "${BASE}/customer/byCustomerId/{customerId}" -H "${AUTH}"

# By contract ID
curl -s "${BASE}/customer/byContractId/{contractId}" -H "${AUTH}"

# By ticket ID (which customer is linked to this ticket)
curl -s "${BASE}/customer/byTicketId/{ticketId}" -H "${AUTH}"

# Contract details
curl -s "${BASE}/contract/{contractId}" -H "${AUTH}"

# Search contracts
curl -s "${BASE}/contract/search?q={searchTerm}" -H "${AUTH}"
```

## Update Customer (REQUIRES CONFIRMATION)

```bash
curl -s -X PATCH "${BASE}/customer/{customerId}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

## Invalidate Cache (REQUIRES CONFIRMATION)

Force re-fetch from ERP:

```bash
curl -s -X POST "${BASE}/customer/invalidateCache" \
  -H "${AUTH}" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "contractId={contractId}&customerId={customerId}"
```

---

## Customer Recognition Flow

Enneo identifies customers through 4 API patterns against the connected ERP/CRM:

1. **Contract ID search** — exact match by contract number
2. **Customer ID search** — exact match by customer ID
3. **Attribute search** — match by name, address, email, phone, meter number
4. **Free-text search** — full-text search across customer data (max 10 results)

### Legitimation Levels

| Level | Meaning | Implications |
|-------|---------|-------------|
| 0 | Not recognized | No customer data available |
| 10-19 | Recognized but not legitimated | Email match, but identity not verified. Warning shown. |
| 20 | Identified and matched | Auto-detected. Dark processing allowed. |
| 30 | Manually confirmed | Agent verified identity. Highest trust. |

Legitimation >= 20 is required for dark processing (auto-execution).

### Legitimation Criteria

Standard matching criteria:
- Sender email matches ERP email
- Email in message body matches ERP
- Phone number matches
- Contract ID mentioned in message
- Customer ID mentioned
- First name / last name mentioned
- Delivery/billing address (~80% fuzzy match)
- Custom criteria (meter number, order ID, etc.)

### Chat/Voice Legitimation

For chat and voice channels, legitimation is configured via authentication instructions:
- Default: customer provides contractId + zip code
- Configurable per subchannel

---

## Debugging Customer Identification Issues

### "Customer not identified"

1. Check what the ticket has: `GET /ticket/{ticketId}` → look at `contractId`, `customerId`
2. Check activity log: `GET /ticket/{ticketId}/activity?showTechnicalInformation=true`
3. Check event traces for `contractDetection` type:
   ```bash
   curl -s -X POST "${BASE}/event/search?limit=1&includeTraces=true&format=raw" \
     -H "${AUTH}" -H "Content-Type: application/json" \
     -d '{"filters":[{"key":"e.ticketId","value":"{ticketId}","comparator":"="}]}' \
     | jq '[.events[0].traces[] | select(.type == "contractDetection") | {activity, detectionLog: .outcome.detectionLog}]'
   ```
4. The `detectionLog` shows step-by-step which criteria passed/failed

### Common causes
- Sender email doesn't match any ERP record
- ERP API returns error or timeout
- Customer data stale — try invalidating cache
- Ticket from internal email → no customer match expected
