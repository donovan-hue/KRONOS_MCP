/**
 * Structured, stderr-only logging.
 *
 * stdout belongs to the MCP protocol: a single stray byte there corrupts the
 * JSON-RPC stream. Every log line therefore goes to stderr, unconditionally.
 *
 * The second rule is stricter and deliberate: **only primitives are ever
 * logged**. Objects, arrays and functions are replaced with `[omitted]`. That
 * makes it structurally impossible to log a token, a credential or an upstream
 * response body by accident, instead of relying on whoever writes the next
 * `logEvent` call to remember what is sensitive.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogValue = string | number | boolean | null;
export type LogFields = Record<string, LogValue>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const OMITTED = "[omitted]";

function isLogValue(value: unknown): value is LogValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Reduces arbitrary input to primitives. Objects and functions collapse to `[omitted]`. */
export function sanitizeFields(fields: Record<string, unknown> = {}): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = isLogValue(value) ? value : OMITTED;
  }
  return safe;
}

/** Reads the minimum level from the environment, defaulting to `info`. */
export function currentLevel(): LogLevel {
  const raw = String(process.env.KRONOS_LOG_LEVEL ?? "").trim().toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

export function isLevelEnabled(level: LogLevel, minimum: LogLevel = currentLevel()): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minimum];
}

/**
 * Emits one JSON line on stderr. Returns the line that was written, which makes
 * the logger straightforward to assert on in tests.
 */
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): string | null {
  if (!isLevelEnabled(level)) return null;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeFields(fields),
  });

  process.stderr.write(`${line}\n`);
  return line;
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => logEvent("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => logEvent("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => logEvent("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => logEvent("error", event, fields),
};
