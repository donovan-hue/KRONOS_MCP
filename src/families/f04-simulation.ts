/** Familia 04 — Simulación, consecuencias y decisiones (herramientas 31-40). */
import { z } from "zod";
import { analyzeGraph } from "../engines/graph.js";
import { paretoFront, rankCandidates } from "../engines/scoring.js";
import { round, sum } from "../engines/stats.js";
import { defineTool, idStr, numRec, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const consequenceSimulator = defineTool({
  number: 31,
  limitation: "Simula solo con los efectos y probabilidades declarados por el llamante; no predice efectos no listados.",
  inputSchema: z.object({
    action: reqText(1_000),
    effects: z.array(z.object({ description: txt(500), probability: z.number().min(0).max(1), impact: z.number().min(-10).max(10), scope: txt(200).optional() })).min(1).max(200),
  }).strict(),
  example: { action: "Activar la nueva caché", effects: [{ description: "Latencia -40%", probability: 0.8, impact: 6 }, { description: "Respuestas obsoletas ocasionales", probability: 0.3, impact: -4 }] },
  handler: (input) => {
    const evaluated = input.effects.map((e) => ({ ...e, expectedImpact: round(e.probability * e.impact, 2) }));
    const expected = round(sum(evaluated.map((e) => e.expectedImpact)), 2);
    const worst = Math.min(0, ...input.effects.filter((e) => e.impact < 0).map((e) => e.impact));
    const best = Math.max(0, ...input.effects.filter((e) => e.impact > 0).map((e) => e.impact));
    const redFlags = evaluated.filter((e) => e.impact <= -6 && e.probability >= 0.3);
    return {
      summary: `Impacto esperado ${expected > 0 ? "+" : ""}${expected} (mejor caso +${best}, peor ${worst}).`,
      data: { action: input.action, expectedImpact: expected, bestCase: best, worstCase: worst, effects: evaluated, verdict: redFlags.length > 0 ? "revisar_antes_de_ejecutar" : expected >= 0 ? "favorable_con_riesgos_acotados" : "desfavorable" },
      warnings: redFlags.map((e) => `Riesgo alto: «${e.description}» (p=${e.probability}, impacto ${e.impact}).`),
    };
  },
});

const whatIf = defineTool({
  number: 32,
  inputSchema: z.object({
    weights: numRec(),
    minimize: strArr(50, 100).optional(),
    base: z.object({ name: idStr(), metrics: numRec(), assumptions: strArr(50).optional() }).strict(),
    scenarios: z.array(z.object({ name: idStr(), metrics: numRec(), assumptions: strArr(50).optional() }).strict()).min(1).max(50),
  }).strict(),
  example: { weights: { coste: 2, calidad: 3 }, minimize: ["coste"], base: { name: "actual", metrics: { coste: 100, calidad: 7 } }, scenarios: [{ name: "económico", metrics: { coste: 60, calidad: 5 }, assumptions: ["Menos revisión manual"] }, { name: "premium", metrics: { coste: 160, calidad: 9 } }] },
  handler: (input) => {
    const all = [input.base, ...input.scenarios];
    const ranked = rankCandidates(all.map((s) => ({ id: s.name, metrics: s.metrics })), input.weights, input.minimize ?? []);
    const baseScore = ranked.find((r) => r.id === input.base.name)?.score ?? 0;
    return {
      summary: `Mejor escenario según los pesos: ${ranked[0]?.id ?? "-"} (${ranked[0]?.score ?? 0}/100).`,
      data: {
        ranking: ranked.map((r) => ({ ...r, deltaVsBase: round(r.score - baseScore, 2) })),
        scenarios: all.map((s) => ({ name: s.name, assumptions: s.assumptions ?? [], metrics: s.metrics })),
        weightsUsed: input.weights,
      },
    };
  },
});

const riskScoring = defineTool({
  number: 33,
  inputSchema: z.object({
    risks: z.array(z.object({ id: idStr(), description: txt(500).optional(), impact: z.number().min(1).max(5), probability: z.number().min(0).max(5), exposure: z.number().positive().optional() })).min(1).max(500),
  }).strict(),
  example: { risks: [{ id: "r1", description: "Caída del proveedor", impact: 4, probability: 2 }, { id: "r2", description: "Filtración de credencial", impact: 5, probability: 1 }] },
  handler: (input) => {
    const scored = input.risks.map((r) => {
      const prob = r.probability <= 1 ? r.probability * 5 : r.probability;
      const score = round(r.impact * prob, 2);
      const level = score >= 15 ? "critical" : score >= 8 ? "high" : score >= 4 ? "medium" : "low";
      return { id: r.id, description: r.description ?? r.id, impact: r.impact, probabilityNormalized5: round(prob, 2), score, level, expectedExposure: r.exposure ? round((prob / 5) * r.exposure, 2) : null, action: level === "critical" ? "Mitigar antes de continuar" : level === "high" ? "Plan de mitigación obligatorio" : level === "medium" ? "Vigilar y mitigar si es barato" : "Aceptar y documentar" };
    }).sort((a, b) => b.score - a.score);
    return { summary: `Riesgo mayor: ${scored[0].id} (${scored[0].level}, ${scored[0].score}/25).`, data: { risks: scored, byLevel: { critical: scored.filter((r) => r.level === "critical").length, high: scored.filter((r) => r.level === "high").length, medium: scored.filter((r) => r.level === "medium").length, low: scored.filter((r) => r.level === "low").length } } };
  },
});

const tradeOff = defineTool({
  number: 34,
  inputSchema: z.object({
    options: z.array(z.object({ id: idStr(), quality: z.number().finite(), cost: z.number().finite(), latency: z.number().finite(), security: z.number().finite(), maintenance: z.number().finite() }).strict()).min(2).max(100),
    weights: z.object({ quality: z.number().nonnegative().optional(), cost: z.number().nonnegative().optional(), latency: z.number().nonnegative().optional(), security: z.number().nonnegative().optional(), maintenance: z.number().nonnegative().optional() }).strict().optional(),
  }).strict(),
  example: { options: [{ id: "propio", quality: 8, cost: 50, latency: 20, security: 9, maintenance: 4 }, { id: "saas", quality: 7, cost: 120, latency: 80, security: 6, maintenance: 9 }] },
  handler: (input) => {
    const weights = { quality: input.weights?.quality ?? 3, cost: input.weights?.cost ?? 2, latency: input.weights?.latency ?? 1, security: input.weights?.security ?? 2, maintenance: input.weights?.maintenance ?? 1 };
    const candidates = input.options.map((o) => ({ id: o.id, metrics: { quality: o.quality, cost: o.cost, latency: o.latency, security: o.security, maintenance: o.maintenance } }));
    const ranked = rankCandidates(candidates, weights, ["cost", "latency"]);
    const bestPerDimension: Record<string, string> = {};
    for (const key of ["quality", "security", "maintenance"] as const) bestPerDimension[key] = [...input.options].sort((a, b) => b[key] - a[key])[0].id;
    for (const key of ["cost", "latency"] as const) bestPerDimension[key] = [...input.options].sort((a, b) => a[key] - b[key])[0].id;
    return {
      summary: `Mejor equilibrio ponderado: ${ranked[0].id} (${ranked[0].score}/100).`,
      data: { ranking: ranked, paretoOptimal: paretoFront(candidates, ["quality", "security", "maintenance"], ["cost", "latency"]), bestPerDimension, weightsUsed: weights, note: "maintenance se interpreta como facilidad de mantenimiento (mayor = mejor)." },
    };
  },
});

const decisionSupport = defineTool({
  number: 35,
  inputSchema: z.object({
    question: reqText(1_000),
    options: z.array(z.object({ id: idStr(), pros: strArr(30).optional(), cons: strArr(30).optional(), evidenceScore: z.number().min(0).max(10).optional(), riskScore: z.number().min(0).max(10).optional(), effortScore: z.number().min(0).max(10).optional() })).min(1).max(100),
  }).strict(),
  example: { question: "¿Qué formato lanzar primero?", options: [{ id: "vídeo corto", pros: ["rápido de producir"], cons: ["menor profundidad"], evidenceScore: 6, riskScore: 3, effortScore: 8 }, { id: "vídeo largo", pros: ["más valor"], evidenceScore: 4, riskScore: 5, effortScore: 3 }] },
  handler: (input) => {
    const ranked = input.options.map((o) => {
      const net = (o.pros?.length ?? 0) - (o.cons?.length ?? 0);
      const score = round(net * 5 + (o.evidenceScore ?? 0) * 4 - (o.riskScore ?? 0) * 3 - (10 - (o.effortScore ?? 5)) * 1.5, 1);
      const limitations: string[] = [];
      if ((o.evidenceScore ?? 0) < 5) limitations.push("Evidencia débil declarada");
      if (!o.cons?.length) limitations.push("Sin contras declarados: posible sesgo");
      return { id: o.id, score, pros: o.pros ?? [], cons: o.cons ?? [], limitations };
    }).sort((a, b) => b.score - a.score);
    return {
      summary: `Para «${input.question}» la opción mejor apoyada es ${ranked[0].id}.`,
      data: { question: input.question, recommendation: ranked[0].id, options: ranked, disclaimer: "Ordenación según los factores declarados por el llamante; no es un juicio con información externa." },
    };
  },
});

const impactBoundary = defineTool({
  number: 36,
  inputSchema: z.object({
    action: reqText(2_000),
    reversible: z.boolean(),
    affectedUsers: z.number().int().nonnegative().optional(),
    dataLossRisk: z.enum(["none", "low", "high"]).optional(),
    affectsProduction: z.boolean().optional(),
    financialImpact: z.number().nonnegative().optional(),
  }).strict(),
  example: { action: "Borrar la tabla de sesiones en producción", reversible: false, affectedUsers: 1200, dataLossRisk: "high", affectsProduction: true },
  handler: (input) => {
    let score = 0;
    const reasons: string[] = [];
    if (!input.reversible) { score += 40; reasons.push("Acción irreversible"); }
    if (input.affectsProduction) { score += 25; reasons.push("Afecta a producción"); }
    if (input.dataLossRisk === "high") { score += 25; reasons.push("Riesgo alto de pérdida de datos"); }
    else if (input.dataLossRisk === "low") { score += 8; reasons.push("Riesgo bajo de pérdida de datos"); }
    if ((input.affectedUsers ?? 0) > 100) { score += 10; reasons.push(`Más de 100 usuarios afectados (${input.affectedUsers})`); }
    if ((input.financialImpact ?? 0) > 0) { score += 10; reasons.push("Impacto financiero declarado"); }
    if (/borrar|eliminar|drop|delete|truncate|destruir|purgar/i.test(input.action)) { score += 10; reasons.push("La descripción contiene una operación destructiva"); }
    const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    return {
      summary: `Impacto ${level} (${Math.min(100, score)}/100)${level === "high" ? ": supera el Umbral de daño, exige salvaguardas" : ""}.`,
      data: { impactScore: Math.min(100, score), level, withinSafeBoundary: level !== "high", reasons, requiredSafeguards: level === "high" ? ["Confirmación explícita adicional", "Copia o punto de control verificado", "Plan de reversión o mitigación", "Registro en bitácora"] : level === "medium" ? ["Punto de control recomendado", "Registro en bitácora"] : [] },
    };
  },
});

const sensitivity = defineTool({
  number: 37,
  inputSchema: z.object({ variables: numRec(), weights: numRec().optional(), variationPercent: z.number().positive().max(1_000).optional() }).strict(),
  example: { variables: { precio: 10, volumen: 100, costeUnitario: 4 }, weights: { precio: 100, volumen: 10, costeUnitario: -100 }, variationPercent: 10 },
  handler: (input) => {
    const keys = Object.keys(input.variables);
    if (keys.length === 0) return { summary: "Sin variables que analizar.", data: { baselineOutput: 0, sensitivities: [] } };
    const w = (k: string) => input.weights?.[k] ?? 1;
    const output = (vars: Record<string, number>) => sum(keys.map((k) => vars[k] * w(k)));
    const baseline = output(input.variables);
    const pct = (input.variationPercent ?? 10) / 100;
    const sensitivities = keys.map((k) => {
      const up = output({ ...input.variables, [k]: input.variables[k] * (1 + pct) }) - baseline;
      const down = output({ ...input.variables, [k]: input.variables[k] * (1 - pct) }) - baseline;
      return { variable: k, deltaUp: round(up, 4), deltaDown: round(down, 4), swing: round(Math.abs(up) + Math.abs(down), 4) };
    }).sort((a, b) => b.swing - a.swing);
    return {
      summary: `La variable más influyente es «${sensitivities[0].variable}» (±${input.variationPercent ?? 10}% mueve el resultado ${sensitivities[0].swing}).`,
      data: { baselineOutput: round(baseline, 4), model: "output = Σ variable × peso (peso 1 si no se declara)", sensitivities },
    };
  },
});

const costForecast = defineTool({
  number: 38,
  inputSchema: z.object({
    steps: z.array(z.object({ name: idStr(), unitCost: z.number().nonnegative(), units: z.number().nonnegative(), probability: z.number().min(0).max(1).optional() })).min(1).max(500),
    runsPerMonth: z.number().positive().max(10_000_000).optional(),
    currency: z.string().min(1).max(10).optional(),
  }).strict(),
  example: { steps: [{ name: "guion", unitCost: 0.2, units: 4 }, { name: "voz", unitCost: 0.05, units: 30, probability: 0.9 }], runsPerMonth: 100, currency: "USD" },
  handler: (input) => {
    const evaluated = input.steps.map((s) => ({ name: s.name, maxCost: round(s.unitCost * s.units, 4), expectedCost: round(s.unitCost * s.units * (s.probability ?? 1), 4) }));
    const perRunMax = round(sum(evaluated.map((e) => e.maxCost)), 4);
    const perRunExpected = round(sum(evaluated.map((e) => e.expectedCost)), 4);
    const runs = input.runsPerMonth ?? 1;
    const drivers = [...evaluated].sort((a, b) => b.expectedCost - a.expectedCost).slice(0, 5);
    return {
      summary: `Coste esperado por ejecución: ${perRunExpected} ${input.currency ?? ""} (máximo ${perRunMax}); al mes ~${round(perRunExpected * runs, 2)}.`,
      data: { perRunExpected, perRunMax, monthlyExpected: round(perRunExpected * runs, 2), monthlyMax: round(perRunMax * runs, 2), steps: evaluated, topCostDrivers: drivers.map((d) => d.name) },
    };
  },
});

const latencyForecast = defineTool({
  number: 39,
  inputSchema: z.object({
    steps: z.array(z.object({ id: idStr(), durationMs: z.number().nonnegative(), variabilityPct: z.number().min(0).max(500).optional(), dependsOn: z.array(idStr()).max(100).optional() })).min(1).max(500),
  }).strict(),
  example: { steps: [{ id: "auth", durationMs: 40 }, { id: "bd", durationMs: 120, variabilityPct: 30 }, { id: "render", durationMs: 300, dependsOn: ["bd"] }, { id: "cache_lookup", durationMs: 5 }] },
  handler: (input) => {
    const graph = analyzeGraph(input.steps.map((s) => ({ id: s.id, dependsOn: s.dependsOn, duration: s.durationMs })));
    const byId = new Map(input.steps.map((s) => [s.id, s]));
    const pessimisticPath = graph.criticalPath.path.reduce((acc, id) => {
      const s = byId.get(id)!;
      return acc + s.durationMs * (1 + (s.variabilityPct ?? 0) / 100);
    }, 0);
    const slowest = [...input.steps].sort((a, b) => b.durationMs - a.durationMs)[0];
    return {
      summary: `Latencia estimada por ruta crítica: ${graph.criticalPath.duration} ms (pesimista ${round(pessimisticPath, 0)} ms); etapa dominante: ${slowest.id}.`,
      data: { criticalPathMs: graph.criticalPath.duration, pessimisticMs: round(pessimisticPath, 1), serialMs: sum(input.steps.map((s) => s.durationMs)), criticalPath: graph.criticalPath.path, dominantStep: { id: slowest.id, durationMs: slowest.durationMs, shareOfCriticalPct: graph.criticalPath.duration > 0 && graph.criticalPath.path.includes(slowest.id) ? round((slowest.durationMs / graph.criticalPath.duration) * 100, 1) : 0 } },
    };
  },
});

const reversibility = defineTool({
  number: 40,
  inputSchema: z.object({
    action: reqText(2_000),
    hasBackup: z.boolean(),
    hasExternalSideEffects: z.boolean(),
    dataLossOnUndo: z.boolean().optional(),
    reversibleSteps: strArr(100).optional(),
    irreversibleSteps: strArr(100).optional(),
    estimatedUndoMinutes: z.number().nonnegative().optional(),
  }).strict(),
  example: { action: "Publicar la nueva versión", hasBackup: true, hasExternalSideEffects: true, reversibleSteps: ["despliegue"], irreversibleSteps: ["migración que borra columna"], estimatedUndoMinutes: 45 },
  handler: (input) => {
    let score = 100;
    const factors: string[] = [];
    if (!input.hasBackup) { score -= 35; factors.push("Sin copia de seguridad"); }
    if (input.hasExternalSideEffects) { score -= 25; factors.push("Efectos externos ya visibles para terceros"); }
    if (input.dataLossOnUndo) { score -= 20; factors.push("Deshacer implica perder datos"); }
    score -= Math.min(30, (input.irreversibleSteps?.length ?? 0) * 15);
    if (input.irreversibleSteps?.length) factors.push(`${input.irreversibleSteps.length} pasos irreversibles declarados`);
    if ((input.estimatedUndoMinutes ?? 0) > 120) { score -= 10; factors.push("La reversión llevaría más de 2 horas"); }
    score = Math.max(0, score);
    const verdict = score >= 70 ? "reversible" : score >= 40 ? "parcialmente_reversible" : "dificilmente_reversible";
    return {
      summary: `Reversibilidad ${score}/100: ${verdict.replace(/_/g, " ")}.`,
      data: { reversibilityScore: score, verdict, negativeFactors: factors, undoPlan: input.hasBackup ? ["Localizar la copia/punto de control", "Restaurar en entorno de verificación", "Comprobar integridad y reabrir"] : ["No hay copia: la única vía es reconstruir el estado paso a paso"], requiresApproval: verdict === "dificilmente_reversible" },
    };
  },
});

export const f04: LocalToolDefinition[] = [consequenceSimulator, whatIf, riskScoring, tradeOff, decisionSupport, impactBoundary, sensitivity, costForecast, latencyForecast, reversibility];
