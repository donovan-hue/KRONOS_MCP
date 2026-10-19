/** Familia 14 — Guion, contenido y publicación (herramientas 131-140). */
import { z } from "zod";
import { EMAIL_RE, extractPatterns, extractiveSummary, sentences, tokens } from "../engines/text.js";
import { describe, median, round, sum } from "../engines/stats.js";
import { addDays, toDate } from "../engines/time.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const scriptOutline = defineTool({
  number: 131,
  limitation: "Genera la estructura y los tiempos por sección a partir de una plantilla por formato; el texto editorial lo escribe el llamante o su modelo.",
  inputSchema: z.object({
    topic: reqText(500),
    goal: txt(1_000).optional(),
    format: z.enum(["short", "video", "long_video", "podcast", "article"]),
    targetMinutes: z.number().positive().max(600).optional(),
    keyPoints: strArr(20, 1_000).optional(),
    audience: txt(300).optional(),
  }).strict(),
  example: { topic: "Cómo sincronizar subtítulos", format: "video", targetMinutes: 6, keyPoints: ["alinear por marcas de tiempo", "respetar caracteres por segundo", "revisar en móvil"] },
  handler: (input) => {
    const totalSec = (input.targetMinutes ?? (input.format === "short" ? 1 : input.format === "podcast" ? 20 : 8)) * 60;
    const points = input.keyPoints?.length ? input.keyPoints : ["Idea central", "Ejemplo práctico", "Cierre y siguiente paso"];
    const hookPct = input.format === "short" ? 0.08 : 0.06;
    const closePct = 0.08;
    const bodyPct = 1 - hookPct - closePct - 0.1;
    let cursor = 0;
    const section = (title: string, pct: number, purpose: string, talkingPoints: string[]) => {
      const seconds = Math.max(5, Math.round(totalSec * pct));
      const out = { title, startSec: cursor, endSec: cursor + seconds, durationSec: seconds, purpose, talkingPoints };
      cursor += seconds;
      return out;
    };
    const sections = [
      section("Gancho", hookPct, "Promesa concreta en los primeros segundos", [`Plantea el problema de «${input.topic}» y el resultado que obtendrá ${input.audience ?? "la audiencia"}`]),
      section("Contexto mínimo", 0.1, "Por qué importa y para quién", [input.goal ?? `Resultado buscado con ${input.topic}`]),
      ...points.map((point, i) => section(`Punto ${i + 1}: ${point}`, bodyPct / points.length, "Desarrollo con ejemplo o demostración", [`Explica: ${point}`, "Muestra el antes/detalle verificable", "Anticipa el error típico"])),
      section("Cierre y llamada a la acción", closePct, "Resumen de una frase y siguiente paso único", ["Repite la promesa cumplida", "Una sola llamada a la acción"]),
    ];
    return {
      summary: `Estructura de ${input.format} lista: ${sections.length} secciones, ~${Math.round(cursor / 60 * 10) / 10} min.`,
      data: { topic: input.topic, format: input.format, sections, totalSeconds: cursor, estimatedWordCount: Math.round((cursor / 60) * 150) },
    };
  },
});

