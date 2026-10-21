/** Familia 05 — Pruebas y evaluación de capacidades (herramientas 41-50). */
import { z } from "zod";
import { catalogByName } from "../catalog/index.js";
import { toolContractSchema } from "../contracts/tool.js";
import { canonicalStringify, deepDiff } from "../engines/data.js";
import { coefficientOfVariation, describe, mean, percentile, round } from "../engines/stats.js";
import { cosineText, jaccard, tokens } from "../engines/text.js";
import { registeredLocalTools } from "../state/stores.js";
import { defineTool, fail, idStr, longText, numArr, reqText, txt, type LocalToolDefinition } from "./types.js";

const testGenerator = defineTool({
  number: 41,
  inputSchema: z.object({
    toolName: idStr().optional(),
    capability: txt(100).optional(),
    inputFields: z.array(z.object({ name: idStr(), type: z.enum(["string", "number", "boolean", "array", "object"]), required: z.boolean(), maxLength: z.number().int().positive().optional(), min: z.number().finite().optional(), max: z.number().finite().optional() })).max(100).optional(),
  }).strict(),
  example: { toolName: "kronos_secret_exposure_scanner", inputFields: [{ name: "text", type: "string", required: true, maxLength: 1000 }] },
  handler: (input) => {
    const catalog = input.toolName ? catalogByName(input.toolName) : undefined;
    const fields = input.inputFields ?? [];
    const cases: Record<string, unknown>[] = [
      { id: "happy_path", kind: "valido", description: "Entrada mínima válida con todos los campos obligatorios.", expectError: false },
      { id: "extra_keys", kind: "limite", description: "Entrada válida más una clave no declarada: debe rechazarse si el esquema es estricto.", expectError: true },
      { id: "empty_input", kind: "limite", description: "Objeto vacío.", expectError: fields.some((f) => f.required) },
    ];
    for (const field of fields) {
      if (field.required) cases.push({ id: `missing_${field.name}`, kind: "obligatorio", description: `Falta el campo obligatorio ${field.name}.`, expectError: true });
      cases.push({ id: `wrong_type_${field.name}`, kind: "tipo", description: `${field.name} con un tipo distinto de ${field.type}.`, expectError: true });
      if (field.type === "string" && field.maxLength) cases.push({ id: `overflow_${field.name}`, kind: "limite", description: `${field.name} supera maxLength=${field.maxLength}.`, expectError: true });
      if (field.type === "number" && (field.min !== undefined || field.max !== undefined)) {
        cases.push({ id: `below_min_${field.name}`, kind: "limite", description: `${field.name} por debajo del mínimo.`, expectError: true });
        cases.push({ id: `above_max_${field.name}`, kind: "limite", description: `${field.name} por encima del máximo.`, expectError: true });
        cases.push({ id: `on_bounds_${field.name}`, kind: "limite", description: `${field.name} exactamente en los límites.`, expectError: false });
      }
      if (field.type === "array") cases.push({ id: `empty_array_${field.name}`, kind: "limite", description: `${field.name} vacío: verificar el comportamiento declarado.`, expectError: field.required });
    }
    cases.push({ id: "determinism", kind: "repeticion", description: "La misma entrada dos veces produce la misma salida (salvo campos de tiempo declarados).", expectError: false });
    return {
      summary: `${cases.length} casos de prueba generados${catalog ? ` para ${catalog.name} (${catalog.nickname})` : ""}.`,
      data: { tool: catalog ? { name: catalog.name, nickname: catalog.nickname, capability: catalog.capability } : null, capability: input.capability ?? catalog?.capability ?? null, cases },
      warnings: input.toolName && !catalog ? [`«${input.toolName}» no está en el catálogo; se generó una batería genérica.`] : [],
    };
  },
});

