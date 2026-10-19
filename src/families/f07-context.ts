/** Familia 07 — Contexto, memoria y conocimiento (herramientas 61-70). */
import { z } from "zod";
import { connectedComponents } from "../engines/graph.js";
import { round } from "../engines/stats.js";
import { cosineText, extractiveSummary, jaccard, sentences, termFreq, tokens } from "../engines/text.js";
import { daysBetween, toDate } from "../engines/time.js";
import { contextScopes, evictOldest, knowledgeIndexes, MAX_LIST_ITEMS } from "../state/stores.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const contextStore = defineTool({
  number: 61,
  stateful: true,
  limitation: "Memoria en proceso con TTL opcional: se pierde al reiniciar. No almacenes secretos.",
  inputSchema: z.object({
    action: z.enum(["set", "get", "delete", "list", "scopes"]),
    scope: idStr().optional(),
    key: idStr().optional(),
    value: z.unknown().optional(),
    ttlSeconds: z.number().positive().max(2_592_000).optional(),
  }).strict(),
  example: { action: "set", scope: "proyecto:demo", key: "decision_formato", value: "vídeo vertical 9:16", ttlSeconds: 3600 },
  handler: (input) => {
    const now = Date.now();
    if (input.action === "scopes") {
      return { summary: `${contextScopes.size} ámbitos con contexto.`, data: { scopes: [...contextScopes.entries()].map(([scope, entries]) => ({ scope, keys: entries.size })) } };
    }
    if (!input.scope) fail("INVALID_INPUT");
    if (input.action === "list") {
      const entries = contextScopes.get(input.scope!) ?? new Map();
      const live = [...entries.entries()].filter(([, v]) => !v.expiresAt || v.expiresAt > now).map(([key, v]) => ({ key, value: v.value, updatedAt: new Date(v.updatedAt).toISOString(), expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null }));
      return { summary: `Ámbito ${input.scope}: ${live.length} claves vivas.`, data: { scope: input.scope, entries: live } };
    }
    if (!input.key) fail("INVALID_INPUT");
    if (input.action === "set") {
      if (input.value === undefined) fail("INVALID_INPUT");
      const entries = contextScopes.get(input.scope!) ?? new Map();
      if (entries.size >= MAX_LIST_ITEMS && !entries.has(input.key!)) fail("LIMIT_EXCEEDED");
      entries.set(input.key!, { value: input.value, updatedAt: now, expiresAt: input.ttlSeconds ? now + input.ttlSeconds * 1000 : undefined });
      contextScopes.set(input.scope!, entries);
      evictOldest(contextScopes);
      return { summary: `Contexto guardado en ${input.scope}/${input.key}.`, data: { scope: input.scope, key: input.key, expiresAt: input.ttlSeconds ? new Date(now + input.ttlSeconds * 1000).toISOString() : null } };
    }
    const entries = contextScopes.get(input.scope!);
    const found = entries?.get(input.key!);
    if (input.action === "delete") {
      const deleted = entries?.delete(input.key!) ?? false;
      return { summary: deleted ? "Clave eliminada." : "La clave no existía.", data: { deleted } };
    }
    if (!found || (found.expiresAt && found.expiresAt <= now)) {
      if (found) entries?.delete(input.key!);
      fail("NOT_FOUND");
    }
    return { summary: `Contexto recuperado de ${input.scope}/${input.key}.`, data: { scope: input.scope, key: input.key, value: found!.value, updatedAt: new Date(found!.updatedAt).toISOString() } };
  },
});

