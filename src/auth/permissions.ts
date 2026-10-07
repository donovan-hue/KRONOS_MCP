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
 * ENFORCEMENT STATUS: the helpers are implemented and tested, but they are not
 * yet wired into the registered tools. The exact permission strings a
 * deployment grants are not known from this repository, so enabling enforcement
 * now could lock out a working identity. Wire it once a real `/api/mcp/me`
 * response has been inspected.
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
