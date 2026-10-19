/**
 * Registra las 180 herramientas locales del catálogo maestro.
 *
 * Todas comparten el mismo sobre de salida (`ok`, `summary`, `data`,
 * `warnings`, `limitations`) y declaran honestamente su modo
 * (`local_deterministic`): no contactan KRONOS, ni la red, ni proveedores.
 *
 * No exigen permiso de `/api/mcp/me` —igual que `kronos_contracts`— porque
 * no tocan ningún recurso del backend. En el transporte HTTP quedan tras el
 * bearer token del propio MCP; en stdio son tan locales como el proceso.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry } from "../catalog/index.js";
import { localTool, toolAnnotations } from "../contracts/tool.js";
import { ALL_LOCAL_TOOLS } from "../families/index.js";
import { registeredLocalTools } from "../state/stores.js";
import { toolRegistry } from "./registry.js";
import { toolError } from "./tool-error.js";

const envelopeSchema = z.object({
  ok: z.boolean(),
  tool: z.string(),
  number: z.number().int(),
  nickname: z.string(),
  technicalName: z.string(),
  family: z.string(),
  familyId: z.string(),
  mode: z.string(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
}).passthrough();

export function registerLocalTools(server: McpServer): void {
  // Los esquemas son dinámicos (uno por herramienta), por lo que el registro
  // se hace tras un estrecho cast de frontera. La validación real la hace el
  // SDK con el esquema Zod de cada herramienta y `definition.run` revalida.
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: unknown) => Promise<unknown>,
  ) => void;

  for (const definition of ALL_LOCAL_TOOLS) {
    const entrada = catalogEntry(definition.number);
    const description =
      `${entrada.nickname} — ${entrada.technicalName} (familia ${entrada.familyId}: ${entrada.familyName}). ` +
      `${entrada.description} Herramienta local y determinista: trabaja solo con los datos de la llamada, sin proveedores externos ni red.` +
      (definition.limitation ? ` Limitación: ${definition.limitation}` : "");

    const contract = localTool({
      name: entrada.name,
      description,
      capability: entrada.capability,
      stateful: definition.stateful === true,
    });
    toolRegistry.register(contract);
    registeredLocalTools.set(entrada.name, definition);

    register(
      entrada.name,
      {
        title: `${entrada.nickname} — ${entrada.technicalName}`,
        description,
        inputSchema: definition.inputSchema,
        outputSchema: envelopeSchema,
        annotations: {
          ...toolAnnotations(contract),
          idempotentHint: definition.stateful !== true,
        },
      },
      async (args: unknown) => {
        try {
          const result = await definition.run(args);
          const envelope = {
            ok: true,
            tool: entrada.name,
            number: entrada.number,
            nickname: entrada.nickname,
            technicalName: entrada.technicalName,
            family: entrada.familyName,
            familyId: entrada.familyId,
            mode: "local_deterministic",
            summary: result.summary,
            data: result.data,
            warnings: result.warnings ?? [],
            limitations: definition.limitation ? [definition.limitation] : [],
          };
          return {
            structuredContent: envelope,
            content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
          };
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }
}
