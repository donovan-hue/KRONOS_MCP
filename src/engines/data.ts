/** Datos: CSV/TSV/Markdown, inferencia de esquema, diff profundo y lectores HTML ligeros. */
import { round } from "./stats.js";

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) pushField();
    else if (ch === "\n") pushRow();
    else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
}

function escapeCell(value: string, delimiter: string): string {
  return value.includes(delimiter) || value.includes('"') || value.includes("\n")
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function objectsToDelimited(objects: readonly Record<string, unknown>[], delimiter: string): string {
  if (objects.length === 0) return "";
  const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const cell = (v: unknown) => escapeCell(v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v), delimiter);
  return [headers.join(delimiter), ...objects.map((o) => headers.map((h) => cell(o[h])).join(delimiter))].join("\n");
}

export function objectsToMarkdownTable(objects: readonly Record<string, unknown>[]): string {
  if (objects.length === 0) return "";
  const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...objects.map((o) => `| ${headers.map((h) => cell(o[h])).join(" | ")} |`),
  ].join("\n");
}

export function parseMarkdownTable(text: string): Record<string, string>[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) return [];
  const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = cells(lines[0]);
  return lines
    .slice(1)
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .map((line) => Object.fromEntries(header.map((h, i) => [h, cells(line)[i] ?? ""])));
}

export type ValueType = "null" | "boolean" | "integer" | "number" | "string" | "date" | "array" | "object";

export function inferValueType(value: unknown): ValueType {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  const s = String(value).trim();
  if (/^-?\d+$/.test(s)) return "integer";
  if (/^-?\d*[.,]\d+$/.test(s)) return "number";
  if (parseDateLoose(s)) return "date";
  return "string";
}

export function parseDateLoose(value: string): Date | null {
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export interface FieldSchema {
  field: string;
  types: string[];
  present: number;
  missingPct: number;
  examples: unknown[];
}

export function inferSchema(samples: readonly unknown[]): { fields: FieldSchema[]; sampleCount: number } {
  const records = samples.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && !Array.isArray(s));
  const fields = new Map<string, FieldSchema & { typeSet: Set<string> }>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const entry = fields.get(key) ?? { field: key, types: [], typeSet: new Set<string>(), present: 0, missingPct: 0, examples: [] };
      entry.present += 1;
      entry.typeSet.add(inferValueType(value));
      if (entry.examples.length < 3) entry.examples.push(value);
      fields.set(key, entry);
    }
  }
  const list = [...fields.values()].map(({ typeSet, ...rest }) => ({
    ...rest,
    types: [...typeSet],
    missingPct: records.length === 0 ? 0 : round((1 - rest.present / records.length) * 100, 1),
  }));
  list.sort((a, b) => a.field.localeCompare(b.field));
  return { fields: list, sampleCount: samples.length };
}

export interface DeepDiffEntry {
  path: string;
  kind: "added" | "removed" | "changed" | "type_changed";
  expected?: unknown;
  actual?: unknown;
}

export function deepDiff(expected: unknown, actual: unknown, basePath = "$", cap = 100): DeepDiffEntry[] {
  const out: DeepDiffEntry[] = [];
  const visit = (e: unknown, a: unknown, path: string): void => {
    if (out.length >= cap) return;
    if (typeof e !== typeof a || (Array.isArray(e) !== Array.isArray(a))) {
      out.push({ path, kind: "type_changed", expected: summarizeValue(e), actual: summarizeValue(a) });
      return;
    }
    if (typeof e === "object" && e !== null && a !== null && typeof a === "object") {
      const keys = new Set([...Object.keys(e), ...Object.keys(a as Record<string, unknown>)]);
      for (const key of keys) {
        const childPath = Array.isArray(e) ? `${path}[${key}]` : `${path}.${key}`;
        if (!(key in (e as Record<string, unknown>))) out.push({ path: childPath, kind: "added", actual: summarizeValue((a as Record<string, unknown>)[key]) });
        else if (!(key in (a as Record<string, unknown>))) out.push({ path: childPath, kind: "removed", expected: summarizeValue((e as Record<string, unknown>)[key]) });
        else visit((e as Record<string, unknown>)[key], (a as Record<string, unknown>)[key], childPath);
        if (out.length >= cap) return;
      }
      return;
    }
    if (!Object.is(e, a)) out.push({ path, kind: "changed", expected: e, actual: a });
  };
  visit(expected, actual, basePath);
  return out;
}

function summarizeValue(v: unknown): unknown {
  if (typeof v === "string") return v.slice(0, 200);
  if (typeof v === "object" && v !== null) return Array.isArray(v) ? `[array:${v.length}]` : "[object]";
  return v;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc === "object" && acc !== null) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`).join(",")}}`;
}

/* ---------- HTML ligero (regex): suficiente para estructura, no es un parser completo ---------- */

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]) : null;
}

export function extractHeadings(html: string): { level: number; text: string }[] {
  return [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: htmlToText(m[2]),
  }));
}

export function extractLinks(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\s[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1],
    text: htmlToText(m[2]),
  }));
}

export function extractImages(html: string): { src: string; alt: string | null }[] {
  return [...html.matchAll(/<img\s[^>]*>/gi)].map((m) => {
    const tag = m[0];
    const src = tag.match(/src\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    const altMatch = tag.match(/alt\s*=\s*"([^"]*)"/i);
    return { src, alt: altMatch ? altMatch[1] : null };
  });
}