const benchmarkRunner = defineTool({
  number: 42,
  limitation: "Mide las herramientas locales de este servidor ejecutando su ejemplo dentro del proceso; las de estado pueden alterar su memoria durante la medición.",
  inputSchema: z.object({
    toolNames: z.array(idStr()).min(1).max(20),
    iterations: z.number().int().min(1).max(50).optional(),
  }).strict(),
  example: { toolNames: ["kronos_risk_scoring_engine", "kronos_dependency_graph_planner"], iterations: 5 },
  handler: async (input) => {
    const iterations = input.iterations ?? 10;
    const results: Record<string, unknown>[] = [];
    for (const name of input.toolNames) {
      const definition = registeredLocalTools.get(name);
      if (!definition) { results.push({ tool: name, error: "NOT_FOUND" }); continue; }
      const durations: number[] = [];
      let errors = 0;
      for (let i = 0; i < iterations; i += 1) {
        const start = performance.now();
        try { await definition.run(definition.example); } catch { errors += 1; }
        durations.push(performance.now() - start);
      }
      results.push({ tool: name, iterations, errors, meanMs: round(mean(durations), 3), p95Ms: round(percentile(durations, 95), 3), minMs: round(Math.min(...durations), 3), maxMs: round(Math.max(...durations), 3) });
    }
    const ok = results.filter((r) => r.error === undefined) as { tool: string; meanMs: number }[];
    return {
      summary: ok.length > 0 ? `Más rápida en media: ${[...ok].sort((a, b) => a.meanMs - b.meanMs)[0].tool}.` : "Ninguna herramienta válida para medir.",
      data: { results, note: "Medición dentro del proceso con la entrada de ejemplo de cada herramienta; orientativa, no de producción." },
    };
  },
});

const accuracyEvaluator = defineTool({
  number: 43,
  inputSchema: z.object({
    mode: z.enum(["text", "json", "numeric"]),
    reference: z.unknown(),
    candidate: z.unknown(),
    tolerance: z.number().nonnegative().optional(),
  }).strict(),
  example: { mode: "text", reference: "El zorro marrón salta sobre el perro", candidate: "El zorro salta sobre el perro marrón" },
  handler: (input) => {
    if (input.mode === "numeric") {
      if (typeof input.reference !== "number" || typeof input.candidate !== "number") fail("INVALID_INPUT");
      const ref = input.reference as number;
      const cand = input.candidate as number;
      const absErr = Math.abs(ref - cand);
      const relErr = ref !== 0 ? absErr / Math.abs(ref) : absErr;
      const within = input.tolerance !== undefined ? absErr <= input.tolerance : absErr === 0;
      return { summary: `Error absoluto ${round(absErr, 6)} (${round(relErr * 100, 2)}% relativo).`, data: { exact: absErr === 0, withinTolerance: within, absoluteError: round(absErr, 6), relativeErrorPct: round(relErr * 100, 4) } };
    }
    if (input.mode === "json") {
      const diffs = deepDiff(input.reference, input.candidate);
      const exact = diffs.length === 0;
      const countLeaves = (v: unknown): number => (typeof v === "object" && v !== null ? Math.max(1, Object.values(v as Record<string, unknown>).reduce<number>((a, c) => a + countLeaves(c), 0)) : 1);
      const total = Math.max(1, countLeaves(input.reference));
      const warnings = diffs.length >= 100 ? ["Diferencias truncadas a 100"] : [];
      return { summary: exact ? "Salida idéntica a la referencia." : `${diffs.length} diferencias frente a la referencia.`, data: { exact, similarityApproxPct: round(Math.max(0, (1 - diffs.length / total)) * 100, 1), differences: diffs.slice(0, 50) }, warnings };
    }
    const ref = String(input.reference ?? "");
    const cand = String(input.candidate ?? "");
    return {
      summary: `Similitud coseno ${round(cosineText(ref, cand), 3)}; Jaccard ${round(jaccard(tokens(ref), tokens(cand)), 3)}.`,
      data: { exact: ref === cand, cosine: round(cosineText(ref, cand), 4), jaccard: round(jaccard(tokens(ref), tokens(cand)), 4), tokenPrecision: round(tokens(cand).length ? tokens(cand).filter((t) => tokens(ref).includes(t)).length / tokens(cand).length : 0, 4), tokenRecall: round(tokens(ref).length ? tokens(ref).filter((t) => tokens(cand).includes(t)).length / tokens(ref).length : 0, 4) },
    };
  },
});

