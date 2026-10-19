/** Familia 12 — Multimedia: vídeo y movimiento (herramientas 111-120). */
import { z } from "zod";
import { cropForAspect, orientation, parseRatio, resolutionTier, speechSeconds } from "../engines/media.js";
import { paretoFront, rankCandidates } from "../engines/scoring.js";
import { round, sum } from "../engines/stats.js";
import { sentences, tokens } from "../engines/text.js";
import { buildSrt, type SubtitleCue } from "../engines/time.js";
import { evictOldest, jobQueues } from "../state/stores.js";
import { defineTool, fail, idStr, longText, numArr, strArr, txt, type LocalToolDefinition } from "./types.js";

const videoProviderRouter = defineTool({
  number: 111,
  limitation: "Selecciona proveedor según duración, calidad y coste aportados; no genera el vídeo.",
  inputSchema: z.object({
    requirements: z.object({
      durationSec: z.number().positive().max(86_400), minQuality: z.number().min(0).max(10).optional(),
      maxCost: z.number().nonnegative().optional(), width: z.number().int().positive().max(16_384).optional(), height: z.number().int().positive().max(16_384).optional(),
    }).strict(),
    providers: z.array(z.object({
      id: idStr(), quality: z.number().min(0).max(10), costPerSecond: z.number().nonnegative(),
      maxDurationSec: z.number().positive().max(86_400), maxWidth: z.number().int().positive().max(16_384).optional(),
      available: z.boolean().optional(), latencySec: z.number().nonnegative().optional(),
    })).min(1).max(100),
  }).strict(),
  example: { requirements: { durationSec: 30, minQuality: 8 }, providers: [{ id: "vid-a", quality: 9, costPerSecond: 0.1, maxDurationSec: 60, available: true }, { id: "vid-b", quality: 6, costPerSecond: 0.01, maxDurationSec: 15, available: true }] },
  handler: (input) => {
    const req = input.requirements;
    const feasible = input.providers.filter((p) =>
      p.available !== false && p.maxDurationSec >= req.durationSec &&
      (req.minQuality === undefined || p.quality >= req.minQuality) &&
      (req.maxCost === undefined || p.costPerSecond * req.durationSec <= req.maxCost) &&
      (req.width === undefined || (p.maxWidth ?? 16_384) >= req.width));
    const candidates = feasible.map((p) => ({ id: p.id, metrics: { quality: p.quality, totalCost: round(p.costPerSecond * req.durationSec, 4), latencySec: p.latencySec ?? 60 } }));
    const ranked = rankCandidates(candidates, { quality: 3, totalCost: 2, latencySec: 1 }, ["totalCost", "latencySec"]);
    return {
      summary: ranked.length > 0 ? `Proveedor recomendado para ${req.durationSec} s: ${ranked[0].id}.` : "Ningún proveedor admite esa duración/calidad/coste.",
      data: { recommended: ranked[0]?.id ?? null, ranking: ranked, paretoOptimal: paretoFront(candidates, ["quality"], ["totalCost", "latencySec"]), estimatedCosts: candidates.map((c) => ({ provider: c.id, totalCost: c.metrics.totalCost })), rejected: input.providers.filter((p) => !feasible.includes(p)).map((p) => p.id) },
    };
  },
});

