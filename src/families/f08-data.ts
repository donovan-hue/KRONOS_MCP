/** Familia 08 — Datos, archivos y transformación (herramientas 71-80). */
import { z } from "zod";
import {
  canonicalStringify, deepDiff, extractHeadings, extractTitle, getPath, htmlToText, inferSchema,
  inferValueType, objectsToDelimited, objectsToMarkdownTable, parseDateLoose, parseDelimited,
  parseMarkdownTable, rowsToObjects,
} from "../engines/data.js";
import { describe, round } from "../engines/stats.js";
import { DATE_RE, EMAIL_RE, NUMBER_RE, URL_RE, chunkText, extractPatterns, linesDiff, sentences, tokens } from "../engines/text.js";
import { defineTool, fail, idStr, longText, recArr, strArr, txt, unknownArr, type LocalToolDefinition } from "./types.js";

const extractor = defineTool({
  number: 71,
  inputSchema: z.object({
    text: longText().optional(),
    json: z.unknown().optional(),
    include: z.array(z.enum(["emails", "urls", "dates", "numbers", "currencies", "mentions", "hashtags"])).max(10).optional(),
    jsonPaths: strArr(100, 200).optional(),
    customPattern: z.string().min(1).max(500).optional(),
  }).strict(),
  example: { text: "Escribe a hola@ejemplo.invalid antes del 2026-11-01. Total: 149.99 euros. Mira https://ejemplo.invalid/guia #kronos", include: ["emails", "dates", "urls", "hashtags"] },
  handler: (input) => {
    if (!input.text && input.json === undefined) fail("INVALID_INPUT");
    const included = input.include ?? ["emails", "urls", "dates", "numbers"];
    const text = input.text ?? "";
    const extracted: Record<string, unknown> = {};
    if (included.includes("emails")) extracted.emails = extractPatterns(text, EMAIL_RE);
    if (included.includes("urls")) extracted.urls = extractPatterns(text, URL_RE);
    if (included.includes("dates")) extracted.dates = extractPatterns(text, DATE_RE);
    if (included.includes("numbers")) extracted.numbers = extractPatterns(text, NUMBER_RE).map((n) => Number(n.replace(",", "."))).filter(Number.isFinite);
    if (included.includes("currencies")) extracted.currencies = extractPatterns(text, /\d+(?:[.,]\d+)?\s?(?:€|\bEUR\b|\bUSD\b|\$|\bMXN\b|euros|d[oó]lares)/gi);
    if (included.includes("mentions")) extracted.mentions = extractPatterns(text, /(^|[^\w@])@([\p{L}\p{N}_.-]+)/gu).map((m) => m.trim());
    if (included.includes("hashtags")) extracted.hashtags = extractPatterns(text, /#[\p{L}\p{N}_]+/gu);
    if (input.customPattern) {
      let regex: RegExp;
      try { regex = new RegExp(input.customPattern, "gu"); } catch { fail("INVALID_INPUT"); }
      extracted.custom = extractPatterns(text, regex!);
    }
    if (input.json !== undefined && input.jsonPaths?.length) {
      extracted.fields = Object.fromEntries(input.jsonPaths.map((path) => [path, getPath(input.json, path) ?? null]));
    }
    const total = Object.values(extracted).reduce((acc: number, v: any) => acc + (Array.isArray(v) ? v.length : 1), 0);
    return { summary: `${total} elementos estructurados extraídos.`, data: { extracted } };
  },
});

const normalizer = defineTool({
  number: 72,
  inputSchema: z.object({
    records: recArr(),
    lowercaseFields: strArr(100, 100).optional(),
    dateFields: strArr(100, 100).optional(),
    numberFields: strArr(100, 100).optional(),
    booleanFields: strArr(100, 100).optional(),
    trimStrings: z.boolean().optional(),
  }).strict(),
  example: { records: [{ nombre: "  Ana  ", fecha: "19/10/2026", importe: "1.234,50", activo: "sí", email: "ANA@EJEMPLO.INVALID" }], dateFields: ["fecha"], booleanFields: ["activo"], lowercaseFields: ["email"], trimStrings: true },
  handler: (input) => {
    let changes = 0;
    const unparsed: string[] = [];
    const normalized = input.records.map((record, rowIdx) => {
      const out: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(record)) {
        let value: unknown = raw;
        if (typeof value === "string" && input.trimStrings !== false) value = value.trim();
        if (input.lowercaseFields?.includes(key) && typeof value === "string") value = value.toLowerCase();
        if (input.dateFields?.includes(key) && typeof value === "string") {
          const parsed = parseDateLoose(value);
          if (parsed) value = parsed.toISOString().slice(0, 10);
          else unparsed.push(`fila ${rowIdx} campo ${key}: fecha no reconocida`);
        }
        if (input.numberFields?.includes(key) && typeof value === "string") {
          const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
          const num = Number(cleaned);
          if (Number.isFinite(num)) value = num;
        }
        if (typeof raw === "string" && /^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw.trim())) {
          value = Number(raw.replace(/\./g, "").replace(",", "."));
        }
        if (input.booleanFields?.includes(key) && typeof value === "string") {
          const low = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          if (["si", "true", "yes", "1"].includes(low)) value = true;
          else if (["no", "false", "0"].includes(low)) value = false;
          else unparsed.push(`fila ${rowIdx} campo ${key}: booleano no reconocido`);
        }
        if (canonicalStringify(value) !== canonicalStringify(raw)) changes += 1;
        out[key] = value;
      }
      return out;
    });
    return { summary: `${normalized.length} registros normalizados (${changes} campos modificados).`, data: { records: normalized, changedFields: changes, unparsed } };
  },
});

