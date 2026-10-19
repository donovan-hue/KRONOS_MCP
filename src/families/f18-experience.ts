/** Familia 18 — Experiencia, personalización y accesibilidad (herramientas 171-180). */
import { z } from "zod";
import { TOOLS_180 } from "../catalog/index.js";
import { extractHeadings, extractImages, extractLinks, htmlToText } from "../engines/data.js";
import { contrastRatio } from "../engines/media.js";
import { mean, round, sum } from "../engines/stats.js";
import { readability, sentences, tokens } from "../engines/text.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const preferenceResolver = defineTool({
  number: 171,
  inputSchema: z.object({
    defaults: z.record(z.string(), z.unknown()),
    userPreferences: z.record(z.string(), z.unknown()).optional(),
    sessionOverrides: z.record(z.string(), z.unknown()).optional(),
    allowedKeys: strArr(200, 100).optional(),
  }).strict(),
  example: { defaults: { formato: "16:9", tono: "neutro", idioma: "es" }, userPreferences: { formato: "9:16" }, sessionOverrides: { tono: "directo" } },
  handler: (input) => {
    const layers = [
      ["defaults", input.defaults],
      ["userPreferences", input.userPreferences ?? {}],
      ["sessionOverrides", input.sessionOverrides ?? {}],
    ] as const;
    const allowed = input.allowedKeys ? new Set(input.allowedKeys) : null;
    const resolved: Record<string, unknown> = {};
    const sources: Record<string, string> = {};
    const ignored: string[] = [];
    for (const [layerName, layer] of layers) {
      for (const [key, value] of Object.entries(layer)) {
        if (allowed && !allowed.has(key)) { ignored.push(`${layerName}:${key}`); continue; }
        if (value === null || value === undefined) continue;
        resolved[key] = value;
        sources[key] = layerName;
      }
    }
    return {
      summary: `${Object.keys(resolved).length} preferencias resueltas (prioridad: sesión > usuario > valores por defecto).`,
      data: { resolved, sources, ignoredDisallowedKeys: ignored },
    };
  },
});

const templateBuilder = defineTool({
  number: 172,
  inputSchema: z.object({
    templateId: idStr(),
    steps: z.array(z.object({ tool: idStr(), params: z.record(z.string(), z.unknown()).optional(), alias: txt(100).optional() })).min(1).max(100),
    variableKeys: strArr(100, 100),
  }).strict(),
  example: { templateId: "flujo-video", steps: [{ tool: "kronos_script_outline_generator", params: { topic: "subtítulos", format: "video" } }, { tool: "kronos_platform_format_adapter", params: { platform: "x_post", text: "publicado" } }], variableKeys: ["topic", "text"] },
  handler: (input) => {
    const knownNames = new Set(TOOLS_180.map((t) => t.name));
    const unknown = input.steps.filter((s) => !knownNames.has(s.tool)).map((s) => s.tool);
    const variables = new Set<string>();
    const templatedSteps = input.steps.map((step, i) => {
      const params: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(step.params ?? {})) {
        if (input.variableKeys.includes(key)) {
          params[key] = `{{${key}}}`;
          variables.add(key);
        } else params[key] = value;
      }
      return { order: i + 1, tool: step.tool, alias: step.alias ?? `paso_${i + 1}`, params };
    });
    return {
      summary: `Plantilla «${input.templateId}» con ${templatedSteps.length} pasos y ${variables.size} variables.`,
      data: { template: { id: input.templateId, steps: templatedSteps, requiredVariables: [...variables], howToUse: "Sustituye cada {{variable}} y ejecuta los pasos en orden con las herramientas indicadas." } },
      warnings: unknown.length > 0 ? [`Herramientas fuera del catálogo de 180: ${unknown.join(", ")}`] : [],
    };
  },
});

