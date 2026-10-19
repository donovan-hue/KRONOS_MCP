/**
 * Familia 15 — Proveedores, costes y capacidad (herramientas 141-150).
 * "Sin proveedores" en esta entrega significa: ninguna llamada externa.
 * Estas herramientas gestionan catálogos, cuotas y decisiones con los
 * datos que declara el llamante (la capa queda lista para adaptadores).
 */
import { z } from "zod";
import { paretoFront, rankCandidates } from "../engines/scoring.js";
import { percentile, round, sum } from "../engines/stats.js";
import { capabilityRegistryStore, evictOldest, priceCatalog, quotaWindows } from "../state/stores.js";
import { defineTool, fail, idStr, numRec, strArr, txt, type LocalToolDefinition } from "./types.js";

const priceCatalogTool = defineTool({
  number: 141,
  stateful: true,
  limitation: "Catálogo de precios declarado por el llamante, en memoria: no consulta tarifas reales de ningún proveedor.",
  inputSchema: z.object({
    action: z.enum(["upsert", "list", "quote"]),
    providerId: idStr().optional(),
    prices: z.array(z.object({ unit: txt(100), price: z.number().nonnegative(), currency: z.string().min(3).max(5).optional() })).max(200).optional(),
    usage: z.record(z.string(), z.number().nonnegative()).optional(),
  }).strict(),
  example: { action: "upsert", providerId: "prov-demo", prices: [{ unit: "imagen", price: 0.04, currency: "USD" }, { unit: "minuto_voz", price: 0.02, currency: "USD" }] },
  handler: (input) => {
    if (input.action === "list") {
      return { summary: `${priceCatalog.size} proveedores en el tarifario local.`, data: { providers: [...priceCatalog.entries()].map(([providerId, prices]) => ({ providerId, prices })) } };
    }
    if (!input.providerId) fail("INVALID_INPUT");
    if (input.action === "upsert") {
      if (!input.prices?.length) fail("INVALID_INPUT");
      const existing = new Map((priceCatalog.get(input.providerId!) ?? []).map((p) => [p.unit, p]));
      for (const price of input.prices) existing.set(price.unit, { ...price, currency: price.currency ?? "USD", updatedAt: new Date().toISOString() });
      priceCatalog.set(input.providerId!, [...existing.values()]);
      evictOldest(priceCatalog);
      return { summary: `Tarifario de ${input.providerId} actualizado (${existing.size} unidades).`, data: { providerId: input.providerId, prices: [...existing.values()] } };
    }
    if (!input.usage || Object.keys(input.usage).length === 0) fail("INVALID_INPUT");
    const prices = priceCatalog.get(input.providerId!);
    if (!prices) fail("NOT_FOUND");
    const byUnit = new Map(prices!.map((p) => [p.unit, p]));
    const lines = Object.entries(input.usage!).map(([unit, units]) => {
      const price = byUnit.get(unit);
      return { unit, units, unitPrice: price?.price ?? null, subtotal: price ? round(price.price * units, 4) : null };
    });
    const missing = lines.filter((l) => l.subtotal === null).map((l) => l.unit);
    return { summary: `Presupuesto para ${input.providerId}: ${round(sum(lines.map((l) => l.subtotal ?? 0)), 4)} (moneda según cada tarifa).`, data: { lines, total: round(sum(lines.map((l) => l.subtotal ?? 0)), 4), missingPrices: missing } };
  },
});

const providerOptimizer = defineTool({
  number: 142,
  inputSchema: z.object({
    providers: z.array(z.object({ id: idStr(), metrics: numRec() })).min(1).max(200),
    weights: numRec().optional(),
    minimize: strArr(50, 100).optional(),
    maximize: strArr(50, 100).optional(),
    constraints: z.record(z.string(), z.object({ min: z.number().finite().optional(), max: z.number().finite().optional() }).strict()).optional(),
  }).strict(),
  example: { providers: [{ id: "a", metrics: { quality: 9, cost: 0.5, latencySec: 5 } }, { id: "b", metrics: { quality: 7, cost: 0.1, latencySec: 2 } }], minimize: ["cost", "latencySec"], maximize: ["quality"], constraints: { cost: { max: 0.6 } } },
  handler: (input) => {
    const constraints = input.constraints ?? {};
    const feasible = input.providers.filter((p) => Object.entries(constraints).every(([key, range]) => {
      const value = p.metrics[key];
      if (value === undefined) return false;
      return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
    }));
    const ranked = rankCandidates(feasible.map((p) => ({ id: p.id, metrics: p.metrics })), input.weights ?? {}, input.minimize ?? []);
    return {
      summary: ranked.length > 0 ? `Óptimo calidad/coste según pesos: ${ranked[0].id}.` : "Ningún proveedor cumple las restricciones.",
      data: { recommended: ranked[0]?.id ?? null, ranking: ranked, paretoOptimal: paretoFront(feasible.map((p) => ({ id: p.id, metrics: p.metrics })), input.maximize ?? [], input.minimize ?? []), excludedByConstraints: input.providers.filter((p) => !feasible.includes(p)).map((p) => p.id) },
    };
  },
});

