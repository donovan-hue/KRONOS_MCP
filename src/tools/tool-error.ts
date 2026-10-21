import { randomUUID } from "node:crypto";
import { KronosApiError } from "../services/kronos-api.js";
import { KRONOS_TOOL_VERSION } from "../contracts/tool.js";
import { log } from "../observability/log.js";

export function toolError(error: unknown, context?: { correlationId?: string; durationMs?: number; tool?: string }) {
  const code = error instanceof KronosApiError ? error.code : "INTERNAL_ERROR";
  const status = error instanceof KronosApiError ? error.httpStatus : undefined;

  // Structured, stderr-only. Never the error object itself: its message may
  // carry upstream detail, and only primitives are allowed through the logger.
  log.warn("tool_error", {
    code,
    ...(status === undefined ? {} : { httpStatus: status }),
    ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
    ...(context?.tool ? { tool: context.tool } : {}),
    ...(context?.durationMs !== undefined ? { durationMs: context.durationMs } : {}),
    version: KRONOS_TOOL_VERSION,
  });

  // Error payloads use a stable JSON text envelope rather than structuredContent:
  // SDK clients validate structuredContent against the success output schema.
  // P1: also provide metadata for observabilidad without exponer detalles internos
  const details = {
    ok: false,
    version: KRONOS_TOOL_VERSION,
    error: { code, ...(status === undefined ? {} : { httpStatus: status }) },
    metadata: {
      correlationId: context?.correlationId ?? randomUUID(),
      durationMs: context?.durationMs ?? 0,
      timestamp: new Date().toISOString(),
    },
  };
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(details) }],
  };
}