const videoEditingOrchestrator = defineTool({
  number: 112,
  limitation: "Produce la lista de decisión de montaje (EDL) y la especificación de exportación; el render lo ejecuta el motor del llamante.",
  inputSchema: z.object({
    scenes: z.array(z.object({ id: idStr(), sourceInSec: z.number().nonnegative(), sourceOutSec: z.number().positive(), transitionSec: z.number().min(0).max(10).optional(), label: txt(300).optional() })).min(1).max(500),
    targetDurationSec: z.number().positive().max(86_400).optional(),
    exportSpec: z.object({ width: z.number().int().positive().max(16_384), height: z.number().int().positive().max(16_384), fps: z.number().positive().max(240).optional(), format: txt(20).optional() }).strict().optional(),
  }).strict(),
  example: { scenes: [{ id: "intro", sourceInSec: 0, sourceOutSec: 5 }, { id: "tema", sourceInSec: 20, sourceOutSec: 32, transitionSec: 0.5 }, { id: "cierre", sourceInSec: 60, sourceOutSec: 64 }], targetDurationSec: 20, exportSpec: { width: 1080, height: 1920, fps: 30, format: "mp4" } },
  handler: (input) => {
    let cursor = 0;
    const errors: string[] = [];
    const edl = input.scenes.map((scene, i) => {
      const clipDuration = scene.sourceOutSec - scene.sourceInSec;
      if (clipDuration <= 0) errors.push(`Escena ${scene.id}: salida <= entrada`);
      const transition = i === 0 ? 0 : (scene.transitionSec ?? 0);
      const timelineStart = round(cursor - transition, 3);
      cursor = timelineStart + clipDuration;
      return { order: i + 1, sceneId: scene.id, label: scene.label ?? null, sourceInSec: scene.sourceInSec, sourceOutSec: scene.sourceOutSec, clipDurationSec: round(clipDuration, 3), transitionInSec: transition, timelineStartSec: Math.max(0, timelineStart), timelineEndSec: round(cursor, 3) };
    });
    const total = round(cursor, 3);
    return {
      summary: `EDL con ${edl.length} cortes: duración total ${total} s${input.targetDurationSec ? ` (objetivo ${input.targetDurationSec} s)` : ""}.`,
      data: { edl, totalDurationSec: total, fitsTarget: input.targetDurationSec ? total <= input.targetDurationSec : null, overflowSec: input.targetDurationSec ? round(total - input.targetDurationSec, 3) : null, exportSpec: input.exportSpec ? { ...input.exportSpec, fps: input.exportSpec.fps ?? 30, orientation: orientation(input.exportSpec.width, input.exportSpec.height) } : null },
      warnings: errors,
    };
  },
});

const shotPlanner = defineTool({
  number: 113,
  inputSchema: z.object({
    script: longText(),
    speakingRateWpm: z.number().min(60).max(260).optional(),
    maxShotSeconds: z.number().positive().max(600).optional(),
  }).strict(),
  example: { script: "Bienvenidos al tutorial de subtítulos. En esta primera parte veremos cómo alinear el texto con la voz sin herramientas complicadas.\n\nDespués revisaremos dos ejemplos completos y cerraremos con una lista de comprobación rápida." },
  handler: (input) => {
    const wpm = input.speakingRateWpm ?? 150;
    const maxShot = input.maxShotSeconds ?? 12;
    const paragraphs = input.script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const shotTypes = ["plano general", "plano medio", "primer plano", "plano detalle", "plano medio"];
    let cursor = 0;
    let shotNumber = 0;
    const scenes = paragraphs.map((paragraph, sceneIdx) => {
      const shots = sentences(paragraph).map((sentence) => {
        const words = tokens(sentence, { dropStopwords: false }).length;
        const duration = Math.min(maxShot, Math.max(2, speechSeconds(words, wpm)));
        shotNumber += 1;
        const isQuestion = /\?/.test(sentence);
        const shot = { shot: shotNumber, type: isQuestion ? "primer plano (pregunta a cámara)" : shotTypes[shotNumber % shotTypes.length], line: sentence, estimatedSeconds: duration, timelineStartSec: round(cursor, 1) };
        cursor += duration;
        return shot;
      });
      return { scene: sceneIdx + 1, shots };
    });
    return {
      summary: `Guion convertido en ${scenes.length} escenas y ${shotNumber} tomas (~${round(cursor, 0)} s a ${wpm} palabras/min).`,
      data: { scenes, totalEstimatedSeconds: round(cursor, 1), speakingRateWpm: wpm },
    };
  },
});