const hookOptimizer = defineTool({
  number: 132,
  limitation: "Plantillas de apertura puntuadas por heurísticas de longitud y claridad; la elección final debería validarse con la audiencia real.",
  inputSchema: z.object({
    topic: reqText(500),
    audience: txt(300).optional(),
    platform: txt(100).optional(),
    tone: z.enum(["directo", "curioso", "educativo", "provocador_suave"]).optional(),
    benefit: txt(500).optional(),
    timeHint: txt(100).optional(),
  }).strict(),
  example: { topic: "subtítulos desincronizados", audience: "creadores", benefit: "alinear subtítulos sin esfuerzo", timeHint: " en 3 minutos" },
  handler: (input) => {
    const topic = input.topic;
    const benefit = input.benefit ?? "resolverlo sin herramientas complicadas";
    const time = input.timeHint ?? "";
    const who = input.audience ? `Si eres de ${input.audience}, ` : "";
    const hooks = [
      { kind: "pregunta", text: `${who}¿tus casos de ${topic} también te roban tiempo? Hoy lo dejas resuelto${time}.`.replace(/^Si eres de/, "Si eres") },
      { kind: "error_comun", text: `El error que casi todos cometen con ${topic} (y cómo evitarlo${time}).` },
      { kind: "promesa", text: `En este contenido vas a ${benefit}, paso a paso y con ejemplos reales.` },
      { kind: "dato", text: `Tres comprobaciones rápidas para dominar ${topic} sin adivinar.` },
      { kind: "historia", text: `La semana pasada, ${topic} casi nos estropea una publicación. Esto fue lo que cambió todo.` },
      { kind: "contraintuitivo", text: `Deja de luchar con ${topic}: el problema no es el que crees.` },
    ].map((hook) => {
      const words = tokens(hook.text, { dropStopwords: false }).length;
      const score = round((words <= 22 ? 10 : Math.max(0, 10 - (words - 22) * 0.5)) + (/¿|\d/.test(hook.text) ? 1 : 0), 1);
      return { ...hook, words, clarityScore: Math.min(10, score), estimatedSpokenSeconds: round((words / 150) * 60, 1) };
    }).sort((a, b) => b.clarityScore - a.clarityScore);
    return { summary: `Mejor gancho heurístico (${hooks[0].kind}): «${hooks[0].text}»`, data: { recommendations: hooks, platform: input.platform ?? null, tone: input.tone ?? "directo" } };
  },
});

const narrativeChecker = defineTool({
  number: 133,
  inputSchema: z.object({
    sections: z.array(z.object({
      id: idStr(), characters: strArr(50, 100).optional(), toneTags: strArr(20, 100).optional(),
      facts: z.record(z.string(), z.string().max(500)).optional(), pointOfView: txt(100).optional(),
    })).min(1).max(500),
  }).strict(),
  example: { sections: [{ id: "1", characters: ["Ana"], toneTags: ["serio"], facts: { ciudad_ana: "MX" }, pointOfView: "tercera" }, { id: "2", characters: ["Ana"], toneTags: ["comico_absurdo"], facts: { ciudad_ana: "Luna" }, pointOfView: "primera" }] },
  handler: (input) => {
    const issues: Record<string, unknown>[] = [];
    const facts = new Map<string, { value: string; section: string }>();
    const toneTimeline: string[][] = [];
    for (const section of input.sections) {
      toneTimeline.push(section.toneTags ?? []);
      for (const [key, value] of Object.entries(section.facts ?? {})) {
        const previous = facts.get(key);
        if (previous && previous.value !== value) issues.push({ kind: "fact_contradiction", detail: `«${key}» vale «${previous.value}» en la sección ${previous.section} y «${value}» en ${section.id}` });
        else facts.set(key, { value, section: section.id });
      }
    }
    const povs = [...new Set(input.sections.map((s) => s.pointOfView).filter(Boolean))];
    if (povs.length > 1) issues.push({ kind: "pov_shift", detail: `El punto de vista cambia entre: ${povs.join(", ")}` });
    for (let i = 1; i < toneTimeline.length; i += 1) {
      const prev = new Set(toneTimeline[i - 1]);
      const shared = toneTimeline[i].filter((t) => prev.has(t)).length;
      if (prev.size > 0 && toneTimeline[i].length > 0 && shared === 0) issues.push({ kind: "tone_shift", detail: `Cambio total de tono entre las secciones ${input.sections[i - 1].id} y ${input.sections[i].id} (revisar si es intencionado)` });
    }
    const nextSections = new Set(input.sections.flatMap((s, i) => i > 0 ? (s.characters ?? []) : []));
    const vanished = (input.sections[0]?.characters ?? []).filter((c) => !nextSections.has(c));
    void vanished;
    return {
      summary: issues.length === 0 ? "Narrativa coherente según los datos declarados." : `${issues.length} inconsistencias narrativas detectadas.`,
      data: { issues, factRegistry: Object.fromEntries([...facts.entries()].map(([k, v]) => [k, { value: v.value, firstDeclaredIn: v.section }])), characterAppearances: Object.fromEntries([...new Set(input.sections.flatMap((s) => s.characters ?? []))].map((c) => [c, input.sections.filter((s) => (s.characters ?? []).includes(c)).map((s) => s.id)])) },
    };
  },
});

