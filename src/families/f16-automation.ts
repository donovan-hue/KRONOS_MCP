/** Familia 16 — Automatización e integraciones (herramientas 151-160). */
import { z } from "zod";
import { canonicalStringify, getPath } from "../engines/data.js";
import { hmacSha256Hex, safeEqualHex, sha256Hex } from "../engines/security.js";
import { nextCronRuns, toDate } from "../engines/time.js";
import { hasPermission } from "../contracts/permission.js";
import { evictOldest, idempotencyKeys, jobQueues } from "../state/stores.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const conditionSchema = z.object({
  field: txt(200),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists", "in"]),
  value: z.unknown().optional(),
});

function evaluateCondition(payload: Record<string, unknown>, condition: z.infer<typeof conditionSchema>): boolean {
  const actual = getPath(payload, condition.field);
  switch (condition.op) {
    case "exists": return actual !== undefined;
    case "eq": return canonicalStringify(actual) === canonicalStringify(condition.value);
    case "neq": return canonicalStringify(actual) !== canonicalStringify(condition.value);
    case "contains": return typeof actual === "string" && typeof condition.value === "string" && actual.includes(condition.value);
    case "in": return Array.isArray(condition.value) && condition.value.some((v) => canonicalStringify(v) === canonicalStringify(actual));
    case "gt": return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "gte": return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "lt": return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "lte": return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
  }
}

const triggerManager = defineTool({
  number: 151,
  limitation: "Evalúa el evento contra las reglas aportadas y declara qué flujos deberían iniciarse; ejecutarlos es responsabilidad del llamante.",
  inputSchema: z.object({
    event: z.object({ type: idStr(), payload: z.record(z.string(), z.unknown()).optional() }).strict(),
    rules: z.array(z.object({ id: idStr(), eventType: idStr(), conditions: z.array(conditionSchema).max(20).optional(), action: txt(300), enabled: z.boolean().optional() })).min(1).max(500),
  }).strict(),
  example: { event: { type: "video.rendered", payload: { durationSec: 95, project: "demo" } }, rules: [{ id: "r1", eventType: "video.rendered", conditions: [{ field: "durationSec", op: "lte", value: 60 }], action: "publicar_en_canal_corto" }, { id: "r2", eventType: "video.rendered", action: "notificar_equipo" }] },
  handler: (input) => {
    const evaluations = input.rules.map((rule) => {
      const typeMatch = rule.eventType === input.event.type || rule.eventType === "*";
      const failed = (rule.conditions ?? []).filter((c) => !evaluateCondition(input.event.payload ?? {}, c));
      return { ruleId: rule.id, action: rule.action, triggered: Boolean(typeMatch && rule.enabled !== false && failed.length === 0), failedConditions: failed.map((c) => `${c.field} ${c.op} ${canonicalStringify(c.value)}`), disabled: rule.enabled === false };
    });
    return {
      summary: `${evaluations.filter((e) => e.triggered).length} flujos disparados por «${input.event.type}».`,
      data: { triggeredActions: evaluations.filter((e) => e.triggered).map((e) => e.action), evaluations },
    };
  },
});