const availabilityMonitor = defineTool({
  number: 143,
  limitation: "Calcula disponibilidad desde las comprobaciones aportadas; no sondea proveedores.",
  inputSchema: z.object({
    checks: z.array(z.object({ providerId: idStr(), timestamp: txt(50), ok: z.boolean(), latencyMs: z.number().nonnegative().optional(), errorCode: txt(100).optional() })).min(1).max(50_000),
    degradedBelowUptimePct: z.number().min(0).max(100).optional(),
  }).strict(),
  example: { checks: [{ providerId: "a", timestamp: "2026-10-19T10:00:00Z", ok: true, latencyMs: 120 }, { providerId: "a", timestamp: "2026-10-19T10:05:00Z", ok: false, errorCode: "UPSTREAM_TIMEOUT" }, { providerId: "b", timestamp: "2026-10-19T10:00:00Z", ok: true, latencyMs: 80 }] },
  handler: (input) => {
    const threshold = input.degradedBelowUptimePct ?? 99;
    const groups = new Map<string, typeof input.checks>();
    for (const check of input.checks) groups.set(check.providerId, [...(groups.get(check.providerId) ?? []), check]);
    const providers = [...groups.entries()].map(([providerId, checks]) => {
      const okCount = checks.filter((c) => c.ok).length;
      const uptimePct = round((okCount / checks.length) * 100, 2);
      const latencies = checks.filter((c) => c.latencyMs !== undefined).map((c) => c.latencyMs!);
      const last = [...checks].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      const errors = new Map<string, number>();
      for (const c of checks) if (!c.ok) errors.set(c.errorCode ?? "ERROR", (errors.get(c.errorCode ?? "ERROR") ?? 0) + 1);
      return { providerId, checks: checks.length, uptimePct, status: last.ok === false ? "down_now" : uptimePct < threshold ? "degraded" : "up", p95LatencyMs: latencies.length ? round(percentile(latencies, 95), 1) : null, lastCheckAt: last.timestamp, lastOk: last.ok, errorBreakdown: Object.fromEntries(errors) };
    }).sort((a, b) => b.uptimePct - a.uptimePct);
    return { summary: `${providers.filter((p) => p.status === "up").length}/${providers.length} proveedores por encima del ${threshold}% de disponibilidad.`, data: { providers } };
  },
});

const quotaManager = defineTool({
  number: 144,
  stateful: true,
  limitation: "Ventanas fijas en memoria por clave dentro de este proceso; no comparte cuota entre instancias del servidor.",
  inputSchema: z.object({
    action: z.enum(["configure", "consume", "status", "reset"]),
    key: idStr(),
    limit: z.number().int().positive().max(1_000_000_000).optional(),
    windowSeconds: z.number().int().positive().max(2_592_000).optional(),
    units: z.number().int().positive().max(1_000_000_000).optional(),
    at: txt(50).optional(),
  }).strict(),
  example: { action: "configure", key: "demo:prov-a", limit: 100, windowSeconds: 3600 },
  handler: (input) => {
    const now = input.at ? new Date(input.at).getTime() : Date.now();
    if (Number.isNaN(now)) fail("INVALID_INPUT");
    if (input.action === "configure") {
      if (!input.limit || !input.windowSeconds) fail("INVALID_INPUT");
      quotaWindows.set(input.key, { limit: input.limit!, windowSeconds: input.windowSeconds!, windowStart: now, used: 0 });
      evictOldest(quotaWindows);
    }
    const window_ = quotaWindows.get(input.key);
    if (!window_) fail("NOT_CONFIGURED");
    if (now - window_!.windowStart >= window_!.windowSeconds * 1000) {
      window_!.windowStart = now;
      window_!.used = 0;
    }
    let allowed: boolean | null = null;
    if (input.action === "consume") {
      const units = input.units ?? 1;
      allowed = window_!.used + units <= window_!.limit;
      if (allowed) window_!.used += units;
    } else if (input.action === "reset") {
      window_!.used = 0;
      window_!.windowStart = now;
    }
    const current = quotaWindows.get(input.key)!;
    const resetAt = new Date(current.windowStart + current.windowSeconds * 1000).toISOString();
    return {
      summary: allowed === null ? `Cuota «${input.key}»: ${current.used}/${current.limit} en la ventana.` : allowed ? "Consumo permitido y registrado." : "Consumo DENEGADO: cuota agotada en esta ventana.",
      data: { key: input.key, allowed, used: current.used, remaining: current.limit - current.used, limit: current.limit, windowSeconds: current.windowSeconds, resetsAt: resetAt },
    };
  },
});