const stressTestGenerator = defineTool({
  number: 44,
  limitation: "Genera el diseño de la prueba; ejecutar carga contra un sistema requiere un ejecutor externo y autorización sobre el objetivo.",
  inputSchema: z.object({
    target: reqText(500),
    expectedPeakUsers: z.number().int().positive().max(10_000_000),
    durationMinutes: z.number().int().min(1).max(1_440).optional(),
    errorAbortPct: z.number().positive().max(100).optional(),
    p95AbortMs: z.number().positive().max(600_000).optional(),
  }).strict(),
  example: { target: "API pública de KRONOS (entorno de pruebas)", expectedPeakUsers: 500, durationMinutes: 30 },
  handler: (input) => {
    const peak = input.expectedPeakUsers;
    const duration = input.durationMinutes ?? 30;
    const stages = [
      { name: "calentamiento", users: Math.max(1, Math.round(peak * 0.05)), minutes: Math.max(1, Math.round(duration * 0.1)), purpose: "Verificar que el escenario funciona y calentar cachés" },
      { name: "rampa", users: Math.round(peak * 0.5), minutes: Math.max(1, Math.round(duration * 0.25)), purpose: "Subida gradual buscando el primer cuello de botella" },
      { name: "pico_esperado", users: peak, minutes: Math.max(1, Math.round(duration * 0.35)), purpose: "Carga de trabajo objetivo" },
      { name: "estres", users: Math.round(peak * 1.5), minutes: Math.max(1, Math.round(duration * 0.2)), purpose: "Por encima del pico para encontrar margen y modo de fallo" },
      { name: "recuperacion", users: Math.max(1, Math.round(peak * 0.1)), minutes: Math.max(1, Math.round(duration * 0.1)), purpose: "Comprobar que el sistema vuelve a latencias normales" },
    ];
    return {
      summary: `Plan de carga de ${stages.length} etapas para ${input.target} (pico ${peak} usuarios).`,
      data: { target: input.target, stages, abortCriteria: { errorRatePctAbove: input.errorAbortPct ?? 5, p95MsAbove: input.p95AbortMs ?? 2000 }, safety: ["Ejecutar solo contra entornos autorizados y propios", "Detener al alcanzar cualquier criterio de aborto", "Nunca ejecutar este plan contra producción sin ventana acordada"] },
    };
  },
});

const coverageAnalyzer = defineTool({
  number: 45,
  inputSchema: z.object({
    paths: z.array(z.object({ id: idStr(), steps: z.array(idStr()).max(200) })).min(1).max(500),
    tests: z.array(z.object({ name: idStr(), coveredPathIds: z.array(idStr()).max(500).optional(), coveredSteps: z.array(idStr()).max(1_000).optional() })).max(1_000),
  }).strict(),
  example: { paths: [{ id: "p1", steps: ["login", "pagar"] }, { id: "p2", steps: ["login", "cancelar"] }], tests: [{ name: "compra feliz", coveredPathIds: ["p1"] }] },
  handler: (input) => {
    const coveredPaths = new Set(input.tests.flatMap((t) => t.coveredPathIds ?? []));
    const coveredSteps = new Set(input.tests.flatMap((t) => t.coveredSteps ?? []));
    for (const path of input.paths) if (coveredPaths.has(path.id)) path.steps.forEach((s) => coveredSteps.add(s));
    const allSteps = [...new Set(input.paths.flatMap((p) => p.steps))];
    const uncoveredPaths = input.paths.filter((p) => !coveredPaths.has(p.id)).map((p) => p.id);
    return {
      summary: `Cobertura de caminos ${round(((input.paths.length - uncoveredPaths.length) / input.paths.length) * 100, 1)}%; de pasos ${round((coveredSteps.size / Math.max(1, allSteps.length)) * 100, 1)}%.`,
      data: { pathCoveragePct: round(((input.paths.length - uncoveredPaths.length) / input.paths.length) * 100, 1), stepCoveragePct: round((coveredSteps.size / Math.max(1, allSteps.length)) * 100, 1), uncoveredPaths, uncoveredSteps: allSteps.filter((s) => !coveredSteps.has(s)), priorityGaps: uncoveredPaths.map((id) => `Sin pruebas: ${id}`) },
    };
  },
});