const taskGuidance = defineTool({
  number: 173,
  inputSchema: z.object({
    steps: z.array(z.object({ id: idStr(), label: txt(500), requiredInputs: strArr(50, 100), hint: txt(1_000).optional() })).min(1).max(100),
    providedInputs: z.record(z.string(), z.unknown()),
  }).strict(),
  example: { steps: [{ id: "datos", label: "Datos del vídeo", requiredInputs: ["titulo", "duracion"] }, { id: "publicacion", label: "Publicación", requiredInputs: ["plataforma", "fecha"], hint: "La fecha debe ser futura" }], providedInputs: { titulo: "Demo" } },
  handler: (input) => {
    const has = (key: string) => { const v = input.providedInputs[key]; return v !== undefined && v !== null && v !== ""; };
    const progress = input.steps.map((step, i) => {
      const missing = step.requiredInputs.filter((key) => !has(key));
      return { order: i + 1, id: step.id, label: step.label, status: missing.length === 0 ? "ready" : "waiting_inputs", missingInputs: missing, hint: step.hint ?? null };
    });
    const current = progress.find((p) => p.status === "waiting_inputs") ?? null;
    const totalRequired = sum(input.steps.map((s) => s.requiredInputs.length));
    const provided = totalRequired - sum(progress.map((p) => p.missingInputs.length));
    return {
      summary: current ? `Estás en: ${current.label} (faltan ${current.missingInputs.join(", ")}).` : "Tienes todo lo necesario para completar el flujo.",
      data: { progress, currentStep: current, completionPercent: totalRequired > 0 ? round((provided / totalRequired) * 100, 1) : 100, nextQuestion: current ? `Para «${current.label}» necesito: ${current.missingInputs.join(", ")}.` : null },
    };
  },
});

const hexColor = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "color hex");

const accessibilityChecker = defineTool({
  number: 174,
  limitation: "Revisión automática parcial (alt, encabezados, enlaces, contraste): no sustituye una auditoría WCAG completa con tecnologías de asistencia.",
  inputSchema: z.object({
    html: longText().optional(),
    colorPairs: z.array(z.object({ fg: hexColor, bg: hexColor, largeText: z.boolean().optional(), label: txt(200).optional() })).max(100).optional(),
  }).strict(),
  example: { html: "<h1>Título</h1><h3>Salto</h3><img src=\"foto.jpg\"><a href=\"/x\">haz clic aquí</a>", colorPairs: [{ fg: "#777777", bg: "#FFFFFF", label: "texto secundario" }] },
  handler: (input) => {
    if (!input.html && !input.colorPairs?.length) fail("INVALID_INPUT");
    const findings: Record<string, unknown>[] = [];
    if (input.html) {
      for (const img of extractImages(input.html)) if (img.alt === null) findings.push({ kind: "missing_alt", wcag: "1.1.1", detail: `Imagen sin texto alternativo: ${img.src || "(sin src)"}`, severity: "high" });
      const headings = extractHeadings(input.html);
      for (let i = 1; i < headings.length; i += 1) if (headings[i].level > headings[i - 1].level + 1) findings.push({ kind: "heading_skip", wcag: "1.3.1", detail: `Salto de h${headings[i - 1].level} a h${headings[i].level} en «${headings[i].text.slice(0, 60)}»`, severity: "medium" });
      if (headings.filter((h) => h.level === 1).length > 1) findings.push({ kind: "multiple_h1", wcag: "1.3.1", detail: "Más de un h1 en la página", severity: "low" });
      for (const link of extractLinks(input.html)) {
        const label = link.text.trim().toLowerCase();
        if (label === "" || /^(clic|click|haz clic|aquí|aqui|here|más|mas|enlace|link)$/.test(label)) findings.push({ kind: "non_descriptive_link", wcag: "2.4.4", detail: `Enlace poco descriptivo: «${link.text || "(vacío)"}» -> ${link.href}`, severity: "medium" });
      }
      if (!/<html[^>]*\blang=/i.test(input.html)) findings.push({ kind: "missing_lang", wcag: "3.1.1", detail: "Falta el atributo lang en <html>", severity: "medium" });
      if (/<marquee|<blink|autoplay/i.test(input.html)) findings.push({ kind: "auto_motion", wcag: "2.2.2", detail: "Contenido con movimiento/reproducción automática", severity: "medium" });
    }
    const contrastChecks = (input.colorPairs ?? []).map((pair) => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      const aaRequirement = pair.largeText ? 3 : 4.5;
      const aaaRequirement = pair.largeText ? 4.5 : 7;
      const result = { label: pair.label ?? `${pair.fg} sobre ${pair.bg}`, ratio, passesAA: ratio >= aaRequirement, passesAAA: ratio >= aaaRequirement, aaRequirement };
      if (!result.passesAA) findings.push({ kind: "low_contrast", wcag: "1.4.3", detail: `${result.label}: ${ratio}:1 (AA exige ${aaRequirement}:1)`, severity: "high" });
      return result;
    });
    return {
      summary: `${findings.length} hallazgos de accesibilidad (${findings.filter((f) => f.severity === "high").length} graves).`,
      data: { findings, contrastChecks, passesBasicAutomatedChecks: findings.every((f) => f.severity === "low") },
    };
  },
});