const fallbackRouter = defineTool({
  number: 145,
  inputSchema: z.object({
    requiredCapability: idStr(),
    primaryProviderId: idStr(),
    failedProviderIds: z.array(idStr()).max(100).optional(),
    failureKind: z.enum(["timeout", "rate_limited", "server_error", "auth", "validation", "quota"]).optional(),
    candidates: z.array(z.object({ id: idStr(), capabilities: strArr(100, 100), quality: z.number().min(0).max(10), costPerUnit: z.number().nonnegative(), available: z.boolean().optional(), priority: z.number().finite().optional() })).min(1).max(100),
  }).strict(),
  example: { requiredCapability: "image", primaryProviderId: "prov-a", failedProviderIds: ["prov-a"], failureKind: "timeout", candidates: [{ id: "prov-a", capabilities: ["image"], quality: 9, costPerUnit: 0.4 }, { id: "prov-b", capabilities: ["image"], quality: 7, costPerUnit: 0.2, available: true }] },
  handler: (input) => {
    const failed = new Set([input.primaryProviderId, ...(input.failedProviderIds ?? [])]);
    const retryPrimarySensible = input.failureKind === "timeout" || input.failureKind === "server_error" || input.failureKind === undefined;
    const compatible = input.candidates.filter((c) => c.available !== false && c.capabilities.includes(input.requiredCapability) && !failed.has(c.id));
    const ranked = rankCandidates(compatible.map((c) => ({ id: c.id, metrics: { quality: c.quality, costPerUnit: c.costPerUnit, priority: c.priority ?? 0 } })), { quality: 3, costPerUnit: 2, priority: 2 }, ["costPerUnit"]);
    return {
      summary: ranked.length > 0 ? `Fallback al proveedor ${ranked[0].id}.` : "Sin alternativa compatible disponible.",
      data: { fallback: ranked[0]?.id ?? null, ranking: ranked, adviseRetryPrimaryFirst: retryPrimarySensible, reason: input.failureKind === "auth" || input.failureKind === "validation" ? "El fallo no es del proveedor: cambiar de proveedor sin corregir credenciales/parámetros repetirá el error." : input.failureKind === "quota" || input.failureKind === "rate_limited" ? "Límite del principal: el fallback es la vía correcta hasta que se reinicie la ventana." : "Fallo transitorio: un reintento acotado y luego el fallback." },
    };
  },
});

const usageMetering = defineTool({
  number: 146,
  inputSchema: z.object({
    records: z.array(z.object({ taskId: idStr().optional(), provider: idStr(), units: z.number().nonnegative(), unit: txt(50), timestamp: txt(50).optional() })).min(1).max(50_000),
    prices: z.record(z.string(), z.record(z.string(), z.number().nonnegative())).optional(),
  }).strict(),
  example: { records: [{ taskId: "t1", provider: "prov-a", units: 4, unit: "imagen" }, { taskId: "t1", provider: "prov-a", units: 2, unit: "imagen" }, { taskId: "t2", provider: "prov-b", units: 10, unit: "segundo_video" }], prices: { "prov-a": { imagen: 0.04 }, "prov-b": { segundo_video: 0.1 } } },
  handler: (input) => {
    const byProvider = new Map<string, Map<string, number>>();
    const byTask = new Map<string, number>();
    let totalCost = 0;
    let priced = 0;
    for (const record of input.records) {
      const unitsByType = byProvider.get(record.provider) ?? new Map<string, number>();
      unitsByType.set(record.unit, (unitsByType.get(record.unit) ?? 0) + record.units);
      byProvider.set(record.provider, unitsByType);
      byTask.set(record.taskId ?? "sin_tarea", (byTask.get(record.taskId ?? "sin_tarea") ?? 0) + record.units);
      const price = input.prices?.[record.provider]?.[record.unit];
      if (price !== undefined) { totalCost += price * record.units; priced += 1; }
    }
    return {
      summary: `${input.records.length} registros medidos de ${byProvider.size} proveedores${priced > 0 ? `; coste total ${round(totalCost, 4)}` : ""}.`,
      data: { byProvider: [...byProvider.entries()].map(([provider, units]) => ({ provider, unitsByType: Object.fromEntries(units), totalUnits: round(sum([...units.values()]), 4) })), byTask: Object.fromEntries(byTask), totalCost: input.prices ? round(totalCost, 4) : null, unpricedRecords: input.records.length - priced },
    };
  },
});