const formatConverter = defineTool({
  number: 73,
  limitation: "Convierte entre JSON (lista de objetos), CSV, TSV y tablas Markdown. No maneja formatos binarios.",
  inputSchema: z.object({
    content: z.unknown(),
    from: z.enum(["json", "csv", "tsv", "markdown"]),
    to: z.enum(["json", "csv", "tsv", "markdown"]),
  }).strict(),
  example: { content: "nombre,edad\nAna,31\nLuis,25", from: "csv", to: "json" },
  handler: (input) => {
    let objects: Record<string, unknown>[];
    if (input.from === "json") {
      if (!Array.isArray(input.content)) fail("INVALID_INPUT");
      objects = (input.content as unknown[]).map((row) => (typeof row === "object" && row !== null ? (row as Record<string, unknown>) : { value: row }));
    } else {
      if (typeof input.content !== "string") fail("INVALID_INPUT");
      const content = input.content as string;
      if (input.from === "markdown") objects = parseMarkdownTable(content);
      else objects = rowsToObjects(parseDelimited(content, input.from === "csv" ? "," : "\t"));
    }
    let output: unknown;
    if (input.to === "json") output = objects;
    else if (input.to === "csv") output = objectsToDelimited(objects, ",");
    else if (input.to === "tsv") output = objectsToDelimited(objects, "\t");
    else output = objectsToMarkdownTable(objects);
    return {
      summary: `Convertido ${input.from} -> ${input.to}: ${objects.length} filas.`,
      data: { output, rowCount: objects.length, columns: objects.length > 0 ? Object.keys(objects[0]) : [] },
      warnings: objects.length === 0 ? ["La conversión produjo 0 filas: revisa el formato de origen."] : [],
    };
  },
});

