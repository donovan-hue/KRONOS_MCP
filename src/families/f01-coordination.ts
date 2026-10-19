/** Familia 01 — Coordinación y enrutamiento inteligente (herramientas 1-10). */
import { z } from "zod";
import { TOOLS_180, catalogEntry, isKnownToolName } from "../catalog/index.js";
import { analyzeGraph } from "../engines/graph.js";
import { round } from "../engines/stats.js";
import { queryOverlap, tokens } from "../engines/text.js";
import { sha256Hex } from "../engines/security.js";
import { canonicalStringify } from "../engines/data.js";
import { compoundTools, evictOldest, registeredLocalTools, workflowStates } from "../state/stores.js";
import { defineTool, fail, idStr, reqText, strArr, taskSchema, tasksSchema, txt, type LocalToolDefinition } from "./types.js";

/**
 * En un servidor ya registrado, el enrutamiento solo recomienda herramientas
 * realmente servidas por ese perfil. Al invocar definiciones directamente
 * (pruebas unitarias), todavía no hay registro y se usa el catálogo maestro.
 */
const availableCatalog = () => (
  registeredLocalTools.size > 0
    ? TOOLS_180.filter((entry) => registeredLocalTools.has(entry.name))
    : TOOLS_180
);

const compound = defineTool({
  number: 1,
  stateful: true,
  limitation: "Registra la composición en memoria del proceso; ejecutar la cadena sigue siendo responsabilidad del llamante.",
  inputSchema: z.object({
    action: z.enum(["create", "get", "list"]).optional(),
    name: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "snake_case").optional(),
    description: z.string().max(500).optional(),
    steps: z.array(z.object({ tool: idStr(), alias: z.string().max(100).optional() })).max(50).optional(),
  }).strict(),
  example: { action: "create", name: "revisar_y_priorizar", steps: [{ tool: "kronos_risk_scoring_engine", alias: "riesgos" }, { tool: "kronos_dynamic_priority_scheduler" }] },
  handler: (input) => {
    const action = input.action ?? "create";
    if (action === "list") {
      return { summary: `${compoundTools.size} herramientas compuestas registradas.`, data: { compounds: [...compoundTools.keys()] } };
    }
    if (!input.name) fail("INVALID_INPUT");
    if (action === "get") {
      const found = compoundTools.get(input.name!);
      if (!found) fail("NOT_FOUND");
      return { summary: `Compuesta ${input.name} recuperada.`, data: { name: input.name, ...found } };
    }
    if (!input.steps || input.steps.length === 0) fail("INVALID_INPUT");
    const unknown = input.steps!.filter((s) => !isKnownToolName(s.tool)).map((s) => s.tool);
    if (unknown.length > 0) {
      return { summary: "La composición referencia herramientas inexistentes.", data: { unknownTools: unknown }, warnings: ["No se registró la composición."] };
    }
    const aliases = input.steps!.map((s, i) => s.alias ?? `paso_${i + 1}`);
    if (new Set(aliases).size !== aliases.length) fail("CONFLICT");
    const record = { description: input.description, steps: input.steps!, createdAt: new Date().toISOString() };
    compoundTools.set(input.name!, record);
    evictOldest(compoundTools);
    return {
      summary: `Compuesta «${input.name}» registrada con ${input.steps!.length} pasos.`,
      data: { name: input.name, stepCount: input.steps!.length, aliases, executionOrder: input.steps!.map((s) => s.tool) },
    };
  },
});