const continuityChecker = defineTool({
  number: 114,
  inputSchema: z.object({
    scenes: z.array(z.object({
      id: idStr(), location: txt(200).optional(), timeOfDay: txt(100).optional(),
      characters: strArr(50, 100), props: strArr(100, 100).optional(), notes: txt(1_000).optional(),
    })).min(2).max(500),
  }).strict(),
  example: { scenes: [{ id: "s1", location: "oficina", timeOfDay: "día", characters: ["Ana"], props: ["taza roja"] }, { id: "s2", location: "oficina", timeOfDay: "noche", characters: ["Ana"], props: [] }, { id: "s3", location: "calle", timeOfDay: "día", characters: ["Luis"], props: [] }] },
  handler: (input) => {
    const issues: Record<string, unknown>[] = [];
    for (let i = 1; i < input.scenes.length; i += 1) {
      const prev = input.scenes[i - 1];
      const cur = input.scenes[i];
      const sameLocation = prev.location && cur.location && prev.location === cur.location;
      if (sameLocation) {
        const vanishedProps = (prev.props ?? []).filter((p) => !(cur.props ?? []).includes(p));
        for (const prop of vanishedProps) issues.push({ kind: "prop_vanished", scenes: [prev.id, cur.id], detail: `«${prop}» está en ${prev.id} y desaparece en ${cur.id} (misma localización)` });
        if (prev.timeOfDay && cur.timeOfDay && prev.timeOfDay !== cur.timeOfDay) issues.push({ kind: "time_jump", scenes: [prev.id, cur.id], detail: `Misma localización pero la hora pasa de ${prev.timeOfDay} a ${cur.timeOfDay}: ¿elipsis intencionada?` });
      }
      const appeared = cur.characters.filter((c) => !prev.characters.includes(c));
      const disappeared = prev.characters.filter((c) => !cur.characters.includes(c));
      if (sameLocation) {
        for (const c of appeared) issues.push({ kind: "character_appears", scenes: [prev.id, cur.id], detail: `${c} aparece en la misma localización sin entrada registrada` });
        for (const c of disappeared) issues.push({ kind: "character_vanishes", scenes: [prev.id, cur.id], detail: `${c} estaba en ${prev.id} y ya no está en ${cur.id}` });
      }
      if (!sameLocation && prev.timeOfDay && cur.timeOfDay && prev.timeOfDay !== cur.timeOfDay && cur.characters.some((c) => prev.characters.includes(c))) {
        issues.push({ kind: "time_travel_check", scenes: [prev.id, cur.id], detail: "Un personaje cambia de localización y de hora entre escenas consecutivas: comprobar el tiempo de desplazamiento" });
      }
    }
    return {
      summary: issues.length === 0 ? "Sin saltos de continuidad detectados." : `${issues.length} posibles saltos de continuidad.`,
      data: { issues, checkedTransitions: input.scenes.length - 1 },
    };
  },
});

const motionRouter = defineTool({
  number: 115,
  limitation: "Enruta según capacidades de movimiento declaradas; no genera el movimiento.",
  inputSchema: z.object({
    requiredMotion: strArr(20, 100),
    candidates: z.array(z.object({ id: idStr(), supportedMotions: strArr(50, 100), quality: z.number().min(0).max(10), costPerUnit: z.number().nonnegative(), available: z.boolean().optional() })).min(1).max(100),
  }).strict(),
  example: { requiredMotion: ["orbit", "zoom_in"], candidates: [{ id: "m-a", supportedMotions: ["pan", "zoom_in"], quality: 7, costPerUnit: 0.2 }, { id: "m-b", supportedMotions: ["orbit", "zoom_in", "tracking"], quality: 9, costPerUnit: 0.5 }] },
  handler: (input) => {
    const evaluated = input.candidates.filter((c) => c.available !== false).map((c) => {
      const covered = input.requiredMotion.filter((m) => c.supportedMotions.includes(m));
      return { id: c.id, coverage: round(covered.length / Math.max(1, input.requiredMotion.length), 2), missing: input.requiredMotion.filter((m) => !c.supportedMotions.includes(m)), quality: c.quality, costPerUnit: c.costPerUnit };
    });
    const full = evaluated.filter((e) => e.missing.length === 0);
    const ranked = rankCandidates(full.map((e) => ({ id: e.id, metrics: { quality: e.quality, costPerUnit: e.costPerUnit } })), { quality: 3, costPerUnit: 2 }, ["costPerUnit"]);
    return {
      summary: ranked.length > 0 ? `Movimientos cubiertos por ${ranked[0].id}.` : "Ningún candidato cubre todos los movimientos pedidos.",
      data: { recommended: ranked[0]?.id ?? null, ranking: ranked, partialMatches: evaluated.filter((e) => e.missing.length > 0), suggestion: ranked.length === 0 ? "Divide el plano por movimiento o relaja el requisito menos importante." : null },
    };
  },
});