const localizationRouter = defineTool({
  number: 175,
  limitation: "No traduce: mide cobertura por idioma, detecta claves faltantes/sobrantes y puede generar pseudo-localización para probar la interfaz.",
  inputSchema: z.object({
    sourceStrings: z.record(z.string(), z.string().max(5_000)),
    translations: z.record(z.string(), z.record(z.string(), z.string().max(5_000))).optional(),
    targetLocales: strArr(50, 20).optional(),
    pseudoLocalize: z.boolean().optional(),
  }).strict(),
  example: { sourceStrings: { saludo: "Hola", despedida: "Adiós", publicar: "Publicar" }, translations: { en: { saludo: "Hello", publicar: "Publish", clave_vieja: "Old" } }, pseudoLocalize: true },
  handler: (input) => {
    const sourceKeys = Object.keys(input.sourceStrings);
    const locales = input.targetLocales?.length ? input.targetLocales : Object.keys(input.translations ?? {});
    const perLocale = locales.map((locale) => {
      const translated = input.translations?.[locale] ?? {};
      const covered = sourceKeys.filter((key) => typeof translated[key] === "string" && translated[key].trim().length > 0 && translated[key] !== input.sourceStrings[key]);
      const identicalToSource = sourceKeys.filter((key) => translated[key] === input.sourceStrings[key]);
      const missing = sourceKeys.filter((key) => !(key in translated));
      const extra = Object.keys(translated).filter((key) => !(key in input.sourceStrings));
      const coveragePct = sourceKeys.length > 0 ? round((covered.length / sourceKeys.length) * 100, 1) : 100;
      return { locale, coveragePct, missing, identicalToSource, extra, route: coveragePct >= 95 ? "listo_para_publicar" : coveragePct >= 50 ? "traduccion_parcial" : "necesita_traduccion" };
    });
    const accent = (s: string) => s.replace(/[aeiouAEIOU]/g, (c) => ({ a: "á", e: "é", i: "ï", o: "ö", u: "ü", A: "Á", E: "É", I: "Ï", O: "Ö", U: "Ü" }[c] ?? c));
    return {
      summary: `Cobertura por idioma: ${perLocale.map((l) => `${l.locale} ${l.coveragePct}%`).join(", ") || "sin idiomas objetivo"}.`,
      data: { locales: perLocale, pseudoLocalized: input.pseudoLocalize ? Object.fromEntries(Object.entries(input.sourceStrings).map(([key, value]) => [`pseudo:${key}`, `[!!! ${accent(value)} !!!]`])) : null, note: "La pseudo-localización alarga ~30% visualmente para detectar textos cortados en la interfaz." },
    };
  },
});

const complexityReducer = defineTool({
  number: 176,
  inputSchema: z.object({ text: longText(), maxSentenceWords: z.number().int().min(5).max(100).optional() }).strict(),
  example: { text: "Es importante tener en cuenta que, debido a la circunstancia de que el procesamiento previo de los materiales no fue llevado a cabo de manera adecuada por parte del equipo encargado, la sincronización final de los subtítulos con la pista de audio correspondiente podría presentar determinadas desviaciones temporales significativas.", maxSentenceWords: 18 },
  handler: (input) => {
    const before = readability(input.text);
    const maxWords = input.maxSentenceWords ?? 18;
    const fillers: [RegExp, string][] = [
      [/es importante tener en cuenta que\s*/gi, ""],
      [/debido a la circunstancia de que/gi, "porque"],
      [/de manera adecuada/gi, "bien"],
      [/por parte de/gi, "por"],
      [/llevar a cabo/gi, "hacer"],
      [/con el objetivo de/gi, "para"],
      [/\bcorrespondiente\b/gi, ""],
      [/\bprevio\b/gi, ""],
      [/\bdeterminadas?\b/gi, ""],
    ];
    let simplified = input.text;
    const appliedSimplifications: string[] = [];
    for (const [pattern, replacement] of fillers) {
      if (pattern.test(simplified)) { simplified = simplified.replace(pattern, replacement); appliedSimplifications.push(pattern.source); }
      pattern.lastIndex = 0;
    }
    // Trocear oraciones muy largas por comas/coordinantes, de forma mecánica y revisable.
    const longSentences = sentences(input.text).filter((s) => tokens(s, { dropStopwords: false }).length > maxWords);
    const splitSuggestions = longSentences.map((sentence) => {
      const parts = sentence.split(/,\s+(?=(?:y|pero|porque|que|lo que|de modo que)\s)/).map((p) => p.trim()).filter(Boolean);
      return { original: sentence.slice(0, 300), suggestedSplit: parts.length > 1 ? parts.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)) : ["Busca unacoma o un «y» para dividir; no hubo punto seguro automático."], words: tokens(sentence, { dropStopwords: false }).length };
    });
    simplified = simplified.replace(/\s+/g, " ").trim();
    const after = readability(simplified);
    return {
      summary: `Legibilidad (Fernández Huerta) de ${before.fernandezHuerta} a ${after.fernandezHuerta}; ${longSentences.length} oraciones sobre ${maxWords} palabras.`,
      data: { before, after, simplifiedText: simplified, appliedPhraseSimplifications: appliedSimplifications, splitSuggestions: splitSuggestions.slice(0, 20), caution: "Simplificación mecánica de muletillas frecuentes: revisa el resultado, puede alterar el matiz." },
    };
  },
});

