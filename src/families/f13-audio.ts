/** Familia 13 — Multimedia: audio, voz y música (herramientas 121-130). */
import { z } from "zod";
import { dbToLinear, peakDb, rmsDb, speechSeconds } from "../engines/media.js";
import { rankCandidates } from "../engines/scoring.js";
import { median, percentile, round, sum } from "../engines/stats.js";
import { alignWords, extractiveSummary, sentences, tokens } from "../engines/text.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

function languageRouter(number: number, kind: "voz (TTS)" | "transcripción (STT)" | "música") {
  return defineTool({
    number,
    limitation: `Selecciona el motor de ${kind} entre los candidatos aportados; no sintetiza ni transcribe audio.`,
    inputSchema: z.object({
      language: z.string().min(2).max(20).optional(),
      requirements: z.object({ maxCostPerUnit: z.number().nonnegative().optional(), minQuality: z.number().min(0).max(10).optional(), maxLatencySec: z.number().nonnegative().optional(), genres: strArr(20, 100).optional() }).strict().optional(),
      providers: z.array(z.object({
        id: idStr(), languages: strArr(100, 20), quality: z.number().min(0).max(10),
        costPerUnit: z.number().nonnegative(), latencySec: z.number().nonnegative(), available: z.boolean().optional(),
        genres: strArr(50, 100).optional(),
      })).min(1).max(100),
    }).strict(),
    example: { language: "es", requirements: { minQuality: 7 }, providers: [{ id: "motor-a", languages: ["es", "en"], quality: 9, costPerUnit: 0.02, latencySec: 1.2, available: true }, { id: "motor-b", languages: ["en"], quality: 8, costPerUnit: 0.01, latencySec: 0.8, available: true }] },
    handler: (input) => {
      const req = input.requirements ?? {};
      const feasible = input.providers.filter((p) =>
        p.available !== false &&
        (!input.language || p.languages.some((l) => l.toLowerCase().startsWith(input.language!.toLowerCase().split("-")[0]))) &&
        (req.minQuality === undefined || p.quality >= req.minQuality) &&
        (req.maxCostPerUnit === undefined || p.costPerUnit <= req.maxCostPerUnit) &&
        (req.maxLatencySec === undefined || p.latencySec <= req.maxLatencySec) &&
        (req.genres ?? []).every((g) => (p.genres ?? []).includes(g)));
      const ranked = rankCandidates(feasible.map((p) => ({ id: p.id, metrics: { quality: p.quality, costPerUnit: p.costPerUnit, latencySec: p.latencySec } })), { quality: 3, costPerUnit: 2, latencySec: 1 }, ["costPerUnit", "latencySec"]);
      return {
        summary: ranked.length > 0 ? `Motor recomendado: ${ranked[0].id}.` : "Ningún motor cumple idioma/calidad/coste.",
        data: { recommended: ranked[0]?.id ?? null, ranking: ranked, languageFilter: input.language ?? null, rejected: input.providers.filter((p) => !feasible.includes(p)).map((p) => p.id) },
      };
    },
  });
}

const ttsRouter = languageRouter(121, "voz (TTS)");
const sttRouter = languageRouter(122, "transcripción (STT)");
const musicRouter = languageRouter(124, "música");

