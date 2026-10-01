import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerKronosStatusTool } from "./tools/kronos-status.js";
import { registerKronosHealthTool } from "./tools/kronos-health.js";
import { registerKronosMeTool } from "./tools/kronos-me.js";

const server = new McpServer({
  name: "kronos-mcp",
  version: "0.1.0",
});

registerKronosStatusTool(server);
registerKronosHealthTool(server);
registerKronosMeTool(server);

const transport = new StdioServerTransport();

await server.connect(transport);