const PLATFORM_LIMITS: Record<string, { maxChars: number; threadAllowed: boolean; label: string }> = {
  x_post: { maxChars: 280, threadAllowed: true, label: "X (publicación)" },
  instagram_caption: { maxChars: 2200, threadAllowed: false, label: "Instagram (pie)" },
  linkedin_post: { maxChars: 3000, threadAllowed: false, label: "LinkedIn (publicación)" },
  tiktok_caption: { maxChars: 2200, threadAllowed: false, label: "TikTok (pie)" },
  youtube_title: { maxChars: 100, threadAllowed: false, label: "YouTube (título)" },
  youtube_description: { maxChars: 5000, threadAllowed: false, label: "YouTube (descripción)" },
  facebook_post: { maxChars: 63206, threadAllowed: false, label: "Facebook" },
};

const formatAdapter = defineTool({
  number: 134,
  limitation: "Los límites por plataforma son valores de referencia habituales y pueden cambiar; confírmalos antes de publicar.",
  inputSchema: z.object({
    text: longText(),
    platform: z.enum(Object.keys(PLATFORM_LIMITS) as [keyof typeof PLATFORM_LIMITS, ...string[]]),
    hashtags: strArr(30, 100).optional(),
    firstCommentHashtags: z.boolean().optional(),
  }).strict(),
  example: { text: "Hoy aprendemos a sincronizar subtítulos con el audio. Es más fácil de lo que parece si respetas las marcas de tiempo y los caracteres por segundo. Guarda este hilo para tu próxima edición y revisa siempre el resultado en el móvil antes de publicar nada en producción.", platform: "x_post", hashtags: ["#subtitulos", "#edicion"] },
  handler: (input) => {
    const spec = PLATFORM_LIMITS[input.platform];
    const hashtagBlock = (input.hashtags ?? []).join(" ");
    const appendHashtags = !input.firstCommentHashtags && hashtagBlock.length > 0;
    const splitIntoParts = (text: string, limit: number): string[] => {
      const parts: string[] = [];
      let remaining = text.trim();
      while (remaining.length > limit) {
        const window_ = remaining.slice(0, limit);
        const sentenceBreak = Math.max(window_.lastIndexOf(". "), window_.lastIndexOf("! "), window_.lastIndexOf("? "));
        const cut = sentenceBreak > limit * 0.4 ? sentenceBreak + 1 : window_.lastIndexOf(" ");
        if (cut <= 0) { parts.push(window_); remaining = remaining.slice(limit); }
        else { parts.push(remaining.slice(0, cut).trim()); remaining = remaining.slice(cut).trim(); }
      }
      if (remaining) parts.push(remaining);
      return parts;
    };
    if (spec.threadAllowed && input.text.length > spec.maxChars) {
      const room = spec.maxChars - 8; // " (1/12) "
      const rawParts = splitIntoParts(input.text, room);
      const parts = rawParts.map((part, i) => {
        let textPart = `${part} (${i + 1}/${rawParts.length})`;
        if (appendHashtags && i === rawParts.length - 1 && textPart.length + hashtagBlock.length + 1 <= spec.maxChars) textPart += ` ${hashtagBlock}`;
        return { part: i + 1, text: textPart, characters: textPart.length };
      });
      return { summary: `Adaptado a ${spec.label}: hilo de ${parts.length} partes.`, data: { mode: "thread", parts, platformLimit: spec } };
    }
    let adapted = input.text.trim();
    let truncated = false;
    const spaceForTags = appendHashtags ? hashtagBlock.length + 2 : 0;
    if (adapted.length + spaceForTags > spec.maxChars) {
      adapted = splitIntoParts(adapted, spec.maxChars - spaceForTags)[0];
      truncated = true;
    }
    if (appendHashtags) adapted = `${adapted}\n\n${hashtagBlock}`;
    return {
      summary: `Adaptado a ${spec.label}: ${adapted.length}/${spec.maxChars} caracteres${truncated ? " (recortado en frase completa)" : ""}.`,
      data: { mode: "single", adaptedText: adapted, characters: adapted.length, platformLimit: spec, truncated, separateFirstComment: input.firstCommentHashtags ? hashtagBlock : null },
      warnings: truncated ? ["El texto se recortó para cumplir el límite; revisa el sentido."] : [],
    };
  },
});

