import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKronosStatusTool } from "./tools/kronos-status.js";
import { registerKronosHealthTool } from "./tools/kronos-health.js";
import { registerKronosMeTool } from "./tools/kronos-me.js";
import { registerKronosContractsTool } from "./tools/kronos-contracts.js";

// No environment-file loading on import: offline tests must not load local secrets.
export function createKronosServer() {
  const server = new McpServer({ name: "kronos-mcp", version: "0.2.0" });
  registerKronosStatusTool(server);
  registerKronosHealthTool(server);
  registerKronosMeTool(server);
  registerKronosContractsTool(server);
  return server;
}
