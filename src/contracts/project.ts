import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";

/**
 * Project contract (KAIROS).
 *
 * Projects group generated assets and jobs. This is the shape only: no project
 * storage, routes or tools exist in this repository yet.
 */

export const PROJECT_STATUSES = ["draft", "active", "archived", "deleted"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    status: projectStatusSchema.default("draft"),
    owner: idSchema.optional(),
    createdAt: timestampSchema.optional(),
    updatedAt: timestampSchema.optional(),
  })
  .passthrough();

export type Project = z.infer<typeof projectSchema>;

export function isProjectEditable(status: ProjectStatus): boolean {
  return status === "draft" || status === "active";
}