const calendarPlanner = defineTool({
  number: 135,
  inputSchema: z.object({
    pieces: z.array(z.object({ title: txt(300), channel: txt(100).optional(), productionDays: z.number().int().nonnegative().max(365).optional(), dependsOnTitle: txt(300).optional() })).min(1).max(200),
    startDate: txt(50),
    publishingWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }).strict(),
  example: { pieces: [{ title: "Subtítulos I", channel: "youtube", productionDays: 3 }, { title: "Subtítulos II", channel: "youtube", productionDays: 3, dependsOnTitle: "Subtítulos I" }, { title: "Short: error típico", channel: "tiktok", productionDays: 1 }], startDate: "2026-11-02", publishingWeekdays: [2, 4] },
  handler: (input) => {
    const start = toDate(input.startDate);
    const isPublishingDay = (d: Date) => input.publishingWeekdays.includes(d.getUTCDay());
    const occupied = new Set<string>();
    const scheduledAt = new Map<string, string>();
    const entries: Record<string, unknown>[] = [];
    const pending = [...input.pieces];
    let guard = 0;
    while (pending.length > 0 && guard < 20_000) {
      guard += 1;
      const piece = pending.find((p) => !p.dependsOnTitle || scheduledAt.has(p.dependsOnTitle));
      if (!piece) break;
      pending.splice(pending.indexOf(piece), 1);
      const depDate = piece.dependsOnTitle ? toDate(scheduledAt.get(piece.dependsOnTitle)!) : start;
      let cursor = addDays(depDate, piece.dependsOnTitle ? 1 : 0);
      const productionStart = new Date(cursor);
      cursor = addDays(cursor, piece.productionDays ?? 1);
      while (!isPublishingDay(cursor) || occupied.has(cursor.toISOString().slice(0, 10))) cursor = addDays(cursor, 1);
      const publishDate = cursor.toISOString().slice(0, 10);
      occupied.add(publishDate);
      scheduledAt.set(piece.title, publishDate);
      entries.push({ title: piece.title, channel: piece.channel ?? null, productionStart: productionStart.toISOString().slice(0, 10), publishDate, weekday: cursor.getUTCDay(), dependsOn: piece.dependsOnTitle ?? null });
    }
    return {
      summary: `Calendario con ${entries.length} piezas entre ${entries[0]?.publishDate ?? "-"} y ${entries.at(-1)?.publishDate ?? "-"}.`,
      data: { entries, unscheduled: pending.map((p) => p.title), weekdayCodesNote: "0=domingo ... 6=sábado (UTC)" },
      warnings: pending.length > 0 ? ["Quedan piezas con dependencias circulares o inexistentes."] : [],
    };
  },
});