const indexBuilder = defineTool({
  number: 62,
  stateful: true,
  limitation: "El índice vive en memoria y se consulta con kronos_relevant_memory_retriever mediante el mismo indexId.",
  inputSchema: z.object({
    indexId: idStr(),
    documents: z.array(z.object({ id: idStr(), title: txt(500).optional(), text: longText(), tags: strArr(50, 100).optional(), scope: idStr().optional() })).min(1).max(2_000),
    replace: z.boolean().optional(),
  }).strict(),
  example: { indexId: "demo", documents: [{ id: "d1", title: "Guía de subtítulos", text: "Los subtítulos deben sincronizarse con el audio y no superar dos líneas.", tags: ["vídeo"] }, { id: "d2", title: "Guía de costes", text: "El presupuesto mensual limita el número de renderizados.", tags: ["costes"] }], replace: true },
  handler: (input) => {
    const existing = input.replace ? [] : [...(knowledgeIndexes.get(input.indexId)?.documents ?? [])];
    const byId = new Map(existing.map((d) => [d.id, d]));
    for (const doc of input.documents) byId.set(doc.id, { id: doc.id, title: doc.title ?? doc.id, text: doc.text, tags: doc.tags ?? [], scope: doc.scope });
    const documents = [...byId.values()].slice(-MAX_LIST_ITEMS);
    knowledgeIndexes.set(input.indexId, { documents, createdAt: new Date().toISOString() });
    evictOldest(knowledgeIndexes);
    const termCounts = termFreq(documents.flatMap((d) => tokens(d.text)));
    return {
      summary: `Índice «${input.indexId}»: ${documents.length} documentos, ${termCounts.size} términos únicos.`,
      data: { indexId: input.indexId, documentCount: documents.length, uniqueTerms: termCounts.size, topTerms: [...termCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term, count]) => ({ term, count })), documentIds: documents.map((d) => d.id) },
    };
  },
});

