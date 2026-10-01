import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getKronosHealth } from "../services/kronos-api.js";

export function registerKronosStatusTool(server: McpServer) {
  server.registerTool(
    "kronos_status",
    {
      description:
        "Consulta el estado real de producción de KRONOS: API, base de datos, realtime y build.",
      inputSchema: {},
    },
    async () => {
      try {
        const health = await getKronosHealth();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ok: health.ok,
                  service: health.service,
                  database: health.database,
                  realtime: health.realtime,
                  environment: health.environment,
                  build: health.build,
                  timestamp: health.timestamp,
                },
                null,
                2
              ),
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
                  : "Error desconocido al consultar KRONOS.",
            },
          ],
        };
      }
    }
  );
}
