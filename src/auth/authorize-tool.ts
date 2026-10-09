import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContract } from "../contracts/tool.js";
import type { PermissionSet } from "../contracts/permission.js";
import { permissionsOf, requirePermission } from "./permissions.js";
import { getKronosMe } from "../services/kronos-auth.js";
import { toolError } from "../tools/tool-error.js";

type IdentityReader = () => Promise<{ permissions?: PermissionSet }>;

/**
 * Adds fail-closed authorization to a registered tool when its contract declares
 * requiredPermission. Contracts without that field remain unauthenticated.
 *
 * The identity reader is injectable so permission behavior can be tested offline.
 * A failure to load/validate the identity is returned as a structured tool error;
 * the protected handler is never invoked in that case.
 */
export function withToolAuthorization<TArgs extends unknown[]>(
  contract: Pick<ToolContract, "requiredPermission">,
  handler: (...args: TArgs) => Promise<CallToolResult>,
  readIdentity: IdentityReader = getKronosMe,
): (...args: TArgs) => Promise<CallToolResult> {
  return async (...args: TArgs): Promise<CallToolResult> => {
    try {
      if (contract.requiredPermission) {
        const identity = await readIdentity();
        requirePermission(permissionsOf(identity), contract.requiredPermission);
      }
      return await handler(...args);
    } catch (error) {
      return toolError(error);
    }
  };
}