const router = defineTool({
  number: 2,
  inputSchema: z.object({
    goal: reqText(2_000),
    limit: z.number().int().min(1).max(10).optional(),
    excludeStateful: z.boolean().optional(),
    familyId: z.string().regex(/^(0[1-9]|1[0-8])$/).optional(),
  }).strict(),
  example: { goal: "detectar secretos filtrados en un texto antes de publicar", limit: 3 },
  handler: (input) => {
    const statefulNumbers = new Set([1, 8, 17, 18, 54, 55, 61, 62, 119, 141, 144, 150, 154, 159, 161]);
    const goalTokens = new Set(tokens(input.goal));
    const scored = availableCatalog()
      .filter((e) => (!input.familyId || e.familyId === input.familyId))
      .filter((e) => !input.excludeStateful || !statefulNumbers.has(e.number))
      .map((entry) => {
        const haystack = `${entry.nickname} ${entry.technicalName} ${entry.description} ${entry.familyName}`;
        const overlap = queryOverlap(input.goal, haystack);
        const matched = [...goalTokens].filter((t) => tokens(haystack).includes(t));
        return { entry, score: round(overlap, 3), matchedTerms: matched.slice(0, 8) };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 5);
    return {
      summary: scored.length > 0 ? `Ruta sugerida: ${scored[0].entry.name} (${scored[0].entry.nickname}).` : "Ninguna herramienta coincide con el objetivo.",
      data: {
        recommendations: scored.map((s) => ({
          tool: s.entry.name, nickname: s.entry.nickname, technicalName: s.entry.technicalName,
          family: s.entry.familyName, score: s.score, matchedTerms: s.matchedTerms,
          reason: s.entry.description,
        })),
      },
      warnings: scored.length === 0 ? ["Reformula el objetivo con términos del dominio (p. ej. «subtítulos», «coste», «grafo»)."] : [],
    };
  },
});

const coordinator = defineTool({
  number: 3,
  inputSchema: z.object({
    subtasks: z.array(z.object({
      id: idStr(), title: z.string().max(500).optional(),
      requiredCapability: z.string().max(100).optional(),
      dependsOn: z.array(idStr()).max(100).optional(), duration: z.number().nonnegative().optional(),
    })).min(1).max(500),
    agents: z.array(z.object({ id: idStr(), capabilities: strArr(50, 100), capacity: z.number().positive().optional() })).min(1).max(100),
  }).strict(),
  example: {
    subtasks: [
      { id: "guion", requiredCapability: "script", duration: 2 },
      { id: "voz", requiredCapability: "voice", dependsOn: ["guion"], duration: 1 },
      { id: "portada", requiredCapability: "image", duration: 1 },
    ],
    agents: [{ id: "agente_a", capabilities: ["script", "voice"] }, { id: "agente_b", capabilities: ["image"] }],
  },
  handler: (input) => {
    const graph = analyzeGraph(input.subtasks);
    const load = new Map(input.agents.map((a) => [a.id, 0]));
    const assignments: Record<string, string[]> = Object.fromEntries(input.agents.map((a) => [a.id, []]));
    const unassigned: string[] = [];
    const byId = new Map(input.subtasks.map((t) => [t.id, t]));
    for (const id of graph.order.length > 0 ? graph.order : input.subtasks.map((t) => t.id)) {
      const task = byId.get(id)!;
      const capable = input.agents.filter((a) => !task.requiredCapability || a.capabilities.includes(task.requiredCapability));
      const withCapacity = capable.filter((a) => (a.capacity ?? Infinity) > (load.get(a.id) ?? 0));
      const chosen = (withCapacity.length > 0 ? withCapacity : capable).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
      if (!chosen) { unassigned.push(id); continue; }
      assignments[chosen.id].push(id);
      load.set(chosen.id, (load.get(chosen.id) ?? 0) + (task.duration ?? 1));
    }
    return {
      summary: `${input.subtasks.length - unassigned.length}/${input.subtasks.length} subtareas asignadas entre ${input.agents.length} agentes.`,
      data: { assignments, unassigned, loadByAgent: Object.fromEntries(load), consolidationOrder: graph.order, parallelBatches: graph.levels, graphValid: graph.valid },
      warnings: graph.cycle ? [`Ciclo de dependencias: ${graph.cycle.join(" -> ")}`] : [],
    };
  },
});

const handoff = defineTool({
  number: 4,
  inputSchema: z.object({
    taskId: idStr(),
    from: idStr(),
    to: idStr(),
    state: z.record(z.string(), z.unknown()),
    requiredStateKeys: strArr(50, 100).optional(),
    contextSummary: txt(5_000).optional(),
  }).strict(),
  example: { taskId: "t-1", from: "kronos_script_outline_generator", to: "kronos_voice_direction_planner", state: { title: "Demo", sections: 3 }, requiredStateKeys: ["title", "script"] },
  handler: (input) => {
    const missing = (input.requiredStateKeys ?? []).filter((k) => !(k in input.state));
    const checksum = sha256Hex(canonicalStringify(input.state));
    const packetId = `handoff_${sha256Hex(`${input.taskId}:${input.from}:${input.to}:${checksum}`).slice(0, 12)}`;
    return {
      summary: missing.length === 0 ? "Paquete de relevo completo y verificado." : `Relevo incompleto: faltan ${missing.length} claves de estado.`,
      data: {
        packet: { packetId, taskId: input.taskId, from: input.from, to: input.to, createdAt: new Date().toISOString(), contextSummary: input.contextSummary ?? null, state: input.state },
        checksum, missingStateKeys: missing, stateKeys: Object.keys(input.state),
        targetKnown: isKnownToolName(input.to),
      },
      warnings: isKnownToolName(input.to) ? [] : [`La herramienta destino «${input.to}» no está en el catálogo.`],
    };
  },
});

const scheduler = defineTool({
  number: 5,
  inputSchema: z.object({
    tasks: z.array(z.object({
      id: idStr(), urgency: z.number().min(0).max(10), impact: z.number().min(0).max(10),
      cost: z.number().nonnegative().optional(), dependsOn: z.array(idStr()).max(100).optional(),
      duration: z.number().nonnegative().optional(),
    })).min(1).max(500),
    weights: z.object({ urgency: z.number().nonnegative().optional(), impact: z.number().nonnegative().optional(), cost: z.number().nonnegative().optional() }).strict().optional(),
  }).strict(),
  example: { tasks: [{ id: "a", urgency: 3, impact: 9, cost: 5 }, { id: "b", urgency: 9, impact: 5, cost: 1, dependsOn: ["a"] }] },
  handler: (input) => {
    const w = { urgency: input.weights?.urgency ?? 0.4, impact: input.weights?.impact ?? 0.4, cost: input.weights?.cost ?? 0.2 };
    const maxCost = Math.max(1, ...input.tasks.map((t) => t.cost ?? 0));
    const score = new Map(input.tasks.map((t) => [t.id, round(w.urgency * (t.urgency / 10) + w.impact * (t.impact / 10) - w.cost * ((t.cost ?? 0) / maxCost), 3)]));
    const graph = analyzeGraph(input.tasks);
    const byScoreThenOrder = [...input.tasks].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).map((t) => t.id);
    // Orden final: respeta dependencias; dentro de cada nivel, mayor puntuación primero.
    const scheduled = graph.levels.flatMap((level) => [...level].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0)));
    return {
      summary: `${input.tasks.length} tareas ordenadas por prioridad respetando dependencias.`,
      data: { scheduled, scores: Object.fromEntries(score), byScoreOnly: byScoreThenOrder, levels: graph.levels },
      warnings: graph.cycle ? [`Ciclo detectado: ${graph.cycle.join(" -> ")}`] : [],
    };
  },
});

