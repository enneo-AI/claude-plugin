import { configure } from "./configure.js";
import { profileMe } from "./profile.js";
import { ticketGet } from "./ticket-get.js";
import { ticketSearch } from "./ticket-search.js";
export const tools = [configure, profileMe, ticketGet, ticketSearch];
const toolMap = new Map(tools.map((t) => [t.name, t]));
export async function handleTool(name, args) {
    const tool = toolMap.get(name);
    if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(args);
}
export function text(value) {
    const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return { content: [{ type: "text", text: str }] };
}