const personalizationEngine = defineTool({
  number: 177,
  inputSchema: z.object({
    steps: z.array(z.object({ id: idStr(), label: txt(300).optional(), optional: z.boolean().optional(), category: txt(100).optional() })).min(1).max(200),
    preferences: z.object({ skipOptionalCategories: strArr(50, 100).optional(), preferredFirstCategory: txt(100).optional(), verbosity: z.enum(["concise", "detailed"]).optional() }).strict().optional(),
    pastBehavior: z.object({ skippedStepIds: z.array(idStr()).max(500).optional(), timesSkippedThreshold: z.number().int().min(1).max(100).optional() }).strict().optional(),
  }).strict(),
  example: { steps: [{ id: "revisar", label: "Revisar", optional: false, category: "calidad" }, { id: "miniatura_extra", label: "Miniatura extra", optional: true, category: "diseno" }, { id: "publicar", label: "Publicar", optional: false, category: "salida" }], preferences: { skipOptionalCategories: ["diseno"] }, pastBehavior: { skippedStepIds: ["miniatura_extra"] } },
  handler: (input) => {
    const skipCategories = new Set(input.preferences?.skipOptionalCategories ?? []);
    const skippedBefore = new Set(input.pastBehavior?.skippedStepIds ?? []);
    const adapted = input.steps.map((step) => {
      const reasons: string[] = [];
      let action: "keep" | "skip" | "keep_required_despite_preference" = "keep";
      const wantsSkip = (step.category !== undefined && skipCategories.has(step.category)) || skippedBefore.has(step.id);
      if (wantsSkip && step.optional) { action = "skip"; reasons.push(step.category && skipCategories.has(step.category) ? `Categoría «${step.category}» marcada para omitir` : "Omitido en ejecuciones anteriores"); }
      else if (wantsSkip && !step.optional) { action = "keep_required_despite_preference"; reasons.push("La preferencia lo omitiría, pero el paso es obligatorio"); }
      if (input.preferences?.verbosity) reasons.push(`Verbosidad aplicada: ${input.preferences.verbosity}`);
      return { id: step.id, label: step.label ?? step.id, action, reasons };
    });
    const ordered = input.preferences?.preferredFirstCategory
      ? [...adapted].sort((a, b) => {
        const categoryOf = (id: string) => input.steps.find((s) => s.id === id)?.category;
        const rank = (id: string) => categoryOf(id) === input.preferences!.preferredFirstCategory ? 0 : 1;
        return rank(a.id) - rank(b.id);
      })
      : adapted;
    return {
      summary: `Flujo personalizado: ${adapted.filter((a) => a.action === "skip").length} pasos omitidos, ${adapted.filter((a) => a.action === "keep_required_despite_preference").length} obligatorios conservados.`,
      data: { personalizedSteps: ordered.filter((a) => a.action !== "skip"), skipped: adapted.filter((a) => a.action === "skip"), conflicts: adapted.filter((a) => a.action === "keep_required_despite_preference") },
    };
  },
});

