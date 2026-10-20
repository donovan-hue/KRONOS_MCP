import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for a single configured bearer token. */
export function hasValidBearerToken(
  authorization: string | string[] | undefined,
  configuredToken: string | undefined,
): boolean {
  if (!authorization || !configuredToken) return false;
  const authStr = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!authStr || typeof authStr !== "string") return false;
  const normalized = authStr.trim();
  const expected = Buffer.from(`Bearer ${configuredToken}`);
  const provided = Buffer.from(normalized);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