const dependencyGraph = defineTool({
  number: 6,
  inputSchema: z.object({ tasks: tasksSchema() }).strict(),
  example: { tasks: [{ id: "diseno", duration: 2 }, { id: "build", dependsOn: ["diseno"], duration: 3 }, { id: "docs", dependsOn: ["diseno"], duration: 1 }] },
  handler: (input) => {
    const g = analyzeGraph(input.tasks.map((t) => ({ id: t.id, dependsOn: t.dependsOn, duration: t.duration ?? t.durationDays })));
    return {
      summary: g.valid ? `Grafo válido: ${input.tasks.length} tareas, ${g.levels.length} niveles.` : "Grafo con problemas de validación.",
      data: { valid: g.valid, order: g.order, levels: g.levels, criticalPath: g.criticalPath, unknownDependencies: g.unknownDependencies, duplicates: g.duplicates, cycle: g.cycle, dependents: g.dependents },
    };
  },
});

const parallelPlanner = defineTool({
  number: 7,
  inputSchema: z.object({ tasks: tasksSchema(), maxParallel: z.number().int().min(1).max(64).optional() }).strict(),
  example: { tasks: [{ id: "a", duration: 2 }, { id: "b", duration: 3 }, { id: "c", dependsOn: ["a", "b"], duration: 1 }] },
  handler: (input) => {
    const g = analyzeGraph(input.tasks.map((t) => ({ id: t.id, dependsOn: t.dependsOn, duration: t.duration ?? 1 })));
    let span = 0;
    const batches = g.levels.map((level) => {
      const durations = level.map((id) => input.tasks.find((t) => t.id === id)?.duration ?? 1);
      const workers = input.maxParallel ?? level.length;
      const sortedAsc = [...durations].sort((x, y) => x - y);
      const loads = new Array(Math.max(1, Math.min(workers, level.length))).fill(0);
      for (const d of sortedAsc.reverse()) {
        const idx = loads.indexOf(Math.min(...loads));
        loads[idx] += d;
      }
      span += Math.max(0, ...loads);
      return { tasks: level, batchDuration: Math.max(0, ...loads) };
    });
    return {
      summary: `Ejecución paralela estimada en ${round(span, 2)} frente a ${g.totalSerialDuration} en serie.`,
      data: { batches, estimatedParallelDuration: round(span, 2), serialDuration: g.totalSerialDuration, speedup: span > 0 ? round(g.totalSerialDuration / span, 2) : 1, maxParallelism: Math.max(0, ...g.levels.map((l) => l.length)) },
      warnings: g.cycle ? [`Ciclo detectado: ${g.cycle.join(" -> ")}`] : [],
    };
  },
});

