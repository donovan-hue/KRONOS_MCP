import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKronosMe } from "../services/kronos-auth.js";
import { toolError } from "./tool-error.js";

const identityOutput = z.object({ ok: z.boolean(), service: z.string(), identity: z.string(), permissions: z.array(z.string()) }).passthrough();

export function registerKronosMeTool(server: McpServer) {
  server.registerTool("kronos_me", {
    description: "Consulta /api/mcp/me con la credencial de servicio KRONOS_MCP_TOKEN. No devuelve ni registra el token.",
    inputSchema: z.object({}).strict(), outputSchema: identityOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async () => {
    try {
      const data = await getKronosMe();
      return { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (error) { return toolError(error); }
  });
}