const explanationGenerator = defineTool({
  number: 178,
  inputSchema: z.object({
    chosen: idStr(),
    alternatives: z.array(z.object({ id: idStr(), scores: z.record(z.string(), z.number().finite()) })).min(1).max(100),
    factors: z.array(z.object({ name: idStr(), weight: z.number().positive(), direction: z.enum(["higher_is_better", "lower_is_better"]).optional() })).min(1).max(50),
  }).strict(),
  example: { chosen: "prov-b", alternatives: [{ id: "prov-a", scores: { calidad: 9, coste: 0.4 } }, { id: "prov-b", scores: { calidad: 8, coste: 0.1 } }], factors: [{ name: "calidad", weight: 2 }, { name: "coste", weight: 3, direction: "lower_is_better" }] },
  handler: (input) => {
    const chosenAlt = input.alternatives.find((a) => a.id === input.chosen);
    if (!chosenAlt) fail("NOT_FOUND");
    const factorAnalysis = input.factors.map((factor) => {
      const values = input.alternatives.map((a) => a.scores[factor.name]).filter((v): v is number => v !== undefined);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const chosenValue = chosenAlt!.scores[factor.name];
      const normalized = chosenValue === undefined ? null : max === min ? 1 : (factor.direction ?? "higher_is_better") === "higher_is_better" ? (chosenValue - min) / (max - min) : (max - chosenValue) / (max - min);
      const bestAlternative = input.alternatives.reduce((best, alt) => {
        const v = alt.scores[factor.name];
        if (v === undefined) return best;
        if (!best) return alt;
        const bestV = best.scores[factor.name]!;
        return (factor.direction ?? "higher_is_better") === "higher_is_better" ? (v > bestV ? alt : best) : (v < bestV ? alt : best);
      }, undefined as (typeof input.alternatives)[number] | undefined);
      return { factor: factor.name, weight: factor.weight, chosenValue: chosenValue ?? null, bestOptionForThisFactor: bestAlternative?.id ?? null, chosenAdvantage01: normalized === null ? null : round(normalized, 2), contribution: normalized === null ? 0 : round(normalized * factor.weight, 2) };
    }).sort((a, b) => b.contribution - a.contribution);
    const wonFactors = factorAnalysis.filter((f) => f.bestOptionForThisFactor === input.chosen).map((f) => f.factor);
    const lostFactors = factorAnalysis.filter((f) => f.bestOptionForThisFactor !== input.chosen).map((f) => f.factor);
    const explanation = `Se eligió ${input.chosen} sobre todo por ${factorAnalysis.slice(0, 2).map((f) => `${f.factor} (peso ${f.weight})`).join(" y ")}.${lostFactors.length > 0 ? ` Aun así, pierde frente a otras opciones en: ${lostFactors.join(", ")}.` : " Es además la mejor opción en todos los factores evaluados."}`;
    return {
      summary: explanation,
      data: { chosen: input.chosen, explanation, factorAnalysis, wonFactors, lostFactors },
    };
  },
});

const feedbackTriage = defineTool({
  number: 179,
  inputSchema: z.object({ items: z.array(z.object({ id: idStr(), text: txt(5_000) })).min(1).max(2_000) }).strict(),
  example: { items: [{ id: "f1", text: "La app se cierra al exportar, es urgente, pierdo el trabajo" }, { id: "f2", text: "Me encantaría poder programar publicaciones" }, { id: "f3", text: "Genial el nuevo editor, gracias" }, { id: "f4", text: "¿Cómo cambio el idioma de los subtítulos?" }] },
  handler: (input) => {
    const rules: { category: string; patterns: RegExp[] }[] = [
      { category: "bug", patterns: [/error|falla|fallo|se cierra|no funciona|roto|crash|bug|cuelga/i] },
      { category: "feature_request", patterns: [/me gustar[íi]a|podr[íi]a|añadir|agregar|ser[íi]a genial|ojal[áa]|wish|please add/i] },
      { category: "question", patterns: [/\?|c[óo]mo |d[óo]nde |cu[áa]ndo/i] },
      { category: "praise", patterns: [/genial|gracias|encanta|excelente|perfecto|buen[íi]simo|great|thanks/i] },
      { category: "complaint", patterns: [/caro|lento|horrible|mal[íi]simo|decepcion|frustr/i] },
    ];
    const severityWords = /urgente|pierdo|p[ée]rdida|datos|cr[íi]tico|bloqueado|no puedo trabajar/i;
    const positiveWords = /genial|encanta|gracias|excelente|perfecto|bueno/i;
    const negativeWords = /error|falla|mal|horrible|lento|caro|frustr|problema/i;
    const triaged = input.items.map((item) => {
      const category = rules.find((rule) => rule.patterns.some((p) => p.test(item.text)))?.category ?? "general";
      const sentiment = positiveWords.test(item.text) && !negativeWords.test(item.text) ? "positive" : negativeWords.test(item.text) && !positiveWords.test(item.text) ? "negative" : "mixed_or_neutral";
      const priority = severityWords.test(item.text) || (category === "bug" && sentiment === "negative") ? "high" : category === "bug" || category === "complaint" ? "medium" : "low";
      return { id: item.id, category, sentiment, priority, actionable: category === "bug" ? "Crear incidencia con pasos de reproducción" : category === "feature_request" ? "Registrar en el backlog con la petición textual" : category === "question" ? "Responder y enlazar documentación" : category === "complaint" ? "Revisar causa raíz y responder" : "Archivar como señal" };
    });
    const byCategory = new Map<string, number>();
    for (const t of triaged) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1);
    return {
      summary: `${triaged.length} comentarios clasificados; ${triaged.filter((t) => t.priority === "high").length} prioritarios.`,
      data: { items: triaged, countsByCategory: Object.fromEntries(byCategory), highPriorityIds: triaged.filter((t) => t.priority === "high").map((t) => t.id) },
    };
  },
});

