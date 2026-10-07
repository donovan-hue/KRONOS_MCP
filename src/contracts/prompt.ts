import { z } from "zod";
import { capabilitySchema } from "./common.js";

/**
 * MCP prompt contract.
 *
 * Prompts are workflow entry points (create a video, create a short, ...).
 * Declaring one describes intent; it does not implement the workflow.
 */

export const promptArgumentSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/, "argument name must be lowercase snake_case"),
  description: z.string().min(1),
  required: z.boolean(),
});

export type PromptArgument = z.infer<typeof promptArgumentSchema>;

export const promptContractSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/, "prompt name must be lowercase snake_case"),
  title: z.string().min(1).optional(),
  description: z.string().min(1),
  capability: capabilitySchema,
  arguments: z.array(promptArgumentSchema).default([]),
  requiredPermission: z.string().min(1).optional(),
});

export type PromptContract = z.infer<typeof promptContractSchema>;

/** Returns the names of arguments missing from a supplied set. */
export function missingPromptArguments(
  contract: PromptContract,
  supplied: Record<string, unknown> = {},
): string[] {
  return contract.arguments
    .filter((argument) => argument.required)
    .filter((argument) => {
      const value = supplied[argument.name];
      return value === undefined || value === null || value === "";
    })
    .map((argument) => argument.name);
}
