import test from "node:test";
import assert from "node:assert/strict";
import {
  grantsPermission,
  hasPermission,
  isWildcard,
  missingPermissions,
  permissionSchema,
} from "../src/contracts/permission.js";
import {
  permissionsOf,
  requireAllPermissions,
  requirePermission,
} from "../src/auth/permissions.js";
import { KronosApiError } from "../src/services/kronos-api.js";

test("permission strings accept namespaces and reject junk", () => {
  assert.equal(permissionSchema.parse("kronos:read"), "kronos:read");
  assert.equal(permissionSchema.parse("kronos:image:generate"), "kronos:image:generate");
  assert.equal(permissionSchema.parse("*"), "*");
  assert.throws(() => permissionSchema.parse(""));
  assert.throws(() => permissionSchema.parse("Bad Case"));
});

test("exact permissions match only themselves", () => {
  assert.equal(grantsPermission("kronos:read", "kronos:read"), true);
  assert.equal(grantsPermission("kronos:read", "kronos:write"), false);
  assert.equal(grantsPermission("kronos:read", "kronos"), false);
});

test("wildcards grant their namespace, and only their namespace", () => {
  assert.equal(isWildcard("*"), true);
  assert.equal(isWildcard("kronos:*"), true);
  assert.equal(isWildcard("kronos:read"), false);

  assert.equal(grantsPermission("*", "anything:at:all"), true);
  assert.equal(grantsPermission("kronos:*", "kronos:read"), true);
  assert.equal(grantsPermission("kronos:*", "kronos:image:generate"), true);
  assert.equal(grantsPermission("kronos:*", "kairos:read"), false);
  assert.equal(grantsPermission("video:*", "video"), false);
});

test("a granted set covers a requirement when any entry matches", () => {
  assert.equal(hasPermission(["kronos:read"], "kronos:read"), true);
  assert.equal(hasPermission(["kairos:*"], "kairos:project:read"), true);
  assert.equal(hasPermission(["kronos:read", "kronos:write"], "kronos:write"), true);
  assert.equal(hasPermission([], "kronos:read"), false);
  assert.equal(hasPermission(["kronos:read"], "kronos:write"), false);
});

test("missingPermissions preserves order and reports only gaps", () => {
  assert.deepEqual(
    missingPermissions(["kronos:read"], ["kronos:read", "kronos:write"]),
    ["kronos:write"],
  );
  assert.deepEqual(missingPermissions(["*"], ["a", "b", "c"]), []);
  assert.deepEqual(missingPermissions([], ["a", "b"]), ["a", "b"]);
});

test("requirePermission throws FORBIDDEN 403 only on a real gap", () => {
  requirePermission(["kronos:read"], "kronos:read");
  requirePermission(["*"], "kronos:write");

  assert.throws(
    () => requirePermission(["kronos:read"], "kronos:write"),
    KronosApiError,
  );

  // Captured explicitly: assert.throws does not hand back the error instance.
  let caught: unknown;
  try {
    requirePermission(["kronos:read"], "kronos:write");
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof KronosApiError);
  assert.equal(caught.code, "FORBIDDEN");
  assert.equal(caught.httpStatus, 403);
});

test("requireAllPermissions is atomic: one gap fails the whole check", () => {
  requireAllPermissions(["kronos:*"], ["kronos:read", "kronos:write"]);
  requireAllPermissions([], []);

  assert.throws(() =>
    requireAllPermissions(["kronos:read"], ["kronos:read", "kronos:write"]),
  );
});

test("permissionsOf tolerates identities without a permissions field", () => {
  assert.deepEqual(permissionsOf({ permissions: ["kronos:read"] }), ["kronos:read"]);
  assert.deepEqual(permissionsOf({}), []);
});
