/** Tiempo: cron de 5 campos (UTC), fechas y marcas SRT. */
import { KronosApiError } from "../services/kronos-api.js";

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new KronosApiError("INVALID_INPUT");
    let start = min;
    let end = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      start = Number(a);
      end = b !== undefined ? Number(b) : Number(a);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new KronosApiError("INVALID_INPUT");
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return values;
}

export interface CronSchedule {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

export function parseCron(expression: string): CronSchedule {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new KronosApiError("INVALID_INPUT");
  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    daysOfMonth: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    daysOfWeek: parseField(fields[4], 0, 6),
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

function matchesCron(schedule: CronSchedule, date: Date): boolean {
  if (!schedule.minutes.has(date.getUTCMinutes())) return false;
  if (!schedule.hours.has(date.getUTCHours())) return false;
  if (!schedule.months.has(date.getUTCMonth() + 1)) return false;
  const dom = schedule.daysOfMonth.has(date.getUTCDate());
  const dow = schedule.daysOfWeek.has(date.getUTCDay());
  // Semántica cron clásica: si ambos día-mes y día-semana están restringidos, basta uno.
  if (schedule.domRestricted && schedule.dowRestricted) return dom || dow;
  return dom && dow;
}

/** Próximas ejecuciones en UTC. Búsqueda minuto a minuto con tope de ~2 años. */
export function nextCronRuns(expression: string, from: Date, count: number): Date[] {
  const schedule = parseCron(expression);
  const runs: Date[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), 0, 0));
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const maxSteps = 2 * 366 * 24 * 60;
  let steps = 0;
  while (runs.length < count && steps < maxSteps) {
    if (matchesCron(schedule, cursor)) runs.push(new Date(cursor.getTime()));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    steps += 1;
  }
  return runs;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function toDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new KronosApiError("INVALID_INPUT");
  return d;
}

export function formatSrtTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

export interface SubtitleCue { start: number; end: number; text: string }

export function buildSrt(cues: readonly SubtitleCue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}`)
    .join("\n\n");
}
