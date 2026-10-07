import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  ToolRegistry,
  assetSchema,
  capabilitySchema,
  credentialSchema,
  errorEnvelopeSchema,
  isCredentialUsable,
  isProjectEditable,
  isTerminalJob,
  isTerminalJobStatus,
  jobSchema,
  jobStatusSchema,
  matchResourceTemplate,
  missingPromptArguments,
  normalizeProgress,
  projectSchema,
  promptContractSchema,
  readOnlyTool,
  resource,
  resourceContractSchema,
  skillContractSchema,
  skillIsSatisfiedBy,
  toolAnnotations,
  toolContractSchema,
  validateJobStatusInvariants,
} from "../src/contracts/index.js";

test("capabilities and job statuses are non-empty and consistent", () => {
  assert.ok(CAPABILITIES.length > 0);
  assert.ok(JOB_STATUSES.length > 0);
  for (const status of TERMINAL_JOB_STATUSES) {
    assert.ok(JOB_STATUSES.includes(status), `${status} must be a known status`);
  }
  assert.equal(capabilitySchema.parse("video"), "video");
  assert.throws(() => capabilitySchema.parse("teleportation"));
  assert.equal(jobStatusSchema.parse("queued"), "queued");
  assert.throws(() => jobStatusSchema.parse("maybe"));
});

test("terminal statuses are detected", () => {
  assert.equal(isTerminalJobStatus("completed"), true);
  assert.equal(isTerminalJobStatus("failed"), true);
  assert.equal(isTerminalJobStatus("cancelled"), true);
  assert.equal(isTerminalJobStatus("processing"), false);
  assert.equal(isTerminalJobStatus("queued"), false);
  assert.equal(isTerminalJob({ status: "failed" }), true);
  assert.equal(isTerminalJob({ status: "processing" }), false);
});