const expectedComparator = defineTool({
  number: 46,
  inputSchema: z.object({
    expected: z.unknown(),
    actual: z.unknown(),
    numericTolerance: z.number().nonnegative().optional(),
    caseSensitive: z.boolean().optional(),
  }).strict(),
  example: { expected: { status: "ok", total: 3 }, actual: { status: "ok", total: 4, extra: true } },
  handler: (input) => {
    const tolerance = input.numericTolerance ?? 0;
    const norm = (v: unknown): unknown => {
      if (typeof v === "string" && input.caseSensitive === false) return v.toLowerCase();
      return v;
    };
    let diffs = deepDiff(input.expected, input.actual);
    if (tolerance > 0) {
      diffs = diffs.filter((d) => !(d.kind === "changed" && typeof d.expected === "number" && typeof d.actual === "number" && Math.abs(d.expected - d.actual) <= tolerance));
    }
    if (input.caseSensitive === false) {
      diffs = diffs.filter((d) => canonicalStringify(norm(d.expected)) !== canonicalStringify(norm(d.actual)));
    }
    const warnings = diffs.length >= 100 ? ["Diferencias truncadas a 100"] : [];
    return {
      summary: diffs.length === 0 ? "El resultado coincide con lo esperado." : `${diffs.length} diferencias frente a lo esperado.`,
      data: { matches: diffs.length === 0, differences: diffs.slice(0, 100), differenceCount: diffs.length },
      warnings,
    };
  },
});

