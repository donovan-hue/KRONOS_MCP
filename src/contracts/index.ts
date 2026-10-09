/**
 * Public surface of the contract layer.
 *
 * Contracts are the shared vocabulary every tool, resource, prompt and job is
 * expected to speak. Import from here rather than from individual files so the
 * dependency direction stays one-way.
 *
 * Deliberately absent from this batch: Provider, ProviderAdapter, Model, Cost
 * and Credits. Those are part of the generative-AI work and were parked by
 * decision, not by omission.
 */

export * from "./common.js";
export * from "./tool.js";
export * from "./resource.js";
export * from "./prompt.js";
export * from "./permission.js";
export * from "./job.js";
export * from "./project.js";
export * from "./credential.js";
export * from "./skill.js";