const documentReader = defineTool({
  number: 74,
  limitation: "Lee el contenido que recibe como texto; no accede al sistema de archivos ni a documentos binarios (PDF/DOCX).",
  inputSchema: z.object({
    content: longText(),
    format: z.enum(["text", "markdown", "csv", "html"]),
  }).strict(),
  example: { content: "# Informe\n\nResumen inicial del proyecto con dos frases. Segunda frase.\n\n## Datos\n\n| a | b |\n|---|---|\n| 1 | 2 |", format: "markdown" },
  handler: (input) => {
    const raw = input.content;
    const plain = input.format === "html" ? htmlToText(raw) : raw;
    const wordCount = tokens(plain, { dropStopwords: false }).length;
    const result: Record<string, unknown> = {
      format: input.format,
      characters: raw.length, words: wordCount,
      readingMinutes: round(wordCount / 200, 2),
      sentenceCount: sentences(plain).length,
      estimatedPages: round(wordCount / 500, 2),
    };
    if (input.format === "markdown") {
      result.title = raw.match(/^#\s+(.+)$/m)?.[1] ?? null;
      result.headings = [...raw.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() }));
      const tableRows = parseMarkdownTable(raw);
      result.tables = { rowsDetected: tableRows.length };
      result.links = extractPatterns(raw, /\[[^\]]*\]\(([^)]+)\)/g).length;
    } else if (input.format === "html") {
      result.title = extractTitle(raw);
      result.headings = extractHeadings(raw);
    } else if (input.format === "csv") {
      const rows = parseDelimited(raw, ",");
      result.rows = rows.length;
      result.columns = rows[0] ?? [];
      result.title = null;
    } else {
      result.title = plain.split("\n")[0]?.slice(0, 200) ?? null;
    }
    result.preview = plain.replace(/\s+/g, " ").trim().slice(0, 500);
    return { summary: `Documento leído: ${wordCount} palabras (~${result.readingMinutes} min).`, data: result };
  },
});

const diffAnalyzer = defineTool({
  number: 75,
  inputSchema: z.object({
    before: z.unknown(),
    after: z.unknown(),
    mode: z.enum(["text", "json"]),
  }).strict(),
  example: { before: "línea uno\nlínea dos\nlínea tres", after: "línea uno\nlínea DOS\nlínea tres\nlínea cuatro", mode: "text" },
  handler: (input) => {
    if (input.mode === "json") {
      const diffs = deepDiff(input.before, input.after);
      return { summary: diffs.length === 0 ? "Sin diferencias." : `${diffs.length} diferencias estructurales.`, data: { changed: diffs.length > 0, differences: diffs.slice(0, 100), added: diffs.filter((d) => d.kind === "added").length, removed: diffs.filter((d) => d.kind === "removed").length, changedCount: diffs.filter((d) => d.kind === "changed" || d.kind === "type_changed").length } };
    }
    if (typeof input.before !== "string" || typeof input.after !== "string") fail("INVALID_INPUT");
    const { ops, approximate } = linesDiff(input.before as string, input.after as string);
    const added = ops.filter((o) => o.type === "add");
    const removed = ops.filter((o) => o.type === "remove");
    return {
      summary: `${added.length} líneas añadidas y ${removed.length} eliminadas.`,
      data: { changed: added.length + removed.length > 0, addedLines: added.slice(0, 100).map((o) => o.line), removedLines: removed.slice(0, 100).map((o) => o.line), addedCount: added.length, removedCount: removed.length, unchangedCount: ops.filter((o) => o.type === "equal").length, approximate },
    };
  },
});

const schemaInference = defineTool({
  number: 76,
  inputSchema: z.object({ samples: unknownArr() }).strict(),
  example: { samples: [{ id: 1, nombre: "Ana", alta: "2026-01-05" }, { id: 2, nombre: "Luis", extra: true }] },
  handler: (input) => {
    const schema = inferSchema(input.samples);
    return {
      summary: `Esquema inferido con ${schema.fields.length} campos de ${schema.sampleCount} muestras.`,
      data: { ...schema, requiredFields: schema.fields.filter((f) => f.missingPct === 0).map((f) => f.field), optionalFields: schema.fields.filter((f) => f.missingPct > 0).map((f) => f.field), ambiguousFields: schema.fields.filter((f) => f.types.length > 1).map((f) => f.field) },
    };
  },
});