const repeatability = defineTool({
  number: 47,
  inputSchema: z.object({
    runs: z.array(z.unknown()).min(2).max(1_000),
  }).strict(),
  example: { runs: [42, 42, 43, 42, 42] },
  handler: (input) => {
    const canonical = input.runs.map((r) => canonicalStringify(r));
    const counts = new Map<string, number>();
    for (const c of canonical) counts.set(c, (counts.get(c) ?? 0) + 1);
    const [modalValue, modalCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const numeric = input.runs.every((r) => typeof r === "number");
    const numbers = numeric ? (input.runs as number[]) : [];
    const cv = numeric ? coefficientOfVariation(numbers) : null;
    const identicalPct = round((modalCount / input.runs.length) * 100, 1);
    const verdict = identicalPct === 100 ? "totalmente_repetible" : identicalPct >= 80 ? "mayormente_repetible" : "poco_repetible";
    void modalValue;
    return {
      summary: `Repetibilidad: ${identicalPct}% de ejecuciones idénticas al resultado modal (${counts.size} resultados únicos).`,
      data: { verdict, uniqueOutputs: counts.size, identicalToModalPct: identicalPct, numericStats: numeric ? { ...describe(numbers), coefficientOfVariation: round(cv ?? 0, 4) } : null, distribution: [...counts.entries()].map(([value, count]) => ({ value: String(value).slice(0, 200), count })).slice(0, 20) },
    };
  },
});

const contractTester = defineTool({
  number: 48,
  inputSchema: z.object({
    contract: z.record(z.string(), z.unknown()),
    cases: z.array(z.object({ input: z.record(z.string(), z.unknown()), expectError: z.boolean() })).max(100).optional(),
    declaredInputFields: z.array(z.object({ name: idStr(), required: z.boolean() })).max(100).optional(),
  }).strict(),
  example: { contract: { name: "kronos_demo_tool", description: "Demo", capability: "testing", readOnly: true, destructive: false, openWorld: false }, declaredInputFields: [{ name: "query", required: true }], cases: [{ input: {}, expectError: true }, { input: { query: "hola" }, expectError: false }] },
  handler: (input) => {
    const contractResult = toolContractSchema.safeParse(input.contract);
    const contractIssues = contractResult.success ? [] : contractResult.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`);
    const declared = new Set((input.declaredInputFields ?? []).map((f) => f.name));
    const required = (input.declaredInputFields ?? []).filter((f) => f.required).map((f) => f.name);
    const caseResults = (input.cases ?? []).map((c, i) => {
      const missing = required.filter((r) => !(r in c.input));
      const unknown = declared.size > 0 ? Object.keys(c.input).filter((k) => !declared.has(k)) : [];
      const wouldError = missing.length > 0 || unknown.length > 0;
      return { caseIndex: i, expectError: c.expectError, predictedError: wouldError, matchesExpectation: wouldError === c.expectError, missing, unknown };
    });
    return {
      summary: contractResult.success ? "El contrato es válido según toolContractSchema." : `Contrato inválido: ${contractIssues.length} problemas.`,
      data: { contractValid: contractResult.success, contractIssues, caseResults, inconsistentCases: caseResults.filter((r) => !r.matchesExpectation).map((r) => r.caseIndex) },
    };
  },
});

const mutationGenerator = defineTool({
  number: 49,
  limitation: "Genera mutantes textuales para medir la eficacia de las pruebas; no los ejecuta ni garantiza que compilen.",
  inputSchema: z.object({ code: longText(), maxMutants: z.number().int().min(1).max(200).optional() }).strict(),
  example: { code: "if (total >= 10 && active === true) { return total + 1; }", maxMutants: 10 },
  handler: (input) => {
    z.string().min(1).parse(input.code);
    const operators: { kind: string; regex: RegExp; swaps: Record<string, string> }[] = [
      { kind: "comparacion", regex: />=|<=|===|!==|==|!=|>|</g, swaps: { ">=": ">", "<=": "<", "===": "!==", "!==": "===", "==": "!=", "!=": "==", ">": "<", "<": ">" } },
      { kind: "aritmetica", regex: /(?<=\s)[+\-*/](?=\s)/g, swaps: { "+": "-", "-": "+", "*": "/", "/": "*" } },
      { kind: "logica", regex: /&&|\|\||\btrue\b|\bfalse\b/g, swaps: { "&&": "||", "||": "&&", true: "false", false: "true" } },
      { kind: "literal_numerico", regex: /\b\d+\b/g, swaps: {} },
    ];
    const mutants: Record<string, unknown>[] = [];
    const cap = input.maxMutants ?? 50;
    for (const op of operators) {
      op.regex.lastIndex = 0;
      for (const m of input.code.matchAll(op.regex)) {
        if (mutants.length >= cap) break;
        const index = m.index ?? 0;
        const original = m[0];
        const replacement = op.kind === "literal_numerico" ? String(Number(original) + 1) : op.swaps[original];
        if (!replacement || replacement === original) continue;
        mutants.push({ id: `mut_${mutants.length + 1}`, kind: op.kind, position: index, original, replacement, mutatedSnippet: (input.code.slice(0, index) + replacement + input.code.slice(index + original.length)).slice(0, 500), detectionHint: `Una prueba debería fallar si «${original}» se convierte en «${replacement}» aquí; si ninguna falla, falta cobertura.` });
      }
    }
    return { summary: `${mutants.length} mutantes generados (tope ${cap}).`, data: { mutants } };
  },
});

const thresholdCalibrator = defineTool({
  number: 50,
  inputSchema: z.object({
    samples: z.array(z.object({ score: z.number().finite(), label: z.enum(["good", "bad"]) })).min(2).max(10_000),
    currentThreshold: z.number().finite().optional(),
  }).strict(),
  example: { samples: [{ score: 0.9, label: "good" }, { score: 0.7, label: "good" }, { score: 0.4, label: "bad" }, { score: 0.2, label: "bad" }], currentThreshold: 0.5 },
  handler: (input) => {
    const evaluate = (threshold: number) => {
      let tp = 0, fp = 0, tn = 0, fn = 0;
      for (const s of input.samples) {
        const predictedGood = s.score >= threshold;
        if (predictedGood && s.label === "good") tp += 1;
        else if (predictedGood && s.label === "bad") fp += 1;
        else if (!predictedGood && s.label === "bad") tn += 1;
        else fn += 1;
      }
      const accuracy = (tp + tn) / input.samples.length;
      const tpr = tp + fn === 0 ? 1 : tp / (tp + fn);
      const tnr = tn + fp === 0 ? 1 : tn / (tn + fp);
      return { threshold, accuracy: round(accuracy, 4), youdenJ: round(tpr + tnr - 1, 4), confusion: { tp, fp, tn, fn } };
    };
    const candidates = [...new Set(input.samples.map((s) => s.score))].sort((a, b) => a - b);
    const evaluated = candidates.map(evaluate);
    const best = [...evaluated].sort((a, b) => b.youdenJ - a.youdenJ || b.accuracy - a.accuracy)[0];
    return {
      summary: `Umbral sugerido ${best.threshold} (J de Youden ${best.youdenJ}, exactitud ${round(best.accuracy * 100, 1)}%).`,
      data: { suggestedThreshold: best.threshold, atSuggested: best, atCurrent: input.currentThreshold !== undefined ? evaluate(input.currentThreshold) : null, sampleCount: input.samples.length },
    };
  },
});

// numArr se exporta para otros bancos de pruebas internos.
void numArr;

export const f05: LocalToolDefinition[] = [testGenerator, benchmarkRunner, accuracyEvaluator, stressTestGenerator, coverageAnalyzer, expectedComparator, repeatability, contractTester, mutationGenerator, thresholdCalibrator];
