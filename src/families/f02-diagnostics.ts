/** Familia 02 — Diagnóstico, reparación y recuperación (herramientas 11-20). */
import { z } from "zod";
import { analyzeGraph } from "../engines/graph.js";
import { round } from "../engines/stats.js";
import { sha256Hex } from "../engines/security.js";
import { canonicalStringify } from "../engines/data.js";
import { checkpoints, circuitBreakers, evictOldest } from "../state/stores.js";
import { defineTool, fail, idStr, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const healthDiagnoser = defineTool({
  number: 11,
  limitation: "Evalúa las señales que recibe; no sondea sistemas por sí mismo.",
  inputSchema: z.object({
    signals: z.array(z.object({
      name: idStr(), value: z.number().finite(),
      warningAt: z.number().finite().optional(), criticalAt: z.number().finite().optional(),
      direction: z.enum(["above_is_bad", "below_is_bad"]).optional(), component: idStr().optional(),
    })).min(1).max(500),
  }).strict(),
  example: { signals: [{ name: "cpu_pct", value: 92, warningAt: 70, criticalAt: 90, component: "api" }, { name: "error_rate", value: 0.01, warningAt: 0.05, criticalAt: 0.1, component: "api" }] },
  handler: (input) => {
    const evaluated = input.signals.map((s) => {
      const aboveBad = (s.direction ?? "above_is_bad") === "above_is_bad";
      let status: "ok" | "warning" | "critical" | "unknown" = "unknown";
      if (s.criticalAt !== undefined && (aboveBad ? s.value >= s.criticalAt : s.value <= s.criticalAt)) status = "critical";
      else if (s.warningAt !== undefined && (aboveBad ? s.value >= s.warningAt : s.value <= s.warningAt)) status = "warning";
      else if (s.warningAt !== undefined || s.criticalAt !== undefined) status = "ok";
      return { ...s, status };
    });
    const overall = evaluated.some((e) => e.status === "critical") ? "critical" : evaluated.some((e) => e.status === "warning") ? "degraded" : "healthy";
    const probableFailures = [...new Set(evaluated.filter((e) => e.status !== "ok" && e.component).map((e) => e.component!))];
    return {
      summary: `Salud global: ${overall} (${evaluated.filter((e) => e.status === "critical").length} críticas, ${evaluated.filter((e) => e.status === "warning").length} avisos).`,
      data: { overall, signals: evaluated, probableFailures },
    };
  },
});

const repairPlanner = defineTool({
  number: 12,
  inputSchema: z.object({
    problem: reqText(2_000),
    symptoms: strArr(50).optional(),
    component: txt(200).optional(),
    proposedFix: txt(2_000).optional(),
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
  }).strict(),
  example: { problem: "La API devuelve 500 al publicar", symptoms: ["CPU al 95%", "Errores desde las 10:02"], component: "api", riskLevel: "medium" },
  handler: (input) => {
    const risk = input.riskLevel ?? "medium";
    const steps = [
      { order: 1, phase: "confirmar", action: `Reproducir «${input.problem}» y registrar la evidencia mínima (hora, entrada, salida).`, verification: "El fallo se reproduce o queda acotado a una condición concreta." },
      { order: 2, phase: "proteger", action: "Crear un punto de control reversible del estado actual antes de tocar nada (checkpoint/configuración/datos).", verification: "Existe identificador del punto de control y procedimiento de vuelta probado." },
      { order: 3, phase: "aislar", action: `Aplicar el cambio mínimo${input.proposedFix ? `: ${input.proposedFix}` : " sobre la hipótesis más probable"} en el alcance más pequeño posible${input.component ? ` (${input.component})` : ""}.`, verification: "El resto de componentes sigue respondiendo igual." },
      { order: 4, phase: "verificar", action: "Repetir la reproducción del paso 1 y las comprobaciones de regresión clave.", verification: "El síntoma desaparece y ninguna señal vigilada empeora." },
      { order: 5, phase: "observar", action: "Vigilar las señales afectadas durante una ventana acordada antes de cerrar.", verification: "Sin reincidencias en la ventana de observación." },
    ];
    return {
      summary: `Plan de reparación verificable de ${steps.length} pasos (riesgo ${risk}).`,
      data: {
        problem: input.problem, symptoms: input.symptoms ?? [], steps,
        rollbackPlan: "Si la verificación del paso 4 falla: revertir al punto de control del paso 2, repetir la reproducción y registrar qué hipótesis queda descartada.",
        requiresExtraApproval: risk === "high",
      },
      warnings: risk === "high" ? ["Riesgo alto: exige aprobación adicional antes del paso 3."] : [],
    };
  },
});

const retryController = defineTool({
  number: 13,
  inputSchema: z.object({
    errorType: z.enum(["timeout", "network", "rate_limited", "server_5xx", "client_4xx", "auth", "validation", "unknown"]),
    attempt: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    baseDelayMs: z.number().positive().max(600_000).optional(),
    maxDelayMs: z.number().positive().max(3_600_000).optional(),
    retryAfterMs: z.number().nonnegative().max(3_600_000).optional(),
  }).strict(),
  example: { errorType: "timeout", attempt: 2 },
  handler: (input) => {
    const retryable = ["timeout", "network", "rate_limited", "server_5xx", "unknown"].includes(input.errorType);
    const maxAttempts = input.maxAttempts ?? 5;
    const base = input.baseDelayMs ?? 500;
    const cap = input.maxDelayMs ?? 30_000;
    const schedule = Array.from({ length: Math.max(0, maxAttempts - input.attempt) }, (_, i) => {
      const n = input.attempt + i;
      const jitter = ((n * 2654435761) % 250) / 1000; // jitter determinista 0-25%
      return Math.min(cap, Math.round(base * 2 ** n * (1 + jitter)));
    });
    const nextDelay = input.errorType === "rate_limited" && input.retryAfterMs !== undefined ? input.retryAfterMs : schedule[0];
    const shouldRetry = retryable && input.attempt < maxAttempts;
    return {
      summary: shouldRetry ? `Reintentar en ${nextDelay} ms (quedan ${maxAttempts - input.attempt} intentos).` : "No reintentar con esta política.",
      data: { shouldRetry, retryableError: retryable, nextDelayMs: shouldRetry ? nextDelay : null, remainingScheduleMs: shouldRetry ? schedule : [], reason: !retryable ? `Los errores «${input.errorType}» no se resuelven reintentando igual.` : input.attempt >= maxAttempts ? "Se alcanzó el máximo de intentos." : "Error transitorio: backoff exponencial con jitter acotado." },
    };
  },
});

const taskRecovery = defineTool({
  number: 14,
  inputSchema: z.object({
    taskId: idStr(),
    checkpoints: z.array(z.object({ id: idStr(), createdAt: txt(50), consistent: z.boolean(), progressPercent: z.number().min(0).max(100) })).min(1).max(200),
    failedAtProgressPercent: z.number().min(0).max(100).optional(),
  }).strict(),
  example: { taskId: "render-9", checkpoints: [{ id: "cp1", createdAt: "2026-10-19T10:00:00Z", consistent: true, progressPercent: 40 }, { id: "cp2", createdAt: "2026-10-19T10:20:00Z", consistent: false, progressPercent: 75 }], failedAtProgressPercent: 80 },
  handler: (input) => {
    const usable = input.checkpoints.filter((c) => c.consistent).sort((a, b) => b.progressPercent - a.progressPercent);
    if (usable.length === 0) {
      return { summary: "Sin puntos de control consistentes: hay que reiniciar desde cero.", data: { recoverFrom: null, lostWorkPercent: input.failedAtProgressPercent ?? 100, plan: ["Descartar el estado parcial", "Reiniciar la tarea desde el inicio", "Crear puntos de control verificados con más frecuencia"] }, warnings: ["Ningún checkpoint está marcado como consistente."] };
    }
    const best = usable[0];
    const lost = input.failedAtProgressPercent !== undefined ? Math.max(0, input.failedAtProgressPercent - best.progressPercent) : null;
    return {
      summary: `Recuperar «${input.taskId}» desde ${best.id} (${best.progressPercent}%).`,
      data: {
        recoverFrom: best, lostWorkPercent: lost === null ? null : round(lost, 1),
        discardedCheckpoints: input.checkpoints.filter((c) => c.id !== best.id).map((c) => ({ id: c.id, reason: c.consistent ? "Más antiguo que el elegido" : "No consistente" })),
        plan: [`Restaurar el estado de ${best.id}`, "Verificar integridad antes de reanudar", `Reanudar desde el ${best.progressPercent}% y registrar la recuperación`],
      },
    };
  },
});

const rootCause = defineTool({
  number: 15,
  limitation: "Correlación temporal y por dependencias sobre los eventos recibidos: estima causas probables, no las certifica.",
  inputSchema: z.object({
    events: z.array(z.object({ id: idStr(), timestamp: txt(50), component: idStr(), type: txt(100), message: txt(1_000).optional() })).min(1).max(2_000),
    errorEventId: idStr().optional(),
    dependencies: z.record(z.string(), z.array(idStr()).max(100)).optional(),
    windowMinutes: z.number().positive().max(10_080).optional(),
  }).strict(),
  example: {
    events: [
      { id: "e1", timestamp: "2026-10-19T10:00:00Z", component: "db", type: "latency_spike" },
      { id: "e2", timestamp: "2026-10-19T10:01:00Z", component: "api", type: "error" },
    ],
    errorEventId: "e2", dependencies: { api: ["db"] },
  },
  handler: (input) => {
    const sorted = [...input.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const error = input.errorEventId ? sorted.find((e) => e.id === input.errorEventId) : [...sorted].reverse().find((e) => /error|fail|crash/i.test(e.type));
    if (!error) fail("NOT_FOUND");
    const window = input.windowMinutes ?? 30;
    const errorTime = new Date(error!.timestamp).getTime();
    const deps = new Set(input.dependencies?.[error!.component] ?? []);
    const candidates = sorted
      .filter((e) => e.id !== error!.id && new Date(e.timestamp).getTime() <= errorTime && errorTime - new Date(e.timestamp).getTime() <= window * 60_000)
      .map((e) => {
        const minutesBefore = (errorTime - new Date(e.timestamp).getTime()) / 60_000;
        let score = Math.max(0, 1 - minutesBefore / window);
        const reasons = [`${round(minutesBefore, 1)} min antes del error`];
        if (deps.has(e.component)) { score += 0.5; reasons.push(`${error!.component} depende de ${e.component}`); }
        if (e.component === error!.component) { score += 0.3; reasons.push("Mismo componente que el error"); }
        if (/error|fail|spike|timeout|crash|restart/i.test(e.type)) { score += 0.3; reasons.push(`Evento anómalo (${e.type})`); }
        return { eventId: e.id, component: e.component, type: e.type, timestamp: e.timestamp, score: round(score, 3), reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    return {
      summary: candidates.length > 0 ? `Causa raíz más probable: ${candidates[0].eventId} (${candidates[0].component}).` : "Sin eventos previos correlacionables en la ventana.",
      data: { errorEvent: { id: error!.id, component: error!.component, timestamp: error!.timestamp }, probableCauses: candidates, timeline: sorted.map((e) => e.id) },
    };
  },
});

const regressionDetector = defineTool({
  number: 16,
  inputSchema: z.object({
    baseline: z.array(z.object({ name: idStr(), status: z.enum(["passed", "failed", "skipped"]), value: z.number().finite().optional() })).max(2_000),
    current: z.array(z.object({ name: idStr(), status: z.enum(["passed", "failed", "skipped"]), value: z.number().finite().optional() })).max(2_000),
    valueRegressionPct: z.number().positive().max(10_000).optional(),
  }).strict(),
  example: { baseline: [{ name: "login", status: "passed", value: 120 }, { name: "pago", status: "passed", value: 300 }], current: [{ name: "login", status: "failed", value: 118 }, { name: "pago", status: "passed", value: 390 }] },
  handler: (input) => {
    const before = new Map(input.baseline.map((t) => [t.name, t]));
    const threshold = input.valueRegressionPct ?? 20;
    const regressions: Record<string, unknown>[] = [];
    const fixed: string[] = [];
    for (const cur of input.current) {
      const prev = before.get(cur.name);
      if (!prev) continue;
      if (prev.status === "passed" && cur.status === "failed") regressions.push({ name: cur.name, kind: "status", detail: "Pasaba y ahora falla" });
      if (prev.status === "failed" && cur.status === "passed") fixed.push(cur.name);
      if (prev.value !== undefined && cur.value !== undefined && prev.value > 0) {
        const deltaPct = ((cur.value - prev.value) / prev.value) * 100;
        if (deltaPct >= threshold) regressions.push({ name: cur.name, kind: "value", baselineValue: prev.value, currentValue: cur.value, deltaPct: round(deltaPct, 1) });
      }
    }
    const missing = input.baseline.filter((t) => !input.current.some((c) => c.name === t.name)).map((t) => t.name);
    return {
      summary: regressions.length === 0 ? "Sin regresiones detectadas." : `${regressions.length} regresiones detectadas.`,
      data: { regressions, fixed, missingInCurrent: missing, newInCurrent: input.current.filter((t) => !before.has(t.name)).map((t) => t.name) },
    };
  },
});

const circuitBreaker = defineTool({
  number: 17,
  stateful: true,
  limitation: "Estado en memoria por clave; cada proceso mantiene su propio interruptor.",
  inputSchema: z.object({
    action: z.enum(["record_success", "record_failure", "status", "reset"]),
    key: idStr(),
    failureThreshold: z.number().int().min(1).max(1_000).optional(),
    resetAfterMs: z.number().int().min(0).max(86_400_000).optional(),
    at: txt(50).optional(),
  }).strict(),
  example: { action: "record_failure", key: "proveedor-ejemplo", failureThreshold: 3 },
  handler: (input) => {
    const now = input.at ? new Date(input.at).getTime() : Date.now();
    if (Number.isNaN(now)) fail("INVALID_INPUT");
    let breaker = circuitBreakers.get(input.key) ?? { failures: 0, successes: 0, openedAt: null, threshold: input.failureThreshold ?? 5, resetAfterMs: input.resetAfterMs ?? 60_000 };
    if (input.failureThreshold) breaker.threshold = input.failureThreshold;
    if (input.resetAfterMs !== undefined) breaker.resetAfterMs = input.resetAfterMs;
    const stateOf = (b: typeof breaker) => b.openedAt === null ? "closed" : now - b.openedAt >= b.resetAfterMs ? "half_open" : "open";
    if (input.action === "reset") {
      breaker = { failures: 0, successes: 0, openedAt: null, threshold: breaker.threshold, resetAfterMs: breaker.resetAfterMs };
    } else if (input.action === "record_failure") {
      breaker.failures += 1;
      if (breaker.failures >= breaker.threshold && breaker.openedAt === null) breaker.openedAt = now;
      if (stateOf(breaker) === "half_open") breaker.openedAt = now;
    } else if (input.action === "record_success") {
      breaker.successes += 1;
      breaker.failures = 0;
      breaker.openedAt = null;
    }
    circuitBreakers.set(input.key, breaker);
    evictOldest(circuitBreakers);
    const state = stateOf(breaker);
    return {
      summary: `Interruptor «${input.key}»: ${state} (fallos consecutivos ${breaker.failures}/${breaker.threshold}).`,
      data: { key: input.key, state, allowsCalls: state !== "open", ...breaker, retryAt: breaker.openedAt === null ? null : new Date(breaker.openedAt + breaker.resetAfterMs).toISOString() },
    };
  },
});

const rollback = defineTool({
  number: 18,
  stateful: true,
  limitation: "Puntos de control en memoria del proceso; no persiste entre reinicios. No guardes secretos en el estado.",
  inputSchema: z.object({
    action: z.enum(["create", "list", "rollback", "delete"]),
    checkpointId: idStr().optional(),
    label: txt(200).optional(),
    state: z.unknown().optional(),
  }).strict(),
  example: { action: "create", checkpointId: "demo-1", label: "Antes del cambio", state: { version: 4, flags: { beta: false } } },
  handler: (input) => {
    if (input.action === "list") {
      return { summary: `${checkpoints.size} puntos de control.`, data: { checkpoints: [...checkpoints.entries()].map(([id, c]) => ({ checkpointId: id, label: c.label, createdAt: c.createdAt, hash: c.hash })) } };
    }
    if (!input.checkpointId) fail("INVALID_INPUT");
    if (input.action === "create") {
      if (input.state === undefined) fail("INVALID_INPUT");
      const stateStr = canonicalStringify(input.state).toLowerCase();
      if (/token|password|secret|credential|apikey/.test(stateStr)) fail("INVALID_INPUT");
      const hash = sha256Hex(canonicalStringify(input.state));
      checkpoints.set(input.checkpointId!, { label: input.label ?? "", state: input.state, createdAt: new Date().toISOString(), hash });
      evictOldest(checkpoints);
      return { summary: `Punto de control ${input.checkpointId} creado.`, data: { checkpointId: input.checkpointId, hash, createdAt: checkpoints.get(input.checkpointId!)!.createdAt } };
    }
    const found = checkpoints.get(input.checkpointId!);
    if (!found) fail("NOT_FOUND");
    if (input.action === "delete") {
      checkpoints.delete(input.checkpointId!);
      return { summary: `Punto de control ${input.checkpointId} eliminado.`, data: { checkpointId: input.checkpointId, deleted: true } };
    }
    const integrityOk = sha256Hex(canonicalStringify(found!.state)) === found!.hash;
    return {
      summary: integrityOk ? `Estado restaurado desde ${input.checkpointId} (integridad verificada).` : "El punto de control no supera la verificación de integridad.",
      data: { checkpointId: input.checkpointId, label: found!.label, createdAt: found!.createdAt, integrityOk, state: found!.state },
    };
  },
});

const faultIsolation = defineTool({
  number: 19,
  inputSchema: z.object({
    components: z.array(z.object({ id: idStr(), healthy: z.boolean(), dependsOn: z.array(idStr()).max(100).optional() })).min(1).max(500),
  }).strict(),
  example: { components: [{ id: "db", healthy: false }, { id: "api", healthy: false, dependsOn: ["db"] }, { id: "web", healthy: true, dependsOn: ["api"] }, { id: "cache", healthy: true }] },
  handler: (input) => {
    const byId = new Map(input.components.map((c) => [c.id, c]));
    const graph = analyzeGraph(input.components);
    const originFaults = input.components
      .filter((c) => !c.healthy && (c.dependsOn ?? []).every((d) => byId.get(d)?.healthy !== false))
      .map((c) => c.id);
    const impacted = new Set<string>();
    const queue = [...input.components.filter((c) => !c.healthy).map((c) => c.id)];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const dependent of graph.dependents[cur] ?? []) {
        if (!impacted.has(dependent)) { impacted.add(dependent); queue.push(dependent); }
      }
    }
    const safeToKeepRunning = input.components.filter((c) => c.healthy && !impacted.has(c.id)).map((c) => c.id);
    return {
      summary: `fallos de origen: ${originFaults.join(", ") || "ninguno claro"}; ${safeToKeepRunning.length} componentes pueden seguir operando.`,
      data: { originFaults, unhealthy: input.components.filter((c) => !c.healthy).map((c) => c.id), impactedDependents: [...impacted].filter((id: any) => byId.get(id)?.healthy), safeToKeepRunning, isolationPlan: originFaults.map((id) => `Aislar ${id}: detener su tráfico sin apagar ${safeToKeepRunning.join(", ") || "el resto"}.`) },
    };
  },
});

const repairValidation = defineTool({
  number: 20,
  inputSchema: z.object({
    checks: z.array(z.object({
      id: idStr(), name: txt(300).optional(),
      kind: z.enum(["equals", "not_equals", "contains", "gte", "lte", "truthy"]),
      expected: z.unknown().optional(), actual: z.unknown(),
    })).min(1).max(500),
  }).strict(),
  example: { checks: [{ id: "h1", name: "API sana", kind: "equals", expected: "ok", actual: "ok" }, { id: "h2", name: "Errores bajo umbral", kind: "lte", expected: 0.05, actual: 0.01 }] },
  handler: (input) => {
    const results = input.checks.map((c) => {
      let passed: boolean;
      switch (c.kind) {
        case "equals": passed = canonicalStringify(c.actual) === canonicalStringify(c.expected); break;
        case "not_equals": passed = canonicalStringify(c.actual) !== canonicalStringify(c.expected); break;
        case "contains": passed = typeof c.actual === "string" && typeof c.expected === "string" && c.actual.includes(c.expected); break;
        case "gte": passed = typeof c.actual === "number" && typeof c.expected === "number" && c.actual >= c.expected; break;
        case "lte": passed = typeof c.actual === "number" && typeof c.expected === "number" && c.actual <= c.expected; break;
        case "truthy": passed = Boolean(c.actual); break;
      }
      return { id: c.id, name: c.name ?? c.id, passed };
    });
    const failed = results.filter((r) => !r.passed);
    return {
      summary: failed.length === 0 ? "Reparación validada: todas las comprobaciones pasan." : `La reparación no queda validada: ${failed.length} comprobaciones fallan.`,
      data: { validated: failed.length === 0, passedCount: results.length - failed.length, failedCount: failed.length, results },
    };
  },
});

export const f02: LocalToolDefinition[] = [healthDiagnoser, repairPlanner, retryController, taskRecovery, rootCause, regressionDetector, circuitBreaker, rollback, faultIsolation, repairValidation];
