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
 */
export const toolRegistry = new ToolRegistry();

toolRegistry.register(kronosStatusContract);
toolRegistry.register(kronosHealthContract);
toolRegistry.register(kronosMeContract);
