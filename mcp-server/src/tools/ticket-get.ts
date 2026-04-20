import { enneoApi } from "../api.js";
import { text, type Tool } from "./index.js";

export const ticketGet: Tool = {
  name: "enneo_ticket_get",
  description:
    "Get full data for a single ticket by ID, including body, conversations, attachments, customer, and detected intents. Pass `refresh: true` to re-run AI processing (tags, agent detection, parameters) before returning.",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: { type: "integer", description: "Ticket ID" },
      refresh: {
        type: "boolean",
        description: "If true, re-run the AI processing pipeline before returning.",
        default: false,
      },
      erpCacheOnly: {
        type: "boolean",
        description: "If true, skip external ERP calls (faster for bulk fetches).",
        default: false,
      },
    },
    required: ["ticketId"],
  },
  handler: async (args) => {
    const ticketId = Number(args.ticketId);
    const query: Record<string, string | undefined> = {};
    if (args.refresh) query.refresh = "true";
    if (args.erpCacheOnly) query.erpCacheOnly = "true";
    const ticket = await enneoApi<Record<string, unknown>>(`/ticket/${ticketId}`, { query });
    return text(ticket);
  },
};
