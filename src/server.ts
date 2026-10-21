import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createIsolatedRegistry, toolRegistry as globalRegistry } from "./tools/registry.js";
import { registerKronosStatusTool } from "./tools/kronos-status.js";
import { registerKronosHealthTool } from "./tools/kronos-health.js";
import { registerKronosMeTool } from "./tools/kronos-me.js";
import { registerKronosContractsTool } from "./tools/kronos-contracts.js";
import { registerLocalTools } from "./tools/register-local-tools.js";
import { ToolRegistry } from "./contracts/tool.js";

export type KronosServerProfile = "full" | "public-local";

export interface CreateKronosServerOptions {
  /**
   * - `full` (predeterminado): núcleo conectado, contratos y las 180 locales.
   * - `public-local`: solo herramientas locales sin estado aptas para un
   *   endpoint anónimo; sin núcleo conectado ni introspección de contratos.
   */
  profile?: KronosServerProfile;
  /**
   * Registro aislado opcional para tests que necesitan inspeccionar
   * el inventario de este servidor sin contaminar el singleton global.
   */
  registry?: ToolRegistry;
}

// WeakMap to keep per-server isolated registry for introspection if needed
const serverRegistries = new WeakMap<McpServer, ToolRegistry>();
export function getServerRegistry(server: McpServer): ToolRegistry | undefined {
  return serverRegistries.get(server);
}

// No environment-file loading on import: offline tests must not load local secrets.
export function createKronosServer(options: CreateKronosServerOptions = {}) {
  const profile = options.profile ?? "full";
  // P0 isolation: each server gets its own registry to avoid cross-profile contamination.
  // If caller provides a registry (for testing), use it; otherwise create isolated one.
  let registry: ToolRegistry;
  if (options.registry) {
    registry = options.registry;
  } else if (profile === "public-local") {
    registry = new ToolRegistry(); // empty, no core for anonymous profile
  } else {
    registry = createIsolatedRegistry(); // full: core pre-registered
  }
  const server = new McpServer({ name: "kronos-mcp", version: "0.3.0" });
  serverRegistries.set(server, registry);

  if (profile === "public-local") {
    registerLocalTools(server, { profile, registry });
    return server;
  }

  registerKronosStatusTool(server);
  registerKronosHealthTool(server);
  registerKronosMeTool(server);
  // Las 180 herramientas locales del catálogo maestro (ver docs/HERRAMIENTAS_180.md).
  registerLocalTools(server, { registry });
  registerKronosContractsTool(server, registry);
  // Keep global registry in sync for backwards-compat imports (e.g., tools that list without server)
  // but do not let it bleed into next server: we duplicate registrations into global only for observability.
  // Global is not used for per-server contracts anymore; per-server is source of truth.
  for (const contract of registry.list()) {
    try { globalRegistry.register(contract); } catch { /* ignore conflicts */ }
  }
  return server;
}
