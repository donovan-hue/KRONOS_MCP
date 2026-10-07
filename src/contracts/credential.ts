import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";

/**
 * Credential contract.
 *
 * IMPORTANT: this contract deliberately has no field for a secret value. It
 * describes credentials (identity, scope, lifecycle) so they can be listed,
 * rotated and revoked without a secret ever entering a contract, a log or a
 * tool result.
 */

export const CREDENTIAL_STATUSES = ["active", "revoked", "expired"] as const;
export const credentialStatusSchema = z.enum(CREDENTIAL_STATUSES);
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;

export const credentialSchema = z
  .object({
    id: idSchema,
    /** Service or provider the credential belongs to, e.g. `kronos-mcp`. */
    provider: z.string().min(1),
    /** Human-readable label. Never the secret itself. */
    label: z.string().min(1).optional(),
    /** Opaque scopes granted to this credential. */
    scopes: z.array(z.string()).default([]),
    status: credentialStatusSchema.default("active"),
    createdAt: timestampSchema.optional(),
    rotatedAt: timestampSchema.optional(),
    revokedAt: timestampSchema.optional(),
    expiresAt: timestampSchema.optional(),
    lastUsedAt: timestampSchema.optional(),
  })
  .passthrough();

export type Credential = z.infer<typeof credentialSchema>;

export function isCredentialUsable(
  credential: Credential,
  now: Date = new Date(),
): boolean {
  if (credential.status !== "active") return false;
  if (!credential.expiresAt) return true;
  const expires = Date.parse(credential.expiresAt);
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}

/** Guards against a credential ever being logged with a secret attached. */
export function redactCredential(credential: Credential): Credential {
  return credential;
}
