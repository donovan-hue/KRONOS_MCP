/**
 * Motor de texto local y determinista: tokenización, similitud, resumen
 * extractivo, legibilidad y diff de líneas. Sin red, sin modelos externos.
 */
import { KronosApiError } from "../services/kronos-api.js";

const STOPWORDS = new Set(
  (
    "de la el en y a los del se las por un para con no una su al es lo como más pero sus le ya o este sí porque esta entre " +
    "cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante " +
    "ellos esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar " +
    "estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya " +
    "the of and a to in is you that it he was for on are as with his they i at be this have from or one had by word but not " +
    "what all were we when your can said there use an each which she do how their if will up other about out many then them " +
    "these so some her would make like him into time has look two more write go see number no way could people my than first"
  ).split(/\s+/),
);

export function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function tokens(text: string, { dropStopwords = true } = {}): string[] {
  const raw = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return dropStopwords ? raw.filter((t) => t.length > 1 && !STOPWORDS.has(t)) : raw;
}

export function termFreq(list: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of list) map.set(t, (map.get(t) ?? 0) + 1);
  return map;
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function cosineText(a: string, b: string): number {
  const fa = termFreq(tokens(a));
  const fb = termFreq(tokens(b));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of fa.values()) na += v * v;
  for (const v of fb.values()) nb += v * v;
  for (const [t, v] of fa) dot += v * (fb.get(t) ?? 0);
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Fracción de términos de `query` presentes en `text` (0-1) con bonificación por repetición. */
export function queryOverlap(query: string, text: string): number {
  const q = [...new Set(tokens(query))];
  if (q.length === 0) return 0;
  const freq = termFreq(tokens(text));
  let hits = 0;
  for (const t of q) if (freq.has(t)) hits += 1;
  return hits / q.length;
}

export function sentences(text: string): string[] {
  return (normalizeWs(text).match(/[^.!?…]+[.!?…]+(["')\]]*)|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Resumen extractivo: elige las oraciones con términos más frecuentes del propio texto. */
export function extractiveSummary(text: string, maxSentences = 3): string {
  const list = sentences(text);
  if (list.length <= maxSentences) return list.join(" ");
  const freq = termFreq(tokens(text));
  const scored = list.map((sentence, index) => {
    const words = tokens(sentence);
    const score =
      words.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.max(1, Math.sqrt(words.length));
    return { sentence, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence)
    .join(" ");
}

function syllables(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouáéíóúü]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export interface Readability {
  words: number;
  sentences: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  /** Índice de Fernández Huerta (adaptación española de Flesch): mayor = más fácil. */
  fernandezHuerta: number;
  longWordsPct: number;
}

export function readability(text: string): Readability {
  const words = tokens(text, { dropStopwords: false });
  const sentenceCount = Math.max(1, sentences(text).length);
  const totalSyllables = words.reduce((acc, w) => acc + syllables(w), 0);
  const avgWords = words.length / sentenceCount;
  const avgSyllables = words.length === 0 ? 0 : totalSyllables / words.length;
  const fh = 206.84 - 60 * avgSyllables - 1.02 * avgWords;
  const longWords = words.filter((w) => w.length >= 9).length;
  return {
    words: words.length,
    sentences: sentenceCount,
    avgWordsPerSentence: Math.round(avgWords * 100) / 100,
    avgSyllablesPerWord: Math.round(avgSyllables * 100) / 100,
    fernandezHuerta: Math.round(Math.max(0, Math.min(100, fh)) * 10) / 10,
    longWordsPct: words.length === 0 ? 0 : Math.round((longWords / words.length) * 1000) / 10,
  };
}

export type DiffOp = { type: "equal" | "add" | "remove"; line: string };

const MAX_DIFF_PRODUCT = 1_200_000;

export function linesDiff(before: string, after: string): { ops: DiffOp[]; approximate: boolean } {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > MAX_DIFF_PRODUCT) {
    // Diff por conjuntos: correcto en contenido, sin orden garantizado.
    const remaining = new Map<string, number>();
    for (const line of a) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const ops: DiffOp[] = [];
    for (const line of b) {
      const count = remaining.get(line) ?? 0;
      if (count > 0) {
        remaining.set(line, count - 1);
        ops.push({ type: "equal", line });
      } else {
        ops.push({ type: "add", line });
      }
    }
    for (const [line, count] of remaining) {
      for (let i = 0; i < count; i += 1) ops.push({ type: "remove", line });
    }
    return { ops, approximate: true };
  }
  if (a.length > 5000 || b.length > 5000) throw new KronosApiError("LIMIT_EXCEEDED");
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", line: a[i] });
      i += 1;
    } else {
      ops.push({ type: "add", line: b[j] });
      j += 1;
    }
  }
  while (i < a.length) { ops.push({ type: "remove", line: a[i] }); i += 1; }
  while (j < b.length) { ops.push({ type: "add", line: b[j] }); j += 1; }
  return { ops, approximate: false };
}

export function unifiedDiff(fileName: string, before: string, after: string): { patch: string; added: number; removed: number; approximate: boolean } {
  const { ops, approximate } = linesDiff(before, after);
  const added = ops.filter((o) => o.type === "add").length;
  const removed = ops.filter((o) => o.type === "remove").length;
  const body = ops
    .map((o) => `${o.type === "add" ? "+" : o.type === "remove" ? "-" : " "}${o.line}`)
    .join("\n");
  const patch = `--- a/${fileName}\n+++ b/${fileName}\n@@ -1,${before.split("\n").length} +1,${after.split("\n").length} @@\n${body}`;
  return { patch, added, removed, approximate };
}

/** Trocea por párrafos/oraciones respetando un tamaño objetivo y solape aproximado. */
export function chunkText(text: string, targetChars: number, overlapChars = 0): string[] {
  const units = text.split(/\n\s*\n/).flatMap((p) => (p.length > targetChars ? sentences(p) : [p.trim()])).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 1 > targetChars) {
      chunks.push(current);
      current = overlapChars > 0 ? current.slice(-overlapChars) + " " + unit : unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
    while (current.length > targetChars * 1.6) {
      chunks.push(current.slice(0, targetChars));
      current = current.slice(targetChars - overlapChars);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export interface WordAlignment {
  substitutions: { expected: string; actual: string }[];
  deletions: string[];
  insertions: string[];
  correct: number;
}

/** Alineación por distancia de edición a nivel de palabra (base del WER). */
export function alignWords(expected: string, actual: string): WordAlignment {
  const a = tokens(expected, { dropStopwords: false });
  const b = tokens(actual, { dropStopwords: false });
  if (a.length * Math.max(1, b.length) > 400_000) throw new KronosApiError("LIMIT_EXCEEDED");
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: WordAlignment = { substitutions: [], deletions: [], insertions: [], correct: 0 };
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.correct += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      result.substitutions.push({ expected: a[i - 1], actual: b[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      result.deletions.push(a[i - 1]);
      i -= 1;
    } else {
      result.insertions.push(b[j - 1]);
      j -= 1;
    }
  }
  result.substitutions.reverse();
  result.deletions.reverse();
  result.insertions.reverse();
  return result;
}

export function extractPatterns(text: string, regex: RegExp, cap = 200): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(regex)) {
    out.push(m[0]);
    if (out.length >= cap) break;
  }
  return [...new Set(out)];
}

export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
export const URL_RE = /https?:\/\/[^\s<>"')]+/g;
export const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g;
export const NUMBER_RE = /-?\d+(?:[.,]\d+)?/g;
