/** Familia 17 — Observabilidad, métricas y rendimiento (herramientas 161-170). */
import { z } from "zod";
import { describe, iqrOutliers, linearRegression, round, sum, zScoreOutliers } from "../engines/stats.js";
import { telemetryEvents } from "../state/stores.js";
import { defineTool, fail, idStr, strArr, txt, type LocalToolDefinition } from "./types.js";

const MAX_TELEMETRY = 5_000;

const telemetryCollector = defineTool({
  number: 161,
  stateful: true,
  limitation: "Búfer en memoria con tope de 5000 eventos: para uso operativo dentro de la sesión, no un sistema de métricas persistente.",
  inputSchema: z.object({
    action: z.enum(["ingest", "query", "clear"]),
    events: z.array(z.object({ name: idStr(), value: z.number().finite(), at: txt(50).optional(), tags: z.record(z.string(), z.string().max(100)).optional() })).max(1_000).optional(),
    metricName: idStr().optional(),
  }).strict(),
  example: { action: "ingest", events: [{ name: "http.latency_ms", value: 120, tags: { route: "/api/health" } }, { name: "http.latency_ms", value: 180 }] },
  handler: (input) => {
    if (input.action === "clear") {
      const removed = telemetryEvents.length;
      telemetryEvents.length = 0;
      return { summary: `Búfer vaciado (${removed} eventos).`, data: { removed } };
    }
    if (input.action === "ingest") {
      if (!input.events?.length) fail("INVALID_INPUT");
      for (const event of input.events) telemetryEvents.push({ name: event.name, value: event.value, at: event.at ?? new Date().toISOString(), tags: event.tags ?? {} });
      while (telemetryEvents.length > MAX_TELEMETRY) telemetryEvents.shift();
      return { summary: `${input.events.length} eventos ingeridos; búfer con ${telemetryEvents.length}.`, data: { bufferedEvents: telemetryEvents.length, metricNames: [...new Set(telemetryEvents.map((e) => e.name))].slice(0, 100) } };
    }
    const names = [...new Set(telemetryEvents.map((e) => e.name))];
    const aggregates = names
      .filter((name) => !input.metricName || name === input.metricName)
      .map((name) => ({ metric: name, ...describe(telemetryEvents.filter((e) => e.name === name).map((e) => e.value)) }));
    return { summary: `${aggregates.length} métricas agregadas desde el búfer.`, data: { aggregates } };
  },
});

const logAnalyzer = defineTool({
  number: 162,
  inputSchema: z.object({ lines: strArr(5_000, 10_000) }).strict(),
  example: { lines: ["{\"ts\":\"2026-10-19T10:00:00Z\",\"level\":\"info\",\"event\":\"start\"}", "{\"ts\":\"2026-10-19T10:01:00Z\",\"level\":\"error\",\"event\":\"tool_error\",\"code\":\"UPSTREAM_TIMEOUT\"}", "{\"ts\":\"2026-10-19T10:02:00Z\",\"level\":\"error\",\"event\":\"tool_error\",\"code\":\"UPSTREAM_TIMEOUT\"}", "línea no estructurada"] },
  handler: (input) => {
    let parsed = 0;
    const byLevel = new Map<string, number>();
    const byEvent = new Map<string, number>();
    const byCode = new Map<string, number>();
    const timestamps: string[] = [];
    const errorSamples: string[] = [];
    for (const line of input.lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        parsed += 1;
        if (typeof obj.level === "string") byLevel.set(obj.level, (byLevel.get(obj.level) ?? 0) + 1);
        if (typeof obj.event === "string") byEvent.set(obj.event, (byEvent.get(obj.event) ?? 0) + 1);
        if (typeof obj.code === "string") byCode.set(obj.code, (byCode.get(obj.code) ?? 0) + 1);
        if (typeof obj.ts === "string") timestamps.push(obj.ts);
        if (obj.level === "error" || obj.level === "fatal") errorSamples.push(line.slice(0, 200));
      } catch { /* línea no JSON: se contabiliza abajo */ }
    }
    const errorTotal = (byLevel.get("error") ?? 0) + (byLevel.get("fatal") ?? 0);
    const topErrors = [...byCode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, count }));
    return {
      summary: `${parsed}/${input.lines.length} líneas JSON analizadas; ${errorTotal} errores (${topErrors[0] ? `top: ${topErrors[0].code}` : "sin códigos"}).`,
      data: { parsedLines: parsed, unparsedLines: input.lines.length - parsed, byLevel: Object.fromEntries(byLevel), byEvent: Object.fromEntries(byEvent), errorCodes: topErrors, errorRatePct: parsed > 0 ? round((errorTotal / parsed) * 100, 1) : 0, timeRange: timestamps.length ? { from: [...timestamps].sort()[0], until: [...timestamps].sort().at(-1) } : null, errorSamples: errorSamples.slice(0, 5) },
    };
  },
});

