/**
 * Registra las 180 herramientas locales del catálogo maestro.
 *
 * Todas comparten el mismo sobre de salida (`ok`, `summary`, `data`,
 * `warnings`, `limitations`) y declaran honestamente su modo
 * (`local_deterministic`): no contactan KRONOS, ni la red, ni proveedores.
 *
 * No exigen permiso de `/api/mcp/me` —igual que `kronos_contracts`— porque
 * no tocan ningún recurso del backend. En HTTP, el perfil `authenticated`
 * las protege con el bearer token del transporte; el perfil `public-local`
 * registra únicamente el subconjunto sin estado apto para acceso anónimo.
 * En stdio son tan locales como el proceso.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry } from "../catalog/index.js";
import { localTool, toolAnnotations } from "../contracts/tool.js";
import { ALL_LOCAL_TOOLS } from "../families/index.js";
import { registeredLocalTools } from "../state/stores.js";
import { toolRegistry as globalRegistry } from "./registry.js";
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

export type LocalToolsRegistrationProfile = "full" | "public-local";

/**
 * Herramientas excluidas del perfil público anónimo además de las 15 con
 * estado compartido:
 *
 * - 42 ejecuta ejemplos de otras herramientas dentro del proceso, por lo que
 *   amplifica el trabajo de una sola llamada pública.
 * - 153 lee el secreto de una variable de entorno cuyo nombre aporta el
 *   llamante; aunque no devuelve el secreto, no debe actuar como oráculo HMAC
 *   en un endpoint anónimo.
 */
export const PUBLIC_LOCAL_EXCLUDED_TOOL_NUMBERS: ReadonlySet<number> = new Set([42, 153]);

export function isPublicLocalTool(definition: { number: number; stateful?: boolean }): boolean {
  return definition.stateful !== true && !PUBLIC_LOCAL_EXCLUDED_TOOL_NUMBERS.has(definition.number);
}

export function localToolsForProfile(profile: LocalToolsRegistrationProfile = "full") {
  return profile === "public-local" ? ALL_LOCAL_TOOLS.filter(isPublicLocalTool) : ALL_LOCAL_TOOLS;
}

export function registerLocalTools(
  server: McpServer,
  options: { profile?: LocalToolsRegistrationProfile; registry?: import("../contracts/tool.js").ToolRegistry } = {},
): void {
  const profile = options.profile ?? "full";
  const toolRegistry = options.registry ?? globalRegistry;

  // Los esquemas son dinámicos (uno por herramienta), por lo que el registro
  // se hace tras un estrecho cast de frontera. La validación real la hace el
  // SDK con el esquema Zod de cada herramienta y `definition.run` revalida.
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: unknown) => Promise<unknown>,
  ) => void;

  // El transporte HTTP sin estado crea un servidor por petición. Reconstruir
  // este índice en cada registro mantiene el benchmark y los enrutadores
  // alineados con el perfil desplegado en el proceso.
  registeredLocalTools.clear();

  for (const definition of localToolsForProfile(profile)) {
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
