import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKronosStatusTool } from "./tools/kronos-status.js";
import { registerKronosHealthTool } from "./tools/kronos-health.js";
import { registerKronosMeTool } from "./tools/kronos-me.js";
import { registerKronosContractsTool } from "./tools/kronos-contracts.js";
import { registerLocalTools } from "./tools/register-local-tools.js";

export type KronosServerProfile = "full" | "public-local";

export interface CreateKronosServerOptions {
  /**
   * - `full` (predeterminado): núcleo conectado, contratos y las 180 locales.
   * - `public-local`: solo herramientas locales sin estado aptas para un
   *   endpoint anónimo; sin núcleo conectado ni introspección de contratos.
   */
  profile?: KronosServerProfile;
}

// No environment-file loading on import: offline tests must not load local secrets.
export function createKronosServer(options: CreateKronosServerOptions = {}) {
  const profile = options.profile ?? "full";
  const server = new McpServer({ name: "kronos-mcp", version: "0.3.0" });

  if (profile === "public-local") {
    registerLocalTools(server, { profile });
    return server;
  }

  registerKronosStatusTool(server);
  registerKronosHealthTool(server);
  registerKronosMeTool(server);
  // Las 180 herramientas locales del catálogo maestro (ver docs/HERRAMIENTAS_180.md).
  registerLocalTools(server);
  registerKronosContractsTool(server);
  return server;
}