const traceCorrelator = defineTool({
  number: 163,
  inputSchema: z.object({
    spans: z.array(z.object({ traceId: idStr(), spanId: idStr(), parentId: idStr().optional(), service: idStr(), name: txt(200), startMs: z.number().nonnegative(), durationMs: z.number().nonnegative(), status: z.enum(["ok", "error"]).optional() })).min(1).max(10_000),
  }).strict(),
  example: { spans: [{ traceId: "t1", spanId: "s1", service: "api", name: "POST /render", startMs: 0, durationMs: 500 }, { traceId: "t1", spanId: "s2", parentId: "s1", service: "worker", name: "encode", startMs: 50, durationMs: 400 }, { traceId: "t1", spanId: "s3", parentId: "fantasma", service: "api", name: "huerfano", startMs: 0, durationMs: 5 }] },
  handler: (input) => {
    const byTrace = new Map<string, typeof input.spans>();
    for (const span of input.spans) byTrace.set(span.traceId, [...(byTrace.get(span.traceId) ?? []), span]);
    const traces = [...byTrace.entries()].map(([traceId, spans]) => {
      const ids = new Set(spans.map((s) => s.spanId));
      const start = Math.min(...spans.map((s) => s.startMs));
      const end = Math.max(...spans.map((s) => s.startMs + s.durationMs));
      const slowest = [...spans].sort((a, b) => b.durationMs - a.durationMs)[0];
      return {
        traceId, spanCount: spans.length, services: [...new Set(spans.map((s) => s.service))],
        totalDurationMs: round(end - start, 2), errorSpans: spans.filter((s) => s.status === "error").map((s) => s.spanId),
        orphanSpans: spans.filter((s) => s.parentId && !ids.has(s.parentId)).map((s) => s.spanId),
        rootSpans: spans.filter((s) => !s.parentId).map((s) => s.spanId),
        slowestSpan: { spanId: slowest.spanId, service: slowest.service, name: slowest.name, durationMs: slowest.durationMs, sharePct: end > start ? round((slowest.durationMs / (end - start)) * 100, 1) : 100 },
      };
    }).sort((a, b) => b.totalDurationMs - a.totalDurationMs);
    return {
      summary: `${traces.length} trazas correlacionadas; la más lenta ${traces[0]?.traceId ?? "-"} (${traces[0]?.totalDurationMs ?? 0} ms).`,
      data: { traces: traces.slice(0, 100) },
    };
  },
});

const bottleneckFinder = defineTool({
  number: 164,
  inputSchema: z.object({
    stages: z.array(z.object({ name: idStr(), durationMs: z.number().nonnegative(), calls: z.number().int().positive().optional(), resourceCost: z.number().nonnegative().optional() })).min(1).max(1_000),
  }).strict(),
  example: { stages: [{ name: "auth", durationMs: 30 }, { name: "consulta_bd", durationMs: 420, calls: 3 }, { name: "render", durationMs: 80 }] },
  handler: (input) => {
    const totals = input.stages.map((s) => ({ ...s, totalMs: round(s.durationMs * (s.calls ?? 1), 2) }));
    const sumMs = sum(totals.map((t) => t.totalMs)) || 1;
    const ranked = totals.map((t) => ({ name: t.name, totalMs: t.totalMs, sharePct: round((t.totalMs / sumMs) * 100, 1), calls: t.calls ?? 1 })).sort((a, b) => b.sharePct - a.sharePct);
    const top = ranked[0];
    return {
      summary: `Cuello principal: ${top.name} (${top.sharePct}% del tiempo). Reducirlo a la mitad ahorraría ~${round(top.totalMs / 2, 1)} ms.`,
      data: { stages: ranked, totalMs: round(sumMs, 2), optimizationImpact: ranked.map((r) => ({ stage: r.name, ifHalvedSavesMs: round(r.totalMs / 2, 1), newTotalMs: round(sumMs - r.totalMs / 2, 1) })), recommendation: top.calls > 1 ? `«${top.name}» se llama ${top.calls} veces: agrupar o cachear puede rendir más que optimizar cada llamada.` : `Concentra el esfuerzo en «${top.name}» antes que en el resto.` },
    };
  },
});