const memoryRetriever = defineTool({
  number: 63,
  inputSchema: z.object({
    query: reqText(2_000),
    indexId: idStr().optional(),
    scope: idStr().optional(),
    memories: z.array(z.object({ id: idStr(), text: longText(), scope: idStr().optional(), updatedAt: txt(50).optional() })).max(2_000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).strict(),
  example: { query: "¿Cómo sincronizar subtítulos?", memories: [{ id: "m1", text: "Los subtítulos deben alinearse con el audio por marcas de tiempo.", scope: "vídeo" }, { id: "m2", text: "El presupuesto limita los renderizados.", scope: "costes" }], limit: 2 },
  handler: (input) => {
    let pool: { id: string; text: string; scope?: string; title?: string }[] = [];
    if (input.memories?.length) pool = input.memories;
    else if (input.indexId) {
      const index = knowledgeIndexes.get(input.indexId);
      if (!index) fail("NOT_FOUND");
      pool = index!.documents;
    } else fail("INVALID_INPUT");
    const filtered = pool.filter((m) => !input.scope || m.scope === input.scope);
    const ranked = filtered
      .map((m) => ({ id: m.id, title: m.title ?? null, scope: m.scope ?? null, score: round(cosineText(input.query, `${m.title ?? ""} ${m.text}`), 4), preview: m.text.slice(0, 240) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 5);
    return {
      summary: ranked.length > 0 ? `Recuerdo más pertinente: ${ranked[0].id} (${ranked[0].score}).` : "Sin recuerdos pertinentes en el ámbito indicado.",
      data: { results: ranked, searched: filtered.length, scopeFilter: input.scope ?? null },
    };
  },
});

const retentionController = defineTool({
  number: 64,
  inputSchema: z.object({
    items: z.array(z.object({ id: idStr(), createdAt: txt(50), lastAccessedAt: txt(50).optional(), pinned: z.boolean().optional() })).min(1).max(2_000),
    maxAgeDays: z.number().positive().max(36_500),
    idleExpirationDays: z.number().positive().max(36_500).optional(),
    reviewGraceDays: z.number().nonnegative().max(365).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { items: [{ id: "viejo", createdAt: "2026-01-01T00:00:00Z" }, { id: "fijo", createdAt: "2026-01-01T00:00:00Z", pinned: true }, { id: "nuevo", createdAt: "2026-10-10T00:00:00Z" }], maxAgeDays: 90, now: "2026-10-19T00:00:00Z" },
  handler: (input) => {
    const now = toDate(input.now);
    const grace = input.reviewGraceDays ?? 7;
    const classified = input.items.map((item) => {
      const age = daysBetween(toDate(item.createdAt), now);
      const idle = item.lastAccessedAt ? daysBetween(toDate(item.lastAccessedAt), now) : age;
      let decision: "keep" | "review" | "expire" = "keep";
      if (!item.pinned) {
        if (age > input.maxAgeDays || (input.idleExpirationDays && idle > input.idleExpirationDays)) {
          decision = age > input.maxAgeDays + grace ? "expire" : "review";
          if (input.idleExpirationDays && idle > input.idleExpirationDays + grace) decision = "expire";
        }
      }
      return { id: item.id, ageDays: age, idleDays: idle, pinned: Boolean(item.pinned), decision };
    });
    return {
      summary: `Retención: ${classified.filter((c) => c.decision === "keep").length} se conservan, ${classified.filter((c) => c.decision === "expire").length} caducan.`,
      data: { items: classified, keep: classified.filter((c) => c.decision === "keep").map((c) => c.id), review: classified.filter((c) => c.decision === "review").map((c) => c.id), expire: classified.filter((c) => c.decision === "expire").map((c) => c.id), note: "Decisión calculada; aplicar el borrado sigue siendo responsabilidad del llamante." },
    };
  },
});

const provenanceTracker = defineTool({
  number: 65,
  inputSchema: z.object({
    claims: z.array(z.object({ id: idStr(), text: txt(2_000), source: txt(500).optional(), sourceUrl: txt(1_000).optional(), retrievedAt: txt(50).optional() })).min(1).max(1_000),
    maxSourceAgeDays: z.number().positive().max(36_500).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { claims: [{ id: "c1", text: "La cuota es de 100 usuarios", source: "panel del proveedor", retrievedAt: "2026-10-18T00:00:00Z" }, { id: "c2", text: "El límite subirá pronto" }], now: "2026-10-19T00:00:00Z" },
  handler: (input) => {
    const now = toDate(input.now);
    const audited = input.claims.map((c) => {
      const issues: string[] = [];
      if (!c.source && !c.sourceUrl) issues.push("Sin fuente declarada");
      if (c.sourceUrl) { try { new URL(c.sourceUrl); } catch { issues.push("URL de fuente inválida"); } }
      if (!c.retrievedAt) issues.push("Sin fecha de obtención");
      else if (input.maxSourceAgeDays && daysBetween(toDate(c.retrievedAt), now) > input.maxSourceAgeDays) issues.push(`Fuente más antigua que ${input.maxSourceAgeDays} días`);
      return { id: c.id, traceable: issues.length === 0, issues, source: c.source ?? c.sourceUrl ?? null, retrievedAt: c.retrievedAt ?? null };
    });
    return {
      summary: `${audited.filter((a) => a.traceable).length}/${audited.length} afirmaciones con procedencia completa.`,
      data: { claims: audited, untraceable: audited.filter((a) => !a.traceable).map((a) => a.id) },
    };
  },
});

const evidenceReconciliation = defineTool({
  number: 66,
  inputSchema: z.object({
    evidence: z.array(z.object({ claimId: idStr(), stance: z.enum(["supports", "refutes", "neutral"]), source: idStr(), confidence: z.number().min(0).max(1).optional(), retrievedAt: txt(50).optional() })).min(1).max(2_000),
  }).strict(),
  example: { evidence: [{ claimId: "limite-100", stance: "supports", source: "docs", confidence: 0.9 }, { claimId: "limite-100", stance: "refutes", source: "foro", confidence: 0.3 }] },
  handler: (input) => {
    const groups = new Map<string, typeof input.evidence>();
    for (const e of input.evidence) groups.set(e.claimId, [...(groups.get(e.claimId) ?? []), e]);
    const reconciled = [...groups.entries()].map(([claimId, items]) => {
      const supportWeight = items.filter((i) => i.stance === "supports").reduce((acc, i) => acc + (i.confidence ?? 0.5), 0);
      const refuteWeight = items.filter((i) => i.stance === "refutes").reduce((acc, i) => acc + (i.confidence ?? 0.5), 0);
      const total = supportWeight + refuteWeight;
      const hasConflict = supportWeight > 0 && refuteWeight > 0;
      const verdict = total === 0 ? "insufficient" : hasConflict && Math.min(supportWeight, refuteWeight) / total > 0.3 ? "conflicting" : supportWeight > refuteWeight ? "leaning_supported" : "leaning_refuted";
      return { claimId, verdict, supportWeight: round(supportWeight, 2), refuteWeight: round(refuteWeight, 2), sources: [...new Set(items.map((i) => i.source))], uncertainty: hasConflict ? "Hay fuentes a favor y en contra: no ocultar el desacuerdo al citar." : verdict === "insufficient" ? "Solo evidencia neutral: tratar como no verificado." : "Sin contradicciones declaradas." };
    });
    return {
      summary: `${reconciled.filter((r) => r.verdict === "conflicting").length} afirmaciones en conflicto de ${reconciled.length}.`,
      data: { claims: reconciled },
    };
  },
});

const contextSummarizer = defineTool({
  number: 67,
  inputSchema: z.object({
    existingSummary: longText().optional(),
    newContent: longText(),
    maxSentences: z.number().int().min(1).max(20).optional(),
  }).strict(),
  example: { existingSummary: "Se decidió publicar en vertical. El presupuesto es limitado.", newContent: "La publicación será los martes. Se acordó revisar métricas cada dos semanas. El presupuesto es limitado y no crecerá este trimestre.", maxSentences: 3 },
  handler: (input) => {
    const combined = [input.existingSummary, input.newContent].filter(Boolean).join(" ");
    const all = sentences(combined);
    const decisions = all.filter((s) => /(se (decidi|acord)|decisi[oó]n|queda|acuerdo|no se|nunca|siempre debe)/i.test(s));
    // Deduplicar oraciones casi idénticas conservando la primera aparición.
    const unique: string[] = [];
    for (const sentence of all) {
      if (!unique.some((u) => jaccard(tokens(u), tokens(sentence)) >= 0.8)) unique.push(sentence);
    }
    const maxSentences = input.maxSentences ?? 5;
    const summaryCore = extractiveSummary(unique.join(" "), Math.max(1, maxSentences - decisions.length));
    const kept = [...new Set([...decisions, ...summaryCore.split(/(?<=[.!?])\s+/)])].filter(Boolean).slice(0, maxSentences + decisions.length);
    return {
      summary: `Resumen actualizado: ${kept.length} oraciones (${decisions.length} decisiones preservadas).`,
      data: { updatedSummary: kept.join(" "), preservedDecisions: decisions, droppedNearDuplicates: all.length - unique.length },
    };
  },
});

const deduplication = defineTool({
  number: 68,
  inputSchema: z.object({
    items: z.array(z.object({ id: idStr(), text: longText() })).min(1).max(1_000),
    threshold: z.number().min(0).max(1).optional(),
  }).strict(),
  example: { items: [{ id: "1", text: "Publicar el martes por la mañana" }, { id: "2", text: "Publicar el martes por la mañana" }, { id: "3", text: "Revisar métricas el viernes" }], threshold: 0.7 },
  handler: (input) => {
    const threshold = input.threshold ?? 0.8;
    const clusters: { representative: string; members: string[]; similarities: Record<string, number> }[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < input.items.length; i += 1) {
      if (seen.has(i)) continue;
      const cluster = { representative: input.items[i].id, members: [input.items[i].id], similarities: {} as Record<string, number> };
      seen.add(i);
      for (let j = i + 1; j < input.items.length; j += 1) {
        if (seen.has(j)) continue;
        const similarity = jaccard(tokens(input.items[i].text), tokens(input.items[j].text));
        if (similarity >= threshold) {
          seen.add(j);
          cluster.members.push(input.items[j].id);
          cluster.similarities[input.items[j].id] = round(similarity, 3);
        }
      }
      clusters.push(cluster);
    }
    return {
      summary: `${input.items.length} elementos -> ${clusters.length} únicos (${input.items.length - clusters.length} duplicados agrupados).`,
      data: { uniqueIds: clusters.map((c) => c.representative), clusters: clusters.filter((c) => c.members.length > 1), removedAsDuplicates: clusters.flatMap((c) => c.members.slice(1)) },
    };
  },
});

const entityMapper = defineTool({
  number: 69,
  inputSchema: z.object({
    entities: z.array(z.object({ id: idStr(), type: txt(100).optional(), name: txt(300).optional() })).min(1).max(1_000),
    relations: z.array(z.object({ from: idStr(), to: idStr(), type: txt(100).optional() })).max(5_000),
  }).strict(),
  example: { entities: [{ id: "doc1", type: "documento" }, { id: "tarea1", type: "tarea" }, { id: "suelto", type: "nota" }], relations: [{ from: "doc1", to: "tarea1", type: "evidencia_de" }] },
  handler: (input) => {
    const ids = new Set(input.entities.map((e) => e.id));
    const dangling = input.relations.filter((r) => !ids.has(r.from) || !ids.has(r.to));
    const degree = new Map<string, number>(input.entities.map((e) => [e.id, 0]));
    for (const r of input.relations) {
      if (ids.has(r.from)) degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
      if (ids.has(r.to)) degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
    }
    const hubs = [...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, connections]) => ({ id, connections }));
    const orphans = [...degree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const components = connectedComponents([...ids], input.relations.filter((r) => ids.has(r.from) && ids.has(r.to)));
    return {
      summary: `${input.entities.length} entidades, ${input.relations.length} relaciones, ${components.length} grupos conectados, ${orphans.length} huérfanas.`,
      data: { hubs, orphans, danglingRelations: dangling, connectedGroups: components, byType: Object.fromEntries([...input.entities.reduce((acc, e) => acc.set(e.type ?? "sin_tipo", (acc.get(e.type ?? "sin_tipo") ?? 0) + 1), new Map<string, number>())]) },
    };
  },
});

const freshnessChecker = defineTool({
  number: 70,
  inputSchema: z.object({
    items: z.array(z.object({ id: idStr(), updatedAt: txt(50), maxAgeDays: z.number().positive().max(36_500).optional(), topic: txt(200).optional() })).min(1).max(2_000),
    defaultMaxAgeDays: z.number().positive().max(36_500).optional(),
    now: txt(50).optional(),
  }).strict(),
  example: { items: [{ id: "precios", updatedAt: "2026-08-01T00:00:00Z", maxAgeDays: 30, topic: "proveedores" }, { id: "guia", updatedAt: "2026-10-15T00:00:00Z", maxAgeDays: 180 }], now: "2026-10-19T00:00:00Z" },
  handler: (input) => {
    const now = toDate(input.now);
    const items = input.items.map((item) => {
      const ageDays = daysBetween(toDate(item.updatedAt), now);
      const limit = item.maxAgeDays ?? input.defaultMaxAgeDays ?? 90;
      const freshness = Math.max(0, round(100 * (1 - ageDays / limit), 1));
      const status = ageDays > limit ? "stale" : ageDays > limit * 0.75 ? "aging" : "fresh";
      return { id: item.id, topic: item.topic ?? null, ageDays, limitDays: limit, freshnessScore: freshness, status, needsUpdate: status === "stale" };
    }).sort((a, b) => a.freshnessScore - b.freshnessScore);
    return {
      summary: `${items.filter((i) => i.needsUpdate).length} elementos requieren actualización.`,
      data: { items, needsUpdate: items.filter((i) => i.needsUpdate).map((i) => i.id) },
    };
  },
});

export const f07: LocalToolDefinition[] = [contextStore, indexBuilder, memoryRetriever, retentionController, provenanceTracker, evidenceReconciliation, contextSummarizer, deduplication, entityMapper, freshnessChecker];
