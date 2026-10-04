import { KronosApiError } from "../services/kronos-api.js";

export function toolError(error: unknown) {
  const code = error instanceof KronosApiError ? error.code : "INTERNAL_ERROR";
  const status = error instanceof KronosApiError ? error.httpStatus : undefined;
  // Error payloads use a stable JSON text envelope rather than structuredContent:
  // SDK clients validate structuredContent against the success output schema.
  const details = { error: { code, ...(status === undefined ? {} : { httpStatus: status }) } };
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(details) }],
  };
}
