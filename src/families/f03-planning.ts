/** Familia 03 — Planificación y objetivos complejos (herramientas 21-30). */
import { z } from "zod";
import { analyzeGraph } from "../engines/graph.js";
import { mean, round, sum } from "../engines/stats.js";
import { tokens } from "../engines/text.js";
import { addDays, daysBetween, toDate } from "../engines/time.js";
import { defineTool, fail, idStr, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const objectiveOrchestrator = defineTool({
  number: 21,
  limitation: "Descomposición por plantilla determinista: estructura el objetivo, no sustituye el criterio del equipo al refinar cada hito.",
  inputSchema: z.object({
    objective: reqText(2_000),
    horizonDays: z.number().int().min(1).max(3_650).optional(),
    workstreams: strArr(12, 200).optional(),
    startDate: txt(50).optional(),
  }).strict(),
  example: { objective: "Lanzar el canal de vídeo con 12 piezas publicadas", horizonDays: 60, workstreams: ["guion", "producción", "publicación"] },
  handler: (input) => {
    const streams = input.workstreams?.length ? input.workstreams : ["descubrimiento", "diseño", "construcción", "validación", "entrega"];
    const horizon = input.horizonDays ?? 30;
    const start = toDate(input.startDate);
    const perStream = Math.max(1, Math.floor(horizon / streams.length));
    const milestones = streams.map((stream, i) => ({
      id: `m${i + 1}`,
      workstream: stream,
      title: `${stream[0].toUpperCase()}${stream.slice(1)} listo`,
      targetDate: addDays(start, perStream * (i + 1)).toISOString().slice(0, 10),
      dependsOn: i === 0 ? [] : [`m${i}`],
      measurableCriterion: `Entregable de «${stream}» aceptado con evidencia revisable`,
      subtasks: [`Definir alcance de ${stream}`, `Ejecutar ${stream}`, `Revisar ${stream} contra el objetivo`],
    }));
    return {
      summary: `Objetivo descompuesto en ${milestones.length} hitos medibles en ${horizon} días.`,
      data: { objective: input.objective, milestones, totalSubtasks: milestones.length * 3 },
    };
  },
});

const milestonePlanner = defineTool({
  number: 22,
  inputSchema: z.object({
    milestones: z.array(z.object({
      id: idStr(), name: txt(300), deliverable: txt(1_000).optional(),
      durationDays: z.number().nonnegative(), dependsOn: z.array(idStr()).max(100).optional(),
      acceptanceCriteria: strArr(20, 1_000).optional(),
    })).min(1).max(200),
    startDate: txt(50).optional(),
  }).strict(),
  example: { milestones: [{ id: "m1", name: "Prototipo", durationDays: 10 }, { id: "m2", name: "Piloto", durationDays: 15, dependsOn: ["m1"] }], startDate: "2026-11-02" },
  handler: (input) => {
    const graph = analyzeGraph(input.milestones.map((m) => ({ id: m.id, dependsOn: m.dependsOn, duration: m.durationDays })));
    const start = toDate(input.startDate);
    const finish = new Map<string, number>();
    const byId = new Map(input.milestones.map((m) => [m.id, m]));
    const plan = graph.order.map((id) => {
      const m = byId.get(id)!;
      const depFinish = Math.max(0, ...(m.dependsOn ?? []).map((d) => finish.get(d) ?? 0));
      const myFinish = depFinish + m.durationDays;
      finish.set(id, myFinish);
      return {
        id, name: m.name, deliverable: m.deliverable ?? null,
        startDate: addDays(start, depFinish).toISOString().slice(0, 10),
        targetDate: addDays(start, myFinish).toISOString().slice(0, 10),
        acceptanceCriteria: m.acceptanceCriteria ?? [`${m.name} entregado y revisado`],
      };
    });
    return {
      summary: `${plan.length} hitos programados; fin estimado el ${plan.length ? plan.reduce((a, b) => (a.targetDate > b.targetDate ? a : b)).targetDate : "-"} (ruta crítica: ${graph.criticalPath.duration} días).`,
      data: { plan, criticalPathDays: graph.criticalPath.duration, criticalPath: graph.criticalPath.path, unscheduled: input.milestones.map((m) => m.id).filter((id) => !graph.order.includes(id)) },
      warnings: graph.cycle ? [`Ciclo entre hitos: ${graph.cycle.join(" -> ")}`] : [],
    };
  },
});

const planAdaptation = defineTool({
  number: 23,
  inputSchema: z.object({
    tasks: z.array(z.object({ id: idStr(), durationDays: z.number().nonnegative(), status: z.enum(["done", "in_progress", "pending"]), dependsOn: z.array(idStr()).max(100).optional() })).min(1).max(500),
    removeTaskIds: z.array(idStr()).max(200).optional(),
    addTasks: z.array(z.object({ id: idStr(), durationDays: z.number().nonnegative(), dependsOn: z.array(idStr()).max(100).optional() })).max(200).optional(),
    capacityFactor: z.number().positive().max(10).optional(),
    elapsedDays: z.number().nonnegative().optional(),
  }).strict(),
  example: { tasks: [{ id: "a", durationDays: 2, status: "done" }, { id: "b", durationDays: 4, status: "pending", dependsOn: ["a"] }], addTasks: [{ id: "c", durationDays: 3, dependsOn: ["b"] }], capacityFactor: 0.8 },
  handler: (input) => {
    const removed = new Set(input.removeTaskIds ?? []);
    const kept = input.tasks.filter((t) => !removed.has(t.id));
    const pending = [...kept.filter((t) => t.status !== "done").map((t) => ({ id: t.id, durationDays: t.durationDays, dependsOn: (t.dependsOn ?? []).filter((d) => !removed.has(d)) })),
      ...(input.addTasks ?? [])];
    const factor = input.capacityFactor ?? 1;
    const graph = analyzeGraph(pending.map((t) => ({ id: t.id, dependsOn: t.dependsOn, duration: t.durationDays / factor })));
    const doneDuration = sum(kept.filter((t) => t.status === "done").map((t) => t.durationDays));
    return {
      summary: `Plan recalculado: quedan ~${round(graph.criticalPath.duration, 1)} días por la ruta crítica (factor de capacidad ${factor}).`,
      data: {
        remainingCriticalDays: round(graph.criticalPath.duration, 2), remainingSerialDays: round(sum(pending.map((t) => t.durationDays)) / factor, 2),
        completedDays: doneDuration, newOrder: graph.order, added: (input.addTasks ?? []).map((t) => t.id), removed: [...removed],
        impactedByRemoval: input.tasks.filter((t) => (t.dependsOn ?? []).some((d) => removed.has(d))).map((t) => t.id),
      },
    };
  },
});

const goalClarifier = defineTool({
  number: 24,
  inputSchema: z.object({ goal: reqText(5_000) }).strict(),
  example: { goal: "Mejorar la web lo antes posible para que vaya mejor" },
  handler: (input) => {
    const text = input.goal;
    const wordList = tokens(text, { dropStopwords: false });
    const vagueWords = ["mejor", "rápido", "rapido", "pronto", "varios", "algunos", "etc", "óptimo", "optimo", "bien", "mucho", "poco", "calidad", "mejorar", "antes posible"];
    const foundVague = vagueWords.filter((v) => text.toLowerCase().includes(v));
    const hasNumber = /\d/.test(text);
    const hasDate = /\b\d{4}-\d{2}-\d{2}\b|semana|mes|días|dias|fecha|deadline|antes del/i.test(text);
    const hasActor = /\b(usuario|cliente|equipo|yo|nosotros|visitante|admin)/i.test(text);
    const questions: string[] = [];
    let score = 100;
    if (!hasNumber) { score -= 30; questions.push("¿Qué número concreto define el éxito (cantidad, porcentaje, tiempo…)?"); }
    if (!hasDate) { score -= 20; questions.push("¿Para qué fecha o en qué horizonte debe estar cumplido?"); }
    if (!hasActor) { score -= 15; questions.push("¿Quién es el beneficiario o actor principal del objetivo?"); }
    if (foundVague.length > 0) { score -= Math.min(25, foundVague.length * 8); questions.push(`¿Qué significa exactamente: ${foundVague.map((v) => `«${v}»`).join(", ")}?`); }
    if (wordList.length < 5) { score -= 10; questions.push("¿Qué queda fuera del alcance de este objetivo?"); }
    return {
      summary: `Claridad estimada: ${Math.max(0, score)}/100 con ${questions.length} preguntas abiertas.`,
      data: { clarityScore: Math.max(0, score), ambiguities: { vagueTerms: foundVague, hasMeasurableNumber: hasNumber, hasTimeframe: hasDate, hasActor }, clarifyingQuestions: questions },
    };
  },
});

const scopeManager = defineTool({
  number: 25,
  inputSchema: z.object({
    included: strArr(200),
    excluded: strArr(200),
    requestedChanges: strArr(200).optional(),
  }).strict(),
  example: { included: ["página de inicio", "formulario de contacto"], excluded: ["tienda online", "pagos"], requestedChanges: ["añadir pagos con tarjeta", "nuevo banner en la página de inicio"] },
  handler: (input) => {
    const matchScore = (change: string, items: string[]) => {
      const changeTokens = new Set(tokens(change));
      return items.map((item) => {
        const itemTokens = new Set(tokens(item));
        const inter = [...changeTokens].filter((t) => itemTokens.has(t)).length;
        return { item, overlap: itemTokens.size === 0 ? 0 : inter / itemTokens.size };
      }).filter((m) => m.overlap >= 0.5).sort((a, b) => b.overlap - a.overlap)[0];
    };
    const normalized = (s: string) => tokens(s, { dropStopwords: false }).join(" ");
    const conflicts = input.included.filter((inc) => input.excluded.some((exc) => normalized(inc) === normalized(exc)));
    const classified = (input.requestedChanges ?? []).map((change) => {
      const outMatch = matchScore(change, input.excluded);
      const inMatch = matchScore(change, input.included);
      const classification = outMatch ? "out_of_scope" : inMatch ? "in_scope" : "needs_decision";
      return { change, classification, matchedItem: outMatch?.item ?? inMatch?.item ?? null };
    });
    const creep = classified.filter((c) => c.classification === "out_of_scope").length;
    return {
      summary: `${classified.length} cambios clasificados; riesgo de expansión de alcance: ${creep > 0 ? "presente" : "bajo"}.`,
      data: { conflictsBetweenLists: conflicts, classifiedChanges: classified, scopeCreepCount: creep, includedCount: input.included.length, excludedCount: input.excluded.length },
      warnings: conflicts.length > 0 ? ["Hay elementos a la vez incluidos y excluidos: resuélvelos antes de seguir."] : [],
    };
  },
});

const progressEstimator = defineTool({
  number: 26,
  inputSchema: z.object({
    tasks: z.array(z.object({ id: idStr(), status: z.enum(["done", "in_progress", "pending", "blocked"]), weight: z.number().positive().optional(), percentComplete: z.number().min(0).max(100).optional(), hasEvidence: z.boolean().optional() })).min(1).max(1_000),
    elapsedDays: z.number().nonnegative().optional(),
  }).strict(),
  example: { tasks: [{ id: "a", status: "done", hasEvidence: true }, { id: "b", status: "in_progress", percentComplete: 50 }, { id: "c", status: "pending" }], elapsedDays: 6 },
  handler: (input) => {
    const totalWeight = sum(input.tasks.map((t) => t.weight ?? 1));
    const earned = sum(input.tasks.map((t) => {
      const w = t.weight ?? 1;
      if (t.status === "done") return w;
      if (t.status === "in_progress") return (w * (t.percentComplete ?? 50)) / 100;
      return 0;
    }));
    const progress = (earned / totalWeight) * 100;
    const evidenceCoverage = (input.tasks.filter((t) => t.hasEvidence).length / input.tasks.length) * 100;
    let etaDays: number | null = null;
    if (input.elapsedDays && input.elapsedDays > 0 && progress > 0 && progress < 100) {
      etaDays = round(((100 - progress) / progress) * input.elapsedDays, 1);
    }
    return {
      summary: `Progreso ponderado: ${round(progress, 1)}% (evidencia en el ${round(evidenceCoverage, 0)}% de tareas).`,
      data: { progressPercent: round(progress, 1), evidenceCoveragePercent: round(evidenceCoverage, 1), counts: { done: input.tasks.filter((t) => t.status === "done").length, inProgress: input.tasks.filter((t) => t.status === "in_progress").length, pending: input.tasks.filter((t) => t.status === "pending").length, blocked: input.tasks.filter((t) => t.status === "blocked").length }, estimatedRemainingDays: etaDays, doneWithoutEvidence: input.tasks.filter((t) => t.status === "done" && !t.hasEvidence).map((t) => t.id) },
      warnings: etaDays === null && progress < 100 ? ["Sin días transcurridos no se puede estimar la fecha de cierre."] : [],
    };
  },
});

const alternativePath = defineTool({
  number: 27,
  inputSchema: z.object({
    tasks: z.array(z.object({ id: idStr(), dependsOn: z.array(idStr()).max(100).optional(), duration: z.number().nonnegative().optional() })).min(1).max(500),
    unavailable: z.array(idStr()).min(1).max(200),
    substitutes: z.record(z.string(), z.array(idStr()).max(20)).optional(),
  }).strict(),
  example: { tasks: [{ id: "a" }, { id: "b", dependsOn: ["a"] }, { id: "c", dependsOn: ["b"] }, { id: "a2" }], unavailable: ["a"], substitutes: { a: ["a2"] } },
  handler: (input) => {
    const unavailable = new Set(input.unavailable);
    const rerouted: Record<string, string> = {};
    const rewired = input.tasks
      .filter((t) => !unavailable.has(t.id))
      .map((t) => ({
        ...t,
        dependsOn: (t.dependsOn ?? []).flatMap((dep) => {
          if (!unavailable.has(dep)) return [dep];
          const sub = input.substitutes?.[dep]?.find((s) => !unavailable.has(s));
          if (sub) { rerouted[t.id] = `${dep} -> ${sub}`; return [sub]; }
          return [];
        }),
      }));
    const graph = analyzeGraph(rewired);
    const blockedTasks = input.tasks
      .filter((t) => !unavailable.has(t.id) && (t.dependsOn ?? []).some((d) => unavailable.has(d)) && !(input.substitutes?.[t.dependsOn!.find((x) => unavailable.has(x))!]?.length))
      .map((t) => t.id);
    return {
      summary: blockedTasks.length === 0 ? "Existe ruta alternativa para todas las tareas afectadas." : `${blockedTasks.length} tareas quedan sin ruta alternativa.`,
      data: { newOrder: graph.order, rerouted, blockedTasks, removedFromPlan: input.unavailable, stillValid: graph.valid },
    };
  },
});

const resourceAllocation = defineTool({
  number: 28,
  inputSchema: z.object({
    tasks: z.array(z.object({ id: idStr(), priority: z.number().min(0).max(10), effortHours: z.number().positive() })).min(1).max(500),
    totalHours: z.number().positive(),
    budget: z.number().positive().optional(),
  }).strict(),
  example: { tasks: [{ id: "a", priority: 9, effortHours: 20 }, { id: "b", priority: 4, effortHours: 30 }], totalHours: 40 },
  handler: (input) => {
    const totalEffort = sum(input.tasks.map((t) => t.effortHours));
    const greedy = [...input.tasks].sort((a, b) => b.priority - a.priority || a.effortHours - b.effortHours);
    let remaining = input.totalHours;
    const allocation = greedy.map((t) => {
      const hours = Math.min(t.effortHours, Math.max(0, remaining));
      remaining -= hours;
      return { id: t.id, requestedHours: t.effortHours, allocatedHours: round(hours, 2), fullyFunded: hours >= t.effortHours, budgetShare: input.budget ? round((hours / Math.max(1, totalEffort)) * input.budget, 2) : null };
    });
    return {
      summary: `${allocation.filter((a) => a.fullyFunded).length}/${input.tasks.length} tareas con financiación completa de ${input.totalHours} h.`,
      data: { allocation, unallocatedHours: round(remaining, 2), demandVsCapacity: round(totalEffort / input.totalHours, 2), underfunded: allocation.filter((a) => !a.fullyFunded).map((a) => a.id) },
      warnings: totalEffort > input.totalHours ? ["La demanda supera la capacidad: hay tareas infra-financiadas por orden de prioridad."] : [],
    };
  },
});

const longHorizon = defineTool({
  number: 29,
  inputSchema: z.object({
    objective: reqText(1_000),
    startDate: txt(50).optional(),
    horizonWeeks: z.number().int().min(1).max(260),
    reviewEveryWeeks: z.number().int().min(1).max(52).optional(),
    phases: z.array(z.object({ name: txt(200), weeks: z.number().int().positive().max(260) })).max(24).optional(),
  }).strict(),
  example: { objective: "Consolidar la plataforma", startDate: "2026-11-02", horizonWeeks: 12, reviewEveryWeeks: 2, phases: [{ name: "Fundamentos", weeks: 6 }, { name: "Escalado", weeks: 6 }] },
  handler: (input) => {
    const start = toDate(input.startDate);
    const every = input.reviewEveryWeeks ?? 2;
    const reviews = [];
    for (let w = every; w <= input.horizonWeeks; w += every) {
      reviews.push({ week: w, date: addDays(start, w * 7).toISOString().slice(0, 10), checklist: ["Comparar progreso con el plan", "Revisar riesgos y bloqueos", "Ajustar prioridades de las próximas dos semanas"] });
    }
    let cursor = 0;
    const phases = (input.phases ?? [{ name: "Ejecución", weeks: input.horizonWeeks }]).map((p) => {
      const startWeek = cursor + 1;
      cursor += p.weeks;
      return { name: p.name, startDate: addDays(start, (startWeek - 1) * 7).toISOString().slice(0, 10), endDate: addDays(start, cursor * 7).toISOString().slice(0, 10), gate: `Puerta de fase: evidencia de «${p.name}» revisada antes de continuar` };
    });
    return {
      summary: `Plan de ${input.horizonWeeks} semanas con ${reviews.length} revisiones programadas.`,
      data: { objective: input.objective, endDate: addDays(start, input.horizonWeeks * 7).toISOString().slice(0, 10), phases, reviews },
      warnings: cursor !== input.horizonWeeks && input.phases ? [`Las fases suman ${cursor} semanas y el horizonte es ${input.horizonWeeks}.`] : [],
    };
  },
});

const acceptanceValidator = defineTool({
  number: 30,
  inputSchema: z.object({
    criteria: z.array(z.object({
      id: idStr(), description: txt(500).optional(),
      operator: z.enum([">=", "<=", "==", "!=", "between"]),
      threshold: z.number().finite(), thresholdHigh: z.number().finite().optional(),
      actual: z.number().finite(), required: z.boolean().optional(),
    })).min(1).max(200),
  }).strict(),
  example: { criteria: [{ id: "latencia", description: "p95 bajo 300 ms", operator: "<=", threshold: 300, actual: 265, required: true }, { id: "cobertura", operator: ">=", threshold: 80, actual: 74 }] },
  handler: (input) => {
    const results = input.criteria.map((c) => {
      let passed: boolean;
      switch (c.operator) {
        case ">=": passed = c.actual >= c.threshold; break;
        case "<=": passed = c.actual <= c.threshold; break;
        case "==": passed = c.actual === c.threshold; break;
        case "!=": passed = c.actual !== c.threshold; break;
        case "between": passed = c.thresholdHigh !== undefined && c.actual >= c.threshold && c.actual <= c.thresholdHigh; break;
      }
      return { id: c.id, description: c.description ?? c.id, passed, margin: round(c.actual - c.threshold, 4), required: c.required ?? false };
    });
    const failingRequired = results.filter((r) => r.required && !r.passed);
    return {
      summary: failingRequired.length === 0 && results.every((r) => r.passed) ? "Entrega aceptada: todos los criterios se cumplen." : failingRequired.length === 0 ? "Aceptable con salvedades en criterios no obligatorios." : "Entrega rechazada: fallan criterios obligatorios.",
      data: { accepted: failingRequired.length === 0 && results.every((r) => r.passed), acceptedWithWarnings: failingRequired.length === 0, failingRequired: failingRequired.map((r) => r.id), passRatePercent: round((results.filter((r) => r.passed).length / results.length) * 100, 1), results },
    };
  },
});

// Uso interno para mantener tipos estrictos en fechas.
void daysBetween;
void mean;
void fail;

export const f03: LocalToolDefinition[] = [objectiveOrchestrator, milestonePlanner, planAdaptation, goalClarifier, scopeManager, progressEstimator, alternativePath, resourceAllocation, longHorizon, acceptanceValidator];
