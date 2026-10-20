import { ToolRegistry } from "../contracts/tool.js";
import { kronosHealthContract } from "./kronos-health.js";
import { kronosMeContract } from "./kronos-me.js";
import { kronosStatusContract } from "./kronos-status.js";

/**
 * The single source of truth for tools this server actually registers.
 *
 * `kronos_contracts` is not imported here on purpose: it registers itself when
 * `registerKronosContractsTool` runs, which keeps this module free of an import
 * cycle while still leaving the introspection tool self-describing.
 *
 * Legacy global singleton is retained for backwards-compatibility with direct
 * imports, but `createKronosServer` now creates an isolated registry per
 * instance to avoid cross-profile contamination (P0 isolation).
 */
export const toolRegistry = new ToolRegistry();

toolRegistry.register(kronosStatusContract);
toolRegistry.register(kronosHealthContract);
toolRegistry.register(kronosMeContract);

/**
 * Factory for an isolated registry per server instance.
 * Registers core contracts (status/health/me) so each server has its own copy.
 */
export function createIsolatedRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(kronosStatusContract);
  registry.register(kronosHealthContract);
  registry.register(kronosMeContract);
  return registry;
}