const subtitleAligner = defineTool({
  number: 116,
  inputSchema: z.object({
    cues: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: txt(500) })).max(5_000).optional(),
    transcript: longText().optional(),
    totalDurationSec: z.number().positive().max(86_400).optional(),
    maxCharsPerCue: z.number().int().min(10).max(200).optional(),
    maxCps: z.number().positive().max(100).optional(),
  }).strict(),
  example: { cues: [{ start: 0, end: 3.2, text: "Bienvenidos al tutorial." }, { start: 3, end: 6, text: "Hoy alineamos subtítulos con el audio paso a paso." }] },
  handler: (input) => {
    const maxChars = input.maxCharsPerCue ?? 84;
    const maxCps = input.maxCps ?? 20;
    let cues: SubtitleCue[] = [];
    const splitLong = (text: string): string[] => {
      const words = text.split(/\s+/).filter(Boolean);
      const parts: string[] = [];
      let current = "";
      for (const word of words) {
        if (current && current.length + word.length + 1 > maxChars) { parts.push(current); current = word; }
        else current = current ? `${current} ${word}` : word;
      }
      if (current) parts.push(current);
      return parts.length > 0 ? parts : [text.slice(0, maxChars)];
    };
    if (input.cues?.length) {
      for (const cue of input.cues) {
        const parts = splitLong(cue.text);
        const span = Math.max(0.1, cue.end - cue.start) / parts.length;
        parts.forEach((part, i) => cues.push({ start: round(cue.start + span * i, 3), end: round(cue.start + span * (i + 1), 3), text: part }));
      }
    } else if (input.transcript && input.totalDurationSec) {
      const parts = sentences(input.transcript).flatMap(splitLong);
      const totalWords = sum(parts.map((p) => tokens(p, { dropStopwords: false }).length)) || 1;
      let cursor = 0;
      for (const part of parts) {
        const duration = (tokens(part, { dropStopwords: false }).length / totalWords) * input.totalDurationSec;
        cues.push({ start: round(cursor, 3), end: round(cursor + duration, 3), text: part });
        cursor += duration;
      }
    } else fail("INVALID_INPUT");
    cues.sort((a, b) => a.start - b.start);
    const issues: Record<string, unknown>[] = [];
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      const duration = Math.max(0.1, cue.end - cue.start);
      const cps = cue.text.length / duration;
      if (cps > maxCps) issues.push({ cue: i + 1, kind: "too_fast_to_read", cps: round(cps, 1), maxCps });
      if (i > 0 && cue.start < cues[i - 1].end) issues.push({ cue: i + 1, kind: "overlap", detail: `Empieza (${cue.start}s) antes de que termine el anterior (${cues[i - 1].end}s)` });
      if (cue.end <= cue.start) issues.push({ cue: i + 1, kind: "invalid_range" });
    }
    return {
      summary: `SRT generado con ${cues.length} subtítulos (${issues.length} avisos de ritmo/solapes).`,
      data: { srt: buildSrt(cues), cueCount: cues.length, issues, rulesApplied: { maxCharsPerCue: maxChars, maxCharactersPerSecond: maxCps } },
    };
  },
});

const smartReframing = defineTool({
  number: 117,
  inputSchema: z.object({
    width: z.number().int().positive().max(16_384), height: z.number().int().positive().max(16_384),
    targets: z.array(z.object({ name: idStr(), ratio: z.string().max(20), focalX: z.number().min(0).max(1).optional(), focalY: z.number().min(0).max(1).optional() })).min(1).max(50),
  }).strict(),
  example: { width: 1920, height: 1080, targets: [{ name: "vertical", ratio: "9:16", focalX: 0.5, focalY: 0.4 }, { name: "cuadrado", ratio: "1:1" }] },
  handler: (input) => {
    if (input.width <= 0 || input.height <= 0) fail("INVALID_INPUT");
    const reframes = input.targets.map((target) => {
      const ratio = parseRatio(target.ratio);
      const crop = cropForAspect(input.width, input.height, ratio.w, ratio.h, target.focalX ?? 0.5, target.focalY ?? 0.5);
      const keptPct = round(((crop.width * crop.height) / (input.width * input.height)) * 100, 1);
      return { name: target.name, ratio: target.ratio, crop, output: { width: crop.width, height: crop.height }, keptAreaPct: keptPct, warning: keptPct < 45 ? "Se conserva menos del 45% del fotograma: comprueba que el sujeto siga dentro" : null };
    });
    return {
      summary: `${reframes.length} reencuadres calculados desde ${input.width}x${input.height}.`,
      data: { source: { width: input.width, height: input.height, tier: resolutionTier(input.width, input.height) }, reframes },
    };
  },
});