const sloMonitor = defineTool({
  number: 165,
  inputSchema: z.object({
    objectives: z.array(z.object({
      name: idStr(), targetPct: z.number().gt(0).max(100),
      totalEvents: z.number().int().nonnegative(), failedEvents: z.number().int().nonnegative(),
      windowDays: z.number().positive().max(366).optional(), elapsedWindowDays: z.number().nonnegative().max(366).optional(),
    })).min(1).max(100),
  }).strict(),
  example: { objectives: [{ name: "disponibilidad_api", targetPct: 99.9, totalEvents: 100000, failedEvents: 160, windowDays: 30, elapsedWindowDays: 12 }] },
  handler: (input) => {
    const results = input.objectives.map((o) => {
      const observedPct = o.totalEvents > 0 ? round((1 - o.failedEvents / o.totalEvents) * 100, 4) : 100;
      const budgetEvents = Math.floor(o.totalEvents * (1 - o.targetPct / 100));
      const remaining = budgetEvents - o.failedEvents;
      const consumedPctOfBudget = budgetEvents > 0 ? round((o.failedEvents / budgetEvents) * 100, 1) : 100;
      const windowDays = o.windowDays ?? 30;
      const elapsed = o.elapsedWindowDays ?? windowDays;
      const burnAcceleration = elapsed > 0 ? round((consumedPctOfBudget / 100) / (elapsed / windowDays), 2) : 0;
      return { name: o.name, observedPct, targetPct: o.targetPct, meeting: observedPct >= o.targetPct, errorBudgetEvents: budgetEvents, remainingErrorBudget: remaining, consumedBudgetPct: consumedPctOfBudget, burnRateVsWindow: burnAcceleration, alert: remaining < 0 ? "presupuesto_excedido" : burnAcceleration >= 2 ? "quema_acelerada" : consumedPctOfBudget > 75 ? "presupuesto_bajo" : "ninguna" };
    });
    return {
      summary: `${results.filter((r) => r.meeting).length}/${results.length} objetivos dentro de su SLO.`,
      data: { objectives: results },
    };
  },
});

const anomalyDetection = defineTool({
  number: 166,
  inputSchema: z.object({
    values: z.array(z.number().finite()).min(3).max(100_000),
    timestamps: strArr(100_000, 50).optional(),
    method: z.enum(["zscore", "iqr", "both"]).optional(),
    zThreshold: z.number().positive().max(10).optional(),
  }).strict(),
  example: { values: [100, 102, 98, 101, 99, 100, 450, 102] },
  handler: (input) => {
    if (input.timestamps && input.timestamps.length !== input.values.length) fail("INVALID_INPUT");
    const method = input.method ?? "both";
    const found = new Map<number, { index: number; value: number; methods: string[]; at: string | null }>();
    const add = (index: number, label: string) => {
      const existing = found.get(index);
      if (existing) existing.methods.push(label);
      else found.set(index, { index, value: input.values[index], methods: [label], at: input.timestamps?.[index] ?? null });
    };
    if (method === "zscore" || method === "both") zScoreOutliers(input.values, input.zThreshold ?? 2.5).forEach((o) => add(o.index, `zscore=${o.zScore}`));
    if (method === "iqr" || method === "both") iqrOutliers(input.values).forEach((o) => add(o.index, `iqr_${o.fence}`));
    return {
      summary: `${found.size} anomalías en ${input.values.length} muestras (${[...found.values()].filter((f) => f.methods.length > 1).length} confirmadas por dos métodos).`,
      data: { summaryStats: describe(input.values), anomalies: [...found.values()].sort((a, b) => a.index - b.index).slice(0, 200), method },
    };
  },
});

