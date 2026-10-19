/**
 * Familia 10 — Web, búsqueda y verificación (herramientas 91-100).
 * Todo el familia trabaja sin red: analiza el material que el llamante aporta
 * (corpus, HTML, resultados, instantáneas). Nada aquí descarga páginas.
 */
import { z } from "zod";
import { extractHeadings, extractImages, extractLinks, extractTitle, htmlToText } from "../engines/data.js";
import { round } from "../engines/stats.js";
import { sha256Hex } from "../engines/security.js";
import { NUMBER_RE, URL_RE, cosineText, extractPatterns, extractiveSummary, linesDiff, queryOverlap, sentences, tokens } from "../engines/text.js";
import { daysBetween, toDate } from "../engines/time.js";
import { defineTool, idStr, longText, reqText, txt, type LocalToolDefinition } from "./types.js";

const webSearch = defineTool({
  number: 91,
  limitation: "No hay búsqueda web en vivo (sin proveedores): busca y ordena sobre el corpus aportado y, sin corpus, genera el plan de búsqueda.",
  inputSchema: z.object({
    query: reqText(1_000),
    corpus: z.array(z.object({ id: idStr(), title: txt(500), url: txt(1_000), text: longText().optional(), source: txt(200).optional(), date: txt(50).optional() })).max(1_000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).strict(),
  example: { query: "cómo sincronizar subtítulos con audio", corpus: [{ id: "1", title: "Guía de subtítulos", url: "https://ejemplo.invalid/subtitulos", text: "Sincroniza subtítulos con marcas de tiempo del audio." }, { id: "2", title: "Guía de costes", url: "https://ejemplo.invalid/costes", text: "Presupuestos mensuales de renderizado." }] },
  handler: (input) => {
    const queryVariants = [
      input.query,
      `"${input.query}"`,
      `${input.query} documentación`,
      `${input.query} filetype:pdf`,
      `${tokens(input.query).slice(0, 3).join(" ")} site:.org OR site:.edu OR site:.gob`,
    ];
    if (!input.corpus?.length) {
      return {
        summary: "Plan de búsqueda generado (sin corpus que buscar).",
        data: { mode: "search_plan_only", plannedQueries: queryVariants, suggestedSourceTypes: ["documentación oficial", "fuentes primarias", "prensa especializada con fecha visible"], nextStep: "Ejecuta estas consultas en tu buscador y pasa los resultados a kronos_search_result_relevance_ranker." },
      };
    }
    const ranked = input.corpus.map((doc) => {
      const titleScore = queryOverlap(input.query, doc.title);
      const bodyScore = cosineText(input.query, doc.text ?? "");
      return { id: doc.id, title: doc.title, url: doc.url, source: doc.source ?? null, date: doc.date ?? null, score: round(titleScore * 0.6 + bodyScore * 0.4, 4) };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, input.limit ?? 10);
    return {
      summary: `${ranked.length} resultados del corpus para «${input.query}».`,
      data: { mode: "offline_corpus_search", results: ranked, plannedQueries: queryVariants },
    };
  },
});

const relevanceRanker = defineTool({
  number: 92,
  inputSchema: z.object({
    query: reqText(1_000),
    results: z.array(z.object({ title: txt(1_000), snippet: longText().optional(), url: txt(2_000), date: txt(50).optional() })).min(1).max(500),
    freshnessWeight: z.number().min(0).max(1).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { query: "límites de la API de vídeo", results: [{ title: "Límites de la API", snippet: "La API de vídeo permite 100 peticiones por minuto.", url: "https://ejemplo.invalid/limites", date: "2026-10-01" }, { title: "Recetas de cocina", url: "https://ejemplo.invalid/recetas" }], now: "2026-10-19T00:00:00Z" },
  handler: (input) => {
    const now = toDate(input.now);
    const fw = input.freshnessWeight ?? 0.15;
    const ranked = input.results.map((r, i) => {
      const titleScore = queryOverlap(input.query, r.title);
      const snippetScore = cosineText(input.query, r.snippet ?? "");
      let freshness = 0.5;
      if (r.date) { const age = Math.max(0, daysBetween(toDate(r.date), now)); freshness = Math.max(0, 1 - age / 365); }
      const score = round(titleScore * (0.55 - fw / 2) + snippetScore * 0.45 + freshness * fw, 4);
      return { position: i + 1, title: r.title, url: r.url, score, titleScore: round(titleScore, 3), snippetScore: round(snippetScore, 3), freshnessScore: round(freshness, 3) };
    }).sort((a, b) => b.score - a.score);
    return { summary: `Mejor resultado reordenado: «${ranked[0].title}» (${ranked[0].score}).`, data: { ranked } };
  },
});

const claimVerification = defineTool({
  number: 93,
  limitation: "Contrasta la afirmación solo contra las fuentes aportadas: «insuficiente» significa sin evidencia aquí, no «falso».",
  inputSchema: z.object({
    claim: reqText(2_000),
    sources: z.array(z.object({ id: idStr(), text: longText(), stance: z.enum(["supports", "refutes", "neutral"]).optional(), url: txt(1_000).optional() })).min(1).max(100),
  }).strict(),
  example: { claim: "La cuota gratuita permite 100 renderizados al mes", sources: [{ id: "oficial", text: "El plan gratuito incluye 100 renderizados mensuales por cuenta.", stance: "supports" }] },
  handler: (input) => {
    const claimNumbers = extractPatterns(input.claim, NUMBER_RE).map((n) => Number(n.replace(",", ".")));
    const evaluated = input.sources.map((s) => {
      const sourceNumbers = extractPatterns(s.text, NUMBER_RE).map((n) => Number(n.replace(",", ".")));
      const overlap = cosineText(input.claim, s.text);
      const numbersMatch = claimNumbers.length === 0 ? null : claimNumbers.every((n) => sourceNumbers.includes(n));
      const numbersConflict = claimNumbers.length > 0 && sourceNumbers.length > 0 && !numbersMatch;
      let stance = s.stance ?? "neutral";
      if (!s.stance && numbersConflict && overlap > 0.2) stance = "refutes";
      else if (!s.stance && numbersMatch && overlap > 0.2) stance = "supports";
      return { sourceId: s.id, overlap: round(overlap, 3), claimNumbers, sourceNumbers: sourceNumbers.slice(0, 10), numbersMatch, inferredStance: stance };
    });
    const supports = evaluated.filter((e) => e.inferredStance === "supports").length;
    const refutes = evaluated.filter((e) => e.inferredStance === "refutes").length;
    const verdict = supports > 0 && refutes === 0 ? "supported" : refutes > 0 && supports === 0 ? "contradicted" : supports > 0 && refutes > 0 ? "mixed" : "insufficient_evidence";
    return {
      summary: `Veredicto con las fuentes aportadas: ${verdict.replace(/_/g, " ")}.`,
      data: { verdict, supports, refutes, sources: evaluated, caution: "Verifica siempre contra la fuente primaria antes de citar cifras." },
    };
  },
});

const citationValidator = defineTool({
  number: 94,
  limitation: "Valida forma y correspondencia interna (marcas, URLs, cifras sin cita); no comprueba que la página exista ni diga eso (eso exige red).",
  inputSchema: z.object({ text: longText() }).strict(),
  example: { text: "El uso creció un 40% en 2026 [1]. Además hay 1.000 usuarios nuevos.\n\n[1] https://ejemplo.invalid/informe" },
  handler: (input) => {
    const urls = extractPatterns(input.text, URL_RE);
    const urlChecks = urls.map((u) => { try { const parsed = new URL(u.replace(/[.,;]+$/, "")); return { url: u, valid: true, host: parsed.hostname, https: parsed.protocol === "https:" }; } catch { return { url: u, valid: false, host: null, https: false }; } });
    const markers = [...new Set([...input.text.matchAll(/\[(\d+)\]/g)].map((m) => m[1]))];
    const numericClaims = sentences(input.text).filter((s) => /\d/.test(s));
    const uncitedNumeric = numericClaims.filter((s) => !/\[(\d+)\]/.test(s) && !/https?:\/\//.test(s)).map((s) => s.slice(0, 200));
    return {
      summary: `${urls.length} enlaces (${urlChecks.filter((c) => c.valid).length} válidos); ${uncitedNumeric.length} afirmaciones con cifras sin cita cercana.`,
      data: { urls: urlChecks, citationMarkersFound: markers, uncitedNumericClaims: uncitedNumeric.slice(0, 20), nonHttpsUrls: urlChecks.filter((c) => c.valid && !c.https).map((c) => c.url) },
    };
  },
});

const webFreshness = defineTool({
  number: 95,
  inputSchema: z.object({
    pages: z.array(z.object({ url: txt(2_000), publishedAt: txt(50).optional(), lastCheckedAt: txt(50).optional(), maxAgeDays: z.number().positive().max(36_500).optional() })).min(1).max(1_000),
    defaultMaxAgeDays: z.number().positive().max(36_500).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { pages: [{ url: "https://ejemplo.invalid/precios", publishedAt: "2026-05-01", maxAgeDays: 90 }, { url: "https://ejemplo.invalid/guia", publishedAt: "2026-10-10" }], now: "2026-10-19T00:00:00Z" },
  handler: (input) => {
    const now = toDate(input.now);
    const pages = input.pages.map((p) => {
      const limit = p.maxAgeDays ?? input.defaultMaxAgeDays ?? 180;
      const age = p.publishedAt ? daysBetween(toDate(p.publishedAt), now) : null;
      const sinceCheck = p.lastCheckedAt ? daysBetween(toDate(p.lastCheckedAt), now) : null;
      const possiblyStale = age === null ? true : age > limit;
      return { url: p.url, ageDays: age, limitDays: limit, daysSinceLastCheck: sinceCheck, status: age === null ? "unknown_age" : possiblyStale ? "possibly_stale" : "current", action: possiblyStale || age === null ? "Revisar el contenido antes de citarlo" : "Sin acción" };
    }).sort((a, b) => (b.ageDays ?? 9_999) - (a.ageDays ?? 9_999));
    return { summary: `${pages.filter((p) => p.status !== "current").length} páginas posiblemente desactualizadas.`, data: { pages } };
  },
});

const domainReputation = defineTool({
  number: 96,
  limitation: "Heurísticas offline sobre la forma del dominio: no consulta listas de reputación ni DNS. Un dominio «limpio» aquí no está certificado como seguro.",
  inputSchema: z.object({ domain: reqText(500) }).strict(),
  example: { domain: "secure-login.ejemplo-banco-verificacion123.invalid" },
  handler: (input) => {
    let host = input.domain.trim().toLowerCase();
    try { host = new URL(host.includes("://") ? host : `https://${host}`).hostname; } catch { /* se evalúa tal cual */ }
    const labels = host.split(".").filter(Boolean);
    const findings: string[] = [];
    let score = 100;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isIp) { score -= 40; findings.push("Es una IP literal, no un dominio"); }
    if (labels.some((l) => l.startsWith("xn--"))) { score -= 25; findings.push("Punycode (xn--): posible suplantación por caracteres parecidos"); }
    if (labels.length > 3) { score -= 10; findings.push(`Subdominio profundo (${labels.length} etiquetas)`); }
    const base = labels.at(-2) ?? host;
    const hyphens = (base.match(/-/g) ?? []).length;
    if (hyphens >= 2) { score -= 15; findings.push("Varios guiones en el dominio principal"); }
    if (/\d{3,}/.test(base)) { score -= 10; findings.push("Ristra larga de dígitos en el nombre"); }
    const bait = ["login", "secure", "verify", "account", "update", "bank", "wallet", "claim", "free", "verificacion", "seguro"];
    const hits = bait.filter((b) => host.includes(b));
    if (hits.length >= 2) { score -= 20; findings.push(`Palabras típicas de cebo de phishing: ${hits.join(", ")}`); }
    const tld = labels.at(-1) ?? "";
    if (["zip", "mov", "top", "xyz", "click", "buzz"].includes(tld)) { score -= 10; findings.push(`TLD .${tld} frecuente en abuso (heurística, no certeza)`); }
    if (["gov", "gob", "edu"].includes(tld) || host.endsWith(".gob.mx") || host.endsWith(".gob.es")) { score += 5; findings.push("Sufijo institucional"); }
    score = Math.max(0, Math.min(100, score));
    return {
      summary: `Señales de confianza de ${host}: ${score}/100 (${findings.length} avisos).`,
      data: { domain: host, trustSignalsScore: score, riskLevel: score >= 75 ? "low" : score >= 50 ? "medium" : "high", findings, isIpLiteral: isIp },
    };
  },
});

const sourceComparison = defineTool({
  number: 97,
  inputSchema: z.object({
    sources: z.array(z.object({ id: idStr(), date: txt(50).optional(), text: longText().optional(), keyPoints: z.array(txt(2_000)).max(100).optional() })).min(2).max(50),
  }).strict(),
  example: { sources: [{ id: "a", date: "2026-09-01", keyPoints: ["La cuota es 100", "Hay plan gratuito"] }, { id: "b", date: "2026-10-01", keyPoints: ["La cuota es 150", "Hay plan gratuito"] }] },
  handler: (input) => {
    const pointsOf = (s: (typeof input.sources)[number]) => s.keyPoints ?? sentences(s.text ?? "");
    const all = input.sources.map((s) => ({ id: s.id, date: s.date ?? null, points: pointsOf(s) }));
    const pairOverlaps: Record<string, unknown>[] = [];
    const contradictions: Record<string, unknown>[] = [];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const textA = all[i].points.join(" ");
        const textB = all[j].points.join(" ");
        pairOverlaps.push({ pair: [all[i].id, all[j].id], similarity: round(cosineText(textA, textB), 3) });
        for (const pa of all[i].points) {
          for (const pb of all[j].points) {
            const similarity = cosineText(pa, pb);
            const numsA = extractPatterns(pa, NUMBER_RE);
            const numsB = extractPatterns(pb, NUMBER_RE);
            if (similarity > 0.45 && numsA.length > 0 && numsB.length > 0 && numsA.join() !== numsB.join()) {
              contradictions.push({ sources: [all[i].id, all[j].id], pointA: pa.slice(0, 200), pointB: pb.slice(0, 200), detail: "Cifras distintas en puntos equivalentes" });
            }
          }
        }
      }
    }
    return {
      summary: `${input.sources.length} fuentes comparadas; ${contradictions.length} contradicciones numéricas detectadas.`,
      data: { pairSimilarities: pairOverlaps, contradictions: contradictions.slice(0, 30), byRecency: [...all].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).map((s) => s.id), coverage: all.map((s) => ({ id: s.id, keyPointCount: s.points.length })) },
    };
  },
});

const pageExtractor = defineTool({
  number: 98,
  limitation: "Extrae estructura del HTML aportado con un lector ligero basado en expresiones regulares; no descarga la página ni ejecuta su JavaScript.",
  inputSchema: z.object({ html: longText(), baseUrl: txt(1_000).optional() }).strict(),
  example: { html: "<!doctype html><html><head><title>Guía KRONOS</title><meta name=\"description\" content=\"Guía oficial\"></head><body><h1>Inicio</h1><h2>Subtítulos</h2><p>Texto de ejemplo.</p><a href=\"/costes\">Costes</a></body></html>", baseUrl: "https://ejemplo.invalid" },
  handler: (input) => {
    const description = input.html.match(/<meta\s[^>]*name\s*=\s*"description"[^>]*content\s*=\s*"([^"]*)"/i)?.[1] ?? null;
    const links = extractLinks(input.html).map((l) => {
      let absolute = l.href;
      if (input.baseUrl) { try { absolute = new URL(l.href, input.baseUrl).toString(); } catch { /* conserva */ } }
      return { ...l, absoluteUrl: absolute };
    });
    const plain = htmlToText(input.html);
    return {
      summary: `Página «${extractTitle(input.html) ?? "sin título"}»: ${links.length} enlaces, ${tokens(plain, { dropStopwords: false }).length} palabras.`,
      data: { title: extractTitle(input.html), metaDescription: description, headings: extractHeadings(input.html), links: links.slice(0, 100), images: extractImages(input.html).slice(0, 50), wordCount: tokens(plain, { dropStopwords: false }).length, hasJsonLd: /application\/ld\+json/.test(input.html), contentHashSha256: sha256Hex(plain) },
    };
  },
});

const changeWatcher = defineTool({
  number: 99,
  inputSchema: z.object({
    previous: z.object({ content: longText().optional(), sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional() }).strict(),
    current: z.object({ content: longText() }).strict(),
    normalizeHtml: z.boolean().optional(),
  }).strict(),
  example: { previous: { content: "<h1>Precio: 10</h1>\n<p>Oferta</p>" }, current: { content: "<h1>Precio: 12</h1>\n<p>Oferta</p>" }, normalizeHtml: true },
  handler: (input) => {
    const normalize = (value: string) => (input.normalizeHtml ? htmlToText(value) : value.replace(/\s+\n/g, "\n").trim());
    const currentText = normalize(input.current.content);
    const currentHash = sha256Hex(currentText);
    if (input.previous.content === undefined) {
      const changed = input.previous.sha256 ? input.previous.sha256.toLowerCase() !== currentHash : true;
      return { summary: changed ? "El contenido cambió (huella distinta); sin texto anterior no hay detalle." : "Sin cambios según la huella.", data: { changed, currentSha256: currentHash, detailAvailable: false } };
    }
    const previousText = normalize(input.previous.content);
    if (previousText === currentText) return { summary: "Sin cambios detectados.", data: { changed: false, currentSha256: currentHash, changePercent: 0, added: [], removed: [] } };
    const { ops, approximate } = linesDiff(previousText, currentText);
    const added = ops.filter((o) => o.type === "add").map((o) => o.line);
    const removed = ops.filter((o) => o.type === "remove").map((o) => o.line);
    const totalLines = Math.max(1, previousText.split("\n").length);
    return {
      summary: `Cambio detectado: +${added.length}/-${removed.length} líneas.`,
      data: { changed: true, currentSha256: currentHash, previousSha256: sha256Hex(previousText), added: added.slice(0, 50), removed: removed.slice(0, 50), changePercent: round((added.length + removed.length) / totalLines * 100, 1), approximate },
    };
  },
});

const researchSynthesizer = defineTool({
  number: 100,
  inputSchema: z.object({
    question: reqText(1_000),
    findings: z.array(z.object({ text: txt(4_000), source: idStr().optional(), date: txt(50).optional() })).min(1).max(200),
    openQuestions: z.array(txt(1_000)).max(50).optional(),
  }).strict(),
  example: { question: "¿Qué límites tiene el plan gratuito?", findings: [{ text: "El plan gratuito incluye 100 renderizados al mes según la página de precios.", source: "precios" }, { text: "Probablemente el límite subirá el próximo año, según rumores del foro.", source: "foro" }], openQuestions: ["¿El límite es por usuario o por cuenta?"] },
  handler: (input) => {
    const hedge = /probablemente|quizás|quizas|puede que|parece|según rumores|se cree|might|likely|probably|rumou?r/i;
    const facts = input.findings.filter((f) => f.source && !hedge.test(f.text));
    const inferences = input.findings.filter((f) => hedge.test(f.text) || !f.source);
    const gathered = input.findings.map((f) => f.text).join(" ");
    return {
      summary: `Síntesis: ${facts.length} hechos con fuente, ${inferences.length} inferencias, ${(input.openQuestions ?? []).length} vacíos declarados.`,
      data: {
        question: input.question,
        facts: facts.map((f) => ({ text: f.text, source: f.source, date: f.date ?? null })),
        inferences: inferences.map((f) => ({ text: f.text, source: f.source ?? null, whyInference: !f.source ? "sin fuente declarada" : "lenguaje especulativo" })),
        gaps: input.openQuestions ?? [],
        shortSynthesis: extractiveSummary(gathered, 3),
        caution: "Los «hechos» son afirmaciones con fuente entre el material aportado; su veracidad depende de esas fuentes.",
      },
    };
  },
});

export const f10: LocalToolDefinition[] = [webSearch, relevanceRanker, claimVerification, citationValidator, webFreshness, domainReputation, sourceComparison, pageExtractor, changeWatcher, researchSynthesizer];