const budgetGuardrail = defineTool({
  number: 147,
  inputSchema: z.object({
    budget: z.number().positive(),
    spentSoFar: z.number().nonnegative(),
    plannedCost: z.number().nonnegative().optional(),
    warnAtPercent: z.number().min(1).max(100).optional(),
    requireApprovalAtPercent: z.number().min(1).max(100).optional(),
  }).strict(),
  example: { budget: 100, spentSoFar: 72, plannedCost: 35 },
  handler: (input) => {
    const projected = input.spentSoFar + (input.plannedCost ?? 0);
    const warnAt = input.warnAtPercent ?? 80;
    const approvalAt = input.requireApprovalAtPercent ?? 95;
    const projectedPct = round((projected / input.budget) * 100, 1);
    const currentPct = round((input.spentSoFar / input.budget) * 100, 1);
    const action = projected > input.budget ? "block" : projectedPct >= approvalAt ? "require_approval" : projectedPct >= warnAt ? "allow_with_warning" : "allow";
    return {
      summary: `Presupuesto: ${currentPct}% gastado; con lo planeado ${projectedPct}% -> acción: ${action.replace(/_/g, " ")}.`,
      data: { action, currentPercent: currentPct, projectedPercent: projectedPct, remainingBefore: round(input.budget - input.spentSoFar, 4), projectedRemaining: round(input.budget - projected, 4), overBudgetBy: projected > input.budget ? round(projected - input.budget, 4) : 0, thresholds: { warnAtPercent: warnAt, requireApprovalAtPercent: approvalAt } },
    };
  },
});

const qualityScorecard = defineTool({
  number: 148,
  inputSchema: z.object({
    providers: z.array(z.object({
      id: idStr(), successes: z.number().int().nonnegative(), failures: z.number().int().nonnegative(),
      avgLatencyMs: z.number().nonnegative(), qualityScores: z.array(z.number().min(0).max(10)).max(10_000).optional(),
      costPerUnit: z.number().nonnegative().optional(),
    })).min(1).max(200),
  }).strict(),
  example: { providers: [{ id: "a", successes: 98, failures: 2, avgLatencyMs: 300, qualityScores: [9, 8, 9], costPerUnit: 0.4 }, { id: "b", successes: 80, failures: 20, avgLatencyMs: 120, qualityScores: [6, 7], costPerUnit: 0.05 }] },
  handler: (input) => {
    const scorecards = input.providers.map((p) => {
      const total = p.successes + p.failures;
      const successRate = total > 0 ? p.successes / total : 0;
      const quality = p.qualityScores?.length ? sum(p.qualityScores) / p.qualityScores.length : null;
      return { id: p.id, totalCalls: total, successRatePct: round(successRate * 100, 2), avgLatencyMs: p.avgLatencyMs, avgQuality: quality === null ? null : round(quality, 2), costPerUnit: p.costPerUnit ?? null, sampleWarning: total < 30 ? "Muestra pequeña: interpreta con cautela" : null };
    });
    const ranked = rankCandidates(scorecards.filter((s) => s.avgQuality !== null).map((s) => ({ id: s.id, metrics: { successRate: s.successRatePct, quality: s.avgQuality ?? 0, latencyMs: s.avgLatencyMs, costPerUnit: s.costPerUnit ?? 0 } })), { successRate: 3, quality: 3, latencyMs: 1, costPerUnit: 1 }, ["latencyMs", "costPerUnit"]);
    return {
      summary: ranked.length > 0 ? `Mejor expediente observado: ${ranked[0].id}.` : "Faltan puntuaciones de calidad para el ranking compuesto.",
      data: { scorecards, compositeRanking: ranked },
    };
  },
});