const adapterBuilder = defineTool({
  number: 152,
  limitation: "Genera el código del adaptador como artefacto de texto; no lo escribe ni lo ejecuta.",
  inputSchema: z.object({
    serviceName: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "kebab-case"),
    baseUrlEnvVar: z.string().min(1).max(100).regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
    auth: z.object({ type: z.enum(["bearer_env", "api_key_header_env", "none"]), envVar: z.string().max(100).regex(/^[A-Z_][A-Z0-9_]*$/).optional(), headerName: txt(100).optional() }).strict(),
    endpoints: z.array(z.object({ name: z.string().min(1).max(100).regex(/^[a-z][a-zA-Z0-9]*$/), method: z.enum(["GET", "POST"]), path: z.string().min(1).max(500).regex(/^\//) })).min(1).max(50),
    timeoutMs: z.number().int().min(100).max(120_000).optional(),
  }).strict(),
  example: { serviceName: "ejemplo-media", auth: { type: "bearer_env", envVar: "EJEMPLO_MEDIA_TOKEN" }, endpoints: [{ name: "health", method: "GET", path: "/v1/health" }, { name: "createJob", method: "POST", path: "/v1/jobs" }] },
  handler: (input) => {
    const timeout = input.timeoutMs ?? 10_000;
    const baseEnv = input.baseUrlEnvVar ?? `${input.serviceName.replace(/-/g, "_").toUpperCase()}_API_URL`;
    const authSnippet = input.auth.type === "none"
      ? ""
      : input.auth.type === "bearer_env"
        ? `\n  const token = process.env.${input.auth.envVar ?? "SERVICE_TOKEN"}?.trim();\n  if (!token) throw new Error("AUTH_REQUIRED");\n  headers.set("Authorization", "Bearer " + token);`
        : `\n  const key = process.env.${input.auth.envVar ?? "SERVICE_API_KEY"}?.trim();\n  if (!key) throw new Error("AUTH_REQUIRED");\n  headers.set("${input.auth.headerName ?? "X-Api-Key"}", key);`;
    const methods = input.endpoints.map((e) => e.method === "GET"
      ? `/** GET ${e.path} */\nexport function get_${e.name}(baseUrl) {\n  return requestJson(baseUrl, "GET", "${e.path}");\n}`
      : `/** POST ${e.path} */\nexport function post_${e.name}(baseUrl, body) {\n  return requestJson(baseUrl, "POST", "${e.path}", body);\n}`).join("\n\n");
    const code = `// Adaptador generado para ${input.serviceName}. Revísalo antes de usarlo en producción.
// El secreto se lee del entorno y nunca debe registrarse ni devolverse en salidas.

export function getBaseUrl(env = process.env) {
  const raw = (env.${baseEnv} || "").trim();
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("CONFIG_INVALID");
  return raw.replace(/\\/+$/, "");
}

async function requestJson(baseUrl, method, path, body) {
  const headers = new Headers({ Accept: "application/json" });${authSnippet}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ${timeout});
  try {
    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    if (text.length > 1048576) throw new Error("RESPONSE_TOO_LARGE");
    if (!response.ok) throw Object.assign(new Error("UPSTREAM_HTTP_ERROR"), { httpStatus: response.status });
    return JSON.parse(text);
  } catch (error) {
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new Error("UPSTREAM_TIMEOUT");
    if (error && error.httpStatus) throw error;
    throw new Error("UPSTREAM_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

${methods}
`;
    return {
      summary: `Adaptador ES module generado para ${input.serviceName} (${input.endpoints.length} endpoints).`,
      data: { fileNameSuggested: `src/adapters/${input.serviceName}-adapter.mjs`, code, envVarsRequired: [baseEnv, ...(input.auth.envVar ? [input.auth.envVar] : [])], notes: ["Valida cada respuesta con tu esquema antes de usarla", "Añade pruebas con fetch simulado antes de conectar credenciales reales"] },
    };
  },
});

const webhookGateway = defineTool({
  number: 153,
  inputSchema: z.object({
    payload: longText(),
    signatureHex: z.string().regex(/^[0-9a-fA-F]{64}$/, "HMAC-SHA256 en hexadecimal (64 caracteres)"),
    secretEnvVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "nombre de variable de entorno"),
    signedPayloadPrefix: txt(200).optional(),
    eventTimestamp: txt(50).optional(),
    toleranceSeconds: z.number().int().min(0).max(86_400).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { payload: '{"type":"demo.ping"}', signatureHex: "0".repeat(64), secretEnvVar: "KRONOS_DEMO_WEBHOOK_SECRET" },
  handler: (input) => {
    // El ejemplo usa una variable inexistente a propósito: sin secreto configurado se responde
    // como error controlado, nunca con un valor por defecto inventado.
    const secret = process.env[input.secretEnvVar];
    if (!secret) fail("NOT_CONFIGURED");
    const signedContent = `${input.signedPayloadPrefix ?? ""}${input.payload}`;
    const expected = hmacSha256Hex(secret!, signedContent);
    const signatureValid = safeEqualHex(expected, input.signatureHex);
    let replayCheck: Record<string, unknown> = { performed: false };
    if (input.eventTimestamp) {
      const ageSeconds = Math.round((toDate(input.now).getTime() - toDate(input.eventTimestamp).getTime()) / 1000);
      const tolerance = input.toleranceSeconds ?? 300;
      replayCheck = { performed: true, ageSeconds, toleranceSeconds: tolerance, withinWindow: ageSeconds >= -tolerance && ageSeconds <= tolerance };
    }
    const accepted = signatureValid && (replayCheck.performed === false || replayCheck.withinWindow === true);
    return {
      summary: accepted ? "Webhook aceptado: firma válida y dentro de ventana." : "Webhook rechazado.",
      data: { accepted, signatureValid, replayCheck, payloadParsed: (() => { try { return JSON.parse(input.payload) as unknown; } catch { return null; } })() },
    };
  },
});

const jobQueue = defineTool({
  number: 154,
  stateful: true,
  limitation: "Cola fiable en memoria del proceso (confirmaciones y reintentos con dead-letter); no persiste ni distribuye el trabajo.",
  inputSchema: z.object({
    action: z.enum(["enqueue", "dequeue", "ack", "nack", "list", "stats"]),
    queue: idStr().optional(),
    jobId: idStr().optional(),
    payload: z.unknown().optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
  }).strict(),
  example: { action: "enqueue", queue: "demo", jobId: "job-1", payload: { kind: "render", ref: "video-9" }, maxAttempts: 3 },
  handler: (input) => {
    const queueName = input.queue ?? "default";
    const jobs = jobQueues.get(queueName) ?? [];
    jobQueues.set(queueName, jobs);
    const stats = { pending: jobs.filter((j) => j.status === "pending").length, running: jobs.filter((j) => j.status === "running").length, completed: jobs.filter((j) => j.status === "completed").length, failed: jobs.filter((j) => j.status === "failed").length, dead: jobs.filter((j) => j.status === "dead").length };
    if (input.action === "stats") return { summary: `Cola ${queueName}: ${stats.pending} pendientes.`, data: { stats } };
    if (input.action === "list") return { summary: `${jobs.length} trabajos en la cola ${queueName}.`, data: { jobs: jobs.slice(-100).map((j) => ({ id: j.id, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, enqueuedAt: j.enqueuedAt })) } };
    if (input.action === "enqueue") {
      if (!input.jobId) fail("INVALID_INPUT");
      if (jobs.some((j) => j.id === input.jobId && ["pending", "running"].includes(j.status))) fail("CONFLICT");
      jobs.push({ id: input.jobId!, payload: input.payload ?? null, status: "pending", attempts: 0, maxAttempts: input.maxAttempts ?? 3, enqueuedAt: new Date().toISOString() });
      return { summary: `Trabajo ${input.jobId} encolado.`, data: { jobId: input.jobId, position: stats.pending + 1, stats: { ...stats, pending: stats.pending + 1 } } };
    }
    if (input.action === "dequeue") {
      const next = jobs.find((j) => j.status === "pending");
      if (!next) return { summary: "La cola está vacía.", data: { job: null } };
      next.status = "running"; next.attempts += 1;
      return { summary: `Entregado ${next.id} (intento ${next.attempts}/${next.maxAttempts}). Confirma con ack o devuelve con nack.`, data: { job: { id: next.id, payload: next.payload, attempts: next.attempts } } };
    }
    if (!input.jobId) fail("INVALID_INPUT");
    const job = jobs.find((j) => j.id === input.jobId);
    if (!job) fail("NOT_FOUND");
    job!.status = input.action === "ack" ? "completed" : job!.attempts >= job!.maxAttempts ? "dead" : "pending";
    evictOldest(jobQueues);
    return { summary: `Trabajo ${input.jobId}: ${job!.status}${job!.status === "dead" ? " (dead-letter tras agotar reintentos)" : ""}.`, data: { jobId: input.jobId, status: job!.status } };
  },
});

const messageRouter = defineTool({
  number: 155,
  inputSchema: z.object({
    message: z.object({ type: idStr(), source: idStr().optional(), payload: z.record(z.string(), z.unknown()).optional() }).strict(),
    routes: z.array(z.object({ id: idStr(), matchType: txt(200), target: idStr(), conditions: z.array(conditionSchema).max(20).optional(), priority: z.number().finite().optional() })).min(1).max(500),
    defaultTarget: idStr().optional(),
  }).strict(),
  example: { message: { type: "video.rendered", source: "render-service", payload: { quality: "high" } }, routes: [{ id: "r1", matchType: "video.rendered", target: "publishing", conditions: [{ field: "quality", op: "eq", value: "high" }] }, { id: "r2", matchType: "video.*", target: "notifications" }], defaultTarget: "dead-letter" },
  handler: (input) => {
    const typeMatches = (pattern: string, type: string) => pattern === "*" || pattern === type || (pattern.endsWith(".*") && type.startsWith(pattern.slice(0, -1)));
    const matches = input.routes
      .filter((r) => typeMatches(r.matchType, input.message.type))
      .map((r) => ({ ...r, conditionsOk: (r.conditions ?? []).every((c) => evaluateCondition(input.message.payload ?? {}, c)), specificity: r.matchType === input.message.type ? 2 : r.matchType === "*" ? 0 : 1 }))
      .filter((r) => r.conditionsOk)
      .sort((a, b) => (b.specificity - a.specificity) || ((b.priority ?? 0) - (a.priority ?? 0)));
    const targets = [...new Set(matches.map((m) => m.target))];
    return {
      summary: targets.length > 0 ? `El mensaje va a: ${targets.join(", ")}.` : `Sin ruta: se envía a ${input.defaultTarget ?? "ningún destino"}.`,
      data: { targets: targets.length > 0 ? targets : input.defaultTarget ? [input.defaultTarget] : [], matchedRoutes: matches.map((m) => m.id), usedDefault: targets.length === 0 },
    };
  },
});

const credentialScopes = defineTool({
  number: 156,
  inputSchema: z.object({
    credentials: z.array(z.object({ id: idStr(), service: idStr(), scopes: strArr(100, 200), status: z.enum(["active", "revoked", "expired"]).optional(), expiresAt: txt(50).optional() })).min(1).max(500),
    requiredByService: z.record(z.string(), z.array(z.string().max(200)).max(100)),
    now: txt(50).optional(),
  }).strict(),
  example: { credentials: [{ id: "cred-1", service: "kronos-api", scopes: ["*"], status: "active" }, { id: "cred-2", service: "kronos-api", scopes: ["status"], status: "expired" }], requiredByService: { "kronos-api": ["status", "health", "me"] } },
  handler: (input) => {
    const now = toDate(input.now);
    const audited = input.credentials.map((cred) => {
      const required = input.requiredByService[cred.service] ?? [];
      const missing = required.filter((r) => !hasPermission(cred.scopes, r));
      const issues: string[] = [];
      if (cred.scopes.includes("*")) issues.push("Ámbito total (*): debería restringirse a lo necesario");
      if (cred.scopes.some((s) => s.endsWith(":*") && required.length <= 2)) issues.push("Comodín de namespace con muy pocos permisos requeridos");
      if (cred.status === "revoked" || cred.status === "expired") issues.push(`Credencial ${cred.status}: no debe usarse`);
      if (cred.expiresAt && toDate(cred.expiresAt) < now) issues.push("Fecha de caducidad superada");
      const excessScopes = cred.scopes.filter((s) => s !== "*" && !s.endsWith(":*") && !required.some((r) => hasPermission([s], r)));
      return { id: cred.id, service: cred.service, missingScopes: missing, excessScopes, issues, minimalRecommendation: required, usable: missing.length === 0 && !issues.some((i) => i.includes("no debe usarse") || i.includes("caducidad")) };
    });
    return {
      summary: `${audited.filter((a) => a.issues.length === 0 && a.missingScopes.length === 0).length}/${audited.length} credenciales sin observaciones.`,
      data: { credentials: audited, servicesWithoutUsableCredential: Object.keys(input.requiredByService).filter((service) => !audited.some((a) => a.service === service && a.usable)) },
    };
  },
});

const dataSync = defineTool({
  number: 157,
  inputSchema: z.object({
    source: z.array(z.record(z.string(), z.unknown())).max(5_000),
    target: z.array(z.record(z.string(), z.unknown())).max(5_000),
    keyField: idStr(),
    updatedAtField: txt(100).optional(),
    strategy: z.enum(["source_wins", "target_wins", "last_write_wins", "flag_conflicts"]),
  }).strict(),
  example: { source: [{ id: "1", nombre: "Ana", updatedAt: "2026-10-19T09:00:00Z" }, { id: "2", nombre: "Luis", updatedAt: "2026-10-19T09:00:00Z" }], target: [{ id: "1", nombre: "Ana María", updatedAt: "2026-10-18T09:00:00Z" }], keyField: "id", updatedAtField: "updatedAt", strategy: "last_write_wins" },
  handler: (input) => {
    const keyOf = (r: Record<string, unknown>) => canonicalStringify(r[input.keyField]);
    const sourceByKey = new Map(input.source.map((r) => [keyOf(r), r]));
    const targetByKey = new Map(input.target.map((r) => [keyOf(r), r]));
    const creates: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const deletes: Record<string, unknown>[] = [];
    const conflicts: Record<string, unknown>[] = [];
    const unchanged: string[] = [];
    for (const [key, sourceRecord] of sourceByKey) {
      const targetRecord = targetByKey.get(key);
      if (!targetRecord) { creates.push(sourceRecord); continue; }
      if (canonicalStringify(sourceRecord) === canonicalStringify(targetRecord)) { unchanged.push(String(sourceRecord[input.keyField])); continue; }
      let winner: "source" | "target" | "flag" = input.strategy === "source_wins" ? "source" : input.strategy === "target_wins" ? "target" : input.strategy === "flag_conflicts" ? "flag" : "source";
      if (input.strategy === "last_write_wins" && input.updatedAtField) {
        const s = String(sourceRecord[input.updatedAtField] ?? "");
        const t = String(targetRecord[input.updatedAtField] ?? "");
        winner = t > s ? "target" : "source";
      }
      const entry = { key: sourceRecord[input.keyField], source: sourceRecord, target: targetRecord, winner };
      if (winner === "source") updates.push({ ...entry, applyRecord: sourceRecord });
      else if (winner === "flag") conflicts.push(entry);
      else unchanged.push(String(sourceRecord[input.keyField]));
    }
    for (const [key, targetRecord] of targetByKey) if (!sourceByKey.has(key)) deletes.push(targetRecord);
    return {
      summary: `Sincronización calculada: ${creates.length} altas, ${updates.length} actualizaciones, ${deletes.length} bajas, ${conflicts.length} conflictos.`,
      data: { creates: creates.slice(0, 200), updates: updates.slice(0, 200), deletesCandidate: deletes.slice(0, 200), conflicts: conflicts.slice(0, 200), unchangedCount: unchanged.length, warning: "Las bajas son candidatas: confirma que el origen es la fuente de verdad antes de borrar en el destino." },
    };
  },
});

const scheduledRunner = defineTool({
  number: 158,
  limitation: "Calcula la programación (cron de 5 campos en UTC) y el plan de ejecución; este servidor MCP no es un demonio que despierte trabajos solo.",
  inputSchema: z.object({
    cron: reqText(100),
    from: txt(50).optional(),
    count: z.number().int().min(1).max(52).optional(),
    missedRunPolicy: z.enum(["skip", "run_once", "run_all"]).optional(),
    lastRunAt: txt(50).optional(),
  }).strict(),
  example: { cron: "0 9 * * 1-5", from: "2026-10-19T00:00:00Z", count: 3 },
  handler: (input) => {
    const from = toDate(input.from);
    const runs = nextCronRuns(input.cron, from, input.count ?? 5);
    let missedRuns: string[] = [];
    if (input.lastRunAt) {
      const between: Date[] = [];
      let cursor = toDate(input.lastRunAt);
      for (let i = 0; i < 500; i += 1) {
        const [next] = nextCronRuns(input.cron, cursor, 1);
        if (!next || next > from) break;
        between.push(next);
        cursor = next;
      }
      missedRuns = between.map((d) => d.toISOString());
    }
    const policy = input.missedRunPolicy ?? "skip";
    return {
      summary: `Próxima ejecución: ${runs[0]?.toISOString() ?? "ninguna en ~2 años"}.`,
      data: { cron: input.cron, timezoneAssumption: "UTC", nextRuns: runs.map((d) => d.toISOString()), missedSinceLastRun: missedRuns, catchUpPlan: missedRuns.length === 0 ? "Sin ejecuciones perdidas" : policy === "skip" ? `Saltar las ${missedRuns.length} perdidas` : policy === "run_once" ? "Ejecutar una sola vez para ponerse al día" : `Ejecutar las ${missedRuns.length} perdidas en orden (cuidado con duplicados)`, idempotencyAdvice: "Cada ejecución programada debería llevar clave de idempotencia para que el catch-up no duplique efectos." },
    };
  },
});

const idempotencyManager = defineTool({
  number: 159,
  stateful: true,
  limitation: "Registro en memoria del proceso: protege reintentos dentro de la misma sesión del servidor, no entre instancias.",
  inputSchema: z.object({
    action: z.enum(["begin", "complete", "status"]),
    key: idStr(),
    payload: longText().optional(),
    ttlSeconds: z.number().positive().max(2_592_000).optional(),
  }).strict(),
  example: { action: "begin", key: "publish:video-9", payload: "{\"video\":9}", ttlSeconds: 3600 },
  handler: (input) => {
    const now = Date.now();
    const existing = idempotencyKeys.get(input.key);
    const live = existing && now - existing.createdAt <= existing.ttlSeconds * 1000 ? existing : undefined;
    if (existing && !live) idempotencyKeys.delete(input.key);
    if (input.action === "status") {
      return { summary: live ? `Clave ${input.key}: ${live.status}.` : "Clave no encontrada o caducada.", data: { key: input.key, exists: Boolean(live), status: live?.status ?? null } };
    }
    if (input.action === "begin") {
      if (!input.payload) fail("INVALID_INPUT");
      const payloadHash = sha256Hex(input.payload!);
      if (live) {
        if (live.payloadHash !== payloadHash) fail("CONFLICT");
        return { summary: live.status === "completed" ? "Duplicado detectado: la operación ya concluyó; no la repitas." : "Duplicado detectado: la misma operación ya está en curso.", data: { key: input.key, isDuplicate: true, shouldExecute: false, previousStatus: live.status } };
      }
      idempotencyKeys.set(input.key, { payloadHash, status: "in_progress", createdAt: now, ttlSeconds: input.ttlSeconds ?? 86_400 });
      evictOldest(idempotencyKeys);
      return { summary: "Clave registrada: procede con la operación una sola vez.", data: { key: input.key, isDuplicate: false, shouldExecute: true } };
    }
    if (!live) fail("NOT_FOUND");
    live!.status = "completed";
    return { summary: `Operación ${input.key} marcada como completada.`, data: { key: input.key, status: "completed" } };
  },
});

const eventReplay = defineTool({
  number: 160,
  limitation: "Planifica y acota la repetición con controles; no reenvía los eventos.",
  inputSchema: z.object({
    events: z.array(z.object({ id: idStr(), type: idStr(), timestamp: txt(50), status: z.enum(["delivered", "failed", "pending"]).optional() })).min(1).max(10_000),
    types: strArr(50, 200).optional(),
    since: txt(50).optional(),
    until: txt(50).optional(),
    onlyFailed: z.boolean().optional(),
    maxEvents: z.number().int().min(1).max(10_000).optional(),
    dryRun: z.boolean(),
  }).strict(),
  example: { events: [{ id: "e1", type: "video.rendered", timestamp: "2026-10-19T09:00:00Z", status: "failed" }, { id: "e1", type: "video.rendered", timestamp: "2026-10-19T09:00:01Z", status: "delivered" }, { id: "e2", type: "pago", timestamp: "2026-10-19T10:00:00Z", status: "failed" }], onlyFailed: true, dryRun: true },
  handler: (input) => {
    const since = input.since ? toDate(input.since).getTime() : null;
    const until = input.until ? toDate(input.until).getTime() : null;
    const byId = new Map<string, (typeof input.events)[number]>();
    let duplicatesSkipped = 0;
    for (const event of input.events) {
      if (byId.has(event.id)) { duplicatesSkipped += 1; continue; }
      byId.set(event.id, event);
    }
    const selected = [...byId.values()]
      .filter((e) => !input.types?.length || input.types.includes(e.type))
      .filter((e) => !input.onlyFailed || e.status === "failed")
      .filter((e) => since === null || toDate(e.timestamp).getTime() >= since)
      .filter((e) => until === null || toDate(e.timestamp).getTime() <= until)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const cap = input.maxEvents ?? 500;
    const plan = selected.slice(0, cap);
    const guards: string[] = [];
    if (!input.dryRun && plan.length > 50) guards.push("Repetición grande sin dry-run previo: se recomienda ensayo antes de ejecutar.");
    if (selected.some((e) => e.status === "delivered")) guards.push("Incluye eventos ya entregados: exige idempotencia en el consumidor.");
    return {
      summary: `${plan.length} eventos en el plan de repetición (orden cronológico, ${duplicatesSkipped} duplicados omitidos).`,
      data: { dryRun: input.dryRun, orderedEventIds: plan.map((e) => e.id), truncated: selected.length > plan.length, totalMatching: selected.length, duplicatesSkipped, safetyGuards: guards, recommendedBatchSize: 25 },
    };
  },
});

export const f16: LocalToolDefinition[] = [triggerManager, adapterBuilder, webhookGateway, jobQueue, messageRouter, credentialScopes, dataSync, scheduledRunner, idempotencyManager, eventReplay];
