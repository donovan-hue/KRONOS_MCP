import assert from "node:assert/strict";
import test from "node:test";
import { hasValidBearerToken } from "../src/http-auth.js";

const token = "0123456789abcdef0123456789abcdef";

test("accepts the exact configured bearer token", () => {
  assert.equal(hasValidBearerToken(`Bearer ${token}`, token), true);
});

test("rejects missing, malformed, or incorrect authorization", () => {
  assert.equal(hasValidBearerToken(undefined, token), false);
  assert.equal(hasValidBearerToken("Basic abc", token), false);
  assert.equal(hasValidBearerToken(`Bearer ${token}x`, token), false);
  assert.equal(hasValidBearerToken(`Bearer ${"f".repeat(32)}`, token), false);
  assert.equal(hasValidBearerToken(`Bearer ${token}`, undefined), false);
});
