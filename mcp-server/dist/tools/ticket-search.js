import { enneoApi } from "../api.js";
import { text } from "./index.js";
export const ticketSearch = {
    name: "enneo_ticket_search",
    description: "Search tickets by filters. Returns compact tickets (no body/attachments — use enneo_ticket_get for full data). Filter keys: `t.status`, `t.channel`, `t.direction`, `t.priority`, `t.createdAt`, `t.agentId`, `t.contractId`, `t.customerId`, `t.aiSupportLevel`, `tt.tagId`, `i.aiAgentId`. Comparators: `=`, `!=`, `>`, `<`, `in`, `between`.",
    inputSchema: {
        type: "object",
        properties: {
            filters: {
                type: "array",
                description: 'Array of filter objects, e.g. [{"key":"t.status","values":["open"],"comparator":"in"}]',
                items: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        comparator: { type: "string" },
                        value: {},
                        values: { type: "array" },
                        from: { type: "string" },
                        to: { type: "string" },
                    },
                },
            },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 500 },
            offset: { type: "integer", default: 0, minimum: 0 },
            orderByField: { type: "string", default: "t.createdAt" },
            orderByDirection: { type: "string", enum: ["asc", "desc"], default: "desc" },
        },
    },
    handler: async (args) => {
        const body = {
            filters: args.filters ?? [],
            limit: args.limit ?? 20,
            offset: args.offset ?? 0,
            orderByField: args.orderByField ?? "t.createdAt",
            orderByDirection: args.orderByDirection ?? "desc",
        };
        const res = await enneoApi("/ticket/search", {
            method: "POST",
            body,
        });
        return text(res);
    },
};