const voiceDirection = defineTool({
  number: 123,
  inputSchema: z.object({
    text: longText(),
    tone: txt(200).optional(),
    audience: txt(300).optional(),
    paceWpm: z.number().min(60).max(260).optional(),
    pauseAfterSentenceMs: z.number().int().min(0).max(5_000).optional(),
  }).strict(),
  example: { text: "Bienvenidos al tutorial. Hoy resolvemos en tres minutos el problema de los subtítulos desincronizados. ¿Empezamos?", tone: "cercano y claro", audience: "creadores principiantes", paceWpm: 150 },
  handler: (input) => {
    const wpm = input.paceWpm ?? 150;
    const pauseMs = input.pauseAfterSentenceMs ?? 450;
    const list = sentences(input.text);
    const annotated = list.map((sentence, i) => {
      const words = tokens(sentence, { dropStopwords: false }).length;
      const delivery = /\?/.test(sentence) ? "entonación ascendente, pausa tras la pregunta" : /!/.test(sentence) ? "énfasis sin gritar" : words > 22 ? "oración larga: respira en las comas" : "fluido";
      return { segment: i + 1, text: sentence, words, estimatedSeconds: speechSeconds(words, wpm), delivery, pauseAfterMs: pauseMs };
    });
    const total = round(sum(annotated.map((a) => a.estimatedSeconds)) + (annotated.length * pauseMs) / 1000, 1);
    return {
      summary: `Ficha de locución: ${annotated.length} segmentos, ~${total} s a ${wpm} pal/min.`,
      data: { direction: { tone: input.tone ?? "neutro", audience: input.audience ?? null, paceWpm: wpm }, segments: annotated, estimatedTotalSeconds: total, markedScript: annotated.map((a) => `${a.text} [pausa ${pauseMs} ms]`).join(" ") },
    };
  },
});

const audioMixing = defineTool({
  number: 125,
  inputSchema: z.object({
    tracks: z.array(z.object({ name: idStr(), role: z.enum(["voice", "music", "sfx", "other"]), gainDb: z.number().min(-60).max(24), pan: z.number().min(-1).max(1).optional() })).min(1).max(64),
    voiceAboveMusicDb: z.number().min(0).max(30).optional(),
    ceilingDb: z.number().min(-24).max(0).optional(),
  }).strict(),
  example: { tracks: [{ name: "voz", role: "voice", gainDb: -6, pan: 0 }, { name: "musica", role: "music", gainDb: -8, pan: 0 }], voiceAboveMusicDb: 12, ceilingDb: -1 },
  handler: (input) => {
    const targetGap = input.voiceAboveMusicDb ?? 12;
    const ceiling = input.ceilingDb ?? -1;
    const adjustments: Record<string, unknown>[] = [];
    const voices = input.tracks.filter((t) => t.role === "voice");
    const loudestVoice = voices.length ? Math.max(...voices.map((v) => v.gainDb)) : null;
    const adjusted = input.tracks.map((track) => {
      let gain = track.gainDb;
      const notes: string[] = [];
      if (track.role === "music" && loudestVoice !== null && loudestVoice - gain < targetGap) {
        gain = round(loudestVoice - targetGap, 1);
        notes.push(`Bajada a ${gain} dB para dejar la voz ${targetGap} dB por encima`);
      }
      if (track.role === "voice" && Math.abs(track.pan ?? 0) > 0.3) notes.push("Voz muy paneada: suele funcionar mejor centrada");
      if (notes.length) adjustments.push({ track: track.name, suggestedGainDb: gain, notes });
      return { name: track.name, role: track.role, gainDb: track.gainDb, suggestedGainDb: gain, pan: track.pan ?? 0 };
    });
    const sumPeakDb = round(20 * Math.log10(sum(adjusted.map((t) => dbToLinear(t.suggestedGainDb))) || 1), 2);
    return {
      summary: `Mezcla revisada: pico estimado de suma ${sumPeakDb} dB (techo ${ceiling} dB).`,
      data: { tracks: adjusted, estimatedSumPeakDb: sumPeakDb, headroomOk: sumPeakDb <= ceiling, adjustments, note: "La suma de picos es una cota pesimista (señales totalmente correlacionadas)." },
      warnings: sumPeakDb > ceiling ? ["La suma podría superar el techo: baja el bus master o aplica limitador."] : [],
    };
  },
});

