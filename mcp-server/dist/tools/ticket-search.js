import { enneoApi } from "../api.js";
import { text } from "./index.js";
/**
 * Mind's order-by whitelist. Anything outside it is a 400, so the schema mirrors it exactly.
 * Some filter keys are deliberately missing here — `t.closedAt`, `t.spamStatus`,
 * `t.externalTicketId` and `t.modelRunAt` can be filtered on but not sorted by.
 */
const ORDER_BY_FIELDS = [
    "t.id",
    "t.channel",
    "t.channelId",
    "t.subchannelId",
    "t.direction",
    "t.status",
    "t.priority",
    "t.agentId",
    "t.customerId",
    "t.contractId",
    "t.partnerId",
    "t.isCustomerActive",
    "t.aiSupportLevel",
    "t.sentiment",
    "t.language",
    "t.languageCode",
    "t.from",
    "t.createdAt",
    "t.modifiedAt",
    "t.firstResponseDueBy",
    "t.dueBy",
    "t.lastMessageAt",
    "t.lastCustomerMessageAt",
    "i.aiAgentId",
    "tt.tagId",
    "relevance",
];
const FILTER_DOC = [
    'Filter objects, ANDed together, e.g. [{"key":"t.status","values":["open"],"comparator":"in"}].',
    "Set keys — `values` with `in` / `not in`, or a single `value` with `=`, `!=`, `>`, `<`, `>=`, `<=`: " +
        "`t.id`, `t.status` (open|pending|closed — that is the whole enum), " +
        "`t.channel` (email|phone|chat|letter|portal|system|walkIn; `all` means no filter), `t.channelId`, " +
        "`t.subchannelId`, `t.direction` (in|out|internal), `t.priority` (low|medium|high|urgent), " +
        "`t.agentId` (also `unassigned` and `team`; filtering on any other colleague needs the " +
        "filterTicketsOfColleagues permission), `t.customerId`, `t.contractId`, `t.partnerId`, " +
        "`t.isCustomerActive`, `t.aiSupportLevel` (unprocessed|human|bot|automated), " +
        "`t.spamStatus` (auto_spam|auto_programmatic|manual_spam|auto_clean|manual_clean), `t.sentiment`, " +
        '`t.language` ("English") / `t.languageCode` ("en"), `t.from`, `t.externalTicketId`, ' +
        "`t.modelRunAt`, `i.aiAgentId`, `tt.tagId`, `w.id`. The string `null` inside `values` matches SQL NULL.",
    "Date keys — `t.createdAt`, `t.modifiedAt`, `t.closedAt`, `t.dueBy`, `t.firstResponseDueBy`, " +
        "`t.lastMessageAt`, `t.lastCustomerMessageAt`: the six scalar comparators with `value`, or " +
        "`between` / `not between` with `from` + `to`. They reject `in` / `not in`. Values may be " +
        "`YYYY-MM-DD[ HH:MM:SS]`, `CURRENT_DATE`, `CURRENT_TIME`, `-7 DAY` or `-4 HOUR`.",
    'Full text — {"key":"q","value":"..."} over subject, summary, body and history; a numeric term also ' +
        "matches ticket, contract and customer ids. Tag sets — `tt_matchAll.tagId`, `tt_matchAny.tagId`, " +
        "`tt_matchExact.tagId`, `tt_allowed.tagId`, `tt_excluded.tagId`, each with `values`. There is no `like`.",
].join("\n\n");
export const ticketSearch = {
    name: "enneo_ticket_search",
    description: "Search tickets by filters. Answers with {tickets, total, offset, limit}. Rows are compact: tags and intents are there, body, attachments, template and workitem are not — use enneo_ticket_get for those.",
    inputSchema: {
        type: "object",
        properties: {
            filters: {
                type: "array",
                description: FILTER_DOC,
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
            limit: {
                type: "integer",
                description: "Rows to return. Mind caps it at 500 and would default to 100; this tool asks for 20 to keep a result readable.",
                default: 20,
                minimum: 1,
                maximum: 500,
            },
            offset: { type: "integer", default: 0, minimum: 0 },
            orderByField: {
                type: "string",
                description: "Sort field, same default as Mind. `relevance` only ranks when a `q` filter is present, and falls back to `t.id` otherwise.",
                enum: ORDER_BY_FIELDS,
                default: "t.id",
            },
            orderByDirection: { type: "string", enum: ["asc", "desc"], default: "desc" },
        },
    },
    handler: async (args) => {
        const body = {
            filters: args.filters ?? [],
            limit: args.limit ?? 20,
            offset: args.offset ?? 0,
            orderByField: args.orderByField ?? "t.id",
            orderByDirection: args.orderByDirection ?? "desc",
        };
        const res = await enneoApi("/ticket/search", {
            method: "POST",
            body,
        });
        return text(res);
    },
};