const publishingCoordinator = defineTool({
  number: 136,
  limitation: "Coordina el flujo y detecta bloqueos con el estado aportado; publicar sigue requiriendo la integración de cada plataforma.",
  inputSchema: z.object({
    items: z.array(z.object({
      id: idStr(), title: txt(300).optional(),
      stage: z.enum(["draft", "in_production", "in_review", "approved", "scheduled", "published"]),
      hasFinalAssets: z.boolean(), hasApproval: z.boolean(), scheduledAt: txt(50).optional(), policyCheckPassed: z.boolean().optional(),
    })).min(1).max(500),
  }).strict(),
  example: { items: [{ id: "p1", title: "Subtítulos I", stage: "in_review", hasFinalAssets: true, hasApproval: false, policyCheckPassed: true }, { id: "p2", title: "Short", stage: "approved", hasFinalAssets: true, hasApproval: true, scheduledAt: "2026-11-05T16:00:00Z" }] },
  handler: (input) => {
    const nextStage: Record<string, string> = { draft: "in_production", in_production: "in_review", in_review: "approved", approved: "scheduled", scheduled: "published", published: "published" };
    const assessed = input.items.map((item) => {
      const blockers: string[] = [];
      if (["in_review", "approved", "scheduled"].includes(item.stage) && !item.hasFinalAssets) blockers.push("Faltan los activos finales");
      if (["approved", "scheduled"].includes(item.stage) && !item.hasApproval) blockers.push("Falta la aprobación");
      if (item.stage === "in_review" && !item.hasApproval) blockers.push("En revisión sin aprobación todavía");
      if (item.stage === "approved" && !item.scheduledAt) blockers.push("Aprobado pero sin fecha programada");
      if (item.policyCheckPassed === false) blockers.push("No supera la revisión de políticas");
      return { id: item.id, title: item.title ?? item.id, stage: item.stage, nextStage: nextStage[item.stage], canAdvance: blockers.length === 0, blockers };
    });
    return {
      summary: `${assessed.filter((a) => a.canAdvance).length}/${assessed.length} piezas pueden avanzar de etapa.`,
      data: { items: assessed, readyToPublish: assessed.filter((a) => a.stage === "scheduled" && a.canAdvance).map((a) => a.id), blocked: assessed.filter((a) => !a.canAdvance).map((a) => a.id) },
    };
  },
});

const repurposingEngine = defineTool({
  number: 137,
  inputSchema: z.object({
    text: longText(),
    targets: z.array(z.enum(["summary", "thread", "bullet_points", "faq", "short_caption", "title_candidates"])).min(1).max(6),
  }).strict(),
  example: { text: "Sincronizar subtítulos parece difícil, pero con marcas de tiempo claras se vuelve rutinario. La primera regla es no superar veinte caracteres por segundo. La segunda es revisar el resultado en el móvil. ¿Y si el audio cambia? Entonces se realinea solo el tramo afectado y no todo el archivo.", targets: ["summary", "bullet_points", "faq", "short_caption"] },
  handler: (input) => {
    const allSentences = sentences(input.text);
    const output: Record<string, unknown> = {};
    for (const target of input.targets) {
      if (target === "summary") output.summary = extractiveSummary(input.text, 2);
      if (target === "bullet_points") output.bullet_points = allSentences.slice(0, 8).map((s) => `• ${s}`);
      if (target === "thread") {
        const parts: string[] = [];
        let current = "";
        for (const sentence of allSentences) {
          if (current && current.length + sentence.length + 1 > 260) { parts.push(current); current = sentence; }
          else current = current ? `${current} ${sentence}` : sentence;
        }
        if (current) parts.push(current);
        output.thread = parts.map((part, i) => `${part} (${i + 1}/${parts.length})`);
      }
      if (target === "faq") {
        output.faq = allSentences.filter((s) => s.includes("?")).map((q) => ({ question: q, answer: allSentences[allSentences.indexOf(q) + 1] ?? "Sin respuesta en el texto original." }));
      }
      if (target === "short_caption") output.short_caption = (allSentences[0] ?? input.text.slice(0, 150)).slice(0, 150);
      if (target === "title_candidates") {
        const topic = extractiveSummary(input.text, 1).replace(/[.!?]+$/, "");
        output.title_candidates = [topic.slice(0, 80), `${topic.slice(0, 60)} (guía rápida)`, `Lo esencial: ${topic.slice(0, 60).toLowerCase()}`];
      }
    }
    return { summary: `Contenido reutilizado en ${input.targets.length} formatos.`, data: { outputs: output } };
  },
});