const silenceCleaner = defineTool({
  number: 126,
  inputSchema: z.object({
    segments: z.array(z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive(), levelDb: z.number().min(-120).max(0) })).min(1).max(10_000),
    silenceThresholdDb: z.number().min(-120).max(0).optional(),
    minSilenceSec: z.number().positive().max(600).optional(),
  }).strict(),
  example: { segments: [{ startSec: 0, endSec: 2, levelDb: -55 }, { startSec: 2, endSec: 8, levelDb: -18 }, { startSec: 8, endSec: 11, levelDb: -58 }, { startSec: 11, endSec: 15, levelDb: -20 }], silenceThresholdDb: -45, minSilenceSec: 1 },
  handler: (input) => {
    const threshold = input.silenceThresholdDb ?? -45;
    const minSilence = input.minSilenceSec ?? 0.8;
    const sorted = [...input.segments].sort((a, b) => a.startSec - b.startSec);
    const noisesFloor = round(percentile(sorted.map((s) => s.levelDb), 10), 1);
    const silences = sorted.filter((s) => s.levelDb <= threshold && s.endSec - s.startSec >= minSilence).map((s) => ({ startSec: s.startSec, endSec: s.endSec, durationSec: round(s.endSec - s.startSec, 2) }));
    const keepRanges = sorted.filter((s) => s.levelDb > threshold).map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
    const silenceTotal = round(sum(silences.map((s) => s.durationSec)), 2);
    return {
      summary: `${silences.length} silencios recortables (${silenceTotal} s); suelo de ruido estimado en ${noisesFloor} dB.`,
      data: { noiseFloorDbEstimated: noisesFloor, silencesToTrim: silences, keptRanges: keepRanges, totalSilenceSec: silenceTotal, cleaningPlan: silences.length > 0 ? "Recorta los silencios listados dejando 80-120 ms de respiro en los bordes y revisa que no se corten respiraciones." : "No se detectaron silencios largos con este Umbral." },
    };
  },
});

const diarization = defineTool({
  number: 127,
  limitation: "Asigna el hablante más probable por segmento según las puntuaciones aportadas; no identifica voces desde audio crudo.",
  inputSchema: z.object({
    segments: z.array(z.object({
      startSec: z.number().nonnegative(), endSec: z.number().positive(),
      speaker: idStr().optional(), speakerScores: z.record(z.string(), z.number().min(0).max(1)).optional(), text: txt(1_000).optional(),
    })).min(1).max(5_000),
    confidenceThreshold: z.number().min(0).max(1).optional(),
  }).strict(),
  example: { segments: [{ startSec: 0, endSec: 4, speakerScores: { ana: 0.9, luis: 0.1 }, text: "Hola a todos" }, { startSec: 4, endSec: 7, speakerScores: { ana: 0.8, luis: 0.2 } }, { startSec: 6.5, endSec: 10, speakerScores: { luis: 0.95 } }] },
  handler: (input) => {
    const threshold = input.confidenceThreshold ?? 0.5;
    const assigned = [...input.segments].sort((a, b) => a.startSec - b.startSec).map((s) => {
      let speaker = s.speaker ?? "desconocido";
      let confidence: number | null = s.speaker ? 1 : null;
      if (s.speakerScores) {
        const [best, score] = Object.entries(s.speakerScores).sort((a, b) => b[1] - a[1])[0] ?? ["desconocido", 0];
        speaker = score >= threshold ? best : "inseguro";
        confidence = round(score, 2);
      }
      return { startSec: s.startSec, endSec: s.endSec, speaker, confidence, text: s.text ?? null };
    });
    const merged: typeof assigned = [];
    for (const seg of assigned) {
      const last = merged.at(-1);
      if (last && last.speaker === seg.speaker && Math.abs(last.endSec - seg.startSec) <= 0.25) last.endSec = seg.endSec;
      else merged.push({ ...seg });
    }
    const totals = new Map<string, number>();
    for (const seg of assigned) totals.set(seg.speaker, (totals.get(seg.speaker) ?? 0) + (seg.endSec - seg.startSec));
    const overlaps = assigned.filter((seg, i) => i > 0 && seg.startSec < assigned[i - 1].endSec).map((seg) => ({ at: seg.startSec, speakers: [assigned[assigned.indexOf(seg) - 1]?.speaker, seg.speaker] }));
    return {
      summary: `${totals.size} hablantes; más tiempo para ${[...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"}.`,
      data: { segments: merged, speakingTimeSec: Object.fromEntries([...totals.entries()].map(([k, v]) => [k, round(v, 2)])), overlaps, lowConfidenceCount: assigned.filter((s) => s.speaker === "inseguro").length },
    };
  },
});

