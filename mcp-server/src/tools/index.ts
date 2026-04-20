import { configure } from "./configure.js";
import { profileMe } from "./profile.js";
import { ticketGet } from "./ticket-get.js";
import { ticketSearch } from "./ticket-search.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

export const tools: Tool[] = [configure, profileMe, ticketGet, ticketSearch];

const toolMap = new Map(tools.map((t) => [t.name, t]));

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ReturnType<Tool["handler"]>> {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args);
}

export function text(value: unknown): ReturnType<Tool["handler"]> extends Promise<infer R> ? R : never {
  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: str }] } as any;
}
