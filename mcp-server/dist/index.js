#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { tools, handleTool } from "./tools/index.js";
const server = new Server({
    name: "@enneo/mcp-server",
    version: "0.1.0",
}, {
    capabilities: { tools: {} },
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
    })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        return await handleTool(name, args ?? {});
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stderr is fine for logs; stdout is the MCP channel
    console.error("[enneo-mcp] server ready");
}
main().catch((err) => {
    console.error("[enneo-mcp] fatal:", err);
    process.exit(1);
});
