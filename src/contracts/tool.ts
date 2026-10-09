import { z } from "zod";
import { capabilitySchema, type Capability } from "./common.js";

/**
 * Declarative description of an MCP tool.
 *
 * A contract states what a tool is and what it needs. It is not the tool itself,
 * so registering a contract never implies the behaviour exists.
 */
export const toolContractSchema = z.object({
  /** Lowercase snake_case. Matches the wire name clients call. */
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/, "tool name must be lowercase snake_case"),
  description: z.string().min(1),
  capability: capabilitySchema,
  /** Permission string required to invoke the tool. Omitted means unauthenticated. */
  requiredPermission: z.string().min(1).optional(),
  readOnly: z.boolean(),
  destructive: z.boolean(),
  openWorld: z.boolean(),
});

export type ToolContract = z.infer<typeof toolContractSchema>;

/** MCP annotations derived from the contract, so they can never be forgotten. */
export function toolAnnotations(contract: ToolContract): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
} {
  return {
    readOnlyHint: contract.readOnly,
    destructiveHint: contract.destructive,
    openWorldHint: contract.openWorld,
  };
}

/** A read-only, non-destructive tool that talks to an external system. */
export function readOnlyTool(
  contract: Omit<ToolContract, "readOnly" | "destructive" | "openWorld">,
): ToolContract {
  return { ...contract, readOnly: true, destructive: false, openWorld: true };
}

/**
 * In-memory registry of declared tool contracts.
 *
 * Registration is idempotent by name and rejects duplicates with a different
 * shape, so two modules cannot silently claim the same tool name.
 */
export class ToolRegistry {
  readonly #contracts = new Map<string, ToolContract>();

  register(contract: ToolContract): ToolContract {
    const existing = this.#contracts.get(contract.name);
    if (existing && JSON.stringify(existing) !== JSON.stringify(contract)) {
      throw new Error(`TOOL_CONTRACT_CONFLICT: ${contract.name}`);
    }
    this.#contracts.set(contract.name, contract);
    return contract;
  }

  get(name: string): ToolContract | undefined {
    return this.#contracts.get(name);
  }

  list(): ToolContract[] {
    return [...this.#contracts.values()];
  }

  byCapability(capability: Capability): ToolContract[] {
    return this.list().filter((c) => c.capability === capability);
  }
}