const avSynchronizer = defineTool({
  number: 128,
  inputSchema: z.object({
    audioEvents: z.array(z.object({ id: idStr(), timeSec: z.number().nonnegative() })).min(1).max(1_000),
    videoEvents: z.array(z.object({ id: idStr(), timeSec: z.number().nonnegative() })).min(1).max(1_000),
    toleranceSec: z.number().positive().max(60).optional(),
  }).strict(),
  example: { audioEvents: [{ id: "palma1", timeSec: 1.0 }, { id: "palma2", timeSec: 60.4 }], videoEvents: [{ id: "palma1", timeSec: 1.3 }, { id: "palma2", timeSec: 60.9 }] },
  handler: (input) => {
    const videoById = new Map(input.videoEvents.map((e) => [e.id, e.timeSec]));
    const pairs = input.audioEvents.filter((a) => videoById.has(a.id)).map((a) => ({ id: a.id, audioSec: a.timeSec, videoSec: videoById.get(a.id)!, offsetSec: round(videoById.get(a.id)! - a.timeSec, 3) }));
    if (pairs.length === 0) fail("NOT_FOUND");
    const offset = round(median(pairs.map((p) => p.offsetSec)), 3);
    const drift = pairs.length >= 2 ? round(pairs.at(-1)!.offsetSec - pairs[0].offsetSec, 3) : 0;
    const tolerance = input.toleranceSec ?? 0.08;
    return {
      summary: `Desfase mediano ${offset}s (vídeo menos audio); deriva total ${drift}s.`,
      data: { recommendedShiftSec: round(-offset, 3), shiftDirection: offset > 0 ? "adelantar el vídeo o atrasar el audio" : offset < 0 ? "atrasar el vídeo o adelantar el audio" : "sin desplazamiento", pairs, driftSec: drift, needsStretch: Math.abs(drift) > tolerance, stretchNote: Math.abs(drift) > tolerance ? `La deriva (${drift}s) supera la tolerancia: además de desplazar, ajusta la velocidad de una pista ~${round(Math.abs(drift / Math.max(1, pairs.at(-1)!.audioSec - pairs[0].audioSec)) * 100, 3)}%.` : "Un desplazamiento fijo debería bastar.", inSync: Math.abs(offset) <= tolerance && Math.abs(drift) <= tolerance },
    };
  },
});

const pronunciationChecker = defineTool({
  number: 129,
  limitation: "Compara el texto esperado con la transcripción aportada (p. ej. de un STT): detecta palabras divergentes, no escucha el audio.",
  inputSchema: z.object({ expectedText: longText(), transcription: longText() }).strict(),
  example: { expectedText: "La sincronización precisa mejora la comprensión", transcription: "La sincronisacion presisa mejora la comprension" },
  handler: (input) => {
    const alignment = alignWords(input.expectedText, input.transcription);
    const expectedWords = Math.max(1, tokens(input.expectedText, { dropStopwords: false }).length);
    const wer = round(((alignment.substitutions.length + alignment.deletions.length + alignment.insertions.length) / expectedWords) * 100, 1);
    return {
      summary: `Tasa de error de palabra (WER) ${wer}%: ${alignment.substitutions.length} sustituciones, ${alignment.deletions.length} omisiones, ${alignment.insertions.length} inserciones.`,
      data: { werPct: wer, quality: wer <= 5 ? "buena" : wer <= 15 ? "aceptable" : "revisar", substitutions: alignment.substitutions.slice(0, 50), omitted: alignment.deletions.slice(0, 50), inserted: alignment.insertions.slice(0, 50), suspectWords: alignment.substitutions.map((s) => s.expected).slice(0, 30), suggestion: alignment.substitutions.length > 0 ? "Repite despacio las palabras sospechosas y compara de nuevo." : "Sin divergencias relevantes." },
    };
  },
});