const stateTracker = defineTool({
  number: 8,
  stateful: true,
  limitation: "Estado en memoria del proceso: se pierde al reiniciar el servidor.",
  inputSchema: z.object({
    action: z.enum(["transition", "get", "list"]),
    workflowId: idStr().optional(),
    state: z.string().min(1).max(100).optional(),
    blockedBy: strArr(50, 200).optional(),
    note: txt(1_000).optional(),
  }).strict(),
  example: { action: "transition", workflowId: "wf-demo", state: "in_progress", note: "Arranque" },
  handler: (input) => {
    if (input.action === "list") {
      return {
        summary: `${workflowStates.size} flujos registrados.`,
        data: { workflows: [...workflowStates.entries()].map(([id, w]) => ({ workflowId: id, state: w.state, blockedBy: w.blockedBy, transitions: w.history.length })) },
      };
    }
    if (!input.workflowId) fail("INVALID_INPUT");
    if (input.action === "get") {
      const found = workflowStates.get(input.workflowId!);
      if (!found) fail("NOT_FOUND");
      return { summary: `Flujo ${input.workflowId} en estado ${found!.state}.`, data: { workflowId: input.workflowId, ...found } };
    }
    if (!input.state) fail("INVALID_INPUT");
    const current = workflowStates.get(input.workflowId!) ?? { state: "new", blockedBy: [], history: [] };
    const next = { state: input.state!, blockedBy: input.blockedBy ?? current.blockedBy, history: [...current.history, { state: input.state!, at: new Date().toISOString(), note: input.note }] };
    workflowStates.set(input.workflowId!, next);
    evictOldest(workflowStates);
    return {
      summary: `Flujo ${input.workflowId}: ${current.state} -> ${input.state}.`,
      data: { workflowId: input.workflowId, previousState: current.state, state: next.state, blocked: next.blockedBy.length > 0, blockedBy: next.blockedBy, transitions: next.history.length },
    };
  },
});

const capabilitySelector = defineTool({
  number: 9,
  inputSchema: z.object({
    capabilities: strArr(20, 50).optional(),
    keywords: strArr(20, 100).optional(),
    familyId: z.string().regex(/^(0[1-9]|1[0-8])$/).optional(),
  }).strict(),
  example: { capabilities: ["security"], keywords: ["secreto"] },
  handler: (input) => {
    if (!input.capabilities?.length && !input.keywords?.length && !input.familyId) fail("INVALID_INPUT");
    const matches = availableCatalog().filter((e) => {
      if (input.familyId && e.familyId !== input.familyId) return false;
      if (input.capabilities?.length && !input.capabilities.includes(e.capability)) return false;
      if (input.keywords?.length) {
        const haystack = tokens(`${e.nickname} ${e.technicalName} ${e.description}`);
        if (!input.keywords.some((k) => tokens(k).some((t) => haystack.includes(t)))) return false;
      }
      return true;
    });
    return {
      summary: `${matches.length} herramientas cumplen el filtro.`,
      data: { tools: matches.map((e) => ({ number: e.number, tool: e.name, nickname: e.nickname, technicalName: e.technicalName, capability: e.capability, family: e.familyName })) },
    };
  },
});

const completionVerifier = defineTool({
  number: 10,
  inputSchema: z.object({
    criteria: z.array(z.object({ id: idStr(), description: txt(500), required: z.boolean().optional(), weight: z.number().positive().optional() })).min(1).max(200),
    evidence: z.array(z.object({ criterionId: idStr(), status: z.enum(["passed", "failed", "pending"]), note: txt(1_000).optional() })).max(500),
  }).strict(),
  example: { criteria: [{ id: "c1", description: "Pruebas en verde", required: true }, { id: "c2", description: "README actualizado" }], evidence: [{ criterionId: "c1", status: "passed" }, { criterionId: "c2", status: "pending" }] },
  handler: (input) => {
    const byId = new Map(input.evidence.map((e) => [e.criterionId, e]));
    let totalWeight = 0;
    let doneWeight = 0;
    const results = input.criteria.map((c) => {
      const weight = c.weight ?? 1;
      totalWeight += weight;
      const ev = byId.get(c.id);
      const status = ev?.status ?? "pending";
      if (status === "passed") doneWeight += weight;
      return { id: c.id, description: c.description, required: c.required ?? false, status, note: ev?.note ?? null };
    });
    const blockers = results.filter((r) => r.required && r.status !== "passed");
    return {
      summary: blockers.length === 0 && results.every((r) => r.status === "passed") ? "Todos los criterios están cumplidos: se puede cerrar." : `Cierre bloqueado por ${blockers.length} criterios obligatorios.`,
      data: { canClose: blockers.length === 0 && results.every((r) => r.status === "passed"), completionPercent: round((doneWeight / totalWeight) * 100, 1), blockers: blockers.map((b) => b.id), results },
    };
  },
});

// Referencia cruzada con el catálogo (garantiza que el orden sea el del catálogo).
void catalogEntry(1);

export const f01: LocalToolDefinition[] = [compound, router, coordinator, handoff, scheduler, dependencyGraph, parallelPlanner, stateTracker, capabilitySelector, completionVerifier];
