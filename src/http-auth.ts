import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for a single configured bearer token. */
export function hasValidBearerToken(
  authorization: string | undefined,
  configuredToken: string | undefined,
): boolean {
  if (!authorization || !configuredToken) return false;
  const expected = Buffer.from(`Bearer ${configuredToken}`);
  const provided = Buffer.from(authorization);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
