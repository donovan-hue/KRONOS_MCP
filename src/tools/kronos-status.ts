import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readOnlyTool, toolAnnotations } from "../contracts/tool.js";
import { getKronosHealth } from "../services/kronos-api.js";
import { toolError } from "./tool-error.js";
import { withToolAuthorization } from "./with-tool-authorization.js";

export const kronosStatusContract = readOnlyTool({
  name: "kronos_status",
  description: "Consulta el estado real de KRONOS mediante /api/health (endpoint de salud público; no valida la credencial MCP).",
  capability: "diagnostics",
});

const healthOutput = z.object({
  ok: z.boolean(), service: z.string(), database: z.string(), realtime: z.boolean(),
  environment: z.string().nullable().optional(),
  build: z.object({
    commit: z.string().nullable().optional(), commitShort: z.string().nullable().optional(),
    branch: z.string().nullable().optional(), repo: z.string().nullable().optional(),
    serviceName: z.string().nullable().optional(), startedAt: z.string().nullable().optional(),
    traceable: z.boolean().optional(),
  }).passthrough().optional(), timestamp: z.string(),
}).passthrough();

export function registerKronosStatusTool(server: McpServer) {
  server.registerTool("kronos_status", {
    description: "Consulta el estado real de KRONOS mediante /api/health (endpoint de salud público; no valida la credencial MCP).",
    inputSchema: z.object({}).strict(),
    outputSchema: healthOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, withToolAuthorization(kronosStatusContract, async () => {
    try {
      const health = await getKronosHealth();
      const output = {
        ok: health.ok, service: health.service, database: health.database,
        realtime: health.realtime, environment: health.environment,
        build: health.build, timestamp: health.timestamp,
      };
      return { structuredContent: output, content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
    } catch (error) { return toolError(error); }
  }));
}