const dataQuality = defineTool({
  number: 77,
  inputSchema: z.object({
    records: recArr(),
    rules: z.array(z.object({
      field: idStr(), type: z.enum(["string", "number", "integer", "boolean", "date"]).optional(),
      required: z.boolean().optional(), min: z.number().finite().optional(), max: z.number().finite().optional(),
      pattern: z.string().min(1).max(500).optional(), enumValues: z.array(z.unknown()).max(200).optional(),
      unique: z.boolean().optional(),
    })).min(1).max(200),
  }).strict(),
  example: { records: [{ id: 1, edad: 31 }, { id: 1, edad: -3 }, { edad: 40 }], rules: [{ field: "id", required: true, unique: true, type: "integer" }, { field: "edad", type: "number", min: 0, max: 120 }] },
  handler: (input) => {
    const violations: Record<string, unknown>[] = [];
    const seen = new Map<string, Set<string>>();
    input.records.forEach((record, row) => {
      for (const rule of input.rules) {
        const value = record[rule.field];
        const add = (problem: string) => violations.push({ row, field: rule.field, problem, value: typeof value === "string" ? value.slice(0, 100) : value ?? null });
        if (value === undefined || value === null) { if (rule.required) add("Falta el campo obligatorio"); continue; }
        if (rule.type) {
          const inferred = inferValueType(value);
          const ok = rule.type === inferred || (rule.type === "number" && inferred === "integer") || (rule.type === "string" && inferred === "date");
          if (!ok) add(`Tipo esperado ${rule.type}, encontrado ${inferred}`);
        }
        if (typeof value === "number") {
          if (rule.min !== undefined && value < rule.min) add(`Por debajo del mínimo ${rule.min}`);
          if (rule.max !== undefined && value > rule.max) add(`Por encima del máximo ${rule.max}`);
        }
        if (rule.pattern) { try { if (!new RegExp(rule.pattern).test(String(value))) add("No cumple el patrón"); } catch { add("Patrón inválido en la regla"); } }
        if (rule.enumValues && !rule.enumValues.some((e) => canonicalStringify(e) === canonicalStringify(value))) add("Valor fuera del conjunto permitido");
        if (rule.unique) {
          const set = seen.get(rule.field) ?? new Set<string>();
          const key = canonicalStringify(value);
          if (set.has(key)) add("Valor duplicado (debe ser único)");
          set.add(key);
          seen.set(rule.field, set);
        }
      }
    });
    const quality = input.records.length === 0 ? 0 : round(100 * (1 - (new Set(violations.map((v) => v.row)).size / input.records.length)), 1);
    return {
      summary: `Calidad estimada ${quality}%: ${violations.length} violaciones en ${input.records.length} registros.`,
      data: { qualityScorePct: quality, recordCount: input.records.length, violationCount: violations.length, violations: violations.slice(0, 200), perField: Object.fromEntries(input.rules.map((r) => [r.field, violations.filter((v) => v.field === r.field).length])) },
    };
  },
});

const batchCoordinator = defineTool({
  number: 78,
  inputSchema: z.object({
    items: recArr(),
    batchSize: z.number().int().min(1).max(10_000),
    operation: z.enum(["count_by_field", "dedupe_by_field", "sum_by_field", "filter_equals"]),
    field: idStr(),
    equalsValue: z.unknown().optional(),
    resumeFromBatch: z.number().int().min(0).max(100_000).optional(),
  }).strict(),
  example: { items: [{ t: "a" }, { t: "b" }, { t: "a" }, { t: "a" }], batchSize: 2, operation: "count_by_field", field: "t" },
  handler: (input) => {
    const start = input.resumeFromBatch ?? 0;
    const batches: Record<string, unknown>[] = [];
    const globalCounts = new Map<string, number>();
    const seen = new Set<string>();
    const keptIndices: number[] = [];
    let processed = 0;
    for (let offset = start * input.batchSize, batchIndex = start; offset < input.items.length; offset += input.batchSize, batchIndex += 1) {
      const slice = input.items.slice(offset, offset + input.batchSize);
      const counts = new Map<string, number>();
      slice.forEach((item, idx) => {
        const value = item[input.field];
        const key = canonicalStringify(value);
        if (input.operation === "count_by_field" || input.operation === "sum_by_field") {
          const add = input.operation === "count_by_field" ? 1 : (typeof value === "number" ? value : 0);
          counts.set(key, (counts.get(key) ?? 0) + add);
          globalCounts.set(key, (globalCounts.get(key) ?? 0) + add);
        } else if (input.operation === "dedupe_by_field") {
          if (!seen.has(key)) { seen.add(key); keptIndices.push(offset + idx); }
        } else if (input.operation === "filter_equals") {
          if (canonicalStringify(value) === canonicalStringify(input.equalsValue)) keptIndices.push(offset + idx);
        }
      });
      processed += slice.length;
      batches.push({ batchIndex, from: offset, to: offset + slice.length, checkpoint: `tras lote ${batchIndex} reanudar con resumeFromBatch=${batchIndex + 1}`, partialCounts: input.operation === "count_by_field" || input.operation === "sum_by_field" ? Object.fromEntries(counts) : undefined });
    }
    return {
      summary: `Procesados ${processed} elementos en ${batches.length} lotes (${input.operation}).`,
      data: { batches, totalItems: input.items.length, processedItems: processed, result: input.operation === "count_by_field" || input.operation === "sum_by_field" ? Object.fromEntries(globalCounts) : { keptIndices: keptIndices.slice(0, 1_000), keptCount: keptIndices.length } },
    };
  },
});

