import { permissionsOf, requirePermission } from "../auth/permissions.js";
import type { ToolContract } from "../contracts/tool.js";
import { getKronosMe } from "../services/kronos-auth.js";
import { toolError } from "./tool-error.js";

type IdentityReader = typeof getKronosMe;

/**
 * Enforces the permission declared by a tool contract at invocation time.
 *
 * Contracts without requiredPermission remain intentionally public. Protected
 * tools fail closed: identity lookup or permission-check failures become
 * structured tool errors and the underlying handler is never called.
 * identityReader is injectable so the authorization boundary can be tested
 * without credentials or network access.
 */
export function withToolAuthorization<TArgs extends unknown[], TResult>(
  contract: ToolContract,
  handler: (...args: TArgs) => Promise<TResult>,
  identityReader: IdentityReader = getKronosMe,
): (...args: TArgs) => Promise<TResult | ReturnType<typeof toolError>> {
  return async (...args: TArgs): Promise<TResult | ReturnType<typeof toolError>> => {
    try {
      if (contract.requiredPermission) {
        const identity = await identityReader();
        requirePermission(permissionsOf(identity), contract.requiredPermission);
      }
      return await handler(...args);
    } catch (error) {
      return toolError(error);
    }
  };
}
