import { z } from "zod";
import { capabilitySchema } from "./common.js";

/**
 * Agent skill contract.
 *
 * A skill is a named unit of agent competence. Declaring one records the intent
 * and the capabilities it draws on; it does not implement the skill.
 */

export const AGENT_SKILLS = [
  "image-production",
  "video-production",
  "audio-production",
  "music-production",
  "voice-production",
  "storyboarding",
  "content-production",
  "social-publishing",
  "project-management",
  "model-selection",
  "cost-optimization",
] as const;

export const skillIdSchema = z.enum(AGENT_SKILLS);
export type SkillId = z.infer<typeof skillIdSchema>;

export const skillContractSchema = z.object({
  id: skillIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(capabilitySchema).min(1),
  requiredPermissions: z.array(z.string()).default([]),
});

export type SkillContract = z.infer<typeof skillContractSchema>;

/** True when every capability a skill needs is covered by the supplied set. */
export function skillIsSatisfiedBy(
  skill: SkillContract,
  capabilities: readonly string[],
): boolean {
  return skill.capabilities.every((capability) =>
    capabilities.includes(capability),
  );
}
