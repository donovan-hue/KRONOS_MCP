import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getKronosMe } from "../services/kronos-auth.js";

export function registerKronosMeTool(server: McpServer) {
  server.registerTool(
    "kronos_me",
    {
      description:
        "Consulta la identidad y permisos de la credencial MCP autenticada en KRONOS.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await getKronosMe();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : "Error desconocido al consultar la identidad MCP.",
            },
          ],
        };
      }
    }
  );
}