const apiCompatibilityTester = defineTool({
  number: 149,
  limitation: "Contrasta ejemplos de petición/respuesta contra la especificación declarada; no llama a la API del proveedor.",
  inputSchema: z.object({
    spec: z.object({
      authHeader: txt(100).optional(),
      requestFields: z.array(z.object({ name: idStr(), type: z.enum(["string", "number", "boolean", "array", "object"]), required: z.boolean() })).max(200),
      responseFields: z.array(z.object({ name: idStr(), type: z.enum(["string", "number", "boolean", "array", "object"]), required: z.boolean() })).max(200),
    }).strict(),
    sampleRequest: z.record(z.string(), z.unknown()),
    sampleResponse: z.record(z.string(), z.unknown()).optional(),
    requestHeaderNames: strArr(50, 100).optional(),
  }).strict(),
  example: { spec: { authHeader: "Authorization", requestFields: [{ name: "prompt", type: "string", required: true }, { name: "width", type: "number", required: false }], responseFields: [{ name: "id", type: "string", required: true }] }, sampleRequest: { width: "grande" }, sampleResponse: { id: 42 }, requestHeaderNames: ["Content-Type"] },
  handler: (input) => {
    const typeOf = (v: unknown) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    const checkFields = (fields: { name: string; type: string; required: boolean }[], sample: Record<string, unknown>, side: string) => {
      const issues: Record<string, unknown>[] = [];
      for (const field of fields) {
        if (!(field.name in sample)) { if (field.required) issues.push({ side, field: field.name, problem: "Falta el campo obligatorio" }); continue; }
        const actualType = typeOf(sample[field.name]);
        if (actualType !== field.type) issues.push({ side, field: field.name, problem: `Tipo esperado ${field.type}, encontrado ${actualType}` });
      }
      for (const key of Object.keys(sample)) if (!fields.some((f) => f.name === key)) issues.push({ side, field: key, problem: "Campo no declarado en la especificación" });
      return issues;
    };
    const issues = [
      ...(input.spec.authHeader && input.requestHeaderNames && !input.requestHeaderNames.some((h) => h.toLowerCase() === input.spec.authHeader!.toLowerCase()) ? [{ side: "request", field: input.spec.authHeader, problem: "Falta la cabecera de autenticación declarada (se comprueba solo el nombre, nunca el valor)" }] : []),
      ...checkFields(input.spec.requestFields, input.sampleRequest, "request"),
      ...(input.sampleResponse ? checkFields(input.spec.responseFields, input.sampleResponse, "response") : []),
    ];
    return {
      summary: issues.length === 0 ? "Compatibilidad verificada contra la especificación declarada." : `${issues.length} incompatibilidades detectadas.`,
      data: { compatible: issues.length === 0, issues },
    };
  },
});

const capabilityRegistry = defineTool({
  number: 150,
  stateful: true,
  limitation: "Registro en memoria poblado por el llamante: no descubre capacidades de proveedores automáticamente.",
  inputSchema: z.object({
    action: z.enum(["register", "list", "query"]),
    providerId: idStr().optional(),
    capabilities: z.array(z.object({ name: idStr(), version: txt(50).optional(), limits: z.record(z.string(), z.unknown()).optional() })).max(200).optional(),
    status: z.enum(["active", "degraded", "disabled"]).optional(),
    capabilityQuery: idStr().optional(),
  }).strict(),
  example: { action: "register", providerId: "prov-demo", capabilities: [{ name: "image", version: "2", limits: { maxWidth: 2048 } }], status: "active" },
  handler: (input) => {
    if (input.action === "register") {
      if (!input.providerId || !input.capabilities?.length) fail("INVALID_INPUT");
      capabilityRegistryStore.set(input.providerId!, { capabilities: input.capabilities!, status: input.status ?? "active", updatedAt: new Date().toISOString() });
      evictOldest(capabilityRegistryStore);
      return { summary: `Proveedor ${input.providerId} registrado con ${input.capabilities!.length} capacidades.`, data: { providerId: input.providerId, capabilities: input.capabilities, status: input.status ?? "active" } };
    }
    if (input.action === "query") {
      if (!input.capabilityQuery) fail("INVALID_INPUT");
      const matches = [...capabilityRegistryStore.entries()]
        .filter(([, entry]) => entry.status !== "disabled" && entry.capabilities.some((c) => c.name === input.capabilityQuery))
        .map(([providerId, entry]) => ({ providerId, status: entry.status, capability: entry.capabilities.find((c) => c.name === input.capabilityQuery) }));
      return { summary: `${matches.length} proveedores con la capacidad «${input.capabilityQuery}».`, data: { matches } };
    }
    return {
      summary: `${capabilityRegistryStore.size} proveedores registrados.`,
      data: { providers: [...capabilityRegistryStore.entries()].map(([providerId, entry]) => ({ providerId, status: entry.status, capabilities: entry.capabilities.map((c) => c.name), updatedAt: entry.updatedAt })) },
    };
  },
});

export const f15: LocalToolDefinition[] = [priceCatalogTool, providerOptimizer, availabilityMonitor, quotaManager, fallbackRouter, usageMetering, budgetGuardrail, qualityScorecard, apiCompatibilityTester, capabilityRegistry];