const masteringChecker = defineTool({
  number: 130,
  limitation: "Con muestras numéricas calcula pico/RMS reales; la sonoridad LUFS exacta requiere medición completa del archivo, aquí solo se contrasta si se aporta.",
  inputSchema: z.object({
    samples: z.array(z.number().min(-2).max(2)).max(50_000).optional(),
    metrics: z.object({ peakDb: z.number().finite().optional(), rmsDb: z.number().finite().optional(), lufs: z.number().finite().optional(), clippingCount: z.number().int().nonnegative().optional() }).strict().optional(),
    targets: z.object({ ceilingDbTp: z.number().min(-12).max(0).optional(), targetLufs: z.number().min(-40).max(0).optional(), lufsTolerance: z.number().positive().max(10).optional() }).strict().optional(),
  }).strict(),
  example: { samples: [0.1, -0.4, 0.5, -0.89, 0.2], targets: { ceilingDbTp: -1 } },
  handler: (input) => {
    if (!input.samples?.length && !input.metrics) fail("INVALID_INPUT");
    const fromSamples = input.samples?.length ? { peakDb: peakDb(input.samples), rmsDb: rmsDb(input.samples), clippingCount: input.samples.filter((s) => Math.abs(s) >= 1).length, dcOffset: round(input.samples.reduce((a, b) => a + b, 0) / input.samples.length, 5) } : null;
    const peak = fromSamples?.peakDb ?? input.metrics?.peakDb ?? null;
    const rms = fromSamples?.rmsDb ?? input.metrics?.rmsDb ?? null;
    const clipping = fromSamples?.clippingCount ?? input.metrics?.clippingCount ?? null;
    const ceiling = input.targets?.ceilingDbTp ?? -1;
    const checks = [
      { check: "pico_bajo_techo", passed: peak !== null && peak <= ceiling, detail: `pico ${peak ?? "?"} dB, techo ${ceiling} dBTP` },
      { check: "sin_clipping", passed: (clipping ?? 0) === 0, detail: `${clipping ?? "?"} muestras recortadas` },
      ...(input.targets?.targetLufs !== undefined ? [{ check: "sonoridad_objetivo", passed: input.metrics?.lufs !== undefined && Math.abs(input.metrics.lufs - input.targets.targetLufs) <= (input.targets.lufsTolerance ?? 1), detail: `LUFS aportado ${input.metrics?.lufs ?? "sin Dato"} frente a objetivo ${input.targets.targetLufs}` }] : []),
    ];
    return {
      summary: checks.every((c) => c.passed) ? "El máster cumple pico y ausencia de recorte." : "El máster necesita corrección antes de exportar.",
      data: { measured: { ...fromSamples, dynamicRangeDbApprox: peak !== null && rms !== null ? round(peak - rms, 2) : null }, checks, exportReady: checks.every((c) => c.passed) },
      warnings: fromSamples && Math.abs(fromSamples.dcOffset) > 0.01 ? ["Offset de continua apreciable: aplica un filtro de eliminación de DC."] : [],
    };
  },
});

// extractiveSummary queda disponible para notas de dirección extendidas.
void extractiveSummary;

export const f13: LocalToolDefinition[] = [ttsRouter, sttRouter, voiceDirection, musicRouter, audioMixing, silenceCleaner, diarization, avSynchronizer, pronunciationChecker, masteringChecker];