const highlightExtractor = defineTool({
  number: 118,
  inputSchema: z.object({
    segments: z.array(z.object({ id: idStr(), startSec: z.number().nonnegative(), endSec: z.number().positive(), scores: z.record(z.string(), z.number().finite()).optional(), label: txt(300).optional() })).min(1).max(1_000),
    weights: z.record(z.string(), z.number().nonnegative()).optional(),
    maxClips: z.number().int().min(1).max(100).optional(),
    maxTotalDurationSec: z.number().positive().max(86_400).optional(),
  }).strict(),
  example: { segments: [{ id: "s1", startSec: 0, endSec: 10, scores: { energia: 3 } }, { id: "s2", startSec: 8, endSec: 20, scores: { energia: 9 } }, { id: "s3", startSec: 40, endSec: 50, scores: { energia: 7 } }], maxClips: 2, maxTotalDurationSec: 25 },
  handler: (input) => {
    const weights = input.weights ?? {};
    const scored = input.segments.map((s) => {
      const entries = Object.entries(s.scores ?? {});
      const totalWeight = sum(entries.map(([k]) => weights[k] ?? 1)) || 1;
      const score = sum(entries.map(([k, v]) => v * (weights[k] ?? 1))) / totalWeight;
      return { ...s, duration: s.endSec - s.startSec, score: round(score, 2) };
    }).sort((a, b) => b.score - a.score);
    const chosen: typeof scored = [];
    for (const candidate of scored) {
      if (chosen.length >= (input.maxClips ?? 5)) break;
      if (chosen.some((c) => candidate.startSec < c.endSec && c.startSec < candidate.endSec)) continue;
      const totalIfAdded = sum(chosen.map((c) => c.duration)) + candidate.duration;
      if (input.maxTotalDurationSec && totalIfAdded > input.maxTotalDurationSec) continue;
      chosen.push(candidate);
    }
    return {
      summary: `${chosen.length} clips destacados (${round(sum(chosen.map((c) => c.duration)), 1)} s) sin solapes.`,
      data: { highlights: [...chosen].sort((a, b) => a.startSec - b.startSec).map((c) => ({ id: c.id, startSec: c.startSec, endSec: c.endSec, score: c.score, label: c.label ?? null })), skippedForOverlapOrBudget: input.segments.length - chosen.length },
    };
  },
});

const renderQueue = defineTool({
  number: 119,
  stateful: true,
  limitation: "Cola de render en memoria: coordina estados y reintentos, pero no ejecuta ningún render.",
  inputSchema: z.object({
    action: z.enum(["enqueue", "next", "complete", "fail", "list", "stats"]),
    jobId: idStr().optional(),
    spec: z.record(z.string(), z.unknown()).optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    maxConcurrent: z.number().int().min(1).max(100).optional(),
  }).strict(),
  example: { action: "enqueue", jobId: "render-demo-1", spec: { width: 1080, height: 1920, format: "mp4" } },
  handler: (input) => {
    const queueName = "render";
    const queue = jobQueues.get(queueName) ?? [];
    jobQueues.set(queueName, queue);
    const stats = () => ({ pending: queue.filter((j) => j.status === "pending").length, running: queue.filter((j) => j.status === "running").length, completed: queue.filter((j) => j.status === "completed").length, failed: queue.filter((j) => j.status === "failed").length, dead: queue.filter((j) => j.status === "dead").length });
    if (input.action === "stats") return { summary: "Estadísticas de la cola de render.", data: { stats: stats() } };
    if (input.action === "list") return { summary: `${queue.length} trabajos en la cola.`, data: { jobs: queue.slice(-100).map((j) => ({ id: j.id, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts })) } };
    if (input.action === "enqueue") {
      if (!input.jobId) fail("INVALID_INPUT");
      if (queue.some((j) => j.id === input.jobId && (j.status === "pending" || j.status === "running"))) fail("CONFLICT");
      if (queue.length > 5000) fail("LIMIT_EXCEEDED");
      queue.push({ id: input.jobId!, payload: input.spec ?? {}, status: "pending", attempts: 0, maxAttempts: input.maxAttempts ?? 3, enqueuedAt: new Date().toISOString() });
      return { summary: `Trabajo ${input.jobId} encolado en posición ${stats().pending}.`, data: { jobId: input.jobId, stats: stats() } };
    }
    if (input.action === "next") {
      const running = queue.filter((j) => j.status === "running").length;
      if (running >= (input.maxConcurrent ?? 2)) return { summary: "Límite de renders simultáneos alcanzado.", data: { job: null, stats: stats() } };
      const next = queue.find((j) => j.status === "pending");
      if (!next) return { summary: "No hay trabajos pendientes.", data: { job: null, stats: stats() } };
      next.status = "running"; next.attempts += 1;
      return { summary: `Siguiente render: ${next.id} (intento ${next.attempts}).`, data: { job: { id: next.id, spec: next.payload, attempts: next.attempts }, stats: stats() } };
    }
    if (!input.jobId) fail("INVALID_INPUT");
    const job = queue.find((j) => j.id === input.jobId && j.status === "running") ?? queue.find((j) => j.id === input.jobId);
    if (!job) fail("NOT_FOUND");
    if (input.action === "complete") job!.status = "completed";
    if (input.action === "fail") job!.status = job!.attempts >= job!.maxAttempts ? "dead" : "pending";
    evictOldest(jobQueues);
    return { summary: `Trabajo ${input.jobId}: ${job!.status}.`, data: { jobId: input.jobId, status: job!.status, attempts: job!.attempts, stats: stats() } };
  },
});

