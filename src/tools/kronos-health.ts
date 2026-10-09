import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readOnlyTool, toolAnnotations } from "../contracts/tool.js";
import { getKronosHealth } from "../services/kronos-api.js";
import { toolError } from "./tool-error.js";
import { withToolAuthorization } from "./with-tool-authorization.js";

export const kronosHealthContract = readOnlyTool({
  name: "kronos_health",
  description: "Devuelve el diagnóstico de /api/health. La herramienta MCP requiere el permiso health, aunque el endpoint upstream sea público. Si KRONOS devuelve HTTP no exitoso, informa un error estructurado.",
  capability: "diagnostics",
  requiredPermission: "health",
});

const nullableString = z.string().nullable().optional();
const healthOutput = z.object({
  ok: z.boolean(), service: z.string(), database: z.string(), realtime: z.boolean(), timestamp: z.string(),
  build: z.object({ commit: nullableString, commitShort: nullableString, branch: nullableString,
    repo: nullableString, serviceName: nullableString, startedAt: nullableString,
    traceable: z.boolean().optional() }).passthrough().optional(),
  environment: nullableString, environmentDeclared: z.boolean().optional(), autoIndex: z.boolean().optional(),
}).passthrough();

export function registerKronosHealthTool(server: McpServer) {
  server.registerTool("kronos_health", {
    description: "Devuelve el diagnóstico del endpoint público /api/health. Si KRONOS devuelve HTTP no exitoso, la herramienta informa un error estructurado.",
    inputSchema: z.object({}).strict(), outputSchema: healthOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, withToolAuthorization(kronosHealthContract, async () => {
    try {
      const health = await getKronosHealth();
      return { structuredContent: health, content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
    } catch (error) { return toolError(error); }
  }));
}