const policyPrechecker = defineTool({
  number: 138,
  limitation: "Prechequeo heurístico local: no es la revisión oficial de ninguna plataforma y no puede garantizar cumplimiento.",
  inputSchema: z.object({
    text: longText(),
    customBannedTerms: strArr(100, 100).optional(),
    maxLinks: z.number().int().nonnegative().max(100).optional(),
    maxHashtags: z.number().int().nonnegative().max(100).optional(),
  }).strict(),
  example: { text: "¡¡¡GANA DINERO GARANTIZADO AL 100%!!! Escribe a ofertas@ejemplo.invalid #a #b #c", maxHashtags: 2 },
  handler: (input) => {
    const findings: Record<string, unknown>[] = [];
    const lower = input.text.toLowerCase();
    const absolutePromises = ["100% garantizado", "garantizado al 100%", "sin ningun riesgo", "sin ningún riesgo", "gana dinero facil", "gana dinero fácil", "resultados garantizados"];
    for (const phrase of absolutePromises) if (lower.includes(phrase)) findings.push({ kind: "absolute_promise", detail: `Promesa absoluta: «${phrase}»`, severity: "medium" });
    const emails = extractPatterns(input.text, EMAIL_RE);
    if (emails.length > 0) findings.push({ kind: "personal_data", detail: `${emails.length} correos en el texto`, severity: "medium" });
    const phones = input.text.match(/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}\d/g) ?? [];
    if (phones.length > 0) findings.push({ kind: "possible_phone", detail: "Posibles números de teléfono", severity: "medium" });
    const letters = input.text.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
    const caps = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
    if (letters.length >= 20 && caps / letters.length > 0.5) findings.push({ kind: "excessive_caps", detail: "Más del 50% del texto en mayúsculas", severity: "low" });
    const links = (input.text.match(/https?:\/\//g) ?? []).length;
    if (links > (input.maxLinks ?? 3)) findings.push({ kind: "too_many_links", detail: `${links} enlaces (máx. sugerido ${input.maxLinks ?? 3})`, severity: "low" });
    const hashtags = (input.text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
    if (hashtags > (input.maxHashtags ?? 10)) findings.push({ kind: "hashtag_spam", detail: `${hashtags} hashtags`, severity: "low" });
    for (const term of input.customBannedTerms ?? []) if (lower.includes(term.toLowerCase())) findings.push({ kind: "banned_term", detail: `Término vetado presente: «${term}»`, severity: "high" });
    return {
      summary: findings.length === 0 ? "Sin señales de riesgo en el prechequeo local." : `${findings.length} posibles problemas antes de publicar.`,
      data: { findings, shouldReviewManually: findings.some((f) => f.severity !== "low") },
    };
  },
});

const attributionManager = defineTool({
  number: 139,
  inputSchema: z.object({
    assets: z.array(z.object({ id: idStr(), title: txt(500), author: txt(300).optional(), license: txt(200).optional(), sourceUrl: txt(1_000).optional() })).min(1).max(1_000),
  }).strict(),
  example: { assets: [{ id: "a1", title: "Foto puerto", author: "Ana G.", license: "CC-BY-4.0", sourceUrl: "https://ejemplo.invalid/foto" }, { id: "a2", title: "Pista de fondo (sin datos)" }] },
  handler: (input) => {
    const checked = input.assets.map((asset) => {
      const license = (asset.license ?? "").toUpperCase();
      const needsAttribution = /(CC[-\s]?BY|BY-SA|BY-NC|MIT|APACHE|BSD)/i.test(license);
      const missing: string[] = [];
      if (needsAttribution && !asset.author) missing.push("autor");
      if (needsAttribution && !asset.sourceUrl) missing.push("fuente");
      if (!asset.license) missing.push("licencia desconocida");
      return { id: asset.id, title: asset.title, needsAttribution, license: asset.license ?? null, missing, creditLine: needsAttribution && asset.author ? `«${asset.title}» por ${asset.author}${asset.license ? ` (${asset.license})` : ""}${asset.sourceUrl ? ` — ${asset.sourceUrl}` : ""}` : null };
    });
    return {
      summary: `${checked.filter((c) => c.missing.length === 0).length}/${checked.length} activos con atribución completa.`,
      data: { assets: checked, creditsBlock: checked.filter((c) => c.creditLine).map((c) => c.creditLine).join("\n"), incomplete: checked.filter((c) => c.missing.length > 0).map((c) => c.id) },
    };
  },
});

const performanceAnalyzer = defineTool({
  number: 140,
  limitation: "Las hipótesis son reglas heurísticas sobre las métricas aportadas: confírmalas con experimentos, no las tomes como causas probadas.",
  inputSchema: z.object({
    posts: z.array(z.object({ id: idStr(), title: txt(300).optional(), views: z.number().nonnegative(), likes: z.number().nonnegative().optional(), comments: z.number().nonnegative().optional(), shares: z.number().nonnegative().optional(), watchMinutes: z.number().nonnegative().optional(), durationSec: z.number().positive().optional() })).min(1).max(2_000),
  }).strict(),
  example: { posts: [{ id: "v1", title: "Subtítulos I", views: 10000, likes: 800, comments: 90, shares: 120, watchMinutes: 3000, durationSec: 360 }, { id: "v2", title: "Costes", views: 9000, likes: 90, comments: 5, shares: 2, watchMinutes: 400, durationSec: 360 }] },
  handler: (input) => {
    const analyzed = input.posts.map((p) => {
      const engagementRate = p.views > 0 ? ((p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)) / p.views : 0;
      const avgViewSec = p.watchMinutes !== undefined && p.views > 0 ? (p.watchMinutes * 60) / p.views : null;
      const retentionPct = avgViewSec !== null && p.durationSec ? round((avgViewSec / p.durationSec) * 100, 1) : null;
      return { id: p.id, title: p.title ?? p.id, views: p.views, engagementPct: round(engagementRate * 100, 2), retentionPct, shareRatePct: p.views > 0 ? round(((p.shares ?? 0) / p.views) * 100, 2) : null };
    }).sort((a, b) => b.engagementPct - a.engagementPct);
    const medianViews = median(analyzed.map((a) => a.views));
    const medianEngagement = median(analyzed.map((a) => a.engagementPct));
    const hypotheses: string[] = [];
    for (const post of analyzed) {
      if (post.views >= medianViews && post.engagementPct < medianEngagement) hypotheses.push(`«${post.title}» atrae clics pero no interacción: revisa gancho frente a contenido (¿promesa incumplida?).`);
      if (post.retentionPct !== null && post.retentionPct < 30) hypotheses.push(`«${post.title}» retiene poco (${post.retentionPct}%): el arranque o el ritmo pueden estar fallando.`);
      if ((post.shareRatePct ?? 0) > 1) hypotheses.push(`«${post.title}» se comparte mucho (${post.shareRatePct}%): tema con potencial de serie.`);
    }
    return {
      summary: `Mejor interacción: «${analyzed[0].title}» (${analyzed[0].engagementPct}%).`,
      data: { posts: analyzed, viewsStats: describe(analyzed.map((a) => a.views)), hypotheses: [...new Set(hypotheses)].slice(0, 10), totals: { views: sum(analyzed.map((a) => a.views)) } },
    };
  },
});

// fail se reserva para entradas sin texto en futuras reglas.
void fail;

export const f14: LocalToolDefinition[] = [scriptOutline, hookOptimizer, narrativeChecker, formatAdapter, calendarPlanner, publishingCoordinator, repurposingEngine, policyPrechecker, attributionManager, performanceAnalyzer];
