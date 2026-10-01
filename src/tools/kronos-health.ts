import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getKronosHealth } from "../services/kronos-api.js";

export function registerKronosHealthTool(server: McpServer) {
  server.registerTool(
    "kronos_health",
    {
      description:
        "Consulta el estado actual de producción de KRONOS, incluyendo API, base de datos, realtime y build.",
      inputSchema: {},
    },
    async () => {
      try {
        const health = await getKronosHealth();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(health, null, 2),
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
                  : "Error desconocido al consultar la salud de KRONOS.",
            },
          ],
        };
      }
    }
  );
}