const dashboardBuilder = defineTool({
  number: 167,
  inputSchema: z.object({
    title: txt(200).optional(),
    metrics: z.array(z.object({ name: idStr(), label: txt(200).optional(), value: z.number().finite(), unit: txt(50).optional(), target: z.number().finite().optional(), direction: z.enum(["higher_is_better", "lower_is_better"]).optional() })).min(1).max(200),
  }).strict(),
  example: { title: "Operación semanal", metrics: [{ name: "uptime", label: "Disponibilidad", value: 99.95, unit: "%", target: 99.9, direction: "higher_is_better" }, { name: "p95_ms", label: "Latencia p95", value: 420, unit: "ms", target: 300, direction: "lower_is_better" }] },
  handler: (input) => {
    const panels = input.metrics.map((m, i) => {
      const meets = m.target === undefined ? null : (m.direction ?? "higher_is_better") === "higher_is_better" ? m.value >= m.target : m.value <= m.target;
      return { id: m.name, title: m.label ?? m.name, type: m.unit === "%" ? "gauge" : "stat", value: m.value, unit: m.unit ?? null, target: m.target ?? null, status: meets === null ? "sin_objetivo" : meets ? "ok" : "alerta", position: { row: Math.floor(i / 3), col: (i % 3) + 1 } };
    });
    const alerts = panels.filter((p) => p.status === "alerta");
    return {
      summary: `Tablero «${input.title ?? "Operación"}»: ${panels.length} paneles, ${alerts.length} en alerta.`,
      data: { dashboard: { title: input.title ?? "Operación", generatedFrom: "metricas aportadas por el llamante", overallStatus: alerts.length === 0 ? "ok" : "degradado", panels, refreshHintSeconds: 60 } },
    };
  },
});

const incidentTriage = defineTool({
  number: 168,
  inputSchema: z.object({
    incidents: z.array(z.object({
      id: idStr(), title: txt(300).optional(),
      affectedUsers: z.number().int().nonnegative().optional(), serviceDown: z.boolean().optional(),
      errorRatePct: z.number().min(0).max(100).optional(), revenueImpact: z.boolean().optional(),
      durationMinutes: z.number().nonnegative().optional(), securityRelated: z.boolean().optional(),
    })).min(1).max(500),
  }).strict(),
  example: { incidents: [{ id: "inc-1", title: "Login caído", serviceDown: true, affectedUsers: 2000 }, { id: "inc-2", title: "Informe lento", affectedUsers: 20, errorRatePct: 2, durationMinutes: 180 }] },
  handler: (input) => {
    const triaged = input.incidents.map((incident) => {
      let score = 0;
      if (incident.serviceDown) score += 50;
      if (incident.securityRelated) score += 40;
      if (incident.revenueImpact) score += 25;
      score += Math.min(20, ((incident.affectedUsers ?? 0) / 1000) * 10);
      score += Math.min(15, incident.errorRatePct ?? 0);
      score += Math.min(10, ((incident.durationMinutes ?? 0) / 60) * 2);
      score = Math.min(100, round(score, 1));
      const priority = score >= 70 ? "P1" : score >= 40 ? "P2" : score >= 20 ? "P3" : "P4";
      return { id: incident.id, title: incident.title ?? incident.id, score, priority, suggestedResponseMinutes: priority === "P1" ? 15 : priority === "P2" ? 60 : priority === "P3" ? 480 : 1440, evidenceChecklist: ["Marca de tiempo de inicio y primera señal", "Alcance: usuarios y servicios afectados", "Cambios recientes relacionados", "Estado actual y mitigación en curso"] };
    }).sort((a, b) => b.score - a.score);
    return {
      summary: `Cola ordenada: primero ${triaged[0].id} (${triaged[0].priority}).`,
      data: { incidents: triaged, countsByPriority: { P1: triaged.filter((t) => t.priority === "P1").length, P2: triaged.filter((t) => t.priority === "P2").length, P3: triaged.filter((t) => t.priority === "P3").length, P4: triaged.filter((t) => t.priority === "P4").length } },
    };
  },
});

const capacityForecast = defineTool({
  number: 169,
  inputSchema: z.object({
    history: z.array(z.object({ period: idStr(), value: z.number().nonnegative() })).min(3).max(5_000),
    capacityLimit: z.number().positive(),
    horizonPeriods: z.number().int().min(1).max(365),
  }).strict(),
  example: { history: [{ period: "2026-06", value: 120 }, { period: "2026-07", value: 135 }, { period: "2026-08", value: 150 }, { period: "2026-09", value: 168 }, { period: "2026-10", value: 181 }], capacityLimit: 300, horizonPeriods: 8 },
  handler: (input) => {
    const regression = linearRegression(input.history.map((h, i) => ({ x: i, y: h.value })));
    const forecast = Array.from({ length: input.horizonPeriods }, (_, i) => {
      const index = input.history.length + i;
      return { periodIndex: index, afterLastPeriod: i + 1, projected: round(regression.predict(index), 2) };
    });
    const hitsLimit = regression.slope > 0 ? (input.capacityLimit - regression.intercept) / regression.slope : null;
    return {
      summary: `Tendencia ${regression.slope >= 0 ? "+" : ""}${round(regression.slope, 2)} por periodo (R²=${round(regression.r2, 2)}); límite ${hitsLimit !== null && hitsLimit > input.history.length - 1 ? `en ~${Math.ceil(hitsLimit - (input.history.length - 1))} periodos` : "sin cruce a la vista"}.`,
      data: { slopePerPeriod: round(regression.slope, 4), r2: round(regression.r2, 4), forecast, periodsUntilLimit: hitsLimit !== null && hitsLimit > input.history.length - 1 ? Math.ceil(hitsLimit - (input.history.length - 1)) : null, currentUsagePctOfLimit: round((input.history.at(-1)!.value / input.capacityLimit) * 100, 1), caution: "Extrapolación lineal: ignora estacionalidad y cambios de régimen. R² bajo = baja confianza." },
    };
  },
});

