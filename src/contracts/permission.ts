import { z } from "zod";
import { capabilitySchema } from "./common.js";

/**
 * Permission vocabulary.
 *
 * Permissions are opaque strings owned by the backend (`/api/mcp/me` returns the
 * granted set). This module only defines the shape and the rules for comparing
 * them; it never invents which permissions a deployment actually grants.
 *
 * Wildcard rule: a granted permission ending in `:*` grants every permission
 * under that namespace prefix. `*` grants everything.
 */

export const permissionSchema = z
  .string()
  .regex(/^(\*|[a-z0-9._-]+(:[a-z0-9._-]+)*(:*)?)$/, "malformed permission");

export const permissionSetSchema = z.array(z.string());
export type PermissionSet = z.infer<typeof permissionSetSchema>;

export const permissionContractSchema = z.object({
  permission: z.string().min(1),
  capability: capabilitySchema,
  description: z.string().min(1),
  /** Whether holding this permission can change state upstream. */
  write: z.boolean(),
});

export type PermissionContract = z.infer<typeof permissionContractSchema>;

export function isWildcard(granted: string): boolean {
  return granted === "*" || granted.endsWith(":*");
}

/** True when a single granted permission covers the required one. */
export function grantsPermission(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  if (!granted.endsWith(":*")) return false;
  return required.startsWith(granted.slice(0, -1));
}

/** True when any granted permission covers the required one. */
export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  return granted.some((candidate) => grantsPermission(candidate, required));
}

/** Subset of `required` not covered by `granted`. Order is preserved. */
export function missingPermissions(
  granted: readonly string[],
  required: readonly string[],
): string[] {
  return required.filter((permission) => !hasPermission(granted, permission));
}