test("progress normalizes fractions, out-of-range and non-finite values", () => {
  assert.equal(normalizeProgress(0.5), 50);
  assert.equal(normalizeProgress(42), 42);
  assert.equal(normalizeProgress(150), 100);
  assert.equal(normalizeProgress(-10), 0);
  assert.equal(normalizeProgress(Number.NaN), 0);
  assert.equal(normalizeProgress(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeProgress(0), 0);
});

test("job status invariants are enforced", () => {
  const base = { id: "j1", capability: "video", status: "processing" } as const;

  assert.deepEqual(validateJobStatusInvariants(jobSchema.parse(base)), []);

  const failed = jobSchema.parse({ ...base, status: "failed", error: "boom" });
  assert.deepEqual(validateJobStatusInvariants(failed), []);

  const failedNoReason = jobSchema.parse({ ...base, status: "failed" });
  assert.ok(
    validateJobStatusInvariants(failedNoReason).includes(
      "failed job must declare an error",
    ),
  );

  const completed = jobSchema.parse({
    ...base,
    status: "completed",
    result: { id: "a1", kind: "video" },
  });
  assert.deepEqual(validateJobStatusInvariants(completed), []);
});

test("job and asset schemas reject invalid shapes but pass through extra fields", () => {
  const job = jobSchema.parse({
    id: "j1",
    capability: "image",
    status: "queued",
    anythingExtra: { kept: true },
  });
  assert.equal(job.progress, 0, "progress defaults to 0");
  assert.deepEqual(job.anythingExtra, { kept: true });

  assert.throws(() => jobSchema.parse({ id: "", capability: "image", status: "queued" }));
  assert.throws(() => jobSchema.parse({ id: "j1", capability: "image", status: "nope" }));
  assert.throws(() => assetSchema.parse({ id: "a1", kind: "unknown-kind" }));
});

test("tool contract derives annotations and rejects malformed names", () => {
  const contract = readOnlyTool({
    name: "kronos_health",
    description: "Health check",
    capability: "diagnostics",
  });

  assert.equal(contract.readOnly, true);
  assert.equal(contract.destructive, false);
  assert.equal(contract.openWorld, true);
  assert.deepEqual(toolAnnotations(contract), {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  });

  assert.throws(() => toolContractSchema.parse({ ...contract, name: "Bad Name" }));
  assert.throws(() => toolContractSchema.parse({ ...contract, name: "" }));
});

test("tool registry is idempotent and rejects conflicting duplicates", () => {
  const registry = new ToolRegistry();
  const contract = readOnlyTool({
    name: "kronos_status",
    description: "Status",
    capability: "diagnostics",
  });

  registry.register(contract);
  registry.register({ ...contract });
  assert.equal(registry.list().length, 1);

  assert.throws(
    () =>
      registry.register({
        ...contract,
        description: "A different description",
      }),
    /TOOL_CONTRACT_CONFLICT/,
  );

  assert.equal(registry.get("kronos_status")?.name, "kronos_status");
  assert.equal(registry.get("nope"), undefined);
  assert.equal(registry.byCapability("diagnostics").length, 1);
  assert.equal(registry.byCapability("video").length, 0);
});

test("resource templates match concrete URIs and capture params", () => {
  const templated = resource({
    uri: "kairos://project/{id}",
    name: "project",
    description: "A project",
    capability: "project",
  });
  assert.equal(templated.templated, true);

  const fixed = resource({
    uri: "kairos://projects",
    name: "projects",
    description: "All projects",
    capability: "project",
  });
  assert.equal(fixed.templated, false);

  assert.deepEqual(matchResourceTemplate("kairos://project/{id}", "kairos://project/abc"), {
    id: "abc",
  });
  assert.equal(matchResourceTemplate("kairos://project/{id}", "kairos://project/"), null);
  assert.equal(matchResourceTemplate("kairos://project/{id}", "kronos://project/abc"), null);
  assert.equal(
    matchResourceTemplate("kairos://project/{id}", "kairos://project/abc/extra"),
    null,
  );
  assert.equal(matchResourceTemplate("kairos://projects", "kairos://project/abc"), null);
  assert.deepEqual(matchResourceTemplate("kairos://projects", "kairos://projects"), {});
  assert.throws(() => resourceContractSchema.parse({ ...fixed, uri: "no-scheme" }));
});

test("prompt arguments report only the missing required ones", () => {
  const prompt = promptContractSchema.parse({
    name: "create_video",
    description: "Create a video",
    capability: "video",
    arguments: [
      { name: "topic", description: "Subject", required: true },
      { name: "tone", description: "Tone", required: false },
    ],
  });

  assert.deepEqual(missingPromptArguments(prompt, {}), ["topic"]);
  assert.deepEqual(missingPromptArguments(prompt, { topic: "x" }), []);
  assert.deepEqual(missingPromptArguments(prompt, { topic: "" }), ["topic"]);
  assert.deepEqual(missingPromptArguments(prompt, { topic: null }), ["topic"]);
});

test("projects gate editing by status", () => {
  const draft = projectSchema.parse({ id: "p1", name: "Demo" });
  assert.equal(draft.status, "draft");
  assert.equal(isProjectEditable("draft"), true);
  assert.equal(isProjectEditable("active"), true);
  assert.equal(isProjectEditable("archived"), false);
  assert.equal(isProjectEditable("deleted"), false);
});

test("credentials are usable only while active and unexpired", () => {
  const now = new Date("2026-10-07T00:00:00Z");

  const active = credentialSchema.parse({ id: "c1", provider: "kronos-mcp" });
  assert.equal(active.status, "active");
  assert.equal(isCredentialUsable(active, now), true);

  assert.equal(
    isCredentialUsable({ ...active, status: "revoked" }, now),
    false,
  );
  assert.equal(
    isCredentialUsable(
      { ...active, expiresAt: "2020-01-01T00:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    isCredentialUsable({ ...active, expiresAt: "2030-01-01T00:00:00Z" }, now),
    true,
  );
  assert.equal(
    isCredentialUsable({ ...active, expiresAt: "not-a-date" }, now),
    false,
  );
});

test("skills declare the capabilities they need", () => {
  const skill = skillContractSchema.parse({
    id: "video-production",
    name: "Video production",
    description: "Produce videos",
    capabilities: ["video", "script"],
  });

  assert.equal(skillIsSatisfiedBy(skill, ["video", "script"]), true);
  assert.equal(skillIsSatisfiedBy(skill, ["video"]), false);
  assert.throws(() => skillContractSchema.parse({ ...skill, capabilities: [] }));
});

test("error envelope matches the tool-error wire format", () => {
  assert.deepEqual(errorEnvelopeSchema.parse({ error: { code: "AUTH_REQUIRED" } }), {
    error: { code: "AUTH_REQUIRED" },
  });
  assert.deepEqual(
    errorEnvelopeSchema.parse({ error: { code: "UPSTREAM_TIMEOUT", httpStatus: 504 } }),
    { error: { code: "UPSTREAM_TIMEOUT", httpStatus: 504 } },
  );
  assert.throws(() => errorEnvelopeSchema.parse({ error: { code: "" } }));
});