const chunkingOptimizer = defineTool({
  number: 79,
  inputSchema: z.object({
    text: longText(),
    targetChunkChars: z.number().int().min(50).max(50_000).optional(),
    overlapChars: z.number().int().min(0).max(10_000).optional(),
  }).strict(),
  example: { text: "Primer párrafo sobre subtítulos y sincronización detallada.\n\nSegundo párrafo sobre costes de renderizado y límites mensuales del equipo.", targetChunkChars: 80, overlapChars: 10 },
  handler: (input) => {
    const target = input.targetChunkChars ?? 1_000;
    const overlap = Math.min(input.overlapChars ?? 100, Math.floor(target / 2));
    const chunks = chunkText(input.text, target, overlap);
    const stats = describe(chunks.map((c) => c.length));
    return {
      summary: `Documento dividido en ${chunks.length} fragmentos (~${Math.round(stats.mean)} caracteres).`,
      data: { chunks: chunks.map((content, index) => ({ index, characters: content.length, words: tokens(content, { dropStopwords: false }).length, content })), lengthStats: stats, targetChunkChars: target, overlapChars: overlap },
    };
  },
});

const mergeReconciliation = defineTool({
  number: 80,
  inputSchema: z.object({
    datasets: z.array(z.object({ name: idStr(), records: recArr() })).min(2).max(10),
    keyField: idStr(),
  }).strict(),
  example: { datasets: [{ name: "crm", records: [{ id: "1", nombre: "Ana", ciudad: "MX" }] }, { name: "web", records: [{ id: "1", nombre: "Ana", ciudad: "Madrid" }, { id: "2", nombre: "Luis" }] }], keyField: "id" },
  handler: (input) => {
    const merged = new Map<string, Record<string, unknown>>();
    const provenance = new Map<string, string[]>();
    const conflicts: Record<string, unknown>[] = [];
    for (const dataset of input.datasets) {
      for (const record of dataset.records) {
        const key = canonicalStringify(record[input.keyField]);
        const existing = merged.get(key);
        provenance.set(key, [...new Set([...(provenance.get(key) ?? []), dataset.name])]);
        if (!existing) { merged.set(key, { ...record }); continue; }
        for (const [field, value] of Object.entries(record)) {
          if (field === input.keyField) continue;
          if (!(field in existing) || existing[field] === null || existing[field] === undefined) existing[field] = value;
          else if (canonicalStringify(existing[field]) !== canonicalStringify(value)) {
            conflicts.push({ key: record[input.keyField], field, keptFromFirstDataset: existing[field], conflictingValue: value, conflictDataset: dataset.name });
          }
        }
      }
    }
    return {
      summary: `Fusionados ${input.datasets.length} conjuntos en ${merged.size} registros; ${conflicts.length} conflictos señalados.`,
      data: { mergedRecords: [...merged.values()].slice(0, 500), recordCount: merged.size, conflicts: conflicts.slice(0, 200), provenance: Object.fromEntries([...provenance.entries()].map(([k, v]) => [k, v])), policy: "Gana el primer conjunto en orden de entrada; los conflictos se reportan, no se sobrescriben en silencio." },
    };
  },
});

export const f08: LocalToolDefinition[] = [extractor, normalizer, formatConverter, documentReader, diffAnalyzer, schemaInference, dataQuality, batchCoordinator, chunkingOptimizer, mergeReconciliation];
