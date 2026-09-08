import { enneoApi } from "../api.js";
import { text } from "./index.js";
export const ticketGet = {
    name: "enneo_ticket_get",
    description: "Get full data for a single ticket by ID: body, tags, attachments, reply template, the ERP customer object and the detected intents. Conversations are not part of it — read them from `/ticket/{id}/conversation`. Pass `refresh: true` to re-run AI processing (tags, agent detection, parameters) before returning.",
    inputSchema: {
        type: "object",
        properties: {
            ticketId: { type: "integer", description: "Ticket ID" },
            refresh: {
                type: "boolean",
                description: "If true, wipe and re-import the ticket from the ERP and re-run the AI pipeline before returning. Requires the `refreshFull` permission.",
                default: false,
            },
            erpCacheOnly: {
                type: "boolean",
                description: "If true, serve customer and contract from Mind's cache instead of refreshing them from the ERP (faster for bulk fetches).",
                default: false,
            },
        },
        required: ["ticketId"],
    },
    handler: async (args) => {
        const ticketId = Number(args.ticketId);
        // Mind strips `customer` and `intents` from the response unless both flags are sent. They are
        // free to ask for: the ticket is loaded with them either way, and the only outbound ERP call is
        // the contract/customer refresh, which `erpCacheOnly` governs instead.
        const query = {
            includeCustomer: "true",
            includeIntents: "true",
        };
        if (args.refresh)
            query.refresh = "true";
        if (args.erpCacheOnly)
            query.erpCacheOnly = "true";
        const ticket = await enneoApi(`/ticket/${ticketId}`, { query });
        return text(ticket);
    },
};
