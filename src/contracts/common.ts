import { z } from "zod";

/**
 * Shared primitives for every contract in `src/contracts`.
 *
 * These are vocabulary and wire-shape definitions only. Nothing here performs
 * I/O, reaches a provider, or assumes a backend route that does not exist.
 */

/** Non-empty identifier. Permissive on purpose: ObjectIds, ULIDs and slugs all flow through. */
export const idSchema = z.string().min(1);

/** Timestamp exactly as emitted upstream. Not parsed, so formats are never rewritten here. */
export const timestampSchema = z.string().min(1);

/**
 * Product capability vocabulary. A naming convention, not a routing table:
 * declaring a capability here does not mean the capability is implemented.
 */
export const CAPABILITIES = [
  "diagnostics",
  "text",
  "script",
  "image",
  "video",
  "audio",
  "voice",
  "music",
  "speech",
  "subtitles",
  "storyboard",
  "project",
  "library",
  "publishing",
] as const;

export const capabilitySchema = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof capabilitySchema>;

/** Job lifecycle. `completed`, `failed` and `cancelled` are terminal. */
export const JOB_STATUSES = [
  "queued",
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled"] as const;

export function isTerminalJobStatus(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/**
 * Structured error envelope. Kept identical to `src/tools/tool-error.ts` so the
 * contract and the wire format cannot drift apart.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    httpStatus: z.number().int().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Fields every owned record is expected to carry, when the backend provides them. */
export const ownershipSchema = z
  .object({
    owner: idSchema.optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
  })
  .passthrough();

export type Ownership = z.infer<typeof ownershipSchema>;