const operationalReport = defineTool({
  number: 170,
  inputSchema: z.object({
    periodLabel: txt(200),
    health: z.object({ uptimePct: z.number().min(0).max(100).optional(), totalChecks: z.number().int().nonnegative().optional(), failedChecks: z.number().int().nonnegative().optional() }).strict().optional(),
    errors: z.array(z.object({ code: idStr(), count: z.number().int().nonnegative() })).max(100).optional(),
    performance: z.object({ p50Ms: z.number().nonnegative().optional(), p95Ms: z.number().nonnegative().optional(), slowestStage: txt(200).optional() }).strict().optional(),
    costs: z.array(z.object({ concept: txt(200), amount: z.number().nonnegative() })).max(100).optional(),
    notes: strArr(20, 1_000).optional(),
  }).strict(),
  example: { periodLabel: "Semana 42", health: { uptimePct: 99.95, totalChecks: 10080, failedChecks: 5 }, errors: [{ code: "UPSTREAM_TIMEOUT", count: 12 }, { code: "FORBIDDEN", count: 3 }], performance: { p50Ms: 90, p95Ms: 340, slowestStage: "consulta_bd" }, costs: [{ concept: "renders", amount: 42.5 }] },
  handler: (input) => {
    const errors = [...(input.errors ?? [])].sort((a, b) => b.count - a.count);
    const lines: string[] = [`# Informe operativo — ${input.periodLabel}`];
    lines.push("", "## Salud");
    lines.push(input.health ? `- Disponibilidad declarada: ${input.health.uptimePct ?? "s/d"}%${input.health.totalChecks ? ` (${input.health.failedChecks ?? 0}/${input.health.totalChecks} comprobaciones fallidas)` : ""}` : "- Sin datos de salud aportados.");
    lines.push("", "## Errores");
    if (errors.length === 0) lines.push("- Sin errores registrados en los datos aportados.");
    else {
      lines.push("| Código | Ocurrencias |", "|---|---|");
      for (const e of errors.slice(0, 10)) lines.push(`| ${e.code} | ${e.count} |`);
    }
    lines.push("", "## Rendimiento");
    lines.push(input.performance ? `- p50: ${input.performance.p50Ms ?? "s/d"} ms · p95: ${input.performance.p95Ms ?? "s/d"} ms · Etapa dominante: ${input.performance.slowestStage ?? "s/d"}` : "- Sin datos de rendimiento.");
    lines.push("", "## Costes");
    if ((input.costs ?? []).length === 0) lines.push("- Sin costes aportados.");
    else {
      for (const c of input.costs!) lines.push(`- ${c.concept}: ${c.amount}`);
      lines.push(`- **Total: ${round(sum((input.costs ?? []).map((c) => c.amount)), 2)}**`);
    }
    if (input.notes?.length) { lines.push("", "## Notas"); for (const n of input.notes) lines.push(`- ${n}`); }
    lines.push("", `_Informe generado localmente desde los datos aportados; sin contacto con sistemas externos._`);
    return {
      summary: `Informe ${input.periodLabel} generado (${lines.length} líneas Markdown).`,
      data: { markdown: lines.join("\n"), highlights: { topError: errors[0] ?? null, totalErrorCount: sum(errors.map((e) => e.count)), totalCost: round(sum((input.costs ?? []).map((c) => c.amount)), 2) } },
    };
  },
});

export const f17: LocalToolDefinition[] = [telemetryCollector, logAnalyzer, traceCorrelator, bottleneckFinder, sloMonitor, anomalyDetection, dashboardBuilder, incidentTriage, capacityForecast, operationalReport];
