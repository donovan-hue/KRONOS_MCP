import { z } from "zod";
import {
  capabilitySchema,
  idSchema,
  isTerminalJobStatus,
  jobStatusSchema,
  timestampSchema,
  type JobStatus,
} from "./common.js";

/**
 * Asset and Job contracts.
 *
 * Work that outlives a single request (video renders, upscales, exports) needs a
 * stable shape so progress, results and failures are all reported the same way.
 * Nothing here performs I/O or assumes a queue exists yet.
 */

export const ASSET_KINDS = [
  "image",
  "video",
  "audio",
  "music",
  "voice",
  "subtitles",
  "script",
  "storyboard",
  "document",
  "other",
] as const;

export const assetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetSchema = z
  .object({
    id: idSchema,
    kind: assetKindSchema,
    url: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    owner: idSchema.optional(),
    createdAt: timestampSchema.optional(),
  })
  .passthrough();

export type Asset = z.infer<typeof assetSchema>;

export const jobSchema = z
  .object({
    id: idSchema,
    capability: capabilitySchema,
    status: jobStatusSchema,
    /** 0-100. Advisory: providers that cannot report progress stay at 0. */
    progress: z.number().min(0).max(100).default(0),
    /** Upstream identifier, when the work is delegated to an external provider. */
    providerJobId: z.string().min(1).optional(),
    result: assetSchema.optional(),
    error: z.string().min(1).optional(),
    owner: idSchema.optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
  })
  .passthrough();

export type Job = z.infer<typeof jobSchema>;

export function isTerminalJob(job: Pick<Job, "status">): boolean {
  return isTerminalJobStatus(job.status);
}

/** Clamps progress into range. Providers occasionally emit 0-1 fractions or >100. */
export function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/** A cancelled or failed job must carry a reason; completed jobs must not. */
export function validateJobStatusInvariants(job: Job): string[] {
  const problems: string[] = [];
  if (job.status === "failed" && !job.error) {
    problems.push("failed job must declare an error");
  }
  if (job.status === "completed" && job.error) {
    problems.push("completed job must not declare an error");
  }
  if (job.status === "completed" && !job.result) {
    problems.push("completed job must declare a result asset");
  }
  return problems;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "En cola",
  pending: "Pendiente",
  processing: "Procesando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};