const videoQualityInspector = defineTool({
  number: 120,
  limitation: "Inspecciona metadatos declarados (resolución, fps, bitrate), no decodifica el vídeo ni detecta artefactos visuales reales.",
  inputSchema: z.object({
    video: z.object({
      width: z.number().int().positive().max(16_384), height: z.number().int().positive().max(16_384),
      durationSec: z.number().positive().max(86_400), fps: z.number().positive().max(240),
      bitrateMbps: z.number().positive().max(1_000).optional(), codec: txt(50).optional(),
    }).strict(),
    requirements: z.object({
      minWidth: z.number().int().positive().max(16_384).optional(), minHeight: z.number().int().positive().max(16_384).optional(),
      maxDurationSec: z.number().positive().max(86_400).optional(), minDurationSec: z.number().positive().max(86_400).optional(),
      allowedFps: numArr(20).optional(), maxFileSizeMb: z.number().positive().max(1_000_000).optional(),
      expectedOrientation: z.enum(["landscape", "portrait", "square"]).optional(),
    }).strict().optional(),
  }).strict(),
  example: { video: { width: 1080, height: 1920, durationSec: 45, fps: 30, bitrateMbps: 8 }, requirements: { minWidth: 720, maxDurationSec: 60, expectedOrientation: "portrait", maxFileSizeMb: 100 } },
  handler: (input) => {
    const v = input.video;
    const r = input.requirements ?? {};
    const estimatedMb = v.bitrateMbps ? round((v.bitrateMbps * v.durationSec) / 8, 2) : null;
    const checks: { check: string; passed: boolean; detail: string }[] = [
      { check: "resolucion_ancho", passed: r.minWidth === undefined || v.width >= r.minWidth, detail: `${v.width}px frente a mínimo ${r.minWidth ?? "sin mínimo"}` },
      { check: "resolucion_alto", passed: r.minHeight === undefined || v.height >= r.minHeight, detail: `${v.height}px frente a mínimo ${r.minHeight ?? "sin mínimo"}` },
      { check: "duracion_maxima", passed: r.maxDurationSec === undefined || v.durationSec <= r.maxDurationSec, detail: `${v.durationSec}s frente a máximo ${r.maxDurationSec ?? "sin máximo"}` },
      { check: "duracion_minima", passed: r.minDurationSec === undefined || v.durationSec >= r.minDurationSec, detail: `${v.durationSec}s frente a mínimo ${r.minDurationSec ?? "sin mínimo"}` },
      { check: "fps", passed: !r.allowedFps?.length || r.allowedFps.some((f: any) => Math.abs(f - v.fps) < 0.1), detail: `${v.fps} fps` },
      { check: "orientacion", passed: r.expectedOrientation === undefined || orientation(v.width, v.height) === r.expectedOrientation, detail: orientation(v.width, v.height) },
      { check: "tamano_estimado", passed: estimatedMb === null || r.maxFileSizeMb === undefined || estimatedMb <= r.maxFileSizeMb, detail: estimatedMb === null ? "sin bitrate declarado" : `${estimatedMb} MB estimados` },
    ];
    return {
      summary: checks.every((c) => c.passed) ? "El vídeo cumple los requisitos de salida." : `${checks.filter((c) => !c.passed).length} requisitos incumplidos.`,
      data: { passes: checks.every((c) => c.passed), tier: resolutionTier(v.width, v.height), orientation: orientation(v.width, v.height), megapixelsPerFrame: round((v.width * v.height) / 1_000_000, 2), estimatedFileSizeMb: estimatedMb, checks },
    };
  },
});

export const f12: LocalToolDefinition[] = [videoProviderRouter, videoEditingOrchestrator, shotPlanner, continuityChecker, motionRouter, subtitleAligner, smartReframing, highlightExtractor, renderQueue, videoQualityInspector];
