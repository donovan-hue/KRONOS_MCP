import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { capabilitySchema, readOnlyTool, toolAnnotations } from "../contracts/index.js";
import { toolRegistry } from "./registry.js";

/**
 * Introspection tool.
 *
 * Reports the contracts this server has actually declared and registered. It is
 * deliberately offline: it never contacts KRONOS and never needs a credential,
 * so it stays usable when the upstream is down or unauthenticated.
 *
 * `resources` and `prompts` are reported as empty because none are served yet.
 * Declaring a URI or a prompt here without a backing capability would be
 * inventing functionality, so they appear only once they genuinely exist.
 */

export const kronosContractsContract = readOnlyTool({
  name: "kronos_contracts",
  description:
    "Describe las herramientas, capacidades y contratos declarados por este servidor MCP. No contacta KRONOS y no requiere credencial.",
  capability: "diagnostics",
});

const toolSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  capability: capabilitySchema,
  requiredPermission: z.string().optional(),
  readOnly: z.boolean(),
  destructive: z.boolean(),
});

const contractsOutput = z.object({
  service: z.string(),
  capabilities: z.array(capabilitySchema),
  tools: z.array(toolSummarySchema),
  resources: z.array(z.string()),
  prompts: z.array(z.string()),
});

export function registerKronosContractsTool(server: McpServer): void {
  // Self-registration happens here, not in registry.ts, to avoid an import cycle.
  toolRegistry.register(kronosContractsContract);

  server.registerTool(
    kronosContractsContract.name,
    {
      description: kronosContractsContract.description,
      inputSchema: z.object({}).strict(),
      outputSchema: contractsOutput,
      annotations: toolAnnotations(kronosContractsContract),
    },
    async () => {
      const tools = toolRegistry.list().map((contract) => ({
        name: contract.name,
        description: contract.description,
        capability: contract.capability,
        ...(contract.requiredPermission
          ? { requiredPermission: contract.requiredPermission }
          : {}),
        readOnly: contract.readOnly,
        destructive: contract.destructive,
      }));

      const payload = {
        service: "kronos-mcp",
        capabilities: [...new Set(tools.map((tool) => tool.capability))],
        tools,
        resources: [] as string[],
        prompts: [] as string[],
      };

      return {
        structuredContent: payload,
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