const improvementMiner = defineTool({
  number: 180,
  inputSchema: z.object({
    runs: z.array(z.object({
      workflowId: idStr(), outcome: z.enum(["completed", "failed", "cancelled"]).optional(),
      steps: z.array(z.object({ step: idStr(), status: z.enum(["completed", "failed", "skipped", "retried"]), durationMs: z.number().nonnegative().optional(), retries: z.number().int().nonnegative().optional() })).max(200),
    })).min(1).max(2_000),
  }).strict(),
  example: { runs: [{ workflowId: "w1", steps: [{ step: "render", status: "failed", durationMs: 9000, retries: 2 }, { step: "subir", status: "completed", durationMs: 500 }] }, { workflowId: "w2", steps: [{ step: "render", status: "completed", durationMs: 15000, retries: 1 }, { step: "subir", status: "completed", durationMs: 600 }] }] },
  handler: (input) => {
    const perStep = new Map<string, { runs: number; failures: number; totalDuration: number; durations: number; retries: number; skipped: number }>();
    for (const run of input.runs) {
      for (const step of run.steps) {
        const entry = perStep.get(step.step) ?? { runs: 0, failures: 0, totalDuration: 0, durations: 0, retries: 0, skipped: 0 };
        entry.runs += 1;
        if (step.status === "failed") entry.failures += 1;
        if (step.status === "skipped") entry.skipped += 1;
        if (step.durationMs !== undefined) { entry.totalDuration += step.durationMs; entry.durations += 1; }
        entry.retries += step.retries ?? 0;
        perStep.set(step.step, entry);
      }
    }
    const analyzed = [...perStep.entries()].map(([step, stats]) => {
      const failureRate = stats.runs > 0 ? stats.failures / stats.runs : 0;
      const avgDuration = stats.durations > 0 ? stats.totalDuration / stats.durations : 0;
      const impact = round(failureRate * 60 + Math.min(25, stats.retries * 2) + Math.min(15, avgDuration / 1000), 1);
      const suggestions: string[] = [];
      if (failureRate >= 0.2) suggestions.push("Falla con frecuencia: añade validación previa y una prueba de contrato");
      if (stats.retries >= 3) suggestions.push("Muchos reintentos: revisa idempotencia y el Umbral del circuit breaker");
      if (avgDuration >= 10_000) suggestions.push("Paso lento: candidato a paralelizar o cachear");
      if (stats.skipped / Math.max(1, stats.runs) >= 0.5) suggestions.push("Se omite la mitad de las veces: ¿debería ser opcional o eliminarse?");
      return { step, runs: stats.runs, failureRatePct: round(failureRate * 100, 1), avgDurationMs: round(avgDuration, 1), totalRetries: stats.retries, impactScore: impact, suggestions };
    }).sort((a, b) => b.impactScore - a.impactScore);
    return {
      summary: `Mayor oportunidad de mejora: «${analyzed[0]?.step ?? "-"}» (impacto ${analyzed[0]?.impactScore ?? 0}).`,
      data: { steps: analyzed, runsAnalyzed: input.runs.length, workflowOutcomes: { completed: input.runs.filter((r) => r.outcome === "completed").length, failed: input.runs.filter((r) => r.outcome === "failed").length, unspecified: input.runs.filter((r) => !r.outcome).length } },
    };
  },
});

void htmlToText;

export const f18: LocalToolDefinition[] = [preferenceResolver, templateBuilder, taskGuidance, accessibilityChecker, localizationRouter, complexityReducer, personalizationEngine, explanationGenerator, feedbackTriage, improvementMiner];
