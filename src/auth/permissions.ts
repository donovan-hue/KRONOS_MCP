import { KronosApiError } from "../services/kronos-api.js";
import {
  hasPermission,
  missingPermissions,
  type PermissionSet,
} from "../contracts/permission.js";

/**
 * Runtime permission checks.
 *
 * The granted set comes from the backend: `/api/mcp/me` returns `permissions`
 * for the service identity. This module compares that set against what a tool,
 * resource or prompt declares. It never invents permissions.
 *
 * Enforcement is applied by `withToolAuthorization` to any registered tool
 * whose contract declares `requiredPermission`. No permission names are
 * invented here: each protected contract must use a backend-owned permission.
 */

/** Reads the granted set from an identity payload, tolerating its absence. */
export function permissionsOf(identity: {
  permissions?: PermissionSet;
}): readonly string[] {
  return identity?.permissions ?? [];
}

/** Throws `FORBIDDEN` (403) when a single required permission is missing. */
export function requirePermission(
  granted: readonly string[],
  required: string,
): void {
  if (!hasPermission(granted, required)) {
    throw new KronosApiError("FORBIDDEN", 403);
  }
}

/** Throws `FORBIDDEN` (403) when any required permission is missing. */
export function requireAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): void {
  if (missingPermissions(granted, required).length > 0) {
    throw new KronosApiError("FORBIDDEN", 403);
  }
}
